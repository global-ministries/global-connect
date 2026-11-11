/**
 * @jest-environment node
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S14 S15) — parsing of
 * talleres_minimo_panel / talleres_mis_cambios_de_fecha, the best-effort
 * loaders, and the small shared rules (dates, the manual WhatsApp text,
 * when the «Suspendida» block shows).
 */

import {
  enlaceWhatsappConTexto,
  fechaCorta,
  fechaLarga,
  hoyIglesia,
  loadMisCambiosDeFecha,
  loadPanelMinimo,
  mensajeWhatsappCambioFecha,
  mostrarEstadoSuspension,
  parseCambiosDeFecha,
  parsePanelMinimo,
} from '@/lib/platform/talleres/minimo-suspension'

const PANEL = {
  minimo: 4,
  unidad: 'parejas',
  bajo_minimo: true,
  fecha_inicio: '2027-01-15',
  cierre_inscripcion: '2027-01-11',
  conteo: {
    confirmadas: 2,
    por_telefono: 1,
    no_puede: 1,
    sin_responder: 1,
    salieron_sin_responder: 0,
    aprobados: 3,
    pendientes: 2,
    limite: '2027-01-11',
  },
  clases: [{ numero: 1, fecha: '2026-11-27' }, { numero: 'x', fecha: '2026-12-04' }],
  suspension: { en: '2026-11-20T15:00:00Z', motivo: 'Mínimo', mensaje: null, fecha_anterior: '2026-11-27', por: 'Dora D' },
  abierta_igual: null,
  puede_suspender: true,
  puede_abrir_igual: false,
  puede_confirmar: true,
  sin_responder: [
    { inscripcion_id: 'i-1', nombre: 'Pablo Uno', telefono: '04141110001', companero_nombre: null, companero_telefono: null, limite: '2027-01-11' },
    { inscripcion_id: 'i-2', nombre: 'Sin límite' },
  ],
}

describe('parsePanelMinimo', () => {
  it('maps the RPC jsonb into camelCase and drops malformed rows', () => {
    const p = parsePanelMinimo(PANEL)
    expect(p).not.toBeNull()
    expect(p).toMatchObject({
      minimo: 4,
      unidad: 'parejas',
      bajoMinimo: true,
      fechaInicio: '2027-01-15',
      cierreInscripcion: '2027-01-11',
      conteo: { confirmadas: 2, porTelefono: 1, noPuede: 1, sinResponder: 1, aprobados: 3, pendientes: 2, limite: '2027-01-11' },
      clases: [{ numero: 1, fecha: '2026-11-27' }],
      suspension: { motivo: 'Mínimo', mensaje: null, fechaAnterior: '2026-11-27', por: 'Dora D' },
      abiertaIgual: null,
      puedeSuspender: true,
      puedeAbrirIgual: false,
      puedeConfirmar: true,
    })
    expect(p?.sinResponder).toEqual([
      { inscripcionId: 'i-1', nombre: 'Pablo Uno', telefono: '04141110001', companeroNombre: null, companeroTelefono: null, limite: '2027-01-11' },
    ])
  })

  it('a taller without minimum keeps minimo null and every permission false by default', () => {
    const p = parsePanelMinimo({ minimo: null })
    expect(p?.minimo).toBeNull()
    expect(p?.bajoMinimo).toBe(false)
    expect(p?.puedeAbrirIgual).toBe(false)
    expect(p?.unidad).toBe('personas')
    expect(p?.sinResponder).toEqual([])
  })

  it('returns null for something that is not an object', () => {
    expect(parsePanelMinimo(null)).toBeNull()
    expect(parsePanelMinimo([])).toBeNull()
  })
})

describe('parseCambiosDeFecha', () => {
  it('keeps complete rows only', () => {
    expect(
      parseCambiosDeFecha([
        { inscripcion_id: 'i-1', taller_nombre: 'Parejas', fecha_inicio: '2027-02-06', fecha_anterior: '2027-01-16', limite: '2027-02-02', lugar: 'Salón 1', mensaje: null },
        { inscripcion_id: 'i-2', taller_nombre: 'Sin fechas' },
      ]),
    ).toEqual([
      {
        inscripcionId: 'i-1',
        tallerNombre: 'Parejas',
        edicionNombre: null,
        fechaInicio: '2027-02-06',
        fechaAnterior: '2027-01-16',
        lugar: 'Salón 1',
        mensaje: null,
        limite: '2027-02-02',
      },
    ])
    expect(parseCambiosDeFecha('nope')).toEqual([])
  })
})

describe('loaders are best effort', () => {
  it('loadPanelMinimo calls talleres_minimo_panel and parses it', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: PANEL, error: null })
    const p = await loadPanelMinimo({ rpc }, 'e-1')
    expect(rpc).toHaveBeenCalledWith('talleres_minimo_panel', { p_edicion_id: 'e-1' })
    expect(p?.minimo).toBe(4)
  })

  it('loadPanelMinimo returns null on an error or a throw', async () => {
    expect(await loadPanelMinimo({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: '42501' } }) }, 'e-1')).toBeNull()
    expect(await loadPanelMinimo({ rpc: jest.fn().mockRejectedValue(new Error('x')) }, 'e-1')).toBeNull()
  })

  it('loadMisCambiosDeFecha returns [] on an error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await loadMisCambiosDeFecha({ rpc })).toEqual([])
    expect(rpc).toHaveBeenCalledWith('talleres_mis_cambios_de_fecha')
  })
})

describe('dates and texts', () => {
  it('formats DATE values without shifting the day', () => {
    expect(fechaCorta('2027-01-11')).toMatch(/11/)
    expect(fechaCorta('2027-01-11')).toMatch(/ene/)
    expect(fechaLarga('2027-01-15')).toBe('viernes 15 de enero')
  })

  it('builds the manual WhatsApp text with the first name and both dates', () => {
    expect(mensajeWhatsappCambioFecha('Pablo Uno', 'De Hombre a Hombre', '2027-01-15', '2027-01-11')).toBe(
      'Hola Pablo, De Hombre a Hombre ahora empieza el viernes 15 de enero. ¿Mantienes tu lugar? Confírmalo antes del lunes 11 de enero.',
    )
    expect(enlaceWhatsappConTexto('https://wa.me/584141110001', 'Hola ¿sí?')).toBe(
      'https://wa.me/584141110001?text=Hola%20%C2%BFs%C3%AD%3F',
    )
    expect(enlaceWhatsappConTexto(null, 'Hola')).toBeNull()
  })

  it('hoyIglesia uses Caracas time (UTC-4)', () => {
    expect(hoyIglesia(new Date('2027-01-11T03:00:00Z'))).toBe('2027-01-10')
    expect(hoyIglesia(new Date('2027-01-11T05:00:00Z'))).toBe('2027-01-11')
  })

  it('the «Suspendida» block shows while someone must answer or until the new start', () => {
    const base = parsePanelMinimo({ ...PANEL, bajo_minimo: false })!
    expect(mostrarEstadoSuspension(base, '2027-02-01')).toBe(true)
    const sinPendientes = { ...base, conteo: { ...base.conteo, sinResponder: 0 } }
    expect(mostrarEstadoSuspension(sinPendientes, '2027-01-15')).toBe(true)
    expect(mostrarEstadoSuspension(sinPendientes, '2027-01-16')).toBe(false)
    expect(mostrarEstadoSuspension({ ...base, suspension: null }, '2027-01-01')).toBe(false)
    expect(mostrarEstadoSuspension({ ...base, bajoMinimo: true }, '2027-01-01')).toBe(false)
  })
})
