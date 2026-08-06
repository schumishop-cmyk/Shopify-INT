import React from 'react';
import { Card, BlockStack, InlineStack, Text, Button, Banner, List } from '@shopify/polaris';
import { useI18n } from '../i18n';

/**
 * Rules only take effect at checkout after they've been compiled into the
 * shop's native delivery profile — this card drives that sync.
 */
export default function SyncCard({ lastSyncedAt, syncing, result, onSync }) {
  const { t, formatDateTime, translateWarning, translateError } = useI18n();
  const synced = formatDateTime(lastSyncedAt);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingSm" as="h2">{t('sync.heading')}</Text>
            <Text tone="subdued" as="p">
              {synced ? t('sync.lastSynced', { time: synced }) : t('sync.never')}
            </Text>
          </BlockStack>
          <Button variant="primary" onClick={onSync} loading={syncing}>
            {t('sync.button')}
          </Button>
        </InlineStack>

        <Text tone="subdued" variant="bodySm" as="p">{t('sync.explanation')}</Text>

        {result && !result.ok && (
          <Banner tone="critical" title={t('sync.failed')}>
            <p>{translateError(result)}</p>
          </Banner>
        )}

        {result?.ok && (
          <Banner tone="success" title={t('sync.createdRates', { count: result.createdRates })}>
            <BlockStack gap="150">
              {result.tagProfiles && (result.tagProfiles.created + result.tagProfiles.updated + result.tagProfiles.removed) > 0 && (
                <Text as="p">
                  {t('sync.tagProfiles', {
                    created: result.tagProfiles.created,
                    updated: result.tagProfiles.updated,
                    removed: result.tagProfiles.removed,
                  })}
                </Text>
              )}
              {result.warnings?.length > 0 && (
                <List type="bullet">
                  {result.warnings.map((w, i) => (
                    <List.Item key={i}>{translateWarning(w)}</List.Item>
                  ))}
                </List>
              )}
            </BlockStack>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}
