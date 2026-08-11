-- ════════════════════════════════════════════════════════════════════
-- PR9 — DT-032 + DT-033 — Talleres events ledger + bootstrap of the
-- shared participation ledger for `taller_*` kinds.
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-032: taller_eventos — internal event ledger for Growth Workshops.
--   Captures the cross-cutting event surface: actor, scope (taller /
--   cohorte / grupo), persona, structured payload (sensitive fields
--   excluded via inline CHECK), schema version, occurred_at, and an
--   outbox flag drained by the writer.
--
-- DT-033: bootstrap `operating_core_participation_eventos` (additive
--   ledger) WITH the 16-kind union pre-extended (11 F3 originals + 5
--   taller_*). The F3 participation migration
--   (`20260717120000_operating_core_participation_eventos.sql`) is in
--   the repo but was never applied to prod (verified via
--   information_schema.tables — see PR9 apply-progress §bootstrap).
--   PR9 therefore owns the bootstrap as a documented design gap.
--   Bootstrap uses CHECK (not ENUM) for forward-compat with future
--   `taller_*` extensions without DDL migrations on the type.
--
-- Rollback: each new object uses `IF NOT EXISTS` and is independently
--   droppable (no destructive DDL is applied).
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) Bootstrap: operating_core_participation_eventos                ║
-- ║    (DT-033 — design gap closed in PR9)                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- The F3 participation ledger table is bootstrapped here with the
-- FULL 16-kind union (11 originals + 5 taller_*) so that taller_*
-- writes do NOT require a follow-up migration. The CHECK constraint
-- uses an explicit name (`operating_core_participation_eventos_kind_check`)
-- so a future additive extension (e.g. taller_inscripcion_rescheduled)
-- can DROP/ADD without losing the constraint identity.
--
-- Defensive guard: if the table already exists (e.g. a separate
-- staging migration landed first), skip the CREATE — the migration is
-- a no-op for the bootstrap portion.
--
-- The schema follows the F3 repository interface
-- (`lib/platform/operating-core/participation-ledger-repository.ts`):
--   - subject_id (uuid) — F3 column name for the subject of the event
--   - event_id, service_id, event_instance_id (nullable F3 refs)
--   - corrects_event_id (append-only correction self-FK)
--   - status ∈ ('recorded','corrected','superseded','rejected')
--   - experience text (multi-tenant OUT of scope; F3 contract)
--   - capture_source text (F3 contract)
--   - metadata jsonb CHECK excluding PII keys (F3 PII boundary)
--   - sensitivity text ∈ ('internal','public','sensitive') added by
--     the F4 pastoral extension migration
--     (`20260722181345_pastoral_sensitivity_extension.sql`).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'operating_core_participation_eventos'
  ) THEN

    CREATE TABLE public.operating_core_participation_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      -- 16-kind closed union (11 F3 originals + 5 taller_* sibling kinds)
      -- F3 originals: visitor_capture, registration, cancellation,
      --   check_in, check_out, attendance, attendance_update,
      --   service_assignment, requirement_update, transition,
      --   document_received.
      -- Talleres additions (DT-033): taller_cohort_started,
      --   taller_session_attended, taller_session_missed,
      --   taller_completion_recorded, taller_completion_failed.
      kind text NOT NULL CHECK (kind IN (
        'visitor_capture',
        'registration',
        'cancellation',
        'check_in',
        'check_out',
        'attendance',
        'attendance_update',
        'service_assignment',
        'requirement_update',
        'transition',
        'document_received',
        'taller_cohort_started',
        'taller_session_attended',
        'taller_session_missed',
        'taller_completion_recorded',
        'taller_completion_failed'
      )),

      -- Subject of the event (person, registration, event instance, etc.)
      subject_id uuid NOT NULL,

      -- When the event actually occurred (not when persisted)
      occurred_at timestamptz NOT NULL DEFAULT now(),

      -- Auditable actor
      actor_persona_id uuid NOT NULL,

      -- Capture source (F3 contract: 'form' | 'manual' | 'bulk' | 'system' | string)
      capture_source text NOT NULL,

      -- Experience scope (multi-tenant OUT of scope; single per row)
      experience text NOT NULL,

      -- Optional OC entity references
      event_id uuid REFERENCES public.operating_core_events(id) ON DELETE SET NULL,
      service_id uuid REFERENCES public.operating_core_services(id) ON DELETE SET NULL,
      event_instance_id uuid REFERENCES public.operating_core_event_instances(id) ON DELETE SET NULL,

      -- Append-only correction: self-reference to the original event this one corrects
      corrects_event_id uuid REFERENCES public.operating_core_participation_eventos(id) ON DELETE SET NULL,

      -- Lifecycle status (default: recorded; corrections are NEW rows with corrected/superseded)
      status text NOT NULL DEFAULT 'recorded' CHECK (
        status IN ('recorded', 'corrected', 'superseded', 'rejected')
      ),

      -- Sensitivity classification (added by F4 pastoral extension).
      -- DEFAULT 'internal' preserves F3 behavior; 'sensitive' is used
      -- for crisis events; 'public' for public-facing events.
      sensitivity text NOT NULL DEFAULT 'internal' CHECK (
        sensitivity IN ('internal', 'public', 'sensitive')
      ),

      -- Bounded metadata with PII CHECK — F3 PII boundary (5 keys rejected)
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
        NOT (metadata ? 'cedula') AND
        NOT (metadata ? 'telefono') AND
        NOT (metadata ? 'email') AND
        NOT (metadata ? 'nombre') AND
        NOT (metadata ? 'apellido')
      ),

      created_at timestamptz NOT NULL DEFAULT now(),

      -- Idempotency: same (subject, kind, occurred_at) cannot duplicate
      CONSTRAINT operating_core_participation_eventos_record_unique
        UNIQUE (subject_id, kind, occurred_at)
    );

    -- ── Indexes (mirroring F3 precedent) ────────────────────────────
    CREATE INDEX idx_oc_participation_kind
      ON public.operating_core_participation_eventos(kind);
    CREATE INDEX idx_oc_participation_subject
      ON public.operating_core_participation_eventos(subject_id);
    CREATE INDEX idx_oc_participation_occurred_at
      ON public.operating_core_participation_eventos(occurred_at);
    CREATE INDEX idx_oc_participation_actor
      ON public.operating_core_participation_eventos(actor_persona_id);
    CREATE INDEX idx_oc_participation_event
      ON public.operating_core_participation_eventos(event_id);
    CREATE INDEX idx_oc_participation_service
      ON public.operating_core_participation_eventos(service_id);
    CREATE INDEX idx_oc_participation_instance
      ON public.operating_core_participation_eventos(event_instance_id);
    CREATE INDEX idx_oc_participation_corrects
      ON public.operating_core_participation_eventos(corrects_event_id);
    CREATE INDEX idx_oc_participation_status
      ON public.operating_core_participation_eventos(status);
    CREATE INDEX idx_oc_participation_sensitivity
      ON public.operating_core_participation_eventos(sensitivity);

    -- Composite index for common query pattern: subject + kind + time
    CREATE INDEX idx_oc_participation_subject_kind_occurred
      ON public.operating_core_participation_eventos(subject_id, kind, occurred_at DESC);

  END IF;
END $$;

-- Idempotent indexes (safe to re-run if bootstrap block was skipped
-- because the table already existed with a possibly older schema —
-- e.g. a separate staging migration applied first).
CREATE INDEX IF NOT EXISTS idx_oc_participation_kind
  ON public.operating_core_participation_eventos(kind);
CREATE INDEX IF NOT EXISTS idx_oc_participation_subject
  ON public.operating_core_participation_eventos(subject_id);
CREATE INDEX IF NOT EXISTS idx_oc_participation_occurred_at
  ON public.operating_core_participation_eventos(occurred_at);
CREATE INDEX IF NOT EXISTS idx_oc_participation_actor
  ON public.operating_core_participation_eventos(actor_persona_id);
CREATE INDEX IF NOT EXISTS idx_oc_participation_event
  ON public.operating_core_participation_eventos(event_id);
CREATE INDEX IF NOT EXISTS idx_oc_participation_service
  ON public.operating_core_participation_eventos(service_id);
CREATE INDEX IF NOT EXISTS idx_oc_participation_instance
  ON public.operating_core_participation_eventos(event_instance_id);
CREATE INDEX IF NOT EXISTS idx_oc_participation_corrects
  ON public.operating_core_participation_eventos(corrects_event_id);
CREATE INDEX IF NOT EXISTS idx_oc_participation_status
  ON public.operating_core_participation_eventos(status);
CREATE INDEX IF NOT EXISTS idx_oc_participation_sensitivity
  ON public.operating_core_participation_eventos(sensitivity);
CREATE INDEX IF NOT EXISTS idx_oc_participation_subject_kind_occurred
  ON public.operating_core_participation_eventos(subject_id, kind, occurred_at DESC);

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) RLS — operating_core_participation_eventos (append-only)       ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Append-only invariant: no UPDATE / DELETE policies. RLS allows
-- SELECT for users with operating_core participation capabilities
-- (F3 precedent) and INSERT for managers. Mutations to historical
-- rows are rejected at the DB layer by the trigger below.

ALTER TABLE public.operating_core_participation_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operating_core_participation_eventos FROM PUBLIC, anon, authenticated;

-- service_role: INSERT + SELECT only (append-only invariant — no UPDATE/DELETE)
GRANT SELECT, INSERT ON TABLE public.operating_core_participation_eventos TO service_role;

-- Append-only enforcement trigger (mirrors F3 precedent
-- `20260717120000_operating_core_participation_eventos.sql`).
CREATE OR REPLACE FUNCTION public.operating_core_participation_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'operating_core_participation_eventos is append-only; corrections must be new rows with corrects_event_id';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_oc_participation_append_only'
  ) THEN
    CREATE TRIGGER enforce_oc_participation_append_only
      BEFORE UPDATE OR DELETE OR TRUNCATE ON public.operating_core_participation_eventos -- noqa: truncate
      FOR EACH STATEMENT EXECUTE FUNCTION public.operating_core_participation_append_only();
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) DT-032 — taller_eventos (internal event ledger)                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Internal event capture for Growth Workshops. Each row records a
-- single domain event with actor, scope (taller/cohorte/grupo),
-- persona subject, schema_version, structured payload (PII
-- CHECK-enforced), occurred_at, and emitted_to_outbox (drained by
-- the writer — `participation-ledger-talleres-writer.ts`).
--
-- Idempotency + RLS follow the same pattern as PR5–PR8: 4 policies
-- per table with unique _select/_insert/_update/_delete suffixes,
-- auth.uid() direct (never current_persona_id()), service_role GRANT.

CREATE TABLE IF NOT EXISTS public.taller_eventos (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id                uuid        NOT NULL
                                       REFERENCES public.talleres_crecimiento_metadata(id)
                                       ON DELETE RESTRICT,
  cohorte_id               uuid        REFERENCES public.talleres_crecimiento_cohortes(id)
                                       ON DELETE RESTRICT,
  grupo_id                 uuid        REFERENCES public.taller_grupos(id)
                                       ON DELETE RESTRICT,
  persona_id               uuid        NOT NULL
                                       REFERENCES public.usuarios(id)
                                       ON DELETE RESTRICT,
  actor_persona_id         uuid        NOT NULL
                                       REFERENCES public.usuarios(id)
                                       ON DELETE RESTRICT,
  -- Schema version: bounded by pattern; v1 = current contract.
  schema_version           text        NOT NULL
                                       CHECK (schema_version ~ '^v[0-9]+$'),
  -- Payload is a free-form structured blob. Sensitive PII keys are
  -- rejected at the DB layer (defense in depth — the application
  -- layer also filters via buildTallerEvent in events.ts).
  payload                  jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (
                                       NOT (payload ? 'cedula') AND
                                       NOT (payload ? 'telefono') AND
                                       NOT (payload ? 'email') AND
                                       NOT (payload ? 'notas_privadas') AND
                                       NOT (payload ? 'contact_data')
                                     ),
  occurred_at              timestamptz NOT NULL DEFAULT now(),
  emitted_to_outbox        boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────
-- Per-taller timeline (the most common query: "show all events for
-- this taller, newest first").
CREATE INDEX IF NOT EXISTS idx_taller_eventos_taller
  ON public.taller_eventos (taller_id, occurred_at DESC);

-- Per-persona timeline ("what events has Ana been involved in?").
CREATE INDEX IF NOT EXISTS idx_taller_eventos_persona
  ON public.taller_eventos (persona_id, occurred_at DESC);

-- Per-actor timeline ("who did what, when?").
CREATE INDEX IF NOT EXISTS idx_taller_eventos_actor
  ON public.taller_eventos (actor_persona_id, occurred_at DESC);

-- Pending outbox: the writer drains rows where emitted_to_outbox = false.
CREATE INDEX IF NOT EXISTS idx_taller_eventos_pending_outbox
  ON public.taller_eventos (occurred_at)
  WHERE NOT emitted_to_outbox;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) RLS — taller_eventos (DT-032)                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Event ledger: read-only for higher roles (director / admin /
-- coordinator); write gated to director / admin / coordinator +
-- service_role. UPDATE and DELETE are forbidden — events are an
-- audit trail (append-only by contract).

ALTER TABLE public.taller_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_eventos FROM anon, authenticated;

-- SELECT: director / admin / coordinator. Lead and volunteer do not
-- see the raw event ledger (their views come from taller_asistencias
-- / taller_reportes / taller_inscripciones — purpose-built tables).
CREATE POLICY "taller_eventos_select"
  ON public.taller_eventos FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
  );

-- INSERT: director / admin / coordinator (write role) — system actors
-- write events; service_role bypasses RLS for the writer job.
CREATE POLICY "taller_eventos_insert"
  ON public.taller_eventos FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- UPDATE: forbidden at RLS layer (USING false). The emitted_to_outbox
-- flip is performed by service_role, which bypasses RLS. Authenticated
-- users cannot mutate historical events.
CREATE POLICY "taller_eventos_update"
  ON public.taller_eventos FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE: forbidden. Events are append-only by contract.
CREATE POLICY "taller_eventos_delete"
  ON public.taller_eventos FOR DELETE
  USING (false);

-- service_role bypass for the writer job (drain emitted_to_outbox +
-- INSERT to operating_core_participation_eventos).
GRANT SELECT, INSERT, UPDATE ON TABLE public.taller_eventos TO service_role;
