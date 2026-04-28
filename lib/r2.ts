import { randomUUID } from 'crypto'

// Dynamic import to avoid Turbopack ESM/CJS bundling issues with @aws-sdk
async function getS3Modules() {
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
  return { S3Client, PutObjectCommand, DeleteObjectCommand, getSignedUrl }
}

const BUCKET = process.env.R2_BUCKET_NAME || 'furniture-crm'

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accountId) {
    throw new Error('R2_ACCOUNT_ID is not set')
  }
  return {
    region: 'auto' as const,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  }
}

export async function uploadFile(
  file: Buffer,
  fileName: string,
  contentType: string,
  folder: string
): Promise<string> {
  const { S3Client, PutObjectCommand } = await getS3Modules()
  const client = new S3Client(getR2Config())
  const ext = fileName.split('.').pop() || 'bin'
  const key = `${folder}/${randomUUID()}.${ext}`

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  )

  const publicUrl = process.env.R2_PUBLIC_URL
  if (publicUrl) {
    return `${publicUrl}/${key}`
  }

  return key
}

export async function getPresignedUploadUrl(
  folder: string,
  fileName: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const { S3Client, PutObjectCommand, getSignedUrl } = await getS3Modules()
  const client = new S3Client(getR2Config())
  const ext = fileName.split('.').pop() || 'bin'
  const key = `${folder}/${randomUUID()}.${ext}`

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 }
  )

  return { url, key }
}

export async function deleteFile(key: string): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await getS3Modules()
  const client = new S3Client(getR2Config())
  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  )
}
