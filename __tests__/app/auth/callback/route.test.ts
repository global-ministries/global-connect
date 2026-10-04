import { GET } from '@/app/auth/callback/route'
import { createSupabaseServerClient } from '@/lib/supabase/server'

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => ({ headers: new Map([['location', url.toString()]]) }),
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))

const vincularFichaConfirmada = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ admin: true }) }))
jest.mock('@/lib/supabase/vincular-ficha', () => ({
  vincularFichaConfirmada: (...args: unknown[]) => vincularFichaConfirmada(...args),
}))

const mockServer = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>

function cliente(user: unknown, error: unknown = null) {
  const exchangeCodeForSession = jest.fn().mockResolvedValue({ error })
  const getUser = jest.fn().mockResolvedValue({ data: { user }, error: null })
  mockServer.mockResolvedValue({ auth: { exchangeCodeForSession, getUser } } as never)
  return { exchangeCodeForSession, getUser }
}

describe('auth callback route', () => {
  beforeEach(() => {
    mockServer.mockReset()
    vincularFichaConfirmada.mockReset()
  })

  it('links the ficha with the confirmed user after exchanging the code', async () => {
    const user = { id: 'auth-1', email: 'bea@example.com', email_confirmed_at: '2026-10-04' }
    cliente(user)
    vincularFichaConfirmada.mockResolvedValue({ estado: 'vinculada' })

    const response = await GET({ url: 'https://global.test/auth/callback?code=c' } as Request)

    expect(vincularFichaConfirmada).toHaveBeenCalledWith({ admin: true }, user)
    expect(response.headers.get('location')).toBe('https://global.test/dashboard')
  })

  it('adds a neutral notice when the ficha could not be linked unambiguously', async () => {
    cliente({ id: 'auth-1' })
    vincularFichaConfirmada.mockResolvedValue({ estado: 'ambigua' })

    const response = await GET({ url: 'https://global.test/auth/callback?code=c' } as Request)

    expect(response.headers.get('location')).toBe('https://global.test/dashboard?vinculo=pendiente')
  })

  it('does not link anything when the exchange fails', async () => {
    cliente(null, new Error('bad code'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    await GET({ url: 'https://global.test/auth/callback?code=c' } as Request)

    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
  })

  it('does not link anything on a recovery callback', async () => {
    cliente({ id: 'auth-1' })

    const response = await GET({ url: 'https://global.test/auth/callback?code=c&type=recovery' } as Request)

    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('https://global.test/auth/reset-password')
  })
})
