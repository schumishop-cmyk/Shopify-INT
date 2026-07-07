#!/usr/bin/env node
/**
 * npm run setup
 *
 * Vollautomatisches Setup für einen frischen Deploy.
 * Führt alle Schritte aus und gibt am Ende eine Zusammenfassung aus.
 *
 * Benötigte Umgebungsvariablen (in .env oder Shell):
 *   SHOPIFY_SHOP_DOMAIN   z.B. lokalsportfan.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  shpat_...  (benötigt Scope: write_shipping, write_script_tags)
 *   SHOPIFY_API_KEY       aus dem Shopify Partner Dashboard
 *   SHOPIFY_API_SECRET    aus dem Shopify Partner Dashboard
 *   PUBLIC_URL            https://deine-app.railway.app
 */

require('dotenv').config();
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ── ANSI helpers ─────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

const ok   = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.gray}→${c.reset} ${msg}`);
const step = (n, title) => console.log(`\n${c.bold}${c.cyan}[${n}/7]${c.reset}${c.bold} ${title}${c.reset}`);

const results = [];
function record(label, status, detail = '') {
  results.push({ label, status, detail });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shopifyRequest(method, shopPath, token, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: process.env.SHOPIFY_SHOP_DOMAIN,
      path: shopPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function runCmd(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — Node.js version & .env
// ═══════════════════════════════════════════════════════════════════════════════
step(1, 'Umgebung prüfen');

const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeVersion < 18) {
  fail(`Node.js 18+ erforderlich, gefunden: ${process.versions.node}`);
  process.exit(1);
}
ok(`Node.js ${process.versions.node}`);

const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  warn('.env nicht gefunden — bitte aus .env.example kopieren und ausfüllen');
  warn('  cp .env.example .env');
} else {
  ok('.env vorhanden');
}

const REQUIRED_VARS = {
  SHOPIFY_SHOP_DOMAIN:    'z.B. lokalsportfan.myshopify.com',
  SHOPIFY_ACCESS_TOKEN:   'shpat_...',
  SHOPIFY_API_KEY:        'aus dem Partner Dashboard',
  SHOPIFY_API_SECRET:     'aus dem Partner Dashboard',
  PUBLIC_URL:             'https://deine-app.railway.app',
  CARRIER_SERVICE_SECRET: 'sichert den Carrier-Endpunkt ab (32+ zufällige Zeichen)',
};

let missingVars = false;
for (const [key, hint] of Object.entries(REQUIRED_VARS)) {
  if (!process.env[key]) {
    fail(`${key} fehlt  (${hint})`);
    missingVars = true;
  } else {
    const val = key.includes('SECRET') || key.includes('TOKEN')
      ? process.env[key].slice(0, 8) + '…'
      : process.env[key];
    ok(`${key} = ${val}`);
  }
}

if (missingVars) {
  console.log(`\n${c.red}Abbruch: Bitte alle fehlenden Variablen in .env setzen.${c.reset}`);
  process.exit(1);
}

record('Umgebung', 'ok');

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — npm install (Backend)
// ═══════════════════════════════════════════════════════════════════════════════
step(2, 'Backend-Abhängigkeiten installieren');

const rootModules = path.resolve(__dirname, '../node_modules');
if (fs.existsSync(rootModules)) {
  ok('node_modules vorhanden — überspringe npm install');
  record('Backend npm install', 'skipped', 'node_modules bereits vorhanden');
} else {
  info('Führe npm install aus…');
  const r = runCmd('npm install', { cwd: path.resolve(__dirname, '..') });
  if (r.status !== 0) {
    fail('npm install fehlgeschlagen');
    record('Backend npm install', 'fail');
    process.exit(1);
  }
  ok('npm install erfolgreich');
  record('Backend npm install', 'ok');
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — Frontend bauen
// ═══════════════════════════════════════════════════════════════════════════════
step(3, 'Frontend bauen (React + Polaris)');

const publicDir = path.resolve(__dirname, '../public');
const frontendModules = path.resolve(__dirname, '../frontend/node_modules');

if (fs.existsSync(publicDir) && fs.readdirSync(publicDir).length > 0) {
  ok('public/ bereits vorhanden — überspringe Build');
  info('Um neu zu bauen: rm -rf public/ && npm run build');
  record('Frontend-Build', 'skipped', 'public/ bereits vorhanden');
} else {
  if (!fs.existsSync(frontendModules)) {
    info('Frontend npm install…');
    const ri = runCmd('npm install', { cwd: path.resolve(__dirname, '../frontend') });
    if (ri.status !== 0) { fail('Frontend npm install fehlgeschlagen'); process.exit(1); }
  }
  info('Vite Build…');
  const rb = runCmd('npm run build', { cwd: path.resolve(__dirname, '../frontend') });
  if (rb.status !== 0) {
    fail('Frontend-Build fehlgeschlagen');
    record('Frontend-Build', 'fail');
    process.exit(1);
  }
  ok('Frontend gebaut → public/');
  record('Frontend-Build', 'ok');
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — Datenbank initialisieren
// ═══════════════════════════════════════════════════════════════════════════════
step(4, 'Datenbank initialisieren');

try {
  const db = require('../src/db/database');
  const { count } = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get();
  ok(`SQLite bereit (${count} Tabellen)`);
  record('Datenbank', 'ok', `${count} Tabellen`);
} catch (err) {
  fail(`Datenbank-Fehler: ${err.message}`);
  record('Datenbank', 'fail', err.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 — Carrier Service registrieren
// ═══════════════════════════════════════════════════════════════════════════════
step(5, 'Carrier Service bei Shopify registrieren');

(async () => {
  const SHOP    = process.env.SHOPIFY_SHOP_DOMAIN;
  const TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
  const PUBLIC  = process.env.PUBLIC_URL;

  // Prüfen ob bereits registriert
  const list = await shopifyRequest('GET', '/admin/api/2024-01/carrier_services.json', TOKEN);
  const existing = (list.body?.carrier_services || []).find(
    (s) => s.callback_url.includes('/api/carrier-service')
  );

  if (existing) {
    ok(`Carrier Service bereits registriert (ID: ${existing.id})`);
    ok(`Callback: ${existing.callback_url}`);
    record('Carrier Service', 'skipped', `ID ${existing.id}`);
  } else {
    const callbackParams = new URLSearchParams({ shop: SHOP, token: process.env.CARRIER_SERVICE_SECRET });
    const callbackUrl = `${PUBLIC}/api/carrier-service?${callbackParams}`;
    const res = await shopifyRequest('POST', '/admin/api/2024-01/carrier_services.json', TOKEN, {
      carrier_service: {
        name: 'Mybridge Versandregeln',
        callback_url: callbackUrl,
        service_discovery: true,
        format: 'json',
      },
    });

    if (res.status === 201) {
      ok(`Carrier Service registriert (ID: ${res.body.carrier_service.id})`);
      ok(`Callback: ${callbackUrl.replace(process.env.CARRIER_SERVICE_SECRET, '***')}`);

      // ID in DB speichern
      try {
        const db = require('../src/db/database');
        db.prepare('UPDATE shops SET carrier_service_id = ? WHERE shop = ?')
          .run(res.body.carrier_service.id, SHOP);
      } catch { /* Shop noch nicht in DB — OK beim ersten Setup */ }

      record('Carrier Service', 'ok', `ID ${res.body.carrier_service.id}`);
    } else if (res.status === 422) {
      warn('Carrier Service konnte nicht registriert werden.');
      warn('Mögliche Ursache: Basic-Plan ohne "Third-party calculated shipping rates"');
      warn('Lösung: Shopify Admin → Einstellungen → Versand → Trägertarife aktivieren');
      record('Carrier Service', 'warn', 'Plan-Einschränkung');
    } else {
      fail(`Fehler ${res.status}: ${JSON.stringify(res.body)}`);
      record('Carrier Service', 'fail', `HTTP ${res.status}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 6 — app/uninstalled Webhook registrieren
  // ═════════════════════════════════════════════════════════════════════════════
  step(6, 'Webhooks registrieren');

  // Die drei GDPR-Compliance-Webhooks (customers/data_request, customers/redact,
  // shop/redact) können NICHT über die Admin API registriert werden — Shopify
  // erlaubt das nur über das Partner Dashboard oder shopify.app.toml.
  info('GDPR-Webhooks werden über shopify.app.toml / Partner Dashboard verwaltet — nicht per API.');
  record('GDPR-Webhooks', 'skipped', 'via shopify.app.toml');

  const webhooks = [
    { topic: 'app/uninstalled', address: `${PUBLIC}/webhooks/app/uninstalled` },
  ];

  const existingHooks = await shopifyRequest('GET', '/admin/api/2024-01/webhooks.json', TOKEN);
  const registeredAddresses = new Set(
    (existingHooks.body?.webhooks || []).map((w) => w.address)
  );

  for (const wh of webhooks) {
    if (registeredAddresses.has(wh.address)) {
      ok(`${wh.topic} — bereits registriert`);
      record(`Webhook ${wh.topic}`, 'skipped');
      continue;
    }

    const r = await shopifyRequest('POST', '/admin/api/2024-01/webhooks.json', TOKEN, {
      webhook: { topic: wh.topic, address: wh.address, format: 'json' },
    });

    if (r.status === 201) {
      ok(`${wh.topic} (ID: ${r.body.webhook.id})`);
      record(`Webhook ${wh.topic}`, 'ok');
    } else if (r.status === 422 && JSON.stringify(r.body).includes('already')) {
      ok(`${wh.topic} — bereits vorhanden`);
      record(`Webhook ${wh.topic}`, 'skipped');
    } else {
      warn(`${wh.topic} — Fehler ${r.status} (${JSON.stringify(r.body?.errors || r.body)})`);
      record(`Webhook ${wh.topic}`, 'warn', `HTTP ${r.status}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 7 — Zusammenfassung
  // ═════════════════════════════════════════════════════════════════════════════
  step(7, 'Zusammenfassung');

  const icons = { ok: `${c.green}✓${c.reset}`, skipped: `${c.gray}–${c.reset}`, warn: `${c.yellow}⚠${c.reset}`, fail: `${c.red}✗${c.reset}` };
  for (const r of results) {
    console.log(`  ${icons[r.status] || '?'} ${r.label}${r.detail ? c.gray + '  ' + r.detail + c.reset : ''}`);
  }

  const hasFailures = results.some((r) => r.status === 'fail');
  const hasWarnings = results.some((r) => r.status === 'warn');

  console.log('');
  if (hasFailures) {
    console.log(`${c.red}${c.bold}Setup fehlgeschlagen. Bitte Fehler oben beheben.${c.reset}`);
    process.exit(1);
  }

  if (hasWarnings) {
    console.log(`${c.yellow}${c.bold}Setup abgeschlossen mit Warnungen.${c.reset}`);
  } else {
    console.log(`${c.green}${c.bold}Setup erfolgreich abgeschlossen!${c.reset}`);
  }

  console.log(`
${c.bold}Nächste Schritte:${c.reset}
  1. App starten:          ${c.cyan}npm start${c.reset}
  2. Im Shopify Admin:     Einstellungen → Versand → Carrier aktivieren
  3. App installieren:     ${c.cyan}${PUBLIC}/auth/begin?shop=${SHOP}${c.reset}
  4. Admin-UI öffnen:      ${c.cyan}${PUBLIC}/?shop=${SHOP}${c.reset}

${c.bold}Nützliche Befehle:${c.reset}
  npm start          Server starten
  npm run dev        Entwicklungsmodus (nodemon)
  npm test           Tests ausführen
  npm run build      Frontend neu bauen
  npm run unregister Carrier Service entfernen
`);

})().catch((err) => {
  fail(`Unerwarteter Fehler: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
