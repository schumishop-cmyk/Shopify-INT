import React, { useState, useEffect } from 'react';
import {
  Card, BlockStack, InlineStack, Text, Button, Banner,
  Checkbox, Select, TextField, Badge,
} from '@shopify/polaris';

/**
 * Configures combined shipping for multi-origin orders: when a cart ships
 * from more than one location (e.g. own warehouse + print-on-demand),
 * Shopify normally SUMS the shipping rates — the discount function turns
 * that into "pay only the highest rate" or "flat fee per extra origin".
 */
export default function CombinedShippingCard({ status, saving, error, onSave }) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('highest_only');
  const [flatAmount, setFlatAmount] = useState('3.00');

  useEffect(() => {
    if (status?.config) {
      setEnabled(status.config.enabled !== false);
      setMode(status.config.mode || 'highest_only');
      if (status.config.flatAmountCents != null) {
        setFlatAmount((status.config.flatAmountCents / 100).toFixed(2));
      }
    }
  }, [status]);

  const needsDeploy = status && !status.deployed && !status.active;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h2">Kombinierte Versandkosten (mehrere Standorte)</Text>
            {status?.active && status?.config?.enabled !== false && <Badge tone="success">Aktiv</Badge>}
          </InlineStack>
          <Button
            variant="primary"
            onClick={() => onSave({ enabled, mode, flatAmount })}
            loading={saving}
            disabled={needsDeploy}
          >
            Speichern
          </Button>
        </InlineStack>

        <Text tone="subdued" as="p">
          Wenn eine Bestellung aus mehreren Standorten verschickt wird (z.B. eigenes Lager +
          Fulfillment-Dienstleister), addiert Shopify normalerweise die Versandkosten beider
          Standorte. Hier legst du fest, was der Kunde stattdessen zahlt.
        </Text>

        {needsDeploy && (
          <Banner tone="warning" title="Function noch nicht deployt">
            <p>
              Die Checkout-Function muss einmalig mit der Shopify CLI deployt werden:
              <br /><code>npm install -g @shopify/cli</code>
              <br /><code>cd extensions/combined-shipping && npm install && cd ../..</code>
              <br /><code>shopify app deploy</code>
            </p>
          </Banner>
        )}

        {error && (
          <Banner tone="critical" title="Speichern fehlgeschlagen"><p>{error}</p></Banner>
        )}

        <Checkbox
          label="Kombinierte Versandkosten aktivieren"
          checked={enabled}
          onChange={setEnabled}
        />

        <Select
          label="Berechnungsmodus"
          options={[
            { label: 'Nur die teuerste Rate zahlen (weitere Standorte kostenlos)', value: 'highest_only' },
            { label: 'Pauschale pro zusätzlichem Standort', value: 'flat_addition' },
          ]}
          value={mode}
          onChange={setMode}
          disabled={!enabled}
        />

        {mode === 'flat_addition' && (
          <TextField
            label="Pauschale pro zusätzlichem Standort (€)"
            type="number"
            value={flatAmount}
            onChange={setFlatAmount}
            autoComplete="off"
            disabled={!enabled}
            helpText="Beispiel: 3.00 — der Kunde zahlt die teuerste Rate voll, jeder weitere Standort kostet pauschal diesen Betrag."
          />
        )}
      </BlockStack>
    </Card>
  );
}
