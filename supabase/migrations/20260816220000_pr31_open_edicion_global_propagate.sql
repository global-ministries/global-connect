-- ════════════════════════════════════════════════════════════════════
-- PR31 — open_edicion_global propagates to local ediciones.
--
-- Bug fixed by PR31:
--   open_edicion_global (added in PR29-C) only updated the
--   taller_ediciones_globales row. It also propagated to locales, but
--   via the junction table taller_edicion_global_participantes. The
--   production data flow for associating talleres to a global was
--   actually `taller_ediciones.edicion_global_id` (the FK column,
--   added in PR29-B and backfilled in PR29-F.1). The junction was
--   never populated for the current production set of 4 locales —
--   so open_edicion_global(a17d9ea9…) flipped the global to 'abierto'
--   but left every local in 'borrador', and /talleres/explorar showed
--   nothing.
--
-- Decision (per design):
--   Model A: `taller_ediciones.edicion_global_id` is the source of
--   truth. The junction table is dropped and the propagation logic
--   in the 3 state-transition RPCs now walks via the FK column.
--
-- Changes:
--   1. DROP taller_edicion_global_participantes (and the optional
--      view v_taller_ediciones_globales_con_participantes if it
--      exists).
--   2. Recreate open_edicion_global to UPDATE locales via
--      `taller_ediciones.edicion_global_id = p_id`.
--   3. Recreate close_edicion_global with the same FK-driven locale
--      lookup (the active-enrollment guard is unchanged).
--   4. Recreate cancel_edicion_global — the design says the global
--      state is authoritative, so cancel does NOT modify locales; the
--      previous junction DELETE is removed because the junction no
--      longer exists.
--   5. Recreate create_edicion_global so p_taller_ids is accepted
--      (signature compatibility) but ignored — taller associations
--      are now managed by setting taller_ediciones.edicion_global_id
--      directly via SQL or via the legacy open_edicion /
--      create_taller_with_initial_state flows.
--   6. DROP add_taller_to_edicion_global and
--      remove_taller_from_edicion_global — they operated on the
--      junction that no longer exists. The detail page now uses
--      direct SQL writes to taller_ediciones.edicion_global_id.
--   7. Comments left on the surviving functions explaining the
--      junction drop so future agents do not try to restore it.
--
-- No toca archivos protegidos (invariante I-6: no DROP sobre tablas
-- de datos de otros dominios; solo DROP de la junction propia del
-- feature PR29-C).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Drop junction table ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.taller_edicion_global_participantes CASCADE;

-- Drop the optional view that referenced it (idempotent — it was
-- never created in any migration we ship, but a stale local branch
-- could have it).
DROP VIEW IF EXISTS public.v_taller_ediciones_globales_con_participantes;

-- ── 2. Recreate open_edicion_global ──────────────────────────────────
--
-- The new propagation walks via taller_ediciones.edicion_global_id.
-- Locales are flipped from 'borrador' to 'abierto' in the same
-- transaction as the global state transition. The previous RAISE
-- NOTICE about fecha_apertura > now() is preserved (admin may open
-- early; the warning is informative, not blocking).
--
-- Capability gate (unchanged from PR29-C): director.write OR
-- admin.manage.

CREATE OR REPLACE FUNCTION public.open_edicion_global(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id          uuid;
  v_cap_ok           boolean;
  v_estado           text;
  v_fecha_apertura   timestamptz;
  v_locales_count    int;
BEGIN
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

  -- Lock the global row to serialize concurrent transitions.
  SELECT estado, fecha_apertura
    INTO v_estado, v_fecha_apertura
    FROM public.taller_ediciones_globales
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'INVALID_STATE: edicion_global must be in borrador (actual=%)',
      v_estado
      USING ERRCODE = 'P0001';
  END IF;

  -- Update global
  UPDATE public.taller_ediciones_globales
     SET estado = 'abierto',
         version = version + 1,
         updated_at = now()
   WHERE id = p_id;

  -- Propagate to locales in the same transaction: any
  -- taller_ediciones row whose edicion_global_id points at this
  -- global AND that is still in 'borrador' gets flipped to 'abierto'.
  -- This is the fix for the bug reported in PR31: the previous
  -- implementation walked the junction table (which was empty for
  -- the production data) and so left all locales in borrador.
  UPDATE public.taller_ediciones
     SET estado = 'abierto'
   WHERE edicion_global_id = p_id
     AND estado = 'borrador';

  GET DIAGNOSTICS v_locales_count = ROW_COUNT;

  -- Informational notice when opening before the scheduled
  -- fecha_apertura. Does NOT abort — admin may intentionally open
  -- early.
  IF v_fecha_apertura IS NOT NULL AND v_fecha_apertura > now() THEN
    RAISE NOTICE 'OPEN_BEFORE_FECHA_APERTURA: fecha_apertura=%', v_fecha_apertura;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado', 'abierto',
    'locales_abiertas', v_locales_count
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.open_edicion_global(uuid) TO authenticated;

COMMENT ON FUNCTION public.open_edicion_global(uuid) IS
  'PR31: propagates estado=abierto to taller_ediciones rows whose edicion_global_id = p_id. The previous junction-table propagation was removed when taller_edicion_global_participantes was dropped — taller_ediciones.edicion_global_id is now the source of truth.';

-- ── 3. Recreate close_edicion_global ─────────────────────────────────
--
-- Same FK-driven lookup as open. Two branches:
--   - p_force_local = true  → flip every associated local NOT in
--     (cerrado, cancelado) to cerrado.
--   - p_force_local = false → flip locales that have no active
--     inscription in taller_inscripciones (estado IN pendiente|aprobado).
--     Locales with active inscriptions stay open and are counted in
--     `locales_no_cerradas`.

CREATE OR REPLACE FUNCTION public.close_edicion_global(
  p_id           uuid,
  p_force_local  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id            uuid;
  v_cap_ok             boolean;
  v_estado             text;
  v_cerradas_count     int := 0;
  v_no_cerradas_count  int := 0;
  v_loc                record;
BEGIN
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

  -- Lock the global row.
  SELECT estado INTO v_estado
    FROM public.taller_ediciones_globales
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'abierto' THEN
    RAISE EXCEPTION 'INVALID_STATE: edicion_global must be in abierto (actual=%)',
      v_estado
      USING ERRCODE = 'P0001';
  END IF;

  -- Update global.
  UPDATE public.taller_ediciones_globales
     SET estado = 'cerrado',
         version = version + 1,
         updated_at = now()
   WHERE id = p_id;

  -- Propagate to locales.
  IF p_force_local THEN
    -- Force-close all locales (skip already-closed/cancelled).
    UPDATE public.taller_ediciones
       SET estado = 'cerrado'
     WHERE edicion_global_id = p_id
       AND estado NOT IN ('cerrado', 'cancelado');
    GET DIAGNOSTICS v_cerradas_count = ROW_COUNT;
    v_no_cerradas_count := 0;
  ELSE
    -- Respect inscriptions activas: locales with pendiente|aprobado
    -- stay open; the rest are closed.
    FOR v_loc IN
      SELECT id FROM public.taller_ediciones
      WHERE edicion_global_id = p_id
        AND estado = 'abierto'
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.taller_inscripciones
        WHERE taller_id = v_loc.id
          AND estado IN ('pendiente', 'aprobado')
      ) THEN
        v_no_cerradas_count := v_no_cerradas_count + 1;
      ELSE
        UPDATE public.taller_ediciones
           SET estado = 'cerrado'
         WHERE id = v_loc.id;
        v_cerradas_count := v_cerradas_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado', 'cerrado',
    'locales_cerradas', v_cerradas_count,
    'locales_no_cerradas', v_no_cerradas_count,
    'force_local', p_force_local
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.close_edicion_global(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.close_edicion_global(uuid, boolean) IS
  'PR31: closes locales by walking taller_ediciones.edicion_global_id = p_id (junction table was dropped). Locales with active inscriptions (pendiente|aprobado) are preserved unless p_force_local = true.';

-- ── 4. Recreate cancel_edicion_global ────────────────────────────────
--
-- Cancel is terminal and does NOT mutate locales by design (the
-- global state is authoritative; locales stay associated until the
-- admin re-points them). The previous junction DELETE was removed
-- because the junction no longer exists.

CREATE OR REPLACE FUNCTION public.cancel_edicion_global(
  p_id     uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  uuid;
  v_cap_ok   boolean;
  v_estado   text;
BEGIN
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

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 1 THEN
    RAISE EXCEPTION 'MOTIVO_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Lock the global row.
  SELECT estado INTO v_estado
    FROM public.taller_ediciones_globales
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado NOT IN ('borrador', 'abierto') THEN
    RAISE EXCEPTION 'INVALID_STATE: edicion_global must be in borrador|abierto (actual=%)',
      v_estado
      USING ERRCODE = 'P0001';
  END IF;

  -- Update global state. Locales are intentionally left untouched —
  -- the design keeps the FK on taller_ediciones.edicion_global_id so
  -- admins can re-open them under a new global.
  UPDATE public.taller_ediciones_globales
     SET estado = 'cancelado',
         version = version + 1,
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado', 'cancelado',
    'motivo', p_motivo
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.cancel_edicion_global(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_edicion_global(uuid, text) IS
  'PR31: cancellation is terminal for the global; locales keep their FK to the cancelled global until the admin re-points them. The previous junction DELETE was removed because taller_edicion_global_participantes was dropped.';

-- ── 5. Recreate create_edicion_global (signature compat) ─────────────
--
-- p_taller_ids is preserved for client compatibility (the form
-- still posts a non-empty array), but the parameter is IGNORED.
-- Taller associations are now managed by setting
-- taller_ediciones.edicion_global_id directly. The new-association
-- path lives in the admin UI and writes via SQL (or via the legacy
-- create_taller_with_initial_state RPC for fresh talleres).

CREATE OR REPLACE FUNCTION public.create_edicion_global(
  p_nombre         text,
  p_slug           text,
  p_descripcion    text,
  p_fecha_apertura timestamptz,
  p_fecha_cierre   timestamptz,
  p_taller_ids     uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  uuid;
  v_cap_ok   boolean;
  v_new_id   uuid;
BEGIN
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

  IF p_nombre IS NULL OR length(p_nombre) < 2 OR length(p_nombre) > 120 THEN
    RAISE EXCEPTION 'INVALID_NOMBRE_LENGTH' USING ERRCODE = '22023';
  END IF;

  IF p_slug IS NULL
     OR p_slug !~ '^[a-z0-9-]+$'
     OR length(p_slug) < 2
     OR length(p_slug) > 80
     OR p_slug = '__legacy__'
     OR p_slug = 'legacy-pre-pr29' THEN
    RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
  END IF;

  IF p_fecha_apertura IS NULL OR p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'FECHAS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_cierre <= p_fecha_apertura THEN
    RAISE EXCEPTION 'FECHA_CIERRE_BEFORE_APERTURA' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.taller_ediciones_globales (
    nombre, slug, descripcion,
    fecha_apertura, fecha_cierre,
    estado, created_by_persona_id
  )
  VALUES (
    p_nombre, p_slug, p_descripcion,
    p_fecha_apertura, p_fecha_cierre,
    'borrador', v_user_id
  )
  RETURNING id INTO v_new_id;

  -- p_taller_ids is intentionally IGNORED (junction dropped in PR31).
  -- Taller associations are managed out-of-band via UPDATE
  -- taller_ediciones SET edicion_global_id = v_new_id WHERE id = ANY(...)
  -- or via the admin UI which does the same.
  IF p_taller_ids IS NOT NULL AND array_length(p_taller_ids, 1) > 0 THEN
    RAISE NOTICE 'CREATE_EDICION_GLOBAL_IGNORES_TALLER_IDS: % taller ids dropped (junction removed in PR31). Set taller_ediciones.edicion_global_id manually.',
      array_length(p_taller_ids, 1);
  END IF;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'slug', p_slug,
    'estado', 'borrador'
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_edicion_global(text, text, text, timestamptz, timestamptz, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_edicion_global(text, text, text, timestamptz, timestamptz, uuid[]) IS
  'PR31: p_taller_ids is accepted for client compatibility but IGNORED. The taller_edicion_global_participantes junction was dropped in PR31; taller associations are now managed by setting taller_ediciones.edicion_global_id directly (admin UI writes via SQL on the table).';

-- ── 6. Drop junction-only RPCs ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_taller_to_edicion_global(uuid, uuid);
DROP FUNCTION IF EXISTS public.remove_taller_from_edicion_global(uuid, uuid);

-- ── 7. Re-assert grants (idempotency in case of partial prior deploy) ─
GRANT EXECUTE ON FUNCTION public.open_edicion_global(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_edicion_global(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_edicion_global(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_edicion_global(text, text, text, timestamptz, timestamptz, uuid[]) TO authenticated;