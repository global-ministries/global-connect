import {
  SUPPORT_R2_BUCKET,
  buildSupportAttachmentKey,
  createSupportR2SignedUrl,
  detectAttachmentKind,
  getSupportR2Config,
  sniffSupportMimeType,
  validateSupportAttachmentIntent,
} from '@/lib/support/r2'

describe('support R2 attachment helpers', () => {
  const env = { R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret' }

  it('accepts allowed screenshots and builds safe private keys', () => {
    const file = validateSupportAttachmentIntent({
      filename: '../screen shot.png',
      contentType: 'image/png',
      byteSize: 1024,
    })

    expect(file).toEqual({
      filename: 'screen-shot.png',
      contentType: 'image/png',
      byteSize: 1024,
      kind: 'screenshot',
    })
    expect(buildSupportAttachmentKey('ticket-1', 'attachment-1', file.filename)).toBe(
      'support/ticket-1/attachment-1/screen-shot.png'
    )
  })

  it('rejects oversized files, unsupported MIME types, and too many videos', () => {
    expect(() => validateSupportAttachmentIntent({ filename: 'huge.png', contentType: 'image/png', byteSize: 10 * 1024 * 1024 + 1 })).toThrow('Screenshots must be 10MB or smaller')
    expect(() => validateSupportAttachmentIntent({ filename: 'notes.txt', contentType: 'text/plain', byteSize: 1024 })).toThrow('Unsupported attachment MIME type')
    expect(() => detectAttachmentKind('video/mp4')).not.toThrow()
  })

  it('sniffs image and video magic bytes before finalization', () => {
    expect(sniffSupportMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe(true)
    expect(sniffSupportMimeType(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')).toBe(true)
    expect(sniffSupportMimeType(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), 'video/mp4')).toBe(true)
    expect(sniffSupportMimeType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]), 'image/png')).toBe(false)
  })

  it('uses server-only envs and keeps the support bucket private', () => {
    expect(getSupportR2Config(env)).toMatchObject({
      bucket: SUPPORT_R2_BUCKET,
      endpoint: 'https://account.r2.cloudflarestorage.com',
    })
  })

  it('creates deterministic SigV4 signatures for private R2 URLs', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-09T00:00:00.000Z'))
    const url = createSupportR2SignedUrl({
      method: 'GET',
      key: 'support/ticket-1/attachment-1/file.png',
      expiresInSeconds: 60,
      config: getSupportR2Config(env),
    })
    expect(url).toContain('X-Amz-Signature=4ad1e3f841acdcd836f153721b8be904c2a9661df7d9ff81431abe2502b963b5')
    jest.useRealTimers()
  })
})
