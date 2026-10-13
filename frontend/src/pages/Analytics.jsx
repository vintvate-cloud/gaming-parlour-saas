import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import Modal from "../components/Modal";
import TimelineChart from "../components/TimelineChart";
import api from "../utils/api";
import { todayStr, downloadTimestamp } from "../utils/dateHelpers";

export default function Analytics() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState(null); // { title, data }

  const [timelineDate, setTimelineDate] = useState(todayStr());
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(true);

  const loadTimeline = useCallback(async (date) => {
    setTimelineLoading(true);
    try {
      const res = await api.get("/analytics/timeline", { params: { date } });
      setTimelineData(res.data);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimeline(timelineDate);
  }, []);

  const loadAnalytics = useCallback(async (f, t) => {
    setLoading(true);
    try {
      const res = await api.get("/analytics", { params: { from: f, to: t } });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(from, to);
  }, []); // initial load = today

  function handleFilter() {
    loadAnalytics(from, to);
  }

  function handleToday() {
    const t = todayStr();
    setFrom(t);
    setTo(t);
    loadAnalytics(t, t);
  }

  async function openGameType(gameType) {
    const res = await api.get(`/analytics/game-type/${encodeURIComponent(gameType.gameType)}`, {
      params: { from, to },
    });
    setDrilldown({
      title: `${gameType.gameType} — Breakdown`,
      kind: "gametype",
      rows: res.data,
    });
  }

  const PAYMENT_METHOD_LABELS = { cash: "Cash", upi: "UPI", pending: "Pending" };

  async function openPaymentMethod(method) {
    const res = await api.get(`/analytics/payment-method/${method}`, { params: { from, to } });
    setDrilldown({
      title: `${PAYMENT_METHOD_LABELS[method]} — Transactions`,
      kind: "payment",
      rows: res.data,
    });
  }

  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await api.get("/analytics/export", {
        params: { from, to },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `analytics_${from}_to_${to}_downloaded-${downloadTimestamp()}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-base">
      <Navbar />
      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-5 sm:mb-6">Income Analytics</h1>

        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From:</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-panelLight border border-border rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-panelLight border border-border rounded-lg px-3 py-2 text-white"
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
                <p className="text-sm text-slate-400 mb-1">Total Income</p>
                <p className="text-3xl font-bold text-green-400">₹{data.totalIncome}</p>
              </div>
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Active Stations</p>
                <p className="text-3xl font-bold text-blue-400">{data.activeStations}</p>
              </div>
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Total Sessions</p>
                <p className="text-3xl font-bold text-accent">{data.totalSessions}</p>
              </div>
              <div className="bg-panel border border-border rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Pending Payments</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {data.pendingPaymentsCount}
                  {data.pendingPaymentsCount > 0 && (
                    <span className="text-sm text-yellow-400/70 font-normal ml-1">
                      (₹{data.pendingPaymentsAmount})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {data.gameTypeBreakdown.map((g) => (
                <button
                  key={g.gameType}
                  onClick={() => openGameType(g)}
                  className="text-left bg-panel border border-border rounded-xl p-5 hover:border-accent/60 transition-colors"
                >
                  <p className="font-bold text-white mb-3">{g.gameType}</p>
                  <div className="space-y-1.5 text-sm mb-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Income:</span>
                      <span className="text-green-400 font-semibold">₹{g.income.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Sessions:</span>
                      <span className="text-blue-400 font-semibold">{g.sessions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Duration:</span>
                      <span className="text-accent font-semibold">{g.durationMins} min</span>
                    </div>
                  </div>
                  {g.stations.length > 0 && (
                    <div className="border-t border-border pt-2 space-y-1">
                      {g.stations.map((s) => (
                        <div key={s.stationId} className="flex justify-between text-xs">
                          <span className="text-slate-500 truncate">{s.stationName}</span>
                          <span className="text-slate-400 shrink-0 ml-2">₹{s.income.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <h2 className="text-lg font-bold text-white mt-8 mb-3">Payment Reconciliation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {["cash", "upi", "pending"].map((method) => {
                const m = data.paymentMethodBreakdown[method] || { amount: 0, count: 0 };
                const style = {
                  cash: { icon: "💵", color: "text-green-400" },
                  upi: { icon: "📱", color: "text-blue-400" },
                  pending: { icon: "⏱", color: "text-yellow-400" },
                }[method];
                return (
                  <button
                    key={method}
                    onClick={() => openPaymentMethod(method)}
                    className="text-left bg-panel border border-border rounded-xl p-5 hover:border-accent/60 transition-colors"
                  >
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <span>{style.icon}</span> {PAYMENT_METHOD_LABELS[method]}
                    </p>
                    <p className={`text-2xl font-bold ${style.color}`}>₹{m.amount.toFixed(0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{m.count} transaction{m.count !== 1 ? "s" : ""}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-8 mb-3 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-white">Station Timeline</h2>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={timelineDate}
                  onChange={(e) => {
                    setTimelineDate(e.target.value);
                    loadTimeline(e.target.value);
                  }}
                  className="bg-panelLight border border-border rounded-lg px-3 py-1.5 text-white text-sm"
                />
                <button
                  onClick={() => {
                    const t = todayStr();
                    setTimelineDate(t);
                    loadTimeline(t);
                  }}
                  className="bg-accent hover:bg-accentDark text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                >
                  Today
                </button>
              </div>
            </div>
            <div className="bg-panel border border-border rounded-xl p-4 sm:p-5">
              {timelineLoading ? (
                <p className="text-slate-400 text-sm">Loading timeline...</p>
              ) : (
                <TimelineChart data={timelineData} />
              )}
            </div>
          </>
        )}
      </main>

      {drilldown && (
        <Modal title={drilldown.title} onClose={() => setDrilldown(null)} maxWidth="max-w-2xl">
          {drilldown.rows.length === 0 ? (
            <p className="text-slate-400 text-sm">No transactions in this date range.</p>
          ) : (
            <div className="space-y-2">
              {drilldown.rows.map((d, idx) => (
                <div
                  key={`${d.sessionId}-${idx}`}
                  className="bg-panelLight rounded-lg px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-white flex items-center gap-2 flex-wrap">
                      {d.customerName}
                      {d.isMultiSegment && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 rounded-full px-2 py-0.5 font-medium">
                          multi-station
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {drilldown.kind === "gametype" ? (
                        <>
                          {d.stationName} · {new Date(d.startTime).toLocaleString()} · {d.durationMins} mins
                        </>
                      ) : (
                        <>
                          {d.employeeName} · {new Date(d.endTime).toLocaleString()}
                        </>
                      )}
                      {d.isException && <span className="text-yellow-400 ml-2">⚠️ exception</span>}
                    </p>
                  </div>
                  <p className="text-green-400 font-bold shrink-0">
                    ₹{(d.amount ?? d.total).toFixed(0)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}