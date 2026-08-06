import { useState, useEffect, useCallback } from 'react';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.shopify?.idToken) {
    headers.Authorization = `Bearer ${await window.shopify.idToken()}`;
  }
  return headers;
}

export function useCombinedShipping() {
  const [status, setStatus] = useState(null); // { deployed, active, config }
  const [saving, setSaving] = useState(false);
  // Holds the whole failure payload ({ errorCode, errorParams, error }) so the
  // UI can render a localized message rather than the server's English text
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/combined-shipping', { headers: await authHeaders() });
      if (res.ok) setStatus(await res.json());
    } catch { /* stays unknown */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (body) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/combined-shipping', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data);
        return false;
      }
      await refresh();
      return true;
    } catch (e) {
      setError({ error: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return { status, saving, error, save };
}
