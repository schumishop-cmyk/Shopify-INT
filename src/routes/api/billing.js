const { Router } = require('express');
const { requireSessionToken } = require('../../middleware/requireSession');
const { getSubscriptionStatus, pricingPageUrl } = require('../../shopify/billing');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSessionToken);

/**
 * GET /api/billing — current subscription state + the Managed Pricing page URL.
 *
 * Fails open: if the subscription query errors we still return a usable
 * payload (active:false, unknown:true) so the admin UI renders and can offer
 * the upgrade link rather than breaking on a transient API hiccup.
 */
router.get('/', async (req, res) => {
  const pricingUrl = pricingPageUrl(req.shop);
  try {
    const status = await getSubscriptionStatus(req.shop, req.shopToken);
    res.json({ ...status, pricingUrl });
  } catch (err) {
    logger.warn('Billing status check failed', { shop: req.shop, error: err.message });
    res.json({ active: false, plan: null, test: false, unknown: true, pricingUrl });
  }
});

module.exports = router;
