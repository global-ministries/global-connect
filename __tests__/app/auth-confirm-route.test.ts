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

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>

describe('auth confirm route', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset()
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
})
