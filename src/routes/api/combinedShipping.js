const { Router } = require('express');
const { requireSessionToken } = require('../../middleware/requireSession');
const { applyCombinedShipping, getCombinedShippingStatus } = require('../../shopify/combinedShipping');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSessionToken);

/** GET /api/combined-shipping — deployment/activation state + config */
router.get('/', async (req, res) => {
  try {
    res.json(await getCombinedShippingStatus(req.shop, req.shopToken));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/combined-shipping — save configuration
 * Body: { enabled, mode: 'highest_only'|'flat_addition', flatAmount?: '3.00' }
 */
router.post('/', async (req, res) => {
  try {
    const result = await applyCombinedShipping(req.shop, req.shopToken, req.body || {});
    if (!result.ok) {
      logger.warn('Combined-shipping activation failed', { shop: req.shop, error: result.error });
      return res.status(422).json(result);
    }
    res.json(result);
  } catch (err) {
    logger.error('Combined-shipping crashed', { shop: req.shop, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
