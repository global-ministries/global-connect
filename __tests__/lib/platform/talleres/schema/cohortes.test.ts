/**
 * PR5 — DT-020 — Talleres cohortes schema dry-run probe.
 * F(talleres/schema/cohortes) — talleres_crecimiento_cohortes migration.
 *
 * RED test: verifies the M5.1 migration satisfies the cohort contract.
 *
 * Acceptance criteria:
 *  1. Creates public.talleres_crecimiento_cohortes with byte-exact column set:
 *     id (uuid PK), taller_id (uuid FK to talleres_crecimiento_metadata,
 *     ON DELETE RESTRICT — default behaviour, preserves audit trail),
 *     dream_team_equipo_id (uuid FK to dream_team_equipos NOT NULL),
 *     edicion text NOT NULL, started_at timestamptz NULLABLE, ended_at
 *     timestamptz NULLABLE, version int NOT NULL DEFAULT 1, created_at and
 *     updated_at timestamptz NOT NULL DEFAULT now().
 *  2. ON DELETE behaviour on taller_id: RESTRICT (NOT CASCADE) so a deleted
 *     taller does not silently drop cohort history. This is the byte-
 *     identical F4 convention for metadata that should not be lost.
 *  3. Idempotent: CREATE TABLE IF NOT EXISTS.
 *  4. CREATE INDEX IF NOT EXISTS — at least an index on taller_id (parent
 *     lookup) and dream_team_equipo_id (scope lookup).
 *  5. F2 scope byte-identity invariant (DT-020): the cohort's
 *     dream_team_equipo_id references a row whose `experiencia` is
 *     `'talleres_crecimiento'`. The DB FK does not enforce experiencia
 *     (that's F2's contract), so this is a documentation/spec test that
 *     verifies a helper function or application-layer invariant exists.
 *     The helper `cohort_belongs_to_talleres_experience(cohort_id)` is
 *     implemented in the migration as a SQL function (STABLE, runs in
 *     <1ms) — verified by checking the migration declares the function
 *     body and matches the byte-identical signature.
 *  6. 1 director + N coordinadores per cohort: a cohort's dream_team_equipo
 *     can have multiple `dream_team_servicios` rows in the same equipo —
 *     one with rol='director' and N with rol='coordinador'. The migration
 *     must not impose a UNIQUE constraint on (dream_team_equipo_id, rol)
 *     for the cohort table itself (that constraint lives on
 *     dream_team_servicios in F2, not here). The cohort table just
 *     references the equipo — the equipo is the aggregation root.
 *  7. RLS: ENABLE ROW LEVEL SECURITY + 4 unique policies
 *     (_select / _insert / _update / _delete), auth.uid() direct, REVOKE
 *     ALL FROM anon, authenticated + GRANT to service_role.
 *  8. No destructive DDL (I-6): no DROP TABLE / DROP COLUMN / DROP
 *     CONSTRAINT / DROP POLICY / DROP INDEX / DROP TRIGGER, no DELETE FROM,
 *     no TRUNCATE, no ALTER COLUMN ... TYPE.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((f: string): boolean => f.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

describe('Talleres cohortes migration — talleres_crecimiento_cohortes (DT-017 + DT-020)', () => {
  const migrationPath = findMigration(/_talleres_tables_metadata_cohortes\.sql$/)

  it('M5.1 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('CREATE TABLE talleres_crecimiento_cohortes (DT-017)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.talleres_crecimiento_cohortes/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /talleres_crecimiento_cohortes[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('taller_id uuid NOT NULL with FK to talleres_crecimiento_metadata (ON DELETE RESTRICT)', () => {
      // taller_id FK; ON DELETE RESTRICT (or no clause — RESTRICT is the
      // default for FKs in postgres, but we accept either RESTRICT or
      // a missing ON DELETE since both forbid the deletion). CASCADE
      // would silently drop cohort history, which the design rejects
      // (audit trail must survive taller deletion).
      const tallerFk = content.match(
        /taller_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres_crecimiento_metadata\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(tallerFk).not.toBeNull()
      if (!tallerFk) return
      // CASCADE is forbidden
      expect(tallerFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('dream_team_equipo_id uuid NOT NULL with FK to dream_team_equipos', () => {
      expect(content).toMatch(
        /dream_team_equipo_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.dream_team_equipos\s*\(\s*id\s*\)/i
      )
    })

    it('edicion text NOT NULL', () => {
      expect(content).toMatch(/edicion\s+text\s+NOT\s+NULL/i)
    })

    it('started_at and ended_at are timestamptz (nullable — cohort lifecycle is in-flight)', () => {
      expect(content).toMatch(/started_at\s+timestamptz(?!\s+NOT\s+NULL)/i)
      expect(content).toMatch(/ended_at\s+timestamptz(?!\s+NOT\s+NULL)/i)
    })

    it('version integer NOT NULL DEFAULT 1', () => {
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    })

    it('created_at and updated_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
      expect(content).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })
  })

  describe('F2 scope byte-identity (DT-020)', () => {
    it('declares a helper function cohort_belongs_to_talleres_experience', () => {
      // The cohort's equipo must be a 'talleres_crecimiento' equipo.
      // The DB FK does not enforce experiencia (F2's contract), so we
      // expose a STABLE helper that joins to dream_team_equipos and
      // checks experiencia. The function is a thin SELECT, runs in <1ms.
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cohort_belongs_to_talleres_experience\s*\(\s*p_cohorte_id\s+uuid\s*\)/i
      )
      expect(content).toMatch(/cohort_belongs_to_talleres_experience[\s\S]*?LANGUAGE\s+sql/i)
      expect(content).toMatch(/cohort_belongs_to_talleres_experience[\s\S]*?STABLE/i)
    })

    it('helper resolves experiencia via the linked equipo', () => {
      // The function body must JOIN/SELECT to dream_team_equipos and
      // compare experiencia to 'talleres_crecimiento'. This is the
      // application-level enforcement of the F2 scope rule.
      const helperBlock = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cohort_belongs_to_talleres_experience[\s\S]*?GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cohort_belongs_to_talleres_experience/i
      )
      expect(helperBlock).not.toBeNull()
      if (!helperBlock) return
      expect(helperBlock[0]).toMatch(/dream_team_equipos/i)
      expect(helperBlock[0]).toMatch(/experiencia/i)
      expect(helperBlock[0]).toMatch(/'talleres_crecimiento'/i)
    })

    it('GRANT EXECUTE on cohort_belongs_to_talleres_experience to authenticated, service_role', () => {
      expect(content).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cohort_belongs_to_talleres_experience\s*\(\s*uuid\s*\)\s+TO\s+authenticated,\s*service_role/i
      )
    })
  })

  describe('1 director + N coordinadores per cohort (DT-020)', () => {
    it('cohortes table has no UNIQUE constraint on (dream_team_equipo_id, ...) that would limit member count', () => {
      // The cohort aggregates a dream_team_equipo. The equipo itself
      // is the cardinality root — a single equipo can have N servicios
      // (1 director + N coordinadores + N voluntarios). The cohort
      // table must NOT impose a UNIQUE on the equipo_id column (which
      // would be redundant since it's per-cohort anyway) nor a UNIQUE
      // on a (equipo_id, rol) combo (which would artificially cap the
      // number of coordinadores at 1).
      const cohorteTable = content.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.talleres_crecimiento_cohortes\s*\(([\s\S]*?)\);/i
      )
      expect(cohorteTable).not.toBeNull()
      if (!cohorteTable) return
      // No UNIQUE constraint on dream_team_equipo_id inside the cohort
      // table definition. (Dream_team_equipos itself has a UNIQUE on
      // its own PK, but that's a sibling table — irrelevant here.)
      expect(cohorteTable[1]).not.toMatch(
        // eslint-disable-next-line security/detect-unsafe-regex -- bounded alternation, no nested quantifiers (analyzer is conservative on \s*\(\s*)
        /UNIQUE\s*\(\s*dream_team_equipo_id\s*(?:,\s*[^)]+)?\s*\)/i
      )
    })
  })

  describe('CREATE INDEX IF NOT EXISTS (DT-017)', () => {
    it('creates an index on taller_id (parent lookup)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.talleres_crecimiento_cohortes\s*\(\s*taller_id\s*\)/i
      )
    })

    it('creates an index on dream_team_equipo_id (scope lookup)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.talleres_crecimiento_cohortes\s*\(\s*dream_team_equipo_id\s*\)/i
      )
    })
  })

  describe('RLS — ENABLE ROW LEVEL SECURITY (DT-018)', () => {
    it('ENABLE ROW LEVEL SECURITY on talleres_crecimiento_cohortes', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.talleres_crecimiento_cohortes\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
      )
    })

    it('REVOKE ALL on talleres_crecimiento_cohortes from anon, authenticated', () => {
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.talleres_crecimiento_cohortes\s+FROM\s+anon,\s*authenticated/i
      )
    })

    it('GRANT SELECT, INSERT, UPDATE, DELETE to service_role', () => {
      expect(content).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.talleres_crecimiento_cohortes\s+TO\s+service_role/i
      )
    })

    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?talleres_crecimiento_cohortes_select[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?talleres_crecimiento_cohortes_insert[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?talleres_crecimiento_cohortes_update[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?talleres_crecimiento_cohortes_delete[\s\S"]/i)
    })

    it('policies use auth.uid() (directly or via the auth_has_talleres_capability helper) — never current_persona_id()', () => {
      // Capture from the first CREATE POLICY on cohortes to the end of
      // the file (or the next ALTER TABLE on a different table).
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.talleres_crecimiento_cohortes[\s\S]*$/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      const hasDirect = /auth\.uid\(\)/i.test(policyBlock[0])
      const hasHelper = /auth_has_talleres_capability/i.test(policyBlock[0])
      expect(hasDirect || hasHelper).toBe(true)
      expect(policyBlock[0]).not.toMatch(/current_persona_id\s*\(\s*\)/i)
    })
  })

  describe('No destructive DDL — invariant I-6 (DT-020)', () => {
    it('does not DROP TABLE', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
    })

    it('does not DROP COLUMN', () => {
      expect(content).not.toMatch(/DROP\s+COLUMN/i)
    })

    it('does not DROP CONSTRAINT', () => {
      expect(content).not.toMatch(/DROP\s+CONSTRAINT/i)
    })

    it('does not DROP POLICY', () => {
      expect(content).not.toMatch(/DROP\s+POLICY/i)
    })

    it('does not DROP INDEX', () => {
      expect(content).not.toMatch(/DROP\s+INDEX/i)
    })

    it('does not DROP TRIGGER', () => {
      expect(content).not.toMatch(/DROP\s+TRIGGER/i)
    })

    it('does not DELETE FROM any table', () => {
      expect(content).not.toMatch(/DELETE\s+FROM/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })

    it('does not ALTER COLUMN ... TYPE', () => {
      expect(content).not.toMatch(/ALTER\s+COLUMN[\s\S]*?TYPE/i)
    })
  })
})
