/**
 * `estructura-arbol.ts` — merges the real Dream Team org tree with the
 * virtual Grupos de Vida branch, and derives per-node responsables for both
 * worlds. Three independent pure concerns:
 *
 *   1. `construirNodosArbol` — DreamTeamEquipo[] + NodoEstructuraGdv[] → the
 *      flat node list `construirArbol` (arbol.ts) builds a tree from.
 *   2. `responsablesDreamTeamPorEquipo` — who holds director/coordinador on
 *      a real equipo, from dream_team_servicios.
 *   3. `idsSegmentosColapsadosPorDefecto` — which nodes start collapsed.
 */
import {
  construirNodosArbol,
  responsablesDreamTeamPorEquipo,
  idsSegmentosColapsadosPorDefecto,
  type NodoEquipoArbol,
  type ResponsableNodo,
} from '@/lib/platform/dream-team/estructura-arbol'
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'
import type { NodoEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'

function equipo(overrides: Partial<DreamTeamEquipo> & Pick<DreamTeamEquipo, 'id' | 'label'>): DreamTeamEquipo {
  return { experiencia: 'dps', activo: true, ...overrides }
}

function nodoGdv(overrides: Partial<NodoEstructuraGdv> & Pick<NodoEstructuraGdv, 'nodoId' | 'tipo'>): NodoEstructuraGdv {
  return { parentId: null, label: overrides.nodoId, responsables: [], ...overrides }
}

function servicio(overrides: Partial<DreamTeamServicio> & Pick<DreamTeamServicio, 'equipoId' | 'rolId'>): DreamTeamServicio {
  return {
    id: 's-1',
    personaId: personaId('p-1'),
    estado: 'activo',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    motivoActual: 'admin_asignacion',
    version: 1,
    ...overrides,
  }
}

function rol(overrides: Partial<DreamTeamRol> & Pick<DreamTeamRol, 'id' | 'equipoId' | 'label'>): DreamTeamRol {
  return { activo: true, ...overrides }
}

describe('construirNodosArbol', () => {
  it('tags every real equipo with origen dream_team, defaulting responsables to empty', () => {
    const equipos = [equipo({ id: 'dps', label: 'DPS' })]

    const nodos = construirNodosArbol(equipos, [])

    expect(nodos).toEqual([
      { origen: 'dream_team', id: 'dps', parentEquipoId: undefined, label: 'DPS', activo: true, experiencia: 'dps', responsables: [] },
    ])
  })

  it('adds a segmento as a grupos_vida-origin node hanging off the real GdV root', () => {
    const equipos = [equipo({ id: 'gdv-root', label: 'Dirección de Grupos de Vida', experiencia: 'grupos_vida' as never })]
    const nodosGdv = [nodoGdv({ nodoId: 'segmento-1', parentId: 'gdv-root', tipo: 'segmento', label: 'Matrimonios' })]

    const nodos = construirNodosArbol(equipos, nodosGdv)
    const segmento = nodos.find((n) => n.id === 'segmento-1')

    expect(segmento).toBeDefined()
    expect(segmento?.origen).toBe('grupos_vida')
    expect(segmento?.parentEquipoId).toBe('gdv-root')
    expect((segmento as Extract<NodoEquipoArbol, { origen: 'grupos_vida' }>).tipo).toBe('segmento')
  })

  it('adds a grupo as a grupos_vida-origin node hanging off its segmento, with its responsables', () => {
    const nodosGdv = [
      nodoGdv({
        nodoId: 'grupo-1',
        parentId: 'segmento-1',
        tipo: 'grupo',
        label: 'Barquisimeto Matrimonios 1',
        responsables: [{ personaId: personaId('p-lider'), nombre: 'Marta Ruiz', rol: 'lider' }],
      }),
    ]

    const nodos = construirNodosArbol([], nodosGdv)

    expect(nodos).toEqual([
      {
        origen: 'grupos_vida',
        tipo: 'grupo',
        id: 'grupo-1',
        parentEquipoId: 'segmento-1',
        label: 'Barquisimeto Matrimonios 1',
        activo: true,
        responsables: [{ personaId: personaId('p-lider'), nombre: 'Marta Ruiz', rol: 'lider' }],
      },
    ])
  })

  it("attaches the 'direccion' row's responsables to the real matching equipo instead of creating a node", () => {
    const equipos = [equipo({ id: 'gdv-root', label: 'Dirección de Grupos de Vida' })]
    const nodosGdv = [
      nodoGdv({
        nodoId: 'gdv-root',
        parentId: null,
        tipo: 'direccion',
        responsables: [{ personaId: personaId('p-dg'), nombre: 'Ana Pérez', rol: 'director_general' }],
      }),
    ]

    const nodos = construirNodosArbol(equipos, nodosGdv)

    // Exactly one node total — the direccion row never became a second one.
    expect(nodos).toHaveLength(1)
    expect(nodos[0].id).toBe('gdv-root')
    expect(nodos[0].responsables).toEqual([{ personaId: personaId('p-dg'), nombre: 'Ana Pérez', rol: 'director_general' }])
  })

  it("drops the 'direccion' row's responsables when the matching real equipo isn't in scope", () => {
    const nodosGdv = [
      nodoGdv({
        nodoId: 'gdv-root-fuera-de-alcance',
        parentId: null,
        tipo: 'direccion',
        responsables: [{ personaId: personaId('p-dg'), nombre: 'Ana Pérez', rol: 'director_general' }],
      }),
    ]

    const nodos = construirNodosArbol([], nodosGdv)

    expect(nodos).toHaveLength(0)
  })

  it('merges responsablesDreamTeam into real nodes without touching virtual ones', () => {
    const equipos = [equipo({ id: 'dps', label: 'DPS' })]
    const responsables = new Map<string, readonly ResponsableNodo[]>([
      ['dps', [{ personaId: personaId('p-dir'), nombre: 'Carla Ríos', rol: 'director' }]],
    ])

    const nodos = construirNodosArbol(equipos, [], responsables)

    expect(nodos[0].responsables).toEqual([{ personaId: personaId('p-dir'), nombre: 'Carla Ríos', rol: 'director' }])
  })

  it('produces a node list construirArbol can nest into a real branch topped by the virtual Grupos de Vida hierarchy', () => {
    const equipos = [equipo({ id: 'gdv-root', label: 'Dirección de Grupos de Vida' })]
    const nodosGdv = [
      nodoGdv({ nodoId: 'segmento-1', parentId: 'gdv-root', tipo: 'segmento', label: 'Matrimonios' }),
      nodoGdv({ nodoId: 'grupo-1', parentId: 'segmento-1', tipo: 'grupo', label: 'Grupo 1' }),
    ]

    const arbol = construirArbol(construirNodosArbol(equipos, nodosGdv))

    expect(arbol).toHaveLength(1)
    expect(arbol[0].equipo.id).toBe('gdv-root')
    expect(arbol[0].hijos).toHaveLength(1)
    expect(arbol[0].hijos[0].equipo.id).toBe('segmento-1')
    expect(arbol[0].hijos[0].hijos).toHaveLength(1)
    expect(arbol[0].hijos[0].hijos[0].equipo.id).toBe('grupo-1')
  })
})

describe('responsablesDreamTeamPorEquipo', () => {
  const roles = [
    rol({ id: 'rol-director', equipoId: 'dps', label: 'director' }),
    rol({ id: 'rol-coordinador', equipoId: 'dps', label: 'coordinador' }),
    rol({ id: 'rol-lider', equipoId: 'dps', label: 'lider' }),
    rol({ id: 'rol-voluntario', equipoId: 'dps', label: 'voluntario' }),
  ]
  const nombrePorId = new Map([
    [personaId('p-director'), 'Carla Ríos'],
    [personaId('p-coordinador'), 'Beto Sosa'],
  ])

  it('includes only active servicios whose role is director or coordinador', () => {
    const servicios = [
      servicio({ equipoId: 'dps', rolId: 'rol-director', personaId: personaId('p-director') }),
      servicio({ equipoId: 'dps', rolId: 'rol-coordinador', personaId: personaId('p-coordinador') }),
      servicio({ equipoId: 'dps', rolId: 'rol-lider', personaId: personaId('p-otro') }),
      servicio({ equipoId: 'dps', rolId: 'rol-voluntario', personaId: personaId('p-otro-2') }),
    ]

    const resultado = responsablesDreamTeamPorEquipo(servicios, roles, nombrePorId)

    expect(resultado.get('dps')?.map((r) => r.rol)).toEqual(['director', 'coordinador'])
  })

  it('excludes a director/coordinador servicio that is not currently active', () => {
    const servicios = [
      servicio({ equipoId: 'dps', rolId: 'rol-director', personaId: personaId('p-director'), estado: 'en_pausa' }),
    ]

    const resultado = responsablesDreamTeamPorEquipo(servicios, roles, nombrePorId)

    expect(resultado.get('dps')).toBeUndefined()
  })

  it('matches role labels case- and diacritic-insensitively', () => {
    const rolesAcentuados = [rol({ id: 'rol-director-x', equipoId: 'dps', label: 'Director' })]
    const servicios = [servicio({ equipoId: 'dps', rolId: 'rol-director-x', personaId: personaId('p-director') })]

    const resultado = responsablesDreamTeamPorEquipo(servicios, rolesAcentuados, nombrePorId)

    expect(resultado.get('dps')?.[0].rol).toBe('director')
  })

  it('resolves the display name from nombrePorId, falling back for an unresolved id', () => {
    const servicios = [servicio({ equipoId: 'dps', rolId: 'rol-director', personaId: personaId('p-sin-nombre') })]

    const resultado = responsablesDreamTeamPorEquipo(servicios, roles, nombrePorId)

    expect(resultado.get('dps')?.[0].nombre).toBe('Persona no encontrada')
  })

  it('orders director before coordinador within the same equipo', () => {
    const servicios = [
      servicio({ id: 's-1', equipoId: 'dps', rolId: 'rol-coordinador', personaId: personaId('p-coordinador') }),
      servicio({ id: 's-2', equipoId: 'dps', rolId: 'rol-director', personaId: personaId('p-director') }),
    ]

    const resultado = responsablesDreamTeamPorEquipo(servicios, roles, nombrePorId)

    expect(resultado.get('dps')?.map((r) => r.rol)).toEqual(['director', 'coordinador'])
  })

  it('groups responsables independently per equipoId', () => {
    const rolesDosEquipos = [
      rol({ id: 'rol-director-a', equipoId: 'equipo-a', label: 'director' }),
      rol({ id: 'rol-director-b', equipoId: 'equipo-b', label: 'director' }),
    ]
    const servicios = [
      servicio({ id: 's-a', equipoId: 'equipo-a', rolId: 'rol-director-a', personaId: personaId('p-director') }),
      servicio({ id: 's-b', equipoId: 'equipo-b', rolId: 'rol-director-b', personaId: personaId('p-coordinador') }),
    ]

    const resultado = responsablesDreamTeamPorEquipo(servicios, rolesDosEquipos, nombrePorId)

    expect(resultado.get('equipo-a')).toHaveLength(1)
    expect(resultado.get('equipo-b')).toHaveLength(1)
  })

  it('returns an empty map when nothing qualifies', () => {
    const resultado = responsablesDreamTeamPorEquipo([], roles, nombrePorId)
    expect(resultado.size).toBe(0)
  })
})

describe('idsSegmentosColapsadosPorDefecto', () => {
  it('collects only grupos_vida segmento ids, not grupo or dream_team ids, at any depth', () => {
    const equipos = [equipo({ id: 'gdv-root', label: 'Dirección de Grupos de Vida' })]
    const nodosGdv = [
      nodoGdv({ nodoId: 'segmento-1', parentId: 'gdv-root', tipo: 'segmento', label: 'Matrimonios' }),
      nodoGdv({ nodoId: 'segmento-2', parentId: 'gdv-root', tipo: 'segmento', label: 'Jóvenes' }),
      nodoGdv({ nodoId: 'grupo-1', parentId: 'segmento-1', tipo: 'grupo', label: 'Grupo 1' }),
    ]
    const arbol = construirArbol(construirNodosArbol(equipos, nodosGdv))

    const ids = idsSegmentosColapsadosPorDefecto(arbol)

    expect(ids.has('segmento-1')).toBe(true)
    expect(ids.has('segmento-2')).toBe(true)
    expect(ids.has('grupo-1')).toBe(false)
    expect(ids.has('gdv-root')).toBe(false)
    expect(ids.size).toBe(2)
  })

  it('returns an empty set for a tree with no Grupos de Vida branch', () => {
    const arbol = construirArbol(construirNodosArbol([equipo({ id: 'dps', label: 'DPS' })], []))
    expect(idsSegmentosColapsadosPorDefecto(arbol).size).toBe(0)
  })
})
