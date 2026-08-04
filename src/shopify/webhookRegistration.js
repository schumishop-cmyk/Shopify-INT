/**
 * Registers per-shop webhooks via the Admin API.
 *
 * With use_legacy_install_flow the app cannot declare webhook subscriptions
 * in shopify.app.toml, so topics are subscribed here on install instead.
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

/** Idempotently subscribes one webhook topic for a shop. Best-effort. */
async function registerWebhook(shop, token, topic, path) {
  const callbackUrl = `${process.env.PUBLIC_URL}${path}`;
  try {
    const existing = await adminGraphql(shop, token, EXISTING);
    const already = (existing.data?.webhookSubscriptions?.nodes || []).some(
      (n) => n.topic === topic && n.endpoint?.callbackUrl === callbackUrl
    );
    if (already) return { ok: true, alreadyExisted: true };

    const res = await adminGraphql(shop, token, CREATE, {
      topic,
      sub: { callbackUrl, format: 'JSON' },
    });
    const errors = res.errors || res.data?.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length) {
      logger.warn('Webhook registration failed', { shop, topic, errors });
      return { ok: false };
    }
    logger.info('Webhook registered', { shop, topic });
    return { ok: true };
  } catch (err) {
    logger.warn('Webhook registration error', { shop, topic, error: err.message });
    return { ok: false };
  }
}

/** Notifies us when the merchant uninstalls, so we can mark the shop inactive. */
async function registerUninstallWebhook(shop, token) {
  return registerWebhook(shop, token, 'APP_UNINSTALLED', '/webhooks/app/uninstalled');
}

/**
 * Notifies us when the shop's app subscription changes status (trial ends
 * unpaid, payment fails, merchant cancels, …) so the live Shopify-side
 * shipping data can be torn down accordingly.
 */
async function registerSubscriptionWebhook(shop, token) {
  return registerWebhook(shop, token, 'APP_SUBSCRIPTIONS_UPDATE', '/webhooks/app_subscriptions/update');
}

module.exports = { registerWebhook, registerUninstallWebhook, registerSubscriptionWebhook };
