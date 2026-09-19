-- ════════════════════════════════════════════════════════════════════
-- T3 — Creating a taller requires choosing its node.
--
-- WHY: `create_taller_abstract` only ever touched `public.talleres`
-- (see 20260813000001_talleres_abstract.sql). A taller's equipo was
-- always resolved later, lazily, by `open_edicion` — and lazily means
-- orphaned: no parent, no roles (see
-- odd/tasks/talleres-equipo-en-organigrama.md, "Problema y porqué").
-- This migration moves that choice to creation time: every new taller
-- either links an existing eligible org-chart node or mints a new one
-- under a chosen parent, and leaves with its 4 standard roles seeded
-- and `talleres.dream_team_equipo_id` set — never null.
--
-- WHAT:
--   1. DROP the 4-arg create_taller_abstract (p_nombre, p_descripcion,
--      p_modalidad_default, p_slug) — replaced, not overloaded, so
--      PostgREST can never again resolve the old orphan-minting shape.
--   2. CREATE the 6-arg replacement, adding p_equipo_id and
--      p_parent_equipo_id. Exactly one of the two must be non-null:
--        - p_equipo_id (link mode): the target must exist, be activo,
--          have experiencia = 'talleres_crecimiento', have a parent
--          (not a root), have no children (a leaf), and not already
--          back another taller.
--        - p_parent_equipo_id (new mode): the target must exist and be
--          activo. A fresh dream_team_equipos row is minted under it,
--          experiencia = 'talleres_crecimiento', label = p_nombre. The
--          parent is NOT filtered by experiencia — DPS (experiencia
--          'dps') is a legitimate parent for a taller-shaped node (see
--          "Decisiones" in the task doc: "Próximo Paso" already lives
--          there).
--      Both modes then seed whichever of the 4 standard roles
--      (director, coordinador, lider, voluntario) the target equipo is
--      still missing (mirrors the idempotent NOT-EXISTS pattern from
--      20260821000003_cimiento1_talleres_seed_dream_team_roles.sql),
--      and the INSERT into `talleres` carries `dream_team_equipo_id`
--      (including on the pre-existing ON CONFLICT (slug) DO UPDATE
--      path — a taller row can never end up upserted without its
--      equipo, since we've already resolved one above; the "already
--      linked" check excludes the taller's own slug so re-submitting
--      the same taller+equipo pair is not a false conflict).
--      Everything else — nombre/descripcion/modalidad/slug validation,
--      the auth + capability gate, created_by (still not set — this
--      function never set it before this migration either), and the
--      returned JSON shape — is byte-identical to the 4-arg body.
--
--   Distinct errcodes (documented here so the app layer can switch on
--   them without parsing message text):
--     P0003  MUST_CHOOSE_EXACTLY_ONE_MODE — new to this migration.
--            P0001 is plpgsql's own default RAISE EXCEPTION code and
--            P0002 is this schema's established "not found / not
--            eligible" convention (see the 15-arg create_taller_with_
--            initial_state and 11-arg open_edicion) — P0003 is a new,
--            distinct code specifically for "you didn't pick a mode",
--            so the app can tell that apart from "the pick you made
--            doesn't exist or doesn't qualify" without string-matching.
--     P0002  every link/new-mode lookup failure (EQUIPO_NOT_FOUND,
--            EQUIPO_INACTIVE, EQUIPO_WRONG_EXPERIENCE, EQUIPO_IS_ROOT,
--            EQUIPO_HAS_CHILDREN, EQUIPO_ALREADY_LINKED,
--            PARENT_EQUIPO_NOT_FOUND, PARENT_EQUIPO_INACTIVE) — same
--            category as the rest of this schema's "no such row"
--            errors; the message prefix (before the ':') distinguishes
--            each case for a friendly translation.
--     22023  unchanged: the original nombre/descripcion/modalidad/slug
--            validation shape.
--     42501  unchanged: the original auth/capability gate.
--
-- SAFETY: the signature change is a breaking change for any caller —
-- coordinated in the same deploy as the app (see "Coordinación de
-- despliegue" in the task doc; the talleres flag is off in production,
-- so this ships with no live caller). Role seeding and the equipo
-- INSERT are both idempotent/guarded (NOT EXISTS, and the new-mode
-- INSERT only ever runs once per call). REVOKE/GRANT re-applied
-- identically to the same roles as before (authenticated only).
--
-- ROLLBACK: re-run 20260813000001_talleres_abstract.sql's function
-- block (the 4-arg CREATE OR REPLACE + its REVOKE/GRANT), then
-- DROP FUNCTION public.create_taller_abstract(text, text, text, text, uuid, uuid);
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_taller_abstract(text, text, text, text);

CREATE FUNCTION public.create_taller_abstract(
  p_nombre            text,
  p_descripcion       text,
  p_modalidad_default text,
  p_slug              text,
  p_equipo_id         uuid,
  p_parent_equipo_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id          uuid;
  v_cap_ok           boolean;
  v_taller           public.talleres%ROWTYPE;
  v_normalized       text;
  v_equipo           public.dream_team_equipos%ROWTYPE;
  v_parent           public.dream_team_equipos%ROWTYPE;
  v_target_equipo_id uuid;
  v_has_children      boolean;
  v_already_linked    boolean;
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

  IF p_nombre IS NULL OR length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'NOMBRE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF length(trim(p_nombre)) > 200 THEN
    RAISE EXCEPTION 'NOMBRE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_descripcion IS NOT NULL AND length(p_descripcion) > 2000 THEN
    RAISE EXCEPTION 'DESCRIPCION_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_default NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_default USING ERRCODE = '22023';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    v_normalized := lower(regexp_replace(regexp_replace(trim(p_nombre), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));
    v_normalized := trim(BOTH '-' FROM v_normalized);
    v_normalized := left(v_normalized, 80);
    IF length(v_normalized) < 2 THEN
      RAISE EXCEPTION 'SLUG_TOO_SHORT' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_normalized := trim(p_slug);
    IF v_normalized !~ '^[a-z0-9-]+$' OR length(v_normalized) < 2 OR length(v_normalized) > 80 THEN
      RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ─── T3: choose the equipo — exactly one of link or new mode ───────
  IF (p_equipo_id IS NULL) = (p_parent_equipo_id IS NULL) THEN
    RAISE EXCEPTION 'MUST_CHOOSE_EXACTLY_ONE_MODE: se requiere exactamente uno de p_equipo_id (vincular) o p_parent_equipo_id (crear nuevo)'
      USING ERRCODE = 'P0003';
  END IF;

  IF p_equipo_id IS NOT NULL THEN
    -- Link mode.
    SELECT * INTO v_equipo FROM public.dream_team_equipos WHERE id = p_equipo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EQUIPO_NOT_FOUND: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_equipo.activo THEN
      RAISE EXCEPTION 'EQUIPO_INACTIVE: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF v_equipo.experiencia <> 'talleres_crecimiento' THEN
      RAISE EXCEPTION 'EQUIPO_WRONG_EXPERIENCE: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF v_equipo.parent_equipo_id IS NULL THEN
      RAISE EXCEPTION 'EQUIPO_IS_ROOT: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.dream_team_equipos c WHERE c.parent_equipo_id = v_equipo.id
    ) INTO v_has_children;
    IF v_has_children THEN
      RAISE EXCEPTION 'EQUIPO_HAS_CHILDREN: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    -- "Not already linked to another taller" — excludes this exact
    -- slug so a legitimate re-submit of the same taller+equipo pair
    -- (the pre-existing ON CONFLICT (slug) upsert path) is not a
    -- false conflict against itself.
    SELECT EXISTS (
      SELECT 1 FROM public.talleres t
      WHERE t.dream_team_equipo_id = v_equipo.id AND t.slug <> v_normalized
    ) INTO v_already_linked;
    IF v_already_linked THEN
      RAISE EXCEPTION 'EQUIPO_ALREADY_LINKED: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    v_target_equipo_id := v_equipo.id;
  ELSE
    -- New mode: mint a fresh equipo under an active parent.
    SELECT * INTO v_parent FROM public.dream_team_equipos WHERE id = p_parent_equipo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PARENT_EQUIPO_NOT_FOUND: %', p_parent_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_parent.activo THEN
      RAISE EXCEPTION 'PARENT_EQUIPO_INACTIVE: %', p_parent_equipo_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.dream_team_equipos (experiencia, label, parent_equipo_id, activo)
    VALUES ('talleres_crecimiento', trim(p_nombre), v_parent.id, true)
    RETURNING id INTO v_target_equipo_id;
  END IF;

  -- Seed the 4 standard taller roles on the target equipo — only the
  -- ones missing (both modes: a linked node may already carry some or
  -- all of them; a freshly minted one has none).
  INSERT INTO public.dream_team_roles (equipo_id, label)
  SELECT v_target_equipo_id, r.label
  FROM (VALUES ('director'), ('coordinador'), ('lider'), ('voluntario')) AS r(label)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_team_roles dr
    WHERE dr.equipo_id = v_target_equipo_id AND dr.label = r.label
  );

  INSERT INTO public.talleres (slug, nombre, descripcion, modalidad_default, estado, dream_team_equipo_id)
  VALUES (v_normalized, trim(p_nombre), NULLIF(trim(p_descripcion), ''), p_modalidad_default, 'active', v_target_equipo_id)
  ON CONFLICT (slug) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        dream_team_equipo_id = EXCLUDED.dream_team_equipo_id
  RETURNING * INTO v_taller;

  RETURN jsonb_build_object(
    'taller_id', v_taller.id,
    'slug', v_taller.slug,
    'nombre', v_taller.nombre,
    'modalidad_default', v_taller.modalidad_default,
    'estado', v_taller.estado
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.create_taller_abstract(text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_taller_abstract(text, text, text, text, uuid, uuid) TO authenticated;
