import { NextResponse } from 'next/server'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getSession } from '@/lib/session'

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.id) return badRequest('Unauthorized', 401)

  const form = await request.formData()
  const bucket = String(form.get('bucket') ?? '').trim()
  const rawPath = String(form.get('path') ?? '').trim()
  const upsert = String(form.get('upsert') ?? '0') === '1'
  const file = form.get('file')

  if (!bucket) return badRequest('bucket is required')
  if (!rawPath) return badRequest('path is required')
  if (!(file instanceof File)) return badRequest('file is required')
  if (!/^[a-zA-Z0-9_-]+$/.test(bucket)) return badRequest('Invalid bucket')

  const relativePath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!relativePath || relativePath.includes('..')) {
    return badRequest('Invalid file path')
  }

  if (bucket === 'avatars') {
    const expectedPrefix = `${session.id}/`
    if (!relativePath.startsWith(expectedPrefix)) {
      return badRequest('Avatar path must be scoped to current user', 403)
    }
  }

  const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads', bucket)
  const targetPath = path.resolve(uploadsRoot, relativePath)
  if (!targetPath.startsWith(uploadsRoot)) {
    return badRequest('Invalid target path')
  }

  if (!upsert) {
    try {
      await stat(targetPath)
      return badRequest('File already exists', 409)
    } catch {
      // File does not exist, continue.
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true })
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(targetPath, buf)

  return NextResponse.json({
    path: relativePath,
    publicUrl: `/uploads/${bucket}/${relativePath}`,
  })
}

