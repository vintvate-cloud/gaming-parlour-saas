import { useState } from "react";

// Renders an editable view of one game type's billing model. Each billing
// family has genuinely different fields, so this isn't one generic form -
// it switches on billingType and shows exactly what's editable for that
// family. All three keep the same outer card shape so the page still
// reads consistently.

function PlayerTieredEditor({ rates, maxPlayers, editable, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: maxPlayers }, (_, i) => i + 1).map((p) => (
        <div key={p} className="bg-panelLight rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400 mb-1">
            {p} Player{p > 1 ? "s" : ""}
          </p>
          {editable ? (
            <input
              type="number"
              value={rates[p] ?? ""}
              onChange={(e) => onChange({ ...rates, [p]: Number(e.target.value) })}
              className="w-full bg-base border border-border rounded px-2 py-1 text-center text-accent font-bold"
            />
          ) : (
            <p className="text-accent font-bold">₹{rates[p] ?? "—"}/hr</p>
          )}
        </div>
      ))}
    </div>
  );
}

function TieredFlatEditor({ billingModel, editable, onChange }) {
  const tiers = billingModel.tiers || [];

  function updateTier(idx, field, value) {
    const next = tiers.map((t, i) => (i === idx ? { ...t, [field]: Number(value) } : t));
    onChange({ ...billingModel, tiers: next });
  }

  function addTier() {
    onChange({ ...billingModel, tiers: [...tiers, { upToMinutes: 60, flatFee: 0 }] });
  }

  function removeTier(idx) {
    onChange({ ...billingModel, tiers: tiers.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-2">
      {tiers.map((tier, idx) => (
        <div key={idx} className="bg-panelLight rounded-lg p-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] text-slate-500 mb-1">Up to (minutes, before grace)</p>
            {editable ? (
              <input
                type="number"
                value={tier.upToMinutes}
                onChange={(e) => updateTier(idx, "upToMinutes", e.target.value)}
                className="w-full bg-base border border-border rounded px-2 py-1 text-white text-sm"
              />
            ) : (
              <p className="text-white text-sm font-medium">{tier.upToMinutes} min</p>
            )}
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-slate-500 mb-1">Flat fee (₹)</p>
            {editable ? (
              <input
                type="number"
                value={tier.flatFee}
                onChange={(e) => updateTier(idx, "flatFee", e.target.value)}
                className="w-full bg-base border border-border rounded px-2 py-1 text-accent font-bold text-sm"
              />
            ) : (
              <p className="text-accent font-bold text-sm">₹{tier.flatFee}</p>
            )}
          </div>
          {editable && tiers.length > 1 && (
            <button
              onClick={() => removeTier(idx)}
              className="text-red-400 hover:text-red-300 text-sm shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button
          onClick={addTier}
          className="text-xs text-accent hover:text-accentDark font-medium"
        >
          + Add tier
        </button>
      )}
      <div className="bg-panelLight rounded-lg p-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">Overflow rate (₹/hr, after last tier)</p>
        {editable ? (
          <input
            type="number"
            value={billingModel.overflowHourlyRate}
            onChange={(e) =>
              onChange({ ...billingModel, overflowHourlyRate: Number(e.target.value) })
            }
            className="w-24 bg-base border border-border rounded px-2 py-1 text-accent font-bold text-sm text-right"
          />
        ) : (
          <p className="text-accent font-bold text-sm">₹{billingModel.overflowHourlyRate}/hr</p>
        )}
      </div>
    </div>
  );
}

function SimpleHourlyEditor({ billingModel, editable, onChange }) {
  return (
    <div className="bg-panelLight rounded-lg p-3 flex items-center justify-between">
      <p className="text-sm text-slate-300">Hourly rate</p>
      {editable ? (
        <input
          type="number"
          value={billingModel.hourlyRate}
          onChange={(e) => onChange({ ...billingModel, hourlyRate: Number(e.target.value) })}
          className="w-24 bg-base border border-border rounded px-2 py-1 text-accent font-bold text-right"
        />
      ) : (
        <p className="text-accent font-bold">₹{billingModel.hourlyRate}/hr</p>
      )}
    </div>
  );
}

const BILLING_TYPE_LABELS = {
  player_tiered_minimum: "Player-count tiered (with 1-hour minimum)",
  tiered_flat_overflow: "Flat fee tiers + overflow",
  simple_hourly: "Simple hourly rate",
};

export default function GameTypeCard({ gameType, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [rates, setRates] = useState(gameType.rates || {});
  const [billingModel, setBillingModel] = useState(gameType.billingModel || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setRates({ ...gameType.rates });
    setBillingModel({ ...gameType.billingModel });
    setEditing(true);
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(gameType.id, { rates, billingModel });
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  const billingType = gameType.billingModel?.billingType;

  return (
    <div className="bg-panel border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-white text-lg">{gameType.name}</h3>
        <div className="flex gap-2">
          {editing ? (
            <button
              onClick={save}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          ) : (
            <button
              onClick={startEdit}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-sm"
            >
              ✎ Edit
            </button>
          )}
          <button
            onClick={() => onDelete(gameType.id)}
            className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm"
          >
            🗑
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">{BILLING_TYPE_LABELS[billingType] || "Unconfigured"}</p>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {billingType === "player_tiered_minimum" && (
        <PlayerTieredEditor
          rates={editing ? rates : gameType.rates}
          maxPlayers={gameType.maxPlayers}
          editable={editing}
          onChange={setRates}
        />
      )}
      {billingType === "tiered_flat_overflow" && (
        <TieredFlatEditor
          billingModel={editing ? billingModel : gameType.billingModel}
          editable={editing}
          onChange={setBillingModel}
        />
      )}
      {billingType === "simple_hourly" && (
        <SimpleHourlyEditor
          billingModel={editing ? billingModel : gameType.billingModel}
          editable={editing}
          onChange={setBillingModel}
        />
      )}
    </div>
  );
}
