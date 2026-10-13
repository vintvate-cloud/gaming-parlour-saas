import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireOwner);

// GET /api/audit-log - most recent first
router.get("/", async (req, res) => {
  const db = getDb();
  const logs = await db.getAll("auditLog");
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(logs);
});

export default router;
