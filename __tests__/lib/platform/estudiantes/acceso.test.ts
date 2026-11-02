import { SIN_ACCESO_ESTUDIANTES, conVoluntarios, entradasMenuEstudiantes, parsearAccesoEstudiantes, type AccesoEstudiantes } from '@/lib/platform/estudiantes/acceso'

/**
 * The Estudiantes menu facts (estudiantes_acceso(), C4 of
 * odd/tasks/estudiantes-fase-b.md) and the entries they open: Mi grupo /
 * Mis grupos, En vivo and Grupos; and Voluntarios from
 * estudiantes_puede_marcar_voluntarios() (C5).
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

  it('reads the reportes fact only when it is true', () => {
    expect(parsearAccesoEstudiantes({ data: { grupos: 1, lidera: false, vivo: false, gestiona: false, reportes: true }, error: null })).toEqual({
      grupos: 1,
      lidera: false,
      vivo: false,
      gestiona: false,
      reportes: true,
    })
    expect(parsearAccesoEstudiantes({ data: { grupos: 1, reportes: false }, error: null })).not.toHaveProperty('reportes')
    expect(parsearAccesoEstudiantes({ data: { grupos: 1, reportes: 'true' }, error: null })).not.toHaveProperty('reportes')
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
      ['Reportes', '/estudiantes/reportes'],
    ])
  })

  it('gives a director every entry, in order', () => {
    expect(entradasMenuEstudiantes(acceso({ grupos: 8, vivo: true, gestiona: true }))).toEqual([
      { id: 'estudiantes-mi-grupo', label: 'Mis grupos', href: '/estudiantes' },
      { id: 'estudiantes-vivo', label: 'En vivo', href: '/estudiantes/vivo' },
      { id: 'estudiantes-grupos', label: 'Grupos', href: '/estudiantes/grupos' },
      { id: 'estudiantes-reportes', label: 'Reportes', href: '/estudiantes/reportes' },
    ])
  })

  it('shows En vivo and Grupos without groups yet (a new director)', () => {
    expect(entradas({ vivo: true, gestiona: true })).toEqual([
      ['En vivo', '/estudiantes/vivo'],
      ['Grupos', '/estudiantes/grupos'],
      ['Reportes', '/estudiantes/reportes'],
    ])
  })
})

describe('the Reportes entry (C6d3, S19)', () => {
  const entradas = (parche: Partial<AccesoEstudiantes>) => entradasMenuEstudiantes(acceso(parche)).map((e) => e.id)

  it('shows for level 2 on Transit / Inside Out (vivo) or level 3 anywhere (gestiona)', () => {
    expect(entradas({ vivo: true })).toEqual(['estudiantes-vivo', 'estudiantes-reportes'])
    expect(entradas({ gestiona: true })).toEqual(['estudiantes-grupos', 'estudiantes-reportes'])
  })

  it('shows for level 2 only in The Living Room (the reportes fact)', () => {
    expect(entradas({ grupos: 1, reportes: true })).toEqual(['estudiantes-mi-grupo', 'estudiantes-reportes'])
  })

  it('stays hidden for a leader (level 1) or someone who only marks volunteers', () => {
    expect(entradas({ grupos: 1, lidera: true })).toEqual(['estudiantes-mi-grupo'])
    expect(entradas({ voluntarios: true })).toEqual(['estudiantes-voluntarios'])
  })
})

describe('conVoluntarios (C5)', () => {
  const base = acceso({ grupos: 2, vivo: true })

  it('adds the Voluntarios fact only when the RPC says true', () => {
    expect(conVoluntarios(base, { data: true, error: null })).toEqual({ ...base, voluntarios: true })
  })

  it('leaves the facts as they were otherwise (fails closed)', () => {
    expect(conVoluntarios(base, { data: false, error: null })).toBe(base)
    expect(conVoluntarios(base, { data: true, error: { message: 'boom' } })).toBe(base)
    expect(conVoluntarios(base, { data: 'true', error: null })).toBe(base)
    expect(conVoluntarios(base, null)).toBe(base)
  })

  it('adds "Voluntarios" after the other entries', () => {
    expect(entradasMenuEstudiantes(acceso({ grupos: 8, vivo: true, gestiona: true, voluntarios: true })).map((e) => [e.id, e.label, e.href])).toEqual([
      ['estudiantes-mi-grupo', 'Mis grupos', '/estudiantes'],
      ['estudiantes-vivo', 'En vivo', '/estudiantes/vivo'],
      ['estudiantes-grupos', 'Grupos', '/estudiantes/grupos'],
      ['estudiantes-reportes', 'Reportes', '/estudiantes/reportes'],
      ['estudiantes-voluntarios', 'Voluntarios', '/estudiantes/voluntarios'],
    ])
  })

  it('gives Voluntarios alone to someone who only marks volunteers', () => {
    expect(entradasMenuEstudiantes(acceso({ voluntarios: true })).map((e) => [e.label, e.href])).toEqual([['Voluntarios', '/estudiantes/voluntarios']])
  })
})
