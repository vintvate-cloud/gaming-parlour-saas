import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { sessionInRange, sessionOverallEndTime, flattenToSegmentRows } from "../utils/segments.js";
import { buildHighlightedWorkbook } from "../utils/xlsxExport.js";

const router = express.Router();

router.use(requireAuth, requireOwner); // History is owner-only

async function getFilteredRows(from, to) {
  const db = getDb();
  const all = await db.getAll("sessions");
  const completed = all.filter((s) => s.status === "completed" && sessionInRange(s, from, to));

  // IMPORTANT: sort SESSIONS (not the flattened rows) by their overall end
  // time first, then flatten. This guarantees every segment belonging to
  // one session stays contiguous in the output - if we sorted rows by each
  // segment's own end time instead, two sessions whose segments interleave
  // in time could get their rows mixed together, breaking the "club rows
  // together" grouping the owner relies on for camera cross-checks.
  completed.sort((a, b) => new Date(sessionOverallEndTime(b)) - new Date(sessionOverallEndTime(a)));

  return flattenToSegmentRows(completed);
}

// GET /api/history?from=&to=
// Returns one row per segment - a customer who used two stations in one
// visit shows as two rows, kept adjacent and tagged with the same groupIndex
// so the UI can visually band them together.
router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const transactions = await getFilteredRows(from, to);

  // "Total transactions" counts distinct sessions (visits), not rows,
  // since that's what a cashier means by "how many customers paid today".
  const distinctSessions = new Set(transactions.map((t) => t.sessionId)).size;
  const totalIncome = transactions.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const averageTransaction = distinctSessions ? Math.round(totalIncome / distinctSessions) : 0;
  const pendingCount = new Set(
    transactions.filter((t) => t.paymentStatus === "pending").map((t) => t.sessionId)
  ).size;

  res.json({
    totalTransactions: distinctSessions,
    totalIncome,
    averageTransaction,
    pendingCount,
    transactions,
  });
});

// GET /api/history/export?from=&to= - downloadable as .xlsx with
// same-session rows highlighted in alternating colors for quick
// cross-referencing against camera footage.
router.get("/export", async (req, res) => {
  const { from, to } = req.query;
  const rows = await getFilteredRows(from, to);

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
    { header: "Paid By", value: (r) => r.paidBy || "", width: 14 },
    { header: "Exception", value: (r) => (r.isException ? "Yes" : "No"), width: 10 },
    { header: "Exception Notes", value: (r) => r.exceptionNotes || "", width: 30 },
  ];

  const buffer = await buildHighlightedWorkbook({
    sheetName: "Transaction History",
    title: "Gaming Parlour - Transaction History",
    columns,
    rows,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="transaction_history.xlsx"`);
  res.send(buffer);
});

export default router;
