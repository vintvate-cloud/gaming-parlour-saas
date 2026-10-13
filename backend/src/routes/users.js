import express from "express";
import { getDb } from "../adapters/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../utils/auth.js";
import { logAction } from "../utils/audit.js";

const router = express.Router();

router.use(requireAuth);

// POST /api/users/change-password - any logged-in user (owner or
// employee) changes their OWN password. Requires the current password as
// proof, same as any normal "change password" flow.
router.post("/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are both required" });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: "New password must be at least 4 characters" });
  }

  const db = getDb();
  const user = await db.getById("users", req.user.id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  await db.update("users", user.id, { passwordHash: hashPassword(newPassword) });
  await logAction(req.user, "change_own_password", `${user.name} changed their own password`);

  res.json({ success: true });
});

// All routes below require an owner
router.use(requireOwner);

// GET /api/users - list all users (password hashes never sent to client)
router.get("/", async (req, res) => {
  const db = getDb();
  const users = await db.getAll("users");
  const safe = users.map(({ passwordHash, ...rest }) => rest);
  res.json(safe);
});

// POST /api/users - create a new employee or owner login
router.post("/", async (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Name, username and password are required" });
  }

  const db = getDb();
  const existing = await db.findOne(
    "users",
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: "That username is already taken" });
  }

  const newUser = await db.insert("users", {
    name,
    username,
    passwordHash: hashPassword(password),
    role: role === "owner" ? "owner" : "employee",
    createdAt: new Date().toISOString(),
  });

  await logAction(req.user, "create_user", `Created ${newUser.role} account for ${name}`);

  const { passwordHash, ...safe } = newUser;
  res.status(201).json(safe);
});

// POST /api/users/:id/reset-password - owner generates a temporary
// password for an employee who's forgotten theirs. Returns the new plain
// password ONCE in the response (never stored or logged in plain text)
// so the owner can hand it to the employee directly; the employee should
// change it via change-password afterward.
router.post("/:id/reset-password", async (req, res) => {
  const db = getDb();
  const target = await db.getById("users", req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });

  // Generate a short, easy-to-read temporary password (e.g. "gp-4f8k2x")
  // rather than a long random string, since this needs to be read aloud
  // or typed by hand at the counter.
  const tempPassword = "gp-" + Math.random().toString(36).slice(2, 8);

  await db.update("users", target.id, { passwordHash: hashPassword(tempPassword) });
  await logAction(req.user, "reset_password", `Reset password for ${target.name} (${target.role})`);

  res.json({ success: true, temporaryPassword: tempPassword, username: target.username });
});

// DELETE /api/users/:id - remove an employee who has left
router.delete("/:id", async (req, res) => {
  const db = getDb();
  const target = await db.getById("users", req.params.id);

  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account while logged in" });
  }

  await db.remove("users", req.params.id);
  await logAction(req.user, "delete_user", `Removed account for ${target.name}`);

  res.json({ success: true });
});

export default router;
