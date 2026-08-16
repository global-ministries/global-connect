-- ══════════════════════════════════════════════════════════════════════════════
-- PR29-E — Deprecation marker for taller_periodos_generales.
--
-- The global ediciones model (PR29-B/C/D) supersedes per-local
-- taller_periodos_generales for the new flow. Three legacy code paths still
-- depend on this table:
--
--   - pg_cron job 'talleres_period_closer' (PR11) — reads
--     taller_periodos_generales.fecha_cierre_real.
--   - Legacy RPC open_edicion (PR23.2a) — inserts a row here when
--     modalidad = 'periodo_general'.
--   - Column taller_ediciones.periodo_general_id (FK to this table, nullable).
--
-- Today the 4 prod talleres already have rows in taller_periodos_generales with
-- their fecha_cierre_real set. PR29-E deprecates the table without breaking
-- any of those readers. Strategy (additive + safe):
--
--   1. COMMENT ON marks the table as deprecated with a clear drop date.
--   2. BEFORE INSERT trigger blocks any direct INSERTs that do NOT come from
--      service_role / postgres. SECURITY DEFINER RPCs already run as the
--      table owner (postgres), so legacy open_edicion keeps working without
--      code changes.
--   3. Compat view v_taller_periodos_generales_compat gives a stable read
--      path that joins the legacy rows with the canonical taller_ediciones
--      (PR23.2b renamed talleres_crecimiento_metadata) — exposes
--      taller_estado, taller_tipo, and edicion_global_id for callers that
--      want to migrate off the legacy table.
--   4. No DROP. Cleanup pending >30d after the trigger has rejected all
--      direct INSERTs (legacy SECURITY DEFINER paths excluded).
--
-- Out of scope for PR29 (per design.md §5):
--   - DROP of taller_periodos_generales.
--   - Migrating the pg_cron 'talleres_period_closer' (it still reads
--     taller_periodos_generales.fecha_cierre_real directly).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1) Deprecation comment ────────────────────────────────────────────────────
COMMENT ON TABLE public.taller_periodos_generales IS
  'DEPRECATED 2026-08-16 (PR29-E). Use taller_ediciones_globales + taller_ediciones for new flow. This table kept for pg_cron talleres_period_closer backward compat and legacy open_edicion RPC. Drop planned after >30d with no direct INSERTs (service_role excluded from the count).';

-- ── 2) Block direct INSERTs (only service_role / postgres bypasses) ──────────
-- SECURITY DEFINER functions (open_edicion, create_edicion_global) run as the
-- table owner (postgres), which is_superuser='on', so they bypass this gate.
-- Direct INSERTs from anon / authenticated roles will be rejected with the
-- exception below. UPDATE / DELETE are intentionally NOT blocked — the cron
-- job and admin tooling may still mutate existing rows.
CREATE OR REPLACE FUNCTION public.assert_no_direct_taller_periodo_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  -- Postgres superuser bypasses (used by SECURITY DEFINER RPCs).
  IF current_setting('is_superuser') = 'on' OR session_user = 'postgres' THEN
    RETURN NEW;
  END IF;
  -- service_role bypasses the check (Supabase service_role bypasses RLS and
  -- also holds INSERT grants on this table for admin tooling).
  IF current_setting('role')::text = 'service_role' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'taller_periodos_generales is deprecated (PR29-E). Use the new RPCs create_edicion_global / open_edicion_global from taller_ediciones_globales, or insert via service_role for legacy compat.'
    USING ERRCODE = 'P0001';
END;
$func$;

DROP TRIGGER IF EXISTS trg_block_direct_taller_periodo_insert
  ON public.taller_periodos_generales;
CREATE TRIGGER trg_block_direct_taller_periodo_insert
  BEFORE INSERT ON public.taller_periodos_generales
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_direct_taller_periodo_insert();

-- ── 3) Compat view for the cron closer (and future migrations) ───────────────
-- The legacy pg_cron 'talleres_period_closer' reads taller_periodos_generales
-- directly today — that read path is preserved untouched. This view is the
-- stable compat surface for callers that want to JOIN the legacy rows with
-- the canonical taller_ediciones metadata.
--
-- NOTE: PR23.2b renamed `talleres_crecimiento_metadata` -> `taller_ediciones`
-- on prod. The view JOINs the new name. The legacy FK
-- `taller_periodos_generales.taller_id REFERENCES taller_ediciones(id)` is
-- what we surface here.
CREATE OR REPLACE VIEW public.v_taller_periodos_generales_compat AS
SELECT
  tpg.id,
  tpg.taller_id,
  tpg.edicion_label,
  tpg.fecha_apertura_automatica,
  tpg.fecha_cierre_automatico,
  tpg.fecha_apertura_manual,
  tpg.fecha_cierre_manual,
  tpg.fecha_cierre_real,
  tpg.motivo_cierre,
  tpg.version,
  tpg.created_at,
  -- Joined canonical metadata (post-PR23.2b rename):
  te.estado          AS taller_estado,
  te.tipo            AS taller_tipo,
  te.edicion_global_id
FROM public.taller_periodos_generales tpg
JOIN public.taller_ediciones te ON te.id = tpg.taller_id;

COMMENT ON VIEW public.v_taller_periodos_generales_compat IS
  'Compat read path for taller_periodos_generales (PR29-E). Joins legacy rows with taller_ediciones to expose estado, tipo, and edicion_global_id. Use this view from new code; the legacy table remains readable but INSERTs are gated to service_role / postgres.';

-- ── 4) (No DROP. Cleanup pending >30d after direct INSERTs stop.) ────────────