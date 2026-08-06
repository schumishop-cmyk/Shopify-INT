import React, { createContext, useContext, useMemo } from 'react';
import polarisDe from '@shopify/polaris/locales/de.json';
import polarisEn from '@shopify/polaris/locales/en.json';
import de from './de.json';
import en from './en.json';

/**
 * Lightweight i18n for the admin UI.
 *
 * Shopify passes the merchant's admin language as the `locale` query param
 * (e.g. "de-DE", "en"), which is the documented way to localize an embedded
 * app. We map it to the closest bundled translation and fall back to English —
 * the App Store's lingua franca — for every locale we don't ship yet.
 *
 * Money and weight are NOT derived from the locale: they follow the shop's own
 * currency and weight-unit settings (see useShopContext), because a German
 * merchant may well sell in USD.
 */

const TRANSLATIONS = { de, en };
const POLARIS_LOCALES = { de: polarisDe, en: polarisEn };
const DEFAULT_LOCALE = 'en';

/** "de-DE" → "de"; unknown languages fall back to English. */
export function resolveLocale(raw) {
  const language = String(raw || '').toLowerCase().split('-')[0];
  return TRANSLATIONS[language] ? language : DEFAULT_LOCALE;
}

/** Grams per unit — Shopify stores weights in grams, merchants think in their own unit. */
const GRAMS_PER_UNIT = {
  GRAMS: 1,
  KILOGRAMS: 1000,
  OUNCES: 28.349523125,
  POUNDS: 453.59237,
};
const WEIGHT_LABELS = { GRAMS: 'g', KILOGRAMS: 'kg', OUNCES: 'oz', POUNDS: 'lb' };

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

function interpolate(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
}

const I18nContext = createContext(null);

export function I18nProvider({ locale, currencyCode = 'EUR', weightUnit = 'GRAMS', children }) {
  const value = useMemo(() => {
    const resolved = resolveLocale(locale);
    const dict = TRANSLATIONS[resolved];
    const fallback = TRANSLATIONS[DEFAULT_LOCALE];
    // Intl needs a full BCP-47 tag; the bare language is a valid one
    const intlLocale = locale || resolved;

    /** Translate a dotted key, with {placeholder} interpolation. */
    const t = (key, values) => {
      const template = lookup(dict, key) ?? lookup(fallback, key);
      if (typeof template !== 'string') return key; // surfaces missing keys instead of crashing
      return values ? interpolate(template, values) : template;
    };

    const moneyFormatter = new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currencyCode,
    });
    const numberFormatter = new Intl.NumberFormat(intlLocale);
    // Country names in the merchant's language, so we don't hardcode them per locale
    let regionNames;
    try {
      regionNames = new Intl.DisplayNames([intlLocale], { type: 'region' });
    } catch {
      regionNames = null; // very old browsers — fall back to the raw code
    }

    const gramsPerUnit = GRAMS_PER_UNIT[weightUnit] || 1;

    /**
     * Renders a backend warning. The API sends { code, params } so the message
     * can be localized here; plain strings are passed through so an older
     * server (or an unexpected shape) still shows something useful.
     */
    const translateWarning = (warning) => {
      if (typeof warning === 'string') return warning;
      if (!warning?.code) return String(warning ?? '');
      return t(`warnings.${warning.code}`, warning.params || {});
    };

    /**
     * Renders a backend error. Prefers the localized text for `errorCode` and
     * falls back to the English `error` string the API always includes.
     */
    const translateError = (result) => {
      if (!result) return '';
      if (typeof result === 'string') return result;
      const { errorCode, errorParams } = result;
      // API responses carry `error`; thrown Errors carry `message`
      const error = result.error || result.message;
      if (!errorCode) return error || '';
      const localized = t(`errors.${errorCode}`, errorParams || {});
      // t() echoes the key back when it's missing — fall back to the server text
      return localized === `errors.${errorCode}` ? (error || localized) : localized;
    };

    return {
      locale: resolved,
      polarisI18n: POLARIS_LOCALES[resolved] || POLARIS_LOCALES[DEFAULT_LOCALE],
      t,
      translateWarning,
      translateError,
      currencyCode,
      weightUnit,
      /** Currency symbol/code for inline use in field labels. */
      currencySymbol: (() => {
        // Extract just the symbol so labels read "Price ($)" not "Price (USD 0.00)"
        const parts = moneyFormatter.formatToParts(0);
        return parts.find((p) => p.type === 'currency')?.value || currencyCode;
      })(),
      weightLabel: WEIGHT_LABELS[weightUnit] || 'g',
      /** ISO country code → localized country name, e.g. "DE" → "Germany". */
      regionName: (code) => {
        try {
          return regionNames?.of(code) || code;
        } catch {
          return code;
        }
      },
      /** Cents → localized currency string. */
      formatMoney: (cents) => moneyFormatter.format((cents || 0) / 100),
      formatNumber: (n) => numberFormatter.format(n),
      /** Grams (storage) → the shop's weight unit (display). */
      gramsToDisplay: (grams) => {
        if (grams == null || grams === '') return '';
        const converted = grams / gramsPerUnit;
        // Keep whole grams clean, allow decimals for lb/oz/kg
        return String(Number.isInteger(converted) ? converted : Number(converted.toFixed(3)));
      },
      /** The shop's weight unit (input) → grams (storage). */
      displayToGrams: (value) => {
        const n = parseFloat(value);
        return Number.isNaN(n) ? undefined : Math.round(n * gramsPerUnit);
      },
      /** Localized date+time, or null when never. */
      formatDateTime: (iso) => {
        if (!iso) return null;
        // SQLite datetime('now') is UTC without a timezone marker
        const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
        return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      },
    };
  }, [locale, currencyCode, weightUnit]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside an I18nProvider');
  return ctx;
}
