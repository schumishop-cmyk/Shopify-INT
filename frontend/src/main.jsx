import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import App from './App';
import { I18nProvider, useI18n } from './i18n';
import { useShopContext } from './hooks/useShopContext';

const params = new URLSearchParams(window.location.search);
const shop = params.get('shop') || '';
const host = params.get('host') || '';
// Shopify passes the merchant's admin language here (e.g. "de-DE", "en")
const locale = params.get('locale') || navigator.language || 'en';

/** Polaris needs its own locale bundle, chosen by the same resolved language. */
function LocalizedPolaris({ children }) {
  const { polarisI18n } = useI18n();
  return <AppProvider i18n={polarisI18n}>{children}</AppProvider>;
}

/**
 * Language comes from the merchant's admin locale, while currency and weight
 * unit come from the shop's own settings — they're independent (a German-
 * speaking merchant may well sell in USD).
 */
function Root() {
  const { currencyCode, weightUnit } = useShopContext();

  return (
    <I18nProvider locale={locale} currencyCode={currencyCode} weightUnit={weightUnit}>
      <LocalizedPolaris>
        <App shop={shop} host={host} />
      </LocalizedPolaris>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
