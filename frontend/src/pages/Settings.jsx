import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import GameTypeCard from "../components/GameTypeCard";
import AddGameTypeForm from "../components/AddGameTypeForm";
import DataManagementTab from "../components/DataManagementTab";
import api from "../utils/api";

function GeneralTab({ settings, reload }) {
  const [graceMinutes, setGraceMinutes] = useState(settings.graceMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [dayStartHour, setDayStartHour] = useState(settings.dayStartHour ?? 8);
  const [dayEndHour, setDayEndHour] = useState(settings.dayEndHour ?? 26);
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState("");
  const [windowSaved, setWindowSaved] = useState(false);

  const [roundDownDefaultEnabled, setRoundDownDefaultEnabled] = useState(
    settings.roundDownDefaultEnabled !== false
  );
  const [savingRoundDown, setSavingRoundDown] = useState(false);

  const [dashboardDensity, setDashboardDensity] = useState(settings.dashboardDensity || "compact");
  const [savingDensity, setSavingDensity] = useState(false);

  const [businessName, setBusinessName] = useState(settings.businessName || "Gaming Parlour");
  const [appTagline, setAppTagline] = useState(settings.appTagline || "Station Management System");
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || "");
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingError, setBrandingError] = useState("");
  const [brandingSaved, setBrandingSaved] = useState(false);

  async function toggleRoundDownDefault() {
    const next = !roundDownDefaultEnabled;
    setRoundDownDefaultEnabled(next);
    setSavingRoundDown(true);
    try {
      await api.put("/settings", { roundDownDefaultEnabled: next });
      await reload();
    } catch (err) {
      setRoundDownDefaultEnabled(!next); // revert on failure
    } finally {
      setSavingRoundDown(false);
    }
  }

  async function changeDensity(value) {
    setDashboardDensity(value);
    setSavingDensity(true);
    try {
      await api.put("/settings", { dashboardDensity: value });
      await reload();
    } finally {
      setSavingDensity(false);
    }
  }

  function handleLogoFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setBrandingError("Please choose an image file (PNG, JPG, etc.)");
      e.target.value = ""; // reset so selecting the same invalid file again still fires onChange
      return;
    }
    if (file.size > 1_500_000) {
      setBrandingError(
        `That image is ${(file.size / 1_000_000).toFixed(1)}MB - please choose one under 1.5MB`
      );
      e.target.value = "";
      return;
    }

    setBrandingError("");
    const reader = new FileReader();
    reader.onerror = () => {
      setBrandingError("Could not read that image file - please try a different one");
    };
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoUrl(reader.result);
      } else {
        setBrandingError("Could not read that image file - please try a different one");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveBranding() {
    setSavingBranding(true);
    setBrandingError("");
    setBrandingSaved(false);
    try {
      await api.put("/settings", { businessName, appTagline, logoUrl });
      await reload();
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } catch (err) {
      const serverMessage = err.response?.data?.error;
      const statusInfo = err.response?.status ? ` (status ${err.response.status})` : "";
      setBrandingError(serverMessage || `Could not save branding${statusInfo} - please try again`);
    } finally {
      setSavingBranding(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.put("/settings", { graceMinutes: Number(graceMinutes) });
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWindow() {
    setSavingWindow(true);
    setWindowError("");
    setWindowSaved(false);
    try {
      await api.put("/settings", {
        dayStartHour: Number(dayStartHour),
        dayEndHour: Number(dayEndHour),
      });
      await reload();
      setWindowSaved(true);
      setTimeout(() => setWindowSaved(false), 2000);
    } catch (err) {
      setWindowError(err.response?.data?.error || "Could not save settings");
    } finally {
      setSavingWindow(false);
    }
  }

  // Hours 0-47 so the end-hour select can express "past midnight" times
  // (e.g. 26 = 2 AM the next day), matching how a gaming parlour's day
  // actually runs past midnight.
  const hourOptions = Array.from({ length: 48 }, (_, h) => h);
  function hourLabel(h) {
    const dayLabel = h >= 24 ? " (+1 day)" : "";
    const hour12 = h % 24;
    const period = hour12 < 12 ? "AM" : "PM";
    const display = hour12 % 12 === 0 ? 12 : hour12 % 12;
    return `${display}:00 ${period}${dayLabel}`;
  }

  return (
    <div className="space-y-6 max-w-md">
      <div className="bg-panel border border-border rounded-xl p-6">
        <h3 className="font-bold text-white mb-1">Grace Period</h3>
        <p className="text-xs text-slate-500 mb-4">
          Extra minutes allowed past a time boundary before the next pricing tier kicks in.
          Applies to every game type.
        </p>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            value={graceMinutes}
            onChange={(e) => setGraceMinutes(e.target.value)}
            className="w-24 bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white text-center font-bold"
          />
          <span className="text-slate-400 text-sm">minutes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-xl p-6">
        <h3 className="font-bold text-white mb-1">Timeline Chart Window</h3>
        <p className="text-xs text-slate-500 mb-4">
          The business-hours range shown on the Analytics station timeline chart.
        </p>
        {windowError && <p className="text-red-400 text-sm mb-3">{windowError}</p>}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Start</label>
            <select
              value={dayStartHour}
              onChange={(e) => setDayStartHour(e.target.value)}
              className="w-full bg-panelLight border border-border rounded-lg px-2 py-2 text-white text-sm"
            >
              {hourOptions.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">End</label>
            <select
              value={dayEndHour}
              onChange={(e) => setDayEndHour(e.target.value)}
              className="w-full bg-panelLight border border-border rounded-lg px-2 py-2 text-white text-sm"
            >
              {hourOptions.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleSaveWindow}
          disabled={savingWindow}
          className="w-full bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
        >
          {savingWindow ? "Saving..." : windowSaved ? "✓ Saved" : "Save"}
        </button>
      </div>

      <div className="bg-panel border border-border rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white mb-1">Round Down by Default</h3>
            <p className="text-xs text-slate-500">
              Pre-fills the End Session screen with round-down-to-₹10 switched on.
              Employees can still turn it off per session.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleRoundDownDefault}
            disabled={savingRoundDown}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ml-4 ${
              roundDownDefaultEnabled ? "bg-accent" : "bg-panelLight border border-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                roundDownDefaultEnabled ? "translate-x-6" : ""
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-xl p-6">
        <h3 className="font-bold text-white mb-1">Dashboard Card Size</h3>
        <p className="text-xs text-slate-500 mb-4">
          Compact fits the most stations on screen. Mid shows short names with game/rate/time but
          stays roomy. Comfortable shows full detail including customer name.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => changeDensity("compact")}
            disabled={savingDensity}
            className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
              dashboardDensity === "compact"
                ? "bg-accent text-white"
                : "bg-panelLight text-slate-300 border border-border"
            }`}
          >
            Compact
          </button>
          <button
            onClick={() => changeDensity("mid")}
            disabled={savingDensity}
            className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
              dashboardDensity === "mid"
                ? "bg-accent text-white"
                : "bg-panelLight text-slate-300 border border-border"
            }`}
          >
            Mid
          </button>
          <button
            onClick={() => changeDensity("comfortable")}
            disabled={savingDensity}
            className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
              dashboardDensity === "comfortable"
                ? "bg-accent text-white"
                : "bg-panelLight text-slate-300 border border-border"
            }`}
          >
            Comfortable
          </button>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-xl p-6">
        <h3 className="font-bold text-white mb-1">Branding</h3>
        <p className="text-xs text-slate-500 mb-4">
          Your business name, app subtitle, and logo - used throughout the app and on receipts.
        </p>
        {brandingError && <p className="text-red-400 text-sm mb-3">{brandingError}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Business Name</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g., Infinity Gaming"
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">App Subtitle</label>
            <input
              value={appTagline}
              onChange={(e) => setAppTagline(e.target.value)}
              placeholder="e.g., Station Management System"
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Logo</label>
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="w-12 h-12 rounded-lg object-contain bg-panelLight border border-border"
                />
              )}
              <label className="flex-1 cursor-pointer bg-panelLight border border-border rounded-lg px-3 py-2.5 text-sm text-slate-300 text-center hover:border-slate-500 transition-colors">
                {logoUrl ? "Change image" : "Upload image"}
                <input type="file" accept="image/*" onChange={handleLogoFileChange} className="hidden" />
              </label>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="text-red-400 hover:text-red-300 text-sm px-2"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <button
            onClick={handleSaveBranding}
            disabled={savingBranding}
            className="w-full bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
          >
            {savingBranding ? "Saving..." : brandingSaved ? "✓ Saved" : "Save Branding"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GameTypesTab({ gameTypes, reload }) {
  async function handleSave(id, { rates, billingModel }) {
    await api.put(`/game-types/${id}`, { rates, billingModel });
    await reload();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this game type? Stations using it must be removed first.")) return;
    try {
      await api.delete(`/game-types/${id}`);
      reload();
    } catch (err) {
      alert(err.response?.data?.error || "Could not delete");
    }
  }

  return (
    <>
      <AddGameTypeForm onAdded={reload} />
      <div className="space-y-4">
        {gameTypes.map((gt) => (
          <GameTypeCard key={gt.id} gameType={gt} onSave={handleSave} onDelete={handleDelete} />
        ))}
      </div>
    </>
  );
}

function StationsTab({ stations, gameTypes, reload }) {
  const [name, setName] = useState("");
  const [gameType, setGameType] = useState("");
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/stations", { name, gameType });
      setName("");
      setGameType("");
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Could not add station");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this station?")) return;
    try {
      await api.delete(`/stations/${id}`);
      reload();
    } catch (err) {
      alert(err.response?.data?.error || "Could not delete");
    }
  }

  return (
    <>
      <div className="bg-panel border border-border rounded-xl p-6 mb-6">
        <h3 className="font-bold text-white mb-4">Add New Station</h3>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Station Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., PS5 Screen 9, PC 6"
              required
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Game Type</label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              required
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            >
              <option value="">Select game type</option>
              {gameTypes.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"
            >
              + Add Station
            </button>
          </div>
        </form>
      </div>

      <div>
        <h3 className="font-bold text-white mb-4">Existing Stations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((s) => (
            <div key={s.id} className="bg-panel border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-white">{s.name}</p>
                  <p className="text-sm text-slate-400">{s.gameType}</p>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-lg p-2"
                >
                  🗑
                </button>
              </div>
              <span
                className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                  s.status === "free"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-accent/20 text-accent"
                }`}
              >
                {s.status === "free" ? "Available" : "Busy"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Settings() {
  const [tab, setTab] = useState("general");
  const [gameTypes, setGameTypes] = useState([]);
  const [stations, setStations] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [gtRes, stRes, settingsRes] = await Promise.all([
      api.get("/game-types"),
      api.get("/stations"),
      api.get("/settings"),
    ]);
    setGameTypes(gtRes.data);
    setStations(stRes.data);
    setSettings(settingsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tabs = [
    { id: "general", label: "General" },
    { id: "gametypes", label: "Game Types & Rates" },
    { id: "stations", label: "Stations Management" },
    { id: "data", label: "Data Backup" },
  ];

  return (
    <div className="min-h-screen bg-base">
      <Navbar />
      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-5 sm:mb-6">Settings</h1>

        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                tab === t.id ? "bg-accent text-white" : "bg-panelLight text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : tab === "general" ? (
          <GeneralTab settings={settings} reload={load} />
        ) : tab === "gametypes" ? (
          <GameTypesTab gameTypes={gameTypes} reload={load} />
        ) : tab === "stations" ? (
          <StationsTab stations={stations} gameTypes={gameTypes} reload={load} />
        ) : (
          <DataManagementTab />
        )}
      </main>
    </div>
  );
}
