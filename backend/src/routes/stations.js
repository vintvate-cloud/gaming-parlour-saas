import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { logAction } from "../utils/audit.js";

const router = express.Router();

router.use(requireAuth);

// GET /api/stations - both roles, this powers the dashboard
router.get("/", async (req, res) => {
  const db = getDb();
  const stations = await db.getAll("stations");
  res.json(stations);
});

// POST /api/stations - owner only
router.post("/", requireOwner, async (req, res) => {
  const { name, gameType } = req.body;
  if (!name || !gameType) {
    return res.status(400).json({ error: "Station name and game type are required" });
  }

  const db = getDb();
  const existing = await db.findOne(
    "stations",
    (s) => s.name.toLowerCase() === String(name).toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: "A station with that name already exists" });
  }

  const newStation = await db.insert("stations", {
    name,
    gameType,
    status: "free",
    createdAt: new Date().toISOString(),
  });

  await logAction(req.user, "create_station", `Added station ${name} (${gameType})`);
  res.status(201).json(newStation);
});

// DELETE /api/stations/:id - owner only
router.delete("/:id", requireOwner, async (req, res) => {
  const db = getDb();
  const existing = await db.getById("stations", req.params.id);
  if (!existing) return res.status(404).json({ error: "Station not found" });

  if (existing.status === "busy") {
    return res.status(400).json({ error: "Cannot delete a station with an active session" });
  }

  await db.remove("stations", req.params.id);
  await logAction(req.user, "delete_station", `Deleted station ${existing.name}`);
  res.json({ success: true });
});

export default router;
