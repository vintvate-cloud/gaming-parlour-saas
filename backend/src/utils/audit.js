import { getDb } from "../adapters/index.js";

/**
 * Records who did what and when. Called from routes after any
 * create/update/delete that matters for back-tracking, per the
 * requirement that all entries be traceable to an employee.
 */
export async function logAction(user, action, details = "") {
  const db = getDb();
  await db.insert("auditLog", {
    timestamp: new Date().toISOString(),
    employeeId: user?.id || "unknown",
    employeeName: user?.name || "unknown",
    action,
    details: typeof details === "string" ? details : JSON.stringify(details),
  });
}
