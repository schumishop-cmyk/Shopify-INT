import React from 'react';
import { Card, BlockStack, InlineStack, Text, Button, Banner, List } from '@shopify/polaris';

function formatTime(iso) {
  if (!iso) return null;
  // SQLite datetime('now') is UTC without timezone marker
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Rules only take effect at checkout after they've been compiled into the
 * shop's native delivery profile — this card drives that sync.
 */
export default function SyncCard({ lastSyncedAt, syncing, result, onSync }) {
  const synced = formatTime(lastSyncedAt);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingSm" as="h2">Mit Shopify-Versandeinstellungen synchronisieren</Text>
            <Text tone="subdued" as="p">
              {synced
                ? `Zuletzt synchronisiert: ${synced}`
                : 'Noch nie synchronisiert — die Regeln greifen erst nach der ersten Synchronisierung.'}
            </Text>
          </BlockStack>
          <Button variant="primary" onClick={onSync} loading={syncing}>
            Synchronisieren
          </Button>
        </InlineStack>

        <Text tone="subdued" variant="bodySm" as="p">
          Deine Regeln werden als Versandtarife in dein Shopify-Versandprofil geschrieben
          (Einstellungen → Versand und Lieferung). Nach jeder Regeländerung erneut synchronisieren.
        </Text>

        {result && !result.ok && (
          <Banner tone="critical" title="Synchronisierung fehlgeschlagen">
            <p>{result.error}</p>
          </Banner>
        )}

        {result?.ok && (
          <Banner tone="success" title={`${result.createdRates} Versandtarife angelegt`}>
            {result.warnings?.length > 0 && (
              <List type="bullet">
                {result.warnings.map((w, i) => <List.Item key={i}>{w}</List.Item>)}
              </List>
            )}
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}
