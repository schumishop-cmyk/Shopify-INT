import React from 'react';
import {
  Card, DataTable, Badge, Button, ButtonGroup,
  Spinner, Banner, EmptyState, InlineStack, Text,
} from '@shopify/polaris';
import { useI18n } from '../i18n';

export default function RuleList({ rules, loading, error, onEdit, onDelete, onToggle }) {
  const { t, formatMoney, gramsToDisplay, weightLabel, translateError } = useI18n();

  const price = (cents) => (cents === 0 ? t('ruleList.free') : formatMoney(cents));

  const conditionSummary = (conditions) => {
    const parts = [];
    if (conditions.destinationCountries?.length) {
      parts.push(conditions.destinationCountries.join(', '));
    }
    if (conditions.minCartPrice !== undefined) {
      parts.push(t('ruleList.from', { value: price(conditions.minCartPrice) }));
    }
    if (conditions.maxCartPrice !== undefined) {
      parts.push(t('ruleList.upTo', { value: price(conditions.maxCartPrice) }));
    }
    if (conditions.minWeightGrams !== undefined || conditions.maxWeightGrams !== undefined) {
      const min = conditions.minWeightGrams ? `${gramsToDisplay(conditions.minWeightGrams)}${weightLabel}` : '0';
      const max = conditions.maxWeightGrams ? `${gramsToDisplay(conditions.maxWeightGrams)}${weightLabel}` : '∞';
      parts.push(t('ruleList.weightRange', { min, max }));
    }
    if (conditions.requireProductTags?.length) {
      parts.push(t('ruleList.tags', { tags: conditions.requireProductTags.join(', ') }));
    }
    return parts.join(' · ') || t('ruleList.always');
  };

  if (loading) return <Card><Spinner accessibilityLabel={t('ruleList.loading')} /></Card>;

  if (error) return <Banner status="critical" title={t('ruleList.loadError')}>{translateError(error)}</Banner>;

  if (rules.length === 0) {
    return (
      <Card>
        <EmptyState
          heading={t('ruleList.emptyHeading')}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>{t('ruleList.emptyBody')}</p>
        </EmptyState>
      </Card>
    );
  }

  const rows = rules.map((rule) => [
    <InlineStack gap="200" blockAlign="center">
      <Text fontWeight="semibold">{rule.name}</Text>
      <Badge status={rule.enabled ? 'success' : 'new'}>
        {rule.enabled ? t('ruleList.active') : t('ruleList.inactive')}
      </Badge>
    </InlineStack>,
    rule.priority,
    conditionSummary(rule.conditions),
    rule.rates.map((r) => `${r.serviceName} (${price(r.price)})`).join(' / '),
    <ButtonGroup>
      <Button size="slim" onClick={() => onToggle(rule)}>
        {rule.enabled ? t('ruleList.deactivate') : t('ruleList.activate')}
      </Button>
      <Button size="slim" onClick={() => onEdit(rule)}>{t('ruleList.edit')}</Button>
      <Button size="slim" tone="critical" onClick={() => onDelete(rule)}>{t('ruleList.delete')}</Button>
    </ButtonGroup>,
  ]);

  return (
    <Card>
      <DataTable
        columnContentTypes={['text', 'numeric', 'text', 'text', 'text']}
        headings={[
          t('ruleList.headings.name'),
          t('ruleList.headings.priority'),
          t('ruleList.headings.conditions'),
          t('ruleList.headings.rates'),
          t('ruleList.headings.actions'),
        ]}
        rows={rows}
      />
    </Card>
  );
}
