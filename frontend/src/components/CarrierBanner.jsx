import React from 'react';
import { Banner, BlockStack, Text, List } from '@shopify/polaris';

/**
 * Shown while the carrier service is not registered. The most common cause
 * is that carrier-calculated shipping isn't enabled on the shop's plan, so
 * we surface the Shopify error and a retry button.
 */
export default function CarrierBanner({ status, checking, registering, error, onRegister }) {
  if (checking || !status || status.registered) return null;

  return (
    <Banner
      tone="warning"
      title="Versanddienst noch nicht aktiv"
      action={{ content: 'Jetzt registrieren', onAction: onRegister, loading: registering }}
    >
      <BlockStack gap="200">
        <Text as="p">
          Der Versandkosten-Dienst ist noch nicht bei Shopify registriert. Deine Regeln
          greifen erst im Checkout, sobald die Registrierung erfolgreich war.
        </Text>
        {error && (
          <Text as="p" tone="critical">
            Shopify meldet: {error}
          </Text>
        )}
        <Text as="p" variant="bodySm" tone="subdued">
          Falls die Registrierung fehlschlägt, muss „Carrier Calculated Shipping" für den
          Shop aktiv sein:
        </Text>
        <List type="bullet">
          <List.Item>Enthalten bei jährlicher Abrechnung (Shopify-Plan)</List.Item>
          <List.Item>Oder als Add-on über den Shopify-Support (bei monatlicher Zahlung)</List.Item>
        </List>
      </BlockStack>
    </Banner>
  );
}
