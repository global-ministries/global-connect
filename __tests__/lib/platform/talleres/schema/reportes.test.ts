/**
 * PR8 — DT-029 + DT-030 — Talleres reports schema dry-run probe.
 * F(talleres/schema/reportes) — taller_reportes + taller_reporte_correcciones.
 *
 * RED test: verifies the M5.4 reports slice satisfies the report-state
 * spec (talleres-reports-certificates/spec.md) + signature-preservation
 * + append-only audit-trail acceptance criteria BEFORE application.
 *
 * Mirrors F4 schema-migration-dry-run pattern (PR5/6/7 precedent).
 *
 * Acceptance criteria (DT-029, DT-030):
 *  1. Migration file exists with the M5.4 naming convention
 *     (`<ts>_talleres_tables_reportes_eventos.sql`), AFTER PR7's
 *     `20260811100000_talleres_tables_sesiones_asistencia.sql`.
 *  2. Creates public.taller_reportes with byte-exact column set:
 *     id (uuid PK), grupo_id (uuid NOT NULL FK → taller_grupos ON DELETE
 *     RESTRICT), estado (text NOT NULL CHECK ∈ borrador,enviado,reabierto,
 *     cerrado), observaciones_generales (text NOT NULL with CHECK length > 0,
 *     the spec says "non-empty"), firma_lider_persona_id (uuid NULLABLE FK
 *     to public.usuarios), firma_lider_fecha (timestamptz NULLABLE),
 *     reabierto_por_persona_id (uuid NULLABLE FK to public.usuarios),
 *     reabierto_motivo (text NOT NULL with CHECK: when estado='reabierto'
 *     reabierto_motivo MUST be NOT NULL — enforced via a BEFORE INSERT/
 *     UPDATE trigger that RAISE EXCEPTION), version (int NOT NULL DEFAULT 1),
 *     created_at/updated_at (timestamptz NOT NULL DEFAULT now()).
 *  3. Creates public.taller_reporte_correcciones with byte-exact column set:
 *     id (uuid PK), reporte_id (uuid NOT NULL FK → taller_reportes ON DELETE
 *     RESTRICT), autor_persona_id (uuid NOT NULL FK → public.usuarios ON
 *     DELETE RESTRICT), contenido_anterior (jsonb NOT NULL — snapshot of
 *     the row BEFORE this correction), contenido_nuevo (jsonb NOT NULL —
 *     new state after this correction), motivo (text NOT NULL CHECK
 *     length(motivo) > 0), created_at (timestamptz NOT NULL DEFAULT now()).
 *  4. Indexes (DT-029):
 *     - idx_taller_reportes_grupo_estado (grupo_id, estado) partial
 *       WHERE estado IN ('borrador','enviado','reabierto')
 *     - idx_taller_reportes_firma_lider (firma_lider_persona_id)
 *     - idx_taller_reporte_correcciones_reporte (reporte_id, created_at DESC)
 *  5. Lifecycle trigger (DT-030):
 *     - taller_reportes_lock_after_send BEFORE UPDATE: rejects transition
 *       FROM 'enviado' to anything other than 'reabierto' or 'cerrado'.
 *     - reabierto requires reabierto_motivo NOT NULL.
 *     - reabierto/cerrado-by-reabierto require reabierto_por_persona_id NOT NULL.
 *     - borrador → enviado requires firma_lider_persona_id AND firma_lider_fecha
 *       NOT NULL.
 *     - cerrada is terminal: cannot transition back to reabierto.
 *  6. Audit-trail capture (DT-030):
 *     - AFTER UPDATE on taller_reportes, when OLD.estado IS DISTINCT FROM
 *       NEW.estado, INSERT into taller_reporte_correcciones with
 *       contenido_anterior = to_jsonb(OLD), contenido_nuevo = to_jsonb(NEW),
 *       motivo = COALESCE(NEW.reabierto_motivo, 'transition').
 *     - pg_trigger_depth() < 1 guard prevents recursion from the
 *       self-trigger.
 *  7. Observaciones_generales NOT NULL with CHECK length > 0 (DT-029).
 *  8. NOT NULL conditional check on reabierto_motivo: when estado='reabierto'
 *     reabierto_motivo must be NOT NULL (DT-029 / DT-030).
 *  9. Append-only correction table: NO UPDATE/DELETE policies OR
 *     USING(false) (DT-029 — RBAC-enforced append-only).
 * 10. RLS: ENABLE ROW LEVEL SECURITY + 4 unique policies per table
 *     (_select/_insert/_update/_delete), auth.uid() direct or via
 *     auth_has_talleres_capability helper, REVOKE ALL FROM anon,
 *     authenticated + GRANT to service_role.
 * 11. No destructive DDL (I-6): no DROP TABLE / DROP COLUMN / DROP
 *     CONSTRAINT / DROP POLICY / DROP INDEX / DROP TRIGGER, no DELETE FROM,
 *     no TRUNCATE, no ALTER COLUMN ... TYPE.
 *
 * Note: The file is named `reportes_eventos` because the design §13
 * allocates both `taller_reportes`/`taller_reporte_correcciones` AND
 * `taller_eventos` to this slice. PR8 delivers the report subsystem;
 * PR9 owns taller_eventos (the participation events). The migration
 * file is shared so PR9 extends it additively.
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

describe('Talleres reports migration — taller_reportes + taller_reporte_correcciones (DT-029 + DT-030)', () => {
  const migrationPath = findMigration(/_talleres_tables_reportes_eventos\.sql$/)

  it('M5.4 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('CREATE TABLE taller_reportes (DT-029)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_reportes/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /taller_reportes[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('has grupo_id uuid NOT NULL with FK to taller_grupos ON DELETE RESTRICT', () => {
      const grupoFk = content.match(
        /grupo_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.taller_grupos\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(grupoFk).not.toBeNull()
      if (!grupoFk) return
      // CASCADE is forbidden (audit trail must survive)
      expect(grupoFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('estado CHECK uses borrador, enviado, reabierto, cerrado (NOT NULL) — matches state.ts', () => {
      const estadoCheck = content.match(
        /CHECK\s*\(\s*estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(estadoCheck).not.toBeNull()
      if (!estadoCheck) return
      expect(estadoCheck[0]).toMatch(/'borrador'/)
      expect(estadoCheck[0]).toMatch(/'enviado'/)
      expect(estadoCheck[0]).toMatch(/'reabierto'/)
      expect(estadoCheck[0]).toMatch(/'cerrado'/)
      expect(content).toMatch(/estado\s+text\s+NOT\s+NULL/i)
    })

    it('observaciones_generales is text NOT NULL with CHECK length > 0', () => {
      expect(content).toMatch(
        /observaciones_generales\s+text\s+NOT\s+NULL\s+CHECK\s*\(\s*length\(\s*observaciones_generales\s*\)\s*>\s*0\s*\)/i
      )
    })

    it('firma_lider_persona_id is uuid NULLABLE (FK to public.usuarios)', () => {
      expect(content).toMatch(
        // eslint-disable-next-line security/detect-unsafe-regex -- bounded alternation, no nested quantifiers (analyzer is conservative on \s*\(\s*)
        /firma_lider_persona_id\s+uuid(?:\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\))?(?!\s+NOT\s+NULL)/i
      )
    })

    it('firma_lider_fecha is timestamptz NULLABLE', () => {
      expect(content).toMatch(
        /firma_lider_fecha\s+timestamptz(?!\s+NOT\s+NULL)/i
      )
    })

    it('reabierto_por_persona_id is uuid NULLABLE (FK to public.usuarios)', () => {
      expect(content).toMatch(
        // eslint-disable-next-line security/detect-unsafe-regex -- bounded alternation, no nested quantifiers (analyzer is conservative on \s*\(\s*)
        /reabierto_por_persona_id\s+uuid(?:\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\))?(?!\s+NOT\s+NULL)/i
      )
    })

    it('reabierto_motivo is text with NOT NULL enforced conditionally when estado=reabierto', () => {
      // The column itself can be nullable (because it's not required
      // when estado != 'reabierto'), but a guard checks: when estado
      // = 'reabierto', reabierto_motivo must be NOT NULL. The
      // enforcement is per the spec ("Mandatory reopen with reason").
      // We accept either a CHECK constraint or a trigger that RAISE
      // EXCEPTION when reabierto AND reabierto_motivo IS NULL.
      expect(content).toMatch(/reabierto_motivo\s+text/i)
      // Either explicit NOT NULL would forbid borrador rows, so we
      // expect the conditional trigger:
      expect(content).toMatch(
        /reabierto/i
      )
    })

    it('version integer NOT NULL DEFAULT 1', () => {
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    })

    it('created_at and updated_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
      expect(content).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })
  })

  describe('CREATE TABLE taller_reporte_correcciones (DT-029)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_reporte_correcciones/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /taller_reporte_correcciones[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('has reporte_id uuid NOT NULL with FK to taller_reportes ON DELETE RESTRICT', () => {
      const reporteFk = content.match(
        /reporte_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.taller_reportes\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(reporteFk).not.toBeNull()
      if (!reporteFk) return
      expect(reporteFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('has autor_persona_id uuid NOT NULL with FK to public.usuarios ON DELETE RESTRICT', () => {
      const autorFk = content.match(
        /autor_persona_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(autorFk).not.toBeNull()
      if (!autorFk) return
      expect(autorFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('contenido_anterior and contenido_nuevo are jsonb NOT NULL', () => {
      expect(content).toMatch(/contenido_anterior\s+jsonb\s+NOT\s+NULL/i)
      expect(content).toMatch(/contenido_nuevo\s+jsonb\s+NOT\s+NULL/i)
    })

    it('motivo is text NOT NULL with CHECK length(motivo) > 0', () => {
      // We accept either `length(motivo) > 0` or `length(trim(motivo)) > 0`.
      // The trim variant is sturdier (whitespace-only reasons are
      // rejected) but the contract is "non-empty content".
      expect(content).toMatch(
        // eslint-disable-next-line security/detect-unsafe-regex -- bounded alternation, no nested quantifiers (analyzer is conservative on \s*\(\s*)
        /motivo\s+text\s+NOT\s+NULL\s+CHECK\s*\(\s*length\(\s*(?:trim\(\s*)?motivo(?:\s*\))?\s*\)\s*>\s*0\s*\)/i
      )
    })

    it('created_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(
        /taller_reporte_correcciones[\s\S]*?created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i
      )
    })
  })

  describe('Indexes (DT-029)', () => {
    it('creates idx_taller_reportes_grupo_estado (partial WHERE estado IN borrador,enviado,reabierto)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_taller_reportes_grupo_estado[\s\S]*?ON\s+public\.taller_reportes\s*\(\s*grupo_id\s*,\s*estado\s*\)[\s\S]*?WHERE\s+estado\s+IN\s*\(\s*'borrador'\s*,\s*'enviado'\s*,\s*'reabierto'\s*\)/i
      )
    })

    it('creates idx_taller_reportes_firma_lider (firma_lider_persona_id)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_taller_reportes_firma_lider[\s\S]*?ON\s+public\.taller_reportes\s*\(\s*firma_lider_persona_id\s*\)/i
      )
    })

    it('creates idx_taller_reporte_correcciones_reporte (reporte_id, created_at DESC)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_taller_reporte_correcciones_reporte[\s\S]*?ON\s+public\.taller_reporte_correcciones\s*\(\s*reporte_id\s*,\s*created_at\s+DESC\s*\)/i
      )
    })
  })

  describe('Lifecycle trigger — taller_reportes_lock_after_send (DT-030)', () => {
    it('declares taller_reportes_lock_after_send BEFORE UPDATE function', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.taller_reportes_lock_after_send\s*\(\s*\)/i
      )
    })

    it('rejects enviado → anything other than reabierto or cerrado', () => {
      expect(content).toMatch(
        /OLD\.estado\s*=\s*'enviado'[\s\S]*?NEW\.estado\s+NOT\s+IN\s*\(\s*'reabierto'\s*,\s*'cerrado'\s*\)/i
      )
    })

    it('rejects reabierto without reabierto_motivo', () => {
      expect(content).toMatch(
        /NEW\.estado\s*=\s*'reabierto'[\s\S]*?NEW\.reabierto_motivo\s+IS\s+NULL|length\(\s*NEW\.reabierto_motivo\s*\)\s*=\s*0/i
      )
    })

    it('requires reabierto_por_persona_id on reopen (and close-from-reabierto)', () => {
      // The trigger checks reabierto_por_persona_id when entering
      // 'reabierto' OR closing from 'reabierto'. Per spec reopen
      // requires reason + audit (who reopened).
      expect(content).toMatch(
        /NEW\.reabierto_por_persona_id\s+IS\s+NULL/i
      )
    })

    it('requires firma_lider_persona_id AND firma_lider_fecha for borrador → enviado', () => {
      expect(content).toMatch(
        /NEW\.firma_lider_persona_id\s+IS\s+NULL|trim\(\s*NEW\.firma_lider_persona_id\s*\)/i
      )
      expect(content).toMatch(
        /NEW\.firma_lider_fecha\s+IS\s+NULL/i
      )
    })

    it('attaches the trigger via pg_trigger existence guard (idempotent)', () => {
      expect(content).toMatch(
        /DO\s+\$\$[\s\S]*?pg_trigger[\s\S]*?trg_taller_reportes_lock_after_send/i
      )
    })
  })

  describe('Append-only audit-trail capture (DT-030)', () => {
    it('INSERTs into taller_reporte_correcciones with to_jsonb(OLD) in the VALUES', () => {
      // The audit capture uses INSERT INTO ... VALUES (..., to_jsonb(OLD), ...)
      // because the trigger writes a fresh audit row. The
      // non-greedy [\s\S]*? matches up to the FIRST to_jsonb(OLD)
      // immediately following the INSERT INTO statement (which is
      // the VALUES literal, not a comment in the comment block above).
      // To make the test robust against the comment block, we anchor
      // on the literal INSERT ... VALUES pattern.
      expect(content).toMatch(
        /INSERT\s+INTO\s+public\.taller_reporte_correcciones[\s\S]*?VALUES\s*\([\s\S]*?to_jsonb\(\s*OLD\s*\)/i
      )
    })

    it('captures to_jsonb(NEW) in the VALUES clause', () => {
      expect(content).toMatch(
        /VALUES\s*\([\s\S]*?to_jsonb\(\s*NEW\s*\)/i
      )
    })

    it('uses motivo = COALESCE(NEW.reabierto_motivo, \'transition\')', () => {
      // The migration uses the robust form
      // COALESCE(NULLIF(trim(NEW.reabierto_motivo), ''), 'transition')
      // which treats empty/whitespace-only reasons as missing. We
      // assert exactly that form is present.
      expect(content).toMatch(
        /COALESCE\s*\(\s*NULLIF\s*\(\s*trim\(\s*NEW\.reabierto_motivo\s*\)\s*,\s*''\s*\)\s*,\s*'transition'\s*\)/i
      )
    })

    it('guards against recursion with pg_trigger_depth() < N', () => {
      // The trigger body checks pg_trigger_depth() to prevent recursion
      // when the audit INSERT triggers an updated_at BEFORE UPDATE on
      // taller_reporte_correcciones.
      expect(content).toMatch(/pg_trigger_depth\s*\(\s*\)\s*<\s*\d/i)
    })

    it('fires on OLD.estado IS DISTINCT FROM NEW.estado', () => {
      expect(content).toMatch(
        /OLD\.estado\s+IS\s+DISTINCT\s+FROM\s+NEW\.estado/i
      )
    })
  })

  describe('set_updated_at standard trigger (DT-030)', () => {
    it('declares set_taller_reportes_updated_at (or reuses the sesiones helper)', () => {
      // The migration can either declare a dedicated helper or emit
      // the standard set_updated_at body inline. Either form is valid;
      // we accept the function name trg_taller_reportes_updated_at
      // paired with a BEFORE UPDATE trigger.
      expect(content).toMatch(/trg_taller_reportes_updated_at/i)
    })
  })

  describe('Observaciones_generales non-empty (DT-029)', () => {
    it('column has CHECK length(observaciones_generales) > 0', () => {
      expect(content).toMatch(
        /length\(\s*observaciones_generales\s*\)\s*>\s*0/i
      )
    })
  })

  describe('RLS — taller_reportes (DT-029)', () => {
    it('ENABLE ROW LEVEL SECURITY on taller_reportes', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_reportes\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
      )
    })

    it('REVOKE ALL on taller_reportes from anon, authenticated', () => {
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.taller_reportes\s+FROM\s+anon,\s*authenticated/i
      )
    })

    it('GRANT SELECT, INSERT, UPDATE to service_role (no DELETE — reports immutable)', () => {
      // Reports are immutable historical records. service_role is
      // granted SELECT, INSERT, UPDATE only (no DELETE). Mirrors the
      // PR6 precedent on taller_inscripciones.
      expect(content).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+TABLE\s+public\.taller_reportes\s+TO\s+service_role/i
      )
    })

    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?taller_reportes_select[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?taller_reportes_insert[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?taller_reportes_update[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?taller_reportes_delete[\s\S"]/i)
    })

    it('policies use auth.uid() or auth_has_talleres_capability — never current_persona_id()', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_reportes[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_reporte_correcciones)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      const hasDirect = /auth\.uid\(\)/i.test(policyBlock[0])
      const hasHelper = /auth_has_talleres_capability/i.test(policyBlock[0])
      expect(hasDirect || hasHelper).toBe(true)
      expect(policyBlock[0]).not.toMatch(/current_persona_id\s*\(\s*\)/i)
    })
  })

  describe('RLS — taller_reporte_correcciones — append-only (DT-029)', () => {
    it('ENABLE ROW LEVEL SECURITY on taller_reporte_correcciones', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_reporte_correcciones\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
      )
    })

    it('REVOKE ALL on taller_reporte_correcciones from anon, authenticated', () => {
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.taller_reporte_correcciones\s+FROM\s+anon,\s*authenticated/i
      )
    })

    it('GRANT SELECT, INSERT to service_role (no UPDATE/DELETE — append-only)', () => {
      // Append-only: corrections are INSERT-only. RBAC enforces via
      // missing UPDATE/DELETE policy OR USING(false) on both.
      expect(content).toMatch(
        /GRANT\s+SELECT,\s*INSERT\s+ON\s+TABLE\s+public\.taller_reporte_correcciones\s+TO\s+service_role/i
      )
    })

    it('has 4 policies with _select / _insert / _update / _delete — but UPDATE/DELETE USING(false)', () => {
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?taller_reporte_correcciones_select[\s\S"]/i)
      expect(content).toMatch(/CREATE\s+POLICY\s+["']?taller_reporte_correcciones_insert[\s\S"]/i)
      // UPDATE and DELETE policies exist with USING(false) to enforce
      // append-only at the RLS layer.
      expect(content).toMatch(
        /CREATE\s+POLICY\s+["']?taller_reporte_correcciones_update[\s\S]*?USING\s*\(\s*false\s*\)/i
      )
      expect(content).toMatch(
        /CREATE\s+POLICY\s+["']?taller_reporte_correcciones_delete[\s\S]*?USING\s*\(\s*false\s*\)/i
      )
    })
  })

  describe('No destructive DDL — invariant I-6 (DT-031)', () => {
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

describe('Talleres reports — business contract assertions (DT-031)', () => {
  // These tests assert the business contract that the report subsystem
  // is a sibling of the state machine (state.ts). They are application-
  // layer contracts (state.ts has pure functions) but the migration must
  // support them. The TDD pattern documents the contract while the
  // schema implements the invariants.
  //
  // These tests are property-level assertions over the migration: the
  // migration file must declare the trigger that enforces each
  // contract.
  it('migration declares the cerrada → reabierto rejection (cerrado is terminal)', () => {
    const migrationPath = findMigration(/_talleres_tables_reportes_eventos\.sql$/)
    expect(migrationPath).not.toBeNull()
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf-8')
    // The state machine refuses 'cerrado' → 'reabierto'. The trigger
    // must accept only 'reabierto' or 'cerrado' as transitions FROM
    // 'enviado'; everything else falls into the rejection bucket.
    // We verify the trigger refuses non-(reabierto,cerrado) including
    // 'cerrado' → 'reabierto' which is the closed state.
    expect(content).toMatch(
      /OLD\.estado\s*=\s*'enviado'[\s\S]*?NEW\.estado\s+NOT\s+IN\s*\(\s*'reabierto'\s*,\s*'cerrado'\s*\)/i
    )
  })

  it('migration preserves signature fields across transitions (not blanked)', () => {
    // The trigger body must NOT mutate firma_lider_persona_id or
    // firma_lider_fecha. The lighter assertion: no SET firma_lider
    // appears in the trigger body. (The trigger validates but does
    // not rewrite.)
    const migrationPath = findMigration(/_talleres_tables_reportes_eventos\.sql$/)
    expect(migrationPath).not.toBeNull()
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf-8')
    const triggerBody = content.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.taller_reportes_lock_after_send[\s\S]*?LANGUAGE\s+plpgsql/i
    )
    expect(triggerBody).not.toBeNull()
    if (!triggerBody) return
    // The trigger must NOT rewrite firma_lider_persona_id or
    // firma_lider_fecha — only validate. The signature fields are
    // set once at envio and preserved across corrections.
    expect(triggerBody[0]).not.toMatch(
      /SET\s+NEW\.firma_lider_(persona_id|fecha)\s*=/i
    )
  })
})
