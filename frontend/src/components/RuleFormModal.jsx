import React, { useState, useCallback } from 'react';
import {
  Modal, FormLayout, TextField, Select, Checkbox,
  Button, ButtonGroup, Divider, Text, InlineStack, BlockStack,
  Tag, InlineGrid,
} from '@shopify/polaris';

const EU_COUNTRIES = ['AT','BE','BG','CY','CZ','DK','EE','ES','FI','FR','GR','HR',
  'HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];

const COUNTRY_OPTIONS = [
  { label: 'Deutschland (DE)', value: 'DE' },
  { label: 'Österreich (AT)', value: 'AT' },
  { label: 'Schweiz (CH)', value: 'CH' },
  { label: 'EU (alle)', value: '__EU__' },
  { label: 'UK (GB)', value: 'GB' },
  { label: 'Weltweit', value: '__ALL__' },
];

function emptyRate() {
  return { serviceName: '', serviceCode: '', price: '', description: '', minDeliveryDays: '2', maxDeliveryDays: '5' };
}

function emptyForm(rule) {
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
    minWeight: rule.conditions.minWeightGrams != null ? String(rule.conditions.minWeightGrams) : '',
    maxWeight: rule.conditions.maxWeightGrams != null ? String(rule.conditions.maxWeightGrams) : '',
    requireTags: (rule.conditions.requireProductTags || []).join(', '),
    rates: rule.rates.map((r) => ({
      ...r,
      price: String(r.price / 100),
      minDeliveryDays: String(r.minDeliveryDays),
      maxDeliveryDays: String(r.maxDeliveryDays),
    })),
  };
}

function toApiPayload(form) {
  let countries = form.countries.filter((c) => c !== '__EU__' && c !== '__ALL__');
  if (form.countries.includes('__EU__')) countries = [...new Set([...countries, ...EU_COUNTRIES])];
  if (form.countries.includes('__ALL__')) countries = [];

  const conditions = {};
  if (countries.length) conditions.destinationCountries = countries;
  if (form.minCartPrice) conditions.minCartPrice = Math.round(parseFloat(form.minCartPrice) * 100);
  if (form.maxCartPrice) conditions.maxCartPrice = Math.round(parseFloat(form.maxCartPrice) * 100);
  if (form.minWeight) conditions.minWeightGrams = parseInt(form.minWeight);
  if (form.maxWeight) conditions.maxWeightGrams = parseInt(form.maxWeight);
  const tags = form.requireTags.split(',').map((t) => t.trim()).filter(Boolean);
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
  const [form, setForm] = useState(() => emptyForm(rule));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

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
    if (!form.name.trim()) e.name = 'Name ist erforderlich';
    if (form.rates.some((r) => !r.serviceName.trim())) e.rates = 'Alle Versandoptionen brauchen einen Namen';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(toApiPayload(form));
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
      title={rule ? 'Regel bearbeiten' : 'Neue Versandregel'}
      primaryAction={{ content: 'Speichern', onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: 'Abbrechen', onAction: onClose }]}
      large
    >
      <Modal.Section>
        <FormLayout>
          <InlineGrid columns={['twoThirds', 'oneThird']} gap="400">
            <TextField
              label="Regelname"
              value={form.name}
              onChange={(v) => set('name', v)}
              error={errors.name}
              autoComplete="off"
            />
            <TextField
              label="Priorität"
              type="number"
              value={form.priority}
              onChange={(v) => set('priority', v)}
              helpText="Niedrigere Zahl = höhere Priorität"
              autoComplete="off"
            />
          </InlineGrid>
          <Checkbox label="Regel aktiviert" checked={form.enabled} onChange={(v) => set('enabled', v)} />
        </FormLayout>
      </Modal.Section>

      <Modal.Section>
        <BlockStack gap="300">
          <Text variant="headingSm">Bedingungen</Text>

          <Text variant="bodySm" tone="subdued">Zielländer</Text>
          <InlineStack gap="200" wrap>
            {COUNTRY_OPTIONS.map((opt) => (
              <Tag
                key={opt.value}
                onClick={() => toggleCountry(opt.value)}
              >
                {form.countries.includes(opt.value) ? `✓ ${opt.label}` : opt.label}
              </Tag>
            ))}
          </InlineStack>

          <InlineGrid columns={2} gap="400">
            <TextField label="Mindestbestellwert (€)" type="number" value={form.minCartPrice}
              onChange={(v) => set('minCartPrice', v)} placeholder="z.B. 50" autoComplete="off" />
            <TextField label="Höchstbestellwert (€)" type="number" value={form.maxCartPrice}
              onChange={(v) => set('maxCartPrice', v)} placeholder="z.B. 49.99" autoComplete="off" />
            <TextField label="Mindestgewicht (g)" type="number" value={form.minWeight}
              onChange={(v) => set('minWeight', v)} placeholder="z.B. 2001" autoComplete="off" />
            <TextField label="Höchstgewicht (g)" type="number" value={form.maxWeight}
              onChange={(v) => set('maxWeight', v)} placeholder="z.B. 2000" autoComplete="off" />
          </InlineGrid>

          <TextField label="Produkt-Tags (kommagetrennt)" value={form.requireTags}
            onChange={(v) => set('requireTags', v)} placeholder="z.B. sperrgut, bulky" autoComplete="off"
            helpText="Ein Tag genügt: Produkte mit mindestens einem dieser Tags erhalten die Regel." />
        </BlockStack>
      </Modal.Section>

      <Modal.Section>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text variant="headingSm">Versandoptionen</Text>
            <Button size="slim" onClick={() => set('rates', [...form.rates, emptyRate()])}>
              + Option hinzufügen
            </Button>
          </InlineStack>

          {errors.rates && <Text tone="critical">{errors.rates}</Text>}

          {form.rates.map((rate, i) => (
            <BlockStack key={i} gap="200">
              {i > 0 && <Divider />}
              <InlineStack align="space-between">
                <Text variant="bodySm" fontWeight="semibold">Option {i + 1}</Text>
                {form.rates.length > 1 && (
                  <Button size="slim" tone="critical"
                    onClick={() => set('rates', form.rates.filter((_, j) => j !== i))}>
                    Entfernen
                  </Button>
                )}
              </InlineStack>
              <InlineGrid columns={2} gap="300">
                <TextField label="Name" value={rate.serviceName}
                  onChange={(v) => setRate(i, 'serviceName', v)} placeholder="z.B. DHL Standard" autoComplete="off" />
                <TextField label="Preis (€)" type="number" value={rate.price}
                  onChange={(v) => setRate(i, 'price', v)} placeholder="0 = kostenlos" autoComplete="off" />
                <TextField label="Beschreibung" value={rate.description}
                  onChange={(v) => setRate(i, 'description', v)} placeholder="z.B. 2–5 Werktage" autoComplete="off" />
                <InlineGrid columns={2} gap="200">
                  <TextField label="Min. Tage" type="number" value={rate.minDeliveryDays}
                    onChange={(v) => setRate(i, 'minDeliveryDays', v)} autoComplete="off" />
                  <TextField label="Max. Tage" type="number" value={rate.maxDeliveryDays}
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
