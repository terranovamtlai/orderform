/* ============================================================
   CONFIGURATION
   ============================================================ */
const CURRENCY       = '$';
const PAIRS_PER_PACK = 6;
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyLHoKCqkTmzZgpHmwrRhB6fggm8Ua6py7_H5nY6qpyD9AzcMxTqdpD_Pb4iWb4TD1t/exec';

/* ============================================================
   PRODUCT DATA
   - srp:       Suggested Retail Price per 6-pair counter display
   - wholesale: Dealer/wholesale price per display
   Pricing source: Terra Nova wholesale catalogue 2026
   ============================================================ */
const products = [
  {
    id: 1,
    name: 'Bacon Socks',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image2.png',
  },
  {
    id: 2,
    name: 'Ramen Instant Socks',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image3.png',
  },
  {
    id: 3,
    name: 'Beef Jerky Socks',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image4.png',
  },
  {
    id: 4,
    name: 'Greatest Hits Vinyl Record Socks',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image7.png',
  },
  {
    id: 5,
    name: 'Burger Socks',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image8.png',
  },
  {
    id: 6,
    name: 'Pickles Socks',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image9.png',
  },
  {
    id: 7,
    name: 'Socks With Hops',
    desc: '6-Pair Counter Display',
    barcode: '644197322967',
    sku: '687 0362',
    srp: 15.99,
    wholesale: 11.90,
    img: 'images/image11.png',
  },
];

/* ============================================================
   ORDER STATE  { productId: quantity }
   ============================================================ */
const order = {};

/* ============================================================
   HELPERS
   ============================================================ */
function fmt(n) {
  return CURRENCY + n.toFixed(2);
}

function profitPct(p) {
  return ((p.srp - p.wholesale) / p.srp * 100).toFixed(1);
}

/* ============================================================
   RENDER PRODUCT TABLE
   ============================================================ */
function renderProducts() {
  const rows = products.map(p => `
    <tr data-id="${p.id}">
      <td>
        <div class="product-cell">
          <img class="product-img" src="${p.img}" alt="${p.name}" loading="lazy" />
          <div>
            <div class="product-name">${p.name}</div>
            <div class="product-desc">${p.desc}</div>
          </div>
        </div>
      </td>
      <td><span class="barcode-text">${p.barcode}</span></td>
      <td><span class="sku-badge">${p.sku}</span></td>
      <td><span class="srp-text">${fmt(p.srp)}</span></td>
      <td><span class="profit-badge">${profitPct(p)}%</span></td>
      <td><span class="wholesale-text">${fmt(p.wholesale)}</span></td>
      <td class="col-qty">
        <div class="qty-stepper">
          <button class="qty-btn btn-dec" data-id="${p.id}" aria-label="Decrease quantity">&#8722;</button>
          <input  class="qty-input" type="number" min="0" step="1"
                  value="${order[p.id] || 0}"
                  data-id="${p.id}"
                  aria-label="Order quantity for ${p.name}" />
          <button class="qty-btn btn-inc" data-id="${p.id}" aria-label="Increase quantity">+</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.getElementById('productBody').insertAdjacentHTML('afterbegin', rows);
}

/* ============================================================
   UPDATE ORDER SUMMARY PANEL
   ============================================================ */
function updateSummary() {
  const panelEmpty     = document.getElementById('panelEmpty');
  const itemList       = document.getElementById('itemList');
  const totalsSection  = document.getElementById('totalsSection');
  const btnSubmit      = document.getElementById('btnSubmit');

  const activeItems = products.filter(p => (order[p.id] || 0) > 0);

  if (activeItems.length === 0) {
    panelEmpty.hidden    = false;
    itemList.hidden      = true;
    totalsSection.hidden = true;
    btnSubmit.hidden     = true;
    return;
  }

  panelEmpty.hidden    = true;
  itemList.hidden      = false;
  totalsSection.hidden = false;
  btnSubmit.hidden     = false;

  let totalPacks = 0, totalWholesale = 0, totalRetail = 0;

  const listHTML = activeItems.map(p => {
    const qty  = order[p.id];
    const lineW = qty * p.wholesale;
    const lineS = qty * p.srp;
    totalPacks     += qty;
    totalWholesale += lineW;
    totalRetail    += lineS;
    return `
      <li>
        <span class="item-name">${p.name}</span>
        <span class="item-value">${fmt(lineW)}</span>
        <span class="item-detail">${qty} display${qty !== 1 ? 's' : ''} &times; ${fmt(p.wholesale)}</span>
      </li>
    `;
  }).join('');

  itemList.innerHTML = listHTML;

  document.getElementById('tTotalPacks').textContent = totalPacks;
  document.getElementById('tTotalPairs').textContent = totalPacks * PAIRS_PER_PACK;
  document.getElementById('tWholesale').textContent  = fmt(totalWholesale);
  document.getElementById('tRetail').textContent     = fmt(totalRetail);
}

/* ============================================================
   SET QUANTITY  — single source of truth for order mutations
   ============================================================ */
function setQty(id, raw) {
  const qty = Math.max(0, Math.floor(parseFloat(raw) || 0));

  if (qty === 0) {
    delete order[id];
  } else {
    order[id] = qty;
  }

  // Keep the visible input in sync
  const input = document.querySelector(`.qty-input[data-id="${id}"]`);
  if (input && parseInt(input.value) !== qty) input.value = qty;

  // Highlight the row when it has a quantity
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) row.classList.toggle('in-order', qty > 0);

  updateSummary();
}

/* ============================================================
   TABLE EVENTS  (delegated to avoid N listeners)
   ============================================================ */
const tbody = document.getElementById('productBody');

tbody.addEventListener('click', e => {
  const btn = e.target.closest('.qty-btn');
  if (!btn) return;
  const id  = parseInt(btn.dataset.id, 10);
  const cur = order[id] || 0;
  if (btn.classList.contains('btn-inc')) setQty(id, cur + 1);
  if (btn.classList.contains('btn-dec')) setQty(id, cur - 1);
});

tbody.addEventListener('change', e => {
  if (e.target.classList.contains('qty-input')) {
    setQty(parseInt(e.target.dataset.id, 10), e.target.value);
  }
});

// Allow typing directly without waiting for blur
tbody.addEventListener('input', e => {
  if (e.target.classList.contains('qty-input')) {
    setQty(parseInt(e.target.dataset.id, 10), e.target.value);
  }
});

/* ============================================================
   CLEAR ALL
   ============================================================ */
document.getElementById('btnClear').addEventListener('click', () => {
  if (!Object.keys(order).length) return;
  if (!confirm('Clear all quantities and start a new order?')) return;

  for (const id in order) delete order[id];

  // Reset all inputs and row highlights in one pass
  document.querySelectorAll('.qty-input').forEach(i => { i.value = 0; });
  document.querySelectorAll('tr[data-id]').forEach(r => r.classList.remove('in-order'));

  updateSummary();
});

/* ============================================================
   ORDER DATA HELPERS
   ============================================================ */

// Snapshot the current order into a plain data object.
// Stored here so CSV / print / email can all reference the same confirmed order.
let confirmedOrder = null;

function buildOrderData() {
  const lines = [];
  let totalDisplays = 0, totalWholesale = 0, totalRetail = 0;
  products.forEach(p => {
    const qty = order[p.id] || 0;
    if (!qty) return;
    const lineW = qty * p.wholesale;
    const lineS = qty * p.srp;
    totalDisplays  += qty;
    totalWholesale += lineW;
    totalRetail    += lineS;
    lines.push({ p, qty, lineW, lineS });
  });
  return { lines, totalDisplays, totalWholesale, totalRetail };
}

function buildDialogBodyHTML({ lines, totalDisplays, totalWholesale, totalRetail }) {
  const rows = lines.map(({ p, qty, lineW }) => `
    <tr>
      <td>${p.name}</td>
      <td style="font-family:monospace;font-size:.78rem">${p.sku}</td>
      <td style="text-align:center;font-weight:700">${qty}</td>
      <td style="text-align:center">${qty * PAIRS_PER_PACK}</td>
      <td style="text-align:right">${fmt(p.wholesale)}</td>
      <td style="text-align:right;font-weight:700">${fmt(lineW)}</td>
    </tr>
  `).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th style="text-align:center">Displays</th>
          <th style="text-align:center">Pairs</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Line Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="dialog-totals">
      <span class="dt-label">Total Displays</span>      <span class="dt-value">${totalDisplays}</span>
      <span class="dt-label">Total Pairs</span>         <span class="dt-value">${totalDisplays * PAIRS_PER_PACK}</span>
      <span class="dt-label">Wholesale Total</span>     <span class="dt-value">${fmt(totalWholesale)}</span>
      <span class="dt-label">Retail Value (SRP)</span>  <span class="dt-value dt-grand">${fmt(totalRetail)}</span>
    </div>
  `;
}

/* ============================================================
   SUBMIT — open dialog in Review state
   ============================================================ */
document.getElementById('btnSubmit').addEventListener('click', () => {
  const data = buildOrderData();
  if (!data.lines.length) return;

  // Populate body
  document.getElementById('dialogBody').innerHTML = buildDialogBodyHTML(data);

  // Reset to review state
  document.getElementById('dialogTitle').textContent  = 'Review Order';
  document.getElementById('dialogSuccess').hidden     = true;
  document.getElementById('footReview').hidden        = false;
  document.getElementById('footConfirmed').hidden     = true;
  const btn = document.getElementById('btnConfirmSubmit');
  btn.disabled    = false;
  btn.textContent = 'Confirm & Submit Order';

  document.getElementById('confirmDialog').showModal();
});

/* ============================================================
   DIALOG CONTROLS
   ============================================================ */
document.getElementById('dialogClose').addEventListener('click', () => {
  document.getElementById('confirmDialog').close();
});

// Cancel — close, keep order intact
document.getElementById('btnCancelOrder').addEventListener('click', () => {
  document.getElementById('confirmDialog').close();
});

// Confirm & Submit
document.getElementById('btnConfirmSubmit').addEventListener('click', async () => {
  const btn = document.getElementById('btnConfirmSubmit');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  // Snapshot order data before clearing
  confirmedOrder = buildOrderData();

  // Clear the live order
  for (const id in order) delete order[id];
  document.querySelectorAll('.qty-input').forEach(i => { i.value = 0; });
  document.querySelectorAll('tr[data-id]').forEach(r => r.classList.remove('in-order'));
  updateSummary();

  // Log to Google Sheets + trigger email (non-blocking)
  try {
    await submitToGoogleSheet(confirmedOrder);
  } catch (err) {
    console.error('Submission error:', err);
  }

  // Switch dialog to Confirmed state
  document.getElementById('dialogTitle').textContent = 'Order Submitted';
  document.getElementById('dialogSuccess').hidden    = false;
  document.getElementById('footReview').hidden       = true;
  document.getElementById('footConfirmed').hidden    = false;
});

// Start New Order — close dialog (order already cleared)
document.getElementById('btnNewOrder').addEventListener('click', () => {
  document.getElementById('confirmDialog').close();
});

/* ============================================================
   GOOGLE SHEETS LOGGING + EMAIL (via Apps Script)
   ============================================================ */
function submitToGoogleSheet(data) {
  const orderId = `TN-${Date.now()}`;
  const date    = new Date().toLocaleString('en-CA');

  const payload = {
    orderId,
    date,
    lines: data.lines.map(({ p, qty, lineW, lineS }) => ({
      name:          p.name,
      sku:           p.sku,
      barcode:       p.barcode,
      qty,
      pairs:         qty * PAIRS_PER_PACK,
      wholesaleUnit: p.wholesale,
      lineWholesale: lineW,
      srpUnit:       p.srp,
      lineSRP:       lineS,
    })),
    totalDisplays:  data.totalDisplays,
    totalPairs:     data.totalDisplays * PAIRS_PER_PACK,
    totalWholesale: data.totalWholesale,
    totalRetail:    data.totalRetail,
  };

  // Use GET + URL params — POST bodies are silently dropped by Google's
  // 302 redirect, but URL params survive it. This is the reliable approach.
  const url = SHEETS_WEBHOOK_URL + '?payload=' + encodeURIComponent(JSON.stringify(payload));
  return fetch(url, { mode: 'no-cors' });
}

/* ============================================================
   CSV EXPORT
   ============================================================ */
document.getElementById('btnCSV').addEventListener('click', () => {
  if (!confirmedOrder) return;
  const { lines } = confirmedOrder;
  const header = [
    'Product', 'SKU', 'Barcode', 'SRP', 'Wholesale Price',
    'Order Qty (Displays)', 'Total Pairs', 'Line Total (Wholesale)', 'Line Total (SRP)',
  ];
  const rows = lines.map(({ p, qty, lineW, lineS }) => [
    p.name, p.sku, p.barcode,
    p.srp.toFixed(2), p.wholesale.toFixed(2),
    qty, qty * PAIRS_PER_PACK,
    lineW.toFixed(2), lineS.toFixed(2),
  ]);

  const csv = [header, ...rows]
    .map(r => r.map(c => `"${c}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `terranova-order-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ============================================================
   PDF / PRINT  (opens a clean print window)
   ============================================================ */
document.getElementById('btnPrint').addEventListener('click', () => {
  if (!confirmedOrder) return;
  const { lines, totalDisplays, totalWholesale, totalRetail } = confirmedOrder;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = lines.map(({ p, qty, lineW }) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.sku}</td>
      <td style="text-align:center">${qty}</td>
      <td style="text-align:center">${qty * PAIRS_PER_PACK}</td>
      <td style="text-align:right">${fmt(p.wholesale)}</td>
      <td style="text-align:right;font-weight:700">${fmt(lineW)}</td>
    </tr>
  `).join('');

  const logoURL = new URL('images/image1.png', window.location.href).href;

  const win = window.open('', '_blank', 'width=820,height=700');
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Terra Nova — Order Summary</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           padding: 36px; color: #1a202c; }
    .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    .logo   { height: 64px; width: auto; }
    h1      { color: #1e3a5f; font-size: 1.35rem; }
    .meta   { color: #718096; font-size: .82rem; margin-top: 3px; }
    table   { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th      { background: #1e3a5f; color: #fff; padding: 9px 12px; text-align: left;
              font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
    td      { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: .875rem; }
    tbody tr:last-child td { border-bottom: none; }
    .totals { margin-top: 20px; background: #f0f4f8; border-radius: 6px;
              padding: 14px 16px; display: grid; grid-template-columns: 1fr auto;
              row-gap: 8px; font-size: .875rem; max-width: 340px; margin-left: auto; }
    .totals .lbl  { color: #718096; }
    .totals .val  { text-align: right; font-weight: 700; }
    .totals .grand { color: #2d9c5e; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <img class="logo" src="${logoURL}" alt="Terra Nova"/>
    <div>
      <h1>Wholesale Order Summary</h1>
      <p class="meta">Date: ${date}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th><th>SKU</th>
        <th style="text-align:center">Displays</th>
        <th style="text-align:center">Pairs</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <span class="lbl">Total Displays</span>    <span class="val">${totalDisplays}</span>
    <span class="lbl">Total Pairs</span>        <span class="val">${totalDisplays * PAIRS_PER_PACK}</span>
    <span class="lbl">Wholesale Total</span>    <span class="val">${fmt(totalWholesale)}</span>
    <span class="lbl">Retail Value (SRP)</span> <span class="val grand">${fmt(totalRetail)}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
});

/* ============================================================
   LIGHTBOX
   ============================================================ */
const lightbox      = document.getElementById('lightbox');
const lightboxImg   = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');

document.getElementById('productBody').addEventListener('click', e => {
  const img = e.target.closest('.product-img');
  if (!img) return;
  const id = parseInt(img.closest('tr').dataset.id, 10);
  const product = products.find(p => p.id === id);
  lightboxImg.src = product.img;
  lightboxImg.alt = product.name;
  lightboxCaption.textContent = product.name;
  lightbox.showModal();
});

document.getElementById('lightboxClose').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });

/* ============================================================
   INIT
   ============================================================ */
renderProducts();
updateSummary();
