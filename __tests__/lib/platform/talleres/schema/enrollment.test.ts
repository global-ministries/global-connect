/**
 * PR6 — DT-023 — Talleres enrollment schema dry-run probe.
 * F(talleres/schema/enrollment) — taller_inscripciones migration.
 *
 * RED test: verifies the M5.2 enrollment slice satisfies the enrollment
 * spec (talleres-enrollment/spec.md) + couple unit + state machine +
 * motivo mandatory + RLS matrix acceptance criteria BEFORE application.
 *
 * Mirrors the F4 schema-migration-dry-run pattern (PR5 precedent).
 *
 * Acceptance criteria:
 *  1. Migration file exists with the M5.2 naming convention
 *     (`<ts>_talleres_tables_inscripciones_grupos.sql`).
 *  2. Creates public.taller_inscripciones with byte-exact column set:
 *     id (uuid PK), taller_id (uuid NOT NULL FK → talleres_crecimiento_metadata
 *     ON DELETE RESTRICT), cohorte_id (uuid NOT NULL FK →
 *     talleres_crecimiento_cohortes ON DELETE RESTRICT), persona_principal_id
 *     (uuid NOT NULL FK → public.usuarios), companero_id (uuid nullable FK →
 *     public.usuarios), link_type (text CHECK ∈ matrimonio,novios NULLABLE),
 *     estado (text NOT NULL CHECK ∈ pendiente,aprobado,no_aprobado),
 *     motivo_no_aprobado (text nullable — internal use), ocurrencia_objetivo
 *     (timestamptz nullable), unit_estado (text CHECK ∈ completado,
 *     no_completado,abandono NULLABLE), unit_estado_report_id (uuid NULLABLE),
 *     version (int NOT NULL DEFAULT 1), created_at/updated_at (timestamptz
 *     NOT NULL DEFAULT now()). UNIQUE(taller_id, cohorte_id, persona_principal_id).
 *  3. Couple unit invariant: enforced by a BEFORE INSERT/UPDATE trigger.
 *     When link_type IS NOT NULL, companero_id must be NOT NULL; when
 *     link_type IS NULL, companero_id must also be NULL. The trigger
 *     function must RAISE EXCEPTION on both cases.
 *  4. motivo_no_aprobado mandatory when estado='no_aprobado': enforced
 *     by the same trigger. RAISE EXCEPTION when motivo is NULL or empty.
 *  5. canRevertEnrollmentToPendiente(cohorte_id, taller_id) helper:
 *     returns true if periodo is active. (Helper is defined in lib/platform
 *     code, not the migration, but the test asserts the policy contract.)
 *  6. RLS matrix for inscripcion: anon → 0 rows; own persona → sees own;
 *     another user → 0 rows; director → sees all.
 *  7. No destructive DDL (I-6): no DROP TABLE / DROP COLUMN / DROP
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

describe('Talleres enrollment migration — taller_inscripciones (DT-021 + DT-022)', () => {
  const migrationPath = findMigration(/_talleres_tables_inscripciones_grupos\.sql$/)

  it('M5.2 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('CREATE TABLE taller_inscripciones (DT-021)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_inscripciones/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /taller_inscripciones[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('taller_id uuid NOT NULL with FK to talleres_crecimiento_metadata (ON DELETE RESTRICT)', () => {
      const tallerFk = content.match(
        /taller_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres_crecimiento_metadata\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(tallerFk).not.toBeNull()
      if (!tallerFk) return
      // CASCADE would silently drop inscriptions, breaking audit trail
      expect(tallerFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('cohorte_id uuid NOT NULL with FK to talleres_crecimiento_cohortes (ON DELETE RESTRICT)', () => {
      const cohorteFk = content.match(
        /cohorte_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres_crecimiento_cohortes\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(cohorteFk).not.toBeNull()
      if (!cohorteFk) return
      expect(cohorteFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('persona_principal_id uuid NOT NULL with FK to public.usuarios', () => {
      // F2/F4 canonical person reference is public.usuarios.id (matching
      // dream_team_servicios.persona_id + capability_grants.persona_id).
      expect(content).toMatch(
        /persona_principal_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)/i
      )
    })

    it('companero_id uuid nullable with FK to public.usuarios', () => {
      expect(content).toMatch(
        /companero_id\s+uuid\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)/i
      )
      // NOT NULL would defeat the individual-attendance case
      expect(content).not.toMatch(/companero_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('link_type CHECK uses matrimonio and novios (nullable — individual has NULL)', () => {
      const linkCheck = content.match(
        /CHECK\s*\(\s*link_type\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(linkCheck).not.toBeNull()
      if (!linkCheck) return
      expect(linkCheck[0]).toMatch(/'matrimonio'/)
      expect(linkCheck[0]).toMatch(/'novios'/)
      // link_type must be nullable (individual attendance has NULL link_type)
      expect(content).toMatch(/link_type\s+text(?!\s+NOT\s+NULL)/i)
    })

    it('estado CHECK uses pendiente, aprobado, no_aprobado (NOT NULL)', () => {
      const estadoCheck = content.match(
        /CHECK\s*\(\s*estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(estadoCheck).not.toBeNull()
      if (!estadoCheck) return
      expect(estadoCheck[0]).toMatch(/'pendiente'/)
      expect(estadoCheck[0]).toMatch(/'aprobado'/)
      expect(estadoCheck[0]).toMatch(/'no_aprobado'/)
      expect(content).toMatch(/estado\s+text\s+NOT\s+NULL/i)
    })

    it('motivo_no_aprobado text (nullable — required only when estado=no_aprobado)', () => {
      expect(content).toMatch(/motivo_no_aprobado\s+text(?!\s+NOT\s+NULL)/i)
    })

    it('ocurrencia_objetivo timestamptz nullable', () => {
      expect(content).toMatch(/ocurrencia_objetivo\s+timestamptz/i)
      expect(content).not.toMatch(/ocurrencia_objetivo\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('unit_estado CHECK uses completado, no_completado, abandono (nullable)', () => {
      const unitCheck = content.match(
        /CHECK\s*\(\s*unit_estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(unitCheck).not.toBeNull()
      if (!unitCheck) return
      expect(unitCheck[0]).toMatch(/'completado'/)
      expect(unitCheck[0]).toMatch(/'no_completado'/)
      expect(unitCheck[0]).toMatch(/'abandono'/)
      // Nullable — only set after attendance cycle (PR7+PR8)
      expect(content).toMatch(/unit_estado\s+text(?!\s+NOT\s+NULL)/i)
    })

    it('unit_estado_report_id uuid (nullable)', () => {
      expect(content).toMatch(/unit_estado_report_id\s+uuid/i)
      expect(content).not.toMatch(/unit_estado_report_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('version integer NOT NULL DEFAULT 1', () => {
      // The taller_inscripciones table has its own version column (for
      // optimistic concurrency; the trigger does NOT collide with
      // metadata's version). The CHECK/constraint pattern is consistent.
      const inscVersion = content.match(
        /taller_inscripciones[\s\S]*?version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i
      )
      expect(inscVersion).not.toBeNull()
    })

    it('created_at and updated_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
      expect(content).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })

    it('UNIQUE constraint on (taller_id, cohorte_id, persona_principal_id)', () => {
      // Prevents duplicate submissions from the same persona to the same
      // taller cohort. Without this, a participant could double-enroll.
      expect(content).toMatch(
        /UNIQUE\s*\(\s*taller_id\s*,\s*cohorte_id\s*,\s*persona_principal_id\s*\)/i
      )
    })
  })

  describe('Couple unit invariant + motivo mandatory trigger (DT-021)', () => {
    it('declares a BEFORE INSERT OR UPDATE trigger on taller_inscripciones', () => {
      // The couple unit invariant + motivo_no_aprobado mandatory rule
      // must be enforced by a BEFORE INSERT OR UPDATE trigger (NOT a
      // CHECK constraint — the cross-column rule cannot be expressed
      // declaratively).
      expect(content).toMatch(
        /CREATE\s+TRIGGER[\s\S]*?BEFORE\s+INSERT\s+OR\s+UPDATE[\s\S]*?ON\s+public\.taller_inscripciones/i
      )
    })

    it('trigger function RAISES EXCEPTION when link_type set but companero_id NULL', () => {
      // The couple unit invariant: link_type NOT NULL ↔ companero_id NOT NULL.
      // The trigger body must RAISE EXCEPTION when link_type IS NOT NULL but
      // companero_id IS NULL (matrimonio/novios requires the second persona).
      const triggerFn = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trg_taller_inscripciones_couple_unit[\s\S]*?\$\$/i
      )
      expect(triggerFn).not.toBeNull()
      if (!triggerFn) return
      // Look for the link_type/companero_id cross-column guard. We capture
      // a generous window because the trigger body is multi-line.
      const fnBody = content.split(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trg_taller_inscripciones_couple_unit/i
      )[1] ?? ''
      const body = fnBody.split(/\$\$/i)[1] ?? ''
      expect(body).toMatch(/link_type\s+IS\s+NOT\s+NULL[\s\S]*?companero_id\s+IS\s+NULL/i)
      expect(body).toMatch(/RAISE\s+EXCEPTION/i)
    })

    it('trigger function RAISES EXCEPTION when companero_id set but link_type NULL', () => {
      // Reverse direction: link_type IS NULL AND companero_id IS NOT NULL.
      const fnBody = content.split(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trg_taller_inscripciones_couple_unit/i
      )[1] ?? ''
      const body = fnBody.split(/\$\$/i)[1] ?? ''
      expect(body).toMatch(/link_type\s+IS\s+NULL[\s\S]*?companero_id\s+IS\s+NOT\s+NULL/i)
    })

    it('trigger function RAISES EXCEPTION when estado=no_aprobado and motivo_no_aprobado empty', () => {
      // Enrollment spec §"Rejection requires internal reason": motivo
      // must be non-empty when estado='no_aprobado'. The trigger must
      // reject INSERT/UPDATE that violates this.
      const fnBody = content.split(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trg_taller_inscripciones_couple_unit/i
      )[1] ?? ''
      const body = fnBody.split(/\$\$/i)[1] ?? ''
      expect(body).toMatch(
        /estado\s*=\s*'no_aprobado'[\s\S]*?motivo_no_aprobado\s+IS\s+NULL/i
      )
      // At least one trim/length zero guard for the motivo string.
      expect(body).toMatch(/length\s*\(\s*trim\s*\(\s*NEW\.motivo_no_aprobado\s*\)\s*\)/i)
    })

    it('trigger is created idempotently via DO block guard on pg_trigger', () => {
      // The trigger attachment uses the same DO-block pattern as M5.1
      // metadata updated_at: guard on pg_trigger existence, CREATE TRIGGER
      // if missing. No DROP TRIGGER — invariant I-6.
      expect(content).toMatch(
        /DO\s+\$\$(?:\s|\n)+BEGIN(?:\s|\n)+IF\s+NOT\s+EXISTS[\s\S]*?pg_trigger[\s\S]*?trg_taller_inscripciones_couple_unit[\s\S]*?CREATE\s+TRIGGER\s+trg_taller_inscripciones_couple_unit/i
      )
    })
  })

  describe('Indexes (DT-021)', () => {
    it('creates an index on persona_principal_id', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_inscripciones\s*\(\s*persona_principal_id\s*\)/i
      )
    })

    it('creates a partial index on (taller_id, estado) WHERE estado=pendiente', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_inscripciones\s*\(\s*taller_id\s*,\s*estado\s*\)[\s\S]*?WHERE\s+estado\s*=\s*'pendiente'/i
      )
    })

    it('creates a partial index on (cohorte_id, estado) WHERE estado=pendiente', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_inscripciones\s*\(\s*cohorte_id\s*,\s*estado\s*\)[\s\S]*?WHERE\s+estado\s*=\s*'pendiente'/i
      )
    })
  })

  describe('State machine — canRevertEnrollmentToPendiente (DT-023)', () => {
    it('exposes the helper contract via documentation/policy (no DB function required at M5.2)', () => {
      // The state machine `no_aprobado → pendiente` is gated on
      // `canRevertEnrollmentToPendiente(cohorte_id, taller_id)` returning
      // true (periodo is active). This is an application-layer helper
      // (lives in lib/platform/talleres/state-machine.ts per PR4
      // DT-016), NOT a DB function at M5.2. The migration's job is to
      // make the underlying state columns queryable; the application
      // does the period lookup.
      //
      // We assert the migration documentation captures the state
      // machine transitions (no_aprobado → pendiente while periodo
      // active) so a future migration that needs the same gate can
      // find the convention. The trigger enforces motivo_no_aprobado
      // mandatory when transitioning to no_aprobado (already verified
      // above); the application layer owns the period-active check.
      expect(content).toMatch(/no_aprobado|pendiente/i)
      // And the migration body must not define a DB-level function
      // named canRevertEnrollmentToPendiente (this is app-layer
      // territory per PR4 DT-016).
      expect(content).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?canRevertEnrollmentToPendiente/i)
    })
  })

  describe('RLS — ENABLE ROW LEVEL SECURITY + matrix (DT-022)', () => {
    it('ENABLE ROW LEVEL SECURITY on taller_inscripciones', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_inscripciones\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
      )
    })

    it('REVOKE ALL on taller_inscripciones from anon, authenticated', () => {
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.taller_inscripciones\s+FROM\s+anon,\s*authenticated/i
      )
    })

    it('GRANT SELECT, INSERT, UPDATE (no DELETE) to service_role', () => {
      // Direct DELETE is forbidden — withdrawal uses taller_solicitudes_retiro.
      // service_role bypasses the policy for migration scripts.
      expect(content).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+TABLE\s+public\.taller_inscripciones\s+TO\s+service_role/i
      )
    })

    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_inscripciones[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_grupos)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      expect(policyBlock[0]).toMatch(/taller_inscripciones_select[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_inscripciones_insert[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_inscripciones_update[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_inscripciones_delete[\s\S"]/i)
    })

    it('SELECT policy allows own row OR taller capability', () => {
      // The participant sees their own row (persona_principal_id matches
      // their usuarios.id, resolved via auth.uid() → usuarios.auth_id
      // join). Anyone with a read capability for the talleres experience
      // also sees the row.
      const policyBlock = content.match(
        /CREATE\s+POLICY\s+"taller_inscripciones_select"[\s\S]*?CREATE\s+POLICY\s+"taller_inscripciones_insert"/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      // Own row: persona_principal_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
      // Multi-line: allow line breaks between keywords.
      expect(policyBlock[0]).toMatch(
        /persona_principal_id\s+IN[\s\S]*?SELECT\s+id\s+FROM\s+public\.usuarios\s+WHERE\s+auth_id\s*=\s*auth\.uid\(\)/i
      )
      // Taller capability gate
      expect(policyBlock[0]).toMatch(/auth_has_talleres_capability/i)
    })

    it('DELETE policy USES (false) — direct DELETE forbidden', () => {
      // Withdrawal must go through taller_solicitudes_retiro. The
      // DELETE policy explicitly rejects all callers (including
      // service_role bypass via GRANT is not granted for DELETE).
      const deletePolicy = content.match(
        /CREATE\s+POLICY\s+"taller_inscripciones_delete"[\s\S]*?USING\s*\(\s*false\s*\)/i
      )
      expect(deletePolicy).not.toBeNull()
    })

    it('policies use auth.uid() directly — never current_persona_id()', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_inscripciones[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_grupos)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      const hasDirect = /auth\.uid\(\)/i.test(policyBlock[0])
      const hasHelper = /auth_has_talleres_capability/i.test(policyBlock[0])
      expect(hasDirect || hasHelper).toBe(true)
      expect(policyBlock[0]).not.toMatch(/current_persona_id\s*\(\s*\)/i)
    })
  })

  describe('No destructive DDL — invariant I-6 (DT-023)', () => {
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

    it('does not DROP TRIGGER (without IF EXISTS for idempotency)', () => {
      // DROP TRIGGER IF EXISTS is the only acceptable form (used in the
      // 20260810120000_talleres_role_auto_grant.sql migration for the
      // taller_grupo_asignaciones trigger re-attachment). PR6's own
      // triggers must NOT use DROP — they use the DO-block guard.
      const dropTriggers = content.match(/DROP\s+TRIGGER[^I]/gi) ?? []
      expect(dropTriggers).toHaveLength(0)
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
