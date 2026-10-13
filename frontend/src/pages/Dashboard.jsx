import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import StationCard from "../components/StationCard";
import StartSessionModal from "../components/StartSessionModal";
import UpdateSessionModal from "../components/UpdateSessionModal";
import EndSessionModal from "../components/EndSessionModal";
import SessionReceiptModal from "../components/SessionReceiptModal";
import api from "../utils/api";

export default function Dashboard() {
  const [stations, setStations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [gameTypes, setGameTypes] = useState([]);
  const [density, setDensity] = useState("compact");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [startModalStation, setStartModalStation] = useState(null);
  const [updateModalSession, setUpdateModalSession] = useState(null);
  const [endModalSession, setEndModalSession] = useState(null);
  const [receiptSession, setReceiptSession] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [stationsRes, sessionsRes, gameTypesRes, settingsRes] = await Promise.all([
        api.get("/stations"),
        api.get("/sessions/active"),
        api.get("/game-types"),
        api.get("/settings"),
      ]);
      setStations(stationsRes.data);
      setSessions(sessionsRes.data);
      setGameTypes(gameTypesRes.data);
      setDensity(settingsRes.data.dashboardDensity || "compact");
    } catch (err) {
      setError("Could not load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // Refresh active sessions periodically so elapsed time and any
    // changes made on another device stay current.
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, [loadAll]);

  function sessionForStation(stationId) {
    return sessions.find((s) => s.stationId === stationId);
  }

  function handleStationClick(station) {
    const session = sessionForStation(station.id);
    if (session) {
      setUpdateModalSession(session);
    } else {
      setStartModalStation(station);
    }
  }

  function handleStarted() {
    setStartModalStation(null);
    loadAll();
  }

  function handleUpdated() {
    setUpdateModalSession(null);
    loadAll();
  }

  function handleEndRequested(session) {
    setUpdateModalSession(null);
    setEndModalSession(session);
  }

  function handleEnded(completedSession) {
    setEndModalSession(null);
    setReceiptSession(completedSession);
    loadAll();
  }

  const activeCount = sessions.length;
  const startGameType = startModalStation
    ? gameTypes.find((g) => g.name === startModalStation.gameType)
    : null;

  // Group stations by game type, preserving the order game types were
  // created in, so the dashboard reads as distinct sections ("PS5",
  // "Pool Table", ...) rather than one undifferentiated grid.
  const stationsByGameType = [];
  gameTypes.forEach((gt) => {
    const matching = stations.filter((s) => s.gameType === gt.name);
    if (matching.length > 0) {
      stationsByGameType.push({ gameType: gt.name, stations: matching });
    }
  });
  // Any station whose gameType no longer matches a configured game type
  // (e.g. the game type was renamed) still needs to show up somewhere.
  const categorizedNames = new Set(stationsByGameType.map((g) => g.gameType));
  const uncategorized = stations.filter((s) => !categorizedNames.has(s.gameType));
  if (uncategorized.length > 0) {
    stationsByGameType.push({ gameType: "Other", stations: uncategorized });
  }

  return (
    <div className="min-h-screen bg-base">
      <Navbar activeCount={activeCount} />

      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading stations...</p>
        ) : (
          <div className="space-y-8">
            {stationsByGameType.map(({ gameType, stations: groupStations }) => {
              const groupActiveCount = groupStations.filter(
                (s) => sessionForStation(s.id) !== undefined
              ).length;
              return (
                <section key={gameType}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-lg font-bold text-white">{gameType}</h2>
                    <span className="text-xs text-slate-500">
                      {groupActiveCount}/{groupStations.length} in use
                    </span>
                  </div>
                  <div
                    className={`grid gap-3 sm:gap-4 ${
                      density === "compact"
                        ? "grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 lg:grid-cols-8"
                        : density === "mid"
                        ? "grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 lg:grid-cols-6"
                        : "grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
                    }`}
                  >
                    {groupStations.map((station) => (
                      <StationCard
                        key={station.id}
                        station={station}
                        session={sessionForStation(station.id)}
                        onClick={() => handleStationClick(station)}
                        density={density}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {startModalStation && (
        <StartSessionModal
          station={startModalStation}
          gameType={startGameType}
          onClose={() => setStartModalStation(null)}
          onStarted={handleStarted}
        />
      )}

      {updateModalSession && (
        <UpdateSessionModal
          session={updateModalSession}
          stations={stations}
          gameTypes={gameTypes}
          onClose={() => setUpdateModalSession(null)}
          onUpdated={handleUpdated}
          onEndRequested={handleEndRequested}
        />
      )}

      {endModalSession && (
        <EndSessionModal
          session={endModalSession}
          onClose={() => setEndModalSession(null)}
          onEnded={handleEnded}
        />
      )}

      {receiptSession && (
        <SessionReceiptModal
          session={receiptSession}
          onClose={() => setReceiptSession(null)}
        />
      )}
    </div>
  );
}
