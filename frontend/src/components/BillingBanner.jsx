import React from 'react';
import { Banner, BlockStack, Text } from '@shopify/polaris';
import { useI18n } from '../i18n';

/**
 * Managed Pricing banner.
 *
 * - No active subscription → prompt the merchant to pick a plan on Shopify's
 *   hosted pricing page (opens at the admin top level, breaking out of the
 *   app iframe).
 * - Active subscription → a quiet confirmation with the plan name.
 *
 * Charging is 100% Shopify-hosted; this component only links to it.
 */
export default function BillingBanner({ loading, active, plan, pricingUrl }) {
  const { t } = useI18n();

  if (loading) return null;

  if (active) {
    return (
      <Banner tone="success" title={t('billing.activeTitle')}>
        <Text as="p">
          {t('billing.activeBody', { plan: plan || t('billing.activeFallback') })}
        </Text>
      </Banner>
    );
  }

  const action = pricingUrl
    ? { content: t('billing.choosePlan'), url: pricingUrl, target: '_top' }
    : undefined;

  return (
    <Banner tone="warning" title={t('billing.inactiveTitle')} action={action}>
      <BlockStack gap="100">
        <Text as="p">{t('billing.inactiveBody')}</Text>
        {!pricingUrl && (
          <Text as="p" tone="subdued">{t('billing.noPricingUrl')}</Text>
        )}
      </BlockStack>
    </Banner>
  );
}
