/**
 * @jest-environment node
 *
 * PR40 — Regression guard for the cohorte / periodo lookup contract in
 * `loadParticipanteExplorar`.
 *
 * ## Background
 *
 * `loadParticipanteExplorar` runs 4 parallel queries:
 *
 *   1. `taller_ediciones`             — select open ediciones + embed the
 *                                       abstract taller (1:1 via taller_id).
 *   2. `talleres_crecimiento_cohortes` — batch fetch keyed by taller_id IN
 *                                       (edicion_ids). Each row's
 *                                       `taller_id` is the EDICION id,
 *                                       because the FK is
 *                                       `talleres_crecimiento_cohortes.taller_id
 *                                       REFERENCES taller_ediciones(id)`.
 *   3. `taller_periodos_generales`    — same shape as query 2. Each row's
 *                                       `taller_id` is the EDICION id.
 *   4. `taller_inscripciones`         — `taller_id` is the EDICION id
 *                                       (same FK direction as 2 + 3).
 *
 * The TS code builds three lookup tables:
 *
 *   - `cohorteByEdicion`  keyed by edicion_id (= row.taller_id from q2)
 *   - `periodoByEdicion`  keyed by edicion_id (= row.taller_id from q3)
 *   - `inscritosIds`      keyed by edicion_id (= row.taller_id from q4)
 *
 * The final `ediciones.map(...)` step looks up each row's edicion_id
 * (`row.id`) against those three Maps.
 *
 * PR40's contribution is **explicit test coverage** of that contract —
 * before PR38, the Map was indexed and looked up inconsistently, and the
 * symptom (a working card vs. a wrong cohorte_id) only surfaced when the
 * inscription action tried to use it. The tests below codify the correct
 * shape so future refactors can't silently regress it.
 *
 * Schema reference (verified against production):
 *   - `talleres_crecimiento_cohortes.taller_id` → `taller_ediciones.id`
 *   - `taller_periodos_generales.taller_id`    → `taller_ediciones.id`
 *   - `taller_inscripciones.taller_id`         → `taller_ediciones.id`
 *   - `taller_ediciones.taller_id`             → `talleres.id` (abstract)
 *
 * The `taller_id` column carries different meanings on different tables.
 * Tests must use the EDICION id (not the abstract taller id) when
 * seeding queries 2-4.
 */

import {
  loadParticipanteContext,
  loadParticipanteExplorar,
} from '@/lib/platform/talleres/participante'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const findPersonaByAuthIdMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).findPlatformSessionPersonaByAuthId as jest.Mock
const resolveSessionMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).resolveReadOnlyPlatformSession as jest.Mock

const PERSONA_ID = '00000000-0000-0000-0000-000000000001'

interface TableResponses {
  readonly [table: string]: { data: unknown; error: null }
}

function setupExplorarMock(
  tableResponses: TableResponses,
  personaId: string | null = PERSONA_ID
) {
  flagsMock.mockReset().mockReturnValue(true)
  findPersonaByAuthIdMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      personaId
        ? { id: personaId, authId: 'auth-1', globalRoles: [] }
        : null
    ),
  )
  resolveSessionMock.mockReset().mockResolvedValue(
    personaId
      ? {
          personaId,
          subjectAuthId: 'auth-1',
          globalRoles: [],
          contexts: [],
          capabilities: [
            {
              key: 'talleres_crecimiento.participation.read',
              experience: 'talleres_crecimiento',
              scopeType: 'taller',
              source: 'test',
            },
          ],
        }
      : null
  )

  // One thenable per table — each query has its own `then` closure so
  // the resolved response cannot leak across queries when fired in
  // parallel via Promise.all.
  const builderFor = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
    const b: Record<string, any> = {}
    b['select'] = jest.fn(() => b)
    b['eq'] = jest.fn(() => b)
    b['in'] = jest.fn(() => b)
    b['order'] = jest.fn(() => b)
    b['maybeSingle'] = jest.fn(() =>
      Promise.resolve({ data: null, error: null })
    )
    b['single'] = jest.fn(() =>
      Promise.resolve({ data: null, error: null })
    )
    b['then'] = (
      resolve: (r: { data: unknown; error: null }) => void
    ) =>
      Promise.resolve(
        tableResponses[table] ?? { data: [], error: null }
      ).then(resolve)
    return b
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'auth-1' } },
        error: null,
      }),
    },
    from: jest.fn((table: string) => builderFor(table)),
  })
}

async function loadExplorar(): Promise<readonly {
  id: string
  nombre: string
  slug: string
  edicion: string
  estado: string
  ya_inscrito: boolean
  cohorte_id: string | null
  modalidad: string | null
  descripcion: string | null
  fecha_apertura: string | null
  fecha_cierre: string | null
}[]> {
  const result = await loadParticipanteContext()
  if (!result.ok) throw new Error('expected ok:true')
  return loadParticipanteExplorar(result.context)
}

// ─── Contract: Map indexing + lookup by edicion id ─────────────────────────

describe('loadParticipanteExplorar — PR40 lookup contract', () => {
  it('returns the cohorte_id when the cohorte row has taller_id = edicion_id', async () => {
    // Query 1 returns 1 edicion. Query 2 returns a cohorte whose
    // `taller_id` is that EDICION's id (per FK contract). The lookup
    // table must index by edicion_id, and the final row must surface
    // the cohorte_id.
    const EDICION_ID = '00000000-0000-0000-0000-00000000ed01'
    const TALLER_ID = '00000000-0000-0000-0000-00000000ta11'
    const COHORTE_ID = '00000000-0000-0000-0000-00000000c001'

    const tableResponses: TableResponses = {
      taller_ediciones: {
        data: [
          {
            id: EDICION_ID,
            nombre_snapshot: 'Septiembre 2026',
            tipo: 'pareja',
            estado: 'abierto',
            taller_id: TALLER_ID,
            taller: {
              slug: 'matrimonio-sobre-la-roca',
              nombre: 'Matrimonio sobre la Roca',
              modalidad_default: 'periodo_general',
              descripcion: 'Un taller de prueba',
            },
          },
        ],
        error: null,
      },
      // The cohorte's taller_id IS the edicion id (FK direction).
      talleres_crecimiento_cohortes: {
        data: [{ id: COHORTE_ID, taller_id: EDICION_ID }],
        error: null,
      },
      taller_periodos_generales: { data: [], error: null },
      taller_inscripciones: { data: [], error: null },
    }
    setupExplorarMock(tableResponses)

    const rows = await loadExplorar()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(EDICION_ID)
    expect(rows[0]!.cohorte_id).toBe(COHORTE_ID)
  })

  it('returns null cohorte_id when no cohorte is associated to the edicion', async () => {
    // PR40 regression — if query 2 returns no rows, the lookup must
    // yield null (legacy row before PR37 backfill ran).
    const EDICION_ID = '00000000-0000-0000-0000-00000000ed02'
    const TALLER_ID = '00000000-0000-0000-0000-00000000ta12'

    const tableResponses: TableResponses = {
      taller_ediciones: {
        data: [
          {
            id: EDICION_ID,
            nombre_snapshot: 'Legacy edicion',
            tipo: 'individual',
            estado: 'abierto',
            taller_id: TALLER_ID,
            taller: {
              slug: 'legacy-taller',
              nombre: 'Legacy Taller',
              modalidad_default: 'permanente_custom',
              descripcion: null,
            },
          },
        ],
        error: null,
      },
      // No cohorte linked to the edicion — the legacy case.
      talleres_crecimiento_cohortes: { data: [], error: null },
      taller_periodos_generales: { data: [], error: null },
      taller_inscripciones: { data: [], error: null },
    }
    setupExplorarMock(tableResponses)

    const rows = await loadExplorar()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(EDICION_ID)
    expect(rows[0]!.cohorte_id).toBeNull()
  })

  it('returns the periodo dates when the periodo row has taller_id = edicion_id', async () => {
    // Mirror test for query 3 — periodo's taller_id is the EDICION id.
    const EDICION_ID = '00000000-0000-0000-0000-00000000ed03'
    const TALLER_ID = '00000000-0000-0000-0000-00000000ta13'
    const APERTURA = '2026-08-20T00:00:00Z'
    const CIERRE = '2026-09-30T23:59:59Z'

    const tableResponses: TableResponses = {
      taller_ediciones: {
        data: [
          {
            id: EDICION_ID,
            nombre_snapshot: 'Agosto 2026',
            tipo: 'pareja',
            estado: 'abierto',
            taller_id: TALLER_ID,
            taller: {
              slug: 'matrimonio-sobre-la-roca',
              nombre: 'Matrimonio sobre la Roca',
              modalidad_default: 'periodo_general',
              descripcion: 'Un taller de prueba',
            },
          },
        ],
        error: null,
      },
      talleres_crecimiento_cohortes: { data: [], error: null },
      // The periodo's taller_id IS the edicion id.
      taller_periodos_generales: {
        data: [
          {
            taller_id: EDICION_ID,
            fecha_apertura_automatica: APERTURA,
            fecha_cierre_automatico: CIERRE,
          },
        ],
        error: null,
      },
      taller_inscripciones: { data: [], error: null },
    }
    setupExplorarMock(tableResponses)

    const rows = await loadExplorar()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(EDICION_ID)
    expect(rows[0]!.fecha_apertura).toBe(APERTURA)
    expect(rows[0]!.fecha_cierre).toBe(CIERRE)
  })

  it('returns null fechas when no periodo is associated to the edicion', async () => {
    const EDICION_ID = '00000000-0000-0000-0000-00000000ed04'
    const TALLER_ID = '00000000-0000-0000-0000-00000000ta14'

    const tableResponses: TableResponses = {
      taller_ediciones: {
        data: [
          {
            id: EDICION_ID,
            nombre_snapshot: 'Sin periodo',
            tipo: 'individual',
            estado: 'abierto',
            taller_id: TALLER_ID,
            taller: {
              slug: 'permanente-taller',
              nombre: 'Permanente Taller',
              modalidad_default: 'permanente_custom',
              descripcion: null,
            },
          },
        ],
        error: null,
      },
      talleres_crecimiento_cohortes: { data: [], error: null },
      taller_periodos_generales: { data: [], error: null },
      taller_inscripciones: { data: [], error: null },
    }
    setupExplorarMock(tableResponses)

    const rows = await loadExplorar()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.fecha_apertura).toBeNull()
    expect(rows[0]!.fecha_cierre).toBeNull()
  })

  it('does NOT leak cohorte / periodo across distintos ediciones when multiple edicion ids exist', async () => {
    // If two ediciones have different cohortes + periodos, the Map
    // must NOT cross-contaminate — each edicion must look up only
    // its own cohorte_id and its own periodo dates.
    const ED1 = '00000000-0000-0000-0000-00000000ed05'
    const ED2 = '00000000-0000-0000-0000-00000000ed06'
    const T1 = '00000000-0000-0000-0000-00000000ta15'
    const T2 = '00000000-0000-0000-0000-00000000ta16'
    const COH1 = '00000000-0000-0000-0000-00000000c015'
    const COH2 = '00000000-0000-0000-0000-00000000c016'

    const tableResponses: TableResponses = {
      taller_ediciones: {
        data: [
          {
            id: ED1,
            nombre_snapshot: 'Septiembre 2026',
            tipo: 'pareja',
            estado: 'abierto',
            taller_id: T1,
            taller: {
              slug: 'matrimonio-sobre-la-roca',
              nombre: 'Matrimonio sobre la Roca',
              modalidad_default: 'periodo_general',
              descripcion: 'uno',
            },
          },
          {
            id: ED2,
            nombre_snapshot: 'Octubre 2026',
            tipo: 'individual',
            estado: 'en_curso',
            taller_id: T2,
            taller: {
              slug: 'discipulado',
              nombre: 'Discipulado',
              modalidad_default: 'permanente_custom',
              descripcion: 'dos',
            },
          },
        ],
        error: null,
      },
      talleres_crecimiento_cohortes: {
        data: [
          { id: COH1, taller_id: ED1 },
          { id: COH2, taller_id: ED2 },
        ],
        error: null,
      },
      taller_periodos_generales: {
        data: [
          {
            taller_id: ED1,
            fecha_apertura_automatica: '2026-09-01T00:00:00Z',
            fecha_cierre_automatico: '2026-09-30T23:59:59Z',
          },
          {
            taller_id: ED2,
            fecha_apertura_automatica: '2026-10-01T00:00:00Z',
            fecha_cierre_automatico: '2026-10-31T23:59:59Z',
          },
        ],
        error: null,
      },
      taller_inscripciones: { data: [], error: null },
    }
    setupExplorarMock(tableResponses)

    const rows = await loadExplorar()
    expect(rows).toHaveLength(2)
    const ed1 = rows.find((r) => r.id === ED1)
    const ed2 = rows.find((r) => r.id === ED2)
    expect(ed1).toBeDefined()
    expect(ed2).toBeDefined()
    expect(ed1!.cohorte_id).toBe(COH1)
    expect(ed2!.cohorte_id).toBe(COH2)
    expect(ed1!.fecha_apertura).toBe('2026-09-01T00:00:00Z')
    expect(ed2!.fecha_apertura).toBe('2026-10-01T00:00:00Z')
  })

  it('flags ya_inscrito when an inscripcion row exists for the edicion', async () => {
    // `taller_inscripciones.taller_id` is the EDICION id. The Set
    // must be populated from those taller_ids, and the per-row
    // membership check must use `row.id` (the edicion).
    const EDICION_ID = '00000000-0000-0000-0000-00000000ed07'
    const TALLER_ID = '00000000-0000-0000-0000-00000000ta17'

    const tableResponses: TableResponses = {
      taller_ediciones: {
        data: [
          {
            id: EDICION_ID,
            nombre_snapshot: 'Inscrito',
            tipo: 'pareja',
            estado: 'abierto',
            taller_id: TALLER_ID,
            taller: {
              slug: 'matrimonio-sobre-la-roca',
              nombre: 'Matrimonio sobre la Roca',
              modalidad_default: 'periodo_general',
              descripcion: null,
            },
          },
        ],
        error: null,
      },
      talleres_crecimiento_cohortes: { data: [], error: null },
      taller_periodos_generales: { data: [], error: null },
      taller_inscripciones: {
        data: [{ taller_id: EDICION_ID, estado: 'aprobado' }],
        error: null,
      },
    }
    setupExplorarMock(tableResponses)

    const rows = await loadExplorar()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ya_inscrito).toBe(true)
  })
})