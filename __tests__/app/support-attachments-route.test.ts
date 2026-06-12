import {
  createAttachmentDownloadResponse,
  createAttachmentIntentResponse,
  finalizeAttachmentResponse,
  supportAttachmentIntentRoute,
  supportAttachmentFinalizeRoute,
  supportAttachmentDownloadHeadRoute,
  supportAttachmentDownloadRoute,
} from '@/lib/support/r2-routes'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({ status: init?.status ?? 200, json: async () => body, headers: new Map() }),
    redirect: (url: string | URL, init?: number | ResponseInit) => ({
      status: typeof init === 'number' ? init : init?.status ?? 307,
      headers: new Map([['location', url.toString()]]),
      json: async () => { throw new Error('Redirect responses must not expose JSON') },
    }),
  },
}))

class TestResponse {
  readonly status: number
  readonly headers: Headers

  constructor(private readonly body: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200
    this.headers = new Headers(init?.headers)
  }

  async text() {
    if (typeof this.body === 'string') return this.body
    if (this.body instanceof ArrayBuffer) return Buffer.from(this.body).toString('utf8')
    if (ArrayBuffer.isView(this.body)) return Buffer.from(this.body.buffer).toString('utf8')
    return ''
  }
}

Object.defineProperty(globalThis, 'Response', { value: TestResponse })

const baseContext = {
  authUserId: 'auth-1',
  actorUsuarioId: 'usuario-1',
  now: new Date('2026-06-09T00:00:00.000Z'),
  env: { R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret' },
}

const pendingAttachment = {
  id: 'attachment-1', ticket_id: 'ticket-1', uploaded_by_usuario_id: 'usuario-1',
  bucket: 'global-connect-support',
  object_key: 'support/ticket-1/attachment-1/file.png',
  kind: 'screenshot', content_type: 'image/png', byte_size: 100, status: 'pending_upload',
}

describe('support attachment route handlers', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    createSupabaseAdminClient.mockReset()
    Object.defineProperty(globalThis, 'fetch', { value: jest.fn(), writable: true })
    process.env.R2_ACCOUNT_ID = 'account'
    process.env.R2_ACCESS_KEY_ID = 'access'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
  })

  it('creates pending metadata and signed upload URLs for allowed files', async () => {
    const insertAttachment = jest.fn().mockResolvedValue(undefined)
    const result = await createAttachmentIntentResponse({
      ...baseContext,
      body: { ticketId: 'ticket-1', files: [{ filename: 'proof.webp', contentType: 'image/webp', byteSize: 2048 }] },
      existingAttachments: [],
      insertAttachment,
    })

    expect(result.status).toBe(200)
    const attachments = result.body.attachments as Record<string, unknown>[]
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ bucket: 'global-connect-support', method: 'PUT' })
    expect(attachments[0]).not.toHaveProperty('objectKey')
    expect(insertAttachment).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending_upload', object_key: expect.stringContaining('support/ticket-1/') }))
  })

  it('rejects oversize totals before issuing signed URLs', async () => {
    const result = await createAttachmentIntentResponse({
      ...baseContext,
      body: { ticketId: 'ticket-1', files: [{ filename: 'clip.mp4', contentType: 'video/mp4', byteSize: 101 * 1024 * 1024 }] },
      existingAttachments: [],
      insertAttachment: jest.fn(),
    })

    expect(result).toEqual({ status: 400, body: { error: 'Videos must be 100MB or smaller' } })
  })

  it('rejects a stale pending video before creating a replacement retry intent', async () => {
    const insertAttachment = jest.fn().mockResolvedValue(undefined)
    const markRejected = jest.fn().mockResolvedValue(true)

    const result = await createAttachmentIntentResponse({
      ...baseContext,
      body: { ticketId: 'ticket-1', replaceAttachmentId: 'attachment-1', files: [{ filename: 'retry.mp4', contentType: 'video/mp4', byteSize: 2048 }] },
      existingAttachments: [{ id: 'attachment-1', kind: 'video', byte_size: 2048, status: 'pending_upload' }],
      insertAttachment,
      markRejected,
    })

    expect(result.status).toBe(200)
    expect(result.body.attachments).toEqual([expect.objectContaining({ bucket: 'global-connect-support', method: 'PUT' })])
    expect(markRejected).toHaveBeenCalledWith('attachment-1', 'replaced_by_retry')
    expect(insertAttachment).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', status: 'pending_upload', original_filename: 'retry.mp4' }))
  })

  it('does not create a replacement retry intent when the prior pending row is no longer eligible', async () => {
    const insertAttachment = jest.fn().mockResolvedValue(undefined)
    const markRejected = jest.fn().mockResolvedValue(false)

    const result = await createAttachmentIntentResponse({
      ...baseContext,
      body: { ticketId: 'ticket-1', replaceAttachmentId: 'attachment-1', files: [{ filename: 'retry.mp4', contentType: 'video/mp4', byteSize: 2048 }] },
      existingAttachments: [{ id: 'attachment-1', kind: 'video', byte_size: 2048, status: 'pending_upload' }],
      insertAttachment,
      markRejected,
    })

    expect(result).toEqual({ status: 400, body: { error: 'Attachment retry is no longer available' } })
    expect(markRejected).toHaveBeenCalledWith('attachment-1', 'replaced_by_retry')
    expect(insertAttachment).not.toHaveBeenCalled()
  })

  it('does not insert replacement metadata when the admin retry rejection update returns no row', async () => {
    const actorQuery = createMaybeSingleQuery({ id: 'usuario-1' })
    const existingQuery = createSelectEqQuery([{ id: 'attachment-1', kind: 'video', byte_size: 2048, status: 'pending_upload' }])
    const insertQuery = { insert: jest.fn().mockResolvedValue({ error: null }) }
    const serverFrom = jest.fn((table: string) => table === 'support_ticket_attachments' ? existingQuery : insertQuery)
    const rejectionBuilder = createUpdateSelectMaybeSingleQuery(null)

    createSupabaseServerClient
      .mockResolvedValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) } })
      .mockResolvedValueOnce({ from: serverFrom })
    createSupabaseAdminClient
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(actorQuery) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ update: jest.fn().mockReturnValue(rejectionBuilder) }) })

    const response = await supportAttachmentIntentRoute({ json: async () => ({ ticketId: 'ticket-1', replaceAttachmentId: 'attachment-1', files: [{ filename: 'retry.mp4', contentType: 'video/mp4', byteSize: 2048 }] }) } as Request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Attachment retry is no longer available' })
    expect(rejectionBuilder.select).toHaveBeenCalledWith('id')
    expect(rejectionBuilder.maybeSingle).toHaveBeenCalled()
    expect(insertQuery.insert).not.toHaveBeenCalled()
  })

  it('keeps a stale pending video active when retry does not identify the prior intent', async () => {
    const result = await createAttachmentIntentResponse({
      ...baseContext,
      body: { ticketId: 'ticket-1', files: [{ filename: 'retry.mp4', contentType: 'video/mp4', byteSize: 2048 }] },
      existingAttachments: [{ id: 'attachment-1', kind: 'video', byte_size: 2048, status: 'pending_upload' }],
      insertAttachment: jest.fn(),
      markRejected: jest.fn(),
    })

    expect(result).toEqual({ status: 400, body: { error: 'A ticket can include up to 1 video' } })
  })

  it('rejects finalize when R2 HEAD metadata or sniffed MIME does not match', async () => {
    const markRejected = jest.fn().mockResolvedValue(undefined)
    const result = await finalizeAttachmentResponse({
      ...baseContext,
      attachment: pendingAttachment,
      headObject: jest.fn().mockResolvedValue({ contentType: 'text/html', byteSize: 100 }),
      readObjectPrefix: jest.fn().mockResolvedValue(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])),
      markUploaded: jest.fn(),
      markRejected,
      deleteObject: jest.fn().mockResolvedValue(undefined),
    })

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('Uploaded object failed validation')
    expect(markRejected).toHaveBeenCalledWith('attachment-1', 'mime_mismatch')
  })

  it('surfaces failed rejected-object cleanup during finalize', async () => {
    const markRejected = jest.fn().mockResolvedValue(undefined)
    const deleteObject = jest.fn().mockRejectedValue(new Error('R2 DELETE failed'))

    await expect(finalizeAttachmentResponse({
      ...baseContext,
      attachment: pendingAttachment,
      headObject: jest.fn().mockResolvedValue({ contentType: 'text/html', byteSize: 100 }),
      readObjectPrefix: jest.fn().mockResolvedValue(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])),
      markUploaded: jest.fn(),
      markRejected,
      deleteObject,
    })).rejects.toThrow('R2 DELETE failed')

    expect(markRejected).toHaveBeenCalledWith('attachment-1', 'mime_mismatch')
    expect(deleteObject).toHaveBeenCalledWith('support/ticket-1/attachment-1/file.png')
  })

  it('forbids download URL creation when metadata is not authorized or uploaded', async () => {
    const result = await createAttachmentDownloadResponse({
      ...baseContext,
      attachment: null,
    })

    expect(result).toEqual({ status: 403, body: { error: 'Attachment not available' } })
  })

  it('streams authorized downloads without returning a signed URL JSON body', async () => {
    const actorQuery = createMaybeSingleQuery({ id: 'usuario-1' })
    const attachmentQuery = createMaybeSingleQuery({ ...pendingAttachment, status: 'uploaded' })
    createSupabaseServerClient
      .mockResolvedValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) } })
      .mockResolvedValueOnce({ from: jest.fn().mockReturnValue(attachmentQuery) })
    createSupabaseAdminClient.mockReturnValueOnce({ from: jest.fn().mockReturnValue(actorQuery) })
    Object.defineProperty(globalThis, 'fetch', { value: jest.fn().mockResolvedValue(createR2Response({ ok: true, headers: { 'content-type': 'image/png', 'content-length': '4' }, body: new Uint8Array([102, 105, 108, 101]) })), writable: true })

    const response = await supportAttachmentDownloadRoute({} as Request, 'attachment-1')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toBe('inline')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('location')).toBeNull()
    await expect(response.text()).resolves.toBe('file')
  })

  it('forwards range requests so authorized video previews can stream through the app route', async () => {
    const actorQuery = createMaybeSingleQuery({ id: 'usuario-1' })
    const attachmentQuery = createMaybeSingleQuery({ ...pendingAttachment, status: 'uploaded', content_type: 'video/mp4' })
    const fetchMock = jest.fn().mockResolvedValue(createR2Response({ ok: true, status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-31/4096', 'content-length': '32', 'accept-ranges': 'bytes' }, body: new Uint8Array([1, 2, 3]) }))
    createSupabaseServerClient
      .mockResolvedValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) } })
      .mockResolvedValueOnce({ from: jest.fn().mockReturnValue(attachmentQuery) })
    createSupabaseAdminClient.mockReturnValueOnce({ from: jest.fn().mockReturnValue(actorQuery) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true })

    const response = await supportAttachmentDownloadRoute({ headers: { get: (name: string) => name === 'range' ? 'bytes=0-31' : null } } as Request, 'attachment-1')

    expect(response.status).toBe(206)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('attachment-1'), { headers: { range: 'bytes=0-31' } })
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('content-range')).toBe('bytes 0-31/4096')
    expect(response.headers.get('content-length')).toBe('32')
  })

  it('returns 401 from the download route when the user is not authenticated', async () => {
    createSupabaseServerClient.mockResolvedValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) } })

    const response = await supportAttachmentDownloadRoute({} as Request, 'attachment-1')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Not authenticated' })
  })

  it('surfaces R2 DELETE HTTP failures during finalize cleanup', async () => {
    const actorQuery = createMaybeSingleQuery({ id: 'usuario-1' })
    const attachmentQuery = createMaybeSingleQuery(pendingAttachment)
    const updateQuery = createUpdateQuery()
    createSupabaseServerClient
      .mockResolvedValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) } })
      .mockResolvedValueOnce({ from: jest.fn().mockReturnValue(attachmentQuery) })
    createSupabaseAdminClient
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(actorQuery) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(updateQuery) })
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createR2Response({ ok: true, headers: { 'content-type': 'text/html', 'content-length': '100' } }))
      .mockResolvedValueOnce(createR2Response({ ok: true, body: new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]) }))
      .mockResolvedValueOnce(createR2Response({ ok: false, status: 500, statusText: 'Internal Server Error' }))
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true })

    await expect(supportAttachmentFinalizeRoute({ json: async () => ({ attachmentId: 'attachment-1' }) } as Request)).rejects.toThrow('R2 DELETE failed for support/ticket-1/attachment-1/file.png: 500 Internal Server Error')

    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('support/ticket-1/attachment-1/file.png'), { method: 'DELETE' })
  })

  it('returns a bodyless HEAD download response with matching authorization status', async () => {
    createSupabaseServerClient.mockResolvedValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) } })

    const response = await supportAttachmentDownloadHeadRoute({} as Request, 'attachment-1')

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe('')
  })
})

function createMaybeSingleQuery(data: unknown) {
  return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data }) }) }) }
}

function createUpdateQuery() {
  return { update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) }
}

function createSelectEqQuery(data: unknown) {
  return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data, error: null }) }) }
}

function createUpdateSelectMaybeSingleQuery(data: unknown) {
  const builder = {
    eq: jest.fn(),
    select: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  }
  builder.eq.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  return builder
}

function createR2Response(input: { ok: boolean; status?: number; statusText?: string; headers?: Record<string, string>; body?: Uint8Array }) {
  const body = input.body?.slice().buffer ?? new ArrayBuffer(0)
  return {
    ok: input.ok,
    status: input.status ?? 200,
    statusText: input.statusText ?? 'OK',
    headers: { get: (name: string) => input.headers?.[name] ?? null },
    arrayBuffer: async () => body,
  }
}
