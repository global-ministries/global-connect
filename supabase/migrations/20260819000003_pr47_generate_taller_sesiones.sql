-- ═══════════════════════════════════════════════════════════════════
-- PR47 (restructure PR D) — generate_taller_sesiones(p_grupo_id).
--
-- Fase 5 GdV-parity restructure. Additive + forward-only. Adds ONE new
-- SECURITY DEFINER RPC that materialises a grupo's weekly sessions from
-- the edición's sesiones_snapshot (N), under the product model
--   "1 semana = 1 sesión".
--
-- WHY AN RPC (not a plain INSERT): public.taller_sesiones has a BEFORE
-- INSERT trigger (taller_sesiones_validate_insert) that REQUIRES:
--   (a) estado = 'programada' on insert, and
--   (b) sequential numero — for numero > 1, the predecessor (numero-1)
--       must already exist for the same grupo.
-- And `authenticated` has NO direct INSERT grant on taller_sesiones
-- (only service_role). So the intended write path is a SECURITY DEFINER
-- RPC that inserts numero = 1..N ASCENDING, each estado='programada'.
--
-- RESOLUTION CHAIN (grupo → cohorte → edición):
--   taller_grupos.cohorte_id
--     → talleres_crecimiento_cohortes.id
--   talleres_crecimiento_cohortes.taller_id  (references the EDICIÓN)
--     → taller_ediciones.id
--   N := taller_ediciones.sesiones_snapshot  (weeks == sessions)
-- NOTE: talleres_crecimiento_cohortes was NOT renamed (unlike
-- taller_ediciones, ex-talleres_crecimiento_metadata).
--
-- SCHEDULING: fecha_programada is a DATE. The weekly cadence anchors on
-- the cohorte's started_at (set only for modalidad='periodo_general';
-- NULL for permanente_custom), so we COALESCE to CURRENT_DATE:
--   fecha_programada(numero) = anchor + (numero - 1) * 7 days
--
-- IDEMPOTENT: re-running is a no-op — UNIQUE(grupo_id, numero) +
-- ON CONFLICT (grupo_id, numero) DO NOTHING. Partial state (e.g. 3 of 8
-- already present) is completed without duplication; the ascending loop
-- keeps the sequential trigger satisfied because each predecessor either
-- pre-exists or was inserted in an earlier iteration.
--
-- GATE: director.write OR admin.manage (same as open_edicion / PR35).
-- Called from grupo-creation (PR F), NOT on edición open (no grupo
-- exists yet at that point).
--
-- ⚠️ LIVE PRODUCTION — additive only (no DROP / TRUNCATE). Authored +
-- tested (static SQL) on a scratch DB; applying to production is the
-- operator's deploy step.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_taller_sesiones(
  p_grupo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id   uuid;
  v_cap_ok    boolean;
  v_sesiones  integer;
  v_anchor    date;
  v_numero    integer;
  v_created   integer := 0;
BEGIN
  -- 1. Auth + capability gate (director.write OR admin.manage).
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Resolve grupo → cohorte → edición: read N (sesiones_snapshot) and
  --    the weekly-cadence anchor (cohorte.started_at, may be NULL).
  SELECT e.sesiones_snapshot,
         COALESCE(c.started_at::date, CURRENT_DATE)
    INTO v_sesiones, v_anchor
    FROM public.taller_grupos g
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones e ON e.id = c.taller_id
   WHERE g.id = p_grupo_id;

  IF v_sesiones IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo % has no resolvable edición/sesiones_snapshot', p_grupo_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Materialise numero = 1..N ASCENDING (sequential-trigger safe),
  --    estado='programada', weekly cadence. Idempotent via ON CONFLICT.
  FOR v_numero IN 1..v_sesiones LOOP
    INSERT INTO public.taller_sesiones (
      grupo_id, numero, fecha_programada, estado
    ) VALUES (
      p_grupo_id, v_numero, v_anchor + ((v_numero - 1) * 7), 'programada'
    )
    ON CONFLICT (grupo_id, numero) DO NOTHING;

    IF FOUND THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'grupo_id', p_grupo_id,
    'total', v_sesiones,
    'created', v_created
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.generate_taller_sesiones(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.generate_taller_sesiones(uuid) TO authenticated;
