# Combined Shipping — Function-Extension deployen

Diese Checkout-Function kombiniert Versandkosten bei Bestellungen aus
mehreren Standorten. Sie wird **nicht** über Railway deployt, sondern
einmalig (und nach jeder Logik-Änderung) mit der Shopify CLI.

## Voraussetzungen

- Node.js 18+ und die Shopify CLI: `npm install -g @shopify/cli`
- Du bist im Projekt-Root ausgecheckt und mit deiner App verknüpft
  (`shopify.app.toml` enthält bereits die richtige `client_id`).

## Deploy (aus dem Projekt-Root)

```bash
cd extensions/combined-shipping
npm install
shopify app function schema     # erzeugt schema.graphql (Pflicht für den JS-Build)
cd ../..
shopify app deploy              # baut die Function zu WASM und released eine neue App-Version
```

`shopify app function schema` liest API-Typ und -Version aus
`shopify.extension.toml` und schreibt die passende `schema.graphql`.
Ohne diese Datei schlägt der Codegen-Schritt des Builds fehl.

## Danach

1. App wegen des neuen `write_discounts`-Scopes einmal neu autorisieren:
   `https://<PUBLIC_URL>/auth/begin?shop=<shop>.myshopify.com`
2. In der App unter „Kombinierte Versandkosten" den Modus wählen und
   **Speichern** — das legt den automatischen Rabatt an, der diese
   Function aktiviert.
