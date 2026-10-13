import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { logAction } from "../utils/audit.js";

const router = express.Router();

router.use(requireAuth);

// GET /api/game-types - readable by both owner and employee (needed for the start-session form)
router.get("/", async (req, res) => {
  const db = getDb();
  const types = await db.getAll("gameTypes");
  res.json(types);
});

const VALID_BILLING_TYPES = ["player_tiered_minimum", "tiered_flat_overflow", "simple_hourly"];

function validateBillingModel(billingModel) {
  if (!billingModel || !billingModel.billingType) {
    return "A billing model with a billingType is required";
  }
  if (!VALID_BILLING_TYPES.includes(billingModel.billingType)) {
    return `billingType must be one of: ${VALID_BILLING_TYPES.join(", ")}`;
  }
  if (billingModel.billingType === "tiered_flat_overflow") {
    if (!Array.isArray(billingModel.tiers) || billingModel.tiers.length === 0) {
      return "tiered_flat_overflow requires at least one tier";
    }
    if (!billingModel.overflowHourlyRate) {
      return "tiered_flat_overflow requires an overflowHourlyRate";
    }
  }
  if (billingModel.billingType === "simple_hourly" && !billingModel.hourlyRate) {
    return "simple_hourly requires an hourlyRate";
  }
  return null;
}

// POST /api/game-types - owner only
router.post("/", requireOwner, async (req, res) => {
  const { name, maxPlayers, rates, billingModel } = req.body;

  if (!name || !maxPlayers || !rates) {
    return res.status(400).json({ error: "Name, max players and rates are required" });
  }

  const billingError = validateBillingModel(billingModel);
  if (billingError) {
    return res.status(400).json({ error: billingError });
  }

  const db = getDb();
  const existing = await db.findOne(
    "gameTypes",
    (g) => g.name.toLowerCase() === String(name).toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: "A game type with that name already exists" });
  }

  const newType = await db.insert("gameTypes", {
    name,
    maxPlayers: Number(maxPlayers),
    rates, // object like { "1": 120, "2": 150 }
    billingModel,
    createdAt: new Date().toISOString(),
  });

  await logAction(req.user, "create_game_type", `Added game type ${name}`);
  res.status(201).json(newType);
});

// PUT /api/game-types/:id - owner only, edit rates/max players/billing model
router.put("/:id", requireOwner, async (req, res) => {
  const { name, maxPlayers, rates, billingModel } = req.body;
  const db = getDb();

  const existing = await db.getById("gameTypes", req.params.id);
  if (!existing) return res.status(404).json({ error: "Game type not found" });

  if (billingModel !== undefined) {
    const billingError = validateBillingModel(billingModel);
    if (billingError) {
      return res.status(400).json({ error: billingError });
    }
  }

  const updated = await db.update("gameTypes", req.params.id, {
    ...(name !== undefined && { name }),
    ...(maxPlayers !== undefined && { maxPlayers: Number(maxPlayers) }),
    ...(rates !== undefined && { rates }),
    ...(billingModel !== undefined && { billingModel }),
  });

  await logAction(req.user, "update_game_type", `Updated game type ${existing.name}`);
  res.json(updated);
});

// DELETE /api/game-types/:id - owner only
router.delete("/:id", requireOwner, async (req, res) => {
  const db = getDb();
  const existing = await db.getById("gameTypes", req.params.id);
  if (!existing) return res.status(404).json({ error: "Game type not found" });

  const stationsUsingIt = await db.findOne("stations", (s) => s.gameType === existing.name);
  if (stationsUsingIt) {
    return res.status(400).json({
      error: `Cannot delete "${existing.name}" - it is still assigned to one or more stations`,
    });
  }

  await db.remove("gameTypes", req.params.id);
  await logAction(req.user, "delete_game_type", `Deleted game type ${existing.name}`);
  res.json({ success: true });
});

export default router;
