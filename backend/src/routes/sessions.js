import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { logAction } from "../utils/audit.js";
import { buildReceiptPdf } from "../utils/receiptPdf.js";
import { calculateBill, calculateSessionBill } from "../utils/pricingEngine.js";

const router = express.Router();

router.use(requireAuth);

function calculateRate(gameTypeDoc, players) {
  const rates = gameTypeDoc.rates || {};
  const rate = rates[String(players)];
  if (rate === undefined) {
    throw new Error(
      `No rate configured for ${gameTypeDoc.name} with ${players} player(s)`
    );
  }
  return Number(rate);
}
// so existing UI (Dashboard card, etc.) that reads session.stationName /
// session.rate / session.players / session.startTime keeps working as-is.
// Also exposes sessionStartTime = the TRUE start of the whole visit (the
// first segment's start time), distinct from startTime which reflects only
// the current/latest segment - needed so "correct the start time" edits the
// right thing rather than accidentally rewriting a mid-session segment.
function mirrorCurrentSegment(session) {
  const current = session.segments[session.segments.length - 1];
  const now = new Date();
  const cumulativeElapsedMins = session.segments.reduce((sum, seg) => {
    const segEnd = seg.endTime ? new Date(seg.endTime) : now;
    const segStart = new Date(seg.startTime);
    return sum + Math.max(0, Math.round((segEnd - segStart) / 60000));
  }, 0);

  return {
    ...session,
    sessionStartTime: session.segments[0].startTime,
    cumulativeElapsedMins,
    stationId: current.stationId,
    stationName: current.stationName,
    gameType: current.gameType,
    players: current.players,
    rate: current.rate,
    startTime: current.startTime,
  };
}

// GET /api/sessions/active - all currently running sessions (for dashboard cards)
router.get("/active", async (req, res) => {
  const db = getDb();
  const sessions = await db.getAll("sessions");
  const running = sessions.filter((s) => s.status === "running");
  res.json(running.map(mirrorCurrentSegment));
});

// GET /api/sessions - all sessions, optional date range filter (for History/Analytics)
router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  let sessions = await db.getAll("sessions");
  sessions = sessions.filter((s) => s.status === "completed");

  if (from) {
    const fromTime = new Date(from + "T00:00:00").getTime();
    sessions = sessions.filter((s) => new Date(s.endTime).getTime() >= fromTime);
  }
  if (to) {
    const toTime = new Date(to + "T23:59:59").getTime();
    sessions = sessions.filter((s) => new Date(s.endTime).getTime() <= toTime);
  }

  sessions.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
  res.json(sessions);
});

// POST /api/sessions/start - begin a new session on a free station
router.post("/start", async (req, res) => {
  const {
    stationId,
    customerName,
    phone,
    players,
    startTime, // optional manual override - if provided and differs from "now", it's an exception
  } = req.body;

  if (!stationId || !players) {
    return res.status(400).json({ error: "Station and number of players are required" });
  }

  const db = getDb();
  const station = await db.getById("stations", stationId);
  if (!station) return res.status(404).json({ error: "Station not found" });
  if (station.status === "busy") {
    return res.status(400).json({ error: "This station already has an active session" });
  }

  const gameType = await db.findOne("gameTypes", (g) => g.name === station.gameType);
  if (!gameType) {
    return res.status(400).json({ error: "This station's game type is not configured" });
  }

  let rate;
  try {
    rate = calculateRate(gameType, players);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const systemNow = new Date().toISOString();
  const actualStart = startTime ? new Date(startTime).toISOString() : systemNow;
  // If the employee manually set a start time more than a minute off from
  // system time, treat it as a backdated/late entry exception.
  const isException = Math.abs(new Date(actualStart) - new Date(systemNow)) > 60000;

  const firstSegment = {
    stationId: station.id,
    stationName: station.name,
    gameType: gameType.name,
    players: Number(players),
    rate,
    startTime: actualStart,
    endTime: "",
    originalStartTime: systemNow,
    isException,
    exceptionNotes: isException ? "Start time was manually backdated/edited by employee" : "",
  };

  const timelineStartEntry = {
    type: "start",
    timestamp: systemNow,
    employeeId: req.user.id,
    employeeName: req.user.name,
    stationName: station.name,
    gameType: gameType.name,
    players: Number(players),
    rate,
    isException,
    exceptionNotes: firstSegment.exceptionNotes,
  };

  const session = await db.insert("sessions", {
    customerName: customerName || "",
    phone: phone || "",
    status: "running",
    employeeId: req.user.id,
    employeeName: req.user.name,
    startedBy: req.user.name,
    startedById: req.user.id,
    discount: 0,
    total: 0,
    isException,
    exceptionNotes: firstSegment.exceptionNotes,
    segments: [firstSegment],
    timeline: [timelineStartEntry],
    createdAt: systemNow,
  });

  await db.update("stations", station.id, { status: "busy" });

  await logAction(
    req.user,
    "start_session",
    `Started session on ${station.name} for ${customerName || "walk-in customer"}${
      isException ? " (EXCEPTION: backdated start time)" : ""
    }`
  );

  res.status(201).json(mirrorCurrentSegment(session));
});

// PUT /api/sessions/:id - update an active session: change players, customer info,
// manually correct start time, or transfer it to a different station.
// Any change that affects the rate (player count or station) closes out the
// current segment and opens a new one, so billing reflects time actually
// spent at each rate rather than re-billing the whole duration at the latest rate.
router.put("/:id", async (req, res) => {
  const { customerName, phone, players, stationId, startTime, exceptionNotes } = req.body;

  const db = getDb();
  const session = await db.getById("sessions", req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "running") {
    return res.status(400).json({ error: "Only active sessions can be updated" });
  }

  const segments = [...session.segments];
  const currentSegment = { ...segments[segments.length - 1] };

  let patch = {};
  let auditNotes = [];
  let exceptionFlag = session.isException;
  let exceptionReason = session.exceptionNotes;

  if (customerName !== undefined) patch.customerName = customerName;
  if (phone !== undefined) patch.phone = phone;

  // Manual start time correction applies to the very first segment's start
  // time (i.e. when the session as a whole actually began) -> exception.
  if (startTime !== undefined) {
    const newStart = new Date(startTime).toISOString();
    const firstSegment = { ...segments[0] };
    if (newStart !== firstSegment.startTime) {
      firstSegment.startTime = newStart;
      firstSegment.isException = true;
      firstSegment.exceptionNotes = exceptionNotes || "Start time manually edited by employee";
      segments[0] = firstSegment;
      exceptionFlag = true;
      exceptionReason = firstSegment.exceptionNotes;
      auditNotes.push(`start time changed to ${newStart}`);
    }
  }

  const stationChanging = stationId !== undefined && stationId !== currentSegment.stationId;
  const playersChanging = players !== undefined && Number(players) !== currentSegment.players;
  let changeTimelineEntry = null;

  if (stationChanging) {
    const newStation = await db.getById("stations", stationId);
    if (!newStation) return res.status(404).json({ error: "Target station not found" });
    if (newStation.status === "busy") {
      return res.status(400).json({ error: "Target station is already busy" });
    }

    const newGameType = await db.findOne("gameTypes", (g) => g.name === newStation.gameType);
    if (!newGameType) {
      return res.status(400).json({ error: "Target station's game type is not configured" });
    }

    const effectivePlayers = playersChanging ? Number(players) : currentSegment.players;
    let newRate;
    try {
      newRate = calculateRate(newGameType, effectivePlayers);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();
    // Close the current segment
    segments[segments.length - 1] = { ...currentSegment, endTime: now };
    // Open a new segment on the new station
    segments.push({
      stationId: newStation.id,
      stationName: newStation.name,
      gameType: newGameType.name,
      players: effectivePlayers,
      rate: newRate,
      startTime: now,
      endTime: "",
      isException: false,
      exceptionNotes: "",
    });

    await db.update("stations", session.segments[session.segments.length - 1].stationId, {
      status: "free",
    });
    await db.update("stations", newStation.id, { status: "busy" });

    auditNotes.push(
      `moved from ${currentSegment.stationName} to ${newStation.name}${
        playersChanging ? ` (players: ${players})` : ""
      }`
    );

    // changeType groups station+player changes happening in the same
    // request together as "both", per the requirement to track these as
    // one combined event rather than two separate ones.
    changeTimelineEntry = {
      type: "change",
      changeType: playersChanging ? "both" : "station",
      timestamp: now,
      employeeId: req.user.id,
      employeeName: req.user.name,
      from: {
        stationName: currentSegment.stationName,
        gameType: currentSegment.gameType,
        players: currentSegment.players,
        rate: currentSegment.rate,
      },
      to: {
        stationName: newStation.name,
        gameType: newGameType.name,
        players: effectivePlayers,
        rate: newRate,
      },
    };
  } else if (playersChanging) {
    // Players changed but station stayed the same - close current segment,
    // open a new one on the same station with the new rate.
    const gameType = await db.findOne("gameTypes", (g) => g.name === currentSegment.gameType);
    let newRate;
    try {
      newRate = calculateRate(gameType, Number(players));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();
    segments[segments.length - 1] = { ...currentSegment, endTime: now };
    segments.push({
      stationId: currentSegment.stationId,
      stationName: currentSegment.stationName,
      gameType: currentSegment.gameType,
      players: Number(players),
      rate: newRate,
      startTime: now,
      endTime: "",
      isException: false,
      exceptionNotes: "",
    });

    auditNotes.push(`players changed to ${players}`);

    changeTimelineEntry = {
      type: "change",
      changeType: "players",
      timestamp: now,
      employeeId: req.user.id,
      employeeName: req.user.name,
      from: {
        stationName: currentSegment.stationName,
        gameType: currentSegment.gameType,
        players: currentSegment.players,
        rate: currentSegment.rate,
      },
      to: {
        stationName: currentSegment.stationName,
        gameType: currentSegment.gameType,
        players: Number(players),
        rate: newRate,
      },
    };
  }

  patch.segments = segments;
  patch.isException = exceptionFlag;
  patch.exceptionNotes = exceptionReason;
  // Whoever makes THIS change becomes the session's "last touched by"
  // employee - startedBy (set at session creation) stays untouched, so
  // both "who started it" and "who's currently handling it" stay visible.
  patch.employeeId = req.user.id;
  patch.employeeName = req.user.name;
  if (changeTimelineEntry) {
    patch.timeline = [...(session.timeline || []), changeTimelineEntry];
  }

  const updated = await db.update("sessions", req.params.id, patch);

  await logAction(
    req.user,
    "update_session",
    `Updated session for ${session.customerName || "walk-in"} on ${currentSegment.stationName}${
      auditNotes.length ? ": " + auditNotes.join(", ") : ""
    }${exceptionFlag && !session.isException ? " (EXCEPTION FLAGGED)" : ""}`
  );

  res.json(mirrorCurrentSegment(updated));
});

// Shared helper: builds the full bill preview for a session as it stands
// right now (or at a manually-specified end time), without persisting
// anything. Used by both /end-preview (read-only) and /end (which calls
// this then writes the result).
async function buildEndPreview(db, session, { lockedEndTime, manualOverrideEndTime, minimumRateEnabled }) {
  // The "real" end time is whatever the client locked in the moment End
  // Session was clicked - NOT whenever this request happens to reach the
  // server. This matters because the employee may spend 30-60+ seconds
  // deciding on a discount or round-down before submitting; billing off
  // server-now would keep charging the customer for that thinking time,
  // which is exactly the fairness problem being fixed here.
  //
  // manualOverrideEndTime is only present if the employee explicitly
  // checked "this session actually ended earlier" and picked a different
  // time - THAT is the only thing that should ever be flagged as a
  // manual-edit exception, never a delay in submitting the form.
  const baseEnd = lockedEndTime ? new Date(lockedEndTime).toISOString() : new Date().toISOString();
  const actualEnd = manualOverrideEndTime ? new Date(manualOverrideEndTime).toISOString() : baseEnd;
  const manualEndEdit = Boolean(manualOverrideEndTime) && actualEnd !== baseEnd;

  const segments = [...session.segments];
  const lastIdx = segments.length - 1;
  segments[lastIdx] = { ...segments[lastIdx], endTime: actualEnd };

  const allGameTypes = await db.getAll("gameTypes");
  const gameTypesByName = new Map(allGameTypes.map((g) => [g.name, g]));

  const settings = await db.getById("settings", "global");
  const graceMinutes = settings ? Number(settings.graceMinutes) : 5;

  const bill = calculateSessionBill(segments, gameTypesByName, graceMinutes, minimumRateEnabled !== false);

  const totalDurationMins = bill.groups.reduce((sum, g) => sum + g.durationMins, 0);

  return { segments, actualEnd, manualEndEdit, graceMinutes, totalDurationMins, ...bill };
}

// POST /api/sessions/:id/end-preview - compute (but do not save) the bill
// for ending this session. Body:
//   lockedEndTime         - the timestamp the client captured the MOMENT
//                            "End Session" was clicked - this is what
//                            actually gets billed, regardless of how long
//                            the employee spends in this screen afterward
//   manualOverrideEndTime - only present if the employee explicitly says
//                            the session ended earlier than lockedEndTime
//   minimumRateEnabled    - the minimum-rate toggle
router.post("/:id/end-preview", async (req, res) => {
  const { lockedEndTime, manualOverrideEndTime, minimumRateEnabled } = req.body;

  const db = getDb();
  const session = await db.getById("sessions", req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "running") {
    return res.status(400).json({ error: "This session has already ended" });
  }

  const preview = await buildEndPreview(db, session, {
    lockedEndTime,
    manualOverrideEndTime,
    minimumRateEnabled,
  });

  res.json({
    rawTotal: preview.rawTotal,
    totalGracePeriodSavings: preview.totalGracePeriodSavings,
    totalMinimumRateExtraCharge: preview.totalMinimumRateExtraCharge,
    totalDurationMins: preview.totalDurationMins,
    groups: preview.groups,
    manualEndEdit: preview.manualEndEdit,
    graceMinutes: preview.graceMinutes,
  });
});

// POST /api/sessions/:id/end - close out a session for real. Body:
//   endTime?            - manual end-time override (exception if used)
//   minimumRateEnabled  - the "remove minimum rate" exception switch
//   discountAmount?     - flat rupee discount
//   discountMinutes?    - discount expressed as minutes instead of rupees
//                          (converted using the LAST segment's rate)
//   discountReason?     - free-text reason (optional unless minimumRateEnabled=false)
//   roundDown?          - round the final total down to the nearest ₹10
//   lockedEndTime       - the timestamp captured client-side the moment
//                          "End Session" was clicked - this is what's
//                          actually billed, regardless of how long the
//                          employee spends on this screen afterward
//   manualOverrideEndTime? - only present if the employee explicitly says
//                             the session ended earlier than lockedEndTime
//   paymentMethod       - "cash" | "upi" | "pending"
router.post("/:id/end", async (req, res) => {
  const {
    lockedEndTime,
    manualOverrideEndTime,
    minimumRateEnabled = true,
    discountAmount,
    discountMinutes,
    discountReason,
    roundDown,
    paymentMethod,
  } = req.body;

  if (!["cash", "upi", "pending"].includes(paymentMethod)) {
    return res.status(400).json({ error: "paymentMethod must be 'cash', 'upi', or 'pending'" });
  }

  const db = getDb();
  const session = await db.getById("sessions", req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "running") {
    return res.status(400).json({ error: "This session has already ended" });
  }

  const preview = await buildEndPreview(db, session, {
    lockedEndTime,
    manualOverrideEndTime,
    minimumRateEnabled,
  });
  const { segments, actualEnd, manualEndEdit, rawTotal } = preview;

  // Resolve the discount: minutes take priority if both were somehow sent,
  // converted at the LAST (current) segment's rate, since that's the rate
  // the customer was paying at the moment the discount was negotiated.
  const lastSegment = segments[segments.length - 1];
  let discountAmt = 0;
  if (discountMinutes) {
    discountAmt = Number(discountMinutes) * (lastSegment.rate / 60);
  } else if (discountAmount) {
    discountAmt = Number(discountAmount);
  }
  discountAmt = Math.max(0, discountAmt);

  const afterDiscount = Math.max(0, rawTotal - discountAmt);

  // Round-down switch: floors the post-discount total to the nearest ₹10,
  // tracked as its own explicit discount line so it's visible on the
  // receipt/summary rather than silently folded into "discount".
  const roundDownEnabled = roundDown === true;
  const roundedTotal = roundDownEnabled ? Math.floor(afterDiscount / 10) * 10 : afterDiscount;
  const roundDownAmount = afterDiscount - roundedTotal;
  const total = roundedTotal;

  // Exception rules: a manual end-time edit is always an exception. So is
  // switching OFF the minimum-rate protection (per requirement - any time
  // the minimum-rate switch is "optionalized" away from its default-on
  // state, it's flagged) or applying any manual discount. Round-down is
  // NOT an exception on its own - it's a routine pricing convenience, not
  // an override that needs review.
  const minimumRateSwitchedOff = minimumRateEnabled === false;
  const discountApplied = discountAmt > 0;
  const newExceptionTriggered = manualEndEdit || minimumRateSwitchedOff || discountApplied;

  // A remark is only REQUIRED for switching off minimum-rate protection,
  // since that's the bigger override (it changes the pricing rules
  // themselves). A discount is common enough in normal business that
  // requiring a typed reason every time would just slow staff down - the
  // discount amount and the (optional) reason, if given, are still
  // recorded either way.
  if (minimumRateSwitchedOff && !discountReason) {
    return res.status(400).json({
      error: "Please add a remark explaining why minimum-rate protection was turned off",
    });
  }

  const exceptionNoteParts = [session.exceptionNotes].filter(Boolean);
  if (manualEndEdit) exceptionNoteParts.push("End time was manually edited by employee");
  if (minimumRateSwitchedOff) exceptionNoteParts.push("Minimum-rate protection was switched off");
  if (discountApplied) {
    exceptionNoteParts.push(
      discountReason ? `Discount applied: ${discountReason}` : "Discount applied (no reason given)"
    );
  }


  const isException = session.isException || newExceptionTriggered;
  const exceptionNotes = exceptionNoteParts.join("; ");

  const lastStationId = segments[segments.length - 1].stationId;
  const endTimestamp = new Date().toISOString();

  const endTimelineEntry = {
    type: "end",
    timestamp: endTimestamp,
    employeeId: req.user.id,
    employeeName: req.user.name,
    paymentMethod,
    rawTotal,
    discount: discountAmt,
    discountReason: discountReason || "",
    roundDownAmount,
    minimumRateEnabled: minimumRateEnabled !== false,
    total,
    isException: newExceptionTriggered,
  };

  const updated = await db.update("sessions", req.params.id, {
    segments,
    status: "completed",
    employeeId: req.user.id,
    employeeName: req.user.name,
    endedBy: req.user.name,
    endedById: req.user.id,
    discount: discountAmt,
    discountMinutes: discountMinutes ? Number(discountMinutes) : 0,
    discountReason: discountReason || "",
    roundDownEnabled,
    roundDownAmount,
    minimumRateEnabled: minimumRateEnabled !== false,
    paymentMethod,
    total,
    rawTotal,
    totalGracePeriodSavings: preview.totalGracePeriodSavings,
    totalMinimumRateExtraCharge: preview.totalMinimumRateExtraCharge,
    billingGroups: preview.groups,
    isException,
    exceptionNotes,
    originalEndTime: endTimestamp,
    timeline: [...(session.timeline || []), endTimelineEntry],
    paymentStatus: paymentMethod === "pending" ? "pending" : "paid",
    paidAt: paymentMethod === "pending" ? "" : endTimestamp,
    paidBy: paymentMethod === "pending" ? "" : req.user.name,
  });

  await db.update("stations", lastStationId, { status: "free" });

  await logAction(
    req.user,
    "end_session",
    `Ended session for ${session.customerName || "walk-in"} across ${segments.length} segment(s) - ₹${total} (${paymentMethod})${
      manualEndEdit ? " (EXCEPTION: end time manually edited)" : ""
    }${minimumRateSwitchedOff ? " (EXCEPTION: minimum rate off)" : ""}${
      discountApplied ? `, discount ₹${discountAmt.toFixed(2)} - ${discountReason}` : ""
    }${roundDownEnabled ? `, round-down ₹${roundDownAmount.toFixed(2)}` : ""}`
  );

  res.json({
    ...mirrorCurrentSegment(updated),
    durationMins: preview.totalDurationMins,
    billingGroups: preview.groups,
    rawTotal,
    totalGracePeriodSavings: preview.totalGracePeriodSavings,
    totalMinimumRateExtraCharge: preview.totalMinimumRateExtraCharge,
  });
});

// POST /api/sessions/:id/payment-status - mark a completed session's payment
// as received or still pending. Any logged-in user (owner or employee) can
// do this, since cash is often collected by whoever is at the counter.
router.post("/:id/payment-status", async (req, res) => {
  const { status, paymentMethod } = req.body; // status: "paid" | "pending"

  if (!["paid", "pending"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'paid' or 'pending'" });
  }
  if (status === "paid" && !["cash", "upi"].includes(paymentMethod)) {
    return res.status(400).json({ error: "Please specify how payment was received: cash or upi" });
  }

  const db = getDb();
  const session = await db.getById("sessions", req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "completed") {
    return res.status(400).json({ error: "Only completed sessions have a payment status" });
  }

  const patch =
    status === "paid"
      ? {
          paymentStatus: "paid",
          paymentMethod,
          paidAt: new Date().toISOString(),
          paidBy: req.user.name,
        }
      : { paymentStatus: "pending", paymentMethod: "pending", paidAt: "", paidBy: "" };

  const updated = await db.update("sessions", req.params.id, patch);

  await logAction(
    req.user,
    "payment_status_change",
    `Marked payment as ${status}${paymentMethod ? ` (${paymentMethod})` : ""} for ${
      session.customerName || "walk-in"
    } (₹${session.total})`
  );

  res.json(mirrorCurrentSegment(updated));
});

// GET /api/sessions/pending-payments - all completed sessions still awaiting payment
router.get("/pending-payments", async (req, res) => {
  const db = getDb();
  const sessions = await db.getAll("sessions");
  const pending = sessions
    .filter((s) => s.status === "completed" && s.paymentStatus === "pending")
    .map(mirrorCurrentSegment)
    .sort((a, b) => new Date(b.segments.at(-1).endTime) - new Date(a.segments.at(-1).endTime));
  res.json(pending);
});

// GET /api/sessions/:id/detail - full transaction detail for one session:
// who started it, every station/player change and who made it, who ended
// it, every rate/grace/discount/round-down/payment-method detail. Owner
// only, since this is the reconciliation view, not something an employee
// needs mid-shift.
router.get("/:id/detail", requireOwner, async (req, res) => {
  const db = getDb();
  const session = await db.getById("sessions", req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(mirrorCurrentSegment(session));
});

// GET /api/sessions/:id/receipt-pdf - regenerate and download the receipt PDF
// for any completed session at any time (e.g. re-printing after marking paid,
// or for the future WhatsApp/thermal-printer integration to reuse the same
// underlying receipt builder).
router.get("/:id/receipt-pdf", async (req, res) => {
  const db = getDb();
  const session = await db.getById("sessions", req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "completed") {
    return res.status(400).json({ error: "Receipts are only available for completed sessions" });
  }

  // Use the billingGroups persisted at end-time (the actual amounts the
  // customer was charged), not a fresh recomputation - minimumRateEnabled
  // was a point-in-time choice at checkout and shouldn't be re-derived.
  const billingGroups = session.billingGroups || [];
  const receiptData = { ...mirrorCurrentSegment(session), billingGroups };
  const settingsDoc = await db.getById("settings", "global");

  try {
    const pdfBuffer = await buildReceiptPdf(receiptData, {
      businessName: settingsDoc?.businessName,
    });

    // Filename mirrors the frontend's convention: gametype(s)_date_in-out
    // times, so the file is self-describing without opening it.
    const firstSeg = billingGroups[0]?.segments?.[0];
    const lastGroupSegs = billingGroups[billingGroups.length - 1]?.segments;
    const lastSeg = lastGroupSegs?.[lastGroupSegs.length - 1];
    const overallStart = firstSeg?.startTime ? new Date(firstSeg.startTime) : new Date();
    const overallEnd = lastSeg?.endTime ? new Date(lastSeg.endTime) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateLabel = `${overallStart.getFullYear()}-${pad(overallStart.getMonth() + 1)}-${pad(overallStart.getDate())}`;
    const timeLabel = `${pad(overallStart.getHours())}${pad(overallStart.getMinutes())}-${pad(overallEnd.getHours())}${pad(overallEnd.getMinutes())}`;
    const gameTypeLabel =
      [...new Set(billingGroups.map((g) => g.gameType))]
        .join("+")
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, "_") || "session";
    const filename = `receipt_${gameTypeLabel}_${dateLabel}_${timeLabel}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Failed to generate receipt PDF:", err);
    res.status(500).json({ error: "Could not generate the receipt PDF" });
  }
});

export default router;
