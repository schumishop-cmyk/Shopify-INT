import React, { useState, useCallback } from 'react';
import {
  Modal, FormLayout, TextField, Checkbox,
  Button, Divider, Text, InlineStack, BlockStack,
  Tag, InlineGrid,
} from '@shopify/polaris';
import { useI18n } from '../i18n';

const EU_COUNTRIES = ['AT','BE','BG','CY','CZ','DK','EE','ES','FI','FR','GR','HR',
  'HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
const NORTH_AMERICA = ['US', 'CA'];

// Individual countries are labelled via Intl.DisplayNames; the grouped entries
// carry their own translated labels.
const SINGLE_COUNTRIES = ['DE', 'AT', 'CH', 'GB', 'US', 'CA'];
const GROUP_EU = '__EU__';
const GROUP_NA = '__NA__';
const GROUP_ALL = '__ALL__';

function emptyRate() {
  return { serviceName: '', serviceCode: '', price: '', description: '', minDeliveryDays: '2', maxDeliveryDays: '5' };
}

/** Builds form state from an existing rule, converting stored grams to the shop's unit. */
function formFromRule(rule, gramsToDisplay) {
  if (!rule) {
    return {
      name: '', priority: '100', enabled: true,
      countries: [], minCartPrice: '', maxCartPrice: '',
      minWeight: '', maxWeight: '', requireTags: '',
      rates: [emptyRate()],
    };
  }
  return {
    name: rule.name,
    priority: String(rule.priority),
    enabled: rule.enabled,
    countries: rule.conditions.destinationCountries || [],
    minCartPrice: rule.conditions.minCartPrice != null ? String(rule.conditions.minCartPrice / 100) : '',
    maxCartPrice: rule.conditions.maxCartPrice != null ? String(rule.conditions.maxCartPrice / 100) : '',
    minWeight: gramsToDisplay(rule.conditions.minWeightGrams),
    maxWeight: gramsToDisplay(rule.conditions.maxWeightGrams),
    requireTags: (rule.conditions.requireProductTags || []).join(', '),
    rates: rule.rates.map((r) => ({
      ...r,
      price: String(r.price / 100),
      minDeliveryDays: String(r.minDeliveryDays),
      maxDeliveryDays: String(r.maxDeliveryDays),
    })),
  };
}

/** Form state → API payload, converting the shop's weight unit back to grams. */
function toApiPayload(form, displayToGrams) {
  let countries = form.countries.filter((c) => !c.startsWith('__'));
  if (form.countries.includes(GROUP_EU)) countries = [...new Set([...countries, ...EU_COUNTRIES])];
  if (form.countries.includes(GROUP_NA)) countries = [...new Set([...countries, ...NORTH_AMERICA])];
  if (form.countries.includes(GROUP_ALL)) countries = [];

  const conditions = {};
  if (countries.length) conditions.destinationCountries = countries;
  if (form.minCartPrice) conditions.minCartPrice = Math.round(parseFloat(form.minCartPrice) * 100);
  if (form.maxCartPrice) conditions.maxCartPrice = Math.round(parseFloat(form.maxCartPrice) * 100);
  const minGrams = displayToGrams(form.minWeight);
  const maxGrams = displayToGrams(form.maxWeight);
  if (minGrams !== undefined) conditions.minWeightGrams = minGrams;
  if (maxGrams !== undefined) conditions.maxWeightGrams = maxGrams;
  const tags = form.requireTags.split(',').map((s) => s.trim()).filter(Boolean);
  if (tags.length) conditions.requireProductTags = tags;

  const rates = form.rates.map((r) => ({
    serviceName: r.serviceName,
    serviceCode: r.serviceCode || r.serviceName.toLowerCase().replace(/\s+/g, '-'),
    price: Math.round(parseFloat(r.price || 0) * 100),
    description: r.description,
    minDeliveryDays: parseInt(r.minDeliveryDays) || 1,
    maxDeliveryDays: parseInt(r.maxDeliveryDays) || 7,
  }));

  return {
    name: form.name,
    priority: parseInt(form.priority) || 100,
    enabled: form.enabled,
    conditions,
    rates,
  };
}

export default function RuleFormModal({ rule, onSave, onClose }) {
  const { t, currencySymbol, weightLabel, gramsToDisplay, displayToGrams, regionName } = useI18n();
  const [form, setForm] = useState(() => formFromRule(rule, gramsToDisplay));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const countryOptions = [
    ...SINGLE_COUNTRIES.map((code) => ({ label: `${regionName(code)} (${code})`, value: code })),
    { label: t('countries.euAll'), value: GROUP_EU },
    { label: t('countries.northAmerica'), value: GROUP_NA },
    { label: t('countries.worldwide'), value: GROUP_ALL },
  ];

  const set = useCallback((key, val) => setForm((f) => ({ ...f, [key]: val })), []);
  const setRate = useCallback((i, key, val) => {
    setForm((f) => {
      const rates = [...f.rates];
      rates[i] = { ...rates[i], [key]: val };
      return { ...f, rates };
    });
  }, []);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('ruleForm.errorName');
    if (form.rates.some((r) => !r.serviceName.trim())) e.rates = t('ruleForm.errorRates');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(toApiPayload(form, displayToGrams));
    } finally {
      setSaving(false);
    }
  };

  const toggleCountry = (val) => {
    setForm((f) => ({
      ...f,
      countries: f.countries.includes(val)
        ? f.countries.filter((c) => c !== val)
        : [...f.countries, val],
    }));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? t('ruleForm.editTitle') : t('ruleForm.createTitle')}
      primaryAction={{ content: t('ruleForm.save'), onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: t('ruleForm.cancel'), onAction: onClose }]}
      large
    >
      <Modal.Section>
        <FormLayout>
          <InlineGrid columns={['twoThirds', 'oneThird']} gap="400">
            <TextField
              label={t('ruleForm.name')}
              value={form.name}
              onChange={(v) => set('name', v)}
              error={errors.name}
              autoComplete="off"
            />
            <TextField
              label={t('ruleForm.priority')}
              type="number"
              value={form.priority}
              onChange={(v) => set('priority', v)}
              helpText={t('ruleForm.priorityHelp')}
              autoComplete="off"
            />
          </InlineGrid>
          <Checkbox label={t('ruleForm.enabled')} checked={form.enabled} onChange={(v) => set('enabled', v)} />
        </FormLayout>
      </Modal.Section>

      <Modal.Section>
        <BlockStack gap="300">
          <Text variant="headingSm">{t('ruleForm.conditions')}</Text>

          <Text variant="bodySm" tone="subdued">{t('ruleForm.destinations')}</Text>
          <InlineStack gap="200" wrap>
            {countryOptions.map((opt) => (
              <Tag key={opt.value} onClick={() => toggleCountry(opt.value)}>
                {form.countries.includes(opt.value) ? `✓ ${opt.label}` : opt.label}
              </Tag>
            ))}
          </InlineStack>

          <InlineGrid columns={2} gap="400">
            <TextField label={t('ruleForm.minCartPrice', { currency: currencySymbol })} type="number"
              value={form.minCartPrice} onChange={(v) => set('minCartPrice', v)} autoComplete="off" />
            <TextField label={t('ruleForm.maxCartPrice', { currency: currencySymbol })} type="number"
              value={form.maxCartPrice} onChange={(v) => set('maxCartPrice', v)} autoComplete="off" />
            <TextField label={t('ruleForm.minWeight', { unit: weightLabel })} type="number"
              value={form.minWeight} onChange={(v) => set('minWeight', v)} autoComplete="off" />
            <TextField label={t('ruleForm.maxWeight', { unit: weightLabel })} type="number"
              value={form.maxWeight} onChange={(v) => set('maxWeight', v)} autoComplete="off" />
          </InlineGrid>

          <TextField label={t('ruleForm.productTags')} value={form.requireTags}
            onChange={(v) => set('requireTags', v)} placeholder={t('ruleForm.productTagsPlaceholder')}
            autoComplete="off" helpText={t('ruleForm.productTagsHelp')} />
        </BlockStack>
      </Modal.Section>

      <Modal.Section>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text variant="headingSm">{t('ruleForm.rates')}</Text>
            <Button size="slim" onClick={() => set('rates', [...form.rates, emptyRate()])}>
              {t('ruleForm.addRate')}
            </Button>
          </InlineStack>

          {errors.rates && <Text tone="critical">{errors.rates}</Text>}

          {form.rates.map((rate, i) => (
            <BlockStack key={i} gap="200">
              {i > 0 && <Divider />}
              <InlineStack align="space-between">
                <Text variant="bodySm" fontWeight="semibold">{t('ruleForm.option', { number: i + 1 })}</Text>
                {form.rates.length > 1 && (
                  <Button size="slim" tone="critical"
                    onClick={() => set('rates', form.rates.filter((_, j) => j !== i))}>
                    {t('ruleForm.remove')}
                  </Button>
                )}
              </InlineStack>
              <InlineGrid columns={2} gap="300">
                <TextField label={t('ruleForm.rateName')} value={rate.serviceName}
                  onChange={(v) => setRate(i, 'serviceName', v)}
                  placeholder={t('ruleForm.placeholderRateName')} autoComplete="off" />
                <TextField label={t('ruleForm.ratePrice', { currency: currencySymbol })} type="number"
                  value={rate.price} onChange={(v) => setRate(i, 'price', v)}
                  placeholder={t('ruleForm.placeholderFreeIsZero')} autoComplete="off" />
                <TextField label={t('ruleForm.rateDescription')} value={rate.description}
                  onChange={(v) => setRate(i, 'description', v)}
                  placeholder={t('ruleForm.placeholderRateDescription')} autoComplete="off" />
                <InlineGrid columns={2} gap="200">
                  <TextField label={t('ruleForm.minDays')} type="number" value={rate.minDeliveryDays}
                    onChange={(v) => setRate(i, 'minDeliveryDays', v)} autoComplete="off" />
                  <TextField label={t('ruleForm.maxDays')} type="number" value={rate.maxDeliveryDays}
                    onChange={(v) => setRate(i, 'maxDeliveryDays', v)} autoComplete="off" />
                </InlineGrid>
              </InlineGrid>
            </BlockStack>
          ))}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
