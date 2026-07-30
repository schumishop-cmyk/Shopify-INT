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

// On uninstall Shopify deletes the app's data on its side (including our
// automatic app discount), so clear the stored discount reference too —
// otherwise a later reinstall writes to a discount GID that no longer exists.
const markUninstalled = db.prepare(`
  UPDATE shops
     SET uninstalled_at = datetime('now'),
         combined_discount_gid = NULL,
         combined_config = NULL
   WHERE shop = ?
`);

const getShop = db.prepare(`SELECT * FROM shops WHERE shop = ?`);

module.exports = { upsertShop, updateTokens, markUninstalled, getShop };
