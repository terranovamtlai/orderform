# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Open `index.html` directly in a browser — no build step, no server required.

## Architecture

Three files, no framework, no dependencies:

- **`index.html`** — markup and structure. The `<dialog>` element (`#confirmDialog`) is used for the order submission modal.
- **`styles.css`** — all styling via CSS custom properties (`--navy`, `--orange`, etc.). Responsive via CSS Grid; the summary panel becomes a top block on screens ≤ 940 px.
- **`app.js`** — all logic. Products are defined as a plain array at the top of this file. Order state is a simple `{ productId: quantity }` object. A single `setQty(id, value)` function is the only way to mutate order state; it syncs the DOM and calls `updateSummary()`.

## Updating Products

Edit the `products` array at the top of `app.js`. Each entry requires:

```js
{ id, emoji, bg, name, desc, barcode, sku, srp, wholesale }
```

Profit % is calculated automatically as `(srp - wholesale) / srp * 100`.

## Key Behaviours

- Row highlights green when its quantity > 0 (`in-order` class).
- Summary panel shows itemised list + totals (packs, pairs, wholesale value, retail value).
- Submit opens the `<dialog>` with a full order table; footer buttons: **Download CSV**, **Print / Save PDF**, **New Order**.
- Print stylesheet hides the header and order panel, showing only the product table.
