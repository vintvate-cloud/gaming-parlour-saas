import { useState, useEffect } from "react";
import Modal from "./Modal";
import api from "../utils/api";

const CHANGE_TYPE_LABELS = {
  station: "Screen changed",
  players: "Players changed",
  both: "Screen & players changed",
};

function TimelineEntry({ entry, isLast }) {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-3 h-3 rounded-full mt-1 ${
            entry.type === "start"
              ? "bg-green-500"
              : entry.type === "end"
              ? "bg-red-500"
              : "bg-blue-500"
          }`}
        />
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-semibold text-white text-sm">
            {entry.type === "start" && "Session started"}
            {entry.type === "change" && CHANGE_TYPE_LABELS[entry.changeType]}
            {entry.type === "end" && "Session ended"}
          </p>
          <span className="text-xs text-slate-500">{time}</span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">by {entry.employeeName}</p>

        {entry.type === "start" && (
          <div className="bg-panelLight rounded-lg p-3 mt-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Station</span>
              <span className="text-white">{entry.stationName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Game type / players</span>
              <span className="text-white">
                {entry.gameType} · {entry.players}p
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Rate</span>
              <span className="text-white">₹{entry.rate}/hr</span>
            </div>
            {entry.isException && (
              <p className="text-yellow-400 pt-1">⚠️ {entry.exceptionNotes}</p>
            )}
          </div>
        )}

        {entry.type === "change" && (
          <div className="bg-panelLight rounded-lg p-3 mt-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-slate-400">
                {entry.from.stationName} · {entry.from.players}p · ₹{entry.from.rate}/hr
              </div>
            </div>
            <div className="text-center text-slate-500">↓</div>
            <div className="flex items-center justify-between">
              <div className="text-white">
                {entry.to.stationName} · {entry.to.players}p · ₹{entry.to.rate}/hr
              </div>
            </div>
          </div>
        )}

        {entry.type === "end" && (
          <div className="bg-panelLight rounded-lg p-3 mt-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Raw amount</span>
              <span className="text-white">₹{entry.rawTotal?.toFixed(0)}</span>
            </div>
            {entry.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Discount</span>
                <span className="text-white">
                  -₹{entry.discount.toFixed(0)}
                  {entry.discountReason && (
                    <span className="text-slate-500"> ({entry.discountReason})</span>
                  )}
                </span>
              </div>
            )}
            {entry.roundDownAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Round-down</span>
                <span className="text-white">-₹{entry.roundDownAmount.toFixed(0)}</span>
              </div>
            )}
            {!entry.minimumRateEnabled && (
              <p className="text-yellow-400">⚠️ Minimum-rate protection was off</p>
            )}
            <div className="flex justify-between pt-1 border-t border-border/60">
              <span className="text-slate-300 font-medium">Final total</span>
              <span className="text-white font-bold">₹{entry.total.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment method</span>
              <span className="text-white capitalize">{entry.paymentMethod}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransactionDetailModal({ sessionId, onClose }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get(`/sessions/${sessionId}/detail`);
        if (!cancelled) setSession(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || "Could not load transaction detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const timeline = session?.timeline || [];

  return (
    <Modal title="Transaction Detail" onClose={onClose} maxWidth="max-w-lg">
      {loading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div>
          <div className="mb-4 pb-4 border-b border-border">
            <p className="font-bold text-white">{session.customerName || "Walk-in customer"}</p>
            {session.phone && <p className="text-sm text-slate-400">{session.phone}</p>}
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              <span>Started by {session.startedBy}</span>
              {session.endedBy && session.endedBy !== session.startedBy && (
                <span>· Ended by {session.endedBy}</span>
              )}
            </div>
          </div>

          {timeline.length === 0 ? (
            <p className="text-slate-400 text-sm">No timeline data available for this session.</p>
          ) : (
            <div>
              {timeline.map((entry, idx) => (
                <TimelineEntry key={idx} entry={entry} isLast={idx === timeline.length - 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
