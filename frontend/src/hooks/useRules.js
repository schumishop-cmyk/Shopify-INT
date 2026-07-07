import { useState, useEffect, useCallback } from 'react';

/**
 * Session tokens expire after 60 seconds, so we fetch a fresh one from
 * App Bridge for every request. window.shopify is provided by the
 * app-bridge.js CDN script loaded in index.html (only available when the
 * app runs embedded in the Shopify admin).
 */
async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.shopify?.idToken) {
    headers.Authorization = `Bearer ${await window.shopify.idToken()}`;
  }
  return headers;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: await authHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { message = (await res.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  return res.json();
}

export function useRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api('/api/rules');
      setRules(data.rules || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const createRule = useCallback(async (body) => {
    const data = await api('/api/rules', { method: 'POST', body });
    setRules((prev) => [...prev, data.rule].sort((a, b) => a.priority - b.priority));
    return data.rule;
  }, []);

  const updateRule = useCallback(async (id, body) => {
    const data = await api(`/api/rules/${id}`, { method: 'PUT', body });
    setRules((prev) => prev.map((r) => (r.id === id ? data.rule : r)));
    return data.rule;
  }, []);

  const deleteRule = useCallback(async (id) => {
    await api(`/api/rules/${id}`, { method: 'DELETE' });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleRule = useCallback(async (id) => {
    const data = await api(`/api/rules/${id}/toggle`, { method: 'POST' });
    setRules((prev) => prev.map((r) => (r.id === id ? data.rule : r)));
  }, []);

  return { rules, loading, error, fetchRules, createRule, updateRule, deleteRule, toggleRule };
}
