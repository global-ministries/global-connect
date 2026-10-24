import { horaServicio, llegandoAFamilia, mensajeDeErrorPrecheck, parseLlegando, parseMisPrechecks } from '@/lib/platform/ninos/precheck'

describe('parseMisPrechecks', () => {
  it('reads the services in the window and the notices', () => {
    expect(
      parseMisPrechecks({
        servicios: [{ turno_id: 't1', nombre: 'Primer servicio', hora: '09:00:00', campus_id: 'c1', campus: 'Centro' }, { nombre: 'sin id' }],
        avisos: [{ nino_id: 'h1', turno_id: 't1', estado: 'pendiente' }, { nino_id: 'h2', turno_id: 't1', estado: 'otro' }],
      }),
    ).toEqual({
      servicios: [{ turnoId: 't1', nombre: 'Primer servicio', hora: '09:00:00', campus: 'Centro' }],
      avisos: [{ ninoId: 'h1', turnoId: 't1', estado: 'pendiente' }],
    })
  })

  it('is empty for anything else', () => {
    expect(parseMisPrechecks(null)).toEqual({ servicios: [], avisos: [] })
    expect(parseMisPrechecks([])).toEqual({ servicios: [], avisos: [] })
  })
})

describe('horaServicio', () => {
  it('shows the start as h:mm', () => {
    expect(horaServicio('09:00:00')).toBe('9:00')
    expect(horaServicio('11:30:00')).toBe('11:30')
    expect(horaServicio('')).toBe('')
  })
})

describe('mensajeDeErrorPrecheck', () => {
  it('maps the RPC errors to Spanish', () => {
    expect(mensajeDeErrorPrecheck({ code: '22023', message: 'fuera_de_horario' })).toBe(
      'Este servicio ya no recibe avisos. Avisa en la mesa al llegar.',
    )
    expect(mensajeDeErrorPrecheck({ code: '22023', message: 'ya_ingresado' })).toBe('Uno de tus hijos ya ingresó a este servicio.')
    expect(mensajeDeErrorPrecheck({ code: '22023', message: 'limite_diario' })).toBe('Llegaste al límite de avisos de hoy.')
    expect(mensajeDeErrorPrecheck({ code: '42501', message: 'sin_autoridad' })).toBe('No tienes permiso para avisar a la mesa.')
    expect(mensajeDeErrorPrecheck(null)).toBe('No se pudo avisar a la mesa. Intenta de nuevo.')
  })
})

describe('parseLlegando', () => {
  const familia = {
    padre: { id: 'p1', nombre: 'Ana', apellido: 'Pérez' },
    avisado_at: '2026-10-11T12:40:00Z',
    hijos: [{ id: 'h1', nombre: 'Luis', apellido: 'Pérez', tiene_ficha: true, autorizados: null, desde_casa: true }],
  }

  it('reads each arriving family with its notified children', () => {
    const [f] = parseLlegando([familia, { padre: null }, { padre: { id: 'p2' }, hijos: [] }])
    expect(f.padre).toEqual({ id: 'p1', nombre: 'Ana', apellido: 'Pérez' })
    expect(f.avisadoAt).toBe('2026-10-11T12:40:00Z')
    expect(f.hijos).toHaveLength(1)
    expect(f.hijos[0]).toEqual(expect.objectContaining({ id: 'h1', tiene_ficha: true, desde_casa: true, autorizados: [] }))
    expect(parseLlegando([familia, { padre: { id: 'p2' }, hijos: [] }])).toHaveLength(1)
    expect(parseLlegando(null)).toEqual([])
  })

  it('turns the family into the check-in card shape', () => {
    const f = llegandoAFamilia(parseLlegando([familia])[0])
    expect(f.id).toBe('p1')
    expect(f.padres).toEqual([{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: null }])
    expect(f.hijos.map((h) => h.id)).toEqual(['h1'])
  })
})
