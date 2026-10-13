import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import stationRoutes from "./routes/stations.js";
import gameTypeRoutes from "./routes/gameTypes.js";
import sessionRoutes from "./routes/sessions.js";
import analyticsRoutes from "./routes/analytics.js";
import historyRoutes from "./routes/history.js";
import auditLogRoutes from "./routes/auditLog.js";
import settingsRoutes from "./routes/settings.js";
import dataBackupRoutes from "./routes/dataBackup.js";
import { seed } from "./utils/seed.js";
import { getDb } from "./adapters/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);
app.use(express.json({ limit: "5mb" })); // generous limit - logo uploads are base64 data URLs

// GET / - a plain confirmation that the API is up, so visiting the bare
// Render URL in a browser shows something useful instead of "Cannot GET /"
// (which previously made it look like the whole deploy had failed, even
// when the API itself was working fine under /api/*).
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Gaming Parlour API is running. The frontend app lives at a separate URL (Vercel).",
    health: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dbProvider: process.env.DB_PROVIDER || "local" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stations", stationRoutes);
app.use("/api/game-types", gameTypeRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/audit-log", auditLogRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/data", dataBackupRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

async function start() {
  const dbProvider = (process.env.DB_PROVIDER || "local").toLowerCase();

  // Print exactly what's configured BEFORE attempting to connect, so a
  // misconfigured deployment (e.g. DB_PROVIDER=mongo but MONGODB_URI
  // unset) shows a clear, immediate reason in the Render logs instead of
  // a vague crash or - worse - a silently empty database that makes
  // login fail with no obvious explanation.
  console.log("--- Gaming Parlour backend starting ---");
  console.log(`DB_PROVIDER: ${dbProvider}`);
  if (dbProvider === "mongo") {
    console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? "set" : "MISSING - this will fail"}`);
  }
  console.log(`CORS_ORIGIN: ${process.env.CORS_ORIGIN || "* (not set, defaulting to allow all)"}`);
  console.log(`PORT: ${PORT}`);

  if (dbProvider === "mongo" && !process.env.MONGODB_URI) {
    console.error(
      "FATAL: DB_PROVIDER=mongo but MONGODB_URI is not set. Add it in your hosting " +
        "provider's environment variables and redeploy."
    );
    process.exit(1);
  }

  try {
    // Auto-seed on every startup if the database is empty. This is what
    // makes a fresh deployment work out of the box: Render's free tier
    // doesn't give shell access, so "run npm run seed manually" isn't
    // always possible - seeding here means a brand new MongoDB database
    // gets its owner login and default game types/stations automatically
    // the first time the server boots, with no manual step required.
    // seed() is fully idempotent (checks before inserting anything), so
    // this is also safe to run on every subsequent restart.
    const db = getDb();
    const existingUsers = await db.getAll("users");
    if (existingUsers.length === 0) {
      console.log("No users found - running first-time setup (seeding)...");
      await seed();
    } else {
      console.log(`Database already has ${existingUsers.length} user(s) - skipping seed.`);
    }
  } catch (err) {
    console.error("FATAL: could not connect to the database on startup:", err.message);
    console.error(
      "If using MongoDB, double-check MONGODB_URI is correct and that your Atlas " +
        "cluster's Network Access allows connections from anywhere (0.0.0.0/0)."
    );
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Gaming Parlour backend running on port ${PORT}`);
    console.log("--- Startup complete ---");
  });
}

start();
