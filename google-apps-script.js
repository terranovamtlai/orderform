/**
 * Terra Nova — Wholesale Order Logger + Mailer + Product Inventory
 *
 * Deploy as Web App:  Execute as: Me  |  Who has access: Anyone
 *
 * Routes (all via GET + ?action=...):
 *   getProducts    — returns Products sheet as JSON array
 *   saveProducts   — writes payload JSON to Products sheet
 *   submitOrder    — logs order to Orders sheet + sends email  (default)
 *   orderform
 */

const ORDER_EMAIL       = 'terranova.mtl.ai@gmail.com';
const SPREADSHEET_ID    = '10H9CTzRHUGK6SrukXklahr0ebQvJR8bueNL8VZEmses';
const ADMIN_PASSWORD    = 'pickleball2026';
const ORDERS_SHEET      = 'Orders';
const PRODUCTS_SHEET    = 'Products';
const COUNTER_SHEET     = 'Counter';
const VENDORS_SHEET     = 'Vendors';

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/* ── Order ID generator (persistent counter) ─────────────── */
function getNextOrderId() {
  const ss = getSpreadsheet();
  let counterSheet = ss.getSheetByName(COUNTER_SHEET);
  if (!counterSheet) {
    counterSheet = ss.insertSheet(COUNTER_SHEET);
    counterSheet.getRange('A1').setValue(0);
  }
  const cell  = counterSheet.getRange('A1');
  const count = Number(cell.getValue()) + 1;
  cell.setValue(count);

  const now  = new Date();
  const pad  = function(n, w) { return String(n).padStart(w, '0'); };
  const yyyy = now.getFullYear();
  const mo   = pad(now.getMonth() + 1, 2);
  const dd   = pad(now.getDate(), 2);
  const hh   = pad(now.getHours(), 2);
  const min  = pad(now.getMinutes(), 2);
  const seq  = pad(count, 4);

  return 'TN-' + yyyy + mo + dd + '-' + hh + min + '-' + seq;
}

/* ── Admin-only actions (require pw param) ───────────────── */
var ADMIN_ACTIONS = {
  getUploadToken:    true,
  saveProduct:       true,
  deleteProduct:     true,
  saveProducts:      true,
  getOrders:         true,
  updateOrderStatus: true,
  getVendors:        true,
  saveVendors:       true,
  deleteStore:       true,
  // getVendor and saveStore are used by the public order form — no auth required
};

/* ── Router ──────────────────────────────────────────────── */
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'submitOrder';
  try {
    if (ADMIN_ACTIONS[action]) {
      var pw = (e.parameter && e.parameter.pw) ? e.parameter.pw : '';
      if (pw !== ADMIN_PASSWORD) {
        return json({ status: 'error', message: 'Unauthorized' });
      }
    }
    if      (action === 'getProducts')       return handleGetProducts(e);
    else if (action === 'getUploadToken')    return handleGetUploadToken();
    else if (action === 'saveProduct')       return handleSaveProduct(e);
    else if (action === 'deleteProduct')     return handleDeleteProduct(e);
    else if (action === 'saveProducts')      return handleSaveProducts(e);
    else if (action === 'getOrders')         return handleGetOrders();
    else if (action === 'updateOrderStatus') return handleUpdateOrderStatus(e);
    else if (action === 'getVendor')         return handleGetVendor(e);
    else if (action === 'getVendors')        return handleGetVendors();
    else if (action === 'saveVendors')       return handleSaveVendors(e);
    else if (action === 'verifyPassword')    return handleVerifyPassword(e);
    else if (action === 'lookupStore')       return handleLookupStore(e);
    else if (action === 'saveStore')         return handleSaveStore(e);
    else if (action === 'getStoreContacts')  return handleGetStoreContacts(e);
    else if (action === 'deleteStore')       return handleDeleteStore(e);
    else                                     return handleSubmitOrder(e);
  } catch (err) {
    return json({ status: 'error', message: err.toString() });
  }
}

/* ── Products: read ──────────────────────────────────────── */
function handleGetProducts(e) {
  var vendorCode = (e && e.parameter && e.parameter.vendor)
    ? e.parameter.vendor.trim().toUpperCase()
    : null;

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(PRODUCTS_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return json([]);
  }

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  var products = rows.slice(1)
    .filter(r => r[0] !== '')
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });

  // Normalise status field
  products.forEach(function(p) {
    if (!p.status) {
      p.status = (p.available !== false && p.available !== 'FALSE') ? 'available' : 'unavailable';
    }
    p.available = (p.status === 'available');
  });

  // When called with a vendor code (customer context): filter hidden + vendor-restricted products
  if (vendorCode) {
    products = products.filter(function(p) {
      if (p.status === 'hidden') return false;
      var codes = [];
      try { codes = JSON.parse(p.vendorCodes || '[]'); } catch (ignored) {}
      if (codes.length > 0 && codes.map(function(c) { return c.toUpperCase(); }).indexOf(vendorCode) === -1) return false;
      return true;
    });
  }

  return json(products);
}

/* ── GitHub image upload token ──────────────────────────────── */
function handleGetUploadToken() {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) return json({ status: 'error', message: 'GITHUB_PAT not set in Script Properties' });
  return json({ status: 'ok', token: pat });
}

/* ── Products: upsert single row ────────────────────────────── */
function handleSaveProduct(e) {
  var p      = JSON.parse(e.parameter.payload);
  var ss     = getSpreadsheet();
  var sheet  = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(PRODUCTS_SHEET);

  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    var headers = ['id','name','barcode','sku','srp','cost','dealer','img','orderUnit','unitsPerOrder','unitLabel','available','status','vendorCodes','category','style','description'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var status = p.status || (p.available !== false ? 'available' : 'unavailable');
  var rowData = [
    p.id, p.name, p.barcode, p.sku,
    Number(p.srp), Number(p.cost || 0), Number(p.cost || 0) * 1.11,
    p.img, p.orderUnit, Number(p.unitsPerOrder), p.unitLabel,
    status === 'available', status,
    p.vendorCodes || '[]',
    p.category || 'Gift Novelties',
    p.style || '',
    p.description || '',
  ];

  // Find existing row by id
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return json({ status: 'ok', action: 'updated' });
    }
  }
  // Not found — append
  sheet.appendRow(rowData);
  return json({ status: 'ok', action: 'inserted' });
}

/* ── Products: delete single row by id ──────────────────────── */
function handleDeleteProduct(e) {
  var id    = String(e.parameter.id);
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Products sheet not found' });
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Product not found: ' + id });
}

/* ── Products: write (supports chunked saves via append=true) ── */
function handleSaveProducts(e) {
  var products = JSON.parse(e.parameter.payload);
  var append   = e.parameter.append === 'true';
  var ss       = getSpreadsheet();
  var sheet    = ss.getSheetByName(PRODUCTS_SHEET);

  if (!sheet) sheet = ss.insertSheet(PRODUCTS_SHEET);

  if (!append) {
    // First chunk: clear and write headers
    sheet.clearContents();
    var headers = ['id','name','barcode','sku','srp','cost','dealer','img','orderUnit','unitsPerOrder','unitLabel','available','status','vendorCodes','category','style','description'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  products.forEach(function(p) {
    var status = p.status || (p.available !== false ? 'available' : 'unavailable');
    sheet.appendRow([
      p.id, p.name, p.barcode, p.sku,
      Number(p.srp), Number(p.cost || 0), Number(p.cost || 0) * 1.11,
      p.img, p.orderUnit, Number(p.unitsPerOrder), p.unitLabel,
      status === 'available',
      status,
      p.vendorCodes || '[]',
      p.category || 'Gift Novelties',
      p.style || '',
      p.description || '',
    ]);
  });

  return json({ status: 'ok', saved: products.length });
}

/* ── Orders: submit + email ──────────────────────────────── */
function handleSubmitOrder(e) {
  const data    = JSON.parse(e.parameter.payload);
  const orderId = getNextOrderId();
  const date    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  data.orderId  = orderId;
  data.date     = date;
  const ss    = getSpreadsheet();
  let   sheet = ss.getSheetByName(ORDERS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    const headers = [
      'Date','Order ID','Product','SKU','Barcode',
      'Order Unit','Order Qty','Total Units',
      'Dealer/Unit ($)','Line Dealer ($)',
      'SRP/Unit ($)','Line SRP ($)',
      'Order Sent','Invoice Sent','Payment Received','Cancelled',
      'Company','Vendor Code','Store Code','Customer Email','Comments',
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  data.lines.forEach(function(line) {
    sheet.appendRow([
      data.date, data.orderId,
      line.name, line.sku, line.barcode,
      line.orderUnit, line.qty, line.units,
      line.dealerUnit, line.lineDealer,
      line.srpUnit,       line.lineSRP,
    ]);
  });

  // Totals summary row
  sheet.appendRow([
    data.date, data.orderId + ' — TOTAL',
    '— ' + data.lines.length + ' product(s) —',
    '','','',
    data.totalOrderUnits, data.totalIndividualUnits,
    '', data.totalDealer,
    '', data.totalRetail,
    '','','','',                  // status checkboxes (cols 13–16)
    data.vendorCompany  || '',    // col 17
    data.vendorCode     || '',    // col 18
    data.storeCode      || '',    // col 19
    data.customerEmail  || '',    // col 20
    data.comments       || '',    // col 21
  ]);
  sheet.getRange(sheet.getLastRow(), 1, 1, 12)
       .setFontStyle('italic')
       .setBackground('#f0f4f8');

  sendOrderEmail(data);
  return json({ status: 'ok', orderId: data.orderId });
}

/* ── Email ───────────────────────────────────────────────── */
function sendOrderEmail(data) {
  const rows = data.lines.map(function(line) {
    return '<tr>'
      + td(line.name)
      + td(line.qty + ' ' + line.orderUnit + (line.qty !== 1 ? 's' : ''), 'center')
      + td(line.units + ' ' + (line.unitLabel || 'units'), 'center')
      + td('$' + line.lineDealer.toFixed(2), 'right')
      + '</tr>';
  }).join('');

  const html = ''
    + '<div style="font-family:sans-serif;max-width:620px;color:#1a202c">'
    + '<div style="background:#d8e4ef;padding:20px 24px">'
    + '<h1 style="color:#1a202c;margin:0 0 12px;font-size:1.3rem">Terra Nova — New Wholesale Order</h1>'
    + '<table style="border-collapse:collapse;width:100%">'
    + (data.vendorCompany ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0;width:110px">Company</td><td style="color:#1a202c;font-size:.85rem;font-weight:700">' + data.vendorCompany + '</td></tr>' : '')
    + (data.storeCode     ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Store Code</td><td style="color:#1a202c;font-size:.85rem;font-family:monospace;letter-spacing:.05em">' + data.storeCode + '</td></tr>' : '')
    + (data.contactName   ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Contact</td><td style="color:#1a202c;font-size:.85rem">' + data.contactName + '</td></tr>' : '')
    + (data.customerEmail ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Email</td><td style="color:#1a202c;font-size:.85rem">' + data.customerEmail + '</td></tr>' : '')
    + '</table>'
    + '</div>'
    + '<div style="padding:24px">'
    + '<p style="color:#718096;margin:20px 0 16px">Order <strong>' + data.orderId + '</strong> &nbsp;·&nbsp; ' + data.date + '</p>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:#f0f4f8">'
    + th('Product') + th('Order Qty') + th('Total Units') + th('Line Total', 'right')
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '<div style="margin-top:20px;background:#f0f4f8;border-radius:6px;padding:14px 16px">'
    + row2('Total Order Units',      data.totalOrderUnits)
    + row2('Total Individual Units', data.totalIndividualUnits)
    + row2('Dealer Total',            '$' + data.totalDealer.toFixed(2))
    + row2('Retail Value (SRP)',     '$' + data.totalRetail.toFixed(2), '#2d9c5e')
    + '</div>'
    + (data.comments ? '<div style="margin-top:16px;padding:12px 14px;background:#fffbeb;border-left:3px solid #f6ad55;border-radius:4px"><strong style="font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:#92400e">Comments</strong><p style="margin:4px 0 0;color:#1a202c;font-size:.9rem">' + data.comments + '</p></div>' : '')
    + '</div></div>';

  MailApp.sendEmail({ to: ORDER_EMAIL, subject: 'New Terra Nova Order — ' + data.orderId, htmlBody: html });
  if (data.customerEmail) {
    MailApp.sendEmail({ to: data.customerEmail, subject: 'Your Terra Nova Order Confirmation — ' + data.orderId, htmlBody: html });
  }
}

/* ── Orders: read (admin) ────────────────────────────────── */
function handleGetOrders() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  const rows   = sheet.getDataRange().getValues();
  // Columns: 0=Date 1=OrderID 2=Product 3=SKU 4=Barcode 5=OrderUnit
  //          6=OrderQty 7=TotalUnits 8=DealerUnit 9=LineDealer 10=SRPUnit 11=LineSRP
  //          12=OrderSent 13=InvoiceSent 14=PaymentReceived 15=Cancelled
  //          16=Company 17=VendorCode 18=StoreCode 19=CustomerEmail

  const orders  = [];
  let   current = null;

  for (var i = 1; i < rows.length; i++) {
    var row     = rows[i];
    var orderId = String(row[1]);

    if (orderId.indexOf(' — TOTAL') !== -1) {
      // Summary row — close current order
      if (current) {
        current.totalOrderUnits      = row[6];
        current.totalIndividualUnits = row[7];
        current.totalDealer          = row[9];
        current.totalRetail          = row[11];
        current.orderSent            = row[12] === true;
        current.invoiceSent          = row[13] === true;
        current.paymentReceived      = row[14] === true;
        current.cancelled            = row[15] === true;
        current.company              = row[16] || '';
        current.vendorCode           = row[17] || '';
        current.storeCode            = row[18] || '';
        current.customerEmail        = row[19] || '';
        current.comments             = row[20] || '';
        orders.push(current);
        current = null;
      }
    } else if (row[0] !== '' && orderId !== '') {
      // Line row — start or extend current order
      if (!current || current.orderId !== orderId) {
        current = { orderId: orderId, date: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), lines: [] };
      }
      current.lines.push({
        name:         row[2],
        sku:          row[3],
        orderUnit:    row[5],
        qty:          row[6],
        units:        row[7],
        lineDealer: row[9],
        lineSRP:      row[11],
      });
    }
  }

  orders.reverse(); // most recent first
  return json(orders);
}

/* ── Orders: update status checkbox ─────────────────────── */
function handleUpdateOrderStatus(e) {
  var payload = JSON.parse(e.parameter.payload);
  var orderId = payload.orderId;
  var field   = payload.field;
  var value   = payload.value;

  // Map field name to column number (1-based)
  var colMap = { orderSent: 13, invoiceSent: 14, paymentReceived: 15, cancelled: 16, comments: 21 };
  var col    = colMap[field];
  if (!col) return json({ status: 'error', message: 'Unknown field: ' + field });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Orders sheet not found' });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === orderId + ' — TOTAL') {
      sheet.getRange(i + 1, col).setValue(field === 'comments' ? String(value) : value === true);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Order not found: ' + orderId });
}

/* ── Vendors ─────────────────────────────────────────────── */
function handleGetVendor(e) {
  var code  = ((e.parameter && e.parameter.code) || '').trim().toUpperCase();
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json({ status: 'notfound' });
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowCode      = String(rows[i][0] || '').trim().toUpperCase();
    var rowStoreCode = String(rows[i][2] || '').trim();
    // Match vendor-level rows only (no storeCode in col 2)
    if (rowCode === code && !rowStoreCode) {
      return json({ status: 'ok', code: rows[i][0], company: rows[i][1] });
    }
  }
  return json({ status: 'notfound' });
}

function handleGetVendors() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);
  var rows = sheet.getDataRange().getValues();
  // Return vendor-level rows only (storeCode col is empty)
  return json(rows.slice(1).filter(function(r) {
    return r[0] && !String(r[2] || '').trim();
  }).map(function(r) {
    return { code: r[0], company: r[1] };
  }));
}

function handleSaveVendors(e) {
  var vendors = JSON.parse(e.parameter.payload);
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet) sheet = ss.insertSheet(VENDORS_SHEET);

  // Preserve existing store-contact rows (rows with a storeCode in col 2)
  var storeRows = [];
  if (sheet.getLastRow() >= 2) {
    var existing = sheet.getDataRange().getValues();
    for (var i = 1; i < existing.length; i++) {
      if (String(existing[i][2] || '').trim()) {
        storeRows.push(existing[i].slice(0, 6));
      }
    }
  }

  sheet.clearContents();
  // Schema: code | company | storeCode | firstName | lastName | email
  sheet.appendRow(['code', 'company', 'storeCode', 'firstName', 'lastName', 'email']);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Vendor-level rows (storeCode is blank)
  vendors.forEach(function(v) {
    sheet.appendRow([v.code, v.company, '', '', '', '']);
  });

  // Re-append store contact rows
  storeRows.forEach(function(r) { sheet.appendRow(r); });

  return json({ status: 'ok', saved: vendors.length });
}

/* ── Store contact lookup & save ────────────────────────── */

/**
 * lookupStore — find a store-contact row by vendorCode + storeCode.
 * Vendors sheet schema: code | company | storeCode | firstName | lastName | email
 * Returns { status:'ok', vendorCode, storeCode, company, firstName, lastName, email }
 * or      { status:'notfound' }
 */
function handleLookupStore(e) {
  var vendorCode = ((e.parameter && e.parameter.vendorCode) || '').trim().toUpperCase();
  var storeCode  = ((e.parameter && e.parameter.storeCode)  || '').trim().toUpperCase();
  if (!vendorCode || !storeCode) return json({ status: 'notfound' });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json({ status: 'notfound' });

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowVendor = String(rows[i][0] || '').trim().toUpperCase();
    var rowStore  = String(rows[i][2] || '').trim().toUpperCase();
    if (rowVendor === vendorCode && rowStore === storeCode) {
      return json({
        status:     'ok',
        vendorCode: rows[i][0] || '',
        company:    rows[i][1] || '',
        storeCode:  rows[i][2] || '',
        firstName:  rows[i][3] || '',
        lastName:   rows[i][4] || '',
        email:      rows[i][5] || '',
      });
    }
  }
  return json({ status: 'notfound' });
}

/**
 * saveStore — upsert a store-contact row.
 * Payload: { vendorCode, storeCode, company, firstName, lastName, email }
 * Composite key: vendorCode + storeCode.
 * On update: only firstName/lastName/email change; vendorCode/company/storeCode preserved.
 */
function handleSaveStore(e) {
  var data       = JSON.parse(e.parameter.payload);
  var vendorCode = String(data.vendorCode || '').trim().toUpperCase();
  var storeCode  = String(data.storeCode  || '').trim().toUpperCase();
  if (!vendorCode || !storeCode) return json({ status: 'error', message: 'Missing vendorCode or storeCode' });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet) sheet = ss.insertSheet(VENDORS_SHEET);

  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['code', 'company', 'storeCode', 'firstName', 'lastName', 'email']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowVendor = String(rows[i][0] || '').trim().toUpperCase();
    var rowStore  = String(rows[i][2] || '').trim().toUpperCase();
    if (rowVendor === vendorCode && rowStore === storeCode) {
      // Update contact columns (4-6); preserve code, company, storeCode
      sheet.getRange(i + 1, 4, 1, 3).setValues([[
        data.firstName || '',
        data.lastName  || '',
        data.email     || '',
      ]]);
      return json({ status: 'ok', action: 'updated' });
    }
  }

  // New store-contact row
  sheet.appendRow([
    vendorCode,
    data.company   || '',
    storeCode,
    data.firstName || '',
    data.lastName  || '',
    data.email     || '',
  ]);
  return json({ status: 'ok', action: 'inserted' });
}

/* ── Store contacts: list all (admin) ───────────────────── */

/**
 * getStoreContacts — return all store-contact rows.
 * Optional ?vendorCode=X to filter by vendor.
 * Schema: code | company | storeCode | firstName | lastName | email
 */
function handleGetStoreContacts(e) {
  var filterVendor = (e.parameter && e.parameter.vendorCode)
    ? e.parameter.vendorCode.trim().toUpperCase() : null;

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  var rows     = sheet.getDataRange().getValues();
  var contacts = [];
  for (var i = 1; i < rows.length; i++) {
    var rowStore = String(rows[i][2] || '').trim();
    if (!rowStore) continue;   // vendor-level row — skip
    var rowVendor = String(rows[i][0] || '').trim().toUpperCase();
    if (filterVendor && rowVendor !== filterVendor) continue;
    contacts.push({
      vendorCode: rows[i][0] || '',
      company:    rows[i][1] || '',
      storeCode:  rows[i][2] || '',
      firstName:  rows[i][3] || '',
      lastName:   rows[i][4] || '',
      email:      rows[i][5] || '',
    });
  }
  return json(contacts);
}

/**
 * deleteStore — remove a store-contact row by vendorCode + storeCode.
 */
function handleDeleteStore(e) {
  var vendorCode = ((e.parameter && e.parameter.vendorCode) || '').trim().toUpperCase();
  var storeCode  = ((e.parameter && e.parameter.storeCode)  || '').trim().toUpperCase();
  if (!vendorCode || !storeCode) return json({ status: 'error', message: 'Missing vendorCode or storeCode' });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Vendors sheet not found' });

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rv = String(rows[i][0] || '').trim().toUpperCase();
    var rs = String(rows[i][2] || '').trim().toUpperCase();
    if (rv === vendorCode && rs === storeCode) {
      sheet.deleteRow(i + 1);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Store contact not found: ' + vendorCode + '/' + storeCode });
}

/* ── Helpers ─────────────────────────────────────────────── */
/* ── Admin password verification ─────────────────────────── */
function handleVerifyPassword(e) {
  var pw = e && e.parameter && e.parameter.pw ? e.parameter.pw : '';
  if (pw === ADMIN_PASSWORD) {
    return json({ ok: true });
  }
  return json({ ok: false });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function th(text, align) {
  return '<th style="padding:8px 12px;text-align:' + (align||'left') + ';font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">' + text + '</th>';
}
function td(text, align) {
  return '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:' + (align||'left') + '">' + text + '</td>';
}
function row2(label, value, color) {
  return '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px">'
    + '<tr>'
    + '<td style="color:#718096">' + label + '</td>'
    + '<td align="right"><strong style="color:' + (color||'#1a202c') + '">' + value + '</strong></td>'
    + '</tr>'
    + '</table>';
}
