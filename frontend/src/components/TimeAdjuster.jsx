// A simplified time editor: shows just HH:MM (the date is always "today",
// so there's no need to expose a date picker and risk someone fat-fingering
// the wrong day). Quick +/- 5 minute buttons sit next to the time input for
// fast adjustments without having to type.
//
// Internally this still works with full ISO timestamps - `value` and the
// argument to `onChange` are both Date objects, just always pinned to the
// same calendar day they started on.

function pad(n) {
  return String(n).padStart(2, "0");
}

function toTimeInputValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applyTimeToDate(date, timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const next = new Date(date);
  next.setHours(h, m, 0, 0);
  return next;
}

export default function TimeAdjuster({ value, onChange, label }) {
  function handleTimeInputChange(e) {
    onChange(applyTimeToDate(value, e.target.value));
  }

  function adjustMinutes(delta) {
    const next = new Date(value.getTime() + delta * 60000);
    onChange(next);
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjustMinutes(-5)}
          className="shrink-0 w-9 h-9 rounded-lg bg-panelLight border border-border text-slate-300 hover:bg-base hover:border-slate-500 transition-colors font-bold"
          aria-label="Subtract 5 minutes"
        >
          −5
        </button>
        <input
          type="time"
          value={toTimeInputValue(value)}
          onChange={handleTimeInputChange}
          className="flex-1 bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white text-center text-lg font-medium focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => adjustMinutes(5)}
          className="shrink-0 w-9 h-9 rounded-lg bg-panelLight border border-border text-slate-300 hover:bg-base hover:border-slate-500 transition-colors font-bold"
          aria-label="Add 5 minutes"
        >
          +5
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {value.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
      </p>
    </div>
  );
}
