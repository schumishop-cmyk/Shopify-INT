const { Router } = require('express');
const { requireSessionToken } = require('../../middleware/requireSession');
const { registerCarrierService, getCarrierStatus } = require('../../shopify/carrierRegistration');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSessionToken);

/** GET /api/carrier/status — is the carrier service registered for this shop? */
router.get('/status', async (req, res) => {
  const status = await getCarrierStatus(req.shop, req.shopToken);
  res.json(status);
});

/** POST /api/carrier/register — (re)register the carrier service on demand */
router.post('/register', async (req, res) => {
  const result = await registerCarrierService(req.shop, req.shopToken);
  if (result.ok) {
    return res.json({ ok: true, id: result.id, alreadyExisted: !!result.alreadyExisted });
  }
  logger.warn('Manual carrier registration failed', { shop: req.shop, error: result.error });
  return res.status(422).json({ ok: false, error: result.error });
});

module.exports = router;
