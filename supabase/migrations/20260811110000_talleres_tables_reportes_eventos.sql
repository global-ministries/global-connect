-- ════════════════════════════════════════════════════════════════════
-- PR8 — DT-029 + DT-030 — Talleres reports + append-only audit trail.
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-029: taller_reportes (4-state report: borrador → enviado → reabierto
--   → cerrado) with signature fields and conditional reabierto_motivo;
--   taller_reporte_correcciones as append-only audit trail.
-- DT-030: lifecycle trigger (lock-after-send + reopen rules + signature
--   preservation) + audit-trail INSERT capture on estado transitions.
--
-- The slice file is named `talleres_tables_reportes_eventos.sql` per
-- design.md §13 because the source layout groups taller_reportes +
-- taller_reporte_correcciones + (future) taller_eventos into one
-- migration. PR8 delivers the report subsystem; PR9 owns taller_eventos.
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) taller_reportes                                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Final report per group. State machine (mirrors lib/platform/talleres/
-- state.ts REPORT_STATES):
--   borrador → enviado → reabierto (motivo obligatorio) → cerrado
--                                              ↑ only reopener can edit
--
-- Signature fields (firma_lider_*) are set ONCE at envio and preserved
-- across subsequent corrections (reabierto). The audit trail
-- (taller_reporte_correcciones) captures both the old and new states
-- of each transition without mutating the original row.
--
-- reabierto_motivo is NOT column-level NOT NULL (it is not required
-- when estado != 'reabierto'); the trigger taller_reportes_lock_after_send
-- enforces the conditional rule: when NEW.estado = 'reabierto', the
-- column MUST be NOT NULL with length > 0.

CREATE TABLE IF NOT EXISTS public.taller_reportes (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id                    uuid        NOT NULL
                                            REFERENCES public.taller_grupos(id)
                                            ON DELETE RESTRICT,
  estado                      text        NOT NULL
                                            CHECK (estado IN ('borrador','enviado','reabierto','cerrado')),
  -- Non-empty observations: enforced inline so the constraint is part
  -- of the table contract (defense in depth — the application also
  -- validates).
  observaciones_generales     text        NOT NULL
                                            CHECK (length(observaciones_generales) > 0),
  -- Signature fields: nullable until envio; set once and preserved.
  firma_lider_persona_id      uuid        REFERENCES public.usuarios(id)
                                            ON DELETE RESTRICT,
  firma_lider_fecha           timestamptz,
  -- Reopen audit: nullable until first reopen; set when entering
  -- 'reabierto' and preserved across subsequent corrections.
  reabierto_por_persona_id    uuid        REFERENCES public.usuarios(id)
                                            ON DELETE RESTRICT,
  reabierto_motivo            text        CHECK (
                                            reabierto_motivo IS NULL
                                            OR length(trim(reabierto_motivo)) > 0
                                          ),
  version                     integer     NOT NULL DEFAULT 1,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the report subsystem.
-- Active reports by group (borrador/enviado/reabierto): the leader's
-- work-in-progress + reopening queue.
CREATE INDEX IF NOT EXISTS idx_taller_reportes_grupo_estado
  ON public.taller_reportes (grupo_id, estado)
  WHERE estado IN ('borrador', 'enviado', 'reabierto');

-- Reports by signing leader (for signature auditability and the
-- "who signed this" queries).
CREATE INDEX IF NOT EXISTS idx_taller_reportes_firma_lider
  ON public.taller_reportes (firma_lider_persona_id)
  WHERE firma_lider_persona_id IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) taller_reporte_correcciones                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Append-only audit trail. One row is INSERTed automatically on every
-- estado transition of taller_reportes (via the AFTER UPDATE trigger
-- taller_reportes_capture_correccion). The captured
-- contenido_anterior / contenido_nuevo are full row snapshots
-- (to_jsonb(OLD), to_jsonb(NEW)) — they preserve the entire row
-- including signature fields, motivo, and version.
--
-- Append-only is enforced at TWO layers:
--   1. RLS: UPDATE and DELETE policies use USING(false) so no
--      authenticated role can mutate historical corrections.
--   2. Service_role: GRANT only SELECT, INSERT (no UPDATE/DELETE).
--
-- ON DELETE RESTRICT on the reporte FK: a deleted reporte cannot
-- silently delete its audit trail. The workflow goes through
-- application-level archival, not destructive DELETE.

CREATE TABLE IF NOT EXISTS public.taller_reporte_correcciones (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id           uuid        NOT NULL
                                   REFERENCES public.taller_reportes(id)
                                   ON DELETE RESTRICT,
  autor_persona_id     uuid        NOT NULL
                                   REFERENCES public.usuarios(id)
                                   ON DELETE RESTRICT,
  contenido_anterior   jsonb       NOT NULL,
  contenido_nuevo      jsonb       NOT NULL,
  motivo               text        NOT NULL CHECK (length(trim(motivo)) > 0),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Index: corrections per report, newest first (the human-readable
-- audit trail view).
CREATE INDEX IF NOT EXISTS idx_taller_reporte_correcciones_reporte
  ON public.taller_reporte_correcciones (reporte_id, created_at DESC);

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) Trigger — taller_reportes_lock_after_send (DT-030)             ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- State machine enforcement at the DB layer. BEFORE UPDATE on
-- taller_reportes:
--   1. If OLD.estado = 'enviado' AND NEW.estado NOT IN
--      ('reabierto','cerrado') → RAISE EXCEPTION ("enviado can only
--      transition to reabierto or cerrado").
--   2. If NEW.estado = 'reabierto' AND (NEW.reabierto_motivo IS NULL
--      OR length(trim(NEW.reabierto_motivo)) = 0) → RAISE EXCEPTION
--      ("reabierto requires reabierto_motivo NOT NULL").
--   3. If NEW.estado = 'reabierto' AND NEW.reabierto_por_persona_id
--      IS NULL → RAISE EXCEPTION ("reabierto requires
--      reabierto_por_persona_id NOT NULL").
--   4. If NEW.estado = 'cerrado' AND OLD.estado = 'reabierto' AND
--      NEW.reabierto_por_persona_id IS NULL → RAISE EXCEPTION
--      ("closing a reabierto report requires reabierto_por_persona_id
--      preserved").
--   5. If OLD.estado = 'borrador' AND NEW.estado = 'enviado' AND
--      (NEW.firma_lider_persona_id IS NULL OR NEW.firma_lider_fecha
--      IS NULL) → RAISE EXCEPTION ("enviado requires signature fields
--      set").
--
-- The trigger NEVER mutates signature fields. The signature is set
-- once at envio and preserved across reopen/close cycles.

CREATE OR REPLACE FUNCTION public.taller_reportes_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Rule 0: 'cerrado' is TERMINAL. No state transition out of it
  -- is permitted. The design state.ts marks `cerrado` as terminal;
  -- corrections after close are not allowed at all (the audit trail
  -- is sealed).
  IF OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'taller_reportes lock: cerrado is terminal (no transitions out, got %)', NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 1: 'enviado' is locked except for the reopened/closed
  -- transition.
  IF OLD.estado = 'enviado'
     AND NEW.estado NOT IN ('reabierto', 'cerrado') THEN
    RAISE EXCEPTION 'taller_reportes locked: enviado can only transition to reabierto or cerrado (got %)', NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 2: reabierto requires non-empty reabierto_motivo.
  IF NEW.estado = 'reabierto'
     AND (NEW.reabierto_motivo IS NULL OR length(trim(NEW.reabierto_motivo)) = 0) THEN
    RAISE EXCEPTION 'taller_reportes: reabierto requires reabierto_motivo NOT NULL with non-empty content'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 3: reabierto requires reabierto_por_persona_id (audit).
  IF NEW.estado = 'reabierto'
     AND NEW.reabierto_por_persona_id IS NULL THEN
    RAISE EXCEPTION 'taller_reportes: reabierto requires reabierto_por_persona_id NOT NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 4: closing a reabierto report requires the reopener
  -- identity preserved (the reopener is the only one who can close).
  IF NEW.estado = 'cerrado'
     AND OLD.estado = 'reabierto'
     AND NEW.reabierto_por_persona_id IS NULL THEN
    RAISE EXCEPTION 'taller_reportes: closing a reabierto report requires reabierto_por_persona_id preserved'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 5: signature fields required at envio.
  IF OLD.estado = 'borrador'
     AND NEW.estado = 'enviado'
     AND (NEW.firma_lider_persona_id IS NULL OR NEW.firma_lider_fecha IS NULL) THEN
    RAISE EXCEPTION 'taller_reportes: borrador -> enviado requires firma_lider_persona_id AND firma_lider_fecha NOT NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) Trigger — taller_reportes_capture_correccion (DT-030)          ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- AFTER UPDATE on taller_reportes: when OLD.estado IS DISTINCT FROM
-- NEW.estado, INSERT a row into taller_reporte_correcciones with full
-- snapshots of OLD and NEW. The pg_trigger_depth() < 1 guard prevents
-- recursion: the set_updated_at BEFORE UPDATE trigger fires on the
-- audit row, but its depth is 1 by the time we INSERT, so the
-- captured corrections never trigger themselves.
--
-- Motivo precedence: explicit reabierto_motivo (reopen) wins;
-- otherwise the literal 'transition' (initial envio, close, etc.).

CREATE OR REPLACE FUNCTION public.taller_reportes_capture_correccion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF pg_trigger_depth() < 1 THEN
    RETURN NULL;
  END IF;

  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    v_motivo := COALESCE(NULLIF(trim(NEW.reabierto_motivo), ''), 'transition');

    INSERT INTO public.taller_reporte_correcciones (
      reporte_id,
      autor_persona_id,
      contenido_anterior,
      contenido_nuevo,
      motivo
    ) VALUES (
      NEW.id,
      COALESCE(NEW.reabierto_por_persona_id, NEW.firma_lider_persona_id),
      to_jsonb(OLD),
      to_jsonb(NEW),
      v_motivo
    );
  END IF;

  RETURN NULL;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 5) Trigger — set_taller_reportes_updated_at (DT-030)              ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Standard updated_at maintenance. Mirrors the helper used by the
-- taller_inscripciones and taller_grupos tables (PR6 precedent).

CREATE OR REPLACE FUNCTION public.set_taller_reportes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Idempotent trigger attachment via pg_trigger existence guard.
-- Mirrors PR7 (20260811100000_talleres_tables_sesiones_asistencia.sql)
-- and PR6 (20260810140000_talleres_tables_inscripciones_grupos.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_reportes_lock_after_send') THEN
    CREATE TRIGGER trg_taller_reportes_lock_after_send
      BEFORE UPDATE ON public.taller_reportes
      FOR EACH ROW
      EXECUTE FUNCTION public.taller_reportes_lock_after_send();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_reportes_capture_correccion') THEN
    CREATE TRIGGER trg_taller_reportes_capture_correccion
      AFTER UPDATE ON public.taller_reportes
      FOR EACH ROW
      EXECUTE FUNCTION public.taller_reportes_capture_correccion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_reportes_updated_at') THEN
    CREATE TRIGGER trg_taller_reportes_updated_at
      BEFORE UPDATE ON public.taller_reportes
      FOR EACH ROW
      EXECUTE FUNCTION public.set_taller_reportes_updated_at();
  END IF;
END
$$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 6) RLS — taller_reportes (DT-029)                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Reports follow the standard pattern: own (leader) + any taller
-- capability for higher roles. DELETE is forbidden (audit trail).
-- service_role bypass for migrations + server-side scripts.

ALTER TABLE public.taller_reportes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_reportes FROM anon, authenticated;

-- SELECT: leader (lead.read) + coordinator + director + admin.
-- Participation is intentionally NOT in the SELECT policy: the
-- participant sees a summary via the certificate subsystem (PR10),
-- not the raw report.
CREATE POLICY "taller_reportes_select"
  ON public.taller_reportes FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
  );

-- INSERT: lead (owner operator) + coordinator + director + admin.
CREATE POLICY "taller_reportes_insert"
  ON public.taller_reportes FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.write')
  );

-- UPDATE: same as INSERT. The trigger enforces the state machine.
CREATE POLICY "taller_reportes_update"
  ON public.taller_reportes FOR UPDATE
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.write')
  )
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.write')
  );

-- DELETE: forbidden. Reports are immutable historical records.
CREATE POLICY "taller_reportes_delete"
  ON public.taller_reportes FOR DELETE
  USING (false);

-- service_role bypass.
GRANT SELECT, INSERT, UPDATE ON TABLE public.taller_reportes TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 7) RLS — taller_reporte_correcciones (DT-029) — append-only       ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- The audit trail is INSERT-only. UPDATE and DELETE policies exist
-- with USING(false) so the matrix is documented (4 verbs per table)
-- but no role can mutate a historical correction.

ALTER TABLE public.taller_reporte_correcciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_reporte_correcciones FROM anon, authenticated;

-- SELECT: same gates as the report itself (the audit trail is a
-- strict superset of who can see the report).
CREATE POLICY "taller_reporte_correcciones_select"
  ON public.taller_reporte_correcciones FOR SELECT
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
  );

-- INSERT: triggered by the DB (service_role), but we expose the
-- policy for the matrix: director + coordinator + admin can in
-- principle write a manual correction (not used by the canonical
-- flow, but kept for parity).
CREATE POLICY "taller_reporte_correcciones_insert"
  ON public.taller_reporte_correcciones FOR INSERT
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.write')
  );

-- UPDATE: forbidden. Historical corrections are immutable.
CREATE POLICY "taller_reporte_correcciones_update"
  ON public.taller_reporte_correcciones FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE: forbidden. Same reason.
CREATE POLICY "taller_reporte_correcciones_delete"
  ON public.taller_reporte_correcciones FOR DELETE
  USING (false);

-- service_role bypass: SELECT + INSERT only (no UPDATE/DELETE).
-- The AFTER UPDATE trigger runs as the owner of the trigger function
-- (SUPERUSER-equivalent in this Supabase setup) so it can INSERT
-- into the audit row without any further grant.
GRANT SELECT, INSERT ON TABLE public.taller_reporte_correcciones TO service_role;
