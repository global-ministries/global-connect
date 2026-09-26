-- T1 (odd/tasks/talleres-configuracion-del-taller.md) — the template
-- lives on the taller, once; the node's own active servidores are the
-- only eligible facilitadores.
--
-- WHY
--   docs/talleres-de-punta-a-punta.md §12 (auditoría diseñado vs.
--   construido, 2026-09-26) names the two gaps this migration closes:
--     - "sesiones_estimadas se pide al abrir cada edición... Las clases
--       se generan numeradas y sin nombre; taller_sesiones.tema existe
--       (25-sep) pero ninguna función lo escribe." A taller has nowhere
--       to remember how many classes it has or what they are called;
--       Próximo Paso's 4 named classes (Sígueme, Intimidad con Dios,
--       Compañerismo, Influencia) have no home today.
--     - "Los grupos nacen dentro de la edición... y se arman a mano
--       cada vez, aunque... son estables temporada a temporada... Los
--       facilitadores se asignan con búsqueda libre entre toda la
--       iglesia... sin exigir que la persona sea un dream_team_servicios
--       activo del nodo." The design (§5, §6) says the opposite: the
--       taller's people are Dream Team servicios in its node.
--   This is T1 of odd/tasks/talleres-configuracion-del-taller.md — the
--   base: the two template tables, the node-scoped policies, the
--   servidor-activo rule and its two enforcement points (the template
--   itself, and the one live write path that already assigns people to
--   a grupo). T2 wires open_edicion to instantiate from these tables;
--   out of scope here.
--
-- WHAT
--   1. talleres.cadencia_dias (int, default 7 — weekly) and
--      talleres.duracion_minutos (int, nullable): the two fields
--      open_edicion's form used to ask for every time (T2 removes that
--      field from the form; this migration only adds the column it
--      will read from).
--   2. taller_plantilla_clases (taller_id, numero, tema, activo):
--      unique per (taller_id, numero) — the count of active rows IS
--      the taller's class count, no separate counter to drift.
--   3. taller_plantilla_grupos (taller_id, nombre, orden, capacidad,
--      activo) + taller_plantilla_facilitadores (plantilla_grupo_id,
--      persona_id, rol) — one or more facilitadores per grupo (a
--      person, a couple, a trio), rol IN ('lider','voluntario'),
--      unique per (plantilla_grupo_id, persona_id).
--   4. RLS on the three tables. SELECT mirrors talleres_select_all
--      (production pg_policies, verified read-only before writing this
--      file: USING (true) TO authenticated — the catalog is broadly
--      browsable, and so is its template) — reproduced verbatim, not
--      guessed. INSERT/UPDATE/DELETE mirror talleres_update_director's
--      shape (also verified against production): director.write OR
--      admin.manage, tree-scoped via auth_has_talleres_capability_
--      scoped(key, dream_team_equipo_id) — the same predicate
--      talleres_mis_permisos' 'editar_taller' boolean already uses
--      (20260919140000_talleres_mis_permisos_admin_manage.sql). For
--      taller_plantilla_facilitadores the node is resolved through its
--      plantilla_grupo_id via the new
--      talleres_equipo_de_plantilla_grupo() resolver, same shape as
--      the existing talleres_equipo_de_grupo/de_cohorte resolvers
--      (20260821000004_cimiento3a_talleres_coordinador_scope_rls.sql).
--   5. talleres_es_servidor_activo_del_taller(p_taller_id, p_persona_id)
--      → boolean, STABLE SECURITY DEFINER: true when dream_team_
--      servicios has an estado='activo' row for that persona whose
--      equipo_id is the taller's own dream_team_equipo_id OR any
--      DESCENDANT of it — a recursive CTE walking
--      dream_team_equipos.parent_equipo_id DOWNWARD, depth < 16, the
--      mirror image of auth_has_talleres_capability_scoped's ancestor
--      walk (20260918180000_talleres_scoped_capability_ancestors.sql)
--      which walks the same edge UPWARD. Default-deny: this discloses
--      who serves where, so REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE
--      TO authenticated, postgres, service_role only.
--   6. talleres_servidores_del_taller(p_taller_id) → TABLE(persona_id,
--      nombre, apellido, rol_servicio, equipo_label): the picker's
--      source of truth — every active servidor of the taller's node or
--      a descendant, LEFT JOIN usuarios (degrade to NULL, never drop a
--      row a caller is entitled to see) and dream_team_roles for the
--      label. Callers need director/coordinator read-or-write or
--      admin.manage in the node tree, OR to be an active servidor
--      there themselves (so a facilitador can see their own team);
--      otherwise 42501 sin_permisos_para_este_taller. Same default-deny
--      posture as (5).
--   7. Two BEFORE triggers enforcing servidor-activo where a person is
--      actually attached to taller work: taller_plantilla_facilitadores
--      (BEFORE INSERT OR UPDATE OF persona_id) and the existing
--      taller_grupo_asignaciones (BEFORE INSERT OR UPDATE OF
--      persona_id) — the one live path today that assigns a person to
--      run a grupo. Both raise P0001 NO_ES_SERVIDOR_ACTIVO_DEL_TALLER
--      when talleres_es_servidor_activo_del_taller is false; everything
--      else about either table (its RLS, its other triggers, every
--      other column) is untouched. taller_grupo_asignaciones' node is
--      resolved via the existing talleres_equipo_de_grupo(grupo_id)
--      (returns the row's dream_team_equipo_id) and then matched back
--      to its owning taller through the partial unique index
--      talleres_dream_team_equipo_id_uniq
--      (20260918150000_talleres_dream_team_equipo_column.sql guarantees
--      at most one taller per equipo, and 20260918170000_open_edicion_
--      uses_taller_equipo.sql guarantees every cohorte is minted with
--      exactly its taller's own dream_team_equipo_id — so this lookup
--      is exact, not a guess).
--
-- SAFETY
--   Additive only: two new nullable/defaulted columns on an existing
--   table, three new tables, two new SECURITY DEFINER functions
--   (default-deny), one new low-sensitivity resolver (same grant
--   posture as its siblings), and two new BEFORE triggers that only
--   ever block a specific, newly-forbidden case (assigning someone who
--   is not an active servidor of the taller's tree) — every insert/
--   update that already satisfied that rule keeps behaving exactly as
--   before. No existing table, column, policy, function, or trigger is
--   dropped, renamed, or narrowed. Grupos de Vida (grupos,
--   grupo_miembros, segmento_lideres, roles_sistema, usuario_roles,
--   temporadas) is not referenced anywhere in this file.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_taller_grupo_asignaciones_servidor_activo
--     ON public.taller_grupo_asignaciones;
--   DROP FUNCTION IF EXISTS public.taller_grupo_asignaciones_exige_servidor_activo();
--   DROP TABLE IF EXISTS public.taller_plantilla_facilitadores;
--     -- (its own BEFORE trigger + function are dropped with the table)
--   DROP TABLE IF EXISTS public.taller_plantilla_grupos;
--   DROP TABLE IF EXISTS public.taller_plantilla_clases;
--   DROP FUNCTION IF EXISTS public.talleres_servidores_del_taller(uuid);
--   DROP FUNCTION IF EXISTS public.talleres_es_servidor_activo_del_taller(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.talleres_equipo_de_plantilla_grupo(uuid);
--   ALTER TABLE public.talleres
--     DROP COLUMN IF EXISTS cadencia_dias,
--     DROP COLUMN IF EXISTS duracion_minutos;
--   DROP FUNCTION IF EXISTS public.set_taller_plantilla_updated_at();

-- ── (1) talleres gains its own cadence/duration ──────────────────────

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS cadencia_dias int NOT NULL DEFAULT 7
    CHECK (cadencia_dias > 0),
  ADD COLUMN IF NOT EXISTS duracion_minutos int NULL
    CHECK (duracion_minutos IS NULL OR duracion_minutos > 0);

-- ── (2) taller_plantilla_clases ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taller_plantilla_clases (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   uuid        NOT NULL REFERENCES public.talleres(id) ON DELETE CASCADE,
  numero      int         NOT NULL CHECK (numero > 0),
  tema        text        NOT NULL CHECK (length(btrim(tema)) > 0),
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_taller_plantilla_clases_taller_id
  ON public.taller_plantilla_clases(taller_id);

-- set_talleres_crecimiento_metadata_updated_at() no longer exists on
-- staging (renamed per-table during the taller_ediciones capture
-- rename — see set_taller_ediciones_updated_at/set_taller_reportes_
-- updated_at/set_taller_sesiones_updated_at, verified read-only via
-- pg_proc before writing this). A plain, table-scoped trigger function
-- is the current convention; this one is shared by both new template
-- tables (neither has a `version` column, so set_talleres_updated_at()
-- — which also bumps version — does not fit either).
CREATE OR REPLACE FUNCTION public.set_taller_plantilla_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_taller_plantilla_clases_updated_at ON public.taller_plantilla_clases;
CREATE TRIGGER trg_taller_plantilla_clases_updated_at
  BEFORE UPDATE ON public.taller_plantilla_clases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_taller_plantilla_updated_at();

-- ── (3) taller_plantilla_grupos + taller_plantilla_facilitadores ────

CREATE TABLE IF NOT EXISTS public.taller_plantilla_grupos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   uuid        NOT NULL REFERENCES public.talleres(id) ON DELETE CASCADE,
  nombre      text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  orden       int         NOT NULL DEFAULT 0,
  capacidad   int         NOT NULL DEFAULT 12 CHECK (capacidad > 0),
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_taller_plantilla_grupos_taller_id
  ON public.taller_plantilla_grupos(taller_id);

DROP TRIGGER IF EXISTS trg_taller_plantilla_grupos_updated_at ON public.taller_plantilla_grupos;
CREATE TRIGGER trg_taller_plantilla_grupos_updated_at
  BEFORE UPDATE ON public.taller_plantilla_grupos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_taller_plantilla_updated_at();

CREATE TABLE IF NOT EXISTS public.taller_plantilla_facilitadores (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_grupo_id uuid        NOT NULL REFERENCES public.taller_plantilla_grupos(id) ON DELETE CASCADE,
  persona_id         uuid        NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  rol                text        NOT NULL CHECK (rol IN ('lider', 'voluntario')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plantilla_grupo_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_taller_plantilla_facilitadores_grupo_id
  ON public.taller_plantilla_facilitadores(plantilla_grupo_id);

-- ── (4) resolver: plantilla_grupo → taller → equipo (RLS use) ───────
-- Same shape as talleres_equipo_de_grupo/de_cohorte
-- (20260821000004_cimiento3a_talleres_coordinador_scope_rls.sql):
-- STABLE SECURITY DEFINER, table-owner-bypasses-RLS internally, no
-- explicit REVOKE — mirrored byte-for-byte from that grant posture.

CREATE OR REPLACE FUNCTION public.talleres_equipo_de_plantilla_grupo(p_plantilla_grupo_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.dream_team_equipo_id
  FROM public.taller_plantilla_grupos g
  JOIN public.talleres t ON t.id = g.taller_id
  WHERE g.id = p_plantilla_grupo_id;
$function$;

GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_plantilla_grupo(uuid) TO authenticated, service_role;

-- ── (5) RLS: SELECT mirrors talleres_select_all verbatim ────────────

ALTER TABLE public.taller_plantilla_clases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_plantilla_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_plantilla_facilitadores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_plantilla_clases FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.taller_plantilla_grupos FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.taller_plantilla_facilitadores FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_plantilla_clases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_plantilla_grupos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_plantilla_facilitadores TO authenticated;

-- taller_plantilla_clases

CREATE POLICY "taller_plantilla_clases_select" ON public.taller_plantilla_clases
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "taller_plantilla_clases_insert" ON public.taller_plantilla_clases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  );

CREATE POLICY "taller_plantilla_clases_update" ON public.taller_plantilla_clases
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  );

CREATE POLICY "taller_plantilla_clases_delete" ON public.taller_plantilla_clases
  FOR DELETE TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  );

-- taller_plantilla_grupos

CREATE POLICY "taller_plantilla_grupos_select" ON public.taller_plantilla_grupos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "taller_plantilla_grupos_insert" ON public.taller_plantilla_grupos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  );

CREATE POLICY "taller_plantilla_grupos_update" ON public.taller_plantilla_grupos
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  );

CREATE POLICY "taller_plantilla_grupos_delete" ON public.taller_plantilla_grupos
  FOR DELETE TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_id))
  );

-- taller_plantilla_facilitadores (node resolved through plantilla_grupo_id)

CREATE POLICY "taller_plantilla_facilitadores_select" ON public.taller_plantilla_facilitadores
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "taller_plantilla_facilitadores_insert" ON public.taller_plantilla_facilitadores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
  );

CREATE POLICY "taller_plantilla_facilitadores_update" ON public.taller_plantilla_facilitadores
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
  );

CREATE POLICY "taller_plantilla_facilitadores_delete" ON public.taller_plantilla_facilitadores
  FOR DELETE TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_plantilla_grupo(plantilla_grupo_id))
  );

-- ── (6) the servidor-activo helper — mirror image of the ancestor walk

CREATE OR REPLACE FUNCTION public.talleres_es_servidor_activo_del_taller(p_taller_id uuid, p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE descendientes AS (
    SELECT t.dream_team_equipo_id AS id, 1 AS profundidad
    FROM public.talleres t
    WHERE t.id = p_taller_id
      AND t.dream_team_equipo_id IS NOT NULL
    UNION ALL
    SELECT e.id, d.profundidad + 1
    FROM public.dream_team_equipos e
    JOIN descendientes d ON e.parent_equipo_id = d.id
    WHERE d.profundidad < 16
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_servicios s
    WHERE s.persona_id = p_persona_id
      AND s.estado = 'activo'
      AND s.equipo_id IN (SELECT id FROM descendientes)
  );
$function$;

REVOKE ALL ON FUNCTION public.talleres_es_servidor_activo_del_taller(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_es_servidor_activo_del_taller(uuid, uuid) TO authenticated, postgres, service_role;

-- ── (7) the picker RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_servidores_del_taller(p_taller_id uuid)
RETURNS TABLE (
  persona_id    uuid,
  nombre        text,
  apellido      text,
  rol_servicio  text,
  equipo_label  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id   uuid;
  v_actor_id    uuid;
  v_autorizado  boolean;
BEGIN
  SELECT t.dream_team_equipo_id INTO v_equipo_id
  FROM public.talleres t
  WHERE t.id = p_taller_id;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = auth.uid();

  v_autorizado := v_equipo_id IS NOT NULL AND (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
    OR (v_actor_id IS NOT NULL AND public.talleres_es_servidor_activo_del_taller(p_taller_id, v_actor_id))
  );

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH RECURSIVE descendientes AS (
    SELECT v_equipo_id AS id, 1 AS profundidad
    UNION ALL
    SELECT e.id, d.profundidad + 1
    FROM public.dream_team_equipos e
    JOIN descendientes d ON e.parent_equipo_id = d.id
    WHERE d.profundidad < 16
  )
  SELECT
    s.persona_id,
    u.nombre,
    u.apellido,
    r.label AS rol_servicio,
    eq.label AS equipo_label
  FROM public.dream_team_servicios s
  JOIN public.dream_team_equipos eq ON eq.id = s.equipo_id
  LEFT JOIN public.usuarios u ON u.id = s.persona_id
  LEFT JOIN public.dream_team_roles r ON r.id = s.rol_id
  WHERE s.estado = 'activo'
    AND s.equipo_id IN (SELECT id FROM descendientes);
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_servidores_del_taller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_servidores_del_taller(uuid) TO authenticated, postgres, service_role;

-- ── (8) enforcement trigger #1 — the template itself ─────────────────

CREATE OR REPLACE FUNCTION public.taller_plantilla_facilitadores_exige_servidor_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller_id uuid;
BEGIN
  SELECT g.taller_id INTO v_taller_id
  FROM public.taller_plantilla_grupos g
  WHERE g.id = NEW.plantilla_grupo_id;

  IF v_taller_id IS NULL OR NOT public.talleres_es_servidor_activo_del_taller(v_taller_id, NEW.persona_id) THEN
    RAISE EXCEPTION 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_taller_plantilla_facilitadores_servidor_activo ON public.taller_plantilla_facilitadores;
CREATE TRIGGER trg_taller_plantilla_facilitadores_servidor_activo
  BEFORE INSERT OR UPDATE OF persona_id ON public.taller_plantilla_facilitadores
  FOR EACH ROW
  EXECUTE FUNCTION public.taller_plantilla_facilitadores_exige_servidor_activo();

-- ── (9) enforcement trigger #2 — the one live assignment path ────────
-- taller_grupo_asignaciones.grupo_id already resolves to a
-- dream_team_equipo_id via talleres_equipo_de_grupo(); that equipo_id
-- is exactly the owning taller's own dream_team_equipo_id (open_edicion
-- mints every cohorte with v_taller.dream_team_equipo_id — see
-- 20260918170000_open_edicion_uses_taller_equipo.sql), and
-- talleres_dream_team_equipo_id_uniq guarantees at most one taller per
-- equipo, so the reverse lookup below is exact.

CREATE OR REPLACE FUNCTION public.taller_grupo_asignaciones_exige_servidor_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id uuid;
  v_taller_id uuid;
BEGIN
  v_equipo_id := public.talleres_equipo_de_grupo(NEW.grupo_id);

  SELECT t.id INTO v_taller_id
  FROM public.talleres t
  WHERE t.dream_team_equipo_id = v_equipo_id;

  IF v_taller_id IS NULL OR NOT public.talleres_es_servidor_activo_del_taller(v_taller_id, NEW.persona_id) THEN
    RAISE EXCEPTION 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_taller_grupo_asignaciones_servidor_activo ON public.taller_grupo_asignaciones;
CREATE TRIGGER trg_taller_grupo_asignaciones_servidor_activo
  BEFORE INSERT OR UPDATE OF persona_id ON public.taller_grupo_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.taller_grupo_asignaciones_exige_servidor_activo();
