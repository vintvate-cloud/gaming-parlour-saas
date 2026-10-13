import { useState } from "react";
import api from "../utils/api";

const BILLING_TYPE_OPTIONS = [
  { value: "player_tiered_minimum", label: "Player-count tiered (e.g. PS5, Gaming Room)" },
  { value: "tiered_flat_overflow", label: "Flat fee tiers (e.g. VR, Car Simulator, Pool)" },
  { value: "simple_hourly", label: "Simple hourly rate (e.g. PC Gaming)" },
];

export default function AddGameTypeForm({ onAdded }) {
  const [name, setName] = useState("");
  const [billingType, setBillingType] = useState("player_tiered_minimum");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [rate1, setRate1] = useState(100);
  const [hourlyRate, setHourlyRate] = useState(100);
  const [tierMinutes, setTierMinutes] = useState(60);
  const [tierFee, setTierFee] = useState(200);
  const [overflowRate, setOverflowRate] = useState(200);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let payload;
      if (billingType === "player_tiered_minimum") {
        const rates = {};
        for (let p = 1; p <= Number(maxPlayers); p++) rates[p] = Number(rate1);
        payload = {
          name,
          maxPlayers: Number(maxPlayers),
          rates,
          billingModel: { billingType },
        };
      } else if (billingType === "tiered_flat_overflow") {
        payload = {
          name,
          maxPlayers: 1,
          rates: { 1: Number(overflowRate) },
          billingModel: {
            billingType,
            tiers: [{ upToMinutes: Number(tierMinutes), flatFee: Number(tierFee) }],
            overflowHourlyRate: Number(overflowRate),
          },
        };
      } else {
        payload = {
          name,
          maxPlayers: 1,
          rates: { 1: Number(hourlyRate) },
          billingModel: { billingType, hourlyRate: Number(hourlyRate) },
        };
      }

      await api.post("/game-types", payload);
      setName("");
      onAdded();
    } catch (err) {
      setError(err.response?.data?.error || "Could not add game type");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-panel border border-border rounded-xl p-6 mb-6">
      <h3 className="font-bold text-white mb-4">Add New Game Type</h3>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Game Type Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Xbox, Bowling"
              required
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Billing Type</label>
            <select
              value={billingType}
              onChange={(e) => setBillingType(e.target.value)}
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            >
              {BILLING_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {billingType === "player_tiered_minimum" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Max Players</label>
              <input
                type="number"
                min="1"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Rate for 1 Player (₹/hr)</label>
              <input
                type="number"
                min="0"
                value={rate1}
                onChange={(e) => setRate1(e.target.value)}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              You can set per-player-count rates individually after creating the game type.
            </p>
          </div>
        )}

        {billingType === "tiered_flat_overflow" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">First tier: up to (min)</label>
              <input
                type="number"
                min="0"
                value={tierMinutes}
                onChange={(e) => setTierMinutes(e.target.value)}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Flat fee (₹)</label>
              <input
                type="number"
                min="0"
                value={tierFee}
                onChange={(e) => setTierFee(e.target.value)}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Overflow rate (₹/hr)</label>
              <input
                type="number"
                min="0"
                value={overflowRate}
                onChange={(e) => setOverflowRate(e.target.value)}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-3">
              You can add more tiers and adjust everything after creating the game type.
            </p>
          </div>
        )}

        {billingType === "simple_hourly" && (
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Hourly Rate (₹/hr)</label>
            <input
              type="number"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full sm:w-1/3 bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
        >
          {submitting ? "Adding..." : "+ Add Game Type"}
        </button>
      </form>
    </div>
  );
}
