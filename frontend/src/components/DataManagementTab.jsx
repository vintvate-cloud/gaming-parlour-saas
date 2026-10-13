import { useState, useRef } from "react";
import api from "../utils/api";

export default function DataManagementTab() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedBackup, setParsedBackup] = useState(null);
  const [parseError, setParseError] = useState("");

  const [restrictDates, setRestrictDates] = useState(false);
  const [sessionDateFrom, setSessionDateFrom] = useState("");
  const [sessionDateTo, setSessionDateTo] = useState("");

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState(null);

  const fileInputRef = useRef(null);

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      const res = await api.get("/data/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const today = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const dateLabel = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      link.setAttribute("download", `gaming-parlour-backup-${dateLabel}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError("Could not download the backup file");
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setParseError("");
    setParsedBackup(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json.data) {
          setParseError("This doesn't look like a Gaming Parlour backup file");
          return;
        }
        setParsedBackup(json);
      } catch (err) {
        setParseError("Could not read this file - is it a valid backup .json?");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsedBackup) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const payload = { data: parsedBackup.data };
      if (restrictDates) {
        if (sessionDateFrom) payload.sessionDateFrom = sessionDateFrom;
        if (sessionDateTo) payload.sessionDateTo = sessionDateTo;
      }
      const res = await api.post("/data/import", payload);
      setImportResult(res.data.summary);
      setSelectedFile(null);
      setParsedBackup(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportError(err.response?.data?.error || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const sessionCount = parsedBackup?.data?.sessions?.length || 0;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-panel border border-border rounded-xl p-6">
        <h3 className="font-bold text-white mb-1">Download a Backup</h3>
        <p className="text-xs text-slate-500 mb-4">
          Downloads everything - stations, game types, settings, and every session ever recorded -
          as a single .json file. Keep this somewhere safe.
        </p>
        {exportError && <p className="text-red-400 text-sm mb-3">{exportError}</p>}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
        >
          {exporting ? "Preparing download..." : "⬇ Download Full Backup (.json)"}
        </button>
      </div>

      <div className="bg-panel border border-border rounded-xl p-6">
        <h3 className="font-bold text-white mb-1">Restore from a Backup</h3>
        <p className="text-xs text-slate-500 mb-4">
          For data recovery. This only ADDS data - it never deletes or overwrites anything
          already here. Game types and stations are matched by name and updated; sessions are
          only added if they don't already exist.
        </p>
        {parseError && <p className="text-red-400 text-sm mb-3">{parseError}</p>}
        {importError && <p className="text-red-400 text-sm mb-3">{importError}</p>}

        <label className="block cursor-pointer bg-panelLight border border-border rounded-lg px-3 py-2.5 text-sm text-slate-300 text-center hover:border-slate-500 transition-colors mb-3">
          {selectedFile ? selectedFile.name : "Choose backup file..."}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>

        {parsedBackup && (
          <div className="space-y-3">
            <div className="bg-panelLight rounded-lg p-3 text-xs text-slate-300">
              <p>
                Backup from{" "}
                <span className="text-white font-medium">
                  {new Date(parsedBackup.exportedAt).toLocaleString()}
                </span>
              </p>
              <p className="text-slate-400 mt-1">
                Contains {sessionCount} session{sessionCount !== 1 ? "s" : ""}, {parsedBackup.data.gameTypes?.length || 0}{" "}
                game types, {parsedBackup.data.stations?.length || 0} stations.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={restrictDates}
                onChange={(e) => setRestrictDates(e.target.checked)}
                className="rounded border-border"
              />
              Only import sessions within a specific date range
            </label>

            {restrictDates && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">From</label>
                  <input
                    type="date"
                    value={sessionDateFrom}
                    onChange={(e) => setSessionDateFrom(e.target.value)}
                    className="w-full bg-base border border-border rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">To</label>
                  <input
                    type="date"
                    value={sessionDateTo}
                    onChange={(e) => setSessionDateTo(e.target.value)}
                    className="w-full bg-base border border-border rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing}
              className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
            >
              {importing ? "Restoring..." : "Restore from this Backup"}
            </button>
          </div>
        )}

        {importResult && (
          <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs text-green-300 space-y-0.5">
            <p className="font-semibold">Restore complete:</p>
            <p>
              +{importResult.sessionsAdded} sessions added ({importResult.sessionsSkipped} already
              existed or were outside the date range)
            </p>
            <p>
              {importResult.gameTypesAdded} game types added, {importResult.gameTypesUpdated} updated
            </p>
            <p>
              {importResult.stationsAdded} stations added, {importResult.stationsUpdated} updated
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
