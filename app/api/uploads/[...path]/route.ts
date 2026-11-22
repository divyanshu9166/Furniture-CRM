import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import { getUploadFilePath } from '@/lib/r2';
import { getSectionSession } from "@/lib/section-access";

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: "image/heic",
  heif: "image/heif",
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

// In standalone Next.js builds, process.cwd() ≠ /app — use UPLOAD_DIR env var
// Serves files from the uploads directory
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  const relativePath = segments.join('/')

  // Security: block path traversal
  if (segments.some(segment => !/^[A-Za-z0-9_.-]+$/.test(segment) || segment === "." || segment === "..")) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const receipt = segments[0] === "receipts";
  if (receipt) {
    const session = await getSectionSession();
    if (!session?.sections.includes("payments")) {
      return NextResponse.json({ error: "Receipt access denied" }, { status: session ? 403 : 401 });
    }
  }
  const filePath = getUploadFilePath(relativePath)

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const buffer = await readFile(filePath)
    const ext = (filePath.split('.').pop() || '').toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': receipt ? "private, no-store" : 'public, max-age=31536000, immutable',
      "X-Content-Type-Options": "nosniff",
    }
    // ?download=1 saves the file instead of showing it. App wrappers (WebView)
    // only save files that arrive as a normal link with this header.
    if (req.nextUrl.searchParams.get('download') === '1') {
      const requested = req.nextUrl.searchParams.get('filename') || segments[segments.length - 1]
      const safeName = requested.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'download'
      headers['Content-Disposition'] = `attachment; filename="${safeName}"`
      headers['X-Content-Type-Options'] = 'nosniff'
    }

    return new NextResponse(buffer, { status: 200, headers })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
