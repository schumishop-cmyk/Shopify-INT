const https = require('https');
const { getShop, setCarrierServiceId } = require('../db/shops');
const logger = require('../utils/logger');

const CARRIER_NAME = 'Mybridge Versandregeln';

function apiRequest(shop, token, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: shop,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { /* keep null */ }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function buildCallbackUrl(shop) {
  const params = new URLSearchParams({ shop });
  if (process.env.CARRIER_SERVICE_SECRET) {
    params.set('token', process.env.CARRIER_SERVICE_SECRET);
  }
  return `${process.env.PUBLIC_URL}/api/carrier-service?${params}`;
}

/**
 * Registers (or re-registers) the carrier service for a shop.
 *
 * Idempotent: if a carrier service with our callback path already exists,
 * its ID is reused instead of creating a duplicate.
 *
 * @returns {Promise<{ ok: boolean, id?: number, alreadyExisted?: boolean,
 *                     status?: number, error?: string }>}
 */
async function registerCarrierService(shop, token) {
  if (!process.env.PUBLIC_URL) {
    return { ok: false, error: 'PUBLIC_URL not configured on the server' };
  }

  try {
    // Reuse an existing registration if present (avoids duplicates on retry)
    const existing = await apiRequest(shop, token, 'GET', '/admin/api/2024-01/carrier_services.json');
    const match = (existing.body?.carrier_services || []).find(
      (s) => typeof s.callback_url === 'string' && s.callback_url.includes('/api/carrier-service')
    );
    if (match) {
      setCarrierServiceId.run(match.id, shop);
      logger.info('Carrier service already registered', { shop, id: match.id });
      return { ok: true, id: match.id, alreadyExisted: true };
    }

    const res = await apiRequest(shop, token, 'POST', '/admin/api/2024-01/carrier_services.json', {
      carrier_service: {
        name: CARRIER_NAME,
        callback_url: buildCallbackUrl(shop),
        service_discovery: true,
        format: 'json',
      },
    });

    if (res.status === 201) {
      setCarrierServiceId.run(res.body.carrier_service.id, shop);
      logger.info('Carrier service registered', { shop, id: res.body.carrier_service.id });
      return { ok: true, id: res.body.carrier_service.id };
    }

    const error = extractError(res);
    logger.warn('Carrier service registration failed', { shop, status: res.status, body: res.raw });
    return { ok: false, status: res.status, error };
  } catch (err) {
    logger.error('Carrier registration request error', { shop, error: err.message });
    return { ok: false, error: err.message };
  }
}

/** Reports whether a carrier service is currently registered for the shop. */
async function getCarrierStatus(shop, token) {
  const row = getShop.get(shop);
  try {
    const res = await apiRequest(shop, token, 'GET', '/admin/api/2024-01/carrier_services.json');
    const match = (res.body?.carrier_services || []).find(
      (s) => typeof s.callback_url === 'string' && s.callback_url.includes('/api/carrier-service')
    );
    return {
      registered: Boolean(match),
      id: match?.id ?? row?.carrier_service_id ?? null,
      active: match?.active ?? null,
    };
  } catch (err) {
    return { registered: false, id: row?.carrier_service_id ?? null, error: err.message };
  }
}

/** Turns a Shopify error body into a readable single-line message. */
function extractError(res) {
  const errs = res.body?.errors;
  if (!errs) return `Shopify returned HTTP ${res.status}`;
  if (typeof errs === 'string') return errs;
  if (Array.isArray(errs)) return errs.join('; ');
  // { base: ["..."], ... }
  return Object.entries(errs)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('; ');
}

module.exports = { registerCarrierService, getCarrierStatus, extractError, CARRIER_NAME };
