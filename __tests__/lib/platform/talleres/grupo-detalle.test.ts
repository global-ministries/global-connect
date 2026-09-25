/**
 * @jest-environment node
 *
 * T5 (odd/tasks/talleres-consolidar-pantallas.md) — loaders for
 * /talleres/[taller]/[edicion]/[grupo], the grupo detail screen.
 *
 * loadGrupoDetalle walks taller_grupos -> talleres_crecimiento_cohortes
 * (cohorte.taller_id IS the edición id — the same non-obvious FK
 * catalogo.ts's loadNombresPorCohorte and operacional.ts's
 * loadEdicionLocalDetalle already document) and returns null the moment
 * either link fails to resolve — including when RLS hides the row from a
 * zero-capability líder (verified against staging in
 * supabase/tests/talleres-t5-lider-lectura.test.sql: a líder can read
 * their OWN taller_grupo_asignaciones row but never taller_grupos itself).
 *
 * loadMiAsignacionGrupo is the escape hatch the page's gate uses to tell
 * "this grupo doesn't exist / isn't yours" (404) apart from "it's yours
 * but RLS hides the full record" (honest limited state) — it queries the
 * one row taller_grupo_asignaciones' SELECT policy always lets a caller
 * read regardless of capability: their own.
 *
 * resolveEquipoDeGrupo calls the existing talleres_equipo_de_grupo(uuid)
 * SECURITY DEFINER resolver (already EXECUTE-granted to `authenticated`,
 * already used inside taller_grupos'/taller_sesiones' own RLS) so the
 * degraded path can still confirm "this grupo belongs to this taller"
 * without any new grant.
 *
 * loadGrupoAsignaciones ("Su gente") embeds usuarios for the display
 * name, but degrades a row's name to null (never throws, never invents
 * a name) when the embed doesn't resolve — verified against staging that
 * NO viewer, not even a full director, can read a fellow team member's
 * usuarios row without a new SECURITY DEFINER name-resolution RPC
 * (puede_ver_usuario is a Grupos de Vida concept, unrelated to talleres);
 * adding one is out of this task's scope ("sólo la función nueva de
 * permisos por nodo").
 *
 * loadAsistenciaPorClase resolves participant names through the EXISTING
 * talleres_coord_inscripciones_personas RPC (already used by
 * loadCoordInscripcionesPendientes) — no new DB function needed.
 */

import {
  loadGrupoDetalle,
  loadMiAsignacionGrupo,
  loadGrupoAsignaciones,
  loadGrupoSesiones,
  loadAsistenciaPorClase,
  loadGrupoReporte,
  resolveEquipoDeGrupo,
  loadGrupoInscripciones,
  loadGruposDeCohorte,
  loadEsMiembroDelGrupo,
} from '@/lib/platform/talleres/grupo-detalle'

// ─── loadGrupoDetalle ───────────────────────────────────────────────────

interface StepResult {
  data: unknown
  error: unknown
}

/** Thenable `.from(t).select(cols).eq(col, val).maybeSingle()` per table. */
function buildChainClientMock(byTable: Record<string, StepResult>): {
  client: { from: jest.Mock }
  calls: Array<{ table: string; selectCols?: string; eqCalls: Array<[string, unknown]> }>
} {
  const calls: Array<{ table: string; selectCols?: string; eqCalls: Array<[string, unknown]> }> = []
  const from = jest.fn((table: string) => {
    const record: { table: string; selectCols?: string; eqCalls: Array<[string, unknown]> } = {
      table,
      eqCalls: [],
    }
    calls.push(record)
    const result = byTable[table] ?? { data: null, error: null }
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn((cols: string) => {
      record.selectCols = cols
      return b
    })
    b['eq'] = jest.fn((col: string, val: unknown) => {
      record.eqCalls.push([col, val])
      return b
    })
    b['order'] = jest.fn(() => b)
    b['limit'] = jest.fn(() => b)
    b['maybeSingle'] = jest.fn(() => Promise.resolve(result))
    Object.defineProperty(b, 'then', {
      value: (resolve: (v: unknown) => void) => resolve(result),
    })
    return b
  })
  return { client: { from }, calls }
}

describe('loadGrupoDetalle', () => {
  it('resolves grupo -> cohorte -> edición id across two queries', async () => {
    const { client, calls } = buildChainClientMock({
      taller_grupos: {
        data: { id: 'g-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo', cohorte_id: 'c-1' },
        error: null,
      },
      talleres_crecimiento_cohortes: {
        data: { id: 'c-1', taller_id: 'e-1' },
        error: null,
      },
    })

    const result = await loadGrupoDetalle(client, 'g-1')

    expect(result).toEqual({
      id: 'g-1',
      nombre: 'Grupo Alfa',
      capacidad: 12,
      estado: 'activo',
      cohorteId: 'c-1',
      edicionId: 'e-1',
    })
    expect(calls[0]?.table).toBe('taller_grupos')
    expect(calls[0]?.eqCalls).toEqual([['id', 'g-1']])
    expect(calls[1]?.table).toBe('talleres_crecimiento_cohortes')
    expect(calls[1]?.eqCalls).toEqual([['id', 'c-1']])
  })

  it('returns null when the grupo row does not resolve (unknown id, or RLS hides it)', async () => {
    const { client } = buildChainClientMock({
      taller_grupos: { data: null, error: null },
    })
    expect(await loadGrupoDetalle(client, 'unknown')).toBeNull()
  })

  it('returns null on a taller_grupos query error', async () => {
    const { client } = buildChainClientMock({
      taller_grupos: { data: null, error: { message: 'boom' } },
    })
    expect(await loadGrupoDetalle(client, 'g-1')).toBeNull()
  })

  it('returns null when the cohorte row does not resolve', async () => {
    const { client } = buildChainClientMock({
      taller_grupos: {
        data: { id: 'g-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo', cohorte_id: 'c-orphan' },
        error: null,
      },
      talleres_crecimiento_cohortes: { data: null, error: null },
    })
    expect(await loadGrupoDetalle(client, 'g-1')).toBeNull()
  })
})

// ─── loadMiAsignacionGrupo ──────────────────────────────────────────────

describe('loadMiAsignacionGrupo', () => {
  it('queries taller_grupo_asignaciones scoped to grupo_id, persona_id and activo=true', async () => {
    const { client, calls } = buildChainClientMock({
      taller_grupo_asignaciones: {
        data: { id: 'asig-1', rol: 'lider', activo: true },
        error: null,
      },
    })
    const result = await loadMiAsignacionGrupo(client, 'g-1', 'p-1')
    expect(result).toEqual({ id: 'asig-1', rol: 'lider', activo: true })
    expect(calls[0]?.eqCalls).toEqual([
      ['grupo_id', 'g-1'],
      ['persona_id', 'p-1'],
      ['activo', true],
    ])
  })

  it('returns null when the caller has no assignment on this grupo', async () => {
    const { client } = buildChainClientMock({
      taller_grupo_asignaciones: { data: null, error: null },
    })
    expect(await loadMiAsignacionGrupo(client, 'g-1', 'p-1')).toBeNull()
  })

  it('returns null on a query error', async () => {
    const { client } = buildChainClientMock({
      taller_grupo_asignaciones: { data: null, error: { message: 'boom' } },
    })
    expect(await loadMiAsignacionGrupo(client, 'g-1', 'p-1')).toBeNull()
  })
})

// ─── resolveEquipoDeGrupo ───────────────────────────────────────────────

describe('resolveEquipoDeGrupo', () => {
  it('calls the talleres_equipo_de_grupo RPC with p_grupo_id', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'eq-1', error: null })
    const result = await resolveEquipoDeGrupo({ rpc }, 'g-1')
    expect(rpc).toHaveBeenCalledWith('talleres_equipo_de_grupo', { p_grupo_id: 'g-1' })
    expect(result).toBe('eq-1')
  })

  it('returns null on an RPC error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await resolveEquipoDeGrupo({ rpc }, 'g-1')).toBeNull()
  })

  it('returns null when the grupo id does not resolve to any equipo', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null })
    expect(await resolveEquipoDeGrupo({ rpc }, 'g-1')).toBeNull()
  })
})

// ─── loadGrupoAsignaciones (T2, odd/tasks/talleres-lider-identidad.md) ──
//
// Now resolves names via the talleres_grupo_equipo_personas(uuid) RPC
// (migration 20260924150000_talleres_lider_identidad.sql) instead of the
// usuarios(...) embed — no viewer, not even a director, could read a
// fellow team member's usuarios row directly (see this file's own header
// history), so the embed always degraded to null. The RPC mirrors
// taller_grupo_asignaciones_select and resolves the name server-side.

function buildListClientMock(rows: unknown[] | null, error: unknown = null): {
  client: { from: jest.Mock }
  eqCalls: Array<[string, unknown]>
} {
  const eqCalls: Array<[string, unknown]> = []
  const from = jest.fn(() => {
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn(() => b)
    b['eq'] = jest.fn((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return b
    })
    b['order'] = jest.fn(() => Promise.resolve({ data: rows, error }))
    return b
  })
  return { client: { from }, eqCalls }
}

function buildRpcClientMock(rows: unknown[] | null, error: unknown = null): {
  client: { rpc: jest.Mock }
} {
  const rpc = jest.fn().mockResolvedValue({ data: rows, error })
  return { client: { rpc } }
}

describe('loadGrupoAsignaciones', () => {
  it('lists active asignaciones with names resolved via talleres_grupo_equipo_personas', async () => {
    const { client } = buildRpcClientMock([
      { asignacion_id: 'a-1', persona_id: 'p-1', rol: 'lider', activo: true, nombre: 'Juan', apellido: 'Pérez' },
    ])
    const result = await loadGrupoAsignaciones(client, 'g-1')
    expect(client.rpc).toHaveBeenCalledWith('talleres_grupo_equipo_personas', { p_grupo_id: 'g-1' })
    expect(result).toEqual([
      { id: 'a-1', personaId: 'p-1', rol: 'lider', nombre: 'Juan Pérez' },
    ])
  })

  it("degrades to '—' (never drops the row) when the RPC can't resolve a name", async () => {
    const { client } = buildRpcClientMock([
      { asignacion_id: 'a-2', persona_id: 'p-2', rol: 'voluntario', activo: true, nombre: null, apellido: null },
    ])
    const result = await loadGrupoAsignaciones(client, 'g-1')
    expect(result).toEqual([
      { id: 'a-2', personaId: 'p-2', rol: 'voluntario', nombre: '—' },
    ])
  })

  it('filters out inactive asignaciones', async () => {
    const { client } = buildRpcClientMock([
      { asignacion_id: 'a-1', persona_id: 'p-1', rol: 'lider', activo: true, nombre: 'Ana', apellido: 'Gómez' },
      { asignacion_id: 'a-2', persona_id: 'p-2', rol: 'voluntario', activo: false, nombre: 'Luis', apellido: 'Ruiz' },
    ])
    const result = await loadGrupoAsignaciones(client, 'g-1')
    expect(result).toEqual([{ id: 'a-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana Gómez' }])
  })

  it('returns [] on an RPC error (missing function included — fails soft)', async () => {
    const { client } = buildRpcClientMock(null, { message: '42883: function does not exist' })
    expect(await loadGrupoAsignaciones(client, 'g-1')).toEqual([])
  })
})

// ─── loadEsMiembroDelGrupo (T2, odd/tasks/talleres-lider-identidad.md) ──
//
// Wraps talleres_es_miembro_del_grupo(uuid) (T1's migration
// 20260924150000_talleres_lider_identidad.sql, STAGING only until T3).
// Fails soft to false on any error, including a missing function on an
// environment (production) that doesn't have it yet — the page must
// never crash on it.

describe('loadEsMiembroDelGrupo', () => {
  it('calls the talleres_es_miembro_del_grupo RPC with p_grupo_id and returns its boolean', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    const result = await loadEsMiembroDelGrupo({ rpc }, 'g-1')
    expect(rpc).toHaveBeenCalledWith('talleres_es_miembro_del_grupo', { p_grupo_id: 'g-1' })
    expect(result).toBe(true)
  })

  it('returns false when the caller is not an active member', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null })
    expect(await loadEsMiembroDelGrupo({ rpc }, 'g-1')).toBe(false)
  })

  it('fails soft to false on an RPC error (including a missing function, 42883)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: '42883: function does not exist' } })
    expect(await loadEsMiembroDelGrupo({ rpc }, 'g-1')).toBe(false)
  })

  it('fails soft to false when the RPC rejects outright', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('network error'))
    await expect(loadEsMiembroDelGrupo({ rpc }, 'g-1')).resolves.toBe(false)
  })
})

// ─── loadGrupoSesiones ──────────────────────────────────────────────────

describe('loadGrupoSesiones', () => {
  it('lists sesiones for the grupo ordered by número', async () => {
    const { client } = buildListClientMock([
      { id: 's-1', numero: 1, fecha_programada: '2026-10-01', fecha_realizada: null, estado: 'programada' },
    ])
    const result = await loadGrupoSesiones(client, 'g-1')
    expect(result).toEqual([
      {
        id: 's-1',
        numero: 1,
        fechaProgramada: '2026-10-01',
        fechaRealizada: null,
        estado: 'programada',
        // The fixture doesn't select tema; the loader maps it to null
        // rather than undefined (the read view's fallback branch).
        tema: null,
      },
    ])
  })

  it('returns [] on a query error (RLS-hidden or genuinely empty look the same)', async () => {
    const { client } = buildListClientMock(null, { message: 'boom' })
    expect(await loadGrupoSesiones(client, 'g-1')).toEqual([])
  })

  // T2 (odd/tasks/talleres-asistencia-lider.md) — taller_sesiones.tema is
  // the class's name: the read view titles the clase
  // "Clase {numero} · {tema}" when it exists and falls back to
  // "Clase {numero}" when the column is NULL.
  it('exposes the taller_sesiones.tema column', async () => {
    const { client } = buildListClientMock([
      {
        id: 's-1',
        numero: 1,
        fecha_programada: '2026-10-01',
        fecha_realizada: null,
        estado: 'programada',
        tema: 'Introducción',
      },
    ])
    const result = await loadGrupoSesiones(client, 'g-1')
    expect(result[0]?.tema).toBe('Introducción')
  })

  it('keeps tema as null when the column is NULL (the read view falls back to "Clase {numero}")', async () => {
    const { client } = buildListClientMock([
      {
        id: 's-1',
        numero: 1,
        fecha_programada: '2026-10-01',
        fecha_realizada: null,
        estado: 'programada',
        tema: null,
      },
    ])
    const result = await loadGrupoSesiones(client, 'g-1')
    expect(result[0]?.tema).toBeNull()
  })
})

// ─── loadAsistenciaPorClase ─────────────────────────────────────────────

function buildAsistenciaClientMock(
  asistenciaRows: unknown[] | null,
  personasRows: unknown[] = [],
): { client: { from: jest.Mock; rpc: jest.Mock } } {
  const from = jest.fn(() => {
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn(() => b)
    b['eq'] = jest.fn(() => b)
    b['order'] = jest.fn(() => Promise.resolve({ data: asistenciaRows, error: null }))
    return b
  })
  const rpc = jest.fn().mockResolvedValue({ data: personasRows, error: null })
  return { client: { from, rpc } }
}

describe('loadAsistenciaPorClase', () => {
  it('resolves participant names via talleres_coord_inscripciones_personas', async () => {
    const { client } = buildAsistenciaClientMock(
      [{ id: 'as-1', persona_id: 'p-1', inscripcion_id: 'i-1', estado: 'presente' }],
      [{ inscripcion_id: 'i-1', pp_nombre: 'Ana', pp_apellido: 'Gómez' }],
    )
    const result = await loadAsistenciaPorClase(client, 's-1')
    expect(client.rpc).toHaveBeenCalledWith('talleres_coord_inscripciones_personas', {
      p_inscripcion_ids: ['i-1'],
    })
    expect(result).toEqual([
      { id: 'as-1', inscripcionId: 'i-1', personaId: 'p-1', nombre: 'Ana Gómez', estado: 'presente', motivo: null },
    ])
  })

  it('falls back to an em dash when a name does not resolve', async () => {
    const { client } = buildAsistenciaClientMock(
      [{ id: 'as-1', persona_id: 'p-1', inscripcion_id: 'i-1', estado: 'ausente' }],
      [],
    )
    const result = await loadAsistenciaPorClase(client, 's-1')
    expect(result[0]?.nombre).toBe('—')
  })

  it('returns [] without calling the RPC when there is no asistencia yet', async () => {
    const { client } = buildAsistenciaClientMock([], [])
    const result = await loadAsistenciaPorClase(client, 's-1')
    expect(result).toEqual([])
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('returns [] on a query error', async () => {
    const { client } = buildAsistenciaClientMock(null, [])
    expect(await loadAsistenciaPorClase(client, 's-1')).toEqual([])
  })

  // T2 (odd/tasks/talleres-asistencia-lider.md) — taller_asistencias.motivo
  // (T1's migration) is what the read view shows under an absent person,
  // mirroring Grupos de Vida's AttendanceList. The DB CHECK only allows a
  // motivo when estado='ausente', so any other row must come back null.
  it('exposes the taller_asistencias.motivo column for an ausente row', async () => {
    const { client } = buildAsistenciaClientMock(
      [
        {
          id: 'as-1',
          persona_id: 'p-1',
          inscripcion_id: 'i-1',
          estado: 'ausente',
          motivo: 'Viaje de trabajo',
        },
      ],
      [{ inscripcion_id: 'i-1', pp_nombre: 'Ana', pp_apellido: 'Gómez' }],
    )
    const result = await loadAsistenciaPorClase(client, 's-1')
    expect(result[0]?.motivo).toBe('Viaje de trabajo')
  })

  it('keeps motivo as null for a presente row (CHECK: motivo only with ausente)', async () => {
    const { client } = buildAsistenciaClientMock(
      [
        {
          id: 'as-1',
          persona_id: 'p-1',
          inscripcion_id: 'i-1',
          estado: 'presente',
          // A motivo that somehow rides along with a non-ausente row must
          // never reach the UI — the mapping enforces the DB CHECK.
          motivo: 'legacy motivo',
        },
      ],
      [{ inscripcion_id: 'i-1', pp_nombre: 'Ana', pp_apellido: 'Gómez' }],
    )
    const result = await loadAsistenciaPorClase(client, 's-1')
    expect(result[0]?.motivo).toBeNull()
  })
})

// ─── loadGrupoReporte ───────────────────────────────────────────────────

describe('loadGrupoReporte', () => {
  it('returns the most recent reporte for the grupo, mapped to camelCase', async () => {
    const { client } = buildChainClientMock({
      taller_reportes: {
        data: {
          id: 'r-1',
          estado: 'enviado',
          observaciones_generales: 'Todo bien.',
          firma_lider_fecha: '2026-09-01T00:00:00Z',
          reabierto_motivo: null,
        },
        error: null,
      },
    })
    const result = await loadGrupoReporte(client, 'g-1')
    expect(result).toEqual({
      id: 'r-1',
      estado: 'enviado',
      observacionesGenerales: 'Todo bien.',
      firmaLiderFecha: '2026-09-01T00:00:00Z',
      reabiertoMotivo: null,
    })
  })

  it('returns null when there is no reporte yet (or RLS hides it)', async () => {
    const { client } = buildChainClientMock({
      taller_reportes: { data: null, error: null },
    })
    expect(await loadGrupoReporte(client, 'g-1')).toBeNull()
  })
})

// ─── loadGrupoInscripciones ("su gente" real, T2 of inscripcion-a-grupo) ──

describe('loadGrupoInscripciones', () => {
  it('splits aprobadas and retiradas, resolving names via the RPC, and excludes other estados', async () => {
    const { client } = buildAsistenciaClientMock(
      [
        { id: 'i-1', persona_principal_id: 'p-1', companero_id: null, estado: 'aprobado' },
        { id: 'i-2', persona_principal_id: 'p-2', companero_id: null, estado: 'retirado' },
        { id: 'i-3', persona_principal_id: 'p-3', companero_id: null, estado: 'pendiente' },
      ],
      [
        { inscripcion_id: 'i-1', pp_nombre: 'Ana', pp_apellido: 'Gómez' },
        { inscripcion_id: 'i-2', pp_nombre: 'Luis', pp_apellido: 'Ruiz' },
        { inscripcion_id: 'i-3', pp_nombre: 'Sin', pp_apellido: 'Aprobar' },
      ],
    )
    const result = await loadGrupoInscripciones(client, 'g-1')
    expect(result.aprobadas).toEqual([{ id: 'i-1', personaId: 'p-1', nombre: 'Ana Gómez' }])
    expect(result.retiradas).toEqual([{ id: 'i-2', personaId: 'p-2', nombre: 'Luis Ruiz' }])
  })

  it('degrades a missing name to — instead of dropping the row (T6b rule)', async () => {
    const { client } = buildAsistenciaClientMock(
      [{ id: 'i-1', persona_principal_id: 'p-1', companero_id: null, estado: 'aprobado' }],
      [],
    )
    const result = await loadGrupoInscripciones(client, 'g-1')
    expect(result.aprobadas).toEqual([{ id: 'i-1', personaId: 'p-1', nombre: '—' }])
  })

  it('returns empty lists on a query error', async () => {
    const { client } = buildAsistenciaClientMock(null, [])
    const result = await loadGrupoInscripciones(client, 'g-1')
    expect(result).toEqual({ aprobadas: [], retiradas: [] })
  })

  it('scopes the query to grupo_id', async () => {
    const eqCalls: Array<[string, unknown]> = []
    const from = jest.fn(() => {
      const b: Record<string, unknown> = {}
      b['select'] = jest.fn(() => b)
      b['eq'] = jest.fn((col: string, val: unknown) => {
        eqCalls.push([col, val])
        return b
      })
      b['order'] = jest.fn(() => Promise.resolve({ data: [], error: null }))
      return b
    })
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null })
    await loadGrupoInscripciones(
      { from, rpc } as unknown as Parameters<typeof loadGrupoInscripciones>[0],
      'g-42',
    )
    expect(eqCalls).toEqual([['grupo_id', 'g-42']])
  })
})

// ─── loadGruposDeCohorte (T3, the bulk-assign selector's option list) ───

describe('loadGruposDeCohorte', () => {
  it('lists grupos for a cohorte ordered by nombre', async () => {
    const { client } = buildListClientMock([
      { id: 'g-1', nombre: 'Grupo Alfa' },
      { id: 'g-2', nombre: 'Grupo Beta' },
    ])
    const result = await loadGruposDeCohorte(client, 'coh-1')
    expect(result).toEqual([
      { id: 'g-1', nombre: 'Grupo Alfa' },
      { id: 'g-2', nombre: 'Grupo Beta' },
    ])
  })

  it('scopes to cohorte_id', async () => {
    const { client, eqCalls } = buildListClientMock([])
    await loadGruposDeCohorte(client, 'coh-1')
    expect(eqCalls).toEqual([['cohorte_id', 'coh-1']])
  })

  it('returns [] on a query error', async () => {
    const { client } = buildListClientMock(null, { message: 'boom' })
    expect(await loadGruposDeCohorte(client, 'coh-1')).toEqual([])
  })
})
