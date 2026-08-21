/**
 * PR46 (restructure PR C) — open_edicion binds an edición to a Temporada.
 *
 * Static SQL-text assertions (mirrors pr37-cohorte.test.ts). Verifies the
 * migration ADDS a new 11-arg overload of public.open_edicion that accepts a
 * trailing p_temporada_id and:
 *   - writes temporada_id on the taller_ediciones INSERT, and
 *   - records the taller under the temporada via the junction
 *     (talleres_temporada_talleres) ON CONFLICT DO NOTHING.
 *
 * ⚠️ POSTGRES OVERLOAD SAFETY (LIVE PRODUCTION): the new param MUST be
 * REQUIRED (no DEFAULT). A `p_temporada_id uuid DEFAULT NULL` overload would
 * be callable with 10 args and collide with the existing 10-arg overload,
 * raising "function open_edicion(...) is not unique" — which would break the
 * production "abrir edición" flow that works today. So this test asserts:
 *   1. the signature ends in `p_temporada_id uuid` with NO DEFAULT, and
 *   2. the migration NEVER drops the existing 9-arg / 10-arg overloads
 *      (additive + forward-only).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((file: string): boolean => file.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) return join(MIGRATIONS_DIR, file)
  }
  return null
}

describe('PR46 migration — open_edicion binds edición to a Temporada', () => {
  const migrationPath = findMigration(/_pr46_open_edicion_temporada\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  // The one function this migration declares: the 11-arg overload
  // (extends the 10-arg with-p_tipo body with a trailing p_temporada_id).
  const fnBlock =
    sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\([\s\S]*?p_temporada_id[\s\S]*?END;\s*\$func\$;/i,
    )?.[0] ?? ''
  const fnSignature =
    sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(([\s\S]*?)\)\s*\n\s*RETURNS/i,
    )?.[1] ?? ''

  describe('New 11-arg overload signature', () => {
    it('extends the with-p_tipo overload (starts p_taller_id, p_tipo)', () => {
      expect(fnSignature).toMatch(/p_taller_id\s+uuid/i)
      expect(fnSignature).toMatch(/p_tipo\s+text/i)
    })

    it('adds a trailing p_temporada_id uuid parameter', () => {
      expect(fnSignature).toMatch(/p_temporada_id\s+uuid/i)
    })

    it('the new param is REQUIRED — NO DEFAULT (avoids "not unique" ambiguity)', () => {
      expect(fnSignature).not.toMatch(/p_temporada_id\s+uuid\s+DEFAULT/i)
    })

    it('stays SECURITY DEFINER with a fixed search_path', () => {
      expect(fnBlock).toMatch(/SECURITY\s+DEFINER/i)
      expect(fnBlock).toMatch(/SET\s+search_path\s*=\s*public/i)
    })

    it('re-checks director.write OR admin.manage (defense-in-depth)', () => {
      expect(fnBlock).toMatch(/auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i)
      expect(fnBlock).toMatch(/auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i)
    })
  })

  describe('Temporada binding', () => {
    it('writes temporada_id on the taller_ediciones INSERT', () => {
      expect(fnBlock).toMatch(
        /INSERT\s+INTO\s+public\.taller_ediciones[\s\S]*?temporada_id[\s\S]*?VALUES[\s\S]*?p_temporada_id/i,
      )
    })

    it('records the taller in the junction only when a temporada is given, ON CONFLICT DO NOTHING', () => {
      expect(fnBlock).toMatch(
        /IF\s+p_temporada_id\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?INSERT\s+INTO\s+public\.talleres_temporada_talleres[\s\S]*?ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i,
      )
    })
  })

  describe('Cohorte keying — taller_id stores the EDICIÓN PK (FK → taller_ediciones.id)', () => {
    // talleres_crecimiento_cohortes.taller_id is a FK to taller_ediciones(id)
    // (the edición PK), NOT the abstract talleres.id. The read path
    // (loadEdicionLocalDetalle), generate_taller_sesiones (PR47), and the PR37
    // backfill all resolve/write the cohorte by the edición PK. Both PKs are
    // independent gen_random_uuid(), and the FK is not DEFERRABLE, so inserting
    // the abstract p_taller_id here is a hard foreign_key_violation — the
    // cohorte insert MUST use v_edicion_id.
    const cohorteValues =
      fnBlock.match(
        /INSERT\s+INTO\s+public\.talleres_crecimiento_cohortes\s*\([\s\S]*?\)\s*VALUES\s*\(([\s\S]*?)\)\s*RETURNING/i,
      )?.[1] ?? ''

    it('inserts the cohorte with v_edicion_id (the edición PK) as taller_id', () => {
      expect(cohorteValues.trim()).toMatch(/^v_edicion_id\b/i)
    })

    it('never keys the cohorte by the abstract p_taller_id (would violate the FK)', () => {
      expect(cohorteValues).not.toMatch(/p_taller_id/i)
    })
  })

  describe('Grants', () => {
    it('grants EXECUTE on the 11-arg signature to authenticated', () => {
      const grants = [
        ...sqlOnly.matchAll(
          /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(([^)]*)\)\s+TO\s+authenticated/gi,
        ),
      ]
      expect(grants.map((grant) => grant[1].replace(/\s+/g, ' ').trim())).toEqual(
        expect.arrayContaining([
          'uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb, uuid',
        ]),
      )
    })

    it('revokes the 11-arg signature from PUBLIC and anon', () => {
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(\s*uuid,\s*text,\s*text,\s*text,\s*int,\s*int,\s*text,\s*timestamptz,\s*timestamptz,\s*jsonb,\s*uuid\s*\)\s+FROM\s+PUBLIC,\s*anon/i,
      )
    })
  })

  describe('Additive + forward-only — never breaks the existing overloads', () => {
    it('contains NO DROP FUNCTION (9-arg and 10-arg overloads stay intact)', () => {
      expect(sqlOnly).not.toMatch(/DROP\s+FUNCTION/i)
    })

    it('contains NO DROP TABLE / DROP COLUMN / TRUNCATE', () => {
      expect(sqlOnly).not.toMatch(/DROP\s+TABLE/i)
      expect(sqlOnly).not.toMatch(/DROP\s+COLUMN/i)
      expect(sqlOnly).not.toMatch(/TRUNCATE/i)
    })
  })
})
