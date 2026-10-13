import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import TransactionDetailModal from "../components/TransactionDetailModal";
import api from "../utils/api";
import { todayStr, downloadTimestamp } from "../utils/dateHelpers";

// Colors are keyed to WHAT changed, not just alternating - so an owner
// scanning History can tell at a glance whether a visit involved a screen
// swap, a player-count change, or both, per the requirement to track and
// highlight these distinctly.
const CHANGE_TYPE_STYLES = {
  station: {
    border: "border-purple-500/50",
    bg: "bg-purple-500/5",
    badge: "bg-purple-500/20 text-purple-300",
    label: "Screen changed",
  },
  players: {
    border: "border-teal-500/50",
    bg: "bg-teal-500/5",
    badge: "bg-teal-500/20 text-teal-300",
    label: "Players changed",
  },
  both: {
    border: "border-orange-500/50",
    bg: "bg-orange-500/5",
    badge: "bg-orange-500/20 text-orange-300",
    label: "Screen & players changed",
  },
};

// Groups consecutive flat rows into arrays by sessionId, preserving order.
// The backend already guarantees segments of one session are contiguous,
// so a simple consecutive-run grouping is sufficient here.
function groupRows(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    if (current && current.sessionId === row.sessionId) {
      current.rows.push(row);
    } else {
      current = { sessionId: row.sessionId, rows: [row] };
      groups.push(current);
    }
  }
  return groups;
}

function SegmentRow({ t }) {
  return (
    <div className="bg-panelLight rounded-lg px-3 sm:px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-white font-medium truncate">{t.stationName}</span>
        <span className="font-bold text-white shrink-0">₹{t.total.toFixed(0)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1 text-xs">
        <span className="text-accent">{t.gameType}</span>
        <span className="text-blue-400">{t.durationMins} mins</span>
      </div>
    </div>
  );
}

function TransactionGroup({ group, onOpenDetail }) {
  const rows = group.rows;
  const first = rows[0];
  const isMulti = rows.length > 1;
  const changeType = first.changeTypesSummary;
  const style = CHANGE_TYPE_STYLES[changeType] || {
    border: "border-border",
    bg: "",
    badge: "bg-blue-500/20 text-blue-300",
    label: `${rows.length} stations`,
  };
  const groupTotal = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const lastRow = rows[rows.length - 1];

  return (
    <div
      onClick={() => onOpenDetail(group.sessionId)}
      className={`bg-panel border rounded-xl p-5 cursor-pointer hover:border-accent/50 transition-colors ${
        isMulti ? `${style.border} ${style.bg}` : "border-border"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-bold text-white flex items-center gap-2">
            {first.customerName || "Walk-in customer"}
            {isMulti && (
              <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${style.badge}`}>
                {style.label}
              </span>
            )}
          </p>
          {first.phone && <p className="text-sm text-slate-400">{first.phone}</p>}
          <p className="text-xs text-slate-500">{new Date(lastRow.endTime).toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${groupTotal < 0 ? "text-red-400" : "text-green-400"}`}>
            ₹{groupTotal}
          </p>
          {lastRow.discount > 0 && (
            <p className="text-xs text-slate-400">Discount: ₹{lastRow.discount}</p>
          )}
          <p
            className={`text-xs font-medium mt-0.5 ${
              lastRow.paymentStatus === "paid" ? "text-green-400" : "text-yellow-400"
            }`}
          >
            {lastRow.paymentStatus === "paid" ? "Paid" : "Pending"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => (
          <SegmentRow key={`${r.sessionId}-${r.segmentIndex}`} t={r} />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        <span>By: {first.employeeName}</span>
        {rows.some((r) => r.isException) && (
          <span className="text-yellow-400">
            ⚠️ Exception: {rows.find((r) => r.isException)?.exceptionNotes}
          </span>
        )}
      </div>
    </div>
  );
}

export default function History() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [detailSessionId, setDetailSessionId] = useState(null);

  const load = useCallback(async (f, t) => {
    setLoading(true);
    try {
      const res = await api.get("/history", { params: { from: f, to: t } });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("", "");
  }, []);

  function handleFilter() {
    load(from, to);
  }

  function handleToday() {
    const t = todayStr();
    setFrom(t);
    setTo(t);
    load(t, t);
  }

  function handleClear() {
    setFrom("");
    setTo("");
    load("", "");
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await api.get("/history/export", {
        params: { from, to },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const rangeLabel = from && to ? `${from}_to_${to}` : "all-dates";
      link.setAttribute("download", `history_${rangeLabel}_downloaded-${downloadTimestamp()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const groups = data ? groupRows(data.transactions) : [];

  return (
    <div className="min-h-screen bg-base">
      <Navbar />
      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-5 sm:mb-6">Transaction History</h1>

        <div className="flex flex-wrap items-end gap-2 sm:gap-3 mb-6">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From:</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-panelLight border border-border rounded-lg px-3 py-2 text-white text-sm w-[150px]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-panelLight border border-border rounded-lg px-3 py-2 text-white text-sm w-[150px]"
            />
          </div>
          <button
            onClick={handleFilter}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium transition-colors"
          >
            Filter
          </button>
          <button
            onClick={handleToday}
            className="bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2 font-medium transition-colors"
          >
            Today
          </button>
          <button
            onClick={handleClear}
            className="border border-border text-slate-300 rounded-lg px-4 py-2 font-medium hover:bg-panelLight transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="bg-panelLight border border-border hover:border-slate-500 text-white rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-60"
          >
            {downloading ? "Preparing..." : "⬇ Download XLSX"}
          </button>
        </div>

        {loading || !data ? (
          <p className="text-slate-400">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-5 mb-6">
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Total Transactions</p>
                <p className="text-3xl font-bold text-blue-400">{data.totalTransactions}</p>
              </div>
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Total Income</p>
                <p className="text-3xl font-bold text-green-400">₹{data.totalIncome}</p>
              </div>
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Average Transaction</p>
                <p className="text-3xl font-bold text-accent">₹{data.averageTransaction}</p>
              </div>
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Pending Payments</p>
                <p className="text-3xl font-bold text-yellow-400">{data.pendingCount}</p>
              </div>
            </div>

            <div className="space-y-3">
              {groups.length === 0 && (
                <p className="text-slate-400 text-sm">No transactions found for this range.</p>
              )}
              {groups.map((group) => (
                <TransactionGroup
                  key={group.sessionId}
                  group={group}
                  onOpenDetail={setDetailSessionId}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {detailSessionId && (
        <TransactionDetailModal
          sessionId={detailSessionId}
          onClose={() => setDetailSessionId(null)}
        />
      )}
    </div>
  );
}
