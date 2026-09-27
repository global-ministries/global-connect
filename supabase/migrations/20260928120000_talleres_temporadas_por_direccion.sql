-- T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — gives every
-- temporada a dueño (a Dream Team node), scopes its RLS and its junction's
-- RLS by that node's own tree, and introduces the RPCs the "temporadas por
-- dirección" screen (T5) will call to create a temporada with its first
-- batch of ediciones, add one more taller to an existing temporada, or
-- remove one (cancelling its edición, never deleting it).
--
-- WHY
--   talleres_temporadas shipped (PR45,
--   20260819000001_pr45_talleres_temporadas.sql) with NO owner column and
--   UNSCOPED RLS (auth_has_talleres_capability, not the _scoped variant):
--   any director.write/admin.manage grant, at ANY node, could read, edit
--   or delete ANY temporada — a director of Experiencia could touch
--   Conexión's own seasons. Verified read-only against staging before
--   writing this file: talleres_temporadas has exactly 2 rows today
--   (legacy backfill parking season + '2026 - II'), talleres_temporada_
--   talleres carries whatever the PR45/PR46 backfills wrote, and neither
--   is referenced by Grupos de Vida in any way (grepped; the two feature's
--   'temporada'/'temporadas' tables are entirely separate — GdV's own
--   `temporadas` table is untouched by this file).
--
-- WHAT
--   1. talleres_temporadas.dream_team_equipo_id uuid REFERENCES
--      dream_team_equipos(id): backfills the 2 existing rows to Dirección
--      de Conexión (5c388e7c-512d-42d7-925e-79d5147f136a — verified as the
--      only sensible existing owner: both rows are the legacy parking
--      season and the general '2026 - II' season, and Conexión is the
--      direction every temporada-regimen taller on staging today
--      (De Hombre a Hombre, Mujer de Hoy, Parejas, Punto de Partida)
--      already hangs off), then SET NOT NULL. Indexed.
--   2. talleres_equipo_de_temporada(p_temporada_id) — same shape as
--      talleres_equipo_de_cohorte: STABLE SECURITY DEFINER SQL function,
--      one column lookup.
--   3. trg_talleres_temporada_talleres_misma_direccion (BEFORE INSERT OR
--      UPDATE OF taller_id, temporada_id ON talleres_temporada_talleres):
--      the ONE place that enforces "this taller hangs off this temporada's
--      own dirección (or a descendant of it)" — walks the taller's own
--      dream_team_equipo_id UP via parent_equipo_id (depth < 16, same
--      bound as every other ancestor/descendant walk in this codebase)
--      looking for the temporada's own node; P0001
--      TALLER_FUERA_DE_LA_DIRECCION when it never finds it.
--      talleres_instanciar_edicion (T2) already upserts into this
--      junction table unconditionally whenever it is given a
--      p_temporada_id — it gets this ownership check for free, with NO
--      change to its own body, because a BEFORE ROW trigger fires on an
--      INSERT ... ON CONFLICT DO NOTHING attempt even when the conflict
--      ends up skipping the row (verified: Postgres evaluates BEFORE ROW
--      triggers before the conflict check). If the trigger raises, the
--      whole talleres_instanciar_edicion call (and everything it already
--      inserted — operating_core_events, taller_ediciones, grupos,
--      clases, …) rolls back atomically with it, since none of that work
--      commits until the enclosing statement/function call returns
--      successfully.
--   4. RLS, recreated on both tables:
--        talleres_temporadas: SELECT for the SAME six read-capability
--          branches taller_ediciones_select already uses (director.read,
--          coordinator.read, lead.read, volunteer.read, metrics.read,
--          admin.manage), each scoped to the row's own
--          dream_team_equipo_id (no resolver needed — it is a column on
--          this table). INSERT/UPDATE/DELETE: director.write OR
--          admin.manage, scoped the same way. created_by_persona_id stays
--          exactly as it is today (nullable, no FK, never populated by
--          this migration — see its own PR45 comment).
--        talleres_temporada_talleres: SELECT/INSERT/DELETE, same six/two
--          branches, scoped via talleres_equipo_de_temporada(temporada_id).
--          No UPDATE policy (nothing ever updates a junction row; only the
--          trigger's `OF taller_id, temporada_id` clause defends against
--          one existing, in case a future caller tries).
--   5. Three SECURITY DEFINER RPCs (search_path = public, no EXECUTE for
--      anon/PUBLIC, granted to authenticated):
--        talleres_crear_temporada(p_equipo_id, p_nombre, p_fecha_apertura,
--          p_fecha_cierre, p_taller_ids DEFAULT '{}') — authority:
--          director.write/admin.manage scoped to p_equipo_id. Validates
--          the node (EQUIPO_NOT_FOUND/EQUIPO_INACTIVE/
--          EQUIPO_WRONG_EXPERIENCE, P0002), nombre (NOMBRE_REQUERIDO,
--          22023) and that fecha_cierre is not before fecha_apertura
--          (FECHA_CIERRE_ANTES_DE_APERTURA, 22023 — an EQUAL pair still
--          falls through to the table's own stricter
--          `fecha_cierre > fecha_apertura` CHECK, unchanged by this
--          migration: a season needs positive duration, and loosening
--          that constraint is not part of this task). Inserts the
--          temporada in estado='borrador' with a slug derived by the same
--          normalize-lower-collapse-trim algorithm
--          create_taller_abstract already uses for its own slug
--          (diacritics are NOT stripped — same as that existing
--          convention; every real temporada name seen on staging so far
--          is plain ASCII, and adding the `unaccent` extension is out of
--          this migration's scope). For each p_taller_ids entry: must
--          exist (TALLER_NOT_FOUND, P0002) and be regimen='temporada'
--          (else P0001 TALLER_NO_ES_POR_TEMPORADA); the junction row is
--          inserted explicitly (so TALLER_FUERA_DE_LA_DIRECCION — raised
--          by the trigger above — surfaces before any edición work
--          happens for that taller), then talleres_instanciar_edicion is
--          called with p_nombre = NULL so the edición is named after the
--          temporada itself, exactly like talleres_crear_edicion's own
--          by-temporada branch already does.
--        talleres_agregar_taller_a_temporada(p_temporada_id, p_taller_id)
--          — authority scoped to the temporada's own node. Same taller
--          existence/regimen checks, plus EDICION_YA_EXISTE (P0001) when
--          a non-cancelled edición of this taller already lives in this
--          temporada — the exact same talleres_estado_efectivo <>
--          'cancelado' predicate talleres_crear_edicion's by-temporada
--          branch already uses. Same junction-insert-then-instanciar
--          shape as talleres_crear_temporada's own per-taller step.
--        talleres_quitar_taller_de_temporada(p_temporada_id, p_taller_id)
--          — authority scoped to the temporada's own node. Finds that
--          taller's own non-cancelled edición in this temporada
--          (EDICION_NOT_FOUND, P0002, if there is none); refuses with
--          P0001 EDICION_CON_INSCRITOS when it has ANY taller_inscripciones
--          row; otherwise sets that edición's estado to 'cancelado'
--          (never deletes a taller_ediciones row) and deletes the
--          junction row (re-adding the same taller later creates a BRAND
--          NEW edición, never resurrects the cancelled one).
--      Temporada estado transitions (borrador → abierto → cerrado /
--      cancelado) are UNCHANGED by this migration — same plain guarded
--      UPDATE the app already does, now simply subject to the new scoped
--      UPDATE policy instead of the old unscoped one. The estado CHECK
--      constraint itself is untouched.
--   6. comment on every new/changed object.
--
-- SAFETY
--   No table, column or existing grant is dropped; talleres_temporadas
--   loses no row. talleres_instanciar_edicion/open_edicion/
--   talleres_crear_edicion (T2) are not modified — only a trigger is added
--   on a table they already write into, and the whole point of this
--   migration is that they get the new ownership check FOR FREE. No
--   DELETE/TRUNCATE/DROP TABLE anywhere. Grupos de Vida (grupos,
--   grupo_miembros, segmento_lideres, roles_sistema, usuario_roles, and
--   its OWN, entirely different `temporadas` table) is not referenced
--   anywhere in this file — verified read-only before and after via an
--   md5 fingerprint over those three tables' full contents (see this
--   task's delegation report).
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.talleres_quitar_taller_de_temporada(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.talleres_agregar_taller_a_temporada(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.talleres_crear_temporada(uuid, text, date, date, uuid[]);
--   DROP TRIGGER IF EXISTS trg_talleres_temporada_talleres_misma_direccion ON public.talleres_temporada_talleres;
--   DROP FUNCTION IF EXISTS public.talleres_temporada_talleres_valida_direccion();
--   DROP FUNCTION IF EXISTS public.talleres_equipo_de_temporada(uuid);
--   Re-apply 20260819000001_pr45_talleres_temporadas.sql's own 4 policies
--   per table (unscoped) via CREATE OR REPLACE... actually DROP POLICY +
--   CREATE POLICY, since policies have no OR REPLACE — see that file.
--   ALTER TABLE public.talleres_temporadas ALTER COLUMN dream_team_equipo_id DROP NOT NULL,
--     DROP COLUMN dream_team_equipo_id.

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Ownership column
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.talleres_temporadas
  ADD COLUMN dream_team_equipo_id uuid REFERENCES public.dream_team_equipos(id);

-- Backfill: both existing rows (the legacy parking season and '2026 - II')
-- to Dirección de Conexión — verified on staging as the only owner that
-- makes sense today (see header).
UPDATE public.talleres_temporadas
SET dream_team_equipo_id = '5c388e7c-512d-42d7-925e-79d5147f136a'
WHERE dream_team_equipo_id IS NULL;

ALTER TABLE public.talleres_temporadas
  ALTER COLUMN dream_team_equipo_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talleres_temporadas_dream_team_equipo_id
  ON public.talleres_temporadas(dream_team_equipo_id);

COMMENT ON COLUMN public.talleres_temporadas.dream_team_equipo_id IS
  'T3 (odd/tasks/talleres-temporadas-y-ediciones.md): the Dream Team node that owns this temporada. RLS and talleres_temporada_talleres membership are scoped to this node''s own tree.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2) talleres_equipo_de_temporada(p_temporada_id) resolver
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_equipo_de_temporada(p_temporada_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tp.dream_team_equipo_id
  FROM public.talleres_temporadas tp
  WHERE tp.id = p_temporada_id;
$function$;

COMMENT ON FUNCTION public.talleres_equipo_de_temporada(uuid) IS
  'Temporada -> its own dream_team_equipo_id (T3, odd/tasks/talleres-temporadas-y-ediciones.md). Same shape as talleres_equipo_de_cohorte.';

REVOKE ALL ON FUNCTION public.talleres_equipo_de_temporada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_temporada(uuid) TO authenticated, postgres, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Membership trigger: a taller can only sit in a temporada that owns
--    its own node or one of its ancestors.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_temporada_talleres_valida_direccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_taller_equipo    uuid;
  v_temporada_equipo uuid;
  v_en_arbol         boolean;
BEGIN
  SELECT t.dream_team_equipo_id INTO v_taller_equipo
  FROM public.talleres t WHERE t.id = NEW.taller_id;

  SELECT tp.dream_team_equipo_id INTO v_temporada_equipo
  FROM public.talleres_temporadas tp WHERE tp.id = NEW.temporada_id;

  WITH RECURSIVE ancestros AS (
    SELECT e.id, e.parent_equipo_id, 1 AS profundidad
    FROM public.dream_team_equipos e
    WHERE e.id = v_taller_equipo
    UNION ALL
    SELECT p.id, p.parent_equipo_id, a.profundidad + 1
    FROM public.dream_team_equipos p
    JOIN ancestros a ON p.id = a.parent_equipo_id
    WHERE a.profundidad < 16
  )
  SELECT EXISTS (SELECT 1 FROM ancestros WHERE id = v_temporada_equipo) INTO v_en_arbol;

  IF NOT v_en_arbol THEN
    RAISE EXCEPTION 'TALLER_FUERA_DE_LA_DIRECCION' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.talleres_temporada_talleres_valida_direccion() IS
  'T3 (odd/tasks/talleres-temporadas-y-ediciones.md): the taller''s own dream_team_equipo_id must be the temporada''s node or a descendant of it (walks the taller''s ancestors, depth < 16). P0001 TALLER_FUERA_DE_LA_DIRECCION otherwise. SECURITY DEFINER: reads talleres/talleres_temporadas/dream_team_equipos regardless of the caller''s own RLS visibility on those tables, same rationale as auth_has_talleres_capability_scoped.';

DROP TRIGGER IF EXISTS trg_talleres_temporada_talleres_misma_direccion ON public.talleres_temporada_talleres;
CREATE TRIGGER trg_talleres_temporada_talleres_misma_direccion
  BEFORE INSERT OR UPDATE OF taller_id, temporada_id ON public.talleres_temporada_talleres
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_temporada_talleres_valida_direccion();

-- ═══════════════════════════════════════════════════════════════════════
-- 4) RLS — recreated, scoped by tree
-- ═══════════════════════════════════════════════════════════════════════

-- 4.a) talleres_temporadas

DROP POLICY IF EXISTS "talleres_temporadas_select" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_select" ON public.talleres_temporadas
  FOR SELECT TO authenticated
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

DROP POLICY IF EXISTS "talleres_temporadas_insert" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_insert" ON public.talleres_temporadas
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

DROP POLICY IF EXISTS "talleres_temporadas_update" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_update" ON public.talleres_temporadas
  FOR UPDATE TO authenticated
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  )
  WITH CHECK (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

DROP POLICY IF EXISTS "talleres_temporadas_delete" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_delete" ON public.talleres_temporadas
  FOR DELETE TO authenticated
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

-- 4.b) talleres_temporada_talleres — SELECT/INSERT/DELETE only (nothing
-- ever UPDATEs a junction row; the trigger's `OF taller_id, temporada_id`
-- clause still defends one if a future caller tries).

DROP POLICY IF EXISTS "talleres_temporada_talleres_select" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_select" ON public.talleres_temporada_talleres
  FOR SELECT TO authenticated
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', talleres_equipo_de_temporada(temporada_id))
  );

DROP POLICY IF EXISTS "talleres_temporada_talleres_insert" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_insert" ON public.talleres_temporada_talleres
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', talleres_equipo_de_temporada(temporada_id))
  );

DROP POLICY IF EXISTS "talleres_temporada_talleres_update" ON public.talleres_temporada_talleres;

DROP POLICY IF EXISTS "talleres_temporada_talleres_delete" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_delete" ON public.talleres_temporada_talleres
  FOR DELETE TO authenticated
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', talleres_equipo_de_temporada(temporada_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', talleres_equipo_de_temporada(temporada_id))
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 5) RPCs
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_crear_temporada(
  p_equipo_id uuid,
  p_nombre text,
  p_fecha_apertura date,
  p_fecha_cierre date,
  p_taller_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo       public.dream_team_equipos%ROWTYPE;
  v_nombre       text;
  v_slug         text;
  v_temporada_id uuid;
  v_taller_id    uuid;
  v_taller       public.talleres%ROWTYPE;
  v_resultado    jsonb;
  v_ediciones    jsonb := '[]'::jsonb;
BEGIN
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

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_direccion' USING ERRCODE = '42501';
  END IF;

  v_nombre := btrim(p_nombre);
  IF v_nombre IS NULL OR length(v_nombre) < 2 THEN
    RAISE EXCEPTION 'NOMBRE_REQUERIDO' USING ERRCODE = '22023';
  END IF;

  IF p_fecha_apertura IS NULL OR p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'FECHAS_REQUERIDAS' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_cierre < p_fecha_apertura THEN
    RAISE EXCEPTION 'FECHA_CIERRE_ANTES_DE_APERTURA' USING ERRCODE = '22023';
  END IF;

  -- Slug: same normalize-lower-collapse-trim algorithm create_taller_abstract
  -- already uses (20260918220000_talleres_scoped_functions.sql) — diacritics
  -- are not stripped (matches that existing convention).
  v_slug := lower(regexp_replace(regexp_replace(v_nombre, '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));
  v_slug := trim(BOTH '-' FROM v_slug);
  v_slug := left(v_slug, 80);
  IF length(v_slug) < 2 THEN
    RAISE EXCEPTION 'SLUG_TOO_SHORT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.talleres_temporadas (
    nombre, slug, fecha_apertura, fecha_cierre, estado, dream_team_equipo_id
  ) VALUES (
    v_nombre, v_slug, p_fecha_apertura, p_fecha_cierre, 'borrador', p_equipo_id
  )
  RETURNING id INTO v_temporada_id;

  FOREACH v_taller_id IN ARRAY COALESCE(p_taller_ids, '{}'::uuid[])
  LOOP
    SELECT * INTO v_taller FROM public.talleres WHERE id = v_taller_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TALLER_NOT_FOUND: %', v_taller_id USING ERRCODE = 'P0002';
    END IF;
    IF v_taller.regimen <> 'temporada' THEN
      RAISE EXCEPTION 'TALLER_NO_ES_POR_TEMPORADA' USING ERRCODE = 'P0001';
    END IF;

    -- Explicit junction insert first: the trigger raises P0001
    -- TALLER_FUERA_DE_LA_DIRECCION here, before any edición work happens
    -- for this taller, when it does not hang off p_equipo_id's own tree.
    INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES (v_temporada_id, v_taller_id)
    ON CONFLICT (temporada_id, taller_id) DO NOTHING;

    v_resultado := public.talleres_instanciar_edicion(v_taller_id, p_fecha_apertura, v_temporada_id, NULL);

    v_ediciones := v_ediciones || jsonb_build_object(
      'taller_id', v_taller_id,
      'edicion_id', v_resultado ->> 'edicion_id',
      'nombre', v_resultado ->> 'nombre',
      'grupos_creados', v_resultado -> 'grupos_creados',
      'clases_por_grupo', v_resultado -> 'clases_por_grupo',
      'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'temporada_id', v_temporada_id,
    'slug', v_slug,
    'ediciones', v_ediciones
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_crear_temporada(uuid, text, date, date, uuid[]) IS
  'T3 (odd/tasks/talleres-temporadas-y-ediciones.md): creates a temporada owned by p_equipo_id (borrador, slug derived from nombre) plus one edición per p_taller_ids entry (must hang off p_equipo_id''s tree and be regimen=temporada). Authority: director.write/admin.manage scoped to p_equipo_id.';

REVOKE ALL ON FUNCTION public.talleres_crear_temporada(uuid, text, date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_crear_temporada(uuid, text, date, date, uuid[]) TO authenticated, postgres, service_role;

-- ── talleres_agregar_taller_a_temporada ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_agregar_taller_a_temporada(
  p_temporada_id uuid,
  p_taller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_temporada public.talleres_temporadas%ROWTYPE;
  v_taller    public.talleres%ROWTYPE;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_temporada FROM public.talleres_temporadas WHERE id = p_temporada_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_temporada.dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_temporada.dream_team_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_temporada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_taller FROM public.talleres WHERE id = p_taller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;
  IF v_taller.regimen <> 'temporada' THEN
    RAISE EXCEPTION 'TALLER_NO_ES_POR_TEMPORADA' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.taller_ediciones te
     WHERE te.taller_id = p_taller_id
       AND te.temporada_id = p_temporada_id
       AND public.talleres_estado_efectivo(te) <> 'cancelado'
  ) THEN
    RAISE EXCEPTION 'EDICION_YA_EXISTE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
  VALUES (p_temporada_id, p_taller_id)
  ON CONFLICT (temporada_id, taller_id) DO NOTHING;

  v_resultado := public.talleres_instanciar_edicion(p_taller_id, v_temporada.fecha_apertura::date, p_temporada_id, NULL);

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_resultado ->> 'edicion_id',
    'nombre', v_resultado ->> 'nombre',
    'grupos_creados', v_resultado -> 'grupos_creados',
    'clases_por_grupo', v_resultado -> 'clases_por_grupo',
    'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_agregar_taller_a_temporada(uuid, uuid) IS
  'T3 (odd/tasks/talleres-temporadas-y-ediciones.md): adds one taller (regimen=temporada, in this temporada''s own tree) to an existing temporada, creating its edición. Refuses P0001 EDICION_YA_EXISTE when a non-cancelled edición of this taller already lives here. Authority: director.write/admin.manage scoped to the temporada''s own node.';

REVOKE ALL ON FUNCTION public.talleres_agregar_taller_a_temporada(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_agregar_taller_a_temporada(uuid, uuid) TO authenticated, postgres, service_role;

-- ── talleres_quitar_taller_de_temporada ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_quitar_taller_de_temporada(
  p_temporada_id uuid,
  p_taller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_temporada public.talleres_temporadas%ROWTYPE;
  v_edicion   public.taller_ediciones%ROWTYPE;
BEGIN
  SELECT * INTO v_temporada FROM public.talleres_temporadas WHERE id = p_temporada_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_temporada.dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_temporada.dream_team_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_temporada' USING ERRCODE = '42501';
  END IF;

  SELECT te.* INTO v_edicion
    FROM public.taller_ediciones te
   WHERE te.taller_id = p_taller_id
     AND te.temporada_id = p_temporada_id
     AND public.talleres_estado_efectivo(te) <> 'cancelado'
   ORDER BY te.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.taller_inscripciones WHERE taller_id = v_edicion.id) THEN
    RAISE EXCEPTION 'EDICION_CON_INSCRITOS' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.taller_ediciones SET estado = 'cancelado' WHERE id = v_edicion.id;

  DELETE FROM public.talleres_temporada_talleres
   WHERE temporada_id = p_temporada_id AND taller_id = p_taller_id;

  RETURN jsonb_build_object('edicion_id', v_edicion.id, 'cancelada', true);
END;
$function$;

COMMENT ON FUNCTION public.talleres_quitar_taller_de_temporada(uuid, uuid) IS
  'T3 (odd/tasks/talleres-temporadas-y-ediciones.md): cancels (never deletes) this taller''s own non-cancelled edición in this temporada and drops the junction row. Refuses P0001 EDICION_CON_INSCRITOS when that edición has any taller_inscripciones row. Authority: director.write/admin.manage scoped to the temporada''s own node.';

REVOKE ALL ON FUNCTION public.talleres_quitar_taller_de_temporada(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_quitar_taller_de_temporada(uuid, uuid) TO authenticated, postgres, service_role;
