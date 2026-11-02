/**
 * `servidores-vista` — invitaciones pendientes (T3 of
 * odd/tasks/invitaciones-pendientes.md, S3/S4): the account state of each
 * person (vencida, enviada, sin invitar, registrada in the last 30 days), the
 * `invitacion` filter with its URL param, the pill counts under "Sin cuenta"
 * (reactive: they ignore the account filters), its chip, and the clear patches.
 */
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'
import {
  DIAS_REGISTRADA,
  ETIQUETA_FILTRO_INVITACION,
  FILTROS_INICIALES,
  LIMPIAR_FILTROS,
  LIMPIAR_HOJA,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  leerFiltrosDeUrl,
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import { HOY, ID_DHAH, ID_PDP, arbolServidores, fila } from '../../../../tests/helpers/servidores-conexion'

const MS_DIA = 86_400_000

function resumen(estado: ResumenInvitacion['estado'], extra: Partial<ResumenInvitacion> = {}): ResumenInvitacion {
  return {
    usuarioId: 'u',
    estado,
    email: 'x@example.com',
    enviadaEl: '2026-09-01T10:00:00Z',
    aceptadaEl: null,
    invitadoPor: 'Edmir Muñoz',
    envios: 1,
    historial: [],
    ...extra,
  }
}

const hace = (dias: number, ms = 0): string => new Date(HOY.getTime() - dias * MS_DIA - ms).toISOString()

// Venancio and Vera (vencida), Ena (enviada), Sixto (sin invitar: no invitation),
// Remo (registered 10 days ago), Rita (registered 40 days ago), Pía (account,
// never invited through the platform), Nadia (account status unknown).
const filas: readonly FilaServidor[] = [
  fila('1', 'Venancio', ID_DHAH, 'Facilitador', { invitacion: resumen('vencida') }),
  fila('2', 'Vera', ID_PDP, 'Facilitador', { invitacion: resumen('vencida') }),
  fila('2b', 'Vera', ID_DHAH, 'Facilitador', { invitacion: resumen('vencida') }),
  fila('3', 'Ena', ID_DHAH, 'Facilitador', { invitacion: resumen('enviada') }),
  fila('4', 'Sixto', ID_PDP, 'Anfitrión', { invitacion: null }),
  fila('5', 'Remo', ID_DHAH, 'Coordinador', {
    tieneCuenta: true,
    invitacion: resumen('registrada', { aceptadaEl: hace(10) }),
  }),
  fila('6', 'Rita', ID_DHAH, 'Coordinador', {
    tieneCuenta: true,
    invitacion: resumen('registrada', { aceptadaEl: hace(40) }),
  }),
  fila('7', 'Pía', ID_PDP, 'Coordinador', { tieneCuenta: true, invitacion: null }),
  fila('8', 'Nadia', ID_PDP, 'Facilitador', { tieneCuenta: null, invitacion: resumen('vencida') }),
]

function vista(filtros: Partial<FiltrosServidores> = {}, lista: readonly FilaServidor[] = filas) {
  return calcularVistaServidores({ filas: lista, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}

const nombres = (v: ReturnType<typeof vista>): string[] => [...new Set(v.visibles.map((f) => f.nombre))].sort()

describe('estadoCuenta per row', () => {
  it('derives vencida, enviada, sin_invitar, registrada (30 days) or null', () => {
    const porNombre = new Map(vista().visibles.map((f) => [f.nombre, f.estadoCuenta]))
    expect(Object.fromEntries(porNombre)).toEqual({
      Venancio: 'vencida',
      Vera: 'vencida',
      Ena: 'enviada',
      Sixto: 'sin_invitar',
      Remo: 'registrada',
      Rita: null,
      Pía: null,
      Nadia: null,
    })
  })

  it('a person carries the invitation summary and the state', () => {
    const vera = vista().fichas.get(filas[1].personaId)
    expect(vera?.estadoCuenta).toBe('vencida')
    expect(vera?.invitacion?.estado).toBe('vencida')
    expect(vista().fichas.get(filas[4].personaId)?.invitacion).toBeNull()
  })

  it('without invitation data (lookup unavailable) no state is derived', () => {
    const sinDatos = [fila('1', 'Ana', ID_DHAH, 'Facilitador'), fila('2', 'Beto', ID_DHAH, 'Facilitador', { tieneCuenta: true })]
    const v = vista({}, sinDatos)
    expect(v.visibles.map((f) => f.estadoCuenta)).toEqual([null, null])
    expect(v.pastillasCuenta).toBeNull()
  })

  it(`'registrada' holds up to exactly ${DIAS_REGISTRADA} days after the acceptance`, () => {
    const enElLimite = fila('1', 'Lía', ID_DHAH, 'Facilitador', {
      tieneCuenta: true,
      invitacion: resumen('registrada', { aceptadaEl: hace(30) }),
    })
    const pasado = fila('2', 'Leo', ID_DHAH, 'Facilitador', {
      tieneCuenta: true,
      invitacion: resumen('registrada', { aceptadaEl: hace(30, 1) }),
    })
    expect(vista({}, [enElLimite, pasado]).visibles.map((f) => [f.nombre, f.estadoCuenta])).toEqual([
      ['Leo', null],
      ['Lía', 'registrada'],
    ])
  })
})

describe('invitacion filter', () => {
  it.each([
    ['vencida', ['Venancio', 'Vera']],
    ['enviada', ['Ena']],
    ['sin_invitar', ['Sixto']],
    ['registrada', ['Remo']],
  ] as const)('%s keeps only those people', (estado, esperados) => {
    expect(nombres(vista({ invitacion: estado }))).toEqual([...esperados].sort())
  })

  it('combines with the scope like any other filter', () => {
    expect(nombres(vista({ invitacion: 'vencida', equipo: ID_PDP }))).toEqual(['Vera'])
  })
})

describe('pill counts under "Sin cuenta"', () => {
  it('"Sin cuenta" is the existing metric; each state counts distinct people', () => {
    const v = vista()
    expect(v.atencion.sinCuenta.personas).toBe(4)
    expect(v.pastillasCuenta?.map(({ id, etiqueta, personas, activo }) => [id, etiqueta, personas, activo])).toEqual([
      ['sin_cuenta', 'Sin cuenta', 4, false],
      ['vencida', 'Invitación vencida', 2, false],
      ['enviada', 'Invitación enviada', 1, false],
      ['sin_invitar', 'Sin invitar', 1, false],
      ['registrada', 'Se registraron (30 días)', 1, false],
    ])
  })

  it('counts ignore the account filters (salvo) but honor the rest', () => {
    const conVencida = vista({ invitacion: 'vencida' })
    expect(conVencida.atencion.sinCuenta.personas).toBe(4)
    expect(conVencida.pastillasCuenta?.map((p) => [p.id, p.personas, p.activo])).toEqual([
      ['sin_cuenta', 4, false],
      ['vencida', 2, true],
      ['enviada', 1, false],
      ['sin_invitar', 1, false],
      ['registrada', 1, false],
    ])
    expect(vista({ sinCuenta: true }).pastillasCuenta?.map((p) => [p.id, p.personas, p.activo])).toEqual([
      ['sin_cuenta', 4, true],
      ['vencida', 2, false],
      ['enviada', 1, false],
      ['sin_invitar', 1, false],
      ['registrada', 1, false],
    ])
    expect(vista({ equipo: ID_PDP }).pastillasCuenta?.map((p) => p.personas)).toEqual([2, 1, 0, 1, 0])
  })

  it('each pill patch selects its group exclusively', () => {
    const pastillas = vista().pastillasCuenta ?? []
    expect(Object.fromEntries(pastillas.map((p) => [p.id, p.parche]))).toEqual({
      sin_cuenta: { sinCuenta: true, invitacion: null },
      vencida: { sinCuenta: false, invitacion: 'vencida' },
      enviada: { sinCuenta: false, invitacion: 'enviada' },
      sin_invitar: { sinCuenta: false, invitacion: 'sin_invitar' },
      registrada: { sinCuenta: false, invitacion: 'registrada' },
    })
  })
})

describe('chip and clear patches', () => {
  it.each([
    ['vencida', 'Invitación vencida'],
    ['enviada', 'Invitación enviada'],
    ['sin_invitar', 'Sin invitar'],
    ['registrada', 'Se registraron (30 días)'],
  ] as const)('the active %s filter is a removable chip', (estado, etiqueta) => {
    expect(ETIQUETA_FILTRO_INVITACION[estado]).toBe(etiqueta)
    expect(vista({ invitacion: estado }).pastillas).toEqual([
      { clave: 'invitacion', etiqueta, quitarEtiqueta: `Quitar el filtro ${etiqueta}`, parche: { invitacion: null } },
    ])
  })

  it('counts as a sheet filter and both clear patches reset it', () => {
    expect(vista({ invitacion: 'enviada' }).filtrosEnHoja).toBe(1)
    const filtros: FiltrosServidores = { ...FILTROS_INICIALES, invitacion: 'vencida', q: 'ana' }
    expect({ ...filtros, ...LIMPIAR_HOJA }).toEqual({ ...FILTROS_INICIALES, q: 'ana' })
    expect({ ...filtros, ...LIMPIAR_FILTROS }).toEqual({ ...FILTROS_INICIALES, q: 'ana' })
  })
})

describe('URL codec: invitacion', () => {
  it.each(['vencida', 'enviada', 'sin_invitar', 'registrada'] as const)('round-trips %s', (estado) => {
    const filtros: FiltrosServidores = { ...FILTROS_INICIALES, invitacion: estado }
    const query = escribirFiltrosEnUrl(filtros)
    expect(query).toBe(`invitacion=${estado}`)
    expect(leerFiltrosDeUrl(new URLSearchParams(query))).toEqual(filtros)
  })

  it('is left out when unset and an unknown value is ignored', () => {
    expect(escribirFiltrosEnUrl(FILTROS_INICIALES)).not.toContain('invitacion')
    expect(leerFiltrosDeUrl(new URLSearchParams('invitacion=otra')).invitacion).toBeNull()
    expect(leerFiltrosDeUrl({ invitacion: 'aceptada' }).invitacion).toBeNull()
  })

  it('sin_cuenta=1 keeps working on its own', () => {
    const filtros = leerFiltrosDeUrl(new URLSearchParams('sin_cuenta=1'))
    expect(filtros).toEqual({ ...FILTROS_INICIALES, sinCuenta: true })
    expect(escribirFiltrosEnUrl(filtros)).toBe('sin_cuenta=1')
  })
})
