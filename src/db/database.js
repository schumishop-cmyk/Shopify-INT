const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Override with DB_DIR to point at a mounted volume (e.g. Railway /app/data)
const DB_DIR = process.env.DB_DIR || path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'app.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  // Most common cause on Railway: the mounted volume at DB_DIR isn't
  // writable by the container user (SQLITE_CANTOPEN)
  throw new Error(
    `Cannot open SQLite database at ${DB_PATH} (${err.code || err.message}). ` +
    `Ensure the data directory is writable by the container user.`
  );
}
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    shop         TEXT NOT NULL,
    state        TEXT,
    is_online    INTEGER NOT NULL DEFAULT 0,
    access_token TEXT,
    scope        TEXT,
    expires      TEXT,
    online_data  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_shop ON sessions(shop);

  CREATE TABLE IF NOT EXISTS shops (
    shop             TEXT PRIMARY KEY,
    access_token     TEXT NOT NULL,
    scope            TEXT,
    carrier_service_id INTEGER,
    installed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    uninstalled_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS shipping_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    shop        TEXT NOT NULL REFERENCES shops(shop) ON DELETE CASCADE,
    rule_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    priority    INTEGER NOT NULL DEFAULT 100,
    enabled     INTEGER NOT NULL DEFAULT 1,
    conditions  TEXT NOT NULL DEFAULT '{}',
    rates       TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop, rule_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rules_shop ON shipping_rules(shop);

  -- Shopify resources (zones, method definitions) created by our profile
  -- sync — on re-sync we only ever delete resources tracked here, never
  -- anything the merchant created themselves
  CREATE TABLE IF NOT EXISTS synced_resources (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    shop       TEXT NOT NULL,
    kind       TEXT NOT NULL, -- 'zone' | 'method_definition'
    gid        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_synced_shop ON synced_resources(shop);
`);

// Additive migrations for pre-existing databases
for (const stmt of [
  `ALTER TABLE shops ADD COLUMN last_synced_at TEXT`,
  `ALTER TABLE shops ADD COLUMN combined_discount_gid TEXT`,
  `ALTER TABLE shops ADD COLUMN combined_config TEXT`,
  // meta links a tracked resource to its origin, e.g. rule_id for
  // tag-rule delivery profiles
  `ALTER TABLE synced_resources ADD COLUMN meta TEXT`,
]) {
  try { db.exec(stmt); } catch { /* column already exists */ }
}

module.exports = db;
