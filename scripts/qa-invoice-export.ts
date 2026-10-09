// Local, synthetic PDF regression harness. No database/env/customer services.
// Run npm run qa:invoice, then open the printed loopback URL in a browser.
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

async function main() {
  const root = process.cwd();
  const output = resolve(root, '.local-dev/invoice-qa/tmp/pdfs');
  await mkdir(output, { recursive: true });
  const bundle = await build({ stdin: { contents: `
    import { createInvoicePdf, prepareInvoicePages } from './lib/billing/invoice-export';
    import { calculateBill } from './lib/commerce/rules';
    const seller = { storeName: 'Sample Furniture - QA ONLY', address: 'Example showroom, Patna, Bihar', gstNumber: '10ABCDE1234F1Z5', bankName: 'Example Bank', bankAccountName: 'Sample Furniture', bankAccountNumber: 'TEST-ACCOUNT', bankIfsc: 'TEST0000001', bankUpiId: 'sample@example', invoiceTerms: 'Sample document only. Not a real invoice.' };
    function fixture(kind) {
      const count = kind === 'multipage' ? 70 : kind === 'hindi' ? 6 : 1;
      const items = Array.from({ length: count }, (_, i) => ({ name: kind === 'hindi' ? 'कार्यालय की कुर्सी - ग्राहक परीक्षण' : 'Ergonomic Office Chair - upholstered seat, adjustable armrests and sturdy furniture frame ' + (i+1), sku: 'QA-' + (i+1), quantity: 1, price: i % 2 ? 2000 : 3100, gstRate: i % 2 ? 12 : 18, hsnCode: '9401' }));
      const bill = calculateBill(items, kind === 'multipage' ? 100 : 0, 'flat', 18, kind === 'multipage');
      const inv = { id: 'QA-' + kind.toUpperCase(), customer: 'Sample Customer', phone: '9999999999', address: 'Example billing address', date: '2026-10-09', time: '12:00 PM', ...bill, items: bill.rows.map(i => ({ ...i, qty: i.quantity })), amountPaid: bill.total, balanceDue: 0, paymentStatus: 'Paid', paymentMethod: 'Cash', invoiceStatus: 'ACTIVE', supplyType: kind === 'multipage' ? 'INTERSTATE' : 'INTRASTATE', placeOfSupply: kind === 'multipage' ? 'Maharashtra' : 'Bihar', payments: [{ date: '2026-10-09', method: 'Cash', amount: bill.total, reference: 'QA-ONLY' }], documentSnapshot: { version: 1, seller, buyer: { customer: 'Sample Customer', phone: '9999999999', address: 'Example billing address' }, deliveryAddress: 'Example delivery address', units: items.map(() => 'PCS') } };
      if (kind === 'legacy') { inv.documentSnapshot = null; inv.items[0].hsnCode = ''; inv.items[0].taxableAmount = 0; }
      if (kind === 'hindi') inv.notes = 'धन्यवाद! यह केवल परीक्षण के लिए बनाया गया नमूना है। '.repeat(80);
      return inv;
    }
    document.querySelectorAll('button').forEach(button => button.addEventListener('click', async () => {
      const status = document.querySelector('#status');
      document.querySelectorAll('button').forEach(b => b.disabled = true);
      try {
        status.textContent = 'Generating ' + button.dataset.kind + '...';
        const inv = fixture(button.dataset.kind);
        const prepared = await prepareInvoicePages(inv, seller);
        const metrics = prepared.pages.map((page, index) => ({ page: index + 1, text: page.innerText, contentBottom: page.querySelector('.page-content').getBoundingClientRect().bottom - page.getBoundingClientRect().top, footerTop: page.querySelector('.page-footer').getBoundingClientRect().top - page.getBoundingClientRect().top, itemHeaders: page.querySelectorAll('.items-header').length }));
        prepared.dispose();
        if (metrics.some(m => m.contentBottom >= m.footerTop)) throw new Error('Content overlaps footer');
        const generated = await createInvoicePdf(inv, seller);
        const response = await fetch('/artifacts/' + button.dataset.kind, { method: 'POST', body: generated.blob, headers: { 'Content-Type': 'application/pdf' } });
        if (!response.ok) throw new Error('Artifact write failed');
        document.querySelector('#metrics').textContent = JSON.stringify(metrics.map(({text, ...metric}) => metric), null, 2);
        document.querySelector('#preview').src = URL.createObjectURL(generated.blob);
        status.textContent = 'PASS: ' + button.dataset.kind + ' - ' + metrics.length + ' A4 page(s), no content/footer overlap. PDF saved locally.';
      } catch (error) { status.textContent = 'FAIL: ' + error.message; }
      finally { document.querySelectorAll('button').forEach(b => b.disabled = false); }
    }));
  `, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', minify: false });
  const js = bundle.outputFiles[0].contents;
  const names = new Set(['single', 'multipage', 'legacy', 'hindi']);
  createServer(async (req, res) => {
    const name = req.url?.replace('/artifacts/', '') || '';
    if (req.method === 'POST' && req.url?.startsWith('/artifacts/') && names.has(name)) {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 30000000) { res.writeHead(413).end(); return; } chunks.push(chunk); }
      const buffer = Buffer.concat(chunks);
      if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) { res.writeHead(400).end(); return; }
      await writeFile(resolve(output, `${name}.pdf`), buffer);
      res.writeHead(200).end('Saved'); return;
    }
    if (req.url === '/bundle.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(js); return; }
    if (req.url !== '/') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Invoice export QA</title><style>body{font:16px Arial;margin:24px;color:#172033;background:#f4f6fa}button{padding:12px;margin:5px}iframe{width:850px;height:900px;border:1px solid #ccd}pre{font-size:12px}</style></head><body><h1>Invoice PDF regression - synthetic data only</h1><p>No database, stock, payment, SMTP or production records are accessed.</p><button data-kind="single">Export single page</button><button data-kind="multipage">Export multi-page</button><button data-kind="legacy">Export legacy warning</button><button data-kind="hindi">Export Hindi notes</button><p id="status">Ready</p><pre id="metrics"></pre><iframe id="preview" title="Generated invoice PDF"></iframe><script src="/bundle.js"></script></body></html>`);
  }).listen(4341, '127.0.0.1', () => console.log(`Invoice QA: http://127.0.0.1:4341/\nPDFs: ${output}`));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
