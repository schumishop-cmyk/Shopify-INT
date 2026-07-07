const { Router } = require('express');
const { requireSessionToken } = require('../../middleware/requireSession');
const rulesDb = require('../../db/rules');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSessionToken);

/** GET /api/rules — list all rules for the authenticated shop */
router.get('/', (req, res) => {
  const rules = rulesDb.getRulesForShop(req.shop);
  res.json({ rules });
});

/** POST /api/rules — create a new rule */
router.post('/', (req, res) => {
  const { name, priority, enabled, conditions, rates } = req.body;

  if (!name || !Array.isArray(rates) || rates.length === 0) {
    return res.status(400).json({ error: 'name and at least one rate are required' });
  }

  const rule_id = req.body.rule_id || `rule-${Date.now().toString(36)}`;

  try {
    const info = rulesDb.insertRule.run({
      shop: req.shop,
      rule_id,
      name,
      priority: priority ?? 100,
      enabled: enabled !== false ? 1 : 0,
      conditions: JSON.stringify(conditions || {}),
      rates: JSON.stringify(rates),
    });
    const created = rulesDb.getRule.get(req.shop, info.lastInsertRowid);
    logger.info('Rule created', { shop: req.shop, rule_id });
    res.status(201).json({ rule: rulesDb.parseRow(created) });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A rule with this rule_id already exists' });
    }
    throw err;
  }
});

/** PUT /api/rules/:id — update an existing rule */
router.put('/:id', (req, res) => {
  const existing = rulesDb.getRule.get(req.shop, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  const { name, priority, enabled, conditions, rates } = req.body;

  rulesDb.updateRule.run({
    shop: req.shop,
    id: req.params.id,
    name: name ?? existing.name,
    priority: priority ?? existing.priority,
    enabled: enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    conditions: JSON.stringify(conditions ?? JSON.parse(existing.conditions)),
    rates: JSON.stringify(rates ?? JSON.parse(existing.rates)),
  });

  const updated = rulesDb.getRule.get(req.shop, req.params.id);
  logger.info('Rule updated', { shop: req.shop, id: req.params.id });
  res.json({ rule: rulesDb.parseRow(updated) });
});

/** DELETE /api/rules/:id — delete a rule */
router.delete('/:id', (req, res) => {
  const existing = rulesDb.getRule.get(req.shop, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  rulesDb.deleteRule.run(req.shop, req.params.id);
  logger.info('Rule deleted', { shop: req.shop, id: req.params.id });
  res.json({ message: 'Rule deleted' });
});

/** POST /api/rules/:id/toggle — quick enable/disable */
router.post('/:id/toggle', (req, res) => {
  const existing = rulesDb.getRule.get(req.shop, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  rulesDb.updateRule.run({
    shop: req.shop,
    id: req.params.id,
    name: existing.name,
    priority: existing.priority,
    enabled: existing.enabled ? 0 : 1,
    conditions: existing.conditions,
    rates: existing.rates,
  });

  const updated = rulesDb.getRule.get(req.shop, req.params.id);
  res.json({ rule: rulesDb.parseRow(updated) });
});

module.exports = router;
