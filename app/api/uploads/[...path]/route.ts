import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import { getUploadFilePath } from '@/lib/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
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
  if (relativePath.includes('..') || relativePath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
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
      'Cache-Control': 'public, max-age=31536000, immutable',
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
