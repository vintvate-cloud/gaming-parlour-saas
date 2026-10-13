import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";

// Each "collection" maps 1:1 to a sheet tab. Column headers must match
// the keys used in row objects throughout the app (see SHEET_SCHEMAS).
const SHEET_TABS = {
  users: "Users",
  stations: "Stations",
  gameTypes: "GameTypes",
  sessions: "Sessions",
  auditLog: "AuditLog",
  settings: "Settings",
};

// Header row definitions - created automatically if the tab is empty.
const SHEET_SCHEMAS = {
  users: ["id", "name", "username", "passwordHash", "role", "createdAt"],
  stations: ["id", "name", "gameType", "status", "createdAt"],
  gameTypes: ["id", "name", "maxPlayers", "rates", "billingModel", "createdAt"],
  sessions: [
    "id",
    "customerName",
    "phone",
    "status",
    "employeeId",
    "employeeName",
    "discount",
    "discountMinutes",
    "discountReason",
    "minimumRateEnabled",
    "paymentMethod",
    "total",
    "isException",
    "exceptionNotes",
    "paymentStatus",
    "paidAt",
    "paidBy",
    "segments", // JSON array - source of truth for billing, see sessions.js
    // Mirrored from the current/last segment, purely so the raw Sheet
    // stays readable to a human glancing at it - not used by the app logic.
    "stationName",
    "gameType",
    "players",
    "rate",
    "startTime",
    "createdAt",
  ],
  auditLog: ["id", "timestamp", "employeeId", "employeeName", "action", "details"],
  // Singleton row (id="global") holding app-wide configuration.
  settings: ["id", "graceMinutes"],
};

/**
 * SheetsAdapter implements the exact same interface as LocalAdapter.
 * Values are stored as strings in Sheets, so JSON-ish fields (rates,
 * isException) are serialized/deserialized at the boundary here -
 * the rest of the app always works with real JS types.
 */
class SheetsAdapter {
  constructor() {
    this._doc = null;
    this._sheetsCache = {};
  }

  async _getDoc() {
    if (this._doc) return this._doc;

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    this._doc = doc;
    return doc;
  }

  async _getSheet(collection) {
    if (this._sheetsCache[collection]) return this._sheetsCache[collection];

    const doc = await this._getDoc();
    const tabName = SHEET_TABS[collection];
    let sheet = doc.sheetsByTitle[tabName];

    if (!sheet) {
      sheet = await doc.addSheet({
        title: tabName,
        headerValues: SHEET_SCHEMAS[collection],
      });
    }

    this._sheetsCache[collection] = sheet;
    return sheet;
  }

  _deserializeRow(collection, row) {
    const obj = {};
    SHEET_SCHEMAS[collection].forEach((key) => {
      let val = row.get(key);
      if (key === "rates" || key === "billingModel") {
        try {
          val = val ? JSON.parse(val) : {};
        } catch {
          val = {};
        }
      } else if (key === "isException" || key === "minimumRateEnabled") {
        try {
          // minimumRateEnabled defaults to true when absent (older rows,
          // or a fresh Sheet that hasn't been touched yet).
          val = val ? JSON.parse(val) : key === "minimumRateEnabled" ? true : false;
        } catch {
          val = key === "minimumRateEnabled" ? true : false;
        }
      } else if (key === "segments") {
        try {
          val = val ? JSON.parse(val) : [];
        } catch {
          val = [];
        }
      } else if (
        key === "players" ||
        key === "rate" ||
        key === "discount" ||
        key === "discountMinutes" ||
        key === "total" ||
        key === "graceMinutes"
      ) {
        val = val === "" || val === undefined ? 0 : Number(val);
      } else if (key === "maxPlayers") {
        val = val === "" || val === undefined ? 1 : Number(val);
      }
      obj[key] = val === undefined ? "" : val;
    });
    obj._rowRef = row; // internal use only, stripped before returning to routes
    return obj;
  }

  _serializeForSheet(collection, rowObj) {
    // For sessions, auto-derive the mirrored readability columns from the
    // current (last) segment before writing, so the raw Sheet always shows
    // accurate "where is this customer right now" info even though segments
    // is the real source of truth.
    let source = rowObj;
    if (collection === "sessions" && Array.isArray(rowObj.segments) && rowObj.segments.length) {
      const current = rowObj.segments[rowObj.segments.length - 1];
      source = {
        ...rowObj,
        stationName: current.stationName,
        gameType: current.gameType,
        players: current.players,
        rate: current.rate,
        startTime: current.startTime,
      };
    }

    const out = {};
    SHEET_SCHEMAS[collection].forEach((key) => {
      let val = source[key];
      if (key === "rates" || key === "billingModel") {
        out[key] = JSON.stringify(val ?? {});
      } else if (key === "isException" || key === "minimumRateEnabled") {
        out[key] = JSON.stringify(val ?? (key === "minimumRateEnabled" ? true : false));
      } else if (key === "segments") {
        out[key] = JSON.stringify(val ?? []);
      } else {
        out[key] = val === undefined || val === null ? "" : String(val);
      }
    });
    return out;
  }

  _stripInternal(obj) {
    const { _rowRef, ...rest } = obj;
    return rest;
  }

  async getAll(collection) {
    const sheet = await this._getSheet(collection);
    const rows = await sheet.getRows();
    return rows.map((r) => this._stripInternal(this._deserializeRow(collection, r)));
  }

  async getById(collection, id) {
    const sheet = await this._getSheet(collection);
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.get("id") === id);
    return row ? this._stripInternal(this._deserializeRow(collection, row)) : null;
  }

  async findOne(collection, predicateFn) {
    const all = await this.getAll(collection);
    return all.find(predicateFn) || null;
  }

  async insert(collection, rowObj) {
    const sheet = await this._getSheet(collection);
    const newRow = { id: rowObj.id || uuidv4(), ...rowObj };
    const serialized = this._serializeForSheet(collection, newRow);
    await sheet.addRow(serialized);
    return newRow;
  }

  async update(collection, id, patch) {
    const sheet = await this._getSheet(collection);
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.get("id") === id);
    if (!row) return null;

    const current = this._stripInternal(this._deserializeRow(collection, row));
    const updated = { ...current, ...patch };
    const serialized = this._serializeForSheet(collection, updated);

    SHEET_SCHEMAS[collection].forEach((key) => {
      row.set(key, serialized[key]);
    });
    await row.save();
    return updated;
  }

  async remove(collection, id) {
    const sheet = await this._getSheet(collection);
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.get("id") === id);
    if (!row) return false;
    await row.delete();
    return true;
  }
}

export default SheetsAdapter;
