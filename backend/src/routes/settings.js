import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { logAction } from "../utils/audit.js";

const router = express.Router();

// NOTE: no blanket auth middleware here. GET is intentionally public -
// it only exposes non-sensitive display/billing-config fields (grace
// period, branding name/logo, dashboard density), never customer or
// financial data - and the Login screen needs to show branding (business
// name, logo) before a user has logged in. PUT is still fully protected,
// just on the route itself rather than via router.use().

const DEFAULT_GRACE_MINUTES = 5;
// Timeline chart default window: 8 AM to 2 AM the next day (18 hours),
// matching the example given for the busy/free station chart.
const DEFAULT_DAY_START_HOUR = 8;
const DEFAULT_DAY_END_HOUR = 26; // 2 AM next day, expressed as hour 26
const DEFAULT_ROUND_DOWN_ENABLED = true;
const DEFAULT_DASHBOARD_DENSITY = "compact";
const DEFAULT_BUSINESS_NAME = "Gaming Parlour";
const DEFAULT_APP_TAGLINE = "Station Management System";

async function getOrCreateSettings(db) {
  let settings = await db.getById("settings", "global");
  if (!settings) {
    settings = await db.insert("settings", {
      id: "global",
      graceMinutes: DEFAULT_GRACE_MINUTES,
      dayStartHour: DEFAULT_DAY_START_HOUR,
      dayEndHour: DEFAULT_DAY_END_HOUR,
      roundDownDefaultEnabled: DEFAULT_ROUND_DOWN_ENABLED,
      dashboardDensity: DEFAULT_DASHBOARD_DENSITY,
      businessName: DEFAULT_BUSINESS_NAME,
      appTagline: DEFAULT_APP_TAGLINE,
      logoUrl: "",
    });
  }
  // Backfill for settings rows created before newer fields existed.
  const backfill = {};
  if (settings.dayStartHour === undefined) backfill.dayStartHour = DEFAULT_DAY_START_HOUR;
  if (settings.dayEndHour === undefined) backfill.dayEndHour = DEFAULT_DAY_END_HOUR;
  if (settings.roundDownDefaultEnabled === undefined) {
    backfill.roundDownDefaultEnabled = DEFAULT_ROUND_DOWN_ENABLED;
  }
  if (settings.dashboardDensity === undefined) backfill.dashboardDensity = DEFAULT_DASHBOARD_DENSITY;
  if (settings.businessName === undefined) backfill.businessName = DEFAULT_BUSINESS_NAME;
  if (settings.appTagline === undefined) backfill.appTagline = DEFAULT_APP_TAGLINE;
  if (settings.logoUrl === undefined) backfill.logoUrl = "";
  if (Object.keys(backfill).length > 0) {
    settings = await db.update("settings", "global", backfill);
  }
  return settings;
}

// GET /api/settings - readable by both roles (the grace period, round-down
// default, and branding all affect what employees see too)
router.get("/", async (req, res) => {
  const db = getDb();
  const settings = await getOrCreateSettings(db);
  res.json(settings);
});

// PUT /api/settings - owner only
router.put("/", requireAuth, requireOwner, async (req, res) => {
  const {
    graceMinutes,
    dayStartHour,
    dayEndHour,
    roundDownDefaultEnabled,
    dashboardDensity,
    businessName,
    appTagline,
    logoUrl,
  } = req.body;
  const patch = {};

  if (graceMinutes !== undefined) {
    if (Number(graceMinutes) < 0) {
      return res.status(400).json({ error: "Grace minutes must be a non-negative number" });
    }
    patch.graceMinutes = Number(graceMinutes);
  }
  if (dayStartHour !== undefined) {
    if (Number(dayStartHour) < 0 || Number(dayStartHour) > 23) {
      return res.status(400).json({ error: "Day start hour must be between 0 and 23" });
    }
    patch.dayStartHour = Number(dayStartHour);
  }
  if (dayEndHour !== undefined) {
    // Allowed to exceed 24 (e.g. 26 = 2 AM the next day) so the window can
    // cross midnight, matching how a gaming parlour's day actually runs.
    if (Number(dayEndHour) < 0 || Number(dayEndHour) > 48) {
      return res.status(400).json({ error: "Day end hour must be between 0 and 48" });
    }
    patch.dayEndHour = Number(dayEndHour);
  }
  if (roundDownDefaultEnabled !== undefined) {
    patch.roundDownDefaultEnabled = Boolean(roundDownDefaultEnabled);
  }
  if (dashboardDensity !== undefined) {
    if (!["compact", "mid", "comfortable"].includes(dashboardDensity)) {
      return res.status(400).json({ error: "dashboardDensity must be 'compact', 'mid', or 'comfortable'" });
    }
    patch.dashboardDensity = dashboardDensity;
  }
  if (businessName !== undefined) patch.businessName = String(businessName).slice(0, 60);
  if (appTagline !== undefined) patch.appTagline = String(appTagline).slice(0, 80);
  if (logoUrl !== undefined) {
    // Logos are stored as base64 data URLs (no separate file storage
    // needed), so this needs to be generous - capped at ~2MB of base64
    // text, which comfortably covers a reasonably-sized logo image while
    // still preventing someone from storing something absurd.
    if (String(logoUrl).length > 2_000_000) {
      return res.status(400).json({ error: "Logo image is too large - please use a smaller image" });
    }
    patch.logoUrl = String(logoUrl);
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No valid settings provided" });
  }

  const db = getDb();
  await getOrCreateSettings(db); // ensure the row exists before updating
  const updated = await db.update("settings", "global", patch);

  await logAction(req.user, "update_settings", `Updated settings: ${JSON.stringify(patch)}`);
  res.json(updated);
});

export default router;
