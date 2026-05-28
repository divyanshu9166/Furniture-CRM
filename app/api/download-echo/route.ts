import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const fileUrl = searchParams.get('url')
    const filename = searchParams.get('filename')

    if (!fileUrl || !filename) {
      return new NextResponse('Missing parameters', { status: 400 })
    }

    const response = await fetch(fileUrl)
    if (!response.ok) {
      return new NextResponse('Failed to fetch file', { status: 500 })
    }

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('Echo download error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
