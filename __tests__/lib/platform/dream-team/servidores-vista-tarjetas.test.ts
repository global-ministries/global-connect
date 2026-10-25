/**
 * `servidores-vista` — the KPI cards above the Servidores list (the same
 * pattern as Mi equipo): without a dirección they summarize every dirección;
 * with one they summarize its equipos. Fixture: tests/helpers/servidores-conexion.ts.
 */
import {
  FILTROS_INICIALES,
  TARJETA_TODAS,
  calcularVistaServidores,
  parcheElegirTarjeta,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import {
  HOY,
  ID_ALABANZA,
  ID_CONEXION,
  ID_DHAH,
  ID_PDP,
  ID_TALLERES,
  arbolServidores,
  todasLasFilas,
} from '../../../../tests/helpers/servidores-conexion'

function vista(filtros: Partial<FiltrosServidores> = {}) {
  return calcularVistaServidores({ filas: todasLasFilas, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}

const resumen = (tarjetas: ReturnType<typeof vista>['tarjetas']) =>
  [tarjetas.todas, ...tarjetas.items].map(({ label, personas }) => `${label}: ${personas}`)

describe('KPI cards without a dirección', () => {
  it('summarizes every dirección in distinct personas, with "Todas las direcciones" first and selected', () => {
    const { tarjetas } = vista()
    expect(tarjetas.nivel).toBe('direcciones')
    expect(resumen(tarjetas)).toEqual(['Todas las direcciones: 38', 'Dirección de Alabanza: 2', 'Dirección de Conexión: 36'])
    expect(tarjetas.seleccionadaId).toBe(TARJETA_TODAS)
  })

  it('names the active director of each dirección, and counts the people waiting to be activated', () => {
    const { tarjetas } = vista()
    const conexion = tarjetas.items.find((t) => t.id === ID_CONEXION)
    expect(conexion).toMatchObject({ responsable: 'Dirige Antholy Ludovic Gómez', porActivar: 2 })
    expect(tarjetas.items.find((t) => t.id === ID_ALABANZA)?.responsable).toBeNull()
  })

  it('the numbers react to the other filters (search, rol, etapa)', () => {
    expect(resumen(vista({ rol: 'Coordinador' }).tarjetas)).toEqual([
      'Todas las direcciones: 5',
      'Dirección de Alabanza: 1',
      'Dirección de Conexión: 4',
    ])
    expect(vista({ etapa: 'en_orientacion' }).tarjetas.todas.personas).toBe(2)
  })

  it('choosing a dirección card filters by it; "Todas" removes the dirección, área and equipo', () => {
    expect(parcheElegirTarjeta('direcciones', ID_CONEXION, [])).toEqual({ direccion: ID_CONEXION, area: null, equipo: null })
    expect(parcheElegirTarjeta('direcciones', TARJETA_TODAS, [])).toEqual({ direccion: null, area: null, equipo: null })
  })
})

describe('KPI cards with a dirección', () => {
  it('summarizes its equipos (the root\'s own people only in "Toda la dirección")', () => {
    const { tarjetas } = vista({ direccion: ID_CONEXION })
    expect(tarjetas.nivel).toBe('equipos')
    expect(resumen(tarjetas)).toEqual([
      'Toda la dirección: 36',
      'De Hombre a Hombre: 9',
      'Mujer de Hoy: 6',
      'Parejas: 8',
      'Punto de Partida: 14',
    ])
    expect(tarjetas.todas.responsable).toBe('Dirige Antholy Ludovic Gómez')
    expect(tarjetas.items[0]).toMatchObject({ id: ID_DHAH, responsable: 'Coordina Edmir Muñoz', porActivar: 1 })
    expect(tarjetas.modoCompacto).toBe(false)
  })

  it('the selected equipo is the pressed card, and the equipo cards ignore the equipo filter itself', () => {
    const { tarjetas, visibles } = vista({ direccion: ID_CONEXION, equipo: ID_PDP })
    expect(tarjetas.seleccionadaId).toBe(ID_PDP)
    expect(tarjetas.items.find((t) => t.id === ID_DHAH)?.personas).toBe(9)
    expect(visibles).toHaveLength(14)
  })

  it('with an área chosen, the first card covers that área', () => {
    const { tarjetas } = vista({ direccion: ID_CONEXION, area: ID_TALLERES })
    expect(tarjetas.todas.label).toBe('Todos los equipos')
    expect(tarjetas.todas.personas).toBe(36)
  })

  it('choosing an equipo card fixes its dirección; "Toda la dirección" removes only the equipo', () => {
    const { opciones } = vista({ direccion: ID_CONEXION })
    expect(parcheElegirTarjeta('equipos', ID_PDP, opciones.equipos)).toEqual({ equipo: ID_PDP, direccion: ID_CONEXION })
    expect(parcheElegirTarjeta('equipos', TARJETA_TODAS, opciones.equipos)).toEqual({ equipo: null })
  })
})
