const db = require('./database');

const upsertShop = db.prepare(`
  INSERT INTO shops (shop, access_token, scope, refresh_token, token_expires_at, refresh_token_expires_at)
  VALUES (@shop, @access_token, @scope, @refresh_token, @token_expires_at, @refresh_token_expires_at)
  ON CONFLICT(shop) DO UPDATE SET
    access_token             = excluded.access_token,
    scope                    = excluded.scope,
    refresh_token            = excluded.refresh_token,
    token_expires_at         = excluded.token_expires_at,
    refresh_token_expires_at = excluded.refresh_token_expires_at,
    uninstalled_at           = NULL,
    installed_at             = COALESCE(installed_at, datetime('now'))
`);

// Updates only the token fields after a refresh (leaves install metadata intact)
const updateTokens = db.prepare(`
  UPDATE shops SET
    access_token             = @access_token,
    refresh_token            = @refresh_token,
    token_expires_at         = @token_expires_at,
    refresh_token_expires_at = @refresh_token_expires_at
  WHERE shop = @shop
`);

const markUninstalled = db.prepare(`
  UPDATE shops SET uninstalled_at = datetime('now') WHERE shop = ?
`);

const getShop = db.prepare(`SELECT * FROM shops WHERE shop = ?`);

module.exports = { upsertShop, updateTokens, markUninstalled, getShop };
