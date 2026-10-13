import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import api from "../utils/api";

function timeSince(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

export default function PendingPayments() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/sessions/pending-payments");
      setPending(res.data);
    } catch (err) {
      setError("Could not load pending payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh periodically so the list stays current if another device
    // collects a payment.
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  async function markPaid(session, method) {
    setUpdatingId(session.id);
    setError("");
    try {
      await api.post(`/sessions/${session.id}/payment-status`, { status: "paid", paymentMethod: method });
      setPending((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      setError(err.response?.data?.error || "Could not mark this as paid");
    } finally {
      setUpdatingId(null);
    }
  }

  const totalPending = pending.reduce((sum, s) => sum + Number(s.total || 0), 0);

  return (
    <div className="min-h-screen bg-base">
      <Navbar />
      <main className="px-6 py-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Pending Payments</h1>
          {pending.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 text-right">
              <p className="text-xs text-yellow-400">Total outstanding</p>
              <p className="text-xl font-bold text-yellow-400">₹{totalPending}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : pending.length === 0 ? (
          <div className="bg-panel border border-border rounded-xl p-10 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-slate-300 font-medium">No pending payments right now</p>
            <p className="text-slate-500 text-sm mt-1">
              Sessions show up here if marked "Payment Pending" on the receipt screen.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((s) => (
              <div
                key={s.id}
                className="bg-panel border border-yellow-500/30 rounded-xl p-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white truncate">
                      {s.customerName || "Walk-in customer"}
                    </p>
                    {s.segments?.length > 1 && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 rounded-full px-2 py-0.5 font-medium shrink-0">
                        multi-station
                      </span>
                    )}
                  </div>
                  {s.phone && <p className="text-sm text-slate-400">{s.phone}</p>}
                  <p className="text-xs text-slate-500 mt-1">
                    Ended {timeSince(s.segments?.at(-1)?.endTime || s.startTime)} · Served by{" "}
                    {s.employeeName}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-yellow-400 mb-2">₹{s.total}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => markPaid(s, "cash")}
                      disabled={updatingId === s.id}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
                    >
                      {updatingId === s.id ? "..." : "💵 Cash"}
                    </button>
                    <button
                      onClick={() => markPaid(s, "upi")}
                      disabled={updatingId === s.id}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
                    >
                      {updatingId === s.id ? "..." : "📱 UPI"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
