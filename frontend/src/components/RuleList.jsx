import React from 'react';
import {
  Card, DataTable, Badge, Button, ButtonGroup,
  Spinner, Banner, EmptyState, InlineStack, Text,
} from '@shopify/polaris';

const CURRENCY_LABEL = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF' };

function formatPrice(cents) {
  if (cents === 0) return 'Kostenlos';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function conditionSummary(conditions) {
  const parts = [];
  if (conditions.destinationCountries?.length) {
    parts.push(conditions.destinationCountries.join(', '));
  }
  if (conditions.minCartPrice !== undefined) {
    parts.push(`ab ${formatPrice(conditions.minCartPrice)}`);
  }
  if (conditions.maxCartPrice !== undefined) {
    parts.push(`bis ${formatPrice(conditions.maxCartPrice)}`);
  }
  if (conditions.minWeightGrams !== undefined || conditions.maxWeightGrams !== undefined) {
    const min = conditions.minWeightGrams ? `${conditions.minWeightGrams}g` : '0';
    const max = conditions.maxWeightGrams ? `${conditions.maxWeightGrams}g` : '∞';
    parts.push(`Gewicht ${min}–${max}`);
  }
  if (conditions.requireProductTags?.length) {
    parts.push(`Tags: ${conditions.requireProductTags.join(', ')}`);
  }
  return parts.join(' · ') || 'Immer';
}

export default function RuleList({ rules, loading, error, onEdit, onDelete, onToggle }) {
  if (loading) return <Card><Spinner accessibilityLabel="Regeln werden geladen" /></Card>;

  if (error) return <Banner status="critical" title="Fehler beim Laden der Regeln">{error}</Banner>;

  if (rules.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="Noch keine Versandregeln"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Erstelle deine erste Versandregel, um dynamische Versandkosten zu konfigurieren.</p>
        </EmptyState>
      </Card>
    );
  }

  const rows = rules.map((rule) => [
    <InlineStack gap="200" blockAlign="center">
      <Text fontWeight="semibold">{rule.name}</Text>
      <Badge status={rule.enabled ? 'success' : 'new'}>
        {rule.enabled ? 'Aktiv' : 'Inaktiv'}
      </Badge>
    </InlineStack>,
    rule.priority,
    conditionSummary(rule.conditions),
    rule.rates.map((r) => `${r.serviceName} (${formatPrice(r.price)})`).join(' / '),
    <ButtonGroup>
      <Button size="slim" onClick={() => onToggle(rule)}>
        {rule.enabled ? 'Deaktivieren' : 'Aktivieren'}
      </Button>
      <Button size="slim" onClick={() => onEdit(rule)}>Bearbeiten</Button>
      <Button size="slim" tone="critical" onClick={() => onDelete(rule)}>Löschen</Button>
    </ButtonGroup>,
  ]);

  return (
    <Card>
      <DataTable
        columnContentTypes={['text', 'numeric', 'text', 'text', 'text']}
        headings={['Regelname', 'Priorität', 'Bedingungen', 'Versandoptionen', 'Aktionen']}
        rows={rows}
      />
    </Card>
  );
}
