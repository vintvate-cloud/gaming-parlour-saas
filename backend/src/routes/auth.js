import express from "express";
import { getDb } from "../adapters/index.js";
import { verifyPassword, signToken } from "../utils/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { logAction } from "../utils/audit.js";

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const db = getDb();
  const user = await db.findOne(
    "users",
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect username or password" });
  }

  const payload = { id: user.id, name: user.name, username: user.username, role: user.role };
  const token = signToken(payload);

  await logAction(payload, "login", `${user.name} logged in`);

  res.json({ token, user: payload });
});

// GET /api/auth/me - lets the frontend re-validate a stored token on app load
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
