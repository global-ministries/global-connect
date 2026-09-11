import { construirArbol, contarPorRama, type NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamEquipo } from '@/lib/platform/dream-team/types'

function equipo(overrides: Partial<DreamTeamEquipo> & Pick<DreamTeamEquipo, 'id' | 'label'>): DreamTeamEquipo {
  return {
    experiencia: 'dps',
    activo: true,
    ...overrides,
  }
}

describe('construirArbol', () => {
  it('returns an empty array for an empty list', () => {
    expect(construirArbol([])).toEqual([])
  })

  it('nests children under their parent with nivel starting at 0', () => {
    const equipos: DreamTeamEquipo[] = [
      equipo({ id: 'raiz', label: 'Dirección de Experiencia' }),
      equipo({ id: 'hijo', label: 'DPS', parentEquipoId: 'raiz' }),
      equipo({ id: 'nieto', label: 'DPS Producción', parentEquipoId: 'hijo' }),
    ]

    const arbol = construirArbol(equipos)

    expect(arbol).toHaveLength(1)
    expect(arbol[0].equipo.id).toBe('raiz')
    expect(arbol[0].nivel).toBe(0)
    expect(arbol[0].hijos).toHaveLength(1)
    expect(arbol[0].hijos[0].equipo.id).toBe('hijo')
    expect(arbol[0].hijos[0].nivel).toBe(1)
    expect(arbol[0].hijos[0].hijos).toHaveLength(1)
    expect(arbol[0].hijos[0].hijos[0].equipo.id).toBe('nieto')
    expect(arbol[0].hijos[0].hijos[0].nivel).toBe(2)
  })

  it('orders siblings by label using Spanish localeCompare', () => {
    const equipos: DreamTeamEquipo[] = [
      equipo({ id: 'raiz', label: 'Raíz' }),
      equipo({ id: 'c', label: 'Ñandú', parentEquipoId: 'raiz' }),
      equipo({ id: 'a', label: 'Álvaro', parentEquipoId: 'raiz' }),
      equipo({ id: 'b', label: 'Bernardo', parentEquipoId: 'raiz' }),
    ]

    const arbol = construirArbol(equipos)

    const labelsHijos = arbol[0].hijos.map((n) => n.equipo.label)
    expect(labelsHijos).toEqual(['Álvaro', 'Bernardo', 'Ñandú'])
  })

  // ── The area-director case ─────────────────────────────────────────────
  // Real staging shape reported for Ana (dream_team.direct scoped to DPS):
  // her scoped read returns 11 equipos, NONE with parentEquipoId === null.
  // The DPS node's parentEquipoId points at "Dirección de Experiencia",
  // which RLS never hands her — that id simply isn't in the list. If the
  // tree only rooted nodes with a null parent, her screen would render
  // completely empty despite 11 visible equipos. This is the normal case
  // for any area director, not a theoretical edge case.
  it('roots a node whose parent id is not present in the received list (scoped read / area director)', () => {
    const equipos: DreamTeamEquipo[] = [
      equipo({ id: 'dps', label: 'DPS', parentEquipoId: 'direccion-experiencia' }), // parent NOT in list
      equipo({ id: 'dps-escenario', label: 'DPS Escenario', parentEquipoId: 'dps' }),
      equipo({ id: 'dps-produccion', label: 'DPS Producción Técnica', parentEquipoId: 'dps' }),
      equipo({ id: 'dps-escenario-sonido', label: 'DPS Escenario Sonido', parentEquipoId: 'dps-escenario' }),
    ]

    const arbol = construirArbol(equipos)

    // No node in this list has parentEquipoId === null/undefined, yet the
    // orphan-by-invisible-parent must still become a single visible root.
    expect(equipos.every((e) => e.parentEquipoId !== undefined)).toBe(true)
    expect(arbol).toHaveLength(1)
    expect(arbol[0].equipo.id).toBe('dps')
    expect(arbol[0].nivel).toBe(0)

    const hijosDps = arbol[0].hijos.map((n) => n.equipo.id)
    expect(hijosDps).toEqual(['dps-escenario', 'dps-produccion'])

    const nietoEscenario = arbol[0].hijos.find((n) => n.equipo.id === 'dps-escenario')
    expect(nietoEscenario?.nivel).toBe(1)
    expect(nietoEscenario?.hijos).toHaveLength(1)
    expect(nietoEscenario?.hijos[0].equipo.id).toBe('dps-escenario-sonido')
    expect(nietoEscenario?.hijos[0].nivel).toBe(2)
  })

  it('tolerates cycles without hanging or visiting a node twice', () => {
    const equipos: DreamTeamEquipo[] = [
      equipo({ id: 'a', label: 'A', parentEquipoId: 'b' }),
      equipo({ id: 'b', label: 'B', parentEquipoId: 'a' }),
      equipo({ id: 'c', label: 'C' }),
    ]

    const arbol = construirArbol(equipos)

    const idsVistos = new Set<string>()
    function recorrer(nodos: readonly NodoArbol[]) {
      for (const nodo of nodos) {
        expect(idsVistos.has(nodo.equipo.id)).toBe(false)
        idsVistos.add(nodo.equipo.id)
        recorrer(nodo.hijos)
      }
    }
    recorrer(arbol)

    // The only acyclic root ('c', no parent) must still be present.
    expect(arbol.some((n) => n.equipo.id === 'c')).toBe(true)
  })
})

/**
 * contarPorRama — subtree headcount, regression.
 *
 * "Mi equipo" showed each node's DIRECT headcount only. On the preview the
 * admin saw "Dirección de Experiencia · 0 personas · Sin servidores" while the
 * page header said "Activo: 6" — three of them serve in Cámaras, Media and
 * Sonido, all under Experiencia. With the branch folded, a director would read
 * that Experiencia was empty.
 */
describe('contarPorRama', () => {
  const eq = (id: string, parentEquipoId?: string): DreamTeamEquipo => ({
    id,
    experiencia: 'dps',
    label: id,
    activo: true,
    ...(parentEquipoId ? { parentEquipoId } : {}),
  })

  // Experiencia → DPS → { Cámaras, Media }
  const arbol = construirArbol([
    eq('experiencia'),
    eq('dps', 'experiencia'),
    eq('camaras', 'dps'),
    eq('media', 'dps'),
  ])

  it('rolls descendants up into every ancestor', () => {
    const totales = contarPorRama(arbol, { camaras: 2, media: 1 })
    expect(totales.get('camaras')).toBe(2)
    expect(totales.get('media')).toBe(1)
    expect(totales.get('dps')).toBe(3)
    expect(totales.get('experiencia')).toBe(3)
  })

  it('adds a node own people to its descendants', () => {
    const totales = contarPorRama(arbol, { dps: 1, camaras: 2 })
    expect(totales.get('dps')).toBe(3)
    expect(totales.get('experiencia')).toBe(3)
  })

  it('is zero only when the whole branch is empty', () => {
    const totales = contarPorRama(arbol, {})
    expect(totales.get('experiencia')).toBe(0)
    expect(totales.get('camaras')).toBe(0)
  })
})
