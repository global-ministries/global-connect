/**
 * PR14 — DT-050 — CI grep guard: `app/(pastoral)/ruta/**` MUST NOT
 *                          access taller_* tables directly.
 *
 * Future Path modules consume talleres data only via
 * `lib/platform/talleres/route-integration.ts`. Direct table access is
 * a contract violation — Path modules may grow to depend on the raw
 * shape and break the moment we bump SCHEMA_VERSION.
 *
 * Detection: any file under `app/(pastoral)/ruta/**` that references
 * a `taller_*` table name (string literal in `.from('...')` or
 * `.rpc('...')`, or table identifier in raw SQL) trips the guard.
 *
 * If the ruta directory does not yet exist (PR18 is the deliverer),
 * the guard is a no-op pass — but it remains in place to enforce the
 * invariant once the directory is created.
 */

import fs from 'node:fs'
import path from 'node:path'

const RUTA_DIR = path.resolve(__dirname, '../../app/(pastoral)/ruta')

const FORBIDDEN_TABLES = [
  'talleres_crecimiento_metadata',
  'talleres_crecimiento_cohortes',
  'taller_inscripciones',
  'taller_grupos',
  'taller_grupo_asignaciones',
  'taller_catalogo_etiquetas',
  'taller_solicitudes_retiro',
  'taller_sesiones',
  'taller_asistencias',
  'taller_reportes',
  'taller_reporte_correcciones',
  'taller_eventos',
  'taller_certificados',
  'taller_periodos_generales',
] as const

/**
 * Yields absolute paths of all .ts/.tsx files under `dir`, recursively.
 * Returns an empty async generator if the directory does not exist.
 */
async function* walk(dir: string): AsyncGenerator<string> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      yield full
    }
  }
}

describe('CI guard — app/(pastoral)/ruta/** must not access taller_* tables', () => {
  it('directory present: every .ts/.tsx file avoids taller_* table names', async () => {
    const violations: Array<{ file: string; lines: number[] }> = []

    for await (const file of walk(RUTA_DIR)) {
      const content = fs.readFileSync(file, 'utf-8')
      const offenders = new Set<number>()
      for (const table of FORBIDDEN_TABLES) {
        // Match table name as a quoted string literal: ".from('taller_*')" or
        // ".rpc('taller_*')" or "FROM public.taller_*" or "taller_*\\.". We
        // also accept the table name as a bare identifier to flag SQL.
        const re = new RegExp(`['"\`]?${table.replace(/_/g, '_')}['"\`]?`, 'g')
        // Skip the file path that contains the table name (not the source).
        if (file.includes(`__tests__/invariants/${table}`)) continue
        const matches = content.match(re)
        if (!matches) continue
        // Map back to line numbers for the failure report.
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i] ?? '')) offenders.add(i + 1)
        }
      }
      if (offenders.size > 0) {
        violations.push({ file, lines: [...offenders].sort((a, b) => a - b) })
      }
    }

    if (violations.length === 0) {
      // No violations — directory may be empty (PR18 deliverable) or
      // all files use the route-integration contract.
      expect(violations.length).toBe(0)
      return
    }

    // eslint-disable-next-line no-console -- CI failure report
    console.error(
      `talleres route-integration guard: ${violations.length} file(s) violate the contract`,
    )
    for (const v of violations) {
      // eslint-disable-next-line no-console
      console.error(`  ${path.relative(process.cwd(), v.file)}:${v.lines.join(',')}`)
    }
    throw new Error(
      `talleres route-integration contract violated — Path modules must use lib/platform/talleres/route-integration`,
    )
  })

  it('directory absent: no-op pass (PR18 will create it)', async () => {
    const exists = fs.existsSync(RUTA_DIR)
    if (exists) return // first test already covered
    // eslint-disable-next-line no-console
    console.log(
      `talleres route-integration guard: app/(pastoral)/ruta not yet present (PR18 deliverable); skipping`,
    )
  })
})
