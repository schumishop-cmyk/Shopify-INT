import React, { useState, useCallback } from 'react';
import { Page, Layout, Toast, Frame } from '@shopify/polaris';
import RuleList from './components/RuleList';
import RuleFormModal from './components/RuleFormModal';
import { useRules } from './hooks/useRules';

export default function App() {
  const { rules, loading, error, createRule, updateRule, deleteRule, toggleRule } = useRules();
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
        showToast('Regel aktualisiert');
      } else {
        await createRule(data);
        showToast('Regel erstellt');
      }
      setModalOpen(false);
    } catch (e) {
      showToast(e.message, true);
    }
  }, [editingRule, createRule, updateRule, showToast]);

  const handleDelete = useCallback(async (rule) => {
    try {
      await deleteRule(rule.id);
      showToast('Regel gelöscht');
    } catch (e) {
      showToast(e.message, true);
    }
  }, [deleteRule, showToast]);

  const handleToggle = useCallback(async (rule) => {
    try {
      await toggleRule(rule.id);
    } catch (e) {
      showToast(e.message, true);
    }
  }, [toggleRule, showToast]);

  return (
    <Frame>
      <Page
        title="Versandregeln"
        subtitle="Definiere dynamische Versandkosten für deinen Shop"
        primaryAction={{ content: 'Neue Regel', onAction: handleCreate }}
      >
        <Layout>
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
