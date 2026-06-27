const db = require('./database');

const upsertShop = db.prepare(`
  INSERT INTO shops (shop, access_token, scope)
  VALUES (@shop, @access_token, @scope)
  ON CONFLICT(shop) DO UPDATE SET
    access_token   = excluded.access_token,
    scope          = excluded.scope,
    uninstalled_at = NULL,
    installed_at   = COALESCE(installed_at, datetime('now'))
`);

const markUninstalled = db.prepare(`
  UPDATE shops SET uninstalled_at = datetime('now') WHERE shop = ?
`);

const getShop = db.prepare(`SELECT * FROM shops WHERE shop = ?`);

const setCarrierServiceId = db.prepare(`
  UPDATE shops SET carrier_service_id = ? WHERE shop = ?
`);

module.exports = { upsertShop, markUninstalled, getShop, setCarrierServiceId };
