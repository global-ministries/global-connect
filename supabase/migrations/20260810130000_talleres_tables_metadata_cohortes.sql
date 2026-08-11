-- ════════════════════════════════════════════════════════════════════
-- PR5 — DT-017 / DT-018 — Talleres M5.1: metadata + cohortes + RLS.
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-017: Two tables in the talleres_crecimiento catalog slice:
--   1. public.talleres_crecimiento_metadata — workshop definition
--      (one row per OperatingCoreEvent with kind='workshop'; FK UNIQUE
--      on operating_core_event_id). 12 columns: id, event FK, tipo,
--      link_type, modalidad_inscripcion, recurrence_rule, periodo_general_id,
--      estado, four snapshots (nombre / sesiones / duracion /
--      modalidad_inscripcion), firmantes jsonb, version.
--   2. public.talleres_crecimiento_cohortes — cohort of a taller, owned
--      by a single dream_team_equipo (the cohort's leadership aggregation
--      root). 9 columns: id, taller_id FK, dream_team_equipo_id FK,
--      edicion, started_at, ended_at, version, created_at, updated_at.
--
--   Indexes (8 partial, covering the dominant read paths):
--     metadata:
--       idx_talleres_crecimiento_metadata_operating_core_event_id
--       idx_talleres_crecimiento_metadata_estado_active
--       idx_talleres_crecimiento_metadata_modalidad_periodo_general
--       idx_talleres_crecimiento_metadata_tipo
--     cohortes:
--       idx_talleres_crecimiento_cohortes_taller_id
--       idx_talleres_crecimiento_cohortes_dream_team_equipo_id
--       idx_talleres_crecimiento_cohortes_active
--       idx_talleres_crecimiento_cohortes_edicion
--
--   Helper function (DT-020):
--     public.cohort_belongs_to_talleres_experience(p_cohorte_id uuid)
--     — STABLE, SECURITY DEFINER, joins the cohort to its equipo and
--     returns true when experiencia = 'talleres_crecimiento'. The DB FK
--     cannot enforce experiencia (F2 contract), so the helper is the
--     application-level enforcement point (RLS / API / dashboard).
--
-- DT-018: RLS on both tables — 4 unique policies per table with
-- _select / _insert / _update / _delete suffixes, direct `auth.uid()`,
-- REVOKE ALL FROM anon, authenticated, GRANT to service_role. The taller
-- metadata table is the catalog write surface (director write); cohortes
-- are written by directors/coordinators.
--
-- Identity resolution (canonical, proven): grants store persona references
-- via `public.usuarios.id`, and the authenticated identity is resolved with
-- `usuarios.auth_id = auth.uid()`. This is the F2 dream_team + F4 pastoral
-- canonical pattern (proven by 20260725130000_pastoral_capability_helper_drift_fix.sql).
--
-- Idempotency: every CREATE / ALTER guarded by IF NOT EXISTS (where
-- supported by Postgres), and the taller_periodos_generales FK is
-- added inside a DO block only if that table exists (PR10 sibling — it
-- does not exist yet on staging, so the FK is created later). This
-- keeps the M5.1 migration order-independent of PR10.
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) talleres_crecimiento_metadata                                ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.talleres_crecimiento_metadata (
  id                                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_core_event_id           uuid        UNIQUE NOT NULL
                                                 REFERENCES public.operating_core_events(id)
                                                 ON DELETE RESTRICT,
  tipo                              text        NOT NULL
                                                 CHECK (tipo IN ('individual','pareja')),
  -- link_type: NULL for tipo='individual'; matrimonio|novios for tipo='pareja'
  link_type                         text        CHECK (link_type IN ('matrimonio','novios')),
  modalidad_inscripcion             text        NOT NULL
                                                 CHECK (modalidad_inscripcion IN ('periodo_general','permanente_custom')),
  recurrence_rule                   jsonb       CHECK (recurrence_rule IS NULL OR jsonb_typeof(recurrence_rule) = 'object'),
  -- periodo_general_id: nullable; FK to taller_periodos_generales (PR10) added
  -- conditionally in a DO block below. Kept as a plain uuid here so the
  -- migration does not depend on PR10 having landed.
  periodo_general_id                uuid,
  estado                            text        NOT NULL
                                                 CHECK (estado IN ('borrador','abierto','en_curso','cerrado','cancelado')),
  -- Snapshot columns (R7/R10 catalog spec): frozen at insert time, never
  -- mutated by modality changes. Application layer is the source of the
  -- initial value; the DB does not auto-sync from `modalidad_inscripcion`
  -- (intentional — see metadata.test.ts modality-snapshot-immutability).
  nombre_snapshot                   text        NOT NULL,
  sesiones_snapshot                 integer     NOT NULL CHECK (sesiones_snapshot > 0),
  duracion_estimada_minutos_snapshot integer    NOT NULL CHECK (duracion_estimada_minutos_snapshot > 0),
  modalidad_inscripcion_snapshot    text        NOT NULL
                                                 CHECK (modalidad_inscripcion_snapshot IN ('periodo_general','permanente_custom')),
  firmantes                         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  version                           integer     NOT NULL DEFAULT 1,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

-- Indexes (partial where the dominant read path is non-total):
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_metadata_operating_core_event_id
  ON public.talleres_crecimiento_metadata(operating_core_event_id);

-- Active workshops: abierto + en_curso is the only set the operational
-- UI cares about (borrador is admin-only; cerrado/cancelado are read-only).
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_metadata_estado_active
  ON public.talleres_crecimiento_metadata(estado)
  WHERE estado IN ('abierto','en_curso');

-- periodo_general workshops: the scheduler + director dashboard read
-- this set constantly (permanente_custom follows its own recurrence_rule).
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_metadata_modalidad_periodo_general
  ON public.talleres_crecimiento_metadata(modalidad_inscripcion)
  WHERE modalidad_inscripcion = 'periodo_general';

-- tipo filter: couple vs individual workshops are surfaced in different
-- navigation buckets (design §9).
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_metadata_tipo
  ON public.talleres_crecimiento_metadata(tipo);

-- Conditional FK to taller_periodos_generales (PR10 sibling table). The
-- M5.1 migration must ship before PR10, so we add the FK in a DO block
-- that no-ops if the parent table is missing. This keeps M5.1 additive
-- and order-independent of PR10.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'taller_periodos_generales'
  ) THEN
    -- ALTER TABLE ADD CONSTRAINT is additive; the constraint is named so
    -- a future migration can identify it for an additive ON DELETE
    -- tightening if required.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'talleres_crecimiento_metadata_periodo_general_id_fkey'
    ) THEN
      ALTER TABLE public.talleres_crecimiento_metadata
        ADD CONSTRAINT talleres_crecimiento_metadata_periodo_general_id_fkey
        FOREIGN KEY (periodo_general_id)
        REFERENCES public.taller_periodos_generales(id)
        ON DELETE RESTRICT;
    END IF;
  END IF;
END
$$;

-- updated_at trigger — keep the column fresh on every UPDATE. The
-- function body is replaceable (CREATE OR REPLACE FUNCTION is the
-- additive pattern); the trigger attachment is wrapped in a DO block
-- that creates the trigger only if it does not exist (idempotency
-- without DROP — invariant I-6 forbids any DROP in this migration).
CREATE OR REPLACE FUNCTION public.set_talleres_crecimiento_metadata_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_talleres_crecimiento_metadata_updated_at'
  ) THEN
    CREATE TRIGGER trg_talleres_crecimiento_metadata_updated_at
      BEFORE UPDATE ON public.talleres_crecimiento_metadata
      FOR EACH ROW
      EXECUTE FUNCTION public.set_talleres_crecimiento_metadata_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) talleres_crecimiento_cohortes                                ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.talleres_crecimiento_cohortes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- taller_id FK with default ON DELETE RESTRICT (no clause → RESTRICT).
  -- CASCADE is forbidden: a deleted taller must NOT silently drop its
  -- cohort history (audit trail must survive). Explicit RESTRICT for
  -- documentation; the default would behave identically.
  taller_id             uuid        NOT NULL
                                   REFERENCES public.talleres_crecimiento_metadata(id)
                                   ON DELETE RESTRICT,
  -- The cohort's leadership aggregation root: a single dream_team_equipo
  -- that owns the cohort's director + N coordinadores + N voluntarios.
  -- The FK does not enforce experiencia (F2 contract); the helper
  -- cohort_belongs_to_talleres_experience() is the application-level
  -- guard.
  dream_team_equipo_id  uuid        NOT NULL
                                   REFERENCES public.dream_team_equipos(id)
                                   ON DELETE RESTRICT,
  edicion               text        NOT NULL,
  started_at            timestamptz,
  ended_at              timestamptz,
  version               integer     NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes:
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_cohortes_taller_id
  ON public.talleres_crecimiento_cohortes(taller_id);

CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_cohortes_dream_team_equipo_id
  ON public.talleres_crecimiento_cohortes(dream_team_equipo_id);

-- Active cohorts: started_at NOT NULL AND ended_at IS NULL is the dominant
-- read path for the operational UI (coordinador + director dashboards).
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_cohortes_active
  ON public.talleres_crecimiento_cohortes(taller_id, started_at)
  WHERE ended_at IS NULL;

-- edicion lookup: the director selects a cohort by edition label in the
-- taller detail view.
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_cohortes_edicion
  ON public.talleres_crecimiento_cohortes(taller_id, edicion);

-- updated_at trigger for cohortes. Idempotency via the same DO-block
-- pattern as the metadata trigger above (no DROP — I-6).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_talleres_crecimiento_cohortes_updated_at'
  ) THEN
    CREATE TRIGGER trg_talleres_crecimiento_cohortes_updated_at
      BEFORE UPDATE ON public.talleres_crecimiento_cohortes
      FOR EACH ROW
      EXECUTE FUNCTION public.set_talleres_crecimiento_metadata_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) F2 scope byte-identity helper (DT-020)                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- The DB FK from cohortes to dream_team_equipos does not enforce
-- experiencia (F2 owns the equipos table; the F5 catalog cannot mutate
-- the F2 schema). The application layer needs a cheap, STABLE guard
-- that confirms the linked equipo is a talleres_crecimiento one before
-- RLS, API, or dashboard code trusts the cohort.
--
-- Implementation: a single SELECT EXISTS over the join, no DML, no
-- SECURITY DEFINER escalation required. STABLE so the planner can
-- inline the call inside RLS USING expressions.

CREATE OR REPLACE FUNCTION public.cohort_belongs_to_talleres_experience(
  p_cohorte_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.talleres_crecimiento_cohortes c
    JOIN public.dream_team_equipos          eq ON eq.id = c.dream_team_equipo_id
    WHERE c.id = p_cohorte_id
      AND eq.experiencia = 'talleres_crecimiento'
  )
$$;

REVOKE ALL ON FUNCTION public.cohort_belongs_to_talleres_experience(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cohort_belongs_to_talleres_experience(uuid)
  TO authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) RLS — talleres_crecimiento_metadata                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Policies use unique _select / _insert / _update / _delete suffixes
-- (4 per table). auth.uid() is the canonical identity; the auth has
-- talleres_capability helper does the usuarios.auth_id → grants join
-- server-side (see 20260808204221_talleres_helper_auth_has_capability.sql).
--
-- Director scope: scope_id is NULL on director grants (the experience-
-- wide director set per design §4), so the RLS USING clause is a plain
-- capability check. Coordinator / lead / volunteer grants are taller-
-- scoped, so the USING clause joins to the taller's id.
--
-- The metadata table is the catalog write surface: only the director
-- (admin.manage OR director.write capability) can INSERT/UPDATE/DELETE.

ALTER TABLE public.talleres_crecimiento_metadata ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.talleres_crecimiento_metadata FROM anon, authenticated;

-- SELECT: anyone with any read capability for the talleres experience
-- (director.read / coordinator.read / lead.read / volunteer.read /
-- participation.read / metrics.read / admin.manage) can read the
-- catalog. The catalog is metadata — no PII, no inscription contents.
CREATE POLICY "talleres_crecimiento_metadata_select"
  ON public.talleres_crecimiento_metadata FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read')
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

-- INSERT: director only (director.write OR admin.manage).
CREATE POLICY "talleres_crecimiento_metadata_insert"
  ON public.talleres_crecimiento_metadata FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- UPDATE: director only.
CREATE POLICY "talleres_crecimiento_metadata_update"
  ON public.talleres_crecimiento_metadata FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- DELETE: director only (destructive — director's call).
CREATE POLICY "talleres_crecimiento_metadata_delete"
  ON public.talleres_crecimiento_metadata FOR DELETE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- service_role bypass (server-side / migration scripts).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.talleres_crecimiento_metadata
  TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 5) RLS — talleres_crecimiento_cohortes                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Cohort visibility follows the taller: anyone who can see the taller
-- (catalog readers) can see the cohort row. Cohort mutation is
-- director + coordinator write — leads/volunteers are linked to the
-- cohort's *grupo* (a PR7 sibling table), not to the cohort itself.

ALTER TABLE public.talleres_crecimiento_cohortes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.talleres_crecimiento_cohortes FROM anon, authenticated;

-- SELECT: same gate as the taller — anyone with a read capability for
-- the talleres experience can see the cohort list.
CREATE POLICY "talleres_crecimiento_cohortes_select"
  ON public.talleres_crecimiento_cohortes FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read')
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

-- INSERT: director (write) or coordinator (write).
CREATE POLICY "talleres_crecimiento_cohortes_insert"
  ON public.talleres_crecimiento_cohortes FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- UPDATE: same set as INSERT (coordinators can edit the cohort's
-- started_at / ended_at / edicion as part of operational work).
CREATE POLICY "talleres_crecimiento_cohortes_update"
  ON public.talleres_crecimiento_cohortes FOR UPDATE
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

-- DELETE: director only (coordinators never delete a cohort — they
-- edit, and the director cancels a taller via estado='cancelado').
CREATE POLICY "talleres_crecimiento_cohortes_delete"
  ON public.talleres_crecimiento_cohortes FOR DELETE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- service_role bypass.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.talleres_crecimiento_cohortes
  TO service_role;
