import { verifyToken } from "../utils/auth.js";

/**
 * Verifies the JWT on every protected request and attaches the decoded
 * user info to req.user. The employeeName/employeeId used for audit
 * trails throughout the app is ALWAYS read from req.user (server-side
 * trusted), never from the request body, so a client can't spoof who
 * performed an action.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No authentication token provided" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, name, username, role }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session, please log in again" });
  }
}

/**
 * Restricts a route to the "owner" role only. Use after requireAuth.
 */
export function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "This action requires owner access" });
  }
  next();
}
