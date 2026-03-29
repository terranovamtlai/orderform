/**
 * Terra Nova — Wholesale Order Logger + Mailer
 * Paste this into Google Apps Script (Extensions → Apps Script),
 * then deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Sheet columns (auto-created on first order):
 *   Date | Order ID | Product | SKU | Barcode |
 *   Displays | Pairs | Wholesale/Unit | Line Wholesale | SRP/Unit | Line SRP
 */

const ORDER_EMAIL = 'mtlaibaker@gmail.com';
const SHEET_NAME  = 'Orders';

function doGet(e) {
  try {
    const data  = JSON.parse(e.parameter.payload);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(SHEET_NAME);

    // Create sheet tab if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // Write header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Date', 'Order ID', 'Product', 'SKU', 'Barcode',
        'Displays', 'Pairs', 'Wholesale/Unit ($)', 'Line Wholesale ($)',
        'SRP/Unit ($)', 'Line SRP ($)',
      ]);
      sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Append one row per line item
    data.lines.forEach(function (line) {
      sheet.appendRow([
        data.date,
        data.orderId,
        line.name,
        line.sku,
        line.barcode,
        line.qty,
        line.pairs,
        line.wholesaleUnit,
        line.lineWholesale,
        line.srpUnit,
        line.lineSRP,
      ]);
    });

    // Append a totals summary row for this order
    const totalsRow = [
      data.date,
      data.orderId + ' — TOTAL',
      '— ' + data.lines.length + ' product(s) —',
      '', '',
      data.totalDisplays,
      data.totalPairs,
      '',
      data.totalWholesale,
      '',
      data.totalRetail,
    ];
    sheet.appendRow(totalsRow);
    sheet.getRange(sheet.getLastRow(), 1, 1, 11)
         .setFontStyle('italic')
         .setBackground('#f0f4f8');

    // ── Send email ──────────────────────────────────────────
    sendOrderEmail(data);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', orderId: data.orderId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function sendOrderEmail(data) {
  const rows = data.lines.map(function (line) {
    return '<tr>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + line.name + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">' + line.qty + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">' + line.pairs + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">$' + line.lineWholesale.toFixed(2) + '</td>'
      + '</tr>';
  }).join('');

  const htmlBody = ''
    + '<div style="font-family:sans-serif;max-width:600px;color:#1a202c">'
    + '  <div style="background:#1e3a5f;padding:20px 24px">'
    + '    <h1 style="color:#fff;margin:0;font-size:1.3rem">Terra Nova — New Wholesale Order</h1>'
    + '  </div>'
    + '  <div style="padding:24px">'
    + '    <p style="color:#718096;margin:0 0 20px">Order ID: <strong>' + data.orderId + '</strong> &nbsp;·&nbsp; Date: ' + data.date + '</p>'
    + '    <table style="width:100%;border-collapse:collapse">'
    + '      <thead>'
    + '        <tr style="background:#f0f4f8">'
    + '          <th style="padding:8px 12px;text-align:left;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">Product</th>'
    + '          <th style="padding:8px 12px;text-align:center;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">Displays</th>'
    + '          <th style="padding:8px 12px;text-align:center;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">Pairs</th>'
    + '          <th style="padding:8px 12px;text-align:right;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">Line Total</th>'
    + '        </tr>'
    + '      </thead>'
    + '      <tbody>' + rows + '</tbody>'
    + '    </table>'
    + '    <div style="margin-top:20px;background:#f0f4f8;border-radius:6px;padding:14px 16px">'
    + '      <table style="width:100%">'
    + '        <tr><td style="color:#718096">Total Displays</td><td style="text-align:right;font-weight:700">' + data.totalDisplays + '</td></tr>'
    + '        <tr><td style="color:#718096">Total Pairs</td><td style="text-align:right;font-weight:700">' + data.totalPairs + '</td></tr>'
    + '        <tr><td style="color:#718096">Wholesale Total</td><td style="text-align:right;font-weight:700">$' + data.totalWholesale.toFixed(2) + '</td></tr>'
    + '        <tr><td style="color:#2d9c5e;font-weight:600">Retail Value (SRP)</td><td style="text-align:right;font-weight:700;color:#2d9c5e">$' + data.totalRetail.toFixed(2) + '</td></tr>'
    + '      </table>'
    + '    </div>'
    + '  </div>'
    + '</div>';

  MailApp.sendEmail({
    to:       ORDER_EMAIL,
    subject:  'New Terra Nova Order — ' + data.orderId,
    htmlBody: htmlBody,
  });
}

