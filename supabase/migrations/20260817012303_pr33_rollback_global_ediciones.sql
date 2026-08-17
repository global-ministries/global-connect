-- ═══════════════════════════════════════════════════════════════════
-- PR33 — Rollback of the ediciones globales model (PR29-B/C/D/E/F.1/31/32).
--
-- The roadmap maestro (Fase 5) does NOT include ediciones globales
-- as a model entity. The user's mental model is:
--   - Taller abstracto = stable catalogue entry (public.talleres)
--   - Edición local (public.taller_ediciones) = a specific occurrence
--     with cohort + sesiones + inscripciones
--   - Recurrence rule jsonb (PR11) = auto-generates local ediciones
--   - Reporting = GROUP BY date in TypeScript, no model entity needed
--
-- This migration removes the model surface added in PR29-B/C/D/E/F.1/31/32:
--
--   1. DROP the compat view v_taller_periodos_generales_compat that
--      projects `edicion_global_id` (must happen BEFORE the column
--      drop — the view depends on the column).
--   2. DROP the partial index on taller_ediciones(edicion_global_id)
--      (must happen BEFORE the column drop — Postgres cannot drop an
--      index that depends on a column without CASCADE).
--   3. DROP COLUMN public.taller_ediciones.edicion_global_id.
--   4. DROP the trigger function fn_set_updated_at_taller_ediciones_globales
--      (the trigger on the table being dropped below will be removed
--      by CASCADE; function is dedicated to that table so it is safe
--      to drop).
--   5. DROP FUNCTION create_edicion_global, open_edicion_global,
--      close_edicion_global, cancel_edicion_global (idempotent).
--   6. Removes the global ediciones table (CASCADE drops the
--      trigger + dependent objects).
--   7. RECREATE the compat view v_taller_periodos_generales_compat
--      WITHOUT the edicion_global_id projection — the pg_cron
--      'talleres_period_closer' still reads taller_periodos_generales
--      directly (it does NOT use this view), but the view is a
--      documented compat surface for future migrations (PR29-E).
--      The view body is restored minus the dropped column.
--
-- The deprecation marker on taller_periodos_generales (PR29-E) is
-- intentionally preserved — "PR33-F.1 (future) will deal with that".
-- The view is kept functional so legacy readers (cron closer, SQL
-- observability) keep working.
--
-- The pre-PR29 local ediciones flow (PR23.2b table rename,
-- recurrence_rule jsonb, PR11 closer) is untouched.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Drop the compat view BEFORE the column drop ─────────────────────
-- The view projects taller_ediciones.edicion_global_id. Dropping
-- the column without dropping the view first would either fail (if
-- RESTRICT) or destroy the view (if CASCADE). We drop + recreate
-- explicitly so the deprecation surface stays documented.

DROP VIEW IF EXISTS public.v_taller_periodos_generales_compat;

-- ── 2) Drop the partial index on taller_ediciones(edicion_global_id) ──
-- The index lives WHERE edicion_global_id IS NOT NULL. It is defined
-- in PR29-B and is the only index that depends on the column. Drop
-- it explicitly so the column drop is a clean ALTER TABLE … DROP
-- COLUMN (no implicit CASCADE behavior).

DROP INDEX IF EXISTS public.idx_taller_ediciones_edicion_global;

-- ── 3) Drop the FK column on taller_ediciones ─────────────────────────
-- The column is nullable. All 4 prod rows have edicion_global_id IS
-- NULL after the PR31 backfill, so no data loss.

ALTER TABLE public.taller_ediciones
  DROP COLUMN IF EXISTS edicion_global_id;

-- ── 4) Drop the 4 RPCs (idempotent) ──────────────────────────────────
DROP FUNCTION IF EXISTS public.create_edicion_global(text, text, text, timestamptz, timestamptz, uuid[]);
DROP FUNCTION IF EXISTS public.open_edicion_global(uuid);
DROP FUNCTION IF EXISTS public.close_edicion_global(uuid, boolean);
DROP FUNCTION IF EXISTS public.cancel_edicion_global(uuid, text);

-- ── 5) Drop the global ediciones table (CASCADE removes the trigger) ─
-- The trigger function dedicated to this table is dropped separately
-- below (DROP TABLE CASCADE drops the trigger but keeps the function).
DROP TABLE IF EXISTS public.taller_ediciones_globales CASCADE;

-- ── 6) Drop the now-orphaned trigger function ─────────────────────────
-- Public.fn_set_updated_at_taller_ediciones_globales only fired on
-- the dropped table. No other code uses it. Drop it to keep the
-- function catalog clean.

DROP FUNCTION IF EXISTS public.fn_set_updated_at_taller_ediciones_globales();

-- ── 7) Recreate the compat view WITHOUT edicion_global_id ────────────
-- The view is a documented compat surface for taller_periodos_generales
-- (PR29-E). PG cron 'talleres_period_closer' reads the legacy table
-- directly — this view is the stable read path for SQL observability
-- tools that want to JOIN the legacy rows with the canonical
-- taller_ediciones metadata. The body is the PR29-E definition minus
-- the dropped `te.edicion_global_id` projection.

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
  te.estado AS taller_estado,
  te.tipo   AS taller_tipo
FROM public.taller_periodos_generales tpg
JOIN public.taller_ediciones te ON te.id = tpg.taller_id;

COMMENT ON VIEW public.v_taller_periodos_generales_compat IS
  'Compat read path for taller_periodos_generales (PR29-E, view body refreshed in PR33 rollback). Joins legacy rows with taller_ediciones to expose estado and tipo. USE taller_ediciones.recurrence_rule (PR11) for new recurring editions instead of taller_periodos_generales. The legacy table remains readable but INSERTs are gated to service_role / postgres.';
