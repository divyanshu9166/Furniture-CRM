import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, escapeHtml, invoiceCss, invoiceFilename, invoiceGstWarnings, invoiceHtml, invoiceParties, invoiceSections, safeImageSource, supplyState, validGstin, type InvoiceDocument } from './invoice-document';
import { createInvoiceSchema } from '../validations/invoice';

const store = { storeName: 'Sample Furniture', address: 'Patna, Bihar', gstNumber: '10ABCDE1234F1Z5' };
const invoice = (): InvoiceDocument => ({
  id: 'INV-0001', customer: 'Buyer', address: 'Patna', date: '2026-10-09', subtotal: 1000, discount: 0,
  gst: 180, cgst: 90, sgst: 90, igst: 0, total: 1180, amountPaid: 1180, balanceDue: 0,
  supplyType: 'INTRASTATE', placeOfSupply: 'Bihar', invoiceStatus: 'ACTIVE',
  items: [{ name: 'Chair', qty: 1, price: 1000, hsnCode: '9401', gstRate: 18, taxableAmount: 1000, cgst: 90, sgst: 90, igst: 0, cess: 0 }],
  documentSnapshot: { version: 1, seller: store, buyer: { customer: 'Buyer', phone: '9876543210', address: 'Patna' }, units: ['PCS'] },
});

test('A4 captures have dedicated bottom clearance and explicit footer line height', () => {
  assert.match(invoiceCss, /height:297mm/);
  assert.match(invoiceCss, /padding:12mm 12mm 20mm/);
  assert.match(invoiceCss, /bottom:7mm/);
  assert.match(invoiceCss, /line-height:20px;min-height:40px/);
});
test('document includes saved taxes, taxable line values, units, words and signatory', () => {
  const html = invoiceHtml(invoice(), store);
  assert.match(html, /TAX INVOICE/);
  assert.match(html, /CGST \(9%\)/);
  assert.match(html, /SGST\/UTGST \(9%\)/);
  assert.match(html, /9401/); assert.match(html, /PCS/);
  assert.match(html, /One Thousand One Hundred Eighty/);
  assert.match(html, /Authorised signatory/);
  assert.deepEqual(invoiceGstWarnings(invoice(), store), []);
});
test('new snapshots retain parties and bank details when live settings/contact change', () => {
  const inv = invoice(); inv.customer = 'Changed contact'; inv.address = 'Changed address';
  assert.equal(invoiceParties(inv, { ...store, storeName: 'Changed business' }).seller.storeName, 'Sample Furniture');
  assert.equal(invoiceParties(inv, store).buyer.customer, 'Buyer');
  assert.equal(invoiceParties(inv, store).buyer.address, 'Patna');
});
test('zero-rated / fully discounted stored amounts are never substituted or recalculated', () => {
  const inv = invoice();
  Object.assign(inv, { discount: 1000, total: 0, gst: 0, cgst: 0, sgst: 0, amountPaid: 0 });
  Object.assign(inv.items[0], { taxableAmount: 0, gstRate: 0, cgst: 0, sgst: 0 });
  assert.deepEqual(invoiceGstWarnings(inv, store), []);
  const html = invoiceHtml(inv, store);
  assert.match(html, /GST 0%/); assert.match(html, /Rupees Zero Only/);
  assert.match(html, /CGST \(0%\): ₹0.00/);
});
test('interstate documents show IGST and the destination state code', () => {
  const inv = invoice();
  Object.assign(inv, { supplyType: 'INTERSTATE', placeOfSupply: 'Maharashtra', cgst: 0, sgst: 0, igst: 180 });
  Object.assign(inv.items[0], { cgst: 0, sgst: 0, igst: 180 });
  assert.deepEqual(invoiceGstWarnings(inv, store), []);
  const html = invoiceHtml(inv, store); assert.match(html, /Maharashtra \(27\)/); assert.match(html, /IGST \(18%\): ₹180.00/);
});
test('legacy missing HSN/units and mismatched amounts are flagged, not silently repaired', () => {
  const inv = invoice(); inv.documentSnapshot = null; inv.items[0].hsnCode = null; inv.items[0].taxableAmount = 0;
  const before = structuredClone(inv);
  assert.ok(invoiceGstWarnings(inv, store).length >= 3);
  assert.match(invoiceHtml(inv, store), /GST DETAILS NEED REVIEW/);
  assert.deepEqual(inv, before);
});
test('held, cancelled and credited invoices do not masquerade as payable tax invoices', () => {
  const inv = invoice(); inv.isHeld = true; assert.match(invoiceHtml(inv, store), /HELD BILL - NOT A TAX INVOICE/);
  inv.isHeld = false; inv.invoiceStatus = 'CANCELLED'; assert.match(invoiceHtml(inv, store), /Cancelled - not payable/);
  inv.invoiceStatus = 'REFUNDED'; inv.creditNotes = [{ displayId: 'CN-0001', date: inv.date, amount: 1180, reason: 'Returned' }];
  const html = invoiceHtml(inv, store); assert.match(html, /Credit note history/); assert.match(html, /Net after credits/); assert.match(html, /refund to reconcile/);
});
test('all customer/store/item text is escaped; unsafe payment QR URLs are rejected', () => {
  const inv = invoice(); inv.items[0].name = '<img src=x onerror=alert(1)>'; inv.notes = '<script>alert(2)</script>';
  const html = invoiceHtml(inv, { ...store, paymentQr: 'javascript:alert(1)' });
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('javascript:'));
  assert.match(html, /&lt;script&gt;/); assert.equal(escapeHtml('"&'), '&quot;&amp;');
  assert.equal(safeImageSource('//evil.test/a'), ''); assert.equal(safeImageSource('data:image/svg+xml,<svg/>'), '');
});
test('long notes and terms become bounded independent blocks for pagination', () => {
  const inv = invoice(); inv.notes = 'नमस्ते ग्राहक '.repeat(1500);
  const sections = invoiceSections(inv, { ...store, invoiceTerms: 'Test '.repeat(2000) });
  assert.ok(sections.length > 30); assert.ok(sections.filter(s => s.includes('नमस्ते')).every(s => s.length < 600));
});
test('rupee words and filenames are stable and reject unsupported fractional currency', () => {
  assert.equal(amountInWords(3658), 'Rupees Three Thousand Six Hundred Fifty Eight Only');
  assert.equal(amountInWords(10000000), 'Rupees One Crore Only');
  assert.equal(amountInWords(0), 'Rupees Zero Only'); assert.throws(() => amountInWords(1.5));
  assert.equal(invoiceFilename('INV/2026/001'), 'Invoice_INV_2026_001.pdf');
});
test('GST state mapping normalises case and codes; GSTIN validation is format-only', () => {
  assert.deepEqual(supplyState('bihar'), { name: 'Bihar', code: '10' });
  assert.deepEqual(supplyState('27'), { name: 'Maharashtra', code: '27' });
  assert.equal(supplyState('Unknown'), null); assert.equal(validGstin('10ABCDE1234F1Z5'), true);
  assert.equal(validGstin('10DEBPK3635G'), false);
});
test('new writes validate GSTIN/HSN formats but allow unregistered buyers and blank optional codes', () => {
  const input = { customer: 'Buyer', phone: '9876543210', items: [{ productId: 1, name: 'Chair', sku: 'C', quantity: 1, price: 100 }] };
  assert.equal(createInvoiceSchema.safeParse({ ...input, gstNumber: 'wrong' }).success, false);
  assert.equal(createInvoiceSchema.safeParse({ ...input, gstNumber: '', items: [{ ...input.items[0], hsnCode: '' }] }).success, true);
  assert.equal(createInvoiceSchema.safeParse({ ...input, items: [{ ...input.items[0], hsnCode: '94XX' }] }).success, false);
});
