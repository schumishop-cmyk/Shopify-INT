/**
 * Registers per-shop webhooks via the Admin API.
 *
 * With use_legacy_install_flow the app cannot declare webhook subscriptions
 * in shopify.app.toml, so app/uninstalled is subscribed here on install.
 * (GDPR compliance webhooks are configured in the Dev Dashboard instead.)
 */
const { adminGraphql } = require('./adminGraphql');
const logger = require('../utils/logger');

const CREATE = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

const EXISTING = `
  query {
    webhookSubscriptions(first: 50) {
      nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
    }
  }
`;

/** Idempotently subscribes app/uninstalled for a shop. Best-effort. */
async function registerUninstallWebhook(shop, token) {
  const callbackUrl = `${process.env.PUBLIC_URL}/webhooks/app/uninstalled`;
  try {
    const existing = await adminGraphql(shop, token, EXISTING);
    const already = (existing.data?.webhookSubscriptions?.nodes || []).some(
      (n) => n.topic === 'APP_UNINSTALLED' && n.endpoint?.callbackUrl === callbackUrl
    );
    if (already) return { ok: true, alreadyExisted: true };

    const res = await adminGraphql(shop, token, CREATE, {
      topic: 'APP_UNINSTALLED',
      sub: { callbackUrl, format: 'JSON' },
    });
    const errors = res.errors || res.data?.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length) {
      logger.warn('Uninstall webhook registration failed', { shop, errors });
      return { ok: false };
    }
    logger.info('Uninstall webhook registered', { shop });
    return { ok: true };
  } catch (err) {
    logger.warn('Uninstall webhook registration error', { shop, error: err.message });
    return { ok: false };
  }
}

module.exports = { registerUninstallWebhook };
