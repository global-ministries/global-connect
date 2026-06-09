import { createHash, createHmac, randomUUID } from 'crypto'

export const SUPPORT_R2_BUCKET = 'global-connect-support'
export const SUPPORT_UPLOAD_URL_TTL_SECONDS = 300
export const SUPPORT_DOWNLOAD_URL_TTL_SECONDS = 60
export const SUPPORT_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
export const SUPPORT_VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const SUPPORT_TICKET_MAX_BYTES = 150 * 1024 * 1024
export const SUPPORT_MAX_SCREENSHOTS = 5
export const SUPPORT_MAX_VIDEOS = 1

const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

export type SupportAttachmentKind = 'screenshot' | 'video'

export type SupportAttachmentIntentInput = {
  filename: string
  contentType: string
  byteSize: number
}

export type SupportAttachmentIntent = SupportAttachmentIntentInput & {
  filename: string
  kind: SupportAttachmentKind
}

export type SupportR2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: typeof SUPPORT_R2_BUCKET
  endpoint: string
}

export function getSupportR2Config(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): SupportR2Config {
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('Missing R2 support attachment environment variables')
  return { accountId, accessKeyId, secretAccessKey, bucket: SUPPORT_R2_BUCKET, endpoint: `https://${accountId}.r2.cloudflarestorage.com` }
}

export function detectAttachmentKind(contentType: string): SupportAttachmentKind {
  if (SCREENSHOT_TYPES.has(contentType)) return 'screenshot'
  if (VIDEO_TYPES.has(contentType)) return 'video'
  throw new Error('Unsupported attachment MIME type')
}

export function validateSupportAttachmentIntent(input: SupportAttachmentIntentInput): SupportAttachmentIntent {
  const kind = detectAttachmentKind(input.contentType)
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) throw new Error('Attachment size must be positive')
  if (kind === 'screenshot' && input.byteSize > SUPPORT_SCREENSHOT_MAX_BYTES) throw new Error('Screenshots must be 10MB or smaller')
  if (kind === 'video' && input.byteSize > SUPPORT_VIDEO_MAX_BYTES) throw new Error('Videos must be 100MB or smaller')
  return { ...input, filename: sanitizeFilename(input.filename), kind }
}

export function enforceSupportAttachmentBatch(files: SupportAttachmentIntent[], existing: { kind: string; byte_size: number; status: string }[]) {
  const active = existing.filter((file) => file.status !== 'deleted' && file.status !== 'rejected')
  const screenshots = active.filter((file) => file.kind === 'screenshot').length + files.filter((file) => file.kind === 'screenshot').length
  const videos = active.filter((file) => file.kind === 'video').length + files.filter((file) => file.kind === 'video').length
  const totalBytes = active.reduce((sum, file) => sum + file.byte_size, 0) + files.reduce((sum, file) => sum + file.byteSize, 0)
  if (screenshots > SUPPORT_MAX_SCREENSHOTS) throw new Error('A ticket can include up to 5 screenshots')
  if (videos > SUPPORT_MAX_VIDEOS) throw new Error('A ticket can include up to 1 video')
  if (totalBytes > SUPPORT_TICKET_MAX_BYTES) throw new Error('A ticket can include up to 150MB of attachments')
}

export function buildSupportAttachmentKey(ticketId: string, attachmentId: string, filename: string) {
  return `support/${ticketId}/${attachmentId}/${sanitizeFilename(filename)}`
}

export function createSupportAttachmentId() {
  return randomUUID()
}

export function sniffSupportMimeType(bytes: Uint8Array, expectedContentType: string) {
  if (expectedContentType === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])
  if (expectedContentType === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff])
  if (expectedContentType === 'image/webp') return startsWith(bytes.slice(0, 12), [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (expectedContentType === 'video/mp4' || expectedContentType === 'video/quicktime') return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
  if (expectedContentType === 'video/webm') return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
  return false
}

export function createSupportR2SignedUrl(input: { method: 'PUT' | 'GET' | 'HEAD' | 'DELETE'; key: string; expiresInSeconds: number; contentType?: string; config?: SupportR2Config }) {
  const config = input.config ?? getSupportR2Config()
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const amzDate = `${date}T${now.toISOString().slice(11, 19).replace(/:/g, '')}Z`
  const host = `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`
  const credential = `${config.accessKeyId}/${date}/auto/s3/aws4_request`
  const signedHeaders = 'host'
  const path = `/${encodeURIComponent(input.key).replace(/%2F/g, '/')}`
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  })
  const canonicalRequest = [input.method, path, params.toString(), `host:${host}\n`, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, `${date}/auto/s3/aws4_request`, sha256(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request')
  const signature = hmac(signingKey, stringToSign).toString('hex')
  params.set('X-Amz-Signature', signature)
  return `https://${host}${path}?${params.toString()}`
}

function sanitizeFilename(filename: string) {
  const name = filename.split(/[\\/]/).pop()?.trim() || 'attachment'
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment'
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte)
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest()
}
