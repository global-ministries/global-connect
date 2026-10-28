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
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import {
  HOY,
  ID_ALABANZA,
  ID_CONEXION,
  ID_CORO,
  ID_DHAH,
  ID_PDP,
  ID_TALLERES,
  arbolServidores,
  fila,
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
    const v = vista()
    expect(parcheElegirTarjeta(v.tarjetas, ID_CONEXION, v.opciones)).toEqual({ direccion: ID_CONEXION, area: null, equipo: null })
    expect(parcheElegirTarjeta(v.tarjetas, TARJETA_TODAS, v.opciones)).toEqual({ direccion: null, area: null, equipo: null })
  })
})

describe('KPI cards with a dirección', () => {
  it('skips a lone área (Conexión → Talleres) and summarizes its equipos; the root\'s own people only in "Toda la dirección"', () => {
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
    expect(tarjetas.todas.label).toBe('Todo Talleres')
    expect(tarjetas.todas.personas).toBe(36)
  })

  it('choosing an equipo card fixes its dirección; "Toda la dirección" removes only the equipo', () => {
    const { tarjetas, opciones } = vista({ direccion: ID_CONEXION })
    expect(parcheElegirTarjeta(tarjetas, ID_PDP, opciones)).toEqual({ equipo: ID_PDP, direccion: ID_CONEXION })
    expect(parcheElegirTarjeta(tarjetas, TARJETA_TODAS, opciones)).toEqual({ equipo: null })
  })
})

describe('KPI cards follow the tree, one level at a time (Dirección de Niños)', () => {
  const N = 'dir-ninos'
  const W = 'area-waumbaland'
  const U = 'area-upstreet'
  const nodo = (id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> => ({
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  })
  const arbol = [
    nodo(N, 'Dirección de Niños', [
      nodo(U, 'Upstreet', [nodo('u-anf', 'Anfitriones', [], 2)], 1),
      nodo(W, 'Waumbaland', [nodo('w-anf', 'Anfitriones', [], 2), nodo('w-atv', 'Atención al Voluntario', [], 2)], 1),
    ]),
  ]
  const en = (clave: string, nombre: string, equipoId: string, equipoLabel: string, rol: string): FilaServidor => ({
    ...fila(clave, nombre, ID_CORO, rol),
    equipoId,
    equipoLabel,
    direccionId: N,
  })
  const filas = [
    en('1', 'Directora Niños', N, 'Dirección de Niños', 'Director'),
    en('2', 'Wanda', W, 'Waumbaland', 'Coordinador'),
    en('3', 'Ana', 'w-anf', 'Anfitriones', 'Coordinador'),
    en('4', 'Beto', 'w-anf', 'Anfitriones', 'Facilitador'),
    en('5', 'Caro', 'w-atv', 'Atención al Voluntario', 'Coordinador'),
    en('6', 'Dani', 'u-anf', 'Anfitriones', 'Coordinador'),
  ]
  const vistaNinos = (filtros: Partial<FiltrosServidores>) =>
    calcularVistaServidores({ filas, arbol, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })

  it('a dirección shows its direct áreas (Upstreet, Waumbaland), each counting its whole branch', () => {
    const { tarjetas } = vistaNinos({ direccion: N })
    expect(resumen(tarjetas)).toEqual(['Toda la dirección: 6', 'Upstreet: 1', 'Waumbaland: 4'])
    expect(tarjetas.items.find((t) => t.id === W)?.responsable).toBe('Coordina Wanda')
  })

  it('tapping an área enters it; its cards are its own equipos', () => {
    const v = vistaNinos({ direccion: N })
    expect(parcheElegirTarjeta(v.tarjetas, W, v.opciones)).toEqual({ area: W, equipo: null, direccion: N })

    const { tarjetas, opciones } = vistaNinos({ direccion: N, area: W })
    expect(resumen(tarjetas)).toEqual(['Todo Waumbaland: 4', 'Anfitriones: 2', 'Atención al Voluntario: 1'])
    expect(parcheElegirTarjeta(tarjetas, 'w-anf', opciones)).toEqual({ equipo: 'w-anf', direccion: N })
  })
})

describe('KPI cards carry the flags and the etapa bar of the prototype', () => {
  const etapas = (activo: number, enOrientacion = 0, enPausa = 0) => ({
    postulado: 0,
    en_orientacion: enOrientacion,
    activo,
    en_pausa: enPausa,
    inactivo: 0,
    retirado: 0,
  })

  it('each dirección counts its people without an account and its servicios per etapa', () => {
    const { tarjetas } = vista()
    expect(tarjetas.todas).toMatchObject({ sinCuenta: 32, porEtapa: etapas(37, 2, 1) })
    expect(tarjetas.items.find((t) => t.id === ID_CONEXION)).toMatchObject({ sinCuenta: 31, porEtapa: etapas(35, 2, 1) })
    expect(tarjetas.items.find((t) => t.id === ID_ALABANZA)).toMatchObject({ sinCuenta: 1, porEtapa: etapas(2) })
  })

  it('each equipo counts its whole branch, under the same filters as its people count', () => {
    expect(vista({ direccion: ID_CONEXION }).tarjetas.items[0]).toMatchObject({
      id: ID_DHAH,
      personas: 9,
      sinCuenta: 6,
      porEtapa: etapas(8, 1),
    })
    expect(vista({ direccion: ID_CONEXION, etapa: 'en_orientacion' }).tarjetas.items[0]).toMatchObject({
      personas: 1,
      sinCuenta: 1,
      porEtapa: etapas(0, 1),
    })
  })
})
