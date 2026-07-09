import { useState, useEffect, useCallback } from 'react';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.shopify?.idToken) {
    headers.Authorization = `Bearer ${await window.shopify.idToken()}`;
  }
  return headers;
}

/**
 * Drives the "rules → native delivery profile" sync: last-sync timestamp,
 * the sync action itself, and any warnings the compiler reported.
 */
export function useSync() {
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null); // { ok, createdRates, warnings, error }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status', { headers: await authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLastSyncedAt(data.lastSyncedAt);
      }
    } catch { /* status stays unknown */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: await authHeaders() });
      const data = await res.json();
      setResult(data);
      if (data.ok) await refresh();
      return data;
    } catch (e) {
      const failure = { ok: false, error: e.message };
      setResult(failure);
      return failure;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  return { lastSyncedAt, syncing, result, sync };
}
