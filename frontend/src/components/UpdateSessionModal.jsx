import { useState } from "react";
import Modal from "./Modal";
import TimeAdjuster from "./TimeAdjuster";
import api from "../utils/api";

export default function UpdateSessionModal({
  session,
  stations,
  gameTypes,
  onClose,
  onUpdated,
  onEndRequested,
}) {
  const [customerName, setCustomerName] = useState(session.customerName || "");
  const [phone, setPhone] = useState(session.phone || "");
  const [stationId, setStationId] = useState(session.stationId);
  const [players, setPlayers] = useState(session.players);
  const [editStartTime, setEditStartTime] = useState(false);
  const [startTime, setStartTime] = useState(
    new Date(session.sessionStartTime || session.startTime)
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const freeStations = stations.filter(
    (s) => s.status === "free" || s.id === session.stationId
  );
  const selectedStation = stations.find((s) => s.id === stationId);
  const selectedGameType = gameTypes.find((g) => g.name === selectedStation?.gameType);
  const maxPlayers = selectedGameType?.maxPlayers || 1;
  const availablePlayerOptions = Array.from({ length: maxPlayers }, (_, i) => i + 1).filter(
    (p) => selectedGameType?.rates?.[String(p)] !== undefined
  );
  const rate = selectedGameType?.rates?.[String(players)];

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        customerName: customerName.trim(),
        phone: phone.trim(),
        players: Number(players),
        stationId,
      };
      if (editStartTime) {
        payload.startTime = startTime.toISOString();
      }
      const res = await api.put(`/sessions/${session.id}`, payload);
      onUpdated(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not update the session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Update Session" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="bg-panelLight rounded-lg px-3 py-2 text-xs text-slate-400 flex items-center justify-between">
          <span>
            Started by <span className="text-slate-200 font-medium">{session.employeeName}</span>
          </span>
          <span className="text-accent font-medium">
            ⏱ {Math.floor((session.cumulativeElapsedMins || 0) / 60)}h{" "}
            {(session.cumulativeElapsedMins || 0) % 60}m elapsed
          </span>
        </div>
        {session.isException && (
          <p className="text-xs text-yellow-400">⚠️ This session has an exception flag</p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Customer Name <span className="text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
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
            className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Station</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {freeStations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.gameType})
              </option>
            ))}
          </select>
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
              checked={editStartTime}
              onChange={(e) => setEditStartTime(e.target.checked)}
              className="rounded border-border"
            />
            Correct when this visit actually started
          </label>
          {editStartTime && (
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
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onEndRequested(session)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2.5 transition-colors"
        >
          End Session
        </button>
      </form>
    </Modal>
  );
}
