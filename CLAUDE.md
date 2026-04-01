# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Open `index.html` directly in a browser — no build step, no server, no dependencies.

## Architecture

Three frontend files + one Google Apps Script backend:

- **`index.html`** — markup. Key elements: `tbody#productBody` (populated by JS), `#confirmDialog` (`<dialog>` for order review/submit), `#lightbox` (`<dialog>` for product image zoom).
- **`styles.css`** — all styling via CSS custom properties (`--navy`, `--orange`, `--green`, etc.). Layout: CSS Grid (`1fr 310px`); collapses to single column at ≤940px.
- **`app.js`** — all frontend logic. `products[]` is populated at runtime from Google Sheets (not hardcoded). Order state is `{ productId: quantity }`. `setQty(id, value)` is the sole mutation point — it validates, syncs the DOM, and calls `updateSummary()`. Event delegation on `tbody` handles all qty changes (no per-row listeners).
- **`google-apps-script.js`** — deployed as a Google Apps Script Web App. Handles all backend routes via `doGet(e)` dispatched on `?action=`.

## Backend (Google Apps Script)

The Web App URL is stored as `SHEETS_WEBHOOK_URL` in `app.js`. All requests are GET (JSON payload sent as a URL param to survive 302 redirects).

**Routes:**
- `getProducts` — reads Products sheet; returns product list with calculated remaining inventory
- `submitOrder` (default) — logs order lines to Orders sheet, generates Order ID (`TN-YYYYMMDD-HHMM-SEQ`), sends email to `ORDER_EMAIL`
- `getOrders` — returns all orders (admin)
- `updateOrderStatus` — toggles checkboxes on an order row (admin)
- `saveProducts` — writes product JSON to Products sheet (admin)

**Three sheets in the spreadsheet:**
- `Products` — catalog: `id | name | barcode | sku | srp | wholesale | img | orderUnit | unitsPerOrder | unitLabel | available | totalInventory`
- `Orders` — order log with status checkboxes (`orderSent`, `invoiceSent`, `paymentReceived`, `cancelled`)
- `Counter` — sequential ID counter

## Order Flow

1. `init()` fetches `getProducts` → `renderProducts()` populates `tbody#productBody`
2. User adjusts quantities; `setQty()` → `updateSummary()` updates the right panel live
3. Submit → `buildOrderData()` → `submitToGoogleSheet()` (GET to Apps Script)
4. Apps Script assigns Order ID, logs to sheet, emails `mtlaibaker@gmail.com`
5. Confirmation dialog shows Order ID; user can download CSV or print/save PDF

## Inventory Display

- Products show remaining stock; color-coded: green (normal), yellow (≤2× orderUnit), red (out of stock)
- Out-of-stock or unavailable products show a badge and have qty input disabled
- Max qty enforced in `setQty()` based on remaining inventory

## Updating Products

Edit via the Google Sheets `Products` tab, not in code. Product schema (all fields required):

```
id | name | barcode | sku | srp | wholesale | img | orderUnit | unitsPerOrder | unitLabel | available | totalInventory
```

Profit % is calculated automatically: `(srp - wholesale) / srp * 100`.

## Print / PDF

Print stylesheet in `styles.css` hides the header and order panel, showing only the order summary. PDF export uses `window.open()` with a generated HTML string.
