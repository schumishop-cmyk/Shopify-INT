const db = require('./database');
const path = require('path');
const fs = require('fs');

const DEFAULT_RULES_PATH = path.resolve(__dirname, '../../config/shipping-rules.json');

const listRules = db.prepare(`
  SELECT * FROM shipping_rules WHERE shop = ? ORDER BY priority ASC, id ASC
`);

const getRule = db.prepare(`
  SELECT * FROM shipping_rules WHERE shop = ? AND id = ?
`);

const insertRule = db.prepare(`
  INSERT INTO shipping_rules (shop, rule_id, name, priority, enabled, conditions, rates)
  VALUES (@shop, @rule_id, @name, @priority, @enabled, @conditions, @rates)
`);

const updateRule = db.prepare(`
  UPDATE shipping_rules
  SET name = @name, priority = @priority, enabled = @enabled,
      conditions = @conditions, rates = @rates, updated_at = datetime('now')
  WHERE shop = @shop AND id = @id
`);

const deleteRule = db.prepare(`DELETE FROM shipping_rules WHERE shop = ? AND id = ?`);

const countRules = db.prepare(`SELECT COUNT(*) as n FROM shipping_rules WHERE shop = ?`);

/** Seed a shop's rules from the default config if they have none yet. */
function seedDefaultRules(shop) {
  const { n } = countRules.get(shop);
  if (n > 0) return;

  const config = JSON.parse(fs.readFileSync(DEFAULT_RULES_PATH, 'utf-8'));
  const insert = db.transaction((rules) => {
    for (const rule of rules) {
      insertRule.run({
        shop,
        rule_id: rule.id,
        name: rule.name,
        priority: rule.priority,
        enabled: rule.enabled ? 1 : 0,
        conditions: JSON.stringify(rule.conditions),
        rates: JSON.stringify(rule.rates),
      });
    }
  });
  insert(config.rules);
}

/** Return parsed rule objects (conditions/rates as JS objects). */
function getRulesForShop(shop) {
  return listRules.all(shop).map(parseRow);
}

function parseRow(row) {
  return {
    ...row,
    enabled: row.enabled === 1,
    conditions: JSON.parse(row.conditions),
    rates: JSON.parse(row.rates),
  };
}

module.exports = {
  listRules,
  getRule,
  insertRule,
  updateRule,
  deleteRule,
  seedDefaultRules,
  getRulesForShop,
  parseRow,
};
