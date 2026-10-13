import { MongoClient } from "mongodb";
import { v4 as uuidv4 } from "uuid";

/**
 * MongoAdapter implements the exact same interface as LocalAdapter and
 * SheetsAdapter, so the rest of the app never knows which backend is
 * active. MongoDB is the recommended choice for an actual deployment:
 * it's free (Atlas free tier, 512MB, no credit card), has no Service
 * Account setup step (just a connection string), and handles concurrent
 * writes from multiple employees far better than a Sheet or a JSON file
 * on ephemeral disk.
 *
 * Every document uses a string `id` field (a uuid) as the app-level
 * identifier - Mongo's own `_id` is left alone and stripped from
 * anything returned to the rest of the app, so the data shape is
 * identical to the other two adapters.
 */
class MongoAdapter {
  constructor() {
    this._client = null;
    this._db = null;
  }

  async _getDb() {
    if (this._db) return this._db;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set - required when DB_PROVIDER=mongo");
    }

    this._client = new MongoClient(uri);
    await this._client.connect();
    this._db = this._client.db(process.env.MONGODB_DB_NAME || "gaming_parlour");
    return this._db;
  }

  async _getCollection(collection) {
    const db = await this._getDb();
    return db.collection(collection);
  }

  _stripMongoId(doc) {
    if (!doc) return doc;
    const { _id, ...rest } = doc;
    return rest;
  }

  async getAll(collection) {
    const col = await this._getCollection(collection);
    const docs = await col.find({}).toArray();
    return docs.map((d) => this._stripMongoId(d));
  }

  async getById(collection, id) {
    const col = await this._getCollection(collection);
    const doc = await col.findOne({ id });
    return this._stripMongoId(doc);
  }

  async findOne(collection, predicateFn) {
    // Mongo predicates would normally be query objects, but the rest of
    // the app calls this with a plain JS function (see LocalAdapter), so
    // for full interface compatibility we filter in memory. Collections
    // here are small (hundreds to low thousands of rows for a single
    // gaming parlour), so this stays fast enough without a real query
    // translation layer.
    const all = await this.getAll(collection);
    return all.find(predicateFn) || null;
  }

  async insert(collection, row) {
    const col = await this._getCollection(collection);
    const newRow = { id: row.id || uuidv4(), ...row };
    await col.insertOne({ ...newRow });
    return newRow;
  }

  async update(collection, id, patch) {
    const col = await this._getCollection(collection);
    const result = await col.findOneAndUpdate(
      { id },
      { $set: patch },
      { returnDocument: "after" }
    );
    return this._stripMongoId(result);
  }

  async remove(collection, id) {
    const col = await this._getCollection(collection);
    const result = await col.deleteOne({ id });
    return result.deletedCount > 0;
  }

  async close() {
    if (this._client) await this._client.close();
  }
}

export default MongoAdapter;
