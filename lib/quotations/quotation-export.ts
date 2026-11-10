// Quotation PDF export that works on phones and inside app wrappers (WebView).
//
// The old code loaded html2pdf.js from a CDN at click time and captured a
// detached node, so it failed offline / in the app. This renders the quotation
// in an isolated, fixed-width frame with the bundled html2canvas + jsPDF and
// cuts pages only between table rows, so no line of text is sliced in half.

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 8;
const FRAME_WIDTH_PX = 820;

export function quotationFilename(id: string) {
  const safe = String(id || 'Quotation').replace(/[^A-Za-z0-9._-]+/g, '_');
  return `Quotation_${safe}.pdf`;
}

/** Android WebView ("; wv)") or an iOS app shell (no "Safari/" token). */
export function isEmbeddedWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/; wv\)/.test(ua)) return true;
  return /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua);
}

// html2canvas draws text at "normal" line height a few pixels lower than the
// browser lays it out, which clips the bottom of every line. A fixed line height
// removes most of the mismatch (the invoice export does the same) and a little
// bottom padding keeps the last line of a cell clear of the border below it.
const RENDER_CSS = 'body{line-height:1.4}td,th,.meta,.terms li,.bank p{line-height:1.4}td,th{padding-bottom:8px}.meta{padding-bottom:3px}.terms li,.bank p{padding-bottom:3px}.terms li.highlight{padding-bottom:5px}';

function withRenderStyles(html: string) {
  return html.includes('</head>') ? html.replace('</head>', `<style>${RENDER_CSS}</style></head>`) : html;
}

export type QuotationPdf = { blob: Blob; filename: string };

export async function createQuotationPdf(html: string, id: string): Promise<QuotationPdf> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const frame = document.createElement('iframe');
  frame.title = `Quotation ${id}`;
  frame.setAttribute('sandbox', 'allow-same-origin');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: `${FRAME_WIDTH_PX}px`, height: '1200px', border: '0', pointerEvents: 'none' });
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Quotation preview timed out. Please retry.')), 15000);
    frame.onload = () => { clearTimeout(timer); resolve(); };
    frame.onerror = () => { clearTimeout(timer); reject(new Error('Unable to load the quotation preview.')); };
  });
  // Standards mode matters: html2canvas lays the page out in standards mode, so a
  // quirks-mode frame measures rows differently and pages get cut mid-row.
  frame.srcdoc = withRenderStyles(/^\s*<!doctype/i.test(html) ? html : `<!DOCTYPE html>${html}`);
  document.body.appendChild(frame);

  try {
    await loaded;
    const doc = frame.contentDocument!;
    await doc.fonts?.ready;

    // Wait for item photos and the payment QR; swap any that fail for a note.
    await Promise.all(Array.from(doc.images).map(image => new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timer);
        if (!image.naturalWidth) {
          const notice = doc.createElement('span');
          notice.textContent = 'Image unavailable';
          notice.setAttribute('style', 'color:#666;font-size:10px;');
          image.replaceWith(notice);
        }
        resolve();
      };
      const timer = setTimeout(finish, 10000);
      if (image.complete) finish(); else { image.onload = finish; image.onerror = finish; }
    })));

    const sheet = doc.querySelector('.sheet') as HTMLElement | null;
    if (!sheet) throw new Error('Quotation layout could not be prepared.');
    doc.documentElement.style.overflow = 'hidden';
    const sheetRect = sheet.getBoundingClientRect();
    const sheetW = Math.ceil(sheetRect.width);
    const total = Math.ceil(sheetRect.height);
    frame.style.height = `${total + 20}px`;

    // Safe places to start a new page: just below any row, list entry or block.
    const breaks = Array.from(sheet.querySelectorAll('tr, li, .center, .terms, .bank-wrap'))
      .map(el => Math.round(el.getBoundingClientRect().bottom - sheetRect.top))
      .filter(y => y > 0 && y < total)
      .sort((a, b) => a - b);

    const contentWmm = PAGE_W_MM - 2 * MARGIN_MM;
    const pageHpx = Math.floor(((PAGE_H_MM - 2 * MARGIN_MM) / contentWmm) * sheetW);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: `Quotation ${id}`, subject: 'Customer quotation', creator: 'Furzentic' });
    pdf.setDrawColor(17, 17, 17);
    pdf.setLineWidth(0.8);

    let start = 0;
    let pageIndex = 0;
    while (start < total - 1) {
      const limit = start + pageHpx;
      let end = total;
      if (limit < total) {
        const fits = breaks.filter(y => y > start + pageHpx * 0.35 && y <= limit);
        end = fits.length ? fits[fits.length - 1] : limit;
      }
      const canvas = await html2canvas(sheet, {
        scale, backgroundColor: '#ffffff', useCORS: true, allowTaint: false, logging: false,
        x: 0, y: start, width: sheetW, height: end - start,
        windowWidth: FRAME_WIDTH_PX, windowHeight: total + 20, scrollX: 0, scrollY: 0,
      });
      if (pageIndex) pdf.addPage();
      const imageH = ((end - start) / sheetW) * contentWmm;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, MARGIN_MM, contentWmm, imageH, undefined, 'FAST');
      // The sheet's own border only exists at the very top and bottom.
      if (start > 0) pdf.line(MARGIN_MM, MARGIN_MM, MARGIN_MM + contentWmm, MARGIN_MM);
      if (end < total) pdf.line(MARGIN_MM, MARGIN_MM + imageH, MARGIN_MM + contentWmm, MARGIN_MM + imageH);
      // Release the bitmap before rendering the next page (phones have little memory).
      canvas.width = 1; canvas.height = 1;
      start = end;
      pageIndex += 1;
    }

    return { blob: pdf.output('blob'), filename: quotationFilename(id) };
  } finally {
    frame.remove();
  }
}

export function downloadQuotationPdf(file: QuotationPdf) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Stores the PDF on the server and returns an absolute link. App wrappers
 * can't save blob: downloads or attach files to WhatsApp, but they can follow
 * a normal https link, so this link is what gets downloaded / shared there.
 */
export async function uploadQuotationPdf(file: QuotationPdf) {
  const form = new FormData();
  form.set('folder', 'quotations');
  form.append('files', new File([file.blob], file.filename, { type: 'application/pdf' }));
  const response = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  const path = Array.isArray(data?.urls) ? data.urls[0] : '';
  if (!response.ok || !data?.success || !path) throw new Error(data?.error || 'Could not upload the PDF. Check your connection and retry.');
  return `${window.location.origin}${path}`;
}

/** The same link, served with "Content-Disposition: attachment" so it saves as a file. */
export function quotationDownloadLink(url: string, filename: string) {
  return `${url}?download=1&filename=${encodeURIComponent(filename)}`;
}

/**
 * Emails the generated PDF to the customer from the server as an attachment.
 * Throws with a readable reason.
 */
export async function sendQuotationPdf(file: QuotationPdf, quotationId: number, channel: 'email') {
  const form = new FormData();
  form.set('channel', channel);
  form.set('quotationId', String(quotationId));
  form.append('file', new File([file.blob], file.filename, { type: 'application/pdf' }));
  const response = await fetch('/api/quotations/send', { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) throw new Error(data?.error || 'Could not send the quotation. Please retry.');
  return data as { success: true; to: string };
}
