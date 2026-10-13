import dotenv from "dotenv";
import { getDb } from "../adapters/index.js";
import { hashPassword } from "./auth.js";

dotenv.config();

const DEFAULT_GRACE_MINUTES = 5;

export async function seed() {
  const db = getDb();

  console.log("Seeding initial data...");

  // --- Owner account ---
  const existingOwner = await db.findOne("users", (u) => u.role === "owner");
  if (!existingOwner) {
    await db.insert("users", {
      name: "Owner",
      username: "owner",
      passwordHash: hashPassword("owner123"),
      role: "owner",
      createdAt: new Date().toISOString(),
    });
    console.log('Created owner login -> username: "owner", password: "owner123"');
    console.log("IMPORTANT: change this password after first login.");
  } else {
    console.log("Owner account already exists, skipping.");
  }

  // --- Global settings (grace period, timeline chart window) ---
  const existingSettings = await db.getById("settings", "global");
  if (!existingSettings) {
    await db.insert("settings", {
      id: "global",
      graceMinutes: DEFAULT_GRACE_MINUTES,
      dayStartHour: 8,
      dayEndHour: 26, // 2 AM next day
      roundDownDefaultEnabled: true,
      dashboardDensity: "compact",
      businessName: "Gaming Parlour",
      appTagline: "Station Management System",
      logoUrl: "",
    });
    console.log(`Created global settings - grace period: ${DEFAULT_GRACE_MINUTES} min, day window: 8AM-2AM`);
  }

  // --- Game types with full billing models ---
  // billingType determines which pricing formula applies (see
  // utils/pricingEngine.js):
  //   player_tiered_minimum - rate depends on player count, 1-hour minimum
  //   tiered_flat_overflow  - ladder of flat fees, then per-minute overflow
  //   simple_hourly         - flat hourly rate, then per-minute overflow
  const gameTypeDefs = [
    {
      name: "PS5",
      maxPlayers: 4,
      rates: { 1: 100, 2: 150, 3: 200, 4: 250 },
      billingModel: { billingType: "player_tiered_minimum" },
    },
    {
      name: "Gaming Room",
      maxPlayers: 4,
      rates: { 1: 150, 2: 200, 3: 250, 4: 300 },
      billingModel: { billingType: "player_tiered_minimum" },
    },
    {
      name: "PC Gaming",
      maxPlayers: 1,
      rates: { 1: 100 },
      billingModel: { billingType: "simple_hourly", hourlyRate: 100 },
    },
    {
      name: "VR",
      maxPlayers: 1,
      rates: { 1: 300 },
      billingModel: {
        billingType: "tiered_flat_overflow",
        tiers: [
          { upToMinutes: 15, flatFee: 100 },
          { upToMinutes: 30, flatFee: 200 },
          { upToMinutes: 60, flatFee: 300 },
        ],
        overflowHourlyRate: 300,
      },
    },
    {
      name: "Car Simulator",
      maxPlayers: 1,
      rates: { 1: 300 },
      billingModel: {
        billingType: "tiered_flat_overflow",
        tiers: [
          { upToMinutes: 30, flatFee: 200 },
          { upToMinutes: 60, flatFee: 300 },
        ],
        overflowHourlyRate: 300,
      },
    },
    {
      name: "Pool Table",
      maxPlayers: 1,
      rates: { 1: 150 },
      billingModel: {
        billingType: "tiered_flat_overflow",
        tiers: [{ upToMinutes: 40, flatFee: 100 }],
        overflowHourlyRate: 150,
      },
    },
  ];

  for (const def of gameTypeDefs) {
    const exists = await db.findOne("gameTypes", (g) => g.name === def.name);
    if (!exists) {
      await db.insert("gameTypes", { ...def, createdAt: new Date().toISOString() });
      console.log(`Created game type: ${def.name}`);
    }
  }

  // --- Stations: 8 PS5 screens, 5 PCs, 1 each of Car Sim/VR/Pool/Gaming Room ---
  const stationDefs = [
    ...Array.from({ length: 8 }, (_, i) => ({
      name: `PS5 Screen ${i + 1}`,
      gameType: "PS5",
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `PC ${i + 1}`,
      gameType: "PC Gaming",
    })),
    { name: "VR Station", gameType: "VR" },
    { name: "Car Simulator", gameType: "Car Simulator" },
    { name: "Pool Table", gameType: "Pool Table" },
    { name: "Gaming Room", gameType: "Gaming Room" },
  ];

  for (const def of stationDefs) {
    const exists = await db.findOne("stations", (s) => s.name === def.name);
    if (!exists) {
      await db.insert("stations", {
        ...def,
        status: "free",
        createdAt: new Date().toISOString(),
      });
      console.log(`Created station: ${def.name}`);
    }
  }

  console.log("Seeding complete.");
}

// Only auto-run when this file is executed directly (`npm run seed`) -
// when imported as a module (by server.js, to auto-seed on startup), the
// caller decides when to call seed() instead.
const isMainModule = process.argv[1] && process.argv[1].endsWith("seed.js");
if (isMainModule) {
  seed().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}
