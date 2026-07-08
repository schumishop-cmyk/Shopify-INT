import { useState, useEffect, useCallback } from 'react';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.shopify?.idToken) {
    headers.Authorization = `Bearer ${await window.shopify.idToken()}`;
  }
  return headers;
}

/**
 * Tracks whether the carrier service is registered for the shop and exposes
 * a retry action. Registration can fail at install time if the shop's plan
 * hasn't enabled carrier-calculated shipping yet, so the merchant may need
 * to retry once that's sorted.
 */
export function useCarrierStatus() {
  const [status, setStatus] = useState(null); // { registered, id, active }
  const [checking, setChecking] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/carrier/status', { headers: await authHeaders() });
      setStatus(res.ok ? await res.json() : null);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const register = useCallback(async () => {
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch('/api/carrier/register', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registrierung fehlgeschlagen');
      await refresh();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setRegistering(false);
    }
  }, [refresh]);

  return { status, checking, registering, error, register, refresh };
}
