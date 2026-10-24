/**
 * Post-sign-in return path (odd/tasks/ninos-registro-pasos.md R2b): only a
 * relative internal path is accepted, so the login cannot be used as an open redirect.
 */
import { safeInternalPath } from '@/lib/auth/redirect-seguro'

describe('safeInternalPath', () => {
  it.each(['/perfil', '/perfil?x=1', '/ninos/registro#paso'])('accepts the internal path %s', (ruta) => {
    expect(safeInternalPath(ruta)).toBe(ruta)
  })

  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    [''],
    [' /perfil'],
    ['/perfil\n'],
    ['/per fil'],
    ['perfil'],
    ['/%2F%2Fevil.com'],
  ])('rejects %j', (valor) => {
    expect(safeInternalPath(valor)).toBeNull()
  })

  it('rejects a missing or non-string value', () => {
    expect(safeInternalPath(null)).toBeNull()
    expect(safeInternalPath(undefined)).toBeNull()
    expect(safeInternalPath(new File([], 'x'))).toBeNull()
  })
})
