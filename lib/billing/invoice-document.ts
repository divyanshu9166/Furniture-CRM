// A single, escaped document for print, download and file sharing. Rendering
// reads saved amounts; it must never recalculate an issued invoice's taxes.
export type InvoiceLine = {
  name: string; sku?: string | null; qty: number; price: number; hsnCode?: string | null;
  gstRate?: number; taxableAmount?: number; cgst?: number; sgst?: number; igst?: number; cess?: number;
}
export type InvoiceDocument = {
  id: string; customer: string; address?: string | null; phone?: string | null; gstNumber?: string | null;
  date: string; time?: string | null; dueDate?: string | null; items: InvoiceLine[];
  subtotal: number; discount: number; gst: number; cgst: number; sgst: number; igst: number; cess?: number;
  total: number; amountPaid: number; balanceDue: number; transportCost?: number;
  supplyType?: string; placeOfSupply?: string | null; isRCM?: boolean; isHeld?: boolean;
  invoiceStatus?: string; paymentStatus?: string; paymentMethod?: string; notes?: string | null;
  payments?: { date: string; method: string; amount: number; reference?: string | null }[];
  creditNotes?: { displayId: string; date: string; amount: number; reason: string }[];
  documentSnapshot?: InvoiceSnapshot | null;
}
export type InvoiceStore = {
  storeName?: string; address?: string | null; phone?: string | null; email?: string | null;
  gstNumber?: string | null; invoiceTerms?: string | null; paymentQr?: string | null;
  bankName?: string | null; bankAccountName?: string | null; bankAccountNumber?: string | null;
  bankIfsc?: string | null; bankUpiId?: string | null;
}
export type InvoiceSnapshot = {
  version: 1; seller: InvoiceStore;
  buyer: { customer: string; phone: string; address?: string | null; gstNumber?: string | null };
  deliveryAddress?: string | null; units: string[];
}

const states: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}
export function supplyState(value?: string | null) {
  const text = String(value || '').trim();
  const match = Object.entries(states).find(([code, name]) => text === code || text.toLowerCase() === name.toLowerCase() || text.toLowerCase() === `${name} (${code})`.toLowerCase());
  return match ? { code: match[0], name: match[1] } : null;
}
export function validGstin(value?: string | null) {
  return !!value && /^(0[1-9]|[12]\d|3[0-8])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.trim().toUpperCase());
}
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export const invoiceFilename = (id: string) => `Invoice_${id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'document'}.pdf`;
const money = (n = 0) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const small = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
export function amountInWords(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invoice amount must be whole rupees');
  const words = (n: number): string => {
    if (n < 20) return small[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${words(n % 10)}`.trim();
    for (const [divisor, name] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']] as const) {
      if (n >= divisor) return `${words(Math.floor(n / divisor))} ${name} ${words(n % divisor)}`.trim();
    }
    return '';
  };
  return `Rupees ${words(amount) || 'Zero'} Only`;
}
export function invoiceParties(inv: InvoiceDocument, store: InvoiceStore) {
  const snapshot = inv.documentSnapshot?.version === 1 ? inv.documentSnapshot : null;
  return { seller: snapshot?.seller || store, buyer: snapshot?.buyer || inv, snapshot };
}
export function invoiceGstWarnings(inv: InvoiceDocument, store: InvoiceStore): string[] {
  const { seller, buyer, snapshot } = invoiceParties(inv, store);
  const warnings: string[] = [];
  if (!seller.storeName?.trim()) warnings.push('Supplier business name is missing.');
  if (!buyer.customer?.trim()) warnings.push('Buyer name is missing.');
  if (!validGstin(seller.gstNumber)) warnings.push('Supplier GSTIN is missing or has an invalid format.');
  if (!seller.address?.trim()) warnings.push('Supplier address is missing.');
  if (buyer.gstNumber && !validGstin(buyer.gstNumber)) warnings.push('Buyer GSTIN has an invalid format.');
  if ((buyer.gstNumber || inv.total >= 50000) && !buyer.address?.trim()) warnings.push('Buyer address is required for this invoice.');
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(inv.id)) warnings.push('GST invoice number must be at most 16 characters, using letters, digits, / or -.');
  const destination = supplyState(inv.placeOfSupply);
  if (!destination) warnings.push('Select a recognised place-of-supply state.');
  if (validGstin(seller.gstNumber) && destination) {
    const interstate = seller.gstNumber!.slice(0, 2) !== destination.code;
    if (interstate !== (inv.supplyType === 'INTERSTATE')) warnings.push('Supply type does not match supplier state and place of supply.');
  }
  if (inv.items.some(i => !/^\d{4}(\d{2})?(\d{2})?$/.test(i.hsnCode || ''))) warnings.push('An item has a missing/invalid HSN code. Confirm required HSN digits with your accountant.');
  if (!snapshot || snapshot.units.length !== inv.items.length || snapshot.units.some(unit => !unit)) warnings.push('Historical item units were not recorded; confirm UQC before issuing as a GST tax invoice.');
  const sum = (key: 'taxableAmount' | 'cgst' | 'sgst' | 'igst' | 'cess') => inv.items.reduce((s, i) => s + (i[key] ?? 0), 0);
  if (inv.items.some(i => i.taxableAmount === undefined || i.gstRate === undefined) || sum('taxableAmount') !== inv.subtotal - inv.discount || sum('cgst') !== inv.cgst || sum('sgst') !== inv.sgst || sum('igst') !== inv.igst || sum('cess') !== (inv.cess ?? 0)) warnings.push('Saved item tax details do not reconcile with invoice totals. Review legacy records; no amounts have been changed.');
  if ((inv.transportCost ?? 0) > 0) warnings.push('Freight is stored separately without a configured GST treatment. Have your accountant review incidental-expense tax before issuing.');
  if (inv.gst !== inv.cgst + inv.sgst + inv.igst || inv.total !== inv.subtotal - inv.discount + inv.gst + (inv.cess ?? 0) + (inv.transportCost ?? 0)) warnings.push('Saved invoice totals need reconciliation.');
  if (inv.isRCM) warnings.push('Reverse-charge invoice: verify applicable tax and recipient liability with your accountant.');
  if ((inv.cess ?? 0) > 0) warnings.push('Cess rate was not recorded separately; verify the cess particulars with your accountant.');
  if (inv.supplyType !== 'INTERSTATE' && inv.items.some(i => (i.cgst ?? 0) !== (i.sgst ?? 0))) warnings.push('Historical whole-rupee rounding has produced unequal CGST/SGST amounts; accountant review is required.');
  if (['EXPORT', 'EXEMPT', 'NIL_RATED'].includes(inv.supplyType || '')) warnings.push('This supply needs a specialised invoice/bill-of-supply workflow.');
  return warnings;
}

export const invoiceCss = `
*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#172033;font-family:Arial,"Segoe UI",sans-serif;font-size:11px;line-height:1.45}
.invoice-page{width:210mm;height:297mm;padding:12mm 12mm 20mm;position:relative;background:#fff;overflow:hidden;break-after:page}
.invoice-page:last-child{break-after:auto}.page-content{width:100%}.invoice-block{margin:0 0 8px;overflow-wrap:anywhere;break-inside:avoid}
.page-footer{position:absolute;left:12mm;right:12mm;bottom:7mm;border-top:1px solid #dbe0e8;padding:8px 0 6px;text-align:center;color:#566174;font-size:11px;line-height:20px;min-height:40px}
.page-number{float:right}.header,.parties,.bank-grid{display:flex;gap:20px;justify-content:space-between}.header{border-bottom:2px solid #172033;padding-bottom:12px}.header>div,.parties>div,.bank-grid>div{flex:1;min-width:0}
h1{font-size:21px;line-height:1.4;margin:0 0 4px}h2{font-size:16px;line-height:1.5;margin:0 0 6px}h3{font-size:12px;line-height:1.5;margin:0 0 6px;text-transform:uppercase;color:#566174}
.right{text-align:right}.muted{color:#566174;font-size:11px}.notice{background:#fff7e6;border:1px solid #e3c780;border-radius:5px;padding:10px;color:#664800}.status{font-weight:bold;color:#933d20}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:5px;vertical-align:top;overflow-wrap:anywhere;border-bottom:1px solid #e3e7ee;line-height:1.4}th{background:#f1f4f8;color:#465269;text-align:left;font-size:10px}
td{font-size:11px}.num{text-align:right}.items col:nth-child(1){width:5%}.items col:nth-child(2){width:27%}.items col:nth-child(3){width:11%}.items col:nth-child(4){width:11%}.items col:nth-child(5){width:15%}.items col:nth-child(6){width:15%}.items col:nth-child(7){width:16%}
.item-row{margin-bottom:0}.items-header{margin-bottom:0}.totals{width:310px;margin-left:auto}.totals td{font-size:12px;padding:4px}.totals .grand td{font-weight:bold;font-size:16px;border-top:2px solid #172033}.box{border:1px solid #dbe0e8;border-radius:7px;padding:10px}.qr{width:110px;height:110px;object-fit:contain}.signature{text-align:right;min-height:52px;padding-top:6px}.signature-line{margin-top:14px;margin-left:auto;border-top:1px solid #aab2bf;display:block;width:190px;max-width:100%}.continued{font-weight:bold;border-bottom:1px solid #dbe0e8;padding-bottom:6px}
@page{size:A4;margin:0}@media print{html,body{width:210mm}.invoice-page{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
export const itemHeaderHtml = '<div class="invoice-block items-header"><table class="items"><colgroup><col/><col/><col/><col/><col/><col/><col/></colgroup><thead><tr><th>#</th><th>Item / SKU</th><th>HSN</th><th class="num">Qty / Unit</th><th class="num">Rate</th><th class="num">Gross</th><th class="num">Taxable</th></tr></thead></table></div>';
export function safeImageSource(value?: string | null) {
  if (!value) return '';
  return /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(value) ? value : '';
}
function textChunks(text: string, length = 450) {
  const parts: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const word of paragraph.split(/(\s+)/u)) {
      if (current.length + word.length > length && current) { parts.push(current); current = ''; }
      if (word.length <= length) current += word;
      else {
        // Preserve surrogate pairs and combining characters in unusually long
        // unbroken text, including Hindi, rather than cutting a glyph in half.
        const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word);
        for (const { segment } of graphemes) {
          if (current.length + segment.length > length && current) { parts.push(current); current = ''; }
          current += segment;
        }
      }
    }
    if (current) parts.push(current);
  }
  return parts;
}
export function invoiceSections(inv: InvoiceDocument, store: InvoiceStore): string[] {
  const e = escapeHtml;
  const { seller, buyer, snapshot } = invoiceParties(inv, store);
  const warnings = invoiceGstWarnings(inv, store);
  const title = inv.isHeld ? 'HELD BILL - NOT A TAX INVOICE' : inv.invoiceStatus && inv.invoiceStatus !== 'ACTIVE' ? `${inv.invoiceStatus} INVOICE` : warnings.length ? 'INVOICE - GST DETAILS NEED REVIEW' : 'TAX INVOICE';
  const section = (html: string, cls = '') => `<section class="invoice-block ${cls}">${html}</section>`;
  const parts = [section(`<div class="header"><div><h1>${e(seller.storeName || 'Furniture Store')}</h1><div>${e(seller.address)}</div><div class="muted">${e([seller.phone, seller.email].filter(Boolean).join(' | '))}</div><div>GSTIN: ${e(seller.gstNumber || 'Not configured')}</div></div><div class="right"><h2>${e(title)}</h2><strong>${e(inv.id)}</strong><div>${e(inv.date)} ${e(inv.time)}</div><div class="muted">Original for recipient</div><div class="status">${e(inv.paymentStatus)}${inv.isHeld ? ' | Held' : ''}</div></div></div>`),
    section(`<div class="parties"><div><h3>Bill to</h3><strong>${e(buyer.customer)}</strong><div>${e(buyer.address || 'Address not recorded')}</div><div>${e(buyer.phone)}</div><div>GSTIN: ${e(buyer.gstNumber || 'Unregistered / not supplied')}</div>${snapshot?.deliveryAddress ? `<h3>Ship to</h3><div>${e(snapshot.deliveryAddress)}</div>` : ''}</div><div class="right"><h3>Supply & payment</h3><div>Place of supply: ${e(supplyState(inv.placeOfSupply) ? `${supplyState(inv.placeOfSupply)!.name} (${supplyState(inv.placeOfSupply)!.code})` : inv.placeOfSupply || 'Not recorded')}</div><div>${e(inv.supplyType || 'Not recorded')}</div><div>Reverse charge: ${inv.isRCM ? 'Yes' : 'No'}</div><div>${e(inv.paymentMethod)}${inv.dueDate ? ` | Due: ${e(inv.dueDate)}` : ''}</div></div></div>`),
  ];
  // Keep review notes small enough to paginate independently, even on legacy bills.
  for (const warning of warnings) parts.push(section(e(warning), 'notice'));
  inv.items.forEach((item, index) => {
    parts.push(`<section class="invoice-block item-row" data-kind="item"><table class="items"><colgroup><col/><col/><col/><col/><col/><col/><col/></colgroup><tbody><tr><td>${index + 1}</td><td><strong>${e(item.name)}</strong><div class="muted">${e(item.sku)}</div><div class="muted">GST: ${e(item.gstRate ?? 'Not recorded')}%</div></td><td>${e(item.hsnCode || '-')}</td><td class="num">${item.qty}<div class="muted">${e(snapshot?.units[index] || 'Unit not recorded')}</div></td><td class="num">${money(item.price)}</td><td class="num">${money(item.price * item.qty)}</td><td class="num">${item.taxableAmount === undefined ? 'Not recorded' : money(item.taxableAmount)}</td></tr></tbody></table></section>`);
  });
  parts.push(section('<h3>GST breakdown (saved amounts)</h3>'));
  const groups = new Map<string, { hsn: string; rate: number | undefined; taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
  for (const item of inv.items) {
    const key = `${item.hsnCode || '-'}:${item.gstRate ?? '?'}`;
    const row = groups.get(key) || { hsn: item.hsnCode || '-', rate: item.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    for (const field of ['cgst', 'sgst', 'igst', 'cess'] as const) row[field] += item[field] ?? 0;
    row.taxable += item.taxableAmount ?? 0;
    groups.set(key, row);
  }
  for (const row of groups.values()) parts.push(section(`<div class="box"><strong>HSN ${e(row.hsn)} | GST ${e(row.rate ?? 'Not recorded')}%</strong><div>Taxable: ${money(row.taxable)} | ${inv.supplyType === 'INTERSTATE' ? `IGST (${e(row.rate ?? '?')}%): ${money(row.igst)}` : `CGST (${e(row.rate === undefined ? '?' : row.rate / 2)}%): ${money(row.cgst)} | SGST/UTGST (${e(row.rate === undefined ? '?' : row.rate / 2)}%): ${money(row.sgst)}`}${row.cess ? ` | Cess: ${money(row.cess)}` : ''}</div></div>`));
  const totalRow = (label: string, value: number, cls = '') => `<tr class="${cls}"><td>${e(label)}</td><td class="num">${money(value)}</td></tr>`;
  const credited = (inv.creditNotes || []).reduce((sum, credit) => sum + credit.amount, 0);
  parts.push(section(`<table class="totals"><tbody>${totalRow('Subtotal', inv.subtotal)}${inv.discount ? totalRow('Discount', -inv.discount) : ''}${totalRow('Taxable goods', inv.subtotal - inv.discount)}${inv.supplyType === 'INTERSTATE' ? totalRow('IGST', inv.igst) : totalRow('CGST', inv.cgst) + totalRow('SGST / UTGST', inv.sgst)}${inv.cess ? totalRow('Cess', inv.cess) : ''}${inv.transportCost ? totalRow('Transport (tax treatment not configured)', inv.transportCost) : ''}${totalRow('Invoice total', inv.total, 'grand')}${credited ? totalRow('Credit notes', -credited) + totalRow('Net after credits', inv.total - credited) : ''}${totalRow('Amount paid', inv.amountPaid)}${inv.invoiceStatus === 'CANCELLED' ? '<tr><td colspan="2">Cancelled - not payable</td></tr>' : totalRow('Balance due', inv.balanceDue)}${inv.amountPaid > inv.total - credited ? totalRow('Overpaid / refund to reconcile', inv.amountPaid - (inv.total - credited)) : ''}</tbody></table>`));
  parts.push(section(`<strong>Amount in words:</strong> ${e(amountInWords(inv.total))}<div class="muted">Amounts are displayed from the saved invoice. This system currently records amounts and taxes in whole rupees.</div>`));
  if (inv.payments?.length) {
    parts.push(section('<h3>Payment history</h3>'));
    for (const p of inv.payments) parts.push(section(`<div>${e(p.date)} | ${e(p.method)} ${p.reference ? `| Ref: ${e(p.reference)}` : ''}<strong style="float:right">${money(p.amount)}</strong></div>`));
  }
  if (inv.creditNotes?.length) {
    parts.push(section('<h3>Credit note history</h3>'));
    for (const c of inv.creditNotes) parts.push(section(`<strong>${e(c.displayId)} | ${e(c.date)} | ${money(c.amount)}</strong><div>${e(c.reason)}</div>`));
  }
  if (inv.notes) { parts.push(section('<h3>Notes</h3>')); for (const text of textChunks(inv.notes)) parts.push(section(e(text))); }
  const bank = [['Bank', seller.bankName], ['A/C name', seller.bankAccountName], ['A/C number', seller.bankAccountNumber], ['IFSC', seller.bankIfsc], ['UPI', seller.bankUpiId]].filter(([, value]) => value);
  const qr = safeImageSource(seller.paymentQr);
  if (bank.length || qr) parts.push(section(`<div class="bank-grid">${bank.length ? `<div class="box"><h3>Bank details</h3>${bank.map(([label, value]) => `<div>${e(label)}: ${e(value)}</div>`).join('')}</div>` : ''}${qr ? `<div class="box right"><h3>Payment QR (not GST IRP QR)</h3><img class="qr" src="${e(qr)}" alt="Payment QR" crossorigin="anonymous"/></div>` : ''}</div>`));
  if (seller.invoiceTerms) { parts.push(section('<h3>Terms & conditions</h3>')); for (const text of textChunks(seller.invoiceTerms)) parts.push(section(e(text))); }
  parts.push(section(`<div class="signature"><div>For ${e(seller.storeName || 'Supplier')}</div><div class="signature-line">Authorised signatory</div></div>`));
  return parts;
}

export function invoiceHtml(inv: InvoiceDocument, store: InvoiceStore) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(inv.id)}</title><style>${invoiceCss}</style></head><body><main id="invoice-source">${invoiceSections(inv, store).join('')}</main></body></html>`;
}
