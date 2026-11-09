/**
 * @jest-environment node
 *
 * T3b (odd/tasks/ninos-checkin-pco.md, S10, S6) — what the screens show of the
 * print stations and the reprints: connection status from the last agent call,
 * the label size (102 × 51 mm by default), the station form, the desk station
 * remembered per campus, the offline notice, the reprint plan and reason, the
 * reprint history range and the RPC / route wrappers.
 */
import {
  ESTADOS_IMPRESION,
  ETIQUETA_MOTIVO,
  actualizarEstacion,
  avisoEstacionMesa,
  cargarReimpresiones,
  claveEstacionMesa,
  conexionEstacion,
  crearEstacion,
  guardarEstacionMesa,
  leerEstacionMesa,
  leerEstaciones,
  leerReimpresiones,
  mensajeErrorImpresion,
  planReimpresion,
  reimprimirEtiquetas,
  rotarTokenEstacion,
  textoMedida,
  textoReimpresion,
  validarMedidas,
  validarNombreEstacion,
  validarNota,
  validarRango,
  type EstacionVista,
} from '@/lib/platform/ninos/impresion-vista'

const AHORA = new Date('2026-11-08T13:30:00Z') // 9:30 in Caracas

function estacion(e: Partial<EstacionVista> = {}): EstacionVista {
  return {
    id: 'e1', campusId: 'c1', nombre: 'Mesa 1', anchoMm: null, altoMm: null, dpi: 203, activa: true,
    ultimaConexion: '2026-11-08T13:29:30Z', pendientes: 0, puedeAdministrar: true, ...e,
  }
}

describe('leerEstaciones', () => {
  it('maps the RPC rows (numeric mm as numbers) and drops malformed rows', () => {
    expect(
      leerEstaciones([
        { id: 'e1', campus_id: 'c1', nombre: 'Mesa 1', ancho_mm: '76.0', alto_mm: '51.0', dpi: 300, activa: false,
          ultima_conexion: null, pendientes: 4, puede_administrar: false },
        { id: 'e2', campus_id: 'c1', nombre: 'Mesa 2', ancho_mm: null, alto_mm: null, dpi: 203, activa: true,
          ultima_conexion: '2026-11-08T13:00:00Z', pendientes: 0, puede_administrar: true },
        { nombre: 'sin id' },
        null,
      ]),
    ).toEqual([
      { id: 'e1', campusId: 'c1', nombre: 'Mesa 1', anchoMm: 76, altoMm: 51, dpi: 300, activa: false, ultimaConexion: null, pendientes: 4, puedeAdministrar: false },
      { id: 'e2', campusId: 'c1', nombre: 'Mesa 2', anchoMm: null, altoMm: null, dpi: 203, activa: true, ultimaConexion: '2026-11-08T13:00:00Z', pendientes: 0, puedeAdministrar: true },
    ])
    expect(leerEstaciones(null)).toEqual([])
  })
})

describe('conexionEstacion', () => {
  it('«Conectada» when the agent called in the last 2 minutes', () => {
    expect(conexionEstacion('2026-11-08T13:28:00Z', AHORA)).toEqual({ estado: 'conectada', texto: 'Conectada', tono: 'success' })
    expect(conexionEstacion('2026-11-08T13:30:20Z', AHORA).estado).toBe('conectada')
  })

  it('«Sin conexión desde HH:MM» after 2 minutes; another day carries the date', () => {
    expect(conexionEstacion('2026-11-08T12:52:00Z', AHORA)).toEqual({ estado: 'sin_conexion', texto: 'Sin conexión desde 08:52', tono: 'danger' })
    expect(conexionEstacion('2026-11-08T13:27:59Z', AHORA).texto).toBe('Sin conexión desde 09:27')
    expect(conexionEstacion('2026-11-01T22:05:00Z', AHORA).texto).toBe('Sin conexión desde el dom 1 nov, 18:05')
  })

  it('«Nunca se conectó» without a call', () => {
    expect(conexionEstacion(null, AHORA)).toEqual({ estado: 'nunca', texto: 'Nunca se conectó', tono: 'muted' })
  })
})

describe('textoMedida', () => {
  it('the stored size, or 102 × 51 mm by default (said so)', () => {
    expect(textoMedida(estacion({ anchoMm: 76, altoMm: 50.5, dpi: 300 }))).toBe('76 × 50,5 mm · 300 dpi')
    expect(textoMedida(estacion())).toBe('102 × 51 mm · 203 dpi (por defecto)')
  })
})

describe('validarMedidas', () => {
  it('both empty: the default roll (null / null)', () => {
    expect(validarMedidas({ ancho: ' ', alto: '', dpi: '203' })).toEqual({ ok: true, anchoMm: null, altoMm: null, dpi: 203 })
  })

  it('both set within the printer range, comma or point decimals', () => {
    expect(validarMedidas({ ancho: '76,5', alto: '51', dpi: '300' })).toEqual({ ok: true, anchoMm: 76.5, altoMm: 51, dpi: 300 })
    expect(validarMedidas({ ancho: '20', alto: '10', dpi: '203' })).toMatchObject({ ok: true, anchoMm: 20, altoMm: 10 })
    expect(validarMedidas({ ancho: '120', alto: '300', dpi: '203' })).toMatchObject({ ok: true, anchoMm: 120, altoMm: 300 })
  })

  it('only one of them, out of range, not a number or a bad dpi: a plain sentence', () => {
    expect(validarMedidas({ ancho: '76', alto: '', dpi: '203' })).toEqual({ ok: false, message: 'Escribe el ancho y el alto, o deja los dos vacíos.' })
    const rango = { ok: false, message: 'El ancho va de 20 a 120 mm y el alto de 10 a 300 mm.' }
    expect(validarMedidas({ ancho: '19.9', alto: '51', dpi: '203' })).toEqual(rango)
    expect(validarMedidas({ ancho: '76', alto: '301', dpi: '203' })).toEqual(rango)
    expect(validarMedidas({ ancho: 'abc', alto: '51', dpi: '203' })).toEqual(rango)
    expect(validarMedidas({ ancho: '', alto: '', dpi: '600' })).toEqual({ ok: false, message: 'Elige 203 o 300 dpi.' })
  })
})

describe('validarNombreEstacion', () => {
  it('required, up to 60 characters', () => {
    expect(validarNombreEstacion('Mesa 1')).toBeNull()
    expect(validarNombreEstacion('  ')).toBe('Ponle un nombre a la estación.')
    expect(validarNombreEstacion('x'.repeat(61))).toBe('El nombre llega hasta 60 letras.')
    expect(validarNombreEstacion('x'.repeat(60))).toBeNull()
  })
})

describe('reasons and notes (S10)', () => {
  it('labels: «Se trabó», «Se perdió», «Otro»', () => {
    expect(ETIQUETA_MOTIVO).toEqual({ se_trabo: 'Se trabó', se_perdio: 'Se perdió', otro: 'Otro' })
  })

  it('a reason is required; «Otro» needs a note; at most 200', () => {
    expect(validarNota('', '')).toBe('Elige el motivo.')
    expect(validarNota('se_trabo', '')).toBeNull()
    expect(validarNota('otro', '   ')).toBe('Escribe una nota: con «Otro» es obligatoria.')
    expect(validarNota('otro', 'Se mojó')).toBeNull()
    expect(validarNota('se_perdio', 'x'.repeat(201))).toBe('La nota llega hasta 200 letras.')
    expect(validarNota('se_perdio', 'x'.repeat(200))).toBeNull()
  })
})

describe('planReimpresion', () => {
  const todos = ['n1', 'n2']

  it('every child and the receipt: one «todas»', () => {
    expect(planReimpresion({ ninoIds: ['n2', 'n1'], todos, recibo: true })).toEqual([{ tipo: 'todas', ninoId: null }])
  })

  it('some children and/or the receipt: one call each', () => {
    expect(planReimpresion({ ninoIds: ['n2'], todos, recibo: true })).toEqual([
      { tipo: 'nino', ninoId: 'n2' },
      { tipo: 'representante', ninoId: null },
    ])
    expect(planReimpresion({ ninoIds: todos, todos, recibo: false })).toEqual([
      { tipo: 'nino', ninoId: 'n1' },
      { tipo: 'nino', ninoId: 'n2' },
    ])
    expect(planReimpresion({ ninoIds: [], todos, recibo: true })).toEqual([{ tipo: 'representante', ninoId: null }])
    expect(planReimpresion({ ninoIds: [], todos, recibo: false })).toEqual([])
  })
})

describe('textoReimpresion', () => {
  it('what is on its way and that the código does not change', () => {
    expect(textoReimpresion({ ninos: 1, representantes: 1 }, 'Mesa 1', '4821')).toBe(
      'Listo: 1 etiqueta y 1 recibo van a «Mesa 1». El código sigue siendo 4821.',
    )
    expect(textoReimpresion({ ninos: 2, representantes: 0 }, 'Mesa 1', '4821')).toBe('Listo: 2 etiquetas van a «Mesa 1». El código sigue siendo 4821.')
    expect(textoReimpresion({ ninos: 0, representantes: 1 }, 'Mesa 1', '4821')).toBe('Listo: 1 recibo va a «Mesa 1». El código sigue siendo 4821.')
  })
})

describe('mensajeErrorImpresion', () => {
  it('plain Spanish for each fixed code', () => {
    expect(mensajeErrorImpresion({ code: '42501', message: 'sin_autoridad' })).toBe('No tienes permiso para hacer esto en este campus.')
    expect(mensajeErrorImpresion({ message: 'estacion_inactiva' })).toBe('Esa impresora está desactivada. Elige otra en la mesa.')
    expect(mensajeErrorImpresion({ message: 'estacion_no_encontrada' })).toBe('No encontramos esa impresora. Elige otra en la mesa.')
    expect(mensajeErrorImpresion({ message: 'checkin_no_encontrado' })).toBe(
      'Ese código ya no está adentro: solo se reimprime antes del retiro.',
    )
    expect(mensajeErrorImpresion({ code: '22023', message: 'datos_invalidos' })).toBe('Revisa los datos: alguno no es válido.')
    expect(mensajeErrorImpresion({ code: '22023' })).toBe('Revisa los datos: alguno no es válido.')
    expect(mensajeErrorImpresion({ code: '500' })).toBe('No se pudo completar. Revisa la conexión e intenta otra vez.')
    expect(mensajeErrorImpresion(null)).toBe('No se pudo completar. Revisa la conexión e intenta otra vez.')
  })
})

describe('the desk station (per device, per campus)', () => {
  function almacen() {
    const datos = new Map<string, string>()
    return {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
      datos,
    }
  }

  it('the key is per campus (order does not matter)', () => {
    expect(claveEstacionMesa(['c1'])).toBe('ninos-mesa-estacion:c1')
    expect(claveEstacionMesa(['c2', 'c1', 'c2'])).toBe('ninos-mesa-estacion:c1,c2')
  })

  it('saves, reads and forgets it; a broken storage reads nothing', () => {
    const s = almacen()
    guardarEstacionMesa(s, 'k', 'e1')
    expect(leerEstacionMesa(s, 'k')).toBe('e1')
    guardarEstacionMesa(s, 'k', null)
    expect(leerEstacionMesa(s, 'k')).toBeNull()
    expect(s.datos.size).toBe(0)
    const roto = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => {} }
    expect(leerEstacionMesa(roto, 'k')).toBeNull()
    expect(() => guardarEstacionMesa(roto, 'k', 'e1')).not.toThrow()
    expect(leerEstacionMesa(null, 'k')).toBeNull()
  })
})

describe('avisoEstacionMesa', () => {
  it('nothing when the campus has no stations, or the chosen one is connected', () => {
    expect(avisoEstacionMesa([], null, AHORA)).toBeNull()
    expect(avisoEstacionMesa([estacion()], estacion(), AHORA)).toBeNull()
  })

  it('offline: «La impresora "X" está sin conexión: el código queda en pantalla»', () => {
    const fuera = estacion({ nombre: 'Mesa 2', ultimaConexion: '2026-11-08T12:52:00Z' })
    expect(avisoEstacionMesa([fuera], fuera, AHORA)).toBe('La impresora "Mesa 2" está sin conexión: el código queda en pantalla')
    const nunca = estacion({ nombre: 'Mesa 3', ultimaConexion: null })
    expect(avisoEstacionMesa([nunca], nunca, AHORA)).toBe('La impresora "Mesa 3" está sin conexión: el código queda en pantalla')
  })

  it('none chosen: the código stays on screen', () => {
    expect(avisoEstacionMesa([estacion()], null, AHORA)).toBe('Esta mesa no tiene impresora elegida: el código queda en pantalla')
  })
})

describe('leerReimpresiones', () => {
  it('maps the history rows', () => {
    expect(
      leerReimpresiones([
        { id: 'i1', created_at: '2026-11-08T13:31:00Z', quien: 'Daniela Montes', tipo: 'representante', nino: null,
          ninos: ['Ana', 'Luis'], codigo: '2210', motivo: 'se_perdio', nota: 'Verificado con cédula', estacion: 'Mesa 1',
          estado: 'impresa', error: null },
        { id: 'i2', created_at: '2026-11-08T13:20:00Z', quien: null, tipo: 'nino', nino: 'Santiago Mora', ninos: null,
          codigo: '3391', motivo: 'se_trabo', nota: null, estacion: 'Mesa 1', estado: 'raro', error: 'sin papel' },
        { id: 3 },
      ]),
    ).toEqual([
      { id: 'i1', createdAt: '2026-11-08T13:31:00Z', quien: 'Daniela Montes', tipo: 'representante', nino: null, ninos: ['Ana', 'Luis'],
        codigo: '2210', motivo: 'se_perdio', nota: 'Verificado con cédula', estacion: 'Mesa 1', estado: 'impresa', error: null },
      { id: 'i2', createdAt: '2026-11-08T13:20:00Z', quien: null, tipo: 'nino', nino: 'Santiago Mora', ninos: [],
        codigo: '3391', motivo: 'se_trabo', nota: null, estacion: 'Mesa 1', estado: 'pendiente', error: 'sin papel' },
    ])
  })

  it('status labels', () => {
    expect(ESTADOS_IMPRESION).toEqual({
      pendiente: { texto: 'Pendiente', tono: 'warning' },
      impresa: { texto: 'Impresa', tono: 'success' },
      error: { texto: 'Con error', tono: 'danger' },
    })
  })
})

describe('validarRango', () => {
  it('from ≤ to, at most 31 days', () => {
    expect(validarRango('2026-10-09', '2026-11-08')).toBeNull()
    expect(validarRango('2026-11-08', '2026-11-08')).toBeNull()
    expect(validarRango('2026-10-08', '2026-11-08')).toBe('Elige hasta 31 días.')
    expect(validarRango('2026-11-09', '2026-11-08')).toBe('La fecha «Desde» va antes de «Hasta».')
    expect(validarRango('', '2026-11-08')).toBe('Elige las dos fechas.')
  })
})

describe('RPC wrappers (as the user)', () => {
  const ok = (data: unknown) => jest.fn(() => Promise.resolve({ data, error: null }))
  const fila = { id: 'e1', campus_id: 'c1', nombre: 'Mesa 1', ancho_mm: null, alto_mm: null, dpi: 203, activa: true, ultima_conexion: null }

  it('crearEstacion sends the trimmed name and the size; returns the station and the token', async () => {
    const rpc = ok({ estacion: fila, token: 'a'.repeat(64) })
    const r = await crearEstacion(rpc, { campusId: 'c1', nombre: ' Mesa 1 ', anchoMm: null, altoMm: null, dpi: 203 })
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_estacion_crear', {
      p_campus_id: 'c1', p_nombre: 'Mesa 1', p_ancho_mm: null, p_alto_mm: null, p_dpi: 203,
    })
    expect(r).toEqual({ ok: true, data: { estacionId: 'e1', nombre: 'Mesa 1', token: 'a'.repeat(64) } })
  })

  it('actualizarEstacion and rotarTokenEstacion', async () => {
    const rpc = ok(fila)
    expect(await actualizarEstacion(rpc, { estacionId: 'e1', nombre: 'Mesa 1', anchoMm: 76, altoMm: 51, dpi: 300, activa: false })).toEqual({
      ok: true, data: null,
    })
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_estacion_actualizar', {
      p_estacion_id: 'e1', p_nombre: 'Mesa 1', p_ancho_mm: 76, p_alto_mm: 51, p_dpi: 300, p_activa: false,
    })
    const rot = ok({ estacion: fila, token: 'b'.repeat(64) })
    expect(await rotarTokenEstacion(rot, 'e1')).toEqual({ ok: true, data: { estacionId: 'e1', nombre: 'Mesa 1', token: 'b'.repeat(64) } })
    expect(rot).toHaveBeenCalledWith('ninos_impresion_estacion_rotar_token', { p_estacion_id: 'e1' })
  })

  it('an RPC error becomes the plain sentence', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: null, error: { code: '42501', message: 'sin_autoridad' } }))
    expect(await rotarTokenEstacion(rpc, 'e1')).toEqual({ ok: false, message: 'No tienes permiso para hacer esto en este campus.' })
    const roto = jest.fn(() => Promise.reject(new Error('red')))
    expect(await rotarTokenEstacion(roto, 'e1')).toEqual({ ok: false, message: 'No se pudo completar. Revisa la conexión e intenta otra vez.' })
  })

  it('cargarReimpresiones reads the range of the campus', async () => {
    const rpc = ok([])
    expect(await cargarReimpresiones(rpc, { campusId: 'c1', desde: '2026-11-01', hasta: '2026-11-08' })).toEqual({ ok: true, data: [] })
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_reimpresiones', { p_campus_id: 'c1', p_desde: '2026-11-01', p_hasta: '2026-11-08' })
  })
})

describe('reimprimirEtiquetas (POST /api/ninos/impresion/reimprimir)', () => {
  const base = { estacionId: 'e1', turnoId: 't1', fecha: '2026-11-08', codigo: '4821', motivo: 'otro' as const, nota: ' Se mojó ' }

  it('one POST per planned piece; adds up what was queued', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ninos: 1, representantes: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ninos: 0, representantes: 1 }) })
    const r = await reimprimirEtiquetas(f, base, [{ tipo: 'nino', ninoId: 'n1' }, { tipo: 'representante', ninoId: null }])
    expect(r).toEqual({ ok: true, data: { ninos: 1, representantes: 1 } })
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[0][0]).toBe('/api/ninos/impresion/reimprimir')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      estacionId: 'e1', turnoId: 't1', fecha: '2026-11-08', codigo: '4821', tipo: 'nino', ninoId: 'n1', motivo: 'otro', nota: 'Se mojó',
    })
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({
      estacionId: 'e1', turnoId: 't1', fecha: '2026-11-08', codigo: '4821', tipo: 'representante', ninoId: null, motivo: 'otro', nota: 'Se mojó',
    })
  })

  it('stops at the first refusal with its sentence (and says what already went)', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ninos: 1, representantes: 0 }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code: '22023', message: 'checkin_no_encontrado' } }) })
    const r = await reimprimirEtiquetas(f, { ...base, nota: '' }, [{ tipo: 'nino', ninoId: 'n1' }, { tipo: 'nino', ninoId: 'n2' }])
    expect(r).toEqual({
      ok: false,
      message: 'Ese código ya no está adentro: solo se reimprime antes del retiro. Ya se había enviado 1 etiqueta.',
    })
    expect(JSON.parse(f.mock.calls[0][1].body).nota).toBeNull()
  })

  it('a network error', async () => {
    const f = jest.fn().mockRejectedValue(new Error('red'))
    expect(await reimprimirEtiquetas(f, base, [{ tipo: 'todas', ninoId: null }])).toEqual({
      ok: false, message: 'No se pudo completar. Revisa la conexión e intenta otra vez.',
    })
  })
})
