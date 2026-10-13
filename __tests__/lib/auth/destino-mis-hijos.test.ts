/**
 * R3b — where a parent lands after choosing a password from a Niños
 * invitation: only Mi Perfil paths are honored, everything else is /dashboard.
 */
import { DESTINO_MIS_HIJOS, destinoTrasContrasena, enlaceInvitacionConDestino } from '@/lib/auth/destino-mis-hijos'

describe('destinoTrasContrasena', () => {
  it('keeps /dashboard when there is no destination (other invitations)', () => {
    expect(destinoTrasContrasena(null)).toBe('/dashboard')
    expect(destinoTrasContrasena(undefined)).toBe('/dashboard')
    expect(destinoTrasContrasena('')).toBe('/dashboard')
  })

  it('honors the Mis hijos anchor of Mi Perfil', () => {
    expect(DESTINO_MIS_HIJOS).toBe('/perfil#mis-hijos')
    expect(destinoTrasContrasena('/perfil#mis-hijos')).toBe('/perfil#mis-hijos')
    expect(destinoTrasContrasena('/perfil')).toBe('/perfil')
  })

  it.each([
    'https://evil.example/perfil',
    '//evil.example/perfil',
    '/\\evil.example/perfil',
    '\\\\evil.example',
    '/\t/evil.example/perfil',
    'javascript:alert(1)',
    'perfil',
    '/admin',
    '/perfil/../admin',
    '/perfilx',
    '/perfil/otra',
  ])('rejects %s', (intento) => {
    expect(destinoTrasContrasena(intento)).toBe('/dashboard')
  })
})

describe('enlaceInvitacionConDestino', () => {
  const base = 'https://miembros.example/auth/confirm?token_hash=h&type=invite&next=%2Fauth%2Freset-password'

  it('sends the confirm link to the password page carrying the destination', () => {
    const enlace = new URL(enlaceInvitacionConDestino(base, DESTINO_MIS_HIJOS))
    expect(enlace.origin + enlace.pathname).toBe('https://miembros.example/auth/confirm')
    expect(enlace.searchParams.get('token_hash')).toBe('h')
    expect(enlace.searchParams.get('type')).toBe('invite')
    const next = new URL(enlace.searchParams.get('next') as string, 'https://miembros.example')
    expect(next.pathname).toBe('/auth/reset-password')
    expect(next.searchParams.get('next')).toBe('/perfil#mis-hijos')
  })

  it('never carries a destination outside Mi Perfil', () => {
    const enlace = new URL(enlaceInvitacionConDestino(base, 'https://evil.example'))
    const next = new URL(enlace.searchParams.get('next') as string, 'https://miembros.example')
    expect(next.searchParams.get('next')).toBe('/dashboard')
  })
})
