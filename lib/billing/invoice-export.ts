import { escapeHtml, invoiceFilename, invoiceHtml, itemHeaderHtml, type InvoiceDocument, type InvoiceStore } from './invoice-document';

// Render an isolated, fixed A4 document, rather than the live dashboard DOM.
// Each page is captured independently: no giant canvas, partial glyph slices,
// inherited application styles, off-screen mobile widths or CDN dependency.
export async function prepareInvoicePages(invoice: InvoiceDocument, store: InvoiceStore) {
  const frame = document.createElement('iframe');
  frame.title = `Invoice ${invoice.id}`;
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1000px', height: '1200px', border: '0', pointerEvents: 'none' });
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Invoice preview timed out. Please retry.')), 15000);
    frame.onload = () => { clearTimeout(timer); resolve(); };
    frame.onerror = () => { clearTimeout(timer); reject(new Error('Unable to load invoice preview.')); };
  });
  frame.srcdoc = invoiceHtml(invoice, store);
  document.body.appendChild(frame);
  try {
    await loaded;
    const doc = frame.contentDocument!;
    await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map(image => new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timer);
        if (!image.naturalWidth) {
          const notice = doc.createElement('p'); notice.textContent = 'Payment QR could not be loaded. Use the bank/UPI details.';
          image.replaceWith(notice);
        }
        resolve();
      };
      const timer = setTimeout(finish, 8000);
      if (image.complete) finish(); else { image.onload = finish; image.onerror = finish; }
    })));
    const source = doc.getElementById('invoice-source')!;
    const blocks = Array.from(source.children) as HTMLElement[];
    const pages: HTMLElement[] = [];
    let page: HTMLElement, content: HTMLElement;
    const newPage = () => {
      page = doc.createElement('article'); page.className = 'invoice-page';
      content = doc.createElement('div'); content.className = 'page-content';
      if (pages.length) content.innerHTML = `<div class="invoice-block continued">${escapeHtml(invoice.id)} | ${escapeHtml(store.storeName || 'Invoice')} | Continued</div>`;
      page.appendChild(content);
      const footer = doc.createElement('footer'); footer.className = 'page-footer';
      footer.innerHTML = 'Thank you for your purchase! <span class="page-number"></span>';
      page.appendChild(footer); doc.body.appendChild(page); pages.push(page);
    };
    const fits = () => content!.getBoundingClientRect().bottom <= page!.getBoundingClientRect().bottom - 76;
    newPage();
    let previousWasItem = false;
    for (const [blockIndex, block] of blocks.entries()) {
      const isItem = block.dataset.kind === 'item';
      let heading: HTMLElement | null = null;
      if (isItem && !previousWasItem) { content!.insertAdjacentHTML('beforeend', itemHeaderHtml); heading = content!.lastElementChild as HTMLElement; }
      content!.appendChild(block);
      // Section labels must travel with their first paragraph/entry rather
      // than being stranded just above the footer on the preceding page.
      const isHeading = block.children.length === 1 && block.firstElementChild?.tagName === 'H3';
      const probe = isHeading && blocks[blockIndex + 1] ? blocks[blockIndex + 1].cloneNode(true) as HTMLElement : null;
      if (probe) content!.appendChild(probe);
      const blockFits = fits();
      probe?.remove();
      if (!blockFits) {
        block.remove(); heading?.remove();
        if (content!.children.length === 0 || (pages.length > 1 && content!.children.length === 1)) throw new Error('An invoice field is too large for A4. Shorten the item description/address and retry.');
        newPage();
        if (isItem) content!.insertAdjacentHTML('beforeend', itemHeaderHtml);
        content!.appendChild(block);
        if (!fits()) throw new Error('An invoice field is too large for A4. Shorten the item description/address and retry.');
      }
      previousWasItem = isItem;
    }
    source.remove();
    pages.forEach((p, i) => { p.querySelector('.page-number')!.textContent = `${i + 1} / ${pages.length}`; });
    return { frame, pages, dispose: () => frame.remove() };
  } catch (error) { frame.remove(); throw error; }
}

export async function createInvoicePdf(invoice: InvoiceDocument, store: InvoiceStore) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const prepared = await prepareInvoicePages(invoice, store);
  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: `Invoice ${invoice.id}`, subject: 'Customer invoice', creator: 'Furzentic' });
    for (let i = 0; i < prepared.pages.length; i++) {
      if (i) pdf.addPage();
      const page = prepared.pages[i];
      const rect = page.getBoundingClientRect();
      const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: false, logging: false, windowWidth: 1000, windowHeight: 1200, scrollX: 0, scrollY: 0, width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      // Release the high resolution bitmap before preparing the next page.
      canvas.width = 1; canvas.height = 1;
    }
    return { blob: pdf.output('blob'), filename: invoiceFilename(invoice.id) };
  } finally { prepared.dispose(); }
}

export function downloadInvoicePdf(file: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a'); link.href = url; link.download = file.filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function printInvoice(invoice: InvoiceDocument, store: InvoiceStore) {
  const prepared = await prepareInvoicePages(invoice, store);
  const win = prepared.frame.contentWindow!;
  win.addEventListener('afterprint', prepared.dispose, { once: true });
  // Browsers/WebViews differ in afterprint support. Do not remove the frame
  // after 500ms while a print preview is still reading its document.
  setTimeout(prepared.dispose, 300000);
  try { win.focus(); win.print(); } catch (error) { prepared.dispose(); throw error; }
}
