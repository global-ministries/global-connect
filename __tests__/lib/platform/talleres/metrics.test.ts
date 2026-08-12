/**
 * PR12 — DT-048 — Talleres metrics tests + I-6 grep for API route safety.
 *
 * Pure unit tests using a fake SupabaseClient. The API route is exercised
 * via the same fake (the route only takes the client through to the
 * metrics functions).
 */

import {
  asistenciaPromedio,
  computeRate,
  finalizationRateByPeriodoGeneral,
  finalizationRateByTaller,
  inscripcionesActivas,
  noAprobadosPorMotivo,
} from '@/lib/platform/talleres/metrics'
import fs from 'node:fs'
import path from 'node:path'

// ── Fake supabase builder ──────────────────────────────────────────────
// Returns a minimal SupabaseClient-shaped fake whose `from(table).select(...)`
// chain resolves to the canned `data` for the matching table. Other tables
// return an empty array.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural-type fake; satisfies minimal SupabaseClient surface
function fakeClient(tables: Record<string, unknown[]>): any {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chained query builder mock
          const builder: any = {}
          builder.eq = () => builder
          builder.in = () => builder
          builder.gte = () => builder
          builder.lte = () => builder
          builder.order = () => builder
          builder.match = () => builder
          builder.then = (resolve: (r: { data: unknown[]; error: null }) => void) => {
            resolve({ data: tables[table] ?? [], error: null })
            return Promise.resolve()
          }
          return builder
        },
        insert() {
          throw new Error('insert not supported in this fake')
        },
        update() {
          throw new Error('update not supported in this fake')
        },
        delete() {
          throw new Error('delete not supported in this fake')
        },
      }
    },
    rpc(_name: string, _args: Record<string, unknown>) {
      return Promise.resolve({ data: null, error: { message: 'rpc not mocked' } })
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
  }
}

describe('computeRate (pure helper)', () => {
  it('returns 0 when total is 0 (avoids /0)', () => {
    expect(computeRate(0, 0)).toBe(0)
    expect(computeRate(5, 0)).toBe(0)
  })

  it('returns ratio in [0, 1] when total > 0', () => {
    expect(computeRate(5, 10)).toBe(0.5)
    expect(computeRate(10, 10)).toBe(1)
    expect(computeRate(0, 10)).toBe(0)
  })

  it('clamps negative completados to 0', () => {
    expect(computeRate(-1, 10)).toBe(0)
  })

  it('clamps completados > total to 1', () => {
    expect(computeRate(20, 10)).toBe(1)
  })
})

describe('finalizationRateByTaller', () => {
  it('counts only inscripciones with non-null unit_estado', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000001'
    const client = fakeClient({
      taller_inscripciones: [
        { id: 'i1', unit_estado: 'completado' },
        { id: 'i2', unit_estado: 'no_completado' },
        { id: 'i3', unit_estado: 'abandono' },
        { id: 'i4', unit_estado: null }, // pending: excluded from denominator
        { id: 'i5', unit_estado: null }, // pending: excluded from denominator
      ],
    })
    const result = await finalizationRateByTaller(client, tallerId)
    expect(result.completados).toBe(1)
    expect(result.totalConEstadoFinal).toBe(3)
    expect(result.rate).toBeCloseTo(1 / 3)
  })

  it('returns 0 rate when no inscripciones have completed', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000002'
    const client = fakeClient({
      taller_inscripciones: [
        { id: 'i1', unit_estado: null },
        { id: 'i2', unit_estado: 'abandono' }, // terminal but not "completado"
      ],
    })
    const result = await finalizationRateByTaller(client, tallerId)
    expect(result.completados).toBe(0)
    expect(result.totalConEstadoFinal).toBe(1)
    expect(result.rate).toBe(0)
  })
})

describe('finalizationRateByPeriodoGeneral', () => {
  it('aggregates inscriptions across the periodo', async () => {
    const periodoId = '00000000-0000-0000-0000-000000000010'
    const client = fakeClient({
      taller_inscripciones: [
        { id: 'i1', unit_estado: 'completado' },
        { id: 'i2', unit_estado: 'completado' },
        { id: 'i3', unit_estado: 'no_completado' },
        { id: 'i4', unit_estado: null },
      ],
    })
    const result = await finalizationRateByPeriodoGeneral(client, periodoId)
    expect(result.completados).toBe(2)
    expect(result.totalConEstadoFinal).toBe(3)
    expect(result.rate).toBeCloseTo(2 / 3)
  })
})

describe('inscripcionesActivas', () => {
  it('counts inscripciones with estado pendiente OR aprobado', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000020'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal fake; satisfies the count query chain
    const client: any = {
      from(table: string) {
        return {
          select(_cols: string, _opts: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chained query builder mock
            const builder: any = {}
            builder.eq = () => builder
            builder.in = () => builder
            builder.then = (resolve: (r: { data: unknown[]; count: number | null; error: null }) => void) => {
              if (table !== 'taller_inscripciones') {
                resolve({ data: [], count: 0, error: null })
                return Promise.resolve()
              }
              // The fake returns a single row to trigger count=1; the
              // route does not read this row, only the count.
              resolve({ data: [{ id: 'i1' }], count: 12, error: null })
              return Promise.resolve()
            }
            return builder
          },
        }
      },
    }
    const result = await inscripcionesActivas(client, tallerId)
    expect(result.activas).toBe(12)
  })

  it('returns 0 when no inscripciones match', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000021'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal fake; satisfies the count query chain
    const client: any = {
      from(_table: string) {
        return {
          select(_cols: string, _opts: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chained query builder mock
            const builder: any = {}
            builder.eq = () => builder
            builder.in = () => builder
            builder.then = (resolve: (r: { data: unknown[]; count: number | null; error: null }) => void) => {
              resolve({ data: [], count: 0, error: null })
              return Promise.resolve()
            }
            return builder
          },
        }
      },
    }
    const result = await inscripcionesActivas(client, tallerId)
    expect(result.activas).toBe(0)
  })
})

describe('asistenciaPromedio', () => {
  it('averages present rate per sesion, excluding empty sesiones', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000030'
    const client = fakeClient({
      taller_asistencias: [
        // sesion s1: 2 of 4 present
        { sesion_id: 's1', estado: 'presente' },
        { sesion_id: 's1', estado: 'presente' },
        { sesion_id: 's1', estado: 'ausente' },
        { sesion_id: 's1', estado: 'ausente' },
        // sesion s2: 1 of 2 present
        { sesion_id: 's2', estado: 'presente' },
        { sesion_id: 's2', estado: 'ausente' },
        // sesion s3 has no rows -> excluded
      ],
    })
    const result = await asistenciaPromedio(client, tallerId)
    // (0.5 + 0.5) / 2 = 0.5
    expect(result.promedio).toBeCloseTo(0.5)
  })

  it('returns 0 when no asistencia rows', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000031'
    const client = fakeClient({
      taller_asistencias: [],
    })
    const result = await asistenciaPromedio(client, tallerId)
    expect(result.promedio).toBe(0)
  })
})

describe('noAprobadosPorMotivo (internal — never exposed via API)', () => {
  it('groups motivos and sorts by count desc', async () => {
    const tallerId = '00000000-0000-0000-0000-000000000040'
    const client = fakeClient({
      taller_inscripciones: [
        { motivo_no_aprobado: 'No cumple requisitos' },
        { motivo_no_aprobado: 'No cumple requisitos' },
        { motivo_no_aprobado: 'Fuera de plazo' },
        { motivo_no_aprobado: null },
        { motivo_no_aprobado: '' },
      ],
    })
    const result = await noAprobadosPorMotivo(client, tallerId)
    // 'No cumple requisitos' x2, 'Fuera de plazo' x1, '(vacío)' x2 (null and '')
    const total = result.reduce((sum, e) => sum + e.count, 0)
    expect(total).toBe(5)
    expect(result[0]?.count).toBeGreaterThanOrEqual(result[1]?.count ?? 0)
  })
})

describe('I-6 additive invariant — metrics API route safety', () => {
  it('route file is READ-ONLY: never references DROP/DELETE/INSERT/UPDATE on talleres tables', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/talleres/metricas/route.ts'),
      'utf-8',
    )
    expect(route).not.toMatch(/\bDROP\b/)
    expect(route).not.toMatch(/\bDELETE\s+FROM\b/)
    expect(route).not.toMatch(/\bINSERT\s+INTO\s+taller_/i)
    expect(route).not.toMatch(/\bUPDATE\s+taller_/i)
  })

  it('metrics module is READ-ONLY: never imports createClient or writes', () => {
    const mod = fs.readFileSync(
      path.join(process.cwd(), 'lib/platform/talleres/metrics.ts'),
      'utf-8',
    )
    expect(mod).not.toMatch(/createClient/i)
    expect(mod).not.toMatch(/\bINSERT\s+INTO\b/)
    expect(mod).not.toMatch(/\bUPDATE\s+[a-z_]+\s+SET\b/)
    expect(mod).not.toMatch(/\bDELETE\s+FROM\b/)
  })

  it('noAprobadosPorMotivo is internal — API route does not import it', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/talleres/metricas/route.ts'),
      'utf-8',
    )
    // Check the actual `import { ... } from '...'` statement: only the
    // 3 exposed functions should be listed. noAprobadosPorMotivo MUST NOT appear.
    const importMatch = route.match(/import\s*\{([^}]+)\}\s*from\s+['"]@\/lib\/platform\/talleres\/metrics['"]/)
    const importedNames = importMatch
      ? (importMatch[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      : []
    expect(importedNames).toContain('finalizationRateByTaller')
    expect(importedNames).toContain('inscripcionesActivas')
    expect(importedNames).toContain('asistenciaPromedio')
    expect(importedNames).not.toContain('noAprobadosPorMotivo')
  })
})
