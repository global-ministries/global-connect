/**
 * The talleres migrations must be able to rebuild production.
 *
 * Three things had been applied to production by hand and were captured in no
 * migration file, so `supabase db reset` produced a database the app cannot
 * run against:
 *
 *  1. `talleres_crecimiento_metadata` was renamed to `taller_ediciones`
 *     (confessed, but never captured, in 20260817020000).
 *  2. The table-level grants for `authenticated` across the whole domain —
 *     20260813000004 is a placeholder that runs `SELECT 1;`.
 *  3. The removal of the `talleres_period_closer` cron job, which queries the
 *     renamed-away table and closes nothing.
 *
 * Two migration files also could not execute as written (a trailing comma
 * inside `jsonb_build_object`, an unbalanced parenthesis in a `DO` block),
 * which means the reset never even reached the end of the sequence.
 *
 * These tests read the migration files as text. They assert the repository
 * tells the truth about production; they assert nothing about behaviour.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const GHOST_TABLE = 'talleres_crecimiento_metadata'

const RENAME_MIGRATION = '20260813000005_talleres_captura_rename_taller_ediciones.sql'
const GRANTS_MIGRATION = '20260912140000_talleres_grants_authenticated_reales.sql'
const UNSCHEDULE_MIGRATION = '20260912140100_talleres_desprogramar_period_closer.sql'
const ABSTRACT_MIGRATION = '20260813000001_talleres_abstract.sql'
const CLOSER_MIGRATION = '20260811140000_talleres_period_closer.sql'

/** Privileges production actually grants `authenticated`, verified per table. */
const CRUD_TABLES = [
  'taller_asistencias',
  'taller_catalogo_etiquetas',
  'taller_certificados',
  'taller_ediciones',
  'taller_eventos',
  'taller_grupo_asignaciones',
  'taller_grupos',
  'taller_inscripciones',
  'taller_periodos_generales',
  'taller_reporte_correcciones',
  'taller_reportes',
  'taller_sesiones',
  'taller_solicitudes_retiro',
  'talleres_crecimiento_cohortes',
] as const

/** These four additionally carry REFERENCES, TRIGGER and TRUNCATE in prod. */
const FULL_TABLES = [
  'talleres',
  'talleres_role_capability_map',
  'talleres_temporada_talleres',
  'talleres_temporadas',
] as const

function read(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
}

/** Everything that is not a `--` comment line — i.e. what Postgres executes. */
function executable(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

describe('the hand-applied rename is captured in a migration', () => {
  it('the rename migration exists', () => {
    expect(migrationFiles()).toContain(RENAME_MIGRATION)
  })

  it('renames the table only when the old name exists and the new one does not', () => {
    const sql = executable(read(RENAME_MIGRATION))
    expect(sql).toMatch(/to_regclass\(\s*'public\.talleres_crecimiento_metadata'\s*\)/)
    expect(sql).toMatch(/to_regclass\(\s*'public\.taller_ediciones'\s*\)\s+is\s+null/i)
    expect(sql).toMatch(
      /alter\s+table\s+public\.talleres_crecimiento_metadata\s+rename\s+to\s+taller_ediciones/i,
    )
  })

  it('renames the shared updated_at function production renamed too', () => {
    const sql = executable(read(RENAME_MIGRATION))
    expect(sql).toMatch(
      /alter\s+function\s+public\.set_talleres_crecimiento_metadata_updated_at\(\)\s+rename\s+to\s+set_taller_ediciones_updated_at/i,
    )
  })

  it('sorts after every migration that still executes against the old name', () => {
    const files = migrationFiles()
    const lastGhostUser = files
      .filter((f) => f !== RENAME_MIGRATION)
      .filter((f) => executable(read(f)).includes(GHOST_TABLE))
      .sort()
      .pop()

    expect(lastGhostUser).toBeDefined()
    expect(lastGhostUser! < RENAME_MIGRATION).toBe(true)
  })

  it('sorts before every migration that executes against the new name', () => {
    const files = migrationFiles()
    const firstNewNameUser = files
      .filter((f) => f !== RENAME_MIGRATION)
      .filter((f) => /\btaller_ediciones\b/.test(executable(read(f))))
      .sort()
      .shift()

    expect(firstNewNameUser).toBeDefined()
    expect(RENAME_MIGRATION < firstNewNameUser!).toBe(true)
  })
})

describe('the hand-applied table grants are captured in a migration', () => {
  it('the grants migration exists', () => {
    expect(migrationFiles()).toContain(GRANTS_MIGRATION)
  })

  it.each(CRUD_TABLES)('grants select/insert/update/delete on %s', (table) => {
    const sql = executable(read(GRANTS_MIGRATION)).toLowerCase()
    expect(sql).toContain(
      `grant select, insert, update, delete on table public.${table} to authenticated;`,
    )
  })

  it.each(FULL_TABLES)('grants the seven privileges prod has on %s', (table) => {
    const sql = executable(read(GRANTS_MIGRATION)).toLowerCase()
    expect(sql).toContain(
      'grant select, insert, update, delete, references, trigger, truncate ' +
        `on table public.${table} to authenticated;`,
    )
  })

  it('never revokes from authenticated — that is what left the domain broken', () => {
    const sql = executable(read(GRANTS_MIGRATION))
    expect(sql).not.toMatch(/revoke[\s\S]*?\bauthenticated\b/i)
  })

  it('sorts after every table it grants on has been created', () => {
    const sqlByFile = new Map(
      migrationFiles().map((f) => [f, executable(read(f)).toLowerCase()] as const),
    )

    for (const table of [...CRUD_TABLES, ...FULL_TABLES]) {
      // taller_ediciones only ever exists under that name after the rename.
      const creates =
        table === 'taller_ediciones'
          ? [RENAME_MIGRATION]
          : [...sqlByFile.entries()]
              .filter(
                ([, sql]) =>
                  sql.includes(`create table if not exists public.${table} (`) ||
                  sql.includes(`create table public.${table} (`),
              )
              .map(([file]) => file)

      expect({ table, creates }).not.toMatchObject({ creates: [] })
      expect({ table, first: creates.sort()[0]! < GRANTS_MIGRATION }).toMatchObject({
        table,
        first: true,
      })
    }
  })
})

describe('the broken cron job is unscheduled by a migration', () => {
  it('the unschedule migration exists', () => {
    expect(migrationFiles()).toContain(UNSCHEDULE_MIGRATION)
  })

  it('unschedules talleres_period_closer through cron.unschedule', () => {
    const sql = executable(read(UNSCHEDULE_MIGRATION))
    expect(sql).toMatch(/cron\.unschedule/i)
    expect(sql).toContain('talleres_period_closer')
  })

  it('is a no-op when pg_cron or the job is absent', () => {
    const sql = executable(read(UNSCHEDULE_MIGRATION))
    expect(sql).toMatch(/pg_extension\s+where\s+extname\s*=\s*'pg_cron'/i)
    expect(sql).toMatch(/cron\.job\s+where\s+jobname\s*=\s*'talleres_period_closer'/i)
  })

  it('invents no closing logic — the real one was never written', () => {
    const sql = executable(read(UNSCHEDULE_MIGRATION))
    expect(sql).not.toMatch(/\bupdate\s+public\./i)
    expect(sql).not.toMatch(/cron\.schedule/i)
  })

  it('the period closer migration no longer schedules anything', () => {
    const sql = executable(read(CLOSER_MIGRATION))
    expect(sql).not.toMatch(/pg_cron\.schedule/i)
    expect(sql).not.toMatch(/cron\.schedule/i)
  })

  it('the period closer migration no longer names the ghost table', () => {
    expect(executable(read(CLOSER_MIGRATION))).not.toContain(GHOST_TABLE)
  })
})

describe('the two files that could not execute as written', () => {
  it('create_taller_abstract closes jsonb_build_object without a trailing comma', () => {
    const sql = read(ABSTRACT_MIGRATION)
    expect(sql).toMatch(/'estado',\s*v_taller\.estado\s*\n\s*\);/)
    expect(sql).not.toMatch(/v_taller\.estado,\s*\n\s*\);/)
  })

  it('create_taller_abstract declares the rowtype schema-qualified, as prod stores it', () => {
    expect(read(ABSTRACT_MIGRATION)).toMatch(/v_taller\s+public\.talleres%ROWTYPE;/)
  })

  it('no talleres migration leaves a comma before a closing parenthesis', () => {
    for (const file of migrationFiles().filter((f) => /taller/.test(f))) {
      const offenders = executable(read(file))
        .split('\n')
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter(({ line }) => /,$/.test(line))
      // A trailing comma is only a defect when the next executable line closes
      // the call, so pair each candidate with its successor.
      const lines = executable(read(file)).split('\n')
      for (const { number } of offenders) {
        const next = (lines[number] ?? '').trim()
        expect({ file, line: number, next }).not.toMatchObject({ next: expect.stringMatching(/^\);/) })
      }
    }
  })
})
