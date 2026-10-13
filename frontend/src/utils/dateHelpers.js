// IMPORTANT: never use `date.toISOString().split("T")[0]` for "today's
// date" in this app - toISOString() always converts to UTC first, which
// silently shows the WRONG calendar date for any user east of UTC (e.g.
// India, UTC+5:30) during the early hours of the morning - roughly
// midnight to 5:30 AM IST is still "yesterday" in UTC. Every date-only
// helper in this file works in the browser's LOCAL time instead.

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Today's date as YYYY-MM-DD, in the browser's local timezone. */
export function todayStr() {
  return toDateStr(new Date());
}

/** Formats any Date object as YYYY-MM-DD in local time. */
export function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formats "now" as YYYY-MM-DD-HHmm in local time, safe for filenames. */
export function downloadTimestamp() {
  const d = new Date();
  return `${toDateStr(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Formats a Date as HHmm in local time, for receipt in/out times. */
export function toTimeStr(date) {
  return `${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Strips characters that don't play well in filenames across OSes. */
export function sanitizeForFilename(text) {
  return String(text)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}
