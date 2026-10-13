import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, "..", "data", "db.json");

// Collections that exist in our data model
const COLLECTIONS = ["users", "stations", "gameTypes", "sessions", "auditLog", "settings"];

function ensureDbFile() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = {};
    COLLECTIONS.forEach((c) => (empty[c] = []));
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/**
 * LocalAdapter implements the same interface as SheetsAdapter so the
 * rest of the app never knows which storage backend is active.
 *
 * Interface contract (all methods async to match SheetsAdapter):
 *  - getAll(collection) -> array of row objects
 *  - getById(collection, id) -> row object or null
 *  - insert(collection, row) -> inserted row (with generated id if missing)
 *  - update(collection, id, patch) -> updated row or null
 *  - remove(collection, id) -> boolean (true if removed)
 *  - findOne(collection, predicateFn) -> row object or null
 */
class LocalAdapter {
  async getAll(collection) {
    const db = readDb();
    return db[collection] || [];
  }

  async getById(collection, id) {
    const db = readDb();
    return (db[collection] || []).find((r) => r.id === id) || null;
  }

  async findOne(collection, predicateFn) {
    const db = readDb();
    return (db[collection] || []).find(predicateFn) || null;
  }

  async insert(collection, row) {
    const db = readDb();
    if (!db[collection]) db[collection] = [];
    const newRow = { id: row.id || uuidv4(), ...row };
    db[collection].push(newRow);
    writeDb(db);
    return newRow;
  }

  async update(collection, id, patch) {
    const db = readDb();
    const list = db[collection] || [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    writeDb(db);
    return list[idx];
  }

  async remove(collection, id) {
    const db = readDb();
    const list = db[collection] || [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    writeDb(db);
    return true;
  }
}

export default LocalAdapter;
