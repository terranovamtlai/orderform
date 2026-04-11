/* ============================================================
   CONFIGURATION
   ============================================================ */
const CURRENCY = '$';
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwvveBT8M11c2gCZ0utPNySEQtwtbH2G7OxDePMeX41DkeC6Jr3bSiIfBxcRhKftcZ1Wg/exec';

/* ============================================================
   PRODUCT DATA
   - srp:          Suggested Retail Price per minimum order unit
   - wholesale:    Dealer price per minimum order unit
   - orderUnit:    What clients order in  (display / case / pack / …)
   - unitsPerOrder How many individual units are in one order unit
   - unitLabel:    Name for individual units  (pairs / units / …)
   The description shown on the row is auto-generated:
     "1 {orderUnit} = {unitsPerOrder} {unitLabel}"
   ============================================================ */
let products = [];

/* ============================================================
   ORDER STATE  { productId: quantity }
   ============================================================ */
const order = {};
let vendor       = null;
let currentStore = null;

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
   RENDER PRODUCT TABLE  (grouped by category, collapsible)
   ============================================================ */
const CATEGORY_ORDER = ['Beddings', 'Gift Novelties', 'Sports Attire (Women / Men)', 'Promotional Sales'];
const expandedOrderCats = new Set();

function toggleCatOrder(catTr) {
  const cat      = catTr.dataset.cat;
  const expanded = expandedOrderCats.has(cat);
  expanded ? expandedOrderCats.delete(cat) : expandedOrderCats.add(cat);
  const arrow = catTr.querySelector('.cat-row-arrow');
  if (arrow) arrow.textContent = expanded ? '▶' : '▼';
  let next = catTr.nextElementSibling;
  while (next && !next.classList.contains('cat-row') && !next.classList.contains('cat-spacer')) {
    next.style.display = expanded ? 'none' : '';
    next = next.nextElementSibling;
  }
}

function renderProducts() {
  const grouped = {};
  products.forEach(p => {
    const cat = p.category || 'Gift Novelties';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });
  const order = [...CATEGORY_ORDER];
  Object.keys(grouped).forEach(c => { if (!order.includes(c)) order.push(c); });

  const allRows = [];
  let first = true;
  order.forEach(cat => {
    const catProducts = grouped[cat];
    if (!catProducts || catProducts.length === 0) return;
    const expanded   = expandedOrderCats.has(cat);
    const escapedCat = cat.replace(/"/g, '&quot;');
    // Spacer before every category (including the first, to gap from the header)
    const availCount = catProducts.filter(p => p.available !== false && p.available !== 'false' && p.available !== 'FALSE').length;
    allRows.push(`<tr class="cat-spacer${first ? ' cat-spacer-first' : ''}"><td colspan="7"></td></tr>`);
    first = false;
    allRows.push(`<tr class="cat-row" onclick="toggleCatOrder(this)" data-cat="${escapedCat}">
      <td colspan="7"><span class="cat-row-arrow">${expanded ? '▼' : '▶'}</span> ${cat} <span style="opacity:.6;font-weight:400">(${availCount})</span></td>
    </tr>`);
    catProducts.forEach(p => {
      const row = makeProductRow(p);
      allRows.push(expanded ? row : row.replace('<tr ', '<tr style="display:none" '));
    });
  });

  document.getElementById('productBody').innerHTML = allRows.join('');
}

function makeProductRow(p) {
    const avail = !(p.available === false || p.available === 'false' || p.available === 'FALSE');

    return `
    <tr data-id="${p.id}" class="${!avail ? 'product-unavailable' : ''}">
      <td>
        <div class="product-cell">
          <img class="product-img" src="images/${p.img.replace(/^images\//, '')}" alt="${p.name}" loading="lazy" />
          <div>
            <div class="product-name">${p.name}${!avail ? ' <span class="unavail-badge">Unavailable</span>' : ''}</div>
            ${p.description ? `<div class="product-description">${p.description}</div>` : ''}
            <div class="product-desc">1 ${p.orderUnit} = ${p.unitsPerOrder} ${p.unitLabel}</div>
          </div>
        </div>
      </td>
      <td><span class="style-text">${p.style || ''}</span></td>
      <td>
        <div class="barcode-text">${p.barcode}</div>
        <div><span class="sku-badge">${p.sku}</span></div>
      </td>
      <td><span class="srp-text">${fmt(p.srp)}</span></td>
      <td><span class="profit-badge">${profitPct(p)}%</span></td>
      <td><span class="wholesale-text">${fmt(p.wholesale)}</span></td>
      <td class="col-qty">
        ${avail ? `
        <div class="qty-stepper">
          <button class="qty-btn btn-dec" data-id="${p.id}" aria-label="Decrease quantity">&#8722;</button>
          <input  class="qty-input" type="number" min="0" step="1"
                  value="${order[p.id] || 0}"
                  data-id="${p.id}"
                  aria-label="Order quantity for ${p.name}" />
          <button class="qty-btn btn-inc" data-id="${p.id}" aria-label="Increase quantity">+</button>
        </div>
        <div class="unit-label">${p.orderUnit}s</div>` : `
        <div class="qty-blocked">Unavailable</div>`}
      </td>
    </tr>
  `;
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

  let totalOrderUnits = 0, totalIndividualUnits = 0, totalWholesale = 0, totalRetail = 0;

  const listHTML = activeItems.map(p => {
    const qty   = order[p.id];
    const units = qty * p.unitsPerOrder;
    const lineW = qty * p.unitsPerOrder * p.wholesale;
    const lineS = qty * p.unitsPerOrder * p.srp;
    totalOrderUnits      += qty;
    totalIndividualUnits += units;
    totalWholesale       += lineW;
    totalRetail          += lineS;
    return `
      <li>
        <span class="item-name">${p.name}</span>
        <span class="item-value">${fmt(lineW)}</span>
        <span class="item-detail">${qty} ${p.orderUnit}${qty !== 1 ? 's' : ''} &middot; ${units} ${p.unitLabel}</span>
      </li>
    `;
  }).join('');

  itemList.innerHTML = listHTML;

  document.getElementById('tTotalPacks').textContent = totalOrderUnits;
  document.getElementById('tTotalPairs').textContent = totalIndividualUnits;
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
   STORE IDENTIFICATION FLOW
   ============================================================ */

async function lookupStoreAPI(vendorCode, storeCode) {
  const url = SHEETS_WEBHOOK_URL
    + '?action=lookupStore'
    + '&vendorCode=' + encodeURIComponent(vendorCode)
    + '&storeCode='  + encodeURIComponent(storeCode);
  const res = await fetch(url);
  return res.json();
}

async function saveStoreAPI(storeData) {
  const url = SHEETS_WEBHOOK_URL + '?action=saveStore&payload=' + encodeURIComponent(JSON.stringify(storeData));
  const res = await fetch(url);
  return res.json();
}

/** Main orchestrator — loops until currentStore is set. */
async function initStoreFlow() {
  const company = vendor ? vendor.company : '';

  while (!currentStore) {
    const { storeCode, lookupResult } = await showStoreCodeInput(company);

    if (lookupResult.status === 'ok' && lookupResult.email) {
      const confirmed = await showStoreConfirmDialog(lookupResult, company);
      if (confirmed) currentStore = lookupResult;
      // else: not me — loop back to code input
    } else {
      const registered = await showStoreRegisterDialog(storeCode, company, lookupResult);
      if (registered) currentStore = registered;
      // else: back pressed — loop back to code input
    }
  }

  // Show store info bar in order panel
  document.getElementById('storeInfoName').textContent =
    currentStore.firstName + ' ' + currentStore.lastName + ' \u2014 ' + currentStore.storeCode;
  document.getElementById('storeInfoBar').hidden = false;
}

/** Step 1: store code input. Resolves { storeCode, lookupResult }. */
function showStoreCodeInput(company, prefill) {
  return new Promise(resolve => {
    const dialog  = document.getElementById('storeDialog');
    const input   = document.getElementById('storeCodeInput');
    const errorEl = document.getElementById('storeDialogError');
    const btn     = document.getElementById('btnStoreLookup');

    document.getElementById('storeDialogSub').textContent = company ? company + '!' : '';
    input.value     = prefill || '';
    errorEl.hidden  = true;
    btn.disabled    = false;
    btn.textContent = 'Continue \u2192';

    const ac = new AbortController();

    async function attempt() {
      const storeCode = input.value.trim().toUpperCase();
      if (!storeCode) {
        errorEl.textContent = 'Please enter your store code.';
        errorEl.hidden = false;
        return;
      }
      btn.disabled    = true;
      btn.textContent = 'Looking up\u2026';
      errorEl.hidden  = true;
      try {
        const vendorCode = vendor ? vendor.code : '';
        const data = await lookupStoreAPI(vendorCode, storeCode);
        ac.abort();
        dialog.close();
        resolve({ storeCode, lookupResult: data });
      } catch (_) {
        errorEl.textContent = 'Could not connect. Please try again.';
        errorEl.hidden  = false;
        btn.disabled    = false;
        btn.textContent = 'Continue \u2192';
      }
    }

    btn.addEventListener('click', attempt, { signal: ac.signal });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); }, { signal: ac.signal });
    dialog.addEventListener('cancel', e => e.preventDefault(), { signal: ac.signal });

    if (!dialog.open) dialog.showModal();
    setTimeout(() => input.focus(), 50);
  });
}

/** Step 2a: confirm existing store. Resolves true (confirmed) or false (not me). */
function showStoreConfirmDialog(storeData, company) {
  return new Promise(resolve => {
    const dialog   = document.getElementById('storeConfirmDialog');
    const infoEl   = document.getElementById('storeConfirmInfo');
    const btnYes   = document.getElementById('btnStoreYes');
    const btnNotMe = document.getElementById('btnStoreNotMe');

    document.getElementById('storeConfirmSub').textContent = company || '';

    infoEl.innerHTML =
      '<div class="store-confirm-name">'    + storeData.firstName + ' ' + storeData.lastName + '</div>' +
      '<div class="store-confirm-email">'   + storeData.email     + '</div>' +
      '<div class="store-confirm-code">Store: ' + storeData.storeCode + '</div>';

    const ac = new AbortController();
    function done(v) { ac.abort(); dialog.close(); resolve(v); }

    btnYes.addEventListener('click',   () => done(true),  { signal: ac.signal });
    btnNotMe.addEventListener('click', () => done(false), { signal: ac.signal });
    dialog.addEventListener('cancel',  e => e.preventDefault(), { signal: ac.signal });

    dialog.showModal();
  });
}

/** Step 2b: register new store. Resolves store object or null (back). */
function showStoreRegisterDialog(prefillCode, company, existing) {
  return new Promise(resolve => {
    const dialog    = document.getElementById('storeRegisterDialog');
    const errorEl   = document.getElementById('storeRegisterError');
    const submitBtn = document.getElementById('btnRegisterSubmit');
    const backBtn   = document.getElementById('btnRegisterBack');

    document.getElementById('storeRegisterSub').textContent = company || '';
    document.getElementById('regCompany').textContent       = company || '';
    document.getElementById('regStoreCode').value    = prefillCode || '';
    document.getElementById('regFirstName').value    = (existing && existing.firstName) || '';
    document.getElementById('regLastName').value     = (existing && existing.lastName)  || '';
    document.getElementById('regEmail').value        = (existing && existing.email)     || '';
    document.getElementById('regConfirmEmail').value = '';
    errorEl.hidden      = true;
    submitBtn.disabled  = false;
    submitBtn.textContent = 'Register & Continue \u2192';

    const ac = new AbortController();
    function abort() { ac.abort(); dialog.close(); }

    async function handleSubmit() {
      const firstName    = document.getElementById('regFirstName').value.trim();
      const lastName     = document.getElementById('regLastName').value.trim();
      const email        = document.getElementById('regEmail').value.trim();
      const confirmEmail = document.getElementById('regConfirmEmail').value.trim();
      const storeCode    = document.getElementById('regStoreCode').value.trim().toUpperCase();

      if (!firstName || !lastName || !email || !storeCode) {
        errorEl.textContent = 'Please fill in all required fields.';
        errorEl.hidden = false;
        return;
      }
      if (!confirmEmail) {
        errorEl.textContent = 'Please confirm your email address.';
        errorEl.hidden = false;
        return;
      }
      if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
        errorEl.textContent = 'Email addresses do not match.';
        errorEl.hidden = false;
        return;
      }

      submitBtn.disabled    = true;
      submitBtn.textContent = 'Saving\u2026';
      errorEl.hidden = true;

      const vendorCode = vendor ? vendor.code : '';
      try {
        await saveStoreAPI({ vendorCode, storeCode, company, firstName, lastName, email });
        abort();
        resolve({ vendorCode, storeCode, company, firstName, lastName, email, status: 'ok' });
      } catch (_) {
        errorEl.textContent   = 'Could not save. Please try again.';
        errorEl.hidden        = false;
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Register & Continue \u2192';
      }
    }

    submitBtn.addEventListener('click', handleSubmit, { signal: ac.signal });
    backBtn.addEventListener('click', () => { abort(); resolve(null); }, { signal: ac.signal });
    dialog.addEventListener('cancel', e => e.preventDefault(), { signal: ac.signal });

    dialog.showModal();
    setTimeout(() => document.getElementById('regFirstName').focus(), 50);
  });
}

/** "Switch store" button — re-runs identification flow. */
document.getElementById('btnSwitchStore').addEventListener('click', async () => {
  currentStore = null;
  document.getElementById('storeInfoBar').hidden = true;
  await initStoreFlow();
});

/* ============================================================
   ORDER DATA HELPERS
   ============================================================ */

// Snapshot the current order into a plain data object.
// Stored here so CSV / print / email can all reference the same confirmed order.
let confirmedOrder = null;

function buildOrderData() {
  const lines = [];
  let totalOrderUnits = 0, totalIndividualUnits = 0, totalWholesale = 0, totalRetail = 0;
  products.forEach(p => {
    const qty = order[p.id] || 0;
    if (!qty) return;
    const units = qty * p.unitsPerOrder;
    const lineW = qty * p.unitsPerOrder * p.wholesale;
    const lineS = qty * p.unitsPerOrder * p.srp;
    totalOrderUnits      += qty;
    totalIndividualUnits += units;
    totalWholesale       += lineW;
    totalRetail          += lineS;
    lines.push({ p, qty, units, lineW, lineS });
  });
  return { lines, totalOrderUnits, totalIndividualUnits, totalWholesale, totalRetail };
}

function buildDialogBodyHTML({ lines, totalOrderUnits, totalIndividualUnits, totalWholesale, totalRetail, storeCode, customerEmail }) {
  const rows = lines.map(({ p, qty, units, lineW }) => `
    <tr>
      <td>${p.name}</td>
      <td style="font-family:monospace;font-size:.78rem">${p.sku}</td>
      <td style="text-align:center;font-weight:700">${qty} <small style="font-weight:400;color:#718096">${p.orderUnit}${qty !== 1 ? 's' : ''}</small></td>
      <td style="text-align:center">${units} <small style="color:#718096">${p.unitLabel}</small></td>
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
          <th style="text-align:center">Order Qty</th>
          <th style="text-align:center">Total Units</th>
          <th style="text-align:right">Price / Unit</th>
          <th style="text-align:right">Line Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="dialog-totals">
      <span class="dt-label">Total Order Units</span>      <span class="dt-value">${totalOrderUnits}</span>
      <span class="dt-label">Total Individual Units</span> <span class="dt-value">${totalIndividualUnits}</span>
      <span class="dt-label">Wholesale Total</span>        <span class="dt-value">${fmt(totalWholesale)}</span>
      <span class="dt-label">Retail Value (SRP)</span>     <span class="dt-value dt-grand">${fmt(totalRetail)}</span>
    </div>
  `;
}

/* ============================================================
   SUBMIT — open dialog in Review state
   ============================================================ */
document.getElementById('btnSubmit').addEventListener('click', () => {
  const data = buildOrderData();
  if (!data.lines.length) return;

  if (!currentStore) return; // store identification required (shouldn't normally reach here)

  data.storeCode     = currentStore.storeCode;
  data.customerEmail = currentStore.email;

  // Populate body
  document.getElementById('dialogBody').innerHTML = buildDialogBodyHTML(data);

  // Populate header meta
  const headMeta = document.getElementById('dialogHeadMeta');
  const parts = [];
  if (currentStore && currentStore.company)   parts.push(currentStore.company);
  if (currentStore && currentStore.storeCode) parts.push(currentStore.storeCode);
  if (currentStore && currentStore.firstName) parts.push(currentStore.firstName + ' ' + currentStore.lastName);
  if (currentStore && currentStore.email)     parts.push(currentStore.email);
  headMeta.innerHTML = parts.map(p => `<span class="dhm-item">${p}</span>`).join('');

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
  confirmedOrder.storeCode     = currentStore ? currentStore.storeCode : '';
  confirmedOrder.customerEmail = currentStore ? currentStore.email     : '';

  // Show submitting state in dialog
  document.getElementById('dialogTitle').textContent = 'Submitting Order…';
  document.getElementById('dialogBody').hidden = true;
  const successEl = document.getElementById('dialogSuccess');
  successEl.innerHTML = '<span style="color:#718096">Please wait — sending your order to Terra Nova…</span>';
  successEl.hidden = false;
  document.getElementById('footReview').hidden = true;

  // Clear the live order
  for (const id in order) delete order[id];
  document.querySelectorAll('.qty-input').forEach(i => { i.value = 0; });
  document.querySelectorAll('tr[data-id]').forEach(r => r.classList.remove('in-order'));
  updateSummary();

  // Log to Google Sheets + trigger email; get server-assigned order ID
  let orderId = null;
  let submitError = false;
  try {
    orderId = await submitToGoogleSheet(confirmedOrder);
    if (!orderId) submitError = true;
  } catch (err) {
    console.error('Submission error:', err);
    submitError = true;
  }
  if (orderId) confirmedOrder.orderId = orderId;

  // Switch dialog to Confirmed state
  document.getElementById('dialogTitle').textContent = submitError ? 'Submission Problem' : 'Order Submitted';
  document.getElementById('dialogHeadMeta').innerHTML = '';
  successEl.innerHTML = submitError
    ? '<span style="color:#c0392b;font-size:1rem;font-weight:600">&#9888; Your order could not be recorded. Please email your order directly to Terra Nova.</span>'
    : '<div class="success-order-id">Order ' + orderId + '</div>'
      + '<div class="success-received">&#10003;&nbsp; We have received your order and will be in touch shortly.</div>'
      + '<div class="success-thankyou">'
      + (confirmedOrder.customerEmail ? 'A confirmation has been sent to <strong>' + confirmedOrder.customerEmail + '</strong>.<br>' : '')
      + 'Thank you for your business. &nbsp;—&nbsp; Terra Nova'
      + '</div>';
  document.getElementById('footConfirmed').hidden = false;
});

// Start New Order — close dialog (order already cleared)
document.getElementById('btnNewOrder').addEventListener('click', () => {
  document.getElementById('confirmDialog').close();
});

/* ============================================================
   GOOGLE SHEETS LOGGING + EMAIL (via Apps Script)
   ============================================================ */
async function submitToGoogleSheet(data) {
  const payload = {
    lines: data.lines.map(({ p, qty, units, lineW, lineS }) => ({
      name:          p.name,
      sku:           p.sku,
      barcode:       p.barcode,
      orderUnit:     p.orderUnit,
      qty,
      units,
      wholesaleUnit: p.wholesale,
      lineWholesale: lineW,
      srpUnit:       p.srp,
      lineSRP:       lineS,
    })),
    totalOrderUnits:      data.totalOrderUnits,
    totalIndividualUnits: data.totalIndividualUnits,
    totalWholesale:       data.totalWholesale,
    totalRetail:          data.totalRetail,
    vendorCode:           vendor ? vendor.code    : '',
    vendorCompany:        vendor ? vendor.company : '',
    storeCode:            data.storeCode     || '',
    customerEmail:        data.customerEmail || '',
    contactName:          currentStore ? (currentStore.firstName + ' ' + currentStore.lastName).trim() : '',
  };

  // Use GET + URL params — POST bodies are silently dropped by Google's
  // 302 redirect, but URL params survive it. This is the reliable approach.
  const url = SHEETS_WEBHOOK_URL + '?payload=' + encodeURIComponent(JSON.stringify(payload));
  const res  = await fetch(url);
  const json = await res.json();
  return json.orderId || null;
}

/* ============================================================
   CSV EXPORT
   ============================================================ */
document.getElementById('btnCSV') && document.getElementById('btnCSV').addEventListener('click', () => {
  if (!confirmedOrder) return;
  const { lines } = confirmedOrder;
  const header = [
    'Product', 'SKU', 'Barcode', 'Order Unit', 'Order Qty', 'Total Units',
    'SRP', 'Wholesale Price', 'Line Total (Wholesale)', 'Line Total (SRP)',
  ];
  const rows = lines.map(({ p, qty, units, lineW, lineS }) => [
    p.name, p.sku, p.barcode,
    p.orderUnit, qty, units,
    p.srp.toFixed(2), p.wholesale.toFixed(2),
    lineW.toFixed(2), lineS.toFixed(2),
  ]);

  const csv = [header, ...rows]
    .map(r => r.map(c => `"${c}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `terranova-order-${confirmedOrder.orderId || new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ============================================================
   PDF / PRINT  (opens a clean print window)
   ============================================================ */
document.getElementById('btnPrint') && document.getElementById('btnPrint').addEventListener('click', () => {
  if (!confirmedOrder) return;
  const { lines, totalOrderUnits, totalIndividualUnits, totalWholesale, totalRetail } = confirmedOrder;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = lines.map(({ p, qty, units, lineW }) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.sku}</td>
      <td style="text-align:center">${qty} ${p.orderUnit}${qty !== 1 ? 's' : ''}</td>
      <td style="text-align:center">${units} ${p.unitLabel}</td>
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
      <p class="meta">${confirmedOrder.orderId ? 'Order: ' + confirmedOrder.orderId + ' &nbsp;·&nbsp; ' : ''}Date: ${date}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th><th>SKU</th>
        <th style="text-align:center">Order Qty</th>
        <th style="text-align:center">Total Units</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <span class="lbl">Total Order Units</span>      <span class="val">${totalOrderUnits}</span>
    <span class="lbl">Total Individual Units</span> <span class="val">${totalIndividualUnits}</span>
    <span class="lbl">Wholesale Total</span>        <span class="val">${fmt(totalWholesale)}</span>
    <span class="lbl">Retail Value (SRP)</span>     <span class="val grand">${fmt(totalRetail)}</span>
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
  lightboxImg.src = 'images/' + product.img.replace(/^images\//, '');
  lightboxImg.alt = product.name;
  lightboxCaption.textContent = product.name;
  lightbox.showModal();
});

document.getElementById('lightboxClose').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });

/* ============================================================
   INIT — load products from Google Sheets
   ============================================================ */
async function init() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('vendor');

  if (!code) {
    showLockedMessage();
    return;
  }

  document.getElementById('productBody').innerHTML =
    `<tr><td colspan="7" style="text-align:center;padding:40px;color:#718096">Loading products&hellip;</td></tr>`;

  try {
    const [vendorRes, prodRes] = await Promise.all([
      fetch(`${SHEETS_WEBHOOK_URL}?action=getVendor&code=${encodeURIComponent(code)}`),
      fetch(`${SHEETS_WEBHOOK_URL}?action=getProducts&vendor=${encodeURIComponent(code)}`)
    ]);
    const vendorData = await vendorRes.json();
    if (!vendorData || vendorData.status !== 'ok') {
      showLockedMessage();
      return;
    }
    vendor = vendorData;
    const badge = document.getElementById('vendorBadge');
    badge.querySelector('.vendor-banner-name').textContent = vendorData.company;
    badge.hidden = false;

    const data = await prodRes.json();
    if (Array.isArray(data) && data.length > 0) {
      products = data.map(p => ({
        ...p,
        id:            Number(p.id),
        srp:           Number(p.srp),
        wholesale:     Number(p.wholesale),
        unitsPerOrder: Number(p.unitsPerOrder),
        available:     p.available !== false && p.available !== 'false' && p.available !== 'FALSE',
        category:      p.category || 'Gift Novelties',
      }));
    } else {
      showCatalogueError('No products found in the sheet. Please add products via the Admin page.');
      return;
    }
  } catch (_) {
    showCatalogueError('Could not load products. Please check your connection and try again.');
    return;
  }

  // Identify the store before showing the catalogue
  await initStoreFlow();

  renderProducts();
  updateSummary();
}

function showLockedMessage() {
  document.getElementById('layout').hidden = true;
  document.getElementById('layoutLocked').hidden = false;
}

function showCatalogueError(msg) {
  document.getElementById('productBody').innerHTML =
    `<tr><td colspan="7" style="text-align:center;padding:40px;color:#718096">${msg}</td></tr>`;
}

init();
