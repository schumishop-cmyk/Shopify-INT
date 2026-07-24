import React from 'react';
import { Banner, BlockStack, Text } from '@shopify/polaris';

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
  if (loading) return null;

  if (active) {
    return (
      <Banner tone="success" title="Abo aktiv">
        <Text as="p">
          Aktiver Plan: <strong>{plan || 'aktiv'}</strong>. Alle Funktionen sind freigeschaltet.
        </Text>
      </Banner>
    );
  }

  const action = pricingUrl
    ? { content: 'Plan wählen', url: pricingUrl, target: '_top' }
    : undefined;

  return (
    <Banner tone="warning" title="Kein aktives Abo" action={action}>
      <BlockStack gap="100">
        <Text as="p">
          Wähle einen Plan, um Shipping Rules dauerhaft zu nutzen. Die Abrechnung
          läuft sicher über Shopify — du wirst zur Shopify-Bezahlseite geleitet.
        </Text>
        {!pricingUrl && (
          <Text as="p" tone="subdued">
            Die Pläne öffnest du im Shopify-Adminbereich unter „Einstellungen → Apps und Vertriebskanäle → Shipping Rules".
          </Text>
        )}
      </BlockStack>
    </Banner>
  );
}
