/**
 * File Upload — Local VPS Storage
 *
 * All images/files are stored on the VPS at the Docker volume mount:
 *   /app/uploads  (container path, persisted via Docker named volume)
 *
 * The UPLOAD_DIR env var is set in docker-compose.yml to "/app/uploads".
 * In local dev (no env var set), files go to <project_root>/uploads.
 *
 * Files are served back via /api/uploads/[...path]/route.ts
 */

import { randomUUID } from 'crypto'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'

// ─── Path Resolution ──────────────────────────────────────────────────

function getUploadsRoot(): string {
  // UPLOAD_DIR is set in docker-compose to "/app/uploads" (the Docker volume)
  // In local dev this env var is not set, so we fall back to cwd/uploads
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
}

// ─── Upload ───────────────────────────────────────────────────────────

export async function uploadFile(
  file: Buffer,
  fileName: string,
  _contentType: string,   // kept for API compatibility — not used for local storage
  folder: string
): Promise<string> {
  const ext = (fileName.split('.').pop() || 'bin').toLowerCase()
  const uniqueName = `${randomUUID()}.${ext}`
  const root = getUploadsRoot()
  const dir = join(root, folder)
  const filePath = join(dir, uniqueName)

  console.log(`[Upload] Saving to: ${filePath}`)

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, file)
    console.log(`[Upload] SUCCESS: /api/uploads/${folder}/${uniqueName}`)
  } catch (err) {
    console.error(`[Upload] FAILED writing ${filePath}:`, err)
    throw err
  }

  return `/api/uploads/${folder}/${uniqueName}`
}

// ─── Delete ───────────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  // key is like "/api/uploads/products/uuid.jpg"
  const relativePath = key.replace(/^\/api\/uploads\//, '')
  const filePath = join(getUploadsRoot(), relativePath)
  try {
    await unlink(filePath)
    console.log(`[Upload] Deleted: ${filePath}`)
  } catch {
    // File may not exist — ignore silently
  }
}

// ─── Presigned URL stub (not needed for local storage) ────────────────

export async function getPresignedUploadUrl(
  folder: string,
  fileName: string,
  _contentType: string
): Promise<{ url: string; key: string }> {
  const ext = (fileName.split('.').pop() || 'bin').toLowerCase()
  const key = `/api/uploads/${folder}/${randomUUID()}.${ext}`
  return { url: '/api/upload', key }
}
