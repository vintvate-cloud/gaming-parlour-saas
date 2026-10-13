import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { logAction } from "../utils/audit.js";

const router = express.Router();

router.use(requireAuth, requireOwner); // both routes are owner-only

const EXPORT_VERSION = 1;

// GET /api/data/export - a full JSON backup of every collection. Password
// hashes are stripped from users (a backup file shouldn't carry
// credentials, even hashed ones - if it leaked, that's still an attack
// surface for offline cracking).
router.get("/export", async (req, res) => {
  const db = getDb();
  const [users, stations, gameTypes, sessions, settingsDoc] = await Promise.all([
    db.getAll("users"),
    db.getAll("stations"),
    db.getAll("gameTypes"),
    db.getAll("sessions"),
    db.getById("settings", "global"),
  ]);

  const sanitizedUsers = users.map(({ passwordHash, ...rest }) => rest);

  const exportData = {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: req.user.name,
    data: {
      users: sanitizedUsers,
      stations,
      gameTypes,
      sessions,
      settings: settingsDoc,
    },
  };

  await logAction(req.user, "data_export", `Exported a full backup (${sessions.length} sessions)`);

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="gaming-parlour-backup-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.send(JSON.stringify(exportData, null, 2));
});

// POST /api/data/import - restores from a previously-exported JSON file.
// Body: { data: <the "data" object from an export file>, sessionDateFrom?,
//   sessionDateTo? }
//
// This is a MERGE, never a wipe:
//   - sessions are inserted only if their id doesn't already exist
//     (existing sessions are never overwritten, since that could clobber
//     newer data with stale data from an old backup)
//   - gameTypes/stations are upserted by name (update if a station/type
//     with that name exists, insert if not)
//   - settings are only applied if none exist yet (never silently
//     overwrites live settings)
//   - users are NEVER imported (passwords aren't in the export, and
//     blindly recreating user accounts from a backup is a bad idea -
//     manage users via the Users page instead)
//
// sessionDateFrom/sessionDateTo (both optional, YYYY-MM-DD) let the owner
// restore only a specific date range of sessions rather than everything
// in the file, per the requirement to choose which dates to bring back.
router.post("/import", async (req, res) => {
  const { data, sessionDateFrom, sessionDateTo } = req.body;

  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "No valid backup data provided" });
  }

  const db = getDb();
  const summary = {
    stationsAdded: 0,
    stationsUpdated: 0,
    gameTypesAdded: 0,
    gameTypesUpdated: 0,
    sessionsAdded: 0,
    sessionsSkipped: 0,
    settingsApplied: false,
  };

  // --- Game types: upsert by name ---
  for (const gt of data.gameTypes || []) {
    const existing = await db.findOne("gameTypes", (g) => g.name === gt.name);
    if (existing) {
      await db.update("gameTypes", existing.id, {
        maxPlayers: gt.maxPlayers,
        rates: gt.rates,
        billingModel: gt.billingModel,
      });
      summary.gameTypesUpdated++;
    } else {
      const { id, ...rest } = gt;
      await db.insert("gameTypes", rest);
      summary.gameTypesAdded++;
    }
  }

  // --- Stations: upsert by name ---
  for (const st of data.stations || []) {
    const existing = await db.findOne("stations", (s) => s.name === st.name);
    if (existing) {
      await db.update("stations", existing.id, { gameType: st.gameType });
      summary.stationsUpdated++;
    } else {
      const { id, status, ...rest } = st;
      await db.insert("stations", { ...rest, status: "free" });
      summary.stationsAdded++;
    }
  }

  // --- Settings: only if none exist yet, never overwrite live settings ---
  const existingSettings = await db.getById("settings", "global");
  if (!existingSettings && data.settings) {
    const { id, ...rest } = data.settings;
    await db.insert("settings", { id: "global", ...rest });
    summary.settingsApplied = true;
  }

  // --- Sessions: insert-only (never overwrite), optionally date-filtered ---
  const fromMs = sessionDateFrom ? new Date(`${sessionDateFrom}T00:00:00+05:30`).getTime() : null;
  const toMs = sessionDateTo ? new Date(`${sessionDateTo}T23:59:59.999+05:30`).getTime() : null;

  for (const session of data.sessions || []) {
    const segs = session.segments || [];
    const sessionEndIso = segs.length
      ? segs[segs.length - 1].endTime || segs[segs.length - 1].startTime
      : session.createdAt;
    const sessionEndMs = new Date(sessionEndIso).getTime();

    if (fromMs !== null && sessionEndMs < fromMs) {
      summary.sessionsSkipped++;
      continue;
    }
    if (toMs !== null && sessionEndMs > toMs) {
      summary.sessionsSkipped++;
      continue;
    }

    const existing = await db.getById("sessions", session.id);
    if (existing) {
      summary.sessionsSkipped++;
      continue;
    }

    await db.insert("sessions", session);
    summary.sessionsAdded++;
  }

  await logAction(
    req.user,
    "data_import",
    `Imported backup: +${summary.sessionsAdded} sessions, +${summary.gameTypesAdded}/${summary.gameTypesUpdated} game types added/updated, +${summary.stationsAdded}/${summary.stationsUpdated} stations added/updated`
  );

  res.json({ success: true, summary });
});

export default router;
