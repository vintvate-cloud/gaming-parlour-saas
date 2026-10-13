const GAME_ICONS = {
  PS5: "🎮",
  "Gaming Room": "🕹️",
  "PC Gaming": "💻",
  VR: "⚡",
  "Car Simulator": "🚗",
  "Pool Table": "🎱",
};

function formatMinutes(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

// Shortens a station name for the compact/mid card header - "PS5 Screen 1"
// -> "S1", "PC 3" -> "PC3", "Pool Table" -> "Pool". Falls back to the
// original name (truncated) for anything that doesn't match a known
// pattern, so a custom station name never breaks.
const SHORT_NAME_OVERRIDES = {
  "VR Station": "VR",
  "Car Simulator": "Car",
  "Pool Table": "Pool",
  "Gaming Room": "Room",
};

function shortStationName(name) {
  if (SHORT_NAME_OVERRIDES[name]) return SHORT_NAME_OVERRIDES[name];
  const screenMatch = name.match(/screen\s*(\d+)/i);
  if (screenMatch) return `S${screenMatch[1]}`;
  const pcMatch = name.match(/^pc\s*(\d+)/i);
  if (pcMatch) return `PC${pcMatch[1]}`;
  if (name.length <= 8) return name;
  return name.slice(0, 7) + "…";
}

// Live-ticking version: re-derives "now" from how much time has passed
// since the card last received fresh data, so the on-screen timer keeps
// moving between the dashboard's 15-second refreshes instead of looking
// frozen. Falls back to the raw cumulative value if no live tick is given.
function liveElapsedMinutes(session) {
  if (session.cumulativeElapsedMins === undefined) {
    // Fallback for any older session shape without the field.
    return Math.max(0, Math.round((Date.now() - new Date(session.startTime).getTime()) / 60000));
  }
  return session.cumulativeElapsedMins;
}

// Three density tiers:
//   compact     - bare minimum, fits the most stations on screen (mobile-first)
//   mid         - short station name + game/players/rate/time, no customer
//                 name, but with comfortable's spacing (not cramped)
//   comfortable - full detail including customer name/phone
export default function StationCard({ station, session, onClick, density = "compact" }) {
  const isBusy = station.status === "busy" && session;
  const icon = GAME_ICONS[station.gameType] || "🎮";

  const isCompact = density === "compact";
  const isMid = density === "mid";
  const isComfortable = density === "comfortable";
  const useShortName = isCompact || isMid;
  const showCustomerInfo = isComfortable;
  const roomy = isMid || isComfortable; // spacing tier - mid and comfortable both get breathing room

  const padding = isCompact ? "p-3" : "p-5";

  return (
    <button
      onClick={onClick}
      className={`text-left bg-panel border rounded-xl ${padding} transition-all hover:border-accent/60 ${
        isBusy ? "border-accent shadow-lg shadow-accent/10" : "border-border"
      }`}
    >
      <div className={`flex items-center justify-between ${roomy ? "mb-3" : "mb-1.5"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`shrink-0 flex items-center justify-center rounded-lg ${
              roomy ? "w-10 h-10 text-xl" : "w-7 h-7 text-sm"
            } ${isBusy ? "bg-accent/20" : "bg-panelLight"}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p
              className={`font-bold text-white leading-tight truncate ${
                useShortName && !roomy ? "text-sm" : ""
              }`}
            >
              {useShortName ? shortStationName(station.name) : station.name}
            </p>
            {roomy && <p className="text-xs text-slate-400">{station.gameType}</p>}
          </div>
        </div>
        <span
          className={`text-xs font-semibold rounded-full shrink-0 ${
            roomy ? "px-2.5 py-1" : "px-2 py-0.5"
          } ${isBusy ? "bg-accent text-white" : "bg-panelLight text-slate-300"}`}
        >
          {isBusy ? "Busy" : "Free"}
        </span>
      </div>

      {isBusy ? (
        <div
          className={`bg-accent/10 border border-accent/30 rounded-lg ${
            roomy ? "p-3 space-y-2" : "p-2 space-y-1"
          }`}
        >
          {showCustomerInfo && (
            <div className="text-center">
              <p className="font-bold text-accent">{session.customerName || "Walk-in customer"}</p>
              {session.phone && <p className="text-xs text-accent/80">{session.phone}</p>}
            </div>
          )}
          {showCustomerInfo && (
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>
                Started: {new Date(session.sessionStartTime || session.startTime).toLocaleTimeString()}
              </span>
            </div>
          )}
          <div
            className={`bg-panelLight rounded-lg flex items-center justify-between ${
              roomy ? "px-3 py-2" : "px-2 py-1.5"
            }`}
          >
            <div>
              <p className={`font-semibold text-white ${roomy ? "text-sm" : "text-xs"}`}>
                {isCompact ? `${session.players}p` : session.gameType}
              </p>
              {roomy && (
                <p className="text-xs text-slate-400">
                  ₹{session.rate}/hr{isMid && ` · ${session.players}p`}
                </p>
              )}
            </div>
            <div className="text-right">
              {isComfortable && <p className="text-xs text-slate-400">👥 {session.players}</p>}
              <p className="text-accent font-medium text-xs">
                {formatMinutes(liveElapsedMinutes(session))}
              </p>
            </div>
          </div>
          {session.isException && (
            <p className="text-[11px] text-yellow-400 flex items-center gap-1">
              ⚠️{roomy && " Exception flagged"}
            </p>
          )}
        </div>
      ) : (
        <div className={`text-center ${roomy ? "py-5" : "py-2"}`}>
          <div className={`text-slate-500 ${roomy ? "text-2xl mb-1" : "text-base"}`}>▷</div>
          {roomy && <p className="text-sm text-slate-400">Click to start session</p>}
        </div>
      )}
    </button>
  );
}
