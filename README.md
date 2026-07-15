# Shipping Rules App

Eine Shopify-App für erweiterte Versandkostenregeln — gebaut für Shops auf
**jedem Plan** (auch Basic), ohne die plan-gebundene CarrierService-API.

## Features

- **Regelverwaltung** (embedded Admin-UI, React + Polaris): Versandzonen,
  Gewichts- und Preisstaffeln, Freiversandgrenzen, mehrere Raten pro Regel
- **Profil-Sync:** kompiliert die Regeln über die Admin-API in Shopifys
  native Versandprofile (`deliveryProfileUpdate`) — bestehende Zonen des
  Händlers werden wiederverwendet, App-Ressourcen werden getrackt und bei
  Re-Syncs sauber ersetzt, Händler-eigene Raten bleiben unangetastet
- **Kombinierter Versand bei mehreren Standorten:** eine Shopify Function
  (Discount API) erkennt gemischte Bestellungen (eigenes Lager +
  Fulfillment-Partner wie Spreadconnect) über den Produkt-Vendor und
  korrigiert die von Shopify aufsummierten Versandkosten — z.B. „nur die
  teuerste Rate zahlen" oder „Pauschale pro zusätzlichem Standort"
- **Sperrgut-/Tag-Regeln:** Regeln mit Produkt-Tags werden zu
  produktspezifischen Versandprofilen; die App sucht die Produkte per Tag
  (ODER-Semantik) und ordnet die Varianten automatisch zu

## Architektur

```
frontend/            React + Polaris (Vite) → build nach public/
src/
  server.js          Express: Auth, API, Webhooks, CSP, statisches Frontend
  routes/
    auth.js          OAuth (legacy flow) + Install-Seeding + Uninstall-Webhook
    webhooks.js      GDPR- & Uninstall-Webhooks (HMAC-verifiziert)
    api/rules.js     CRUD + POST /preview (Rate-Simulation)
    api/sync.js      POST /api/sync → Profil-Sync
    api/combinedShipping.js  Discount-Function aktivieren/konfigurieren
  shopify/
    profileSync.js   Regeln → Default-Versandprofil (buildSyncPlan ist pure)
    tagProfileSync.js  Tag-Regeln → produktspezifische Profile
    combinedShipping.js  DiscountAutomaticApp + Config-Metafield
    adminGraphql.js  Minimaler Admin-API-Client (2026-01)
  middleware/        App-Bridge-Session-Token-Verifikation (HS256)
  rules/engine.js    Regel-Evaluierung (für die Vorschau)
  db/                SQLite (better-sqlite3): Shops, Regeln, Sync-Tracking
extensions/
  combined-shipping/ Shopify Function (JS → WASM), Target
                     cart.delivery-options.discounts.generate.run
```

**Multi-Tenant:** Jeder Shop hat eigene Regeln, eigenes Sync-Tracking und
eine eigene Discount-Konfiguration. OAuth-Tokens liegen in SQLite
(Volume `/app/data`).

## Entwicklung

```bash
npm install
npm test                 # Jest, 90+ Tests
npm run build            # Frontend (Vite) → public/
npm run dev              # Server mit nodemon auf :3000
```

Env-Variablen: siehe `.env.example`.

## Deployment

Zwei Deploy-Ziele, ein Repo:

1. **Backend + UI → Railway** (Dockerfile, Auto-Deploy bei Push).
   Persistenz: Volume auf `/app/data` mounten. Env-Vars im Dashboard setzen.
2. **Function + App-Konfiguration → Shopify** (`shopify app deploy`).
   Erstmalig: `cd extensions/combined-shipping && npm install &&
   shopify app function schema`, danach reicht `shopify app deploy`
   aus dem Projekt-Root.

## Scopes

| Scope | Zweck |
|---|---|
| `write_shipping` | Versandprofile lesen/schreiben (Profil-Sync) |
| `write_discounts` | Automatischen Rabatt für die Combined-Shipping-Function anlegen |
| `read_products` | Produkte per Tag für Tag-Regel-Profile finden |
| `read_locations` | Standort-IDs für app-eigene Versandprofile |

Scope-Änderungen erfordern bei bestehenden Installationen einen erneuten
Aufruf von `/auth/begin?shop=<shop>` (Legacy-Install-Flow).

## Sicherheit

- Embedded-API-Routen verifizieren App-Bridge-Session-Tokens (HS256,
  `aud`/`exp`/`dest`-Prüfung) — Shop-Identität kommt nie aus Headern
- Webhooks HMAC-verifiziert (timing-safe)
- `frame-ancestors`-CSP gegen Clickjacking
- GDPR: `customers/data_request`, `customers/redact`, `shop/redact`
  (Datenlöschung bei `shop/redact`), keine Endkunden-PII gespeichert
