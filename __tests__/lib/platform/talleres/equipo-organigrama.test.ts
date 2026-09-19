/**
 * T3 — construirOpcionesEquipoTaller: the two option lists the "crear
 * taller" form needs (link an existing eligible node, or create a new
 * one under an active parent), built from a flat dream_team_equipos
 * snapshot. Pure function — no Supabase client involved — see
 * lib/platform/talleres/equipo-organigrama.ts.
 */

import {
  construirOpcionesEquipoTaller,
  fetchCoordinadorRoles,
  type EquipoOrganigramaRaw,
} from '@/lib/platform/talleres/equipo-organigrama'

function equipo(overrides: Partial<EquipoOrganigramaRaw> & { id: string; label: string }): EquipoOrganigramaRaw {
  return {
    experiencia: 'talleres_crecimiento',
    activo: true,
    parent_equipo_id: null,
    ...overrides,
  }
}

describe('construirOpcionesEquipoTaller', () => {
  it('builds a root-first path joined by " › " for a nested node', () => {
    const equipos: EquipoOrganigramaRaw[] = [
      equipo({ id: 'raiz', label: 'Dirección de Conexión', parent_equipo_id: null }),
      equipo({ id: 'medio', label: 'Grupos de Corto Plazo', parent_equipo_id: 'raiz' }),
      equipo({ id: 'hoja', label: 'Punto de Partida', parent_equipo_id: 'medio' }),
    ]
    const opciones = construirOpcionesEquipoTaller(equipos, new Set())
    const hoja = opciones.vincular.find((o) => o.id === 'hoja')
    expect(hoja?.ruta).toBe('Dirección de Conexión › Grupos de Corto Plazo › Punto de Partida')
  })

  it('a root-level node in crearBajo has just its own label as ruta (no leading separator)', () => {
    const equipos: EquipoOrganigramaRaw[] = [equipo({ id: 'raiz', label: 'DPS', experiencia: 'dps' })]
    const opciones = construirOpcionesEquipoTaller(equipos, new Set())
    expect(opciones.crearBajo).toEqual([{ id: 'raiz', ruta: 'DPS' }])
  })

  describe('vincular — eligibility', () => {
    function arbolBase(): EquipoOrganigramaRaw[] {
      return [
        equipo({ id: 'raiz', label: 'Dirección de Conexión', parent_equipo_id: null }),
        equipo({ id: 'medio', label: 'Grupos de Corto Plazo', parent_equipo_id: 'raiz' }),
        equipo({ id: 'hoja', label: 'Punto de Partida', parent_equipo_id: 'medio' }),
      ]
    }

    it('includes an active, talleres_crecimiento leaf with a parent and no existing link', () => {
      const opciones = construirOpcionesEquipoTaller(arbolBase(), new Set())
      expect(opciones.vincular.map((o) => o.id)).toContain('hoja')
    })

    it('excludes a root node, even if it happens to have no children', () => {
      const equipos: EquipoOrganigramaRaw[] = [equipo({ id: 'raiz-sola', label: 'Nodo Suelto', parent_equipo_id: null })]
      const opciones = construirOpcionesEquipoTaller(equipos, new Set())
      expect(opciones.vincular).toEqual([])
    })

    it('excludes a node that has children', () => {
      const opciones = construirOpcionesEquipoTaller(arbolBase(), new Set())
      expect(opciones.vincular.map((o) => o.id)).not.toContain('medio')
    })

    it('excludes a node of another experiencia', () => {
      const equipos = arbolBase()
      equipos.push(equipo({ id: 'ninos-hoja', label: 'Waumba Land', experiencia: 'ninos', parent_equipo_id: 'raiz' }))
      const opciones = construirOpcionesEquipoTaller(equipos, new Set())
      expect(opciones.vincular.map((o) => o.id)).not.toContain('ninos-hoja')
    })

    it('excludes an inactive node', () => {
      const equipos = arbolBase()
      equipos.push(equipo({ id: 'inactivo', label: 'Equipo Inactivo', parent_equipo_id: 'medio', activo: false }))
      const opciones = construirOpcionesEquipoTaller(equipos, new Set())
      expect(opciones.vincular.map((o) => o.id)).not.toContain('inactivo')
    })

    it('excludes a node already linked to a taller', () => {
      const opciones = construirOpcionesEquipoTaller(arbolBase(), new Set(['hoja']))
      expect(opciones.vincular.map((o) => o.id)).not.toContain('hoja')
    })
  })

  describe('crearBajo — eligibility', () => {
    it('includes any active node regardless of experiencia (DPS is a legitimate parent)', () => {
      const equipos: EquipoOrganigramaRaw[] = [
        equipo({ id: 'dps', label: 'DPS', experiencia: 'dps', parent_equipo_id: null }),
      ]
      const opciones = construirOpcionesEquipoTaller(equipos, new Set())
      expect(opciones.crearBajo.map((o) => o.id)).toContain('dps')
    })

    it('includes root nodes (a taller can hang directly under a Dirección)', () => {
      const equipos: EquipoOrganigramaRaw[] = [equipo({ id: 'raiz', label: 'Dirección de Conexión', parent_equipo_id: null })]
      const opciones = construirOpcionesEquipoTaller(equipos, new Set())
      expect(opciones.crearBajo.map((o) => o.id)).toContain('raiz')
    })

    it('excludes an inactive node', () => {
      const equipos: EquipoOrganigramaRaw[] = [equipo({ id: 'inactivo', label: 'Inactivo', activo: false })]
      const opciones = construirOpcionesEquipoTaller(equipos, new Set())
      expect(opciones.crearBajo).toEqual([])
    })

    it('does not exclude an already-linked node — a new taller can nest under one', () => {
      const equipos: EquipoOrganigramaRaw[] = [equipo({ id: 'ya-vinculado', label: 'Ya Vinculado' })]
      const opciones = construirOpcionesEquipoTaller(equipos, new Set(['ya-vinculado']))
      expect(opciones.crearBajo.map((o) => o.id)).toContain('ya-vinculado')
    })
  })
})

/**
 * T4b — fetchCoordinadorRoles: the taller detail page's "assign
 * coordinador" card needs the equipo's coordinador role id. Extracted
 * out of app/(auth)/admin/talleres/abstracto/[slug]/page.tsx so it's
 * unit-testable without a full RSC harness. The page now reads
 * `taller.dream_team_equipo_id` directly (fetched with the taller row
 * itself) instead of gating this call on `ediciones.length > 0` —
 * the bug this replaces: a brand-new taller with zero ediciones
 * always had its equipoId resolve to null, hiding the assign card
 * even though T3 already gives every new taller an equipo with a
 * seeded coordinador role.
 */
describe('fetchCoordinadorRoles', () => {
  function fakeClient(rolesData: unknown) {
    return {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: rolesData, error: null })),
        })),
      })),
    }
  }

  it('returns only the coordinador role, filtering out others', async () => {
    const client = fakeClient([
      { id: 'rol-dir', label: 'director' },
      { id: 'rol-coord', label: 'coordinador' },
      { id: 'rol-lider', label: 'lider' },
    ])
    const roles = await fetchCoordinadorRoles(client, 'equipo-1')
    expect(roles).toEqual([{ id: 'rol-coord', label: 'coordinador' }])
  })

  it('returns an empty array when the equipo has no coordinador role', async () => {
    const client = fakeClient([{ id: 'rol-dir', label: 'director' }])
    const roles = await fetchCoordinadorRoles(client, 'equipo-1')
    expect(roles).toEqual([])
  })

  it('returns an empty array when the query errors or returns null', async () => {
    const client = fakeClient(null)
    const roles = await fetchCoordinadorRoles(client, 'equipo-1')
    expect(roles).toEqual([])
  })
})
