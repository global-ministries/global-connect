import { GET } from '@/app/auth/confirm/route'
import { createSupabaseServerClient } from '@/lib/supabase/server'

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => ({
      headers: new Map([['location', url.toString()]]),
    }),
  },
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

const vincularFichaConfirmada = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ admin: true }) }))
jest.mock('@/lib/supabase/vincular-ficha', () => ({
  vincularFichaConfirmada: (...args: unknown[]) => vincularFichaConfirmada(...args),
}))

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>

describe('auth confirm route', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset()
    vincularFichaConfirmada.mockReset()
  })

  it('verifies recovery token hashes and redirects to reset password', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: null })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { verifyOtp },
    } as never)

    const response = await GET(
      { url: 'https://global.test/auth/confirm?type=recovery&token_hash=token-1' } as Request
    )

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'token-1', type: 'recovery' })
    expect(response.headers.get('location')).toBe('https://global.test/auth/reset-password')
  })

  it('redirects invalid or expired recovery links to reset-password-specific UX', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: new Error('expired') })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { verifyOtp },
    } as never)

    const response = await GET(
      { url: 'https://global.test/auth/confirm?type=recovery&token_hash=expired-token' } as Request
    )

    expect(response.headers.get('location')).toBe(
      'https://global.test/reset-password?error=invalid_or_expired_recovery_link'
    )
  })

  it('links the ficha with the confirmed user after a signup confirmation', async () => {
    const user = { id: 'auth-1', email: 'bea@example.com', email_confirmed_at: '2026-10-04' }
    const verifyOtp = jest.fn().mockResolvedValue({ error: null })
    const getUser = jest.fn().mockResolvedValue({ data: { user }, error: null })
    mockCreateSupabaseServerClient.mockResolvedValue({ auth: { verifyOtp, getUser } } as never)
    vincularFichaConfirmada.mockResolvedValue({ estado: 'vinculada' })

    const response = await GET(
      { url: 'https://global.test/auth/confirm?type=signup&token_hash=t' } as Request
    )

    expect(vincularFichaConfirmada).toHaveBeenCalledWith({ admin: true }, user)
    expect(response.headers.get('location')).toBe('https://global.test/dashboard')
  })

  it('leaves the account unlinked with a neutral notice when the ficha is ambiguous', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: null })
    const getUser = jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    mockCreateSupabaseServerClient.mockResolvedValue({ auth: { verifyOtp, getUser } } as never)
    vincularFichaConfirmada.mockResolvedValue({ estado: 'ambigua' })

    const response = await GET(
      { url: 'https://global.test/auth/confirm?type=signup&token_hash=t' } as Request
    )

    expect(response.headers.get('location')).toBe('https://global.test/dashboard?vinculo=pendiente')
  })

  it('does not link anything on a recovery link', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: null })
    mockCreateSupabaseServerClient.mockResolvedValue({ auth: { verifyOtp } } as never)

    await GET({ url: 'https://global.test/auth/confirm?type=recovery&token_hash=t' } as Request)

    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
  })
})
