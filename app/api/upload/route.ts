import { NextRequest, NextResponse } from 'next/server'
import { uploadFile } from '@/lib/r2'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    // Support both 'files' and 'files[]' field names
    let files = formData.getAll('files') as File[]
    if (files.length === 0) {
      files = formData.getAll('files[]') as File[]
    }
    const folder = (formData.get('folder') as string) || 'uploads'

    // Support single file via 'file' field for backwards compat
    const singleFile = formData.get('file') as File | null
    if (singleFile && files.length === 0) files.push(singleFile)

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 files per upload' }, { status: 400 })
    }

    const urls: string[] = []

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.name}. Only JPG, PNG, and WebP allowed.` },
          { status: 400 }
        )
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum 10MB.` },
          { status: 400 }
        )
      }

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      
      const url = await uploadFile(buffer, file.name, file.type, folder)
      urls.push(url)
    }

    return NextResponse.json({ success: true, urls })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    )
  }
}
