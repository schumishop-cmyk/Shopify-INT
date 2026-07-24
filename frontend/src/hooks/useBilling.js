import { useState, useEffect, useCallback } from 'react';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.shopify?.idToken) {
    headers.Authorization = `Bearer ${await window.shopify.idToken()}`;
  }
  return headers;
}

/**
 * Reads the shop's Managed Pricing subscription state.
 * { active, plan, pricingUrl } — `active` gates the upgrade prompt, `pricingUrl`
 * points at Shopify's hosted plan-selection page.
 */
export function useBilling() {
  const [state, setState] = useState({ loading: true, active: false, plan: null, pricingUrl: null });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/billing', { headers: await authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setState({ loading: false, active: Boolean(data.active), plan: data.plan || null, pricingUrl: data.pricingUrl || null });
        return;
      }
    } catch { /* fall through to loaded-unknown */ }
    setState((s) => ({ ...s, loading: false }));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
