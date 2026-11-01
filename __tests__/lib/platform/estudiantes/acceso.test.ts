import { SIN_ACCESO_ESTUDIANTES, entradasMenuEstudiantes, parsearAccesoEstudiantes, type AccesoEstudiantes } from '@/lib/platform/estudiantes/acceso'

/**
 * The Estudiantes menu facts (estudiantes_acceso(), C4 of
 * odd/tasks/estudiantes-fase-b.md) and the entries they open: Mi grupo /
 * Mis grupos, En vivo and Grupos.
 */

const acceso = (parche: Partial<AccesoEstudiantes> = {}): AccesoEstudiantes => ({ ...SIN_ACCESO_ESTUDIANTES, ...parche })

describe('parsearAccesoEstudiantes', () => {
  it('reads the four facts of the RPC payload', () => {
    expect(parsearAccesoEstudiantes({ data: { grupos: 3, lidera: true, vivo: true, gestiona: false }, error: null })).toEqual({
      grupos: 3,
      lidera: true,
      vivo: true,
      gestiona: false,
    })
  })

  it('fails closed on an error, no session (null) or a malformed payload', () => {
    expect(parsearAccesoEstudiantes({ data: { grupos: 3, vivo: true }, error: { message: 'boom' } })).toEqual(SIN_ACCESO_ESTUDIANTES)
    expect(parsearAccesoEstudiantes({ data: null, error: null })).toEqual(SIN_ACCESO_ESTUDIANTES)
    expect(parsearAccesoEstudiantes(null)).toEqual(SIN_ACCESO_ESTUDIANTES)
    expect(parsearAccesoEstudiantes({ data: [1], error: null })).toEqual(SIN_ACCESO_ESTUDIANTES)
    expect(parsearAccesoEstudiantes({ data: { grupos: '2', lidera: 'true', vivo: 1, gestiona: null }, error: null })).toEqual(SIN_ACCESO_ESTUDIANTES)
  })

  it('keeps a whole, non-negative group count', () => {
    expect(parsearAccesoEstudiantes({ data: { grupos: -1 }, error: null }).grupos).toBe(0)
    expect(parsearAccesoEstudiantes({ data: { grupos: 2.5 }, error: null }).grupos).toBe(0)
    expect(parsearAccesoEstudiantes({ data: { grupos: 7 }, error: null }).grupos).toBe(7)
  })

  it('starts with no access', () => {
    expect(SIN_ACCESO_ESTUDIANTES).toEqual({ grupos: 0, lidera: false, vivo: false, gestiona: false })
  })
})

describe('entradasMenuEstudiantes', () => {
  const entradas = (parche: Partial<AccesoEstudiantes>) => entradasMenuEstudiantes(acceso(parche)).map((e) => [e.label, e.href])

  it('has no entry without access', () => {
    expect(entradasMenuEstudiantes(SIN_ACCESO_ESTUDIANTES)).toEqual([])
  })

  it('gives a leader of one group "Mi grupo"', () => {
    expect(entradas({ grupos: 1, lidera: true })).toEqual([['Mi grupo', '/estudiantes']])
  })

  it('says "Mis grupos" whenever the user sees more than one group (the /estudiantes title)', () => {
    expect(entradas({ grupos: 2, lidera: true })).toEqual([['Mis grupos', '/estudiantes']])
    expect(entradas({ grupos: 6, vivo: true })).toEqual([
      ['Mis grupos', '/estudiantes'],
      ['En vivo', '/estudiantes/vivo'],
    ])
  })

  it('gives a director every entry, in order', () => {
    expect(entradasMenuEstudiantes(acceso({ grupos: 8, vivo: true, gestiona: true }))).toEqual([
      { id: 'estudiantes-mi-grupo', label: 'Mis grupos', href: '/estudiantes' },
      { id: 'estudiantes-vivo', label: 'En vivo', href: '/estudiantes/vivo' },
      { id: 'estudiantes-grupos', label: 'Grupos', href: '/estudiantes/grupos' },
    ])
  })

  it('shows En vivo and Grupos without groups yet (a new director)', () => {
    expect(entradas({ vivo: true, gestiona: true })).toEqual([
      ['En vivo', '/estudiantes/vivo'],
      ['Grupos', '/estudiantes/grupos'],
    ])
  })
})
