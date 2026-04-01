/**
 * Terra Nova — Wholesale Order Logger + Mailer + Product Inventory
 *
 * Deploy as Web App:  Execute as: Me  |  Who has access: Anyone
 *
 * Routes (all via GET + ?action=...):
 *   getProducts    — returns Products sheet as JSON array
 *   saveProducts   — writes payload JSON to Products sheet
 *   submitOrder    — logs order to Orders sheet + sends email  (default)
 */

const ORDER_EMAIL       = 'terranovamtlai@gmail.com';
const SPREADSHEET_ID    = '10H9CTzRHUGK6SrukXklahr0ebQvJR8bueNL8VZEmses';
const ORDERS_SHEET      = 'Orders';
const PRODUCTS_SHEET    = 'Products';
const COUNTER_SHEET     = 'Counter';

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

/* ── Router ──────────────────────────────────────────────── */
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'submitOrder';
  try {
    if      (action === 'getProducts')      return handleGetProducts();
    else if (action === 'saveProducts')     return handleSaveProducts(e);
    else if (action === 'getOrders')        return handleGetOrders();
    else if (action === 'updateOrderStatus') return handleUpdateOrderStatus(e);
    else                                    return handleSubmitOrder(e);
  } catch (err) {
    return json({ status: 'error', message: err.toString() });
  }
}

/* ── Products: read ──────────────────────────────────────── */
function handleGetProducts() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(PRODUCTS_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return json([]);
  }

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const products = rows.slice(1)
    .filter(r => r[0] !== '')
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });

  // Compute units already ordered per product (excluding cancelled orders)
  const ordersSheet = ss.getSheetByName(ORDERS_SHEET);
  const orderedMap  = {};
  if (ordersSheet && ordersSheet.getLastRow() > 1) {
    const oRows = ordersSheet.getDataRange().getValues();
    // First pass: collect cancelled order IDs (TOTAL rows with col 16 = true)
    var cancelled = {};
    oRows.slice(1).forEach(function(r) {
      var oid = String(r[1]);
      if (oid.indexOf(' — TOTAL') !== -1 && r[15] === true) {
        cancelled[oid.replace(' — TOTAL', '')] = true;
      }
    });
    // Second pass: sum Total Units (col 8, index 7) per product name for non-cancelled
    oRows.slice(1).forEach(function(r) {
      var oid = String(r[1]);
      if (oid.indexOf(' — TOTAL') === -1 && !cancelled[oid] && r[2] !== '') {
        orderedMap[r[2]] = (orderedMap[r[2]] || 0) + Number(r[7]);
      }
    });
  }

  // Attach remaining stock to each product
  // remaining = null means no inventory limit set (totalInventory = 0)
  products.forEach(function(p) {
    var total = Number(p.totalInventory) || 0;
    p.ordered   = orderedMap[p.name] || 0;
    p.remaining = total > 0 ? Math.max(0, total - p.ordered) : null;
  });

  return json(products);
}

/* ── Products: write ─────────────────────────────────────── */
function handleSaveProducts(e) {
  const products = JSON.parse(e.parameter.payload);
  const ss       = getSpreadsheet();
  let   sheet    = ss.getSheetByName(PRODUCTS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(PRODUCTS_SHEET);
  }

  sheet.clearContents();
  const headers = ['id','name','barcode','sku','srp','wholesale','img','orderUnit','unitsPerOrder','unitLabel','available','totalInventory'];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  products.forEach(function(p) {
    sheet.appendRow([
      p.id, p.name, p.barcode, p.sku,
      Number(p.srp), Number(p.wholesale),
      p.img, p.orderUnit, Number(p.unitsPerOrder), p.unitLabel,
      p.available !== false, Number(p.totalInventory) || 0,
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
      'Wholesale/Unit ($)','Line Wholesale ($)',
      'SRP/Unit ($)','Line SRP ($)',
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
      line.wholesaleUnit, line.lineWholesale,
      line.srpUnit,       line.lineSRP,
    ]);
  });

  // Totals summary row
  sheet.appendRow([
    data.date, data.orderId + ' — TOTAL',
    '— ' + data.lines.length + ' product(s) —',
    '','','',
    data.totalOrderUnits, data.totalIndividualUnits,
    '', data.totalWholesale,
    '', data.totalRetail,
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
      + td('$' + line.lineWholesale.toFixed(2), 'right')
      + '</tr>';
  }).join('');

  const html = ''
    + '<div style="font-family:sans-serif;max-width:620px;color:#1a202c">'
    + '<div style="background:#1e3a5f;padding:20px 24px">'
    + '<h1 style="color:#fff;margin:0;font-size:1.3rem">Terra Nova — New Wholesale Order</h1>'
    + '</div>'
    + '<div style="padding:24px">'
    + '<p style="color:#718096;margin:0 0 16px">Order <strong>' + data.orderId + '</strong> &nbsp;·&nbsp; ' + data.date + '</p>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:#f0f4f8">'
    + th('Product') + th('Order Qty') + th('Total Units') + th('Line Total', 'right')
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '<div style="margin-top:20px;background:#f0f4f8;border-radius:6px;padding:14px 16px">'
    + row2('Total Order Units',      data.totalOrderUnits)
    + row2('Total Individual Units', data.totalIndividualUnits)
    + row2('Wholesale Total',        '$' + data.totalWholesale.toFixed(2))
    + row2('Retail Value (SRP)',     '$' + data.totalRetail.toFixed(2), '#2d9c5e')
    + '</div>'
    + '</div></div>';

  MailApp.sendEmail({ to: ORDER_EMAIL, subject: 'New Terra Nova Order — ' + data.orderId, htmlBody: html });
}

/* ── Orders: read (admin) ────────────────────────────────── */
function handleGetOrders() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  const rows   = sheet.getDataRange().getValues();
  // Columns: 0=Date 1=OrderID 2=Product 3=SKU 4=Barcode 5=OrderUnit
  //          6=OrderQty 7=TotalUnits 8=WholesaleUnit 9=LineWholesale 10=SRPUnit 11=LineSRP
  //          12=OrderSent 13=InvoiceSent 14=PaymentReceived 15=Cancelled

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
        current.totalWholesale       = row[9];
        current.totalRetail          = row[11];
        current.orderSent            = row[12] === true;
        current.invoiceSent          = row[13] === true;
        current.paymentReceived      = row[14] === true;
        current.cancelled            = row[15] === true;
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
        lineWholesale: row[9],
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
  var colMap = { orderSent: 13, invoiceSent: 14, paymentReceived: 15, cancelled: 16 };
  var col    = colMap[field];
  if (!col) return json({ status: 'error', message: 'Unknown field: ' + field });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Orders sheet not found' });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === orderId + ' — TOTAL') {
      sheet.getRange(i + 1, col).setValue(value === true);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Order not found: ' + orderId });
}

/* ── Helpers ─────────────────────────────────────────────── */
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
