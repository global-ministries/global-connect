/**
 * Mi equipo cards follow the tree one level at a time, like the Servidores KPI
 * cards: a dirección shows its direct children, an área card enters the área
 * and a lone área in between (Conexión → Talleres) is skipped.
 */
import {
  TODOS_LOS_EQUIPOS,
  nivelDeEquipos,
  personasDeSeleccion,
  vistaDeDireccion,
  type PersonasPorEquipo,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import {
  ID_CONEXION,
  ID_DHAH,
  ID_MDH,
  ID_PAREJAS,
  ID_PDP,
  arbolConexion,
  persona,
  personasPorEquipoConexion,
} from '@/tests/helpers/mi-equipo-conexion'

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

// Niños → Waumbaland (people of its own) → Anfitriones, Atención al Voluntario → Recepción, Seguimiento;
// Niños → Upstreet → Anfitriones; Niños → Vacía (nobody).
const arbolNinos: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo('ninos', 'Dirección de Niños', [
    nodo('wau', 'Waumbaland', [
      nodo('wau-anf', 'Anfitriones', [], 2),
      nodo('wau-atv', 'Atención al Voluntario', [nodo('wau-rec', 'Recepción', [], 3), nodo('wau-seg', 'Seguimiento', [], 3)], 2),
    ], 1),
    nodo('vacia', 'Vacía', [], 1),
    nodo('ups', 'Upstreet', [nodo('ups-anf', 'Anfitriones', [], 2)], 1),
  ]),
]

const personasNinos: PersonasPorEquipo = {
  ninos: [persona('n1', 'Nina Directora', 'Director')],
  wau: [persona('w1', 'Wanda Coordinadora', 'Coordinador'), persona('w2', 'Walter Facilitador', 'Facilitador', 'en_orientacion')],
  'wau-anf': [persona('wa1', 'Ana Anfitriona', 'Facilitador')],
  'wau-rec': [persona('r1', 'Rita Recepción', 'Coordinador')],
  'wau-seg': [persona('s1', 'Sara Seguimiento', 'Facilitador', 'postulado')],
  'ups-anf': [persona('u1', 'Ursula Upstreet', 'Coordinador'), persona('u2', 'Uriel Upstreet', 'Facilitador')],
}

function vistaNinos() {
  const vista = vistaDeDireccion(arbolNinos, personasNinos, 'ninos')
  if (!vista) throw new Error('Niños must resolve')
  return vista
}

describe('Mi equipo cards follow the tree one level at a time', () => {
  it('shows the direct children of the dirección that have people, sorted, each counting its whole branch', () => {
    const vista = vistaNinos()
    expect(vista.equipos.map((e) => [e.label, e.total, e.porActivar, e.esArea])).toEqual([
      ['Upstreet', 2, 0, true],
      ['Waumbaland', 5, 2, true],
    ])
    expect(vista.todaLaDireccion).toMatchObject({ id: TODOS_LOS_EQUIPOS, label: 'Toda la dirección', total: 8, porActivar: 2 })
  })

  it("names a card's responsable from the node's own people", () => {
    const [upstreet, waumbaland] = vistaNinos().equipos
    expect(upstreet.responsable).toBeNull()
    expect(waumbaland.responsable).toEqual({ nombre: 'Wanda Coordinadora', rol: 'coordinador' })
  })

  it('still counts every team of the dirección for the header', () => {
    expect(vistaNinos().totalEquipos).toBe(5)
  })

  it('the dirección level has no parent and is the default level', () => {
    const vista = vistaNinos()
    expect(nivelDeEquipos(vista, null)).toMatchObject({ padre: null, todas: vista.todaLaDireccion, equipos: vista.equipos })
    expect(nivelDeEquipos(vista, 'unknown').padre).toBeNull()
  })

  it('entering an área shows "Todo <área>" plus its direct children, with the way back up', () => {
    const nivel = nivelDeEquipos(vistaNinos(), 'wau')
    expect(nivel.todas).toMatchObject({
      id: 'wau',
      label: 'Todo Waumbaland',
      total: 5,
      porActivar: 2,
      responsable: { nombre: 'Wanda Coordinadora', rol: 'coordinador' },
    })
    expect(nivel.equipos.map((e) => [e.id, e.label, e.total, e.esArea])).toEqual([
      ['wau-anf', 'Anfitriones', 1, false],
      ['wau-atv', 'Atención al Voluntario', 2, true],
    ])
    expect(nivel.padre).toEqual({ id: TODOS_LOS_EQUIPOS, label: 'Dirección de Niños' })
    expect(nivel.modoCompacto).toBe(false)
  })

  it('works at any depth', () => {
    const nivel = nivelDeEquipos(vistaNinos(), 'wau-atv')
    expect(nivel.todas).toMatchObject({ id: 'wau-atv', label: 'Todo Atención al Voluntario', total: 2, responsable: null })
    expect(nivel.equipos.map((e) => e.label)).toEqual(['Recepción', 'Seguimiento'])
    expect(nivel.padre).toEqual({ id: 'wau', label: 'Waumbaland' })
  })

  it('a leaf has no level of its own', () => {
    expect(nivelDeEquipos(vistaNinos(), 'wau-anf').padre).toBeNull()
  })

  it('selects the whole branch of an área and only the own people of a leaf', () => {
    const { personas } = vistaNinos()
    expect(personasDeSeleccion(personas, 'wau').map((p) => p.nombre).sort()).toEqual([
      'Ana Anfitriona', 'Rita Recepción', 'Sara Seguimiento', 'Walter Facilitador', 'Wanda Coordinadora',
    ])
    expect(personasDeSeleccion(personas, 'wau-atv')).toHaveLength(2)
    expect(personasDeSeleccion(personas, 'wau-anf').map((p) => p.nombre)).toEqual(['Ana Anfitriona'])
    expect(personasDeSeleccion(personas, 'ups-anf')).toHaveLength(2)
    expect(personasDeSeleccion(personas, TODOS_LOS_EQUIPOS)).toHaveLength(8)
  })

  it('skips a lone área in between: Conexión shows the four teams of Talleres', () => {
    const vista = vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION)
    expect(vista?.equipos.map((e) => e.id).sort()).toEqual([ID_DHAH, ID_MDH, ID_PAREJAS, ID_PDP].sort())
    expect(vista?.equipos.every((e) => !e.esArea)).toBe(true)
    expect(vista?.totalEquipos).toBe(4)
  })

  it('turns compact on above 8 cards at an entered level', () => {
    const hijos = Array.from({ length: 9 }, (_, i) => nodo(`h-${i}`, `Equipo ${i}`, [], 2))
    const arbol = [nodo('d', 'Dirección D', [nodo('a', 'Área A', hijos, 1), nodo('b', 'Área B', [nodo('b1', 'B1', [], 2)], 1)])]
    const personas: PersonasPorEquipo = {
      ...Object.fromEntries(hijos.map((h, i) => [h.equipo.id, [persona(`p${i}`, `Persona ${i}`, 'Facilitador')]])),
      b1: [persona('pb', 'Persona B', 'Facilitador')],
    }
    const vista = vistaDeDireccion(arbol, personas, 'd')
    if (!vista) throw new Error('D must resolve')
    expect(vista.modoCompacto).toBe(false)
    expect(nivelDeEquipos(vista, 'a').modoCompacto).toBe(true)
    expect(nivelDeEquipos(vista, 'a').equipos).toHaveLength(9)
  })
})
