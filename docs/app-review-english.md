# App Review — English testing instructions & screencast script

For Shopify App Review item **4.5.3 (demo screencast)**. The reviewer requires
(a) step-by-step testing instructions and (b) an end-to-end demo video in
**English or with English subtitles**.

---

## A. Testing instructions (paste into "App testing information → testing instructions")

**What the app does**
Shipping Rules lets merchants define shipping rates with rules and syncs them
into Shopify's native delivery profiles. Its core feature prevents double
shipping charges when a single order ships from more than one location (e.g.
own warehouse + a print-on-demand / fulfillment partner). Billing is handled
through Shopify Managed Pricing.

**Test account:** The app needs no separate login — authentication is via
Shopify when the app is installed on a store.

**Test store is pre-configured with:** 2 locations; a normal product stocked
only at location 1; a product stocked only at location 2 whose vendor is
"TestFulfillment"; and a product tagged "sperrgut".

**Step-by-step**

1. Install the app from the listing. After the OAuth consent screen you land in
   the embedded admin. Default shipping rules are already seeded.

2. Subscription (Managed Pricing): A banner at the top ("No active plan") has a
   "Choose plan" button that opens Shopify's hosted pricing page. Select a plan
   (reviewers can use the Shopify test charge). The banner then shows
   "Plan active".

3. Rules → Sync: Review the rules list. Click "Synchronize". Open
   Settings → Shipping and delivery — the rates defined by the rules now appear
   in the native delivery profiles.

4. Combined shipping (core feature):
   - Prerequisite: the store has 2 locations; product A is stocked only at
     location 1, product B only at location 2 and product B's vendor is
     "TestFulfillment".
   - In the app's "Combined shipping" card, enter the fulfillment partner
     vendor ("TestFulfillment") and its shipping rate, pick a mode
     (highest rate only / flat surcharge per extra location), and Save.
   - On the storefront, add product A + product B to the cart and go to
     checkout. Without the app, both locations' shipping would be summed; with
     the app a "Combined shipping" discount line corrects the total to the
     configured price.

5. Bulky items by tag: give any product the tag "sperrgut", then click
   "Synchronize". In Settings → Shipping a separate profile
   "App: surcharge for bulky products" is created automatically.

**Data & privacy:** The app stores only the shop domain, the access token, and
the rule configuration — no buyer/customer personal data. Uninstalling the app
(shop/redact webhook) deletes all data for the shop.

---

## B. Screencast script (record narration in English)

Target 3–5 min. Show both the merchant flow (admin) and the customer flow
(checkout). Quiet room, screen at 100% zoom.

**Scene 1 — Intro (~15s)**
> "This is Shipping Rules, a Shopify app that lets you set shipping costs with
> rules — no plan upgrade and no carrier API. Its standout feature prevents
> double shipping charges when an order ships from more than one location.
> I'll show the merchant side first, then the checkout from the customer side."

**Scene 2 — Subscription / onboarding (~30s)**
> "Right after installing, a banner shows the subscription state. I click
> 'Choose plan', which opens Shopify's hosted pricing page — billing runs
> entirely through Shopify. With a plan active, the banner turns green."
(Show the banner → pricing page → back with plan active.)

**Scene 3 — Rules (~40s)**
> "Default shipping rules are pre-configured. Each rule has a zone, optional
> conditions like weight or cart value, and a price. A free-shipping threshold
> is just a rule priced at zero above a chosen order value."
(Open a rule, edit the price, Save.)

**Scene 4 — Sync into native profiles (~40s)**
> "With one click the app writes these rules into Shopify's native delivery
> profiles — real Shopify rates, no carrier API, so it works on every plan
> including Basic."
(Click Synchronize → open Settings → Shipping and delivery, show the rates.)

**Scene 5 — Combined shipping setup (~50s)**
> "Now the core problem. If you ship from your own warehouse AND a fulfillment
> partner like print-on-demand, Shopify normally adds up both locations'
> shipping and the customer pays twice. I tell the app that products with the
> vendor 'TestFulfillment' come from the partner, set that only the highest
> rate is charged, and Save. The app creates an automatic discount for this."
(Fill the Combined shipping card, Save.)

**Scene 6 — Checkout, customer side (~60s) — MOST IMPORTANT**
> "From the customer's side: I have two products in the cart — one from my
> warehouse, one from the fulfillment partner, a mixed two-location order. At
> checkout, the 'Combined shipping' discount line corrects the doubled cost, so
> the customer pays the fair price I configured."
(Add both products, go to checkout, show the "Combined shipping" line.)

**Scene 7 — Bulky by tag + outro (~30s)**
> "Products tagged 'sperrgut' get their own delivery profile automatically when
> I sync. To recap: rule-based rates with free-shipping thresholds, one-click
> sync, bulky items by tag, and the standout combined shipping across multiple
> locations — on every Shopify plan. Thanks for watching."

---

## Where each piece goes
- **Testing instructions field** → section A above.
- **Screencast URL field** and the review's **Proof of resolution** field →
  the hosted video URL (YouTube "unlisted" or Loom "anyone with the link").
- If you narrate in a language other than English, add English subtitles
  (YouTube: upload an English subtitle track; Loom: enable captions).
