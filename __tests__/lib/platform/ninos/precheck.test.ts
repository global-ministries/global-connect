import { horaServicio, mensajeDeErrorPrecheck, parseMisPrechecks } from '@/lib/platform/ninos/precheck'

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
