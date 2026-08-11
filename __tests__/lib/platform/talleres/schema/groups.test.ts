/**
 * PR6 — DT-024 — Talleres groups schema dry-run probe.
 * F(talleres/schema/groups) — taller_grupos + taller_grupo_asignaciones +
 * taller_catalogo_etiquetas + taller_solicitudes_retiro migration.
 *
 * RED test: verifies the M5.2 groups slice satisfies the simultaneous-
 * groups + single-role-per-workshop + director-dual-role + withdrawal-
 * request acceptance criteria BEFORE application.
 *
 * Mirrors the F4 schema-migration-dry-run pattern (PR5 precedent).
 *
 * Acceptance criteria:
 *  1. Migration file exists with the M5.2 naming convention
 *     (`<ts>_talleres_tables_inscripciones_grupos.sql` — same file as
 *     DT-021, since the PR6 slice is a single M5.2 migration per design
 *     §13).
 *  2. taller_grupos table: id (uuid PK), cohorte_id (uuid NOT NULL FK →
 *     talleres_crecimiento_cohortes ON DELETE RESTRICT), nombre (text
 *     NOT NULL), estado (text NOT NULL CHECK ∈ activo,completado,cancelado),
 *     capacidad (integer NOT NULL CHECK > 0), recursos_snapshot (jsonb
 *     nullable), completed_at (timestamptz nullable), version (int NOT NULL
 *     DEFAULT 1), created_at/updated_at (timestamptz NOT NULL DEFAULT now()).
 *  3. Simultaneidad: N grupos can coexist for the same taller. The table
 *     has NO UNIQUE constraint on (cohorte_id, nombre) — the design
 *     allows same-named groups in different cohorts, and even within a
 *     cohort when a director renames a group. Indexes support the
 *     cohort-scoped lookup.
 *  4. Single-role-per-workshop: a persona cannot be assigned to two
 *     grupos of the same taller (would mean they're a leader in two
 *     different groups of the same taller — the design forbids this).
 *     Enforced at the application layer (PR15 API + state machine); the
 *     DB structure does not impose a UNIQUE because taller_id is not a
 *     direct FK (the FK chain is taller_grupos.cohorte_id →
 *     talleres_crecimiento_cohortes.taller_id). Test asserts the
 *     absence of an overly-broad UNIQUE.
 *  5. Director dual-role: same persona CAN be director (servicios) AND
 *     participant (inscripciones) in same taller. The migration must not
 *     add a cross-table FK constraint that would block this. Test asserts
 *     the absence of an inter-table FK.
 *  6. taller_grupo_asignaciones table: id (uuid PK), grupo_id (uuid NOT
 *     NULL FK → taller_grupos ON DELETE RESTRICT), persona_id (uuid NOT
 *     NULL FK → public.usuarios), rol (text NOT NULL CHECK ∈ lider,
 *     voluntario), activo (boolean NOT NULL DEFAULT true), started_at
 *     (timestamptz nullable), ended_at (timestamptz nullable), motivo_retiro
 *     (text nullable), approved_by_director_id (uuid nullable FK →
 *     public.usuarios ON DELETE SET NULL), version (int NOT NULL DEFAULT 1),
 *     created_at/updated_at (timestamptz NOT NULL DEFAULT now()).
 *  7. taller_catalogo_etiquetas table: taller_id (uuid NOT NULL FK →
 *     talleres_crecimiento_metadata ON DELETE CASCADE), etiqueta (text
 *     NOT NULL), created_at (timestamptz NOT NULL DEFAULT now()).
 *     PRIMARY KEY (taller_id, etiqueta).
 *  8. taller_solicitudes_retiro table: id (uuid PK), inscripcion_id (uuid
 *     nullable FK → taller_inscripciones ON DELETE CASCADE),
 *     grupo_asignacion_id (uuid nullable FK → taller_grupo_asignaciones
 *     ON DELETE CASCADE), solicitante_persona_id (uuid NOT NULL FK →
 *     public.usuarios), tipo (text NOT NULL CHECK ∈ participante_retiro,
 *     equipo_retiro_definitivo), motivo (text NOT NULL CHECK length(trim)>0),
 *     estado (text NOT NULL CHECK ∈ pendiente,aprobada,rechazada), version
 *     (int NOT NULL DEFAULT 1), created_at/updated_at (timestamptz NOT NULL
 *     DEFAULT now()). XOR CHECK: exactly one of (inscripcion_id,
 *     grupo_asignacion_id) must be set.
 *  9. Withdrawal request INSERT requires motivo NOT NULL: enforced by the
 *     column CHECK constraint (length(trim(motivo)) > 0).
 * 10. Solo director can INSERT solicitud approval: enforced by the RLS
 *     UPDATE policy (coordinator.write is NOT in the UPDATE gate).
 * 11. No destructive DDL (I-6): no DROP TABLE / DROP COLUMN / DROP
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

describe('Talleres groups migration — taller_grupos + taller_grupo_asignaciones + catalogo_etiquetas + solicitudes_retiro (DT-021 + DT-022)', () => {
  const migrationPath = findMigration(/_talleres_tables_inscripciones_grupos\.sql$/)

  it('M5.2 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('CREATE TABLE taller_grupos (DT-021)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_grupos/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /taller_grupos[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('cohorte_id uuid NOT NULL with FK to talleres_crecimiento_cohortes (ON DELETE RESTRICT)', () => {
      const cohorteFk = content.match(
        /taller_grupos[\s\S]*?cohorte_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres_crecimiento_cohortes\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(cohorteFk).not.toBeNull()
      if (!cohorteFk) return
      expect(cohorteFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('nombre text NOT NULL', () => {
      expect(content).toMatch(/nombre\s+text\s+NOT\s+NULL/i)
    })

    it('estado CHECK uses activo, completado, cancelado (NOT NULL)', () => {
      // Scope to taller_grupos table only — taller_inscripciones also has
      // an `estado` CHECK but with a different literal set. Anchor on
      // the `CREATE TABLE` line so we don't accidentally match the file
      // header comment that mentions the literal `'completado'`.
      const tallerGruposBlock = content.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_grupos[\s\S]*?\)\s*;(?:\s|\n)+/i
      )
      expect(tallerGruposBlock).not.toBeNull()
      if (!tallerGruposBlock) return
      const grupoEstadoCheck = tallerGruposBlock[0].match(
        /CHECK\s*\(\s*estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(grupoEstadoCheck).not.toBeNull()
      if (!grupoEstadoCheck) return
      expect(grupoEstadoCheck[0]).toMatch(/'activo'/)
      expect(grupoEstadoCheck[0]).toMatch(/'completado'/)
      expect(grupoEstadoCheck[0]).toMatch(/'cancelado'/)
      expect(tallerGruposBlock[0]).toMatch(/estado\s+text\s+NOT\s+NULL/i)
    })

    it('capacidad integer NOT NULL CHECK > 0', () => {
      // Capacity must be a positive integer (a group with 0 or negative
      // capacity is meaningless).
      expect(content).toMatch(/capacidad\s+integer\s+NOT\s+NULL\s+CHECK\s*\(\s*capacidad\s*>\s*0\s*\)/i)
    })

    it('recursos_snapshot jsonb nullable — R5 close-snapshot filled at completion', () => {
      // recursos_snapshot is NULL until the group transitions to
      // estado='completado' (PR7 trigger). The column must accept NULL.
      expect(content).toMatch(/recursos_snapshot\s+jsonb/i)
      expect(content).not.toMatch(/recursos_snapshot\s+jsonb\s+NOT\s+NULL/i)
    })

    it('completed_at timestamptz nullable', () => {
      expect(content).toMatch(/completed_at\s+timestamptz/i)
      expect(content).not.toMatch(/completed_at\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('version integer NOT NULL DEFAULT 1', () => {
      const gruposVersion = content.match(
        /taller_grupos[\s\S]*?version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i
      )
      expect(gruposVersion).not.toBeNull()
    })

    it('updated_at trigger attached (idempotent)', () => {
      expect(content).toMatch(
        /DO\s+\$\$(?:\s|\n)+BEGIN(?:\s|\n)+IF\s+NOT\s+EXISTS[\s\S]*?pg_trigger[\s\S]*?trg_taller_grupos_updated_at/i
      )
    })
  })

  describe('Simultaneidad — N grupos per taller (DT-024)', () => {
    it('does NOT impose UNIQUE constraint on (cohorte_id, nombre)', () => {
      // A cohort can have multiple grupos (each with its own leader and
      // participant set). Same name is allowed across cohorts; even
      // within a cohort a director may rename a group without the DB
      // blocking the duplicate name in another row.
      //
      // The migration must NOT declare a UNIQUE constraint on
      // (cohorte_id, nombre). We assert by negation: no UNIQUE clause
      // mentions the taller_grupos columns in that combination.
      const uniqueOnGrupo = content.match(
        /taller_grupos[\s\S]*?UNIQUE\s*\(\s*cohorte_id\s*,\s*nombre\s*\)/i
      )
      expect(uniqueOnGrupo).toBeNull()
    })

    it('creates an index on (cohorte_id) — supports the per-cohort list', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_grupos\s*\(\s*cohorte_id\s*\)/i
      )
    })

    it('creates a partial index on (cohorte_id) WHERE estado=activo', () => {
      // The operational UI lists active groups per cohort.
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_grupos\s*\(\s*cohorte_id\s*\)[\s\S]*?WHERE\s+estado\s*=\s*'activo'/i
      )
    })
  })

  describe('Single-role-per-workshop — no UNIQUE blocks two grupos (DT-024)', () => {
    it('taller_grupo_asignaciones table has no UNIQUE constraint on (grupo_id, persona_id, rol)', () => {
      // The design forbids the same persona being a leader in two
      // grupos of the same taller, but the FK chain
      // taller_grupo_asignaciones.grupo_id → taller_grupos.id (NOT
      // taller_id) means a UNIQUE(grupo_id, persona_id, rol) would only
      // prevent the same persona having two roles in the SAME grupo,
      // not in two different grupos of the same taller. The constraint
      // is therefore enforced at the application layer (PR15 API +
      // state machine), not the DB. We assert the absence of this
      // UNIQUE so future migrations don't accidentally introduce it.
      const uniqueOnAsign = content.match(
        /taller_grupo_asignaciones[\s\S]*?UNIQUE\s*\(\s*grupo_id\s*,\s*persona_id\s*,\s*rol\s*\)/i
      )
      expect(uniqueOnAsign).toBeNull()
    })
  })

  describe('Director dual-role — no cross-table FK (DT-024)', () => {
    it('taller_grupo_asignaciones does NOT FK to taller_inscripciones', () => {
      // The design explicitly allows a director to be a participant in
      // the same taller (the F2 dream_team_servicios row grants the
      // director capabilities; a separate taller_inscripciones row
      // grants the participation capability). The migration must NOT
      // add a cross-table FK that would block this dual-role.
      //
      // We slice the migration content by `CREATE TABLE` blocks and only
      // look at the taller_grupo_asignaciones block — comments elsewhere
      // can freely mention the other table name.
      const tallerGrupoAsigTable = content.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_grupo_asignaciones[\s\S]*?\)\s*;(?:\s|\n)+/i
      )
      expect(tallerGrupoAsigTable).not.toBeNull()
      if (!tallerGrupoAsigTable) return
      expect(tallerGrupoAsigTable[0]).not.toMatch(/REFERENCES\s+public\.taller_inscripciones/i)
    })

    it('taller_inscripciones does NOT FK to taller_grupo_asignaciones', () => {
      // Same rationale, reverse direction.
      const tallerInscTable = content.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_inscripciones[\s\S]*?\)\s*;(?:\s|\n)+/i
      )
      expect(tallerInscTable).not.toBeNull()
      if (!tallerInscTable) return
      expect(tallerInscTable[0]).not.toMatch(/REFERENCES\s+public\.taller_grupo_asignaciones/i)
    })
  })

  describe('CREATE TABLE taller_grupo_asignaciones (DT-021)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_grupo_asignaciones/i
      )
    })

    it('grupo_id uuid NOT NULL with FK to taller_grupos (ON DELETE RESTRICT)', () => {
      const grupoFk = content.match(
        /grupo_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.taller_grupos\s*\(\s*id\s*\)([^,]*)/i
      )
      expect(grupoFk).not.toBeNull()
      if (!grupoFk) return
      expect(grupoFk[1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('persona_id uuid NOT NULL with FK to public.usuarios', () => {
      expect(content).toMatch(
        /taller_grupo_asignaciones[\s\S]*?persona_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)/i
      )
    })

    it('rol CHECK uses lider and voluntario (NOT NULL)', () => {
      const rolCheck = content.match(
        /CHECK\s*\(\s*rol\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(rolCheck).not.toBeNull()
      if (!rolCheck) return
      expect(rolCheck[0]).toMatch(/'lider'/)
      expect(rolCheck[0]).toMatch(/'voluntario'/)
      expect(content).toMatch(/taller_grupo_asignaciones[\s\S]*?rol\s+text\s+NOT\s+NULL/i)
    })

    it('activo boolean NOT NULL DEFAULT true', () => {
      expect(content).toMatch(
        /activo\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i
      )
    })

    it('started_at / ended_at / motivo_retiro nullable', () => {
      // started_at is set on insert (the lifecycle starts at creation).
      // We assert the column declarations are present (regardless of
      // NOT NULL — the trigger will populate started_at if the column
      // is nullable, the application will populate it explicitly if
      // NOT NULL).
      expect(content).toMatch(/started_at\s+timestamptz/i)
      expect(content).toMatch(/ended_at\s+timestamptz/i)
      expect(content).toMatch(/ended_at\s+timestamptz(?!\s+NOT\s+NULL)/i)
      expect(content).toMatch(/motivo_retiro\s+text(?!\s+NOT\s+NULL)/i)
    })

    it('approved_by_director_id uuid nullable FK to public.usuarios (ON DELETE SET NULL)', () => {
      // The director's id who approved the assignment. SET NULL on
      // delete: if the approving director is removed from the system,
      // the assignment row survives (the audit trail records that it
      // happened, even if the approver is gone).
      const directorFk = content.match(
        // eslint-disable-next-line security/detect-unsafe-regex -- bounded alternation, no nested quantifiers
        /approved_by_director_id\s+uuid(?:\s+NULL)?\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i
      )
      expect(directorFk).not.toBeNull()
    })

    it('creates a partial index on (grupo_id) WHERE activo=true', () => {
      // The leader dashboard lists active assignments per group.
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_grupo_asignaciones\s*\(\s*grupo_id\s*\)[\s\S]*?WHERE\s+activo\s*=\s*true/i
      )
    })

    it('creates an index on (persona_id) — supports "show my assignments" view', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_grupo_asignaciones\s*\(\s*persona_id\s*\)/i
      )
    })
  })

  describe('CREATE TABLE taller_catalogo_etiquetas (DT-021)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_catalogo_etiquetas/i
      )
    })

    it('taller_id uuid NOT NULL with FK to talleres_crecimiento_metadata (ON DELETE CASCADE)', () => {
      // CASCADE: when a taller is deleted, its tags must go with it.
      // Tags are catalog presentation, not audit data. The ON DELETE
      // clause may be on a separate line, so we capture multi-line.
      const tallerFk = content.match(
        /taller_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres_crecimiento_metadata\s*\(\s*id\s*\)[\s\S]*?ON\s+DELETE\s+CASCADE/i
      )
      expect(tallerFk).not.toBeNull()
      if (!tallerFk) return
      expect(tallerFk[0]).toMatch(/ON\s+DELETE\s+CASCADE/i)
    })

    it('etiqueta text NOT NULL', () => {
      expect(content).toMatch(
        /taller_catalogo_etiquetas[\s\S]*?etiqueta\s+text\s+NOT\s+NULL/i
      )
    })

    it('PRIMARY KEY (taller_id, etiqueta) — prevents duplicate tags', () => {
      expect(content).toMatch(
        /PRIMARY\s+KEY\s*\(\s*taller_id\s*,\s*etiqueta\s*\)/i
      )
    })

    it('created_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })
  })

  describe('CREATE TABLE taller_solicitudes_retiro (DT-021)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_solicitudes_retiro/i
      )
    })

    it('inscripcion_id uuid nullable FK to taller_inscripciones (ON DELETE CASCADE)', () => {
      // CASCADE on the FK: when the underlying inscripcion is deleted
      // (which can only happen via withdrawal flow + director approval
      // in taller_solicitudes_retiro), the request row is removed with
      // it (no orphan requests).
      const inscripcionFk = content.match(
        /inscripcion_id\s+uuid\s+REFERENCES\s+public\.taller_inscripciones\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i
      )
      expect(inscripcionFk).not.toBeNull()
    })

    it('grupo_asignacion_id uuid nullable FK to taller_grupo_asignaciones (ON DELETE CASCADE)', () => {
      const grupoAsigFk = content.match(
        /grupo_asignacion_id\s+uuid\s+REFERENCES\s+public\.taller_grupo_asignaciones\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i
      )
      expect(grupoAsigFk).not.toBeNull()
    })

    it('solicitante_persona_id uuid NOT NULL with FK to public.usuarios', () => {
      expect(content).toMatch(
        /solicitante_persona_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)/i
      )
    })

    it('tipo CHECK uses participante_retiro and equipo_retiro_definitivo (NOT NULL)', () => {
      const tipoCheck = content.match(
        /CHECK\s*\(\s*tipo\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(tipoCheck).not.toBeNull()
      if (!tipoCheck) return
      expect(tipoCheck[0]).toMatch(/'participante_retiro'/)
      expect(tipoCheck[0]).toMatch(/'equipo_retiro_definitivo'/)
      expect(content).toMatch(
        /taller_solicitudes_retiro[\s\S]*?tipo\s+text\s+NOT\s+NULL/i
      )
    })

    it('motivo text NOT NULL CHECK length(trim(motivo)) > 0', () => {
      // The motivo MUST be non-empty (length > 0 after trimming
      // whitespace). A withdrawal request without a reason cannot be
      // reviewed — the DB rejects the INSERT.
      expect(content).toMatch(
        /motivo\s+text\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*trim\s*\(\s*motivo\s*\)\s*\)\s*>\s*0\s*\)/i
      )
    })

    it('estado CHECK uses pendiente, aprobada, rechazada (NOT NULL)', () => {
      // Scope to taller_solicitudes_retiro table block — the first
      // `estado IN (...)` CHECK in the file is taller_inscripciones.
      const solicitudesBlock = content.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_solicitudes_retiro[\s\S]*?\)\s*;(?:\s|\n)+/i
      )
      expect(solicitudesBlock).not.toBeNull()
      if (!solicitudesBlock) return
      const estadoCheck = solicitudesBlock[0].match(
        /CHECK\s*\(\s*estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(estadoCheck).not.toBeNull()
      if (!estadoCheck) return
      expect(estadoCheck[0]).toMatch(/'pendiente'/)
      expect(estadoCheck[0]).toMatch(/'aprobada'/)
      expect(estadoCheck[0]).toMatch(/'rechazada'/)
      expect(solicitudesBlock[0]).toMatch(/estado\s+text\s+NOT\s+NULL/i)
    })

    it('XOR CHECK: exactly one of (inscripcion_id, grupo_asignacion_id) must be set', () => {
      // The withdrawal request targets exactly one entity — an
      // inscripcion or a grupo_asignacion. The xor idiom uses `<>`:
      // when one side is NULL and the other is NOT NULL, the comparison
      // returns TRUE (rejected). When both are NULL or both are NOT
      // NULL, it returns FALSE (accepted — but the rest of the row is
      // broken anyway, so the cross-column constraint is the gate).
      expect(content).toMatch(
        /CHECK\s*\(\s*\(\s*inscripcion_id\s+IS\s+NULL\s*\)\s*<>\s*\(\s*grupo_asignacion_id\s+IS\s+NULL\s*\)\s*\)/i
      )
    })

    it('creates a partial index on (estado) WHERE estado=pendiente', () => {
      // The director/coordinator review queue lists pending requests.
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_solicitudes_retiro\s*\(\s*estado\s*\)[\s\S]*?WHERE\s+estado\s*=\s*'pendiente'/i
      )
    })
  })

  describe('RLS — taller_solicitudes_retiro (DT-022)', () => {
    it('UPDATE policy gates on director only — NOT coordinator.write', () => {
      // Solo director (or admin.manage) can change the request state
      // (approve/reject). coordinator.write is excluded from the
      // UPDATE gate. The participant cannot edit their own request
      // after filing.
      const updatePolicy = content.match(
        /CREATE\s+POLICY\s+"taller_solicitudes_retiro_update"[\s\S]*?USING\s*\([\s\S]*?\)\s+WITH\s+CHECK\s*\([\s\S]*?\)/i
      )
      expect(updatePolicy).not.toBeNull()
      if (!updatePolicy) return
      expect(updatePolicy[0]).toMatch(/director\.write|admin\.manage/i)
      // coordinator.write must NOT appear in the UPDATE policy body
      expect(updatePolicy[0]).not.toMatch(/coordinator\.write/i)
    })

    it('INSERT policy allows submitter (own row) OR director', () => {
      // A participant can submit their own withdrawal. A director can
      // also submit on behalf of someone. The policy must gate on
      // solicitante_persona_id matching the caller's usuarios.id.
      const insertPolicy = content.match(
        /CREATE\s+POLICY\s+"taller_solicitudes_retiro_insert"[\s\S]*?CREATE\s+POLICY\s+"taller_solicitudes_retiro_update"/i
      )
      expect(insertPolicy).not.toBeNull()
      if (!insertPolicy) return
      // The SQL has line breaks between the keywords; use [\s\S] for
      // multi-line matching.
      expect(insertPolicy[0]).toMatch(
        /solicitante_persona_id\s+IN[\s\S]*?SELECT\s+id\s+FROM\s+public\.usuarios\s+WHERE\s+auth_id\s*=\s*auth\.uid\(\)/i
      )
      expect(insertPolicy[0]).toMatch(/director\.write|admin\.manage/i)
    })

    it('DELETE policy USES (false) — withdrawal requests are immutable', () => {
      const deletePolicy = content.match(
        /CREATE\s+POLICY\s+"taller_solicitudes_retiro_delete"[\s\S]*?USING\s*\(\s*false\s*\)/i
      )
      expect(deletePolicy).not.toBeNull()
    })

    it('GRANT SELECT, INSERT, UPDATE (no DELETE) to service_role', () => {
      expect(content).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s+UPDATE\s+ON\s+TABLE\s+public\.taller_solicitudes_retiro\s+TO\s+service_role/i
      )
    })
  })

  describe('RLS — taller_grupos (DT-022)', () => {
    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_grupos[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_grupo_asignaciones)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      expect(policyBlock[0]).toMatch(/taller_grupos_select[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_grupos_insert[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_grupos_update[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_grupos_delete[\s\S"]/i)
    })

    it('policies use auth.uid() (directly or via auth_has_talleres_capability helper)', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_grupos[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_grupo_asignaciones)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      const hasDirect = /auth\.uid\(\)/i.test(policyBlock[0])
      const hasHelper = /auth_has_talleres_capability/i.test(policyBlock[0])
      expect(hasDirect || hasHelper).toBe(true)
      expect(policyBlock[0]).not.toMatch(/current_persona_id\s*\(\s*\)/i)
    })
  })

  describe('RLS — taller_grupo_asignaciones (DT-022)', () => {
    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_grupo_asignaciones[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_catalogo_etiquetas)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      expect(policyBlock[0]).toMatch(/taller_grupo_asignaciones_select[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_grupo_asignaciones_insert[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_grupo_asignaciones_update[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_grupo_asignaciones_delete[\s\S"]/i)
    })

    it('SELECT policy allows own assignment OR taller capability', () => {
      const policyBlock = content.match(
        /CREATE\s+POLICY\s+"taller_grupo_asignaciones_select"[\s\S]*?CREATE\s+POLICY\s+"taller_grupo_asignaciones_insert"/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      // Multi-line: allow line breaks between keywords.
      expect(policyBlock[0]).toMatch(
        /persona_id\s+IN[\s\S]*?SELECT\s+id\s+FROM\s+public\.usuarios\s+WHERE\s+auth_id\s*=\s*auth\.uid\(\)/i
      )
      expect(policyBlock[0]).toMatch(/auth_has_talleres_capability/i)
    })
  })

  describe('RLS — taller_catalogo_etiquetas (DT-022)', () => {
    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.taller_catalogo_etiquetas[\s\S]*?(?=ALTER\s+TABLE\s+public\.taller_solicitudes_retiro)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      expect(policyBlock[0]).toMatch(/taller_catalogo_etiquetas_select[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_catalogo_etiquetas_insert[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_catalogo_etiquetas_update[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/taller_catalogo_etiquetas_delete[\s\S"]/i)
    })
  })

  describe('No destructive DDL — invariant I-6 (DT-024)', () => {
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
