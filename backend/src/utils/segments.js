// Shared helpers for turning segment-based sessions into flat,
// per-segment rows for History and Analytics. A single session that
// moved between stations or changed player count produces one row per
// segment, each carrying its own station/rate/duration/cost - so a
// walk-in who used Screen 1 then Screen 2 shows as two distinct rows.

// This business always operates in India Standard Time (UTC+5:30),
// regardless of where the server happens to be physically hosted (e.g. a
// cloud server typically runs in UTC). Every "date" the app deals with in
// requests (from/to filters, the timeline chart's date) is a calendar day
// in IST, not in the server's local time - so date-boundary parsing must
// explicitly anchor to the IST offset rather than relying on `new
// Date("YYYY-MM-DDT00:00:00")`, which silently uses the SERVER's local
// timezone and would shift the boundary by however many hours the server
// differs from IST.
const IST_OFFSET = "+05:30";

/** Midnight at the start of the given YYYY-MM-DD, in IST. */
function istStartOfDay(dateStr) {
  return new Date(`${dateStr}T00:00:00${IST_OFFSET}`);
}

/** The last moment of the given YYYY-MM-DD, in IST. */
function istEndOfDay(dateStr) {
  return new Date(`${dateStr}T23:59:59.999${IST_OFFSET}`);
}

export function minutesBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
}

export function sessionOverallEndTime(session) {
  const segs = session.segments || [];
  if (!segs.length) return session.endTime || "";
  return segs[segs.length - 1].endTime || "";
}

export function sessionInRange(session, from, to) {
  const endTime = new Date(sessionOverallEndTime(session)).getTime();
  if (Number.isNaN(endTime)) return false;
  if (from) {
    if (endTime < istStartOfDay(from).getTime()) return false;
  }
  if (to) {
    if (endTime > istEndOfDay(to).getTime()) return false;
  }
  return true;
}

/**
 * Recomputes the per-segment cost breakdown for a (typically completed)
 * session purely from its stored segments. Deprecated for billing display
 * purposes (use session.billingGroups, persisted at end-time, since that
 * reflects the actual pricing-engine result including minimum-rate floors
 * and grace periods) - kept only as a structural fallback for sessions
 * created before the pricing engine existed and never re-billed.
 */
export function buildSegmentBreakdown(session) {
  const segments = session.segments || [];
  return segments.map((seg) => {
    const durationMins = minutesBetween(seg.startTime, seg.endTime);
    const cost = Math.round((durationMins / 60) * seg.rate);
    return {
      stationId: seg.stationId,
      stationName: seg.stationName,
      gameType: seg.gameType,
      players: seg.players,
      rate: seg.rate,
      startTime: seg.startTime,
      endTime: seg.endTime,
      durationMins,
      cost,
      isException: seg.isException || false,
      exceptionNotes: seg.exceptionNotes || "",
    };
  });
}

/**
 * Summarizes what kinds of mid-session changes occurred, from the
 * session's timeline. Returns "station", "players", "both" (mixed), or
 * "" if there were no changes at all (single-segment session) - used to
 * color-code multi-segment History rows by what actually changed, per
 * the requirement to distinguish screen changes from player changes from
 * sessions where both happened.
 */
export function summarizeChangeTypes(session) {
  const changeEntries = (session.timeline || []).filter((e) => e.type === "change");
  if (changeEntries.length === 0) return "";
  const types = new Set(changeEntries.map((e) => e.changeType));
  if (types.has("both") || (types.has("station") && types.has("players"))) return "both";
  if (types.has("station")) return "station";
  if (types.has("players")) return "players";
  return "";
}

/**
 * Flattens a list of completed sessions into one row per BILLING GROUP
 * (not per raw segment) - a billing group is everything the pricing
 * engine combined into one calculation (e.g. all PS5 time in a visit,
 * even across a player-count change), persisted on the session as
 * `billingGroups` at end-time. This is what makes History/Analytics show
 * real billed amounts: a customer who used PS5 then Pool Table shows as
 * two rows, each carrying its own group's actual charged amount - not a
 * naive duration/60*rate guess that ignores minimums and grace periods.
 *
 * Falls back to the legacy per-segment breakdown for any session that
 * predates billingGroups (so old data doesn't just disappear).
 *
 * Rows carry `groupIndex` (a 0-based counter, one per SESSION, in the
 * order sessions appear in the input) so the UI and exports can band
 * same-session rows with an alternating color - this is what lets an
 * owner visually see "these 2 rows are the same walk-in customer who
 * switched screens" at a glance, and cross-check it against camera footage.
 */
export function flattenToSegmentRows(sessions) {
  const rows = [];

  sessions.forEach((session, sessionGroupIndex) => {
    const overallEndTime = sessionOverallEndTime(session);
    const billingGroups = session.billingGroups;
    const usingBillingGroups = Array.isArray(billingGroups) && billingGroups.length > 0;
    const changeTypesSummary = summarizeChangeTypes(session);

    // Each "row unit" is either a billing group (preferred) or a legacy
    // raw segment (fallback) - both shapes are normalized to the same
    // row fields below.
    const rowUnits = usingBillingGroups
      ? billingGroups
      : buildSegmentBreakdown(session).map((seg) => ({
          gameType: seg.gameType,
          stationName: seg.stationName,
          durationMins: seg.durationMins,
          amount: seg.cost,
          isException: seg.isException,
          exceptionNotes: seg.exceptionNotes,
          startTime: seg.startTime,
          endTime: seg.endTime,
        }));

    const isMultiSegment = rowUnits.length > 1;

    rowUnits.forEach((unit, idx) => {
      const isLast = idx === rowUnits.length - 1;
      // Discount AND round-down are both attributed entirely to the last
      // row, since both are applied once at end-of-session against the
      // combined total - this keeps "sum of row totals" exactly equal to
      // session.total (what was actually charged), including when
      // round-down was used.
      const discountHere = isLast ? Number(session.discount || 0) : 0;
      const roundDownHere = isLast ? Number(session.roundDownAmount || 0) : 0;
      const rawAmount = unit.amount;
      const displayedTotal = isLast
        ? Math.max(0, rawAmount - discountHere - roundDownHere)
        : rawAmount;

      // For billing-group rows, derive a representative station name and
      // start/end span from the underlying segments (a group can span
      // multiple segments if e.g. player count changed within the same
      // gameType without switching stations).
      const groupSegments = unit.segments;
      const stationName = unit.stationName || groupSegments?.[0]?.stationName || unit.gameType;
      const startTime = unit.startTime || groupSegments?.[0]?.startTime;
      const endTime =
        unit.endTime || groupSegments?.[groupSegments.length - 1]?.endTime || overallEndTime;

      rows.push({
        sessionId: session.id,
        groupIndex: sessionGroupIndex,
        segmentIndex: idx,
        segmentCount: rowUnits.length,
        isMultiSegment,
        changeTypesSummary,
        overallEndTime,
        customerName: session.customerName || "",
        phone: session.phone || "",
        employeeName: session.employeeName,
        employeeId: session.employeeId,
        stationName,
        gameType: unit.gameType,
        startTime,
        endTime,
        durationMins: unit.durationMins,
        rawCost: rawAmount,
        discount: discountHere,
        roundDown: roundDownHere,
        total: displayedTotal,
        gracePeriodSavings: unit.gracePeriodSavings || 0,
        minimumRateExtraCharge: unit.minimumRateExtraCharge || 0,
        isException: Boolean(unit.isException) || (isLast && session.isException),
        exceptionNotes: unit.exceptionNotes || (isLast ? session.exceptionNotes : "") || "",
        paymentStatus: session.paymentStatus || "",
        paymentMethod: session.paymentMethod || "",
        paidAt: session.paidAt || "",
        paidBy: session.paidBy || "",
      });
    });
  });

  return rows;
}
