import React, { useState, useCallback } from 'react';
import { Page, Layout, Toast, Frame } from '@shopify/polaris';
import RuleList from './components/RuleList';
import RuleFormModal from './components/RuleFormModal';
import SyncCard from './components/SyncCard';
import CombinedShippingCard from './components/CombinedShippingCard';
import BillingBanner from './components/BillingBanner';
import { useRules } from './hooks/useRules';
import { useSync } from './hooks/useSync';
import { useCombinedShipping } from './hooks/useCombinedShipping';
import { useBilling } from './hooks/useBilling';
import { useI18n } from './i18n';

export default function App() {
  const { t, translateError } = useI18n();
  const { rules, loading, error, createRule, updateRule, deleteRule, toggleRule } = useRules();
  const { lastSyncedAt, syncing, result, sync } = useSync();
  const combined = useCombinedShipping();
  const billing = useBilling();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ message: msg, error: isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingRule(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((rule) => {
    setEditingRule(rule);
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(async (data) => {
    try {
      if (editingRule) {
        await updateRule(editingRule.id, data);
        showToast(t('app.toast.ruleUpdated'));
      } else {
        await createRule(data);
        showToast(t('app.toast.ruleCreated'));
      }
      setModalOpen(false);
    } catch (e) {
      showToast(translateError(e), true);
    }
  }, [editingRule, createRule, updateRule, showToast, t, translateError]);

  const handleDelete = useCallback(async (rule) => {
    try {
      await deleteRule(rule.id);
      showToast(t('app.toast.ruleDeleted'));
    } catch (e) {
      showToast(translateError(e), true);
    }
  }, [deleteRule, showToast, t, translateError]);

  const handleToggle = useCallback(async (rule) => {
    try {
      await toggleRule(rule.id);
    } catch (e) {
      showToast(translateError(e), true);
    }
  }, [toggleRule, showToast, translateError]);

  return (
    <Frame>
      <Page
        title={t('app.title')}
        subtitle={t('app.subtitle')}
        primaryAction={{ content: t('app.newRule'), onAction: handleCreate }}
      >
        <Layout>
          <Layout.Section>
            <BillingBanner
              loading={billing.loading}
              active={billing.active}
              plan={billing.plan}
              pricingUrl={billing.pricingUrl}
            />
          </Layout.Section>
          <Layout.Section>
            <SyncCard
              lastSyncedAt={lastSyncedAt}
              syncing={syncing}
              result={result}
              onSync={async () => {
                const res = await sync();
                showToast(res.ok ? t('app.toast.synced') : t('app.toast.syncFailed'), !res.ok);
              }}
            />
          </Layout.Section>
          <Layout.Section>
            <CombinedShippingCard
              status={combined.status}
              saving={combined.saving}
              error={combined.error}
              onSave={async (body) => {
                const ok = await combined.save(body);
                showToast(ok ? t('app.toast.combinedSaved') : t('app.toast.saveFailed'), !ok);
              }}
            />
          </Layout.Section>
          <Layout.Section>
            <RuleList
              rules={rules}
              loading={loading}
              error={error}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          </Layout.Section>
        </Layout>

        {modalOpen && (
          <RuleFormModal
            rule={editingRule}
            onSave={handleSave}
            onClose={() => setModalOpen(false)}
          />
        )}

        {toast && (
          <Toast content={toast.message} error={toast.error} onDismiss={() => setToast(null)} />
        )}
      </Page>
    </Frame>
  );
}
