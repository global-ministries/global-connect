import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  SUPPORT_DOWNLOAD_URL_TTL_SECONDS,
  SUPPORT_R2_BUCKET,
  SUPPORT_UPLOAD_URL_TTL_SECONDS,
  buildSupportAttachmentKey,
  createSupportAttachmentId,
  createSupportR2SignedUrl,
  enforceSupportAttachmentBatch,
  getSupportR2Config,
  sniffSupportMimeType,
  validateSupportAttachmentIntent,
} from './r2'

type RouteResult = { status: number; body: Record<string, unknown> }
type ExistingAttachment = { id?: string; kind: string; byte_size: number; status: string }
type Attachment = ExistingAttachment & { id: string; ticket_id: string; uploaded_by_usuario_id: string; bucket: string; object_key: string; content_type: string }
type Context = { authUserId: string; actorUsuarioId: string; now: Date; env?: Record<string, string | undefined> }

export async function createAttachmentIntentResponse(input: Context & { body: { ticketId: string; files: unknown[]; replaceAttachmentId?: string }; existingAttachments: ExistingAttachment[]; insertAttachment: (row: Record<string, unknown>) => Promise<void>; markRejected?: (id: string, reason: string) => Promise<boolean> }): Promise<RouteResult> {
  try {
    const files = input.body.files.map((file) => validateSupportAttachmentIntent(file as never))
    const replacedAttachment = findRetryReplacement(input.existingAttachments, input.body.replaceAttachmentId)
    const retainedAttachments = replacedAttachment
      ? input.existingAttachments.filter((attachment) => attachment.id !== replacedAttachment.id)
      : input.existingAttachments
    enforceSupportAttachmentBatch(files, retainedAttachments)
    if (replacedAttachment?.id) {
      if (!input.markRejected) throw new Error('Retry replacement requires metadata rejection')
      const replacementStillEligible = await input.markRejected(replacedAttachment.id, 'replaced_by_retry')
      if (!replacementStillEligible) throw new Error('Attachment retry is no longer available')
    }
    const config = getSupportR2Config(input.env)
    const attachments = []
    for (const file of files) {
      const attachmentId = createSupportAttachmentId()
      const objectKey = buildSupportAttachmentKey(input.body.ticketId, attachmentId, file.filename)
      await input.insertAttachment({ id: attachmentId, ticket_id: input.body.ticketId, uploaded_by_usuario_id: input.actorUsuarioId, kind: file.kind, status: 'pending_upload', bucket: SUPPORT_R2_BUCKET, object_key: objectKey, original_filename: file.filename, content_type: file.contentType, byte_size: file.byteSize })
      attachments.push({ id: attachmentId, bucket: SUPPORT_R2_BUCKET, method: 'PUT', uploadUrl: createSupportR2SignedUrl({ method: 'PUT', key: objectKey, expiresInSeconds: SUPPORT_UPLOAD_URL_TTL_SECONDS, contentType: file.contentType, config }), expiresInSeconds: SUPPORT_UPLOAD_URL_TTL_SECONDS })
    }
    return { status: 200, body: { attachments } }
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : 'Invalid attachment intent' } }
  }
}

function findRetryReplacement(existingAttachments: ExistingAttachment[], replaceAttachmentId: string | undefined) {
  if (!replaceAttachmentId) return null
  return existingAttachments.find((attachment) => attachment.id === replaceAttachmentId && attachment.status === 'pending_upload') ?? null
}

export async function finalizeAttachmentResponse(input: Context & { attachment: Attachment; headObject: (key: string) => Promise<{ contentType: string | null; byteSize: number }>; readObjectPrefix: (key: string) => Promise<Uint8Array>; markUploaded: (id: string) => Promise<void>; markRejected: (id: string, reason: string) => Promise<void>; deleteObject: (key: string) => Promise<void> }): Promise<RouteResult> {
  if (!input.attachment || input.attachment.status !== 'pending_upload') return { status: 404, body: { error: 'Attachment not found' } }
  const head = await input.headObject(input.attachment.object_key)
  const prefix = await input.readObjectPrefix(input.attachment.object_key)
  const valid = head.byteSize === input.attachment.byte_size && head.contentType === input.attachment.content_type && sniffSupportMimeType(prefix, input.attachment.content_type)
  if (!valid) {
    await input.markRejected(input.attachment.id, 'mime_mismatch')
    await input.deleteObject(input.attachment.object_key)
    return { status: 400, body: { error: 'Uploaded object failed validation' } }
  }
  await input.markUploaded(input.attachment.id)
  return { status: 200, body: { ok: true } }
}

export function createAttachmentDownloadResponse(input: Context & { attachment: Attachment | null }): RouteResult {
  if (!input.attachment || input.attachment.status !== 'uploaded') return { status: 403, body: { error: 'Attachment not available' } }
  return { status: 200, body: { downloadUrl: createSupportR2SignedUrl({ method: 'GET', key: input.attachment.object_key, expiresInSeconds: SUPPORT_DOWNLOAD_URL_TTL_SECONDS, config: getSupportR2Config(input.env) }), expiresInSeconds: SUPPORT_DOWNLOAD_URL_TTL_SECONDS } }
}

export async function supportAttachmentIntentRoute(request: Request) {
  const { NextResponse } = await import('next/server')
  const context = await getRequestContext()
  if (!context) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await request.json()
  const supabase = await createSupabaseServerClient()
  const { data: existing } = await supabase.from('support_ticket_attachments').select('id,kind,byte_size,status').eq('ticket_id', body.ticketId)
  const admin = createSupabaseAdminClient()
  const result = await createAttachmentIntentResponse({ ...context, body, existingAttachments: existing ?? [], insertAttachment: async (row) => {
    const { error } = await supabase.from('support_ticket_attachments').insert(row as never)
    if (error) throw new Error(error.message)
  }, markRejected: async (id, reason) => {
    const { data, error } = await admin.from('support_ticket_attachments').update({ status: 'rejected', rejection_reason: reason }).eq('id', id).eq('ticket_id', body.ticketId).eq('status', 'pending_upload').select('id').maybeSingle()
    if (error) throw new Error(error.message)
    return Boolean(data?.id)
  } })
  return NextResponse.json(result.body, { status: result.status })
}

export async function supportAttachmentFinalizeRoute(request: Request) {
  const { NextResponse } = await import('next/server')
  const context = await getRequestContext()
  if (!context) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { attachmentId } = await request.json()
  const supabase = await createSupabaseServerClient()
  const { data: attachment } = await supabase.from('support_ticket_attachments').select('*').eq('id', attachmentId).maybeSingle()
  const admin = createSupabaseAdminClient()
  const result = await finalizeAttachmentResponse({ ...context, attachment: attachment as Attachment, headObject, readObjectPrefix, deleteObject, markUploaded: async (id) => { await admin.from('support_ticket_attachments').update({ status: 'uploaded', rejection_reason: null }).eq('id', id) }, markRejected: async (id, reason) => { await admin.from('support_ticket_attachments').update({ status: 'rejected', rejection_reason: reason }).eq('id', id) } })
  return NextResponse.json(result.body, { status: result.status })
}

export async function supportAttachmentDownloadRoute(request: Request, attachmentId: string) {
  const { NextResponse } = await import('next/server')
  const result = await getAttachmentDownloadResult(attachmentId)
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status })
  const downloadUrl = typeof result.body.downloadUrl === 'string' ? result.body.downloadUrl : null
  if (!downloadUrl) return NextResponse.json({ error: 'Attachment not available' }, { status: 403 })
  const range = request.headers?.get('range')
  const response = await fetch(downloadUrl, range ? { headers: { range } } : undefined)
  if (!response.ok) return NextResponse.json({ error: 'Attachment download failed' }, { status: 502 })
  return new Response(response.body ?? await response.arrayBuffer(), {
    status: response.status === 206 ? 206 : 200,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': 'inline',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'accept-ranges': response.headers.get('accept-ranges') ?? 'bytes',
      ...(response.headers.get('content-range') ? { 'content-range': response.headers.get('content-range') ?? '' } : {}),
      ...(response.headers.get('content-length') ? { 'content-length': response.headers.get('content-length') ?? '' } : {}),
    },
  })
}

export async function supportAttachmentDownloadHeadRoute(_request: Request, attachmentId: string) {
  const result = await getAttachmentDownloadResult(attachmentId)
  return new Response(null, { status: result.status })
}

async function getAttachmentDownloadResult(attachmentId: string): Promise<RouteResult> {
  const context = await getRequestContext()
  if (!context) return { status: 401, body: { error: 'Not authenticated' } }
  const supabase = await createSupabaseServerClient()
  const { data: attachment } = await supabase.from('support_ticket_attachments').select('*').eq('id', attachmentId).maybeSingle()
  return createAttachmentDownloadResponse({ ...context, attachment: attachment as Attachment | null })
}

async function getRequestContext(): Promise<Context | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createSupabaseAdminClient()
  const { data: actor } = await admin.from('usuarios').select('id').eq('auth_id', user.id).maybeSingle()
  return actor?.id ? { authUserId: user.id, actorUsuarioId: actor.id, now: new Date() } : null
}

async function headObject(key: string) {
  const response = await fetch(createSupportR2SignedUrl({ method: 'HEAD', key, expiresInSeconds: 30 }), { method: 'HEAD' })
  assertR2ResponseOk(response, 'HEAD', key)
  return { contentType: response.headers.get('content-type'), byteSize: Number(response.headers.get('content-length') ?? 0) }
}

async function readObjectPrefix(key: string) {
  const response = await fetch(createSupportR2SignedUrl({ method: 'GET', key, expiresInSeconds: 30 }), { headers: { range: 'bytes=0-31' } })
  assertR2ResponseOk(response, 'GET prefix', key)
  return new Uint8Array(await response.arrayBuffer())
}

async function deleteObject(key: string) {
  const response = await fetch(createSupportR2SignedUrl({ method: 'DELETE', key, expiresInSeconds: 30 }), { method: 'DELETE' })
  assertR2ResponseOk(response, 'DELETE', key)
}

function assertR2ResponseOk(response: Response, operation: string, key: string) {
  if (!response.ok) throw new Error(`R2 ${operation} failed for ${key}: ${response.status} ${response.statusText}`.trim())
}
