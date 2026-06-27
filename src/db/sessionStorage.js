/**
 * Custom SQLite session storage for @shopify/shopify-api.
 * Implements the SessionStorage interface expected by the library.
 */
const db = require('./database');

const store = db.prepare(`INSERT OR REPLACE INTO sessions
  (id, shop, state, is_online, access_token, scope, expires, online_data, updated_at)
  VALUES (@id, @shop, @state, @is_online, @access_token, @scope, @expires, @online_data, datetime('now'))
`);
const load  = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
const del   = db.prepare(`DELETE FROM sessions WHERE id = ?`);
const byShop = db.prepare(`SELECT * FROM sessions WHERE shop = ? AND is_online = 0`);

function toRow(session) {
  return {
    id: session.id,
    shop: session.shop,
    state: session.state || null,
    is_online: session.isOnline ? 1 : 0,
    access_token: session.accessToken || null,
    scope: session.scope || null,
    expires: session.expires ? session.expires.toISOString() : null,
    online_data: session.onlineAccessInfo ? JSON.stringify(session.onlineAccessInfo) : null,
  };
}

function fromRow(row) {
  if (!row) return undefined;
  const { Session } = require('@shopify/shopify-api');
  const s = new Session({
    id: row.id,
    shop: row.shop,
    state: row.state || '',
    isOnline: row.is_online === 1,
  });
  s.accessToken = row.access_token || undefined;
  s.scope = row.scope || undefined;
  s.expires = row.expires ? new Date(row.expires) : undefined;
  s.onlineAccessInfo = row.online_data ? JSON.parse(row.online_data) : undefined;
  return s;
}

const sqliteSessionStorage = {
  async storeSession(session) {
    store.run(toRow(session));
    return true;
  },
  async loadSession(id) {
    return fromRow(load.get(id));
  },
  async deleteSession(id) {
    del.run(id);
    return true;
  },
  async deleteSessions(ids) {
    const tx = db.transaction((list) => list.forEach((id) => del.run(id)));
    tx(ids);
    return true;
  },
  async findSessionsByShop(shop) {
    return byShop.all(shop).map(fromRow).filter(Boolean);
  },
};

module.exports = sqliteSessionStorage;
