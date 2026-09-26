-- T2 (odd/tasks/talleres-configuracion-del-taller.md) — the taller's own
-- plantilla (T1) becomes real work the moment a director opens an edición.
--
-- WHY
--   T1 built the plantilla tables and the servidor-activo rule but wired
--   nothing to them yet: docs/talleres-de-punta-a-punta.md §12 names the
--   still-open gap — "Los grupos nacen dentro de la edición... y se arman
--   a mano cada vez", "Nadie crea el borrador del reporte de un grupo" and
--   "taller_sesiones.tema existe... pero ninguna función lo escribe."
--   Verified read-only against the live open_edicion/generate_taller_
--   sesiones bodies (pg_get_functiondef on staging, byte-identical to
--   20260918220000_talleres_scoped_functions.sql, the latest CREATE OR
--   REPLACE of either) before writing this file:
--     - open_edicion (11-arg) creates the operating_core_event, the
--       taller_ediciones row, optionally a taller_periodos_generales row,
--       and the talleres_crecimiento_cohortes row — it creates NO
--       taller_grupos at all. Grupos are created one at a time by a
--       human through POST /api/talleres/grupos (app/api/talleres/
--       grupos/route.ts), which also fires generate_taller_sesiones
--       best-effort and never touches taller_reportes.
--     - generate_taller_sesiones(p_grupo_id) is called PER GRUPO (not
--       per cohorte): it resolves the owning taller through
--       taller_grupos -> talleres_crecimiento_cohortes -> taller_ediciones
--       (whose own `taller_id` column is the real public.talleres row —
--       confusingly, talleres_crecimiento_cohortes.taller_id is actually
--       the EDICIÓN id, not the taller; both were verified against
--       information_schema before relying on either), reads
--       taller_ediciones.sesiones_snapshot, and inserts one taller_
--       sesiones row per number from 1 to that snapshot, one week apart,
--       with no tema.
--
-- WHAT
--   1. generate_taller_sesiones(p_grupo_id) — SAME signature, SAME
--      overall contract. Now also resolves the owning taller_id (via the
--      same join it already had) and checks taller_plantilla_clases for
--      active rows there:
--        - taller HAS an active plantilla: one taller_sesiones row per
--          active plantilla row, using the plantilla's own numero and
--          tema, fecha_programada = anchor + (numero-1)*talleres.
--          cadencia_dias (COALESCE'd to 7 if somehow NULL). Active
--          plantilla numero is expected to stay contiguous from 1 (the
--          plantilla CRUD's job, not this function's) — taller_sesiones'
--          own trg_taller_sesiones_validate_insert already requires
--          strictly sequential numero per grupo (verified via
--          pg_get_functiondef before writing this), so a gap surfaces as
--          that trigger's exception, never a silent skip.
--          taller_sesiones has no duration column (verified via
--          information_schema.columns before writing this) — talleres.
--          duracion_minutos is therefore read nowhere in this function;
--          nothing here claims otherwise.
--        - taller has NO active plantilla row: the exact pre-T2 loop,
--          same statement text, same bounds (1..sesiones_snapshot), same
--          anchor + (numero-1)*7 (hardcoded weekly cadence — NOT
--          cadencia_dias; "conserva el comportamiento actual" means
--          actual, unchanged behavior, not a silent upgrade), same
--          'programada' estado, same ON CONFLICT DO NOTHING, same
--          {ok, grupo_id, total, created} return shape.
--   2. open_edicion(...) — SAME 11-arg signature, SAME existing return
--      keys unchanged, 3 keys ADDED. After the existing logic (the
--      cohorte and optional temporada link), in the SAME transaction:
--      for every active taller_plantilla_grupos row of this taller,
--      ordered by orden:
--        - INSERT one taller_grupos row in the new cohorte (nombre,
--          capacidad from the plantilla; estado 'activo', same value
--          POST /api/talleres/grupos already inserts today).
--        - for each taller_plantilla_facilitadores row of that plantilla
--          grupo, re-check talleres_es_servidor_activo_del_taller (T1):
--          the plantilla is static but dream_team_servicios is not, so a
--          facilitador can go from active to en_pausa AFTER being added
--          to the plantilla. Still active -> taller_grupo_asignaciones
--          (the table's own BEFORE trigger from T1 re-verifies this,
--          redundantly but harmlessly, since every row we insert here
--          already passed). No longer active -> skipped, and reported
--          back under facilitadores_omitidos (persona_id, nombre,
--          apellido, and the plantilla grupo's own nombre, so the caller
--          can say e.g. "Juan Pérez (Grupo A) fue omitido: ya no es
--          servidor activo").
--        - INSERT one taller_reportes row in 'borrador'. Verified
--          read-only (grep across app/, lib/, supabase/migrations)
--          before writing this: nothing creates this row today — no
--          trigger, no RPC, no route — matching docs §12's "Nadie crea
--          el borrador del reporte de un grupo". observaciones_generales
--          is NOT NULL with CHECK length > 0 (verified via information_
--          schema before writing this); a fixed Spanish placeholder is
--          used because this column is user-facing report content in an
--          otherwise all-Spanish domain (nombre, tema, observaciones_
--          generales, ...), not an artifact of this migration.
--        - CALL generate_taller_sesiones for the new grupo. It re-runs
--          its own authorization (unscoped director.write/admin.manage
--          anywhere, then scoped to the new grupo's own equipo, which is
--          this same taller's dream_team_equipo_id) — the actor calling
--          open_edicion already passed the equivalent scoped check
--          earlier in this same function, and auth_has_talleres_
--          capability's unscoped check does not filter by scope_id
--          (verified via pg_get_functiondef before relying on this), so
--          any director/admin who reached this point already satisfies
--          it. This is the exact same call the "Crear grupo" app route
--          already makes after creating a grupo by hand.
--      Return keys ADDED (existing keys untouched):
--        grupos_creados          — [{grupo_id, nombre, facilitadores_asignados}]
--        facilitadores_omitidos  — [{persona_id, nombre, apellido, plantilla_grupo}]
--        clases_por_grupo        — int (from generate_taller_sesiones's
--                                   own 'total'; identical for every
--                                   grupo created here, since they all
--                                   come from the same taller)
--      A taller with no active taller_plantilla_grupos row creates
--      NOTHING here: grupos_creados = [], facilitadores_omitidos = [],
--      clases_por_grupo = 0 — exactly open_edicion's pre-T2 behavior,
--      now made explicit instead of simply absent.
--   3. talleres_editar_grupo(p_grupo_id, p_nombre, p_capacidad) — new,
--      SECURITY DEFINER, edits an already-instantiated taller_grupos row
--      in place (never touches its plantilla). Authorized by
--      `gestionar_grupos` on the grupo's own equipo (talleres_equipo_de_
--      grupo) — director.write OR coordinator.write OR admin.manage,
--      the exact boolean talleres_mis_permisos already computes for
--      gestionar_grupos (verified via pg_get_functiondef of
--      talleres_mis_permisos before writing this) — otherwise 42501
--      sin_permisos_para_este_taller (same message talleres_servidores_
--      del_taller already uses for the same kind of refusal). NULL
--      p_nombre/p_capacidad means "leave unchanged" (COALESCE), matching
--      talleres_enviar_reporte's own COALESCE-to-keep-old-value pattern;
--      a non-NULL blank nombre or capacidad < 1 is rejected (22023).
--   4. talleres_editar_clase(p_sesion_id, p_tema, p_fecha_programada) —
--      new, SECURITY DEFINER, edits an already-instantiated taller_
--      sesiones row in place (never touches its plantilla). Authorized
--      by `editar_edicion` on the sesión's grupo's equipo — director.
--      write OR admin.manage, same boolean talleres_mis_permisos already
--      computes for editar_edicion — otherwise 42501 sin_permisos_para_
--      este_taller. A 'cerrada' clase (talleres_cerrar_clase's own
--      terminal estado) refuses with P0001 CLASE_CERRADA. NULL args mean
--      "leave unchanged". p_fecha_programada is timestamptz (matching
--      every other date-ish parameter in this schema) but taller_
--      sesiones.fecha_programada is `date` (verified via information_
--      schema before writing this) — cast on write, same as any other
--      timestamptz-to-date narrowing in this codebase.
--
-- SAFETY
--   generate_taller_sesiones and open_edicion keep their exact
--   signatures and every existing behavior for a taller with no
--   plantilla; the fallback branch is the original statement text,
--   unchanged, just moved under an IF. open_edicion's return object only
--   gains keys — every existing key and its value is untouched. The two
--   new functions are default-deny (REVOKE ALL FROM PUBLIC, anon; GRANT
--   EXECUTE TO authenticated, postgres, service_role only) and only ever
--   UPDATE a single already-existing row by id, gated by capability.
--   Grupos de Vida (grupos, grupo_miembros, segmento_lideres,
--   roles_sistema, usuario_roles, temporadas) is not referenced anywhere
--   in this file. No DELETE/TRUNCATE/DROP TABLE.
--
-- ROLLBACK
--   Re-apply 20260918220000_talleres_scoped_functions.sql's CREATE OR
--   REPLACE bodies for open_edicion and generate_taller_sesiones
--   (pre-T2, no plantilla awareness, no extra return keys).
--   DROP FUNCTION IF EXISTS public.talleres_editar_clase(uuid, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.talleres_editar_grupo(uuid, text, integer);

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

  IF v_total > 0 THEN
    SELECT t.cadencia_dias INTO v_cadencia_dias
      FROM public.talleres t
     WHERE t.id = v_taller_id;
    v_cadencia_dias := COALESCE(v_cadencia_dias, 7);

    FOR v_plantilla IN
      SELECT numero, tema
        FROM public.taller_plantilla_clases
       WHERE taller_id = v_taller_id AND activo = true
       ORDER BY numero
    LOOP
      INSERT INTO public.taller_sesiones (
        grupo_id, numero, tema, fecha_programada, estado
      ) VALUES (
        p_grupo_id, v_plantilla.numero, v_plantilla.tema,
        v_anchor + ((v_plantilla.numero - 1) * v_cadencia_dias), 'programada'
      )
      ON CONFLICT (grupo_id, numero) DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;
  ELSE
    -- Pre-T2 fallback, byte-for-byte: no plantilla, sesiones_snapshot
    -- alone drives count, weekly cadence is hardcoded, no tema.
    v_total := v_sesiones;

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

  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    recurrence_rule, periodo_general_id, estado, nombre_snapshot,
    sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, firmantes, taller_id, temporada_id
  ) VALUES (
    v_event_id, p_tipo, p_link_type, p_modalidad_inscripcion,
    NULL, NULL, 'borrador', p_nombre_edicion, p_sesiones_estimadas,
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

  -- T2: instantiate grupos/facilitadores/reportes/clases from the
  -- taller's own plantilla, in this same transaction. See this
  -- migration's header for the full rationale.
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

-- ── talleres_editar_grupo: nombre/capacidad of an instantiated grupo ─

CREATE OR REPLACE FUNCTION public.talleres_editar_grupo(p_grupo_id uuid, p_nombre text, p_capacidad integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id uuid;
  v_grupo     public.taller_grupos%ROWTYPE;
BEGIN
  v_equipo_id := public.talleres_equipo_de_grupo(p_grupo_id);
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'GRUPO_NOT_FOUND: %', p_grupo_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NOT NULL AND length(btrim(p_nombre)) = 0 THEN
    RAISE EXCEPTION 'NOMBRE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_capacidad IS NOT NULL AND p_capacidad < 1 THEN
    RAISE EXCEPTION 'CAPACIDAD_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.taller_grupos
     SET nombre    = COALESCE(NULLIF(btrim(p_nombre), ''), nombre),
         capacidad = COALESCE(p_capacidad, capacidad)
   WHERE id = p_grupo_id
  RETURNING * INTO v_grupo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRUPO_NOT_FOUND: %', p_grupo_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_grupo.id,
    'cohorte_id', v_grupo.cohorte_id,
    'nombre', v_grupo.nombre,
    'capacidad', v_grupo.capacidad,
    'estado', v_grupo.estado
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_editar_grupo(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_editar_grupo(uuid, text, integer) TO authenticated, postgres, service_role;

-- ── talleres_editar_clase: tema/fecha_programada of an instantiated clase ─

CREATE OR REPLACE FUNCTION public.talleres_editar_clase(p_sesion_id uuid, p_tema text, p_fecha_programada timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_id  uuid;
  v_estado    text;
  v_equipo_id uuid;
  v_sesion    public.taller_sesiones%ROWTYPE;
BEGIN
  SELECT s.grupo_id, s.estado INTO v_grupo_id, v_estado
  FROM public.taller_sesiones s
  WHERE s.id = p_sesion_id;

  IF v_grupo_id IS NULL THEN
    RAISE EXCEPTION 'SESION_NOT_FOUND: %', p_sesion_id USING ERRCODE = 'P0002';
  END IF;

  v_equipo_id := public.talleres_equipo_de_grupo(v_grupo_id);

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  IF v_estado = 'cerrada' THEN
    RAISE EXCEPTION 'CLASE_CERRADA' USING ERRCODE = 'P0001';
  END IF;

  IF p_tema IS NOT NULL AND length(btrim(p_tema)) = 0 THEN
    RAISE EXCEPTION 'TEMA_REQUIRED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.taller_sesiones
     SET tema             = COALESCE(NULLIF(btrim(p_tema), ''), tema),
         fecha_programada = COALESCE(p_fecha_programada::date, fecha_programada)
   WHERE id = p_sesion_id
  RETURNING * INTO v_sesion;

  RETURN jsonb_build_object(
    'id', v_sesion.id,
    'grupo_id', v_sesion.grupo_id,
    'numero', v_sesion.numero,
    'tema', v_sesion.tema,
    'fecha_programada', v_sesion.fecha_programada,
    'estado', v_sesion.estado
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_editar_clase(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_editar_clase(uuid, text, timestamptz) TO authenticated, postgres, service_role;
