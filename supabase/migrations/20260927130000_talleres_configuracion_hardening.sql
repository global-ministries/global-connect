-- T7 correction round (odd/tasks/talleres-configuracion-del-taller.md) —
-- five defects an independent reviewer found in this feature's plantilla/
-- instanciación work (T1-T3), fixed together in one migration since none of
-- them touches an unrelated table or duplicates another fix's ground.
--
-- WHY
--   A1. Both servidor-activo enforcement triggers (20260926150000_talleres_
--       plantillas_del_taller.sql) only fired on `INSERT OR UPDATE OF
--       persona_id` — moving an EXISTING taller_grupo_asignaciones row to a
--       different grupo_id (or an EXISTING taller_plantilla_facilitadores
--       row to a different plantilla_grupo_id) never re-checked the target
--       taller's servidor-activo rule at all, because persona_id itself
--       never changed in that UPDATE.
--   A2. talleres_es_servidor_activo_del_taller discloses exactly who serves
--       where (any active dream_team_servicios row anywhere in a taller's
--       tree) to any authenticated caller who happens to guess a
--       taller_id/persona_id pair — it was never meant to be called
--       directly, only from inside the two enforcement triggers (see that
--       migration's own header, point 5: "this discloses who serves
--       where"). Verified read-only via pg_proc before writing this: both
--       trigger functions are ALREADY `SECURITY DEFINER SET search_path TO
--       'public'`, owned by `postgres` (prosecdef = true for both, on
--       staging right now) — so revoking authenticated's own EXECUTE grant
--       does not touch the triggers' own internal call to it: a SECURITY
--       DEFINER function's nested calls run as ITS owner (`postgres`),
--       which keeps its own explicit grant below. No trigger function body
--       change is needed for this fix, only the REVOKE.
--   A3. talleres_mover_plantilla_clase (20260927110000_talleres_mover_
--       plantilla_clase.sql) reads a neighbour's `numero` and swaps both
--       rows through a temporary out-of-range value with no locking: two
--       concurrent reorders of the SAME taller can both read the same
--       neighbour, then both write, corrupting the sequence (or violating
--       the UNIQUE (taller_id, numero) constraint outright, depending on
--       interleaving).
--   A4. open_edicion trusted the caller-supplied p_sesiones_estimadas for
--       taller_ediciones.sesiones_snapshot even when the taller HAS an
--       active plantilla — generate_taller_sesiones (a few statements
--       later, same transaction) instantiates clases from that SAME active
--       plantilla count, so a caller passing a stale/wrong number produced
--       a snapshot that lied about how many clases the edición actually
--       got.
--   A5. generate_taller_sesiones's no-plantilla fallback branch hardcoded a
--       7-day cadence instead of reading the taller's own cadencia_dias
--       (default 7, so this only changes behavior for a taller that set a
--       different cadence) — the plantilla-driven branch already reads
--       cadencia_dias (T2); the fallback branch was the one path that
--       still ignored it.
--
-- WHAT
--   A1. DROP + CREATE TRIGGER for both enforcement triggers, adding the
--       column the task names to each one's `UPDATE OF` clause:
--       trg_taller_grupo_asignaciones_servidor_activo gains `grupo_id`,
--       trg_taller_plantilla_facilitadores_servidor_activo gains
--       `plantilla_grupo_id`. Neither trigger FUNCTION body changes — both
--       already resolve the owning taller from NEW.grupo_id/NEW.
--       plantilla_grupo_id, so a moved row is now correctly re-checked
--       against ITS NEW taller instead of being skipped outright.
--   A2. REVOKE EXECUTE ON FUNCTION talleres_es_servidor_activo_del_taller
--       FROM authenticated (postgres and service_role keep it, matching
--       every other SECURITY DEFINER helper in this feature's default-deny
--       posture). No other change — see WHY above for why the triggers
--       keep working unchanged.
--   A3. talleres_mover_plantilla_clase gains one PERFORM pg_advisory_
--       xact_lock(hashtext('taller_plantilla_clases:' || v_taller_id::
--       text)) right after the authorization check (the taller and the
--       caller's right to touch it are both resolved by that point) and
--       before either neighbour SELECT — a transaction-scoped advisory
--       lock keyed per taller, released automatically at COMMIT/ROLLBACK,
--       serializing concurrent reorders of the SAME taller's plantilla
--       without blocking a reorder of a DIFFERENT taller at all. Recreated
--       with CREATE OR REPLACE; body verified byte-identical against
--       staging (pg_get_functiondef) before writing this, so this diff is
--       exactly the one PERFORM line plus its comment.
--   A4. open_edicion computes v_sesiones_snapshot right before the
--       taller_ediciones INSERT: COUNT(*) of this taller's OWN active
--       taller_plantilla_clases when > 0 (ignoring p_sesiones_estimadas
--       outright), else p_sesiones_estimadas unchanged (criterion 8,
--       untouched). Recreated with CREATE OR REPLACE; body verified
--       byte-identical against staging before writing this.
--   A5. generate_taller_sesiones's cadencia_dias lookup (previously only
--       computed inside the `v_total > 0` branch) is hoisted above the
--       branch so BOTH the plantilla path and the fallback path read the
--       SAME COALESCE(talleres.cadencia_dias, 7) value; the fallback's
--       date expression changes from the literal `7` to `v_cadencia_dias`.
--       Default cadencia_dias is 7, so this is a no-op for every taller
--       that never set a different cadence. Recreated with CREATE OR
--       REPLACE; body verified byte-identical against staging before
--       writing this.
--
-- SAFETY
--   No table, column, policy, or grant is dropped except the single
--   REVOKE in A2 (immediately re-derivable: `GRANT EXECUTE ... TO
--   authenticated` reverses it). No DELETE/TRUNCATE/DROP TABLE. Every
--   recreated function keeps its exact signature, return type, and
--   security posture; A3/A4/A5 are behavior-preserving except for the
--   exact defects named above. Grupos de Vida (grupos, grupo_miembros,
--   segmento_lideres, roles_sistema, usuario_roles, temporadas) is not
--   referenced anywhere in this file.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_taller_grupo_asignaciones_servidor_activo
--     ON public.taller_grupo_asignaciones;
--   CREATE TRIGGER trg_taller_grupo_asignaciones_servidor_activo
--     BEFORE INSERT OR UPDATE OF persona_id ON public.taller_grupo_asignaciones
--     FOR EACH ROW EXECUTE FUNCTION public.taller_grupo_asignaciones_exige_servidor_activo();
--   DROP TRIGGER IF EXISTS trg_taller_plantilla_facilitadores_servidor_activo
--     ON public.taller_plantilla_facilitadores;
--   CREATE TRIGGER trg_taller_plantilla_facilitadores_servidor_activo
--     BEFORE INSERT OR UPDATE OF persona_id ON public.taller_plantilla_facilitadores
--     FOR EACH ROW EXECUTE FUNCTION public.taller_plantilla_facilitadores_exige_servidor_activo();
--   GRANT EXECUTE ON FUNCTION public.talleres_es_servidor_activo_del_taller(uuid, uuid) TO authenticated;
--   Re-apply 20260927110000_talleres_mover_plantilla_clase.sql's and
--   20260927100000_talleres_instanciar_edicion.sql's CREATE OR REPLACE
--   bodies (pre-A3/A4/A5).

-- ── A1: triggers also fire on a move (UPDATE OF the FK, not just persona_id)

DROP TRIGGER IF EXISTS trg_taller_grupo_asignaciones_servidor_activo ON public.taller_grupo_asignaciones;
CREATE TRIGGER trg_taller_grupo_asignaciones_servidor_activo
  BEFORE INSERT OR UPDATE OF persona_id, grupo_id ON public.taller_grupo_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.taller_grupo_asignaciones_exige_servidor_activo();

DROP TRIGGER IF EXISTS trg_taller_plantilla_facilitadores_servidor_activo ON public.taller_plantilla_facilitadores;
CREATE TRIGGER trg_taller_plantilla_facilitadores_servidor_activo
  BEFORE INSERT OR UPDATE OF persona_id, plantilla_grupo_id ON public.taller_plantilla_facilitadores
  FOR EACH ROW
  EXECUTE FUNCTION public.taller_plantilla_facilitadores_exige_servidor_activo();

-- ── A2: the helper is an internal-only building block, never a public RPC

REVOKE EXECUTE ON FUNCTION public.talleres_es_servidor_activo_del_taller(uuid, uuid) FROM authenticated;

-- ── A3: serialize concurrent reorders of the SAME taller's plantilla ────

CREATE OR REPLACE FUNCTION public.talleres_mover_plantilla_clase(p_clase_id uuid, p_direccion text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller_id     uuid;
  v_numero        int;
  v_equipo_id     uuid;
  v_vecino_id     uuid;
  v_vecino_numero int;
  v_temp          int;
BEGIN
  IF p_direccion NOT IN ('arriba', 'abajo') THEN
    RAISE EXCEPTION 'INVALID_DIRECCION: %', p_direccion USING ERRCODE = '22023';
  END IF;

  SELECT taller_id, numero INTO v_taller_id, v_numero
  FROM public.taller_plantilla_clases
  WHERE id = p_clase_id;

  IF v_taller_id IS NULL THEN
    RAISE EXCEPTION 'CLASE_NOT_FOUND: %', p_clase_id USING ERRCODE = 'P0002';
  END IF;

  SELECT t.dream_team_equipo_id INTO v_equipo_id
  FROM public.talleres t
  WHERE t.id = v_taller_id;

  -- Same predicate as taller_plantilla_clases_update's RLS policy
  -- (20260926150000_talleres_plantillas_del_taller.sql) — reused
  -- verbatim, never re-derived.
  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  -- A3 hardening (odd/tasks/talleres-configuracion-del-taller.md T7): the
  -- taller and the caller's right to touch it are both resolved above —
  -- lock THIS taller's reorder sequence before reading a neighbour, so two
  -- concurrent reorders of the same taller serialize instead of racing on
  -- the same neighbour row. Transaction-scoped: released automatically at
  -- COMMIT/ROLLBACK, never held past this call. A DIFFERENT taller's
  -- reorder hashes to a different lock key and is never blocked by this.
  PERFORM pg_advisory_xact_lock(hashtext('taller_plantilla_clases:' || v_taller_id::text));

  IF p_direccion = 'arriba' THEN
    SELECT id, numero INTO v_vecino_id, v_vecino_numero
    FROM public.taller_plantilla_clases
    WHERE taller_id = v_taller_id AND numero < v_numero
    ORDER BY numero DESC
    LIMIT 1;
  ELSE
    SELECT id, numero INTO v_vecino_id, v_vecino_numero
    FROM public.taller_plantilla_clases
    WHERE taller_id = v_taller_id AND numero > v_numero
    ORDER BY numero ASC
    LIMIT 1;
  END IF;

  IF v_vecino_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'clase_id', p_clase_id, 'numero', v_numero);
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1000000 INTO v_temp
  FROM public.taller_plantilla_clases
  WHERE taller_id = v_taller_id;

  UPDATE public.taller_plantilla_clases SET numero = v_temp WHERE id = p_clase_id;
  UPDATE public.taller_plantilla_clases SET numero = v_numero WHERE id = v_vecino_id;
  UPDATE public.taller_plantilla_clases SET numero = v_vecino_numero WHERE id = p_clase_id;

  RETURN jsonb_build_object('moved', true, 'clase_id', p_clase_id, 'numero', v_vecino_numero);
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_mover_plantilla_clase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_mover_plantilla_clase(uuid, text) TO authenticated, postgres, service_role;

-- ── A4/A5: open_edicion (snapshot race) + generate_taller_sesiones
-- (fallback cadence) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_taller_sesiones(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       uuid;
  v_cap_ok        boolean;
  v_sesiones      integer;
  v_anchor        date;
  v_numero        integer;
  v_created       integer := 0;
  v_taller_id     uuid;
  v_cadencia_dias integer;
  v_plantilla     RECORD;
  v_total         integer;
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

  SELECT e.sesiones_snapshot,
         COALESCE(c.started_at::date, CURRENT_DATE),
         e.taller_id
    INTO v_sesiones, v_anchor, v_taller_id
    FROM public.taller_grupos g
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones e ON e.id = c.taller_id
   WHERE g.id = p_grupo_id;

  IF v_sesiones IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo % has no resolvable edición/sesiones_snapshot', p_grupo_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(p_grupo_id))
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(p_grupo_id))) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this grupo''s tree'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.taller_plantilla_clases
   WHERE taller_id = v_taller_id AND activo = true;

  -- A5 hardening (odd/tasks/talleres-configuracion-del-taller.md T7): read
  -- ONCE, ahead of the branch, so BOTH paths below (plantilla-driven and
  -- fallback) use the SAME COALESCE(cadencia_dias, 7) — previously only the
  -- plantilla path read it at all; the fallback hardcoded 7 unconditionally.
  SELECT t.cadencia_dias INTO v_cadencia_dias
    FROM public.talleres t
   WHERE t.id = v_taller_id;
  v_cadencia_dias := COALESCE(v_cadencia_dias, 7);

  IF v_total > 0 THEN
    -- The plantilla's own `numero` is an ORDERING KEY ONLY: the
    -- instantiated clase's numero (and its date offset) is its POSITION
    -- among the active rows, so a deactivated/missing plantilla numero
    -- never produces a gap here — taller_sesiones_validate_insert
    -- requires strictly sequential numero per grupo, and position is
    -- always contiguous from 1 by construction.
    FOR v_plantilla IN
      SELECT tema, (row_number() OVER (ORDER BY numero))::integer AS pos
        FROM public.taller_plantilla_clases
       WHERE taller_id = v_taller_id AND activo = true
       ORDER BY numero
    LOOP
      INSERT INTO public.taller_sesiones (
        grupo_id, numero, tema, fecha_programada, estado
      ) VALUES (
        p_grupo_id, v_plantilla.pos, v_plantilla.tema,
        v_anchor + ((v_plantilla.pos - 1) * v_cadencia_dias), 'programada'
      )
      ON CONFLICT (grupo_id, numero) DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;
  ELSE
    -- A5: the fallback now reads THIS taller's own cadencia_dias (default
    -- 7, computed above) instead of a hardcoded 7 — same statement shape,
    -- only the interval expression changed.
    v_total := v_sesiones;

    FOR v_numero IN 1..v_sesiones LOOP
      INSERT INTO public.taller_sesiones (
        grupo_id, numero, fecha_programada, estado
      ) VALUES (
        p_grupo_id, v_numero, v_anchor + ((v_numero - 1) * v_cadencia_dias), 'programada'
      )
      ON CONFLICT (grupo_id, numero) DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'grupo_id', p_grupo_id,
    'total', v_total,
    'created', v_created
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_edicion(p_taller_id uuid, p_tipo text, p_nombre_edicion text, p_link_type text, p_sesiones_estimadas integer, p_duracion_estimada_minutos integer, p_modalidad_inscripcion text, p_fecha_inicio_periodo timestamp with time zone, p_fecha_fin_periodo timestamp with time zone, p_firmantes jsonb, p_temporada_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_taller       public.talleres%ROWTYPE;
  v_edicion_id   uuid;
  v_event_id     uuid;
  v_periodo_id   uuid;
  v_cohorte_id   uuid;
  v_cohorte_started_at timestamptz;
  v_equipo_id    uuid;
  v_pg                      RECORD;
  v_pf                      RECORD;
  v_nuevo_grupo_id          uuid;
  v_grupos_creados          jsonb := '[]'::jsonb;
  v_facilitadores_omitidos  jsonb := '[]'::jsonb;
  v_facilitadores_asignados integer;
  v_clases_por_grupo        integer := 0;
  v_generar_resultado       jsonb;
  v_plantilla_clases_activas integer;
  v_sesiones_snapshot         integer;
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

  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_taller.dream_team_equipo_id)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_taller.dream_team_equipo_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this taller''s tree'
      USING ERRCODE = '42501';
  END IF;

  IF p_tipo NOT IN ('individual', 'pareja') THEN
    RAISE EXCEPTION 'INVALID_TIPO: %', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_nombre_edicion IS NULL OR length(trim(p_nombre_edicion)) < 1 THEN
    RAISE EXCEPTION 'NOMBRE_EDICION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_sesiones_estimadas <= 0 THEN
    RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_duracion_estimada_minutos <= 0 THEN
    RAISE EXCEPTION 'DURACION_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_inscripcion NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_inscripcion USING ERRCODE = '22023';
  END IF;
  IF p_link_type IS NOT NULL AND p_link_type NOT IN ('matrimonio', 'novios') THEN
    RAISE EXCEPTION 'INVALID_LINK_TYPE: %', p_link_type USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'individual' AND p_link_type IS NOT NULL THEN
    RAISE EXCEPTION 'LINK_TYPE_NOT_ALLOWED_FOR_INDIVIDUAL' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN
    RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023';
  END IF;
  IF p_firmantes IS NULL OR jsonb_typeof(p_firmantes) <> 'array' THEN
    p_firmantes := '[]'::jsonb;
  END IF;

  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop', 'active', p_nombre_edicion,
    to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', p_tipo,
      'taller_edicion', p_nombre_edicion,
      'taller_link_type', p_link_type,
      'modalidad_inscripcion', p_modalidad_inscripcion,
      'taller_id', p_taller_id,
      'created_via', 'admin_pr46_temporada'
    )
  )
  RETURNING id INTO v_event_id;

  -- A4 hardening (odd/tasks/talleres-configuracion-del-taller.md T7): a
  -- taller WITH an active plantilla ignores p_sesiones_estimadas outright
  -- for the snapshot — read fresh, right here, from the SAME table
  -- generate_taller_sesiones reads from a few statements below, inside
  -- this SAME transaction, so the two can never disagree. A taller with NO
  -- active plantilla keeps the pre-T2 field (criterion 8, unchanged).
  SELECT count(*) INTO v_plantilla_clases_activas
    FROM public.taller_plantilla_clases
   WHERE taller_id = p_taller_id AND activo = true;
  v_sesiones_snapshot := CASE WHEN v_plantilla_clases_activas > 0
                               THEN v_plantilla_clases_activas
                               ELSE p_sesiones_estimadas END;

  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    recurrence_rule, periodo_general_id, estado, nombre_snapshot,
    sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, firmantes, taller_id, temporada_id
  ) VALUES (
    v_event_id, p_tipo, p_link_type, p_modalidad_inscripcion,
    NULL, NULL, 'borrador', p_nombre_edicion, v_sesiones_snapshot,
    p_duracion_estimada_minutos, p_modalidad_inscripcion, p_firmantes, p_taller_id, p_temporada_id
  )
  RETURNING id INTO v_edicion_id;

  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (
      taller_id, edicion_label, fecha_apertura_automatica, fecha_cierre_automatico
    ) VALUES (
      v_edicion_id, p_nombre_edicion, p_fecha_inicio_periodo, p_fecha_fin_periodo
    )
    RETURNING id INTO v_periodo_id;

    UPDATE public.taller_ediciones
    SET periodo_general_id = v_periodo_id
    WHERE id = v_edicion_id;

    v_cohorte_started_at := p_fecha_inicio_periodo;
  ELSE
    v_cohorte_started_at := NULL;
  END IF;

  v_equipo_id := v_taller.dream_team_equipo_id;
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    v_edicion_id,
    v_equipo_id,
    p_nombre_edicion, v_cohorte_started_at, NULL
  )
  RETURNING id INTO v_cohorte_id;

  IF p_temporada_id IS NOT NULL THEN
    INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES (p_temporada_id, p_taller_id)
    ON CONFLICT (temporada_id, taller_id) DO NOTHING;
  END IF;

  FOR v_pg IN
    SELECT id, nombre, capacidad
      FROM public.taller_plantilla_grupos
     WHERE taller_id = p_taller_id AND activo = true
     ORDER BY orden
  LOOP
    INSERT INTO public.taller_grupos (cohorte_id, nombre, capacidad, estado)
    VALUES (v_cohorte_id, v_pg.nombre, v_pg.capacidad, 'activo')
    RETURNING id INTO v_nuevo_grupo_id;

    v_facilitadores_asignados := 0;

    FOR v_pf IN
      SELECT pf.persona_id, pf.rol, u.nombre, u.apellido
        FROM public.taller_plantilla_facilitadores pf
        JOIN public.usuarios u ON u.id = pf.persona_id
       WHERE pf.plantilla_grupo_id = v_pg.id
       ORDER BY pf.created_at
    LOOP
      IF public.talleres_es_servidor_activo_del_taller(p_taller_id, v_pf.persona_id) THEN
        INSERT INTO public.taller_grupo_asignaciones (grupo_id, persona_id, rol)
        VALUES (v_nuevo_grupo_id, v_pf.persona_id, v_pf.rol);

        v_facilitadores_asignados := v_facilitadores_asignados + 1;
      ELSE
        v_facilitadores_omitidos := v_facilitadores_omitidos || jsonb_build_object(
          'persona_id', v_pf.persona_id,
          'nombre', v_pf.nombre,
          'apellido', v_pf.apellido,
          'plantilla_grupo', v_pg.nombre
        );
      END IF;
    END LOOP;

    INSERT INTO public.taller_reportes (grupo_id, estado, observaciones_generales)
    VALUES (v_nuevo_grupo_id, 'borrador', 'Reporte generado automáticamente al abrir la edición.');

    v_generar_resultado := public.generate_taller_sesiones(v_nuevo_grupo_id);
    v_clases_por_grupo := COALESCE((v_generar_resultado ->> 'total')::integer, 0);

    v_grupos_creados := v_grupos_creados || jsonb_build_object(
      'grupo_id', v_nuevo_grupo_id,
      'nombre', v_pg.nombre,
      'facilitadores_asignados', v_facilitadores_asignados
    );
  END LOOP;

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', v_periodo_id,
    'cohorte_id', v_cohorte_id,
    'temporada_id', p_temporada_id,
    'estado', 'borrador',
    'grupos_creados', v_grupos_creados,
    'facilitadores_omitidos', v_facilitadores_omitidos,
    'clases_por_grupo', v_clases_por_grupo
  );
END;
$function$;
