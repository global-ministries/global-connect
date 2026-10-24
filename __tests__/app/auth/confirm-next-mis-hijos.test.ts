/**
 * R3b — the whole Niños invitation path: the confirm link built by
 * enlaceInvitacionConDestino keeps the password page and its `next`, and the
 * password page only honors Mi Perfil; anything else falls back.
 */
import { GET } from '@/app/auth/confirm/route'
import { DESTINO_MIS_HIJOS, destinoTrasContrasena, enlaceInvitacionConDestino } from '@/lib/auth/destino-mis-hijos'

jest.mock('next/server', () => ({
  NextResponse: { redirect: (url: URL) => ({ headers: new Map([['location', url.toString()]]) }) },
}))
const verifyOtp = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(async () => ({ auth: { verifyOtp } })),
}))
jest.mock('@/lib/supabase/vincular-sesion', () => ({
  destinoTrasConfirmar: jest.fn(async (_supabase: unknown, url: URL) => url),
}))

const plano = 'https://global.test/auth/confirm?token_hash=h&type=invite&next=%2Fauth%2Freset-password'

async function confirmar(enlace: string) {
  const respuesta = await GET({ url: enlace } as Request)
  return new URL(respuesta.headers.get('location') as string)
}

beforeEach(() => verifyOtp.mockReset().mockResolvedValue({ error: null }))

describe('invite confirm → password page → Mis hijos', () => {
  it('keeps the password page and its next, which lands on Mis hijos', async () => {
    const destino = await confirmar(enlaceInvitacionConDestino(plano, DESTINO_MIS_HIJOS))
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'invite' })
    expect(destino.origin + destino.pathname).toBe('https://global.test/auth/reset-password')
    expect(destinoTrasContrasena(destino.searchParams.get('next'))).toBe('/perfil#mis-hijos')
  })

  it('a plain invitation reaches the password page without next and lands on /dashboard', async () => {
    const destino = await confirmar(plano)
    expect(destino.pathname).toBe('/auth/reset-password')
    expect(destinoTrasContrasena(destino.searchParams.get('next'))).toBe('/dashboard')
  })

  it('a hostile next inside the password page falls back to /dashboard', async () => {
    const hostil = new URL(plano)
    hostil.searchParams.set('next', '/auth/reset-password?next=https%3A%2F%2Fevil.example%2Fperfil')
    const destino = await confirmar(hostil.toString())
    expect(destino.origin).toBe('https://global.test')
    expect(destinoTrasContrasena(destino.searchParams.get('next'))).toBe('/dashboard')
  })

  it('a foreign confirm next never leaves the site', async () => {
    const hostil = new URL(plano)
    hostil.searchParams.set('next', 'https://evil.example/perfil')
    const destino = await confirmar(hostil.toString())
    expect(destino.toString()).toBe('https://global.test/dashboard')
  })
})
