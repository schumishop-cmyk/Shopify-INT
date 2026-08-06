import React, { useState, useEffect } from 'react';
import {
  Card, BlockStack, InlineStack, Text, Button, Banner,
  Checkbox, Select, TextField, Badge,
} from '@shopify/polaris';
import { useI18n } from '../i18n';

/**
 * Configures combined shipping for multi-origin orders: when a cart ships
 * from more than one location (e.g. own warehouse + print-on-demand),
 * Shopify normally SUMS the shipping rates — the discount function turns
 * that into "pay only the highest rate" or "flat fee per extra origin".
 */
export default function CombinedShippingCard({ status, saving, error, onSave }) {
  const { t, formatMoney, currencySymbol, translateError } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('highest_only');
  const [flatAmount, setFlatAmount] = useState('3.00');
  const [detectVendor, setDetectVendor] = useState('');
  const [fulfillmentRate, setFulfillmentRate] = useState('3.50');

  useEffect(() => {
    if (status?.config) {
      setEnabled(status.config.enabled !== false);
      setMode(status.config.mode || 'highest_only');
      if (status.config.flatAmountCents != null) {
        setFlatAmount((status.config.flatAmountCents / 100).toFixed(2));
      }
      if (status.config.detectVendors?.length) {
        setDetectVendor(status.config.detectVendors[0]);
      }
      if (status.config.fulfillmentRateCents != null) {
        setFulfillmentRate((status.config.fulfillmentRateCents / 100).toFixed(2));
      }
    }
  }, [status]);

  const needsDeploy = status && !status.deployed && !status.active;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h2">{t('combined.heading')}</Text>
            {status?.active && status?.config?.enabled !== false && (
              <Badge tone="success">{t('combined.active')}</Badge>
            )}
          </InlineStack>
          <Button
            variant="primary"
            onClick={() => onSave({ enabled, mode, flatAmount, detectVendor, fulfillmentRate })}
            loading={saving}
            disabled={needsDeploy}
          >
            {t('combined.save')}
          </Button>
        </InlineStack>

        <Text tone="subdued" as="p">{t('combined.explanation')}</Text>

        {needsDeploy && (
          <Banner tone="warning" title={t('combined.needsDeployTitle')}>
            <p>
              {t('combined.needsDeployBody')}
              <br /><code>npm install -g @shopify/cli</code>
              <br /><code>cd extensions/combined-shipping</code>
              <br /><code>npm install</code>
              <br /><code>shopify app function schema</code>
              <br /><code>cd ../..</code>
              <br /><code>shopify app deploy</code>
            </p>
          </Banner>
        )}

        {error && (
          <Banner tone="critical" title={t('combined.saveFailed')}>
            <p>{translateError(error)}</p>
          </Banner>
        )}

        <Checkbox
          label={t('combined.enable')}
          checked={enabled}
          onChange={setEnabled}
        />

        <TextField
          label={t('combined.vendor')}
          value={detectVendor}
          onChange={setDetectVendor}
          autoComplete="off"
          disabled={!enabled}
          helpText={t('combined.vendorHelp')}
        />

        <TextField
          label={t('combined.partnerRate', { currency: currencySymbol })}
          type="number"
          value={fulfillmentRate}
          onChange={setFulfillmentRate}
          autoComplete="off"
          disabled={!enabled}
          helpText={t('combined.partnerRateHelp', { example: formatMoney(350) })}
        />

        <Select
          label={t('combined.mode')}
          options={[
            { label: t('combined.modeHighestOnly'), value: 'highest_only' },
            { label: t('combined.modeFlatAddition'), value: 'flat_addition' },
          ]}
          value={mode}
          onChange={setMode}
          disabled={!enabled}
        />

        {mode === 'flat_addition' && (
          <TextField
            label={t('combined.flatAmount', { currency: currencySymbol })}
            type="number"
            value={flatAmount}
            onChange={setFlatAmount}
            autoComplete="off"
            disabled={!enabled}
            helpText={t('combined.flatAmountHelp', { example: formatMoney(300) })}
          />
        )}
      </BlockStack>
    </Card>
  );
}
