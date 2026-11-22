export function paymentReceipt(raw: string, origin: string) {
  try {
    const url = new URL(raw, origin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const path = url.pathname.toLowerCase();
    const localUpload = url.origin === origin && /^\/(api\/)?uploads\//.test(path);
    const download = new URL(url);
    if (localUpload) download.searchParams.set("download", "1");
    const kind = /\.(png|jpe?g|webp|gif|heic|heif)$/.test(path) ? "image" : path.endsWith(".pdf") ? "pdf" : "other";
    return { url: url.href, download: download.href, kind, localUpload };
  } catch {
    return null;
  }
}
