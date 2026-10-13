import { useState, useRef } from "react";

const CHANGE_COLORS = {
  station: "#a855f7", // purple
  players: "#14b8a6", // teal
  both: "#fb923c", // orange
};
const DEFAULT_BUSY_COLOR = "#3b82f6"; // blue, single-segment sessions
const FREE_COLOR = "#28344a"; // matches panelLight
const ONGOING_STRIPE = "#f97316"; // accent, for the live-now indicator

function formatHourLabel(hourFloat) {
  const h = Math.floor(hourFloat) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

function formatClockTime(ms) {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function TimelineChart({ data }) {
  const [hovered, setHovered] = useState(null); // { interval, x, y }
  const containerRef = useRef(null);

  if (!data || !data.stations) return null;

  const windowStartMs = new Date(data.windowStart).getTime();
  const windowEndMs = new Date(data.windowEnd).getTime();
  const totalMs = windowEndMs - windowStartMs;
  const totalHours = data.dayEndHour - data.dayStartHour;

  const ROW_HEIGHT = 32;
  const ROW_GAP = 6;
  const LABEL_WIDTH = 110;
  const CHART_WIDTH = 900;
  const HEADER_HEIGHT = 24;

  const stations = data.stations;
  const chartHeight = stations.length * (ROW_HEIGHT + ROW_GAP) + HEADER_HEIGHT;

  function msToX(ms) {
    return LABEL_WIDTH + ((ms - windowStartMs) / totalMs) * (CHART_WIDTH - LABEL_WIDTH);
  }

  function barColor(interval) {
    if (interval.isMultiSegment && interval.changeTypesSummary) {
      return CHANGE_COLORS[interval.changeTypesSummary] || DEFAULT_BUSY_COLOR;
    }
    return DEFAULT_BUSY_COLOR;
  }

  // Hour gridlines at every full hour within the window.
  const hourMarks = [];
  for (let h = 0; h <= totalHours; h++) {
    const ms = windowStartMs + h * 3600000;
    hourMarks.push({ ms, hour: data.dayStartHour + h });
  }

  function handleMouseEnter(e, interval) {
    const rect = containerRef.current.getBoundingClientRect();
    setHovered({
      interval,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  return (
    <div ref={containerRef} className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
        width="100%"
        style={{ minWidth: 700 }}
        className="select-none"
      >
        {/* Hour gridlines + labels */}
        {hourMarks.map(({ ms, hour }, idx) => (
          <g key={idx}>
            <line
              x1={msToX(ms)}
              y1={HEADER_HEIGHT}
              x2={msToX(ms)}
              y2={chartHeight}
              stroke="#334155"
              strokeWidth={0.5}
              strokeDasharray={hour % 6 === 0 ? "0" : "2,3"}
            />
            <text
              x={msToX(ms)}
              y={HEADER_HEIGHT - 8}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="middle"
            >
              {formatHourLabel(hour)}
            </text>
          </g>
        ))}

        {/* Station rows */}
        {stations.map((station, rowIdx) => {
          const y = HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP);
          return (
            <g key={station.stationId}>
              <text
                x={0}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize="11"
                fill="#e2e8f0"
                fontWeight="500"
              >
                {station.stationName.length > 16
                  ? station.stationName.slice(0, 15) + "…"
                  : station.stationName}
              </text>

              {/* Free-time background track */}
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={CHART_WIDTH - LABEL_WIDTH}
                height={ROW_HEIGHT}
                fill={FREE_COLOR}
                rx={4}
              />

              {/* Busy intervals */}
              {station.intervals.map((interval, i) => {
                const x1 = msToX(interval.startMs);
                const x2 = msToX(interval.endMs);
                const width = Math.max(2, x2 - x1);
                return (
                  <rect
                    key={i}
                    x={x1}
                    y={y}
                    width={width}
                    height={ROW_HEIGHT}
                    fill={barColor(interval)}
                    stroke={interval.isOngoing ? ONGOING_STRIPE : "none"}
                    strokeWidth={interval.isOngoing ? 1.5 : 0}
                    rx={4}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => handleMouseEnter(e, interval)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute bg-panel border border-border rounded-lg shadow-xl p-3 text-xs z-10 pointer-events-none"
          style={{
            left: Math.min(hovered.x + 10, 560),
            top: hovered.y + 10,
            width: 200,
          }}
        >
          <p className="font-bold text-white mb-1">{hovered.interval.customerName}</p>
          <p className="text-slate-400">
            {hovered.interval.gameType} · {hovered.interval.players}p · ₹{hovered.interval.rate}/hr
          </p>
          <p className="text-slate-400 mt-1">
            {formatClockTime(hovered.interval.startMs)} – {formatClockTime(hovered.interval.endMs)}
          </p>
          {hovered.interval.isOngoing && <p className="text-accent mt-1">● Ongoing now</p>}
          {hovered.interval.isMultiSegment && hovered.interval.changeTypesSummary && (
            <p
              className="mt-1 font-medium"
              style={{ color: CHANGE_COLORS[hovered.interval.changeTypesSummary] }}
            >
              {
                {
                  station: "Screen changed mid-session",
                  players: "Players changed mid-session",
                  both: "Screen & players changed",
                }[hovered.interval.changeTypesSummary]
              }
            </p>
          )}
          {hovered.interval.isException && <p className="text-yellow-400 mt-1">⚠️ Exception</p>}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: DEFAULT_BUSY_COLOR }} /> Busy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: FREE_COLOR }} /> Free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: CHANGE_COLORS.station }} /> Screen
          changed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: CHANGE_COLORS.players }} /> Players
          changed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: CHANGE_COLORS.both }} /> Both changed
        </span>
      </div>
    </div>
  );
}
