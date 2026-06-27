const { Router } = require('express');

const router = Router();

/** Privacy Policy — required for Shopify App Store listing */
router.get('/privacy-policy', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>Datenschutzerklärung – Shopify-INT</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:2rem}</style>
</head>
<body>
<h1>Datenschutzerklärung – Shopify-INT Versandregeln</h1>
<p><strong>Stand:</strong> ${new Date().toLocaleDateString('de-DE')}</p>

<h2>1. Verantwortlicher</h2>
<p>Diese App wird bereitgestellt von: Shopify-INT / schumishop@gmail.com</p>

<h2>2. Welche Daten wir speichern</h2>
<p>Wir speichern ausschließlich:</p>
<ul>
  <li>Den Shopify-Shop-Domainnamen (z.B. <em>shop.myshopify.com</em>)</li>
  <li>Den OAuth-Zugriffstoken für die Shopify Admin API</li>
  <li>Die vom Händler konfigurierten Versandregeln (kein Bezug zu Endkunden)</li>
</ul>
<p>Wir speichern <strong>keine</strong> personenbezogenen Daten von Endkunden (Käufern).</p>

<h2>3. Zweck der Verarbeitung</h2>
<p>Die gespeicherten Daten werden ausschließlich verwendet, um dynamische Versandkosten
bei Shopify-Checkouts bereitzustellen.</p>

<h2>4. Weitergabe an Dritte</h2>
<p>Daten werden nicht an Dritte weitergegeben.</p>

<h2>5. Löschung</h2>
<p>Bei Deinstallation der App werden alle zugehörigen Daten innerhalb von 48 Stunden
automatisch gelöscht (GDPR Shop Redact Webhook).</p>

<h2>6. Kontakt</h2>
<p>Bei Fragen: <a href="mailto:schumishop@gmail.com">schumishop@gmail.com</a></p>
</body></html>`);
});

/** Terms of Service */
router.get('/terms', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>AGB – Shopify-INT</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style>
</head>
<body>
<h1>Nutzungsbedingungen – Shopify-INT Versandregeln</h1>
<p>Durch die Nutzung dieser App erklärst du dich mit diesen Bedingungen einverstanden.</p>
<h2>1. Leistungsumfang</h2>
<p>Die App stellt einen Carrier Service für Shopify bereit, der dynamische Versandkosten
auf Basis konfigurierbarer Regeln berechnet.</p>
<h2>2. Voraussetzungen</h2>
<p>Die Nutzung des Carrier Service erfordert einen Shopify-Plan, der
"Third-party calculated shipping rates" unterstützt.</p>
<h2>3. Haftungsausschluss</h2>
<p>Die App wird ohne Gewährleistung bereitgestellt. Für falsch berechnete
Versandkosten übernehmen wir keine Haftung.</p>
<h2>4. Kontakt</h2>
<p><a href="mailto:schumishop@gmail.com">schumishop@gmail.com</a></p>
</body></html>`);
});

module.exports = router;
