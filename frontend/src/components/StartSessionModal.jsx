import { useState } from "react";
import Modal from "./Modal";
import TimeAdjuster from "./TimeAdjuster";
import api from "../utils/api";

export default function StartSessionModal({ station, gameType, onClose, onStarted }) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [players, setPlayers] = useState(1);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [startTime, setStartTime] = useState(new Date());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const maxPlayers = gameType?.maxPlayers || 1;
  const availablePlayerOptions = Array.from({ length: maxPlayers }, (_, i) => i + 1).filter(
    (p) => gameType?.rates?.[String(p)] !== undefined
  );
  const rate = gameType?.rates?.[String(players)];

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        stationId: station.id,
        customerName: customerName.trim(),
        phone: phone.trim(),
        players: Number(players),
      };
      if (useCustomTime) {
        payload.startTime = startTime.toISOString();
      }
      const res = await api.post("/sessions/start", payload);
      onStarted(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not start the session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Start Session - ${station.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Customer Name <span className="text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Walk-in customer"
            className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Phone Number <span className="text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit number"
            className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {availablePlayerOptions.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Number of Players
            </label>
            <div className="grid grid-cols-4 gap-2">
              {availablePlayerOptions.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlayers(p)}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    players === p
                      ? "bg-accent text-white"
                      : "bg-panelLight text-slate-300 border border-border hover:border-slate-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-panelLight rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-300">Rate per hour:</span>
          <span className="text-accent font-bold text-lg">₹{rate ?? "—"}</span>
        </div>

        <div className="border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustomTime}
              onChange={(e) => setUseCustomTime(e.target.checked)}
              className="rounded border-border"
            />
            This session actually started earlier (backdate start time)
          </label>
          {useCustomTime && (
            <div className="mt-2">
              <TimeAdjuster value={startTime} onChange={setStartTime} />
              <p className="text-xs text-yellow-400 mt-1.5">
                ⚠️ This will be recorded as an exception for owner review.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-border text-slate-300 rounded-lg py-2.5 hover:bg-panelLight transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !rate}
            className="flex-1 bg-accent hover:bg-accentDark text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-60"
          >
            {loading ? "Starting..." : "Start Session"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
