import { useState, useEffect } from 'react';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.shopify?.idToken) {
    headers.Authorization = `Bearer ${await window.shopify.idToken()}`;
  }
  return headers;
}

/**
 * The shop's own currency and weight unit. Money and weights must be shown the
 * way the merchant already sees them in Shopify — a shop selling in USD with
 * pounds should never see "€" or grams.
 *
 * Starts with neutral defaults so the UI renders immediately and re-renders
 * once the real settings arrive.
 */
export function useShopContext() {
  const [context, setContext] = useState({ currencyCode: 'EUR', weightUnit: 'GRAMS', loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/shop-context', { headers: await authHeaders() });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setContext({
            currencyCode: data.currencyCode || 'EUR',
            weightUnit: data.weightUnit || 'GRAMS',
            loading: false,
          });
          return;
        }
      } catch { /* keep defaults */ }
      if (!cancelled) setContext((c) => ({ ...c, loading: false }));
    })();
    return () => { cancelled = true; };
  }, []);

  return context;
}
