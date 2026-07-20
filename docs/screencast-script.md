# Screencast-Drehbuch — App Store Demo-Video

**Ziel:** 3–8 Min (Zielmarke ~4–5 Min). Zeigt Merchant-Flow (Admin) **und**
Customer-Flow (Checkout). Ruhige Umgebung, kein lauter Hintergrund.

**Aufnahme:** Loom (Tab + Mikrofon) oder OBS → YouTube „nicht gelistet".
Auflösung mind. 1280×720, besser 1920×1080. Browser-Zoom auf 100 %.

**Vorbereitung im Store (Red Onion dev) — muss vor dem Dreh stehen:**
- App installiert und im Admin geöffnet
- Mind. 2 Standorte angelegt
- 1 Produkt mit Vendor „TestFulfillment" (nur an Standort 2 lagernd)
- 1 „normales" Produkt (nur an Standort 1 lagernd)
- 1 Produkt mit Tag `sperrgut`
- Test-Checkout möglich (Storefront erreichbar)

> Tipp: Vorher einmal trocken durchklicken. Nummernblock-Tabs vorbereiten,
> damit du im Video nicht suchst. Sprich langsam und in ganzen Sätzen.

---

## Szene 1 — Intro (ca. 15 Sek)

**Bild:** App im Shopify-Admin geöffnet (Regeltabelle sichtbar).

**Sprich:**
> „Das ist Shipping Rules — eine App, mit der du deine Versandkosten per
> Regel festlegst, ohne Plan-Upgrade und ohne Carrier-API. Ihr Highlight:
> Sie verhindert doppelte Versandkosten, wenn eine Bestellung aus mehreren
> Lagern kommt. Ich zeige dir zuerst die Händler-Seite, danach den
> Checkout aus Kundensicht."

---

## Szene 2 — Onboarding / Regeln ansehen (ca. 45 Sek)

**Bild:** Regeltabelle. Scrolle einmal ruhig durch.

**Sprich:**
> „Nach der Installation sind bereits Standard-Versandregeln angelegt.
> Jede Regel hat eine Zone, optionale Bedingungen wie Gewicht oder
> Warenkorbwert, und einen Preis. Eine Freiversand-Grenze lege ich
> einfach als Regel mit Preis null ab einem bestimmten Bestellwert an."

**Aktion:** Öffne eine Regel zum Bearbeiten. Zeige die Felder (Zone,
Gewicht/Wert, Preis). Ändere z. B. den Preis, klicke **Speichern**.

**Sprich:**
> „Ich bearbeite hier kurz eine Regel und speichere. Alles passiert in
> einer übersichtlichen Oberfläche — keine CSV-Tabellen."

---

## Szene 3 — Sync in native Versandprofile (ca. 45 Sek)

**Bild:** Die Sync-Karte in der App.

**Aktion:** Klicke **Synchronisieren**. Warte auf die Erfolgsmeldung.

**Sprich:**
> „Mit einem Klick schreibt die App diese Regeln in die nativen
> Shopify-Versandprofile. Das ist wichtig: Es sind echte Shopify-Tarife,
> keine Carrier-API — deshalb funktioniert es auf jedem Plan, auch Basic."

**Aktion:** Wechsle in **Einstellungen → Versand und Zustellung**. Zeige,
dass die Tarife dort nun stehen.

**Sprich:**
> „Und hier in den Shopify-Versandeinstellungen sieht man das Ergebnis —
> die Tarife aus meinen Regeln sind live."

---

## Szene 4 — Kombinierter Versand einrichten (ca. 50 Sek)

**Bild:** Zurück in die App, Karte „Kombinierte Versandkosten".

**Sprich:**
> „Jetzt das Kernproblem, das diese App löst. Wenn du aus deinem eigenen
> Lager UND über einen Fulfillment-Partner verschickst — zum Beispiel
> Print-on-Demand — dann addiert Shopify normalerweise die Versandkosten
> beider Standorte. Der Kunde zahlt doppelt."

**Aktion:** Trage in der Karte den Vendor „TestFulfillment" ein und die
Rate/den Modus (nur höchste Rate ODER kleine Pauschale). Klicke **Speichern**.

**Sprich:**
> „Ich sage der App: Produkte mit dem Vendor ‚TestFulfillment' kommen vom
> Partner. Und ich lege fest, dass bei gemischten Bestellungen nur die
> höchste Rate berechnet wird statt beide zu addieren. Speichern — fertig.
> Im Hintergrund erstellt die App dafür eine automatische Rabatt-Funktion."

---

## Szene 5 — Sperrgut per Tag (ca. 30 Sek)

**Bild:** Ein Produkt mit dem Tag `sperrgut` (kurz im Produkt zeigen), dann
zurück in die App.

**Sprich:**
> „Noch eine Funktion: Sperrgut. Produkte mit einem Tag — hier ‚sperrgut' —
> bekommen automatisch ein eigenes Versandprofil mit eigenen Raten. Ich
> synchronisiere erneut …"

**Aktion:** Sync klicken. Dann in **Einstellungen → Versand** das neue
Profil („App: Aufpreis für Sperrgut-Produkte") zeigen.

**Sprich:**
> „… und die App hat ein separates Profil für die Sperrgut-Artikel angelegt."

---

## Szene 6 — Customer-Flow: Checkout (ca. 60 Sek) — WICHTIGSTE SZENE

**Bild:** Storefront. Lege ein „normales" Produkt (Standort 1) UND das
„TestFulfillment"-Produkt (Standort 2) in den Warenkorb.

**Sprich:**
> „Und jetzt aus Kundensicht. Ich habe zwei Produkte im Warenkorb: eines
> aus meinem Lager, eines vom Fulfillment-Partner — also eine gemischte
> Bestellung aus zwei Standorten."

**Aktion:** Gehe zum **Checkout**. Zeige den Versandschritt. Zeige, dass
die App-Rabattzeile „Kombinierter Versand" die doppelten Kosten korrigiert.

**Sprich:**
> „Im Checkout sieht man: Ohne die App würden beide Versandkosten addiert.
> Mit der App greift die Rabattzeile ‚Kombinierter Versand' — der Kunde
> zahlt nur den fairen Preis, den ich vorhin festgelegt habe. Genau das
> reduziert Kaufabbrüche wegen zu hoher Versandkosten."

---

## Szene 7 — Outro (ca. 15 Sek)

**Bild:** Zurück in der App-Übersicht.

**Sprich:**
> „Zusammengefasst: Versandregeln mit Freiversand-Grenzen, Ein-Klick-Sync
> in native Profile, Sperrgut per Tag — und als Alleinstellungsmerkmal der
> kombinierte Versand bei mehreren Lagern. Auf jedem Shopify-Plan. Danke
> fürs Zuschauen."

---

## Nach dem Dreh

1. Video hochladen (Loom-Link kopieren, oder YouTube „nicht gelistet").
2. URL prüfen: In einem privaten Browserfenster öffnen — läuft das Video
   ohne Login? (Loom-Freigabe „anyone with the link"; YouTube „nicht
   gelistet", nicht „privat".)
3. Diese URL ins Feld **Screencast URL** eintragen.
