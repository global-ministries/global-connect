-- ════════════════════════════════════════════════════════════════════
-- PR6 — DT-021 / DT-022 — Talleres M5.2: inscripciones + grupos +
-- asignaciones + catalogo_etiquetas + solicitudes_retiro + RLS.
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-021: Five new tables in the enrollment + groups slice:
--   1. public.taller_inscripciones — single-row enrollment unit (couple or
--      individual). UNIQUE(taller_id, cohorte_id, persona_principal_id)
--      prevents duplicate submissions. Couple unit requires link_type ∈
--      {matrimonio,novios} AND companero_id IS NOT NULL — enforced by a
--      BEFORE INSERT/UPDATE trigger (the DB cannot enforce the NOT NULL
--      cross-column rule declaratively in a single CHECK). motivo_no_aprobado
--      is mandatory when estado='no_aprobado' (also trigger-enforced).
--   2. public.taller_grupos — cohort-scoped group of the taller.
--      recursos_snapshot jsonb holds the R5 snapshot taken when
--      estado='completado' (completed groups never receive further updates
--      on recursos_snapshot).
--   3. public.taller_grupo_asignaciones — leader/volunteer assignment.
--      `rol ∈ {lider, voluntario}` matches TallerGrupoAsignacionRol in
--      `lib/platform/talleres/types.ts:34`.
--   4. public.taller_catalogo_etiquetas — categorical tags attached to
--      a taller. PK (taller_id, etiqueta) prevents duplicates.
--      taller_id has ON DELETE CASCADE: when a taller is deleted its
--      tags must go with it (no orphan tags).
--   5. public.taller_solicitudes_retiro — withdrawal requests for both
--      participants and team members. Exactly one of (inscripcion_id,
--      grupo_asignacion_id) must be set (enforced by a CHECK using the
--      standard null-count idiom).
--
--   Indexes (all partial where the dominant read path is non-total):
--     inscripciones:
--       idx_taller_inscripciones_persona_principal_id
--       idx_taller_inscripciones_taller_estado       (partial, estado='pendiente')
--       idx_taller_inscripciones_cohorte_estado      (partial, estado='pendiente')
--     grupos:
--       idx_taller_grupos_cohorte_id
--       idx_taller_grupos_cohorte_estado_activo      (partial, estado='activo')
--     asignaciones:
--       idx_taller_grupo_asignaciones_grupo_activo   (partial, activo=true)
--       idx_taller_grupo_asignaciones_persona
--     solicitudes_retiro:
--       idx_taller_solicitudes_retiro_pendientes    (partial, estado='pendiente')
--
-- DT-022: RLS on all 5 tables — 4 unique policies per table with
-- _select / _insert / _update / _delete suffixes (or _no_update /
-- _no_delete for read-only / append-only patterns), direct `auth.uid()`,
-- REVOKE ALL FROM anon, authenticated, GRANT to service_role. The taller
-- inscriptions table is the operational write surface — coordinator/director
-- can insert/update; participants can SELECT their own; no direct DELETE
-- (use solicitudes_retiro).
--
-- Identity resolution (canonical, proven): grants store persona references
-- via `public.usuarios.id`, and the authenticated identity is resolved with
-- `usuarios.auth_id = auth.uid()`. This is the F2 dream_team + F4 pastoral
-- canonical pattern (proven by 20260725130000_pastoral_capability_helper_drift_fix.sql).
--
-- Idempotency: every CREATE / ALTER guarded by IF NOT EXISTS (where
-- supported by Postgres), and the trigger guards are wrapped in DO blocks
-- that check `pg_trigger` for prior existence (no DROP — invariant I-6).
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) taller_inscripciones                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Single-row enrollment unit (couple or individual). The UNIQUE triple
-- (taller_id, cohorte_id, persona_principal_id) prevents duplicate
-- submissions from the same persona to the same taller cohort. Couple
-- unit is enforced by a BEFORE INSERT/UPDATE trigger: when link_type
-- is set (matrimonio|novios), companero_id must also be set; when
-- link_type IS NULL (individual), companero_id must also be NULL.
--
-- motivo_no_aprobado: REQUIRED when estado='no_aprobado' (internal-use,
-- RLS-protected so participants cannot read it). The trigger rejects
-- any INSERT/UPDATE that leaves it NULL when transitioning to
-- estado='no_aprobado'.

CREATE TABLE IF NOT EXISTS public.taller_inscripciones (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id             uuid        NOT NULL
                                     REFERENCES public.talleres_crecimiento_metadata(id)
                                     ON DELETE RESTRICT,
  cohorte_id            uuid        NOT NULL
                                     REFERENCES public.talleres_crecimiento_cohortes(id)
                                     ON DELETE RESTRICT,
  -- persona_principal_id references public.usuarios.id — the canonical
  -- F2/F4 person reference (consistent with dream_team_servicios.persona_id
  -- and the capability grants pattern). NOT NULL: every inscription has
  -- exactly one primary persona.
  persona_principal_id  uuid        NOT NULL
                                     REFERENCES public.usuarios(id)
                                     ON DELETE RESTRICT,
  -- companero_id is NULL for individual workshops (link_type IS NULL);
  -- for couple workshops (link_type ∈ matrimonio,novios) it MUST be set —
  -- the trigger below enforces the cross-column rule.
  companero_id          uuid
                                     REFERENCES public.usuarios(id)
                                     ON DELETE RESTRICT,
  link_type             text        CHECK (link_type IN ('matrimonio','novios')),
  estado                text        NOT NULL
                                     CHECK (estado IN ('pendiente','aprobado','no_aprobado')),
  -- motivo_no_aprobado: required when estado='no_aprobado'; internal-use,
  -- RLS-protected so participants cannot read it. The trigger rejects
  -- any INSERT/UPDATE that leaves it NULL when transitioning to that
  -- estado.
  motivo_no_aprobado    text,
  ocurrencia_objetivo   timestamptz,
  unit_estado           text        CHECK (unit_estado IN ('completado','no_completado','abandono')),
  unit_estado_report_id uuid,
  version               integer     NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taller_inscripciones_uniq_taller_cohorte_persona
    UNIQUE (taller_id, cohorte_id, persona_principal_id)
);

-- Indexes:
CREATE INDEX IF NOT EXISTS idx_taller_inscripciones_persona_principal_id
  ON public.taller_inscripciones(persona_principal_id);

-- Pending inscriptions per taller: the coordinator dashboard's main view.
CREATE INDEX IF NOT EXISTS idx_taller_inscripciones_taller_estado
  ON public.taller_inscripciones(taller_id, estado)
  WHERE estado = 'pendiente';

-- Pending inscriptions per cohorte: the cohort detail view's main view.
CREATE INDEX IF NOT EXISTS idx_taller_inscripciones_cohorte_estado
  ON public.taller_inscripciones(cohorte_id, estado)
  WHERE estado = 'pendiente';

-- Trigger: BEFORE INSERT OR UPDATE — enforces the couple unit invariant
-- (link_type set ↔ companero_id set) and the motivo_no_aprobado mandatory
-- rule. The trigger function is wrapped in CREATE OR REPLACE so a future
-- additive migration can refine the rules without a DROP. The trigger
-- itself is created in a DO block guarded on pg_trigger (idempotent, no
-- DROP — I-6).
CREATE OR REPLACE FUNCTION public.trg_taller_inscripciones_couple_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Couple unit invariant: link_type and companero_id are linked.
  -- When link_type is set, companero_id MUST be set; when link_type is
  -- NULL, companero_id MUST also be NULL.
  IF (NEW.link_type IS NOT NULL AND NEW.companero_id IS NULL) THEN
    RAISE EXCEPTION 'taller_inscripciones: link_type=% requires companero_id NOT NULL',
      NEW.link_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.link_type IS NULL AND NEW.companero_id IS NOT NULL) THEN
    RAISE EXCEPTION 'taller_inscripciones: companero_id set requires link_type NOT NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  -- motivo_no_aprobado mandatory when estado='no_aprobado'.
  IF (NEW.estado = 'no_aprobado' AND (NEW.motivo_no_aprobado IS NULL OR length(trim(NEW.motivo_no_aprobado)) = 0)) THEN
    RAISE EXCEPTION 'taller_inscripciones: motivo_no_aprobado is required when estado=no_aprobado'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_taller_inscripciones_couple_unit'
  ) THEN
    CREATE TRIGGER trg_taller_inscripciones_couple_unit
      BEFORE INSERT OR UPDATE ON public.taller_inscripciones
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_taller_inscripciones_couple_unit();
  END IF;
END
$$;

-- updated_at trigger for inscripciones. Reuses the metadata updated_at
-- helper from M5.1 (function signature is byte-identical, search_path
-- is `public`). The trigger attachment is idempotent via the same
-- pg_trigger guard pattern.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_taller_inscripciones_updated_at'
  ) THEN
    CREATE TRIGGER trg_taller_inscripciones_updated_at
      BEFORE UPDATE ON public.taller_inscripciones
      FOR EACH ROW
      EXECUTE FUNCTION public.set_talleres_crecimiento_metadata_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) taller_grupos                                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Cohort-scoped group. `capacidad > 0` is enforced by CHECK. The
-- recursos_snapshot jsonb holds the R5 close-snapshot (design §3):
-- when a group transitions to estado='completado', the current set of
-- active resources is copied into this column. PR7 will add the
-- resource-snapshot trigger; for now the column is just declared.

CREATE TABLE IF NOT EXISTS public.taller_grupos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id          uuid        NOT NULL
                                   REFERENCES public.talleres_crecimiento_cohortes(id)
                                   ON DELETE RESTRICT,
  nombre              text        NOT NULL,
  estado              text        NOT NULL
                                   CHECK (estado IN ('activo','completado','cancelado')),
  capacidad           integer     NOT NULL CHECK (capacidad > 0),
  -- recursos_snapshot: R5 close-snapshot. NULL until completion; filled
  -- by the PR7 AFTER UPDATE trigger (no-op until then).
  recursos_snapshot   jsonb       CHECK (recursos_snapshot IS NULL OR jsonb_typeof(recursos_snapshot) = 'object'),
  completed_at        timestamptz,
  version             integer     NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes:
CREATE INDEX IF NOT EXISTS idx_taller_grupos_cohorte_id
  ON public.taller_grupos(cohorte_id);

-- Active groups per cohort: the operational UI's main view.
CREATE INDEX IF NOT EXISTS idx_taller_grupos_cohorte_estado_activo
  ON public.taller_grupos(cohorte_id)
  WHERE estado = 'activo';

-- updated_at trigger for grupos. Idempotent attachment via pg_trigger guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_taller_grupos_updated_at'
  ) THEN
    CREATE TRIGGER trg_taller_grupos_updated_at
      BEFORE UPDATE ON public.taller_grupos
      FOR EACH ROW
      EXECUTE FUNCTION public.set_talleres_crecimiento_metadata_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) taller_grupo_asignaciones                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Leader/volunteer assignment. The F5 auto-grant trigger
-- (20260810120000_talleres_role_auto_grant.sql) attaches its AFTER
-- INSERT/UPDATE/DELETE trigger on this table only when it exists (the
-- migration guards with a DO block). When this migration runs, the
-- table is created FIRST and then the trigger attaches (the order of
-- CREATE in this file ensures the table exists when the DO block from
-- the role_auto_grant migration runs again — but since that migration
-- was already applied, the F5 trigger attachment is a no-op until
-- someone re-applies it or a future migration re-attaches it; the
-- function body is still callable).

CREATE TABLE IF NOT EXISTS public.taller_grupo_asignaciones (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id                 uuid        NOT NULL
                                        REFERENCES public.taller_grupos(id)
                                        ON DELETE RESTRICT,
  -- persona_id references public.usuarios.id (the F2/F4 canonical
  -- person reference). NOT NULL: every assignment has exactly one
  -- persona.
  persona_id               uuid        NOT NULL
                                        REFERENCES public.usuarios(id)
                                        ON DELETE RESTRICT,
  rol                      text        NOT NULL
                                        CHECK (rol IN ('lider','voluntario')),
  activo                   boolean     NOT NULL DEFAULT true,
  started_at               timestamptz,
  ended_at                 timestamptz,
  motivo_retiro            text,
  approved_by_director_id  uuid
                                        REFERENCES public.usuarios(id)
                                        ON DELETE SET NULL,
  version                  integer     NOT NULL DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes:
-- Active assignments per group: the leader dashboard's main view.
CREATE INDEX IF NOT EXISTS idx_taller_grupo_asignaciones_grupo_activo
  ON public.taller_grupo_asignaciones(grupo_id)
  WHERE activo = true;

-- Lookup assignments by persona (e.g., "show my assignments" view).
CREATE INDEX IF NOT EXISTS idx_taller_grupo_asignaciones_persona
  ON public.taller_grupo_asignaciones(persona_id);

-- updated_at trigger for asignaciones. Idempotent attachment via pg_trigger guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_taller_grupo_asignaciones_updated_at'
  ) THEN
    CREATE TRIGGER trg_taller_grupo_asignaciones_updated_at
      BEFORE UPDATE ON public.taller_grupo_asignaciones
      FOR EACH ROW
      EXECUTE FUNCTION public.set_talleres_crecimiento_metadata_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) taller_catalogo_etiquetas                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Categorical tags on a taller. PK (taller_id, etiqueta) prevents
-- duplicates. ON DELETE CASCADE: a deleted taller takes its tags with
-- it (no orphan tags — tags are non-audit metadata, unlike the
-- inscription audit trail).

CREATE TABLE IF NOT EXISTS public.taller_catalogo_etiquetas (
  taller_id   uuid        NOT NULL
                          REFERENCES public.talleres_crecimiento_metadata(id)
                          ON DELETE CASCADE,
  etiqueta    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (taller_id, etiqueta)
);

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 5) taller_solicitudes_retiro                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Withdrawal requests. Two request types:
--   * participante_retiro — references taller_inscripciones(id)
--   * equipo_retiro_definitivo — references taller_grupo_asignaciones(id)
-- Exactly one of the two FKs MUST be set (enforced by CHECK using the
-- standard `(a IS NULL) <> (b IS NULL)` xor idiom). motivo NOT NULL —
-- a withdrawal without a reason cannot be reviewed.

CREATE TABLE IF NOT EXISTS public.taller_solicitudes_retiro (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inscripcion_id         uuid
                                     REFERENCES public.taller_inscripciones(id)
                                     ON DELETE CASCADE,
  grupo_asignacion_id    uuid
                                     REFERENCES public.taller_grupo_asignaciones(id)
                                     ON DELETE CASCADE,
  -- solicitante_persona_id references public.usuarios.id (F2/F4
  -- canonical). NOT NULL — every request has a submitter.
  solicitante_persona_id uuid        NOT NULL
                                     REFERENCES public.usuarios(id)
                                     ON DELETE RESTRICT,
  tipo                   text        NOT NULL
                                     CHECK (tipo IN ('participante_retiro','equipo_retiro_definitivo')),
  motivo                 text        NOT NULL CHECK (length(trim(motivo)) > 0),
  estado                 text        NOT NULL
                                     CHECK (estado IN ('pendiente','aprobada','rechazada')),
  version                integer     NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Exactly one of (inscripcion_id, grupo_asignacion_id) must be set.
  -- The xor idiom uses `<>` (NULL-safe not-equal): when one side is NULL
  -- and the other is NOT NULL, the comparison returns TRUE (rejected);
  -- when both are NULL or both are NOT NULL, it returns FALSE (accepted
  -- because the rest of the row is broken anyway, but the cross-column
  -- constraint is the gate we need here).
  CONSTRAINT taller_solicitudes_retiro_xor_target
    CHECK ((inscripcion_id IS NULL) <> (grupo_asignacion_id IS NULL))
);

-- Indexes:
-- Pending requests: the director/coordinator review queue.
CREATE INDEX IF NOT EXISTS idx_taller_solicitudes_retiro_pendientes
  ON public.taller_solicitudes_retiro(estado)
  WHERE estado = 'pendiente';

-- updated_at trigger for solicitudes. Idempotent attachment via pg_trigger guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_taller_solicitudes_retiro_updated_at'
  ) THEN
    CREATE TRIGGER trg_taller_solicitudes_retiro_updated_at
      BEFORE UPDATE ON public.taller_solicitudes_retiro
      FOR EACH ROW
      EXECUTE FUNCTION public.set_talleres_crecimiento_metadata_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 6) RLS — taller_inscripciones (DT-022)                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Inscriptions are the operational write surface:
--   * SELECT — own (persona_principal_id = caller's usuarios.id) OR with
--     any taller capability. Participants see only their own; leaders,
--     volunteers, coordinators, directors see what their scope grants.
--   * INSERT — coordinator/director only (coordinator.write OR
--     director.write OR admin.manage capability). Self-service is a UI
--     concern; the canonical insert goes through the coordinator route
--     because the spec requires coordinator approval (the participant is
--     NOT the inscripcion author — the coordinator is).
--   * UPDATE — coordinator/director only, with motive semantics enforced
--     by the trigger (motivo_no_aprobado mandatory when estado='no_aprobado').
--   * DELETE — DISABLED. Withdrawal uses taller_solicitudes_retiro.
--     Direct DELETE is forbidden to preserve the audit trail (design §14).

ALTER TABLE public.taller_inscripciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_inscripciones FROM anon, authenticated;

-- SELECT: own row OR taller capability.
CREATE POLICY "taller_inscripciones_select"
  ON public.taller_inscripciones FOR SELECT
  USING (
    -- The participant's own row. Identity resolution: grants store
    -- `usuarios.id`; the caller is identified by `usuarios.auth_id`.
    persona_principal_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
    OR auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read')
  );

-- INSERT: coordinator/director only.
CREATE POLICY "taller_inscripciones_insert"
  ON public.taller_inscripciones FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
    OR auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- UPDATE: coordinator/director only.
CREATE POLICY "taller_inscripciones_update"
  ON public.taller_inscripciones FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
    OR auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
    OR auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- DELETE: forbidden. Withdrawal goes through taller_solicitudes_retiro.
CREATE POLICY "taller_inscripciones_delete"
  ON public.taller_inscripciones FOR DELETE
  USING (false);

-- service_role bypass (server-side / migration scripts).
GRANT SELECT, INSERT, UPDATE ON TABLE public.taller_inscripciones TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 7) RLS — taller_grupos (DT-022)                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Groups follow the taller: anyone who can see the taller can see the
-- group (catalog readers). Group mutation is director + coordinator
-- write (leads/volunteers are linked to the group via
-- taller_grupo_asignaciones, not to the group itself).

ALTER TABLE public.taller_grupos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_grupos FROM anon, authenticated;

-- SELECT: same gate as the taller — anyone with a read capability for
-- the talleres experience can see the group list.
CREATE POLICY "taller_grupos_select"
  ON public.taller_grupos FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read')
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

-- INSERT: director or coordinator.
CREATE POLICY "taller_grupos_insert"
  ON public.taller_grupos FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- UPDATE: director or coordinator.
CREATE POLICY "taller_grupos_update"
  ON public.taller_grupos FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- DELETE: director only (coordinators never delete a group — they
-- edit, and the director cancels via estado='cancelado').
CREATE POLICY "taller_grupos_delete"
  ON public.taller_grupos FOR DELETE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- service_role bypass.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_grupos TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 8) RLS — taller_grupo_asignaciones (DT-022)                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Assignments follow the group: anyone who can see the group can see
-- the assignment list. Mutation is director + coordinator write (with
-- motivo_retiro for the inactive path). Leads/volunteers can read their
-- own assignment via the group read gate.

ALTER TABLE public.taller_grupo_asignaciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_grupo_asignaciones FROM anon, authenticated;

-- SELECT: own assignment OR taller capability.
CREATE POLICY "taller_grupo_asignaciones_select"
  ON public.taller_grupo_asignaciones FOR SELECT
  USING (
    persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
    OR auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
  );

-- INSERT: director or coordinator (coordinators assign leads and
-- volunteers within their cohort scope; directors assign across cohorts).
CREATE POLICY "taller_grupo_asignaciones_insert"
  ON public.taller_grupo_asignaciones FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- UPDATE: director or coordinator. The motivo_retiro requirement when
-- `activo=false` is enforced at the application layer (PR15 API), not
-- in the DB — the DB does not have a NOT NULL semantics for cross-row
-- columns and the trigger would need a NEW state to compare against.
CREATE POLICY "taller_grupo_asignaciones_update"
  ON public.taller_grupo_asignaciones FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- DELETE: restricted to director (coordinators use UPDATE with motivo_retiro).
CREATE POLICY "taller_grupo_asignaciones_delete"
  ON public.taller_grupo_asignaciones FOR DELETE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- service_role bypass.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_grupo_asignaciones TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 9) RLS — taller_catalogo_etiquetas (DT-022)                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Tags follow the taller: anyone who can read the catalog can read the
-- tags. Tag mutation is director + coordinator write (tags are part of
-- the catalog presentation, not the operational data — the same gate
-- as the cohort table).

ALTER TABLE public.taller_catalogo_etiquetas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_catalogo_etiquetas FROM anon, authenticated;

-- SELECT: anyone with a read capability for the talleres experience.
CREATE POLICY "taller_catalogo_etiquetas_select"
  ON public.taller_catalogo_etiquetas FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read')
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

-- INSERT: director or coordinator.
CREATE POLICY "taller_catalogo_etiquetas_insert"
  ON public.taller_catalogo_etiquetas FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- UPDATE: director or coordinator (labels are catalog metadata).
CREATE POLICY "taller_catalogo_etiquetas_update"
  ON public.taller_catalogo_etiquetas FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- DELETE: director only.
CREATE POLICY "taller_catalogo_etiquetas_delete"
  ON public.taller_catalogo_etiquetas FOR DELETE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- service_role bypass.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_catalogo_etiquetas TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 10) RLS — taller_solicitudes_retiro (DT-022)                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Withdrawal requests have a strict submitter-vs-reviewer split:
--   * SELECT — submitter (own row) OR director.
--   * INSERT — submitter (own row must have solicitante_persona_id =
--     caller's usuarios.id). Coordinators/directors submit on behalf of
--     a participant via the solicitudes_retiro (UI side); the API also
--     has the director-approval flow.
--   * UPDATE — director (or service_role via /api/admin paths) only;
--     the participant cannot edit their own submission after it is filed.
--   * DELETE — forbidden (audit trail).

ALTER TABLE public.taller_solicitudes_retiro ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_solicitudes_retiro FROM anon, authenticated;

-- SELECT: submitter (own row) OR director.
CREATE POLICY "taller_solicitudes_retiro_select"
  ON public.taller_solicitudes_retiro FOR SELECT
  USING (
    solicitante_persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
    OR auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
  );

-- INSERT: submitter (own solicitante_persona_id) OR director.
CREATE POLICY "taller_solicitudes_retiro_insert"
  ON public.taller_solicitudes_retiro FOR INSERT
  WITH CHECK (
    (
      solicitante_persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
    )
    OR auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- UPDATE: director only (the approval/rejection flow is director-driven).
CREATE POLICY "taller_solicitudes_retiro_update"
  ON public.taller_solicitudes_retiro FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- DELETE: forbidden (audit trail).
CREATE POLICY "taller_solicitudes_retiro_delete"
  ON public.taller_solicitudes_retiro FOR DELETE
  USING (false);

-- service_role bypass (server-side approval flow).
GRANT SELECT, INSERT, UPDATE ON TABLE public.taller_solicitudes_retiro TO service_role;
