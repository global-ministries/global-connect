/**
 * The login forwards ?redirect= from the address bar to the sign-in action (R2c).
 */
import { conDestino } from '@/lib/auth/redirect-seguro'

describe('conDestino', () => {
  it('adds the redirect from the query string', () => {
    const datos = conDestino(new FormData(), '?redirect=%2Fperfil')
    expect(datos.get('redirect')).toBe('/perfil')
  })

  it('adds nothing without a redirect', () => {
    expect(conDestino(new FormData(), '').has('redirect')).toBe(false)
    expect(conDestino(new FormData(), '?otra=1').has('redirect')).toBe(false)
  })
})
