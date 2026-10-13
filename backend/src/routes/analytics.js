import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { sessionInRange, sessionOverallEndTime, flattenToSegmentRows, minutesBetween, summarizeChangeTypes } from "../utils/segments.js";
import { buildHighlightedWorkbook } from "../utils/xlsxExport.js";

const router = express.Router();

router.use(requireAuth, requireOwner); // Analytics is owner-only

async function getFilteredRows(from, to) {
  const db = getDb();
  const all = await db.getAll("sessions");
  const completed = all.filter((s) => s.status === "completed" && sessionInRange(s, from, to));
  // Sort sessions (not rows) first so multi-segment groups stay contiguous -
  // see the comment in history.js for why this ordering matters.
  completed.sort((a, b) => new Date(sessionOverallEndTime(b)) - new Date(sessionOverallEndTime(a)));
  return { rows: flattenToSegmentRows(completed), sessions: completed };
}

// GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns income grouped by GAME TYPE (since that's the real billing unit
// once a customer can move between stations of the same type mid-visit),
// with each game type also broken down by the individual stations used
// within it - the income for a billing group's amount is prorated across
// its underlying stations by each station's share of that group's total
// duration, since the group itself only has one combined billed amount.
router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const { rows, sessions } = await getFilteredRows(from, to);
  const db = getDb();
  const [stations, gameTypes] = await Promise.all([db.getAll("stations"), db.getAll("gameTypes")]);

  const totalIncome = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const totalSessions = sessions.length;
  const activeStations = new Set(stations.filter((s) => s.status === "busy").map((s) => s.id)).size;
  const pendingPaymentsCount = sessions.filter((s) => s.paymentStatus === "pending").length;
  const pendingPaymentsAmount = sessions
    .filter((s) => s.paymentStatus === "pending")
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  // Initialize one bucket per known game type so types with zero activity
  // in this range still show up (useful for owners checking "did Pool get
  // used at all today").
  const byGameType = {};
  gameTypes.forEach((gt) => {
    byGameType[gt.name] = { gameType: gt.name, income: 0, sessions: 0, durationMins: 0, stations: {} };
  });

  for (const session of sessions) {
    const groups = session.billingGroups || [];
    const lastGroupIdx = groups.length - 1;

    groups.forEach((group, groupIdx) => {
      const bucket =
        byGameType[group.gameType] ||
        (byGameType[group.gameType] = {
          gameType: group.gameType,
          income: 0,
          sessions: 0,
          durationMins: 0,
          stations: {},
        });

      // Discount AND round-down are both attributed to the LAST group of
      // the session, matching flattenToSegmentRows, so this breakdown's
      // total always reconciles exactly with session.total.
      const discountHere = groupIdx === lastGroupIdx ? Number(session.discount || 0) : 0;
      const roundDownHere = groupIdx === lastGroupIdx ? Number(session.roundDownAmount || 0) : 0;
      const groupTotal = Math.max(0, group.amount - discountHere - roundDownHere);

      bucket.income += groupTotal;
      bucket.sessions += 1;
      bucket.durationMins += group.durationMins;

      // Prorate this group's amount across the stations actually used
      // within it, by each station's share of the group's total duration.
      const segs = group.segments || [];
      segs.forEach((seg) => {
        const segMins = minutesBetween(seg.startTime, seg.endTime);
        const share = group.durationMins > 0 ? segMins / group.durationMins : 0;
        const stationShareAmount = groupTotal * share;

        if (!bucket.stations[seg.stationId]) {
          bucket.stations[seg.stationId] = {
            stationId: seg.stationId,
            stationName: seg.stationName,
            income: 0,
            durationMins: 0,
          };
        }
        bucket.stations[seg.stationId].income += stationShareAmount;
        bucket.stations[seg.stationId].durationMins += segMins;
      });
    });
  }

  const gameTypeBreakdown = Object.values(byGameType).map((bucket) => ({
    ...bucket,
    stations: Object.values(bucket.stations).sort((a, b) => b.income - a.income),
  }));

  // Payment method breakdown - for reconciliation when the owner collects
  // cash or checks the UPI account. This is per-SESSION (payment method is
  // chosen once at checkout for the whole visit), not per billing group.
  const paymentMethodBreakdown = { cash: { amount: 0, count: 0 }, upi: { amount: 0, count: 0 }, pending: { amount: 0, count: 0 } };
  sessions.forEach((s) => {
    const method = s.paymentStatus === "pending" ? "pending" : s.paymentMethod || "cash";
    if (!paymentMethodBreakdown[method]) {
      paymentMethodBreakdown[method] = { amount: 0, count: 0 };
    }
    paymentMethodBreakdown[method].amount += Number(s.total || 0);
    paymentMethodBreakdown[method].count += 1;
  });

  res.json({
    totalIncome,
    totalSessions,
    activeStations,
    pendingPaymentsCount,
    pendingPaymentsAmount,
    gameTypeBreakdown,
    paymentMethodBreakdown,
  });
});

// GET /api/analytics/payment-method/:method?from=&to= - every completed
// session paid via a given method (cash/upi/pending), for reconciliation -
// e.g. before the owner physically collects cash, or checks the UPI
// account against what the app expects to have received.
router.get("/payment-method/:method", async (req, res) => {
  const { from, to } = req.query;
  const { sessions } = await getFilteredRows(from, to);
  const method = req.params.method;

  const filtered = sessions
    .filter((s) => (s.paymentStatus === "pending" ? "pending" : s.paymentMethod || "cash") === method)
    .map((s) => ({
      sessionId: s.id,
      customerName: s.customerName || "Walk-in",
      phone: s.phone,
      endTime: sessionOverallEndTime(s),
      total: s.total,
      employeeName: s.employeeName,
      isMultiSegment: (s.billingGroups || []).length > 1,
      isException: s.isException,
    }))
    .sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

  res.json(filtered);
});

// GET /api/analytics/game-type/:gameTypeName?from=&to= - per-visit breakdown
// for one game type (e.g. every PS5 visit in the range, regardless of
// which individual PS5 screen was used)
router.get("/game-type/:gameTypeName", async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await getFilteredRows(from, to);
  const filtered = rows
    .filter((r) => r.gameType === req.params.gameTypeName)
    .map((r) => ({
      sessionId: r.sessionId,
      customerName: r.customerName || "Walk-in",
      stationName: r.stationName,
      startTime: r.startTime,
      endTime: r.endTime,
      durationMins: r.durationMins,
      amount: r.total,
      isException: r.isException,
      isMultiSegment: r.isMultiSegment,
      paymentStatus: r.paymentStatus,
    }))
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  res.json(filtered);
});

// GET /api/analytics/timeline?date=YYYY-MM-DD - per-station busy/free
// intervals across the configured business-hours window (default 8 AM to
// 2 AM the next day), for the Gantt-style timeline chart. Includes BOTH
// completed and currently-running sessions that overlap the window, so
// "is this station busy right now" shows correctly even mid-shift.
router.get("/timeline", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "A date (YYYY-MM-DD) is required" });

  const db = getDb();
  const [stations, allSessions, settingsDoc] = await Promise.all([
    db.getAll("stations"),
    db.getAll("sessions"),
    db.getById("settings", "global"),
  ]);

  const dayStartHour = settingsDoc?.dayStartHour ?? 8;
  const dayEndHour = settingsDoc?.dayEndHour ?? 26;

  // Build the window directly as IST-anchored ISO strings rather than
  // using setHours() (which would mutate in the SERVER's local timezone,
  // not IST - the same bug class as the from/to date filters elsewhere
  // in this file, see sessionInRange in utils/segments.js).
  const pad = (n) => String(n).padStart(2, "0");
  const windowStart = new Date(`${date}T${pad(dayStartHour % 24)}:00:00+05:30`);
  if (dayStartHour >= 24) windowStart.setUTCDate(windowStart.getUTCDate() + 1);

  const windowEnd = new Date(windowStart);
  windowEnd.setUTCHours(windowEnd.getUTCHours() + (dayEndHour - dayStartHour));

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  // Build one busy-interval list per station, from every segment of every
  // session (running or completed) that overlaps this window at all.
  const byStation = {};
  stations.forEach((s) => {
    byStation[s.id] = { stationId: s.id, stationName: s.name, gameType: s.gameType, intervals: [] };
  });

  allSessions.forEach((session) => {
    const segments = session.segments || [];
    if (segments.length === 0) return;

    segments.forEach((seg) => {
      const segStart = new Date(seg.startTime).getTime();
      const segEndIso = seg.endTime || new Date().toISOString(); // open segment = ongoing
      const segEnd = new Date(segEndIso).getTime();

      // Skip segments that don't overlap the requested window at all.
      if (segEnd <= windowStartMs || segStart >= windowEndMs) return;
      if (!byStation[seg.stationId]) return; // station since deleted

      const changeTypesSummary = summarizeChangeTypes(session);

      byStation[seg.stationId].intervals.push({
        sessionId: session.id,
        startMs: Math.max(segStart, windowStartMs),
        endMs: Math.min(segEnd, windowEndMs),
        customerName: session.customerName || "Walk-in",
        gameType: seg.gameType,
        players: seg.players,
        rate: seg.rate,
        isOngoing: !seg.endTime,
        isMultiSegment: segments.length > 1,
        changeTypesSummary,
        isException: Boolean(seg.isException) || Boolean(session.isException),
      });
    });
  });

  const result = Object.values(byStation).map((s) => ({
    ...s,
    intervals: s.intervals.sort((a, b) => a.startMs - b.startMs),
  }));

  res.json({
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    dayStartHour,
    dayEndHour,
    stations: result,
  });
});

// GET /api/analytics/export?from=&to= - downloadable as .xlsx with
// same-session rows highlighted in alternating colors.
router.get("/export", async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await getFilteredRows(from, to);

  const columns = [
    { header: "Customer Name", value: (r) => r.customerName || "Walk-in", width: 20 },
    { header: "Phone", value: (r) => r.phone || "", width: 14 },
    { header: "Station", value: (r) => r.stationName, width: 16 },
    { header: "Game Type", value: (r) => r.gameType, width: 14 },
    { header: "Start Time", value: (r) => new Date(r.startTime).toLocaleString(), width: 20 },
    { header: "End Time", value: (r) => new Date(r.endTime).toLocaleString(), width: 20 },
    { header: "Duration (mins)", value: (r) => r.durationMins, width: 14 },
    { header: "Raw Amount", value: (r) => r.rawCost.toFixed(2), width: 12 },
    { header: "Grace Discount", value: (r) => r.gracePeriodSavings.toFixed(2), width: 14 },
    { header: "Discount", value: (r) => r.discount.toFixed(2), width: 10 },
    { header: "Total", value: (r) => r.total.toFixed(2), width: 10 },
    { header: "Employee", value: (r) => r.employeeName, width: 16 },
    { header: "Multi-Station Visit", value: (r) => (r.isMultiSegment ? "Yes" : "No"), width: 16 },
    {
      header: "Change Type",
      value: (r) =>
        ({ station: "Screen changed", players: "Players changed", both: "Screen & players changed" }[
          r.changeTypesSummary
        ] || ""),
      width: 20,
    },
    { header: "Payment Status", value: (r) => r.paymentStatus || "", width: 14 },
    { header: "Payment Method", value: (r) => r.paymentMethod || "", width: 14 },
    { header: "Exception", value: (r) => (r.isException ? "Yes" : "No"), width: 10 },
    { header: "Exception Notes", value: (r) => r.exceptionNotes || "", width: 30 },
  ];

  const buffer = await buildHighlightedWorkbook({
    sheetName: "Analytics",
    title: "Gaming Parlour - Income Analytics",
    columns,
    rows,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="analytics_export.xlsx"`);
  res.send(buffer);
});

export default router;
