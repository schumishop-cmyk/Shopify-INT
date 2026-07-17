# App-Store-Einreichung — Checkliste & Vorlagen

Stand: Juli 2026 · App: **MyBridge** (`client_id 9193536353d7d304a0c2414989304fb1`) im Partner-Konto

> **Hinweis:** Die App wurde ursprünglich als "Shipping Rules App" unter
> einer Merchant-Organisation entwickelt. Merchant-Organisationen haben
> keinen Zugang zum Partner Dashboard (kein `App distribution`-Menü) —
> App-Store-Einreichung erfordert eine echte Partner-Organisation. Deshalb
> läuft die Distribution jetzt über die App **MyBridge** im Partner-Konto;
> `shopify.app.toml` zeigt entsprechend auf deren `client_id`.

## 1. Technische Voraussetzungen (Status)

| Anforderung | Status |
|---|---|
| OAuth-Installation ohne Fehler | ✅ |
| Embedded mit App Bridge + Session-Token-Auth | ✅ |
| GDPR-Webhook-Endpunkte implementiert & HMAC-verifiziert | ✅ |
| `frame-ancestors`-CSP (Clickjacking) | ✅ |
| Datenschutzerklärung erreichbar | ✅ `/privacy-policy` |
| AGB erreichbar | ✅ `/terms` |
| Uninstall räumt auf (`app/uninstalled` + `shop/redact`) | ✅ |

## 2. Im Dev Dashboard erledigen (einmalig, manuell)

1. **Compliance-Webhooks:** stehen in `shopify.app.toml` unter
   `[webhooks.privacy_compliance]` und werden mit `shopify app deploy`
   als App-Version gesetzt (im neuen Dev Dashboard gibt es dafür kein
   Einstellungs-Formular — Kontrolle: Versionen → aktive Version, dort
   müssen die drei URLs erscheinen).
2. **App-URL / Redirect-URL** prüfen (sollten bereits stimmen)
3. **App-Symbol** hochladen (Einstellungen → App-Symbol, 1200×1200 PNG/JPG)
4. **Distribution** auf „Shopify App Store" stellen → Listing anlegen

## 3. Listing-Inhalte (Vorlagen zum Anpassen)

**App-Name:** Shipping Rules App — Erweiterte Versandregeln

**Tagline (max. ~62 Zeichen):**
> Versandregeln, Freigrenzen & kombinierter Multi-Standort-Versand

**Beschreibung (Entwurf):**
> Lege Versandkosten so fest, wie dein Geschäft funktioniert — ohne
> Plan-Upgrade und ohne Carrier-API.
>
> **Regeln statt Tabellenpflege:** Definiere Zonen, Gewichts- und
> Preisstaffeln und Freiversandgrenzen in einer übersichtlichen Oberfläche.
> Ein Klick synchronisiert alles in deine nativen Shopify-Versandprofile.
>
> **Schluss mit doppelten Versandkosten:** Verschickst du aus eigenem Lager
> UND über einen Fulfillment-Partner (z.B. Print-on-Demand)? Shopify
> addiert dann die Versandkosten beider Standorte. Diese App erkennt
> gemischte Bestellungen automatisch und berechnet stattdessen deinen
> Wunschpreis — nur die teuerste Rate oder eine kleine Pauschale pro
> zusätzlichem Standort.
>
> **Sperrgut ohne Kopfschmerzen:** Produkte mit einem Tag (z.B. „sperrgut")
> bekommen automatisch ihr eigenes Versandprofil mit eigenen Raten.
>
> Funktioniert auf jedem Shopify-Plan — auch Basic.

**Feature-Bullets:**
- Versandregeln mit Zonen, Gewicht, Warenkorbwert und Freigrenzen
- Ein-Klick-Sync in native Shopify-Versandprofile (kein CCS nötig)
- Kombinierte Versandkosten bei Bestellungen aus mehreren Standorten
- Sperrgut-/Tag-basierte Sonderraten, automatisch zugeordnet
- Läuft auf allen Plänen, inkl. Basic

**Kategorie:** Orders and shipping → Shipping rates & calculator

## 4. Assets (musst du erstellen)

- **App-Icon** 1200×1200 (kein Shopify-Logo/-Trademark verwenden)
- **3–6 Screenshots** 1600×900 der Admin-UI: Regelliste, Regelformular,
  Sync-Erfolg, Combined-Shipping-Karte, Checkout mit „Kombinierter Versand"
- Optional: Demo-Video (erhöht Conversion & hilft dem Reviewer)

## 5. Review-Notizen (ins Feld „Anweisungen für den Test" kopieren)

> Die App schreibt Versandregeln in native Delivery-Profile und korrigiert
> Multi-Origin-Versandkosten per Discount Function.
>
> Test-Ablauf:
> 1. App installieren → im Adminbereich öffnen. Standardregeln sind
>    vorkonfiguriert.
> 2. „Synchronisieren" klicken → unter Einstellungen → Versand entstehen
>    die Tarife (Bedingungen aus den Regeln).
> 3. Kombinierter Versand: Shop braucht 2 Standorte; Produkt A nur an
>    Standort 1 lagernd, Produkt B nur an Standort 2, Produkt B mit
>    Vendor „TestFulfillment". In der App-Karte „Kombinierte
>    Versandkosten" diesen Vendor + Rate des zweiten Standorts eintragen,
>    speichern. Checkout mit beiden Produkten zeigt den Rabatt
>    „Kombinierter Versand".
> 4. Tag-Regel: einem Produkt den Tag „sperrgut" geben → synchronisieren →
>    eigenes Profil „App: Aufpreis für Sperrgut-Produkte" entsteht.
>
> Es werden keine Endkunden-Daten gespeichert (nur Shop-Domain, Token,
> Regelkonfiguration). shop/redact löscht alle Shop-Daten.

## 6. Bekannte Review-Fragen & Antworten

- **Warum `read_products`?** Tag-Regeln suchen Produkte per Tag, um sie
  produktspezifischen Versandprofilen zuzuordnen.
- **Warum `read_locations`?** App-eigene Versandprofile brauchen die
  Standort-IDs des Shops als Versandursprünge.
- **Warum `write_discounts`?** Der kombinierte Versand läuft über einen
  automatischen App-Rabatt (Shipping-Discount-Function).
- **Billing:** App ist (zunächst) kostenlos — keine Billing-API nötig.
  Bei späterer Monetarisierung: Managed Pricing oder Billing API nachrüsten.

## 7. Nach der Einreichung

Review dauert erfahrungsgemäß einige Werktage bis ~2 Wochen; Rückfragen
kommen als E-Mail/Partner-Dashboard-Nachricht. Ablehnungsgründe sind fast
immer konkret benannt und einzeln behebbar — Fixes pushen, erneut einreichen.
