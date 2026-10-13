import LocalAdapter from "./LocalAdapter.js";
import SheetsAdapter from "./SheetsAdapter.js";
import MongoAdapter from "./MongoAdapter.js";

let instance = null;

/**
 * Returns a singleton instance of whichever adapter is configured.
 * Every route/controller in the app should call getDb() rather than
 * importing an adapter directly - this is the one place that decides
 * which backend is active, controlled by DB_PROVIDER in .env.
 */
export function getDb() {
  if (instance) return instance;

  const provider = (process.env.DB_PROVIDER || "local").toLowerCase();

  if (provider === "mongo") {
    instance = new MongoAdapter();
    console.log("[db] Using MongoDB adapter");
  } else if (provider === "sheets") {
    instance = new SheetsAdapter();
    console.log("[db] Using Google Sheets adapter");
  } else {
    instance = new LocalAdapter();
    console.log("[db] Using Local JSON file adapter");
  }

  return instance;
}
