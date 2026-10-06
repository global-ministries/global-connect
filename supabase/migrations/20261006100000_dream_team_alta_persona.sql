-- noqa: insert-into
-- Dream Team: register a new person from the assigner (T7 and T9 of
-- odd/tasks/ninos-voluntarios-waumba.md, decision D7).
--
-- What:
--   1. public.dream_team_registrar_persona(...): in ONE transaction, creates a
--      person who is not in the system yet (usuarios without auth, the
--      'miembro' role, a principal campus), optionally links a representative
--      (relaciones_usuarios), and creates their servicio postulado in the
--      equipo with its history row and one pendiente verificacion per
--      requisito of the rol, exactly what POST /api/dream-team/servicios
--      writes. Answers jsonb:
--        {resultado: 'creada', persona_id, nombre, servicio_id}
--        {resultado: 'existente', persona_id, nombre}       (cedula taken)
--        {resultado: 'coincidencias', candidatos: [...]}     (no cedula, same
--                                                             name and birth date)
--      'existente' and 'coincidencias' write nothing: the assigner shows the
--      person(s) and the coordinator picks one, then assigns through POST.
--   2. public.dream_team_persona_por_cedula(text): finds one person by
--      normalized cedula (id, nombre, apellido), for the representative
--      picker of T9.
--
-- Choices, with their evidence:
--   - SECURITY DEFINER, actor = auth.uid() -> usuarios.auth_id. There is no
--     identity argument at all, so nobody can act as someone else (the rule
--     of the phase 2 hardening: identity bound to auth.uid()). EXECUTE is
--     revoked from PUBLIC and anon and granted to authenticated only.
--   - Authority: the exact OR of the dream_team_servicios INSERT policy on the
--     target equipo. Whoever may create a servicio there may register the
--     person they assign; nobody else (42501).
--   - The servicio is created inside this function, not by a second POST:
--     a person with no servicio would be an orphan nobody in Dream Team can
--     see again (usuarios RLS hides them from an area director), so person
--     and servicio commit or fail together.
--   - Never duplicate (D7): the cedula is normalized with normalizar_cedula_ve
--     and compared against the stored value and the stored value normalized
--     (rows written before the usuarios trigger), as the loader does. Without
--     cedula the birth date is required, and the same full-name key
--     (dream_team_clave_nombre) born the same day returns the candidates,
--     the rule of dream_team_cargar_voluntarios.
--   - Campus: p_campus_id (the actor's selected campus) when the actor belongs
--     to it, or is admin/pastor; otherwise 42501. NULL falls back to the
--     actor's principal campus. createUser and the loader write the same
--     principal usuario_campus row.
--   - T9: the representative is usuario2 of the link and the child usuario1,
--     tipo padre (default) or tutor: relaciones_usuarios reads "usuario2 is
--     <tipo> of usuario1" (AgregarFamiliarModal). agregar_relacion_familiar_
--     segura is not called: it requires puede_editar_usuario on both people,
--     which a Dream Team coordinator does not hold; here the link only ever
--     touches the person this same call creates. The representative's cedula
--     is never copied to the child.
--   - dream_team_persona_por_cedula authorizes like talleres_buscar_personas
--     (an active Dream Team writing grant), and only answers exact matches.
--
-- Blast radius: two new functions; no table, policy or trigger changes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dream_team_registrar_persona(uuid, uuid, text, text,
--     public.enum_genero, public.enum_estado_civil, text, date, text, boolean, date, text,
--     text, uuid, uuid, public.enum_tipo_relacion);
--   DROP FUNCTION IF EXISTS public.dream_team_persona_por_cedula(text);

CREATE OR REPLACE FUNCTION public.dream_team_registrar_persona(
  p_equipo_id          uuid,
  p_rol_id             uuid,
  p_nombre             text,
  p_apellido           text,
  p_genero             public.enum_genero,
  p_estado_civil       public.enum_estado_civil,
  p_cedula             text DEFAULT NULL,
  p_fecha_nacimiento   date DEFAULT NULL,
  p_telefono           text DEFAULT NULL,
  p_bautizado          boolean DEFAULT NULL,
  p_fecha_bautizo      date DEFAULT NULL,
  p_talla_franela      text DEFAULT NULL,
  p_redes_sociales     text DEFAULT NULL,
  p_campus_id          uuid DEFAULT NULL,
  p_representante_id   uuid DEFAULT NULL,
  p_representante_tipo public.enum_tipo_relacion DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor     uuid;
  v_nombre    text := btrim(coalesce(p_nombre, ''));
  v_apellido  text := btrim(coalesce(p_apellido, ''));
  v_cedula    text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_campus    uuid;
  v_tipo_rep  public.enum_tipo_relacion := coalesce(p_representante_tipo, 'padre');
  v_miembro   uuid;
  v_existe    public.usuarios%ROWTYPE;
  v_cand      jsonb;
  v_persona   uuid;
  v_servicio  uuid;
BEGIN
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
       OR public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', p_equipo_id)
       OR public.auth_has_dream_team_capability_in_tree('dream_team.direct', p_equipo_id)
       OR public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', p_equipo_id)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dream_team_roles r
                   JOIN public.dream_team_equipos e ON e.id = r.equipo_id
                  WHERE r.id = p_rol_id AND r.equipo_id = p_equipo_id AND r.activo AND e.activo) THEN
    RAISE EXCEPTION 'rol_invalido' USING errcode = '22023';
  END IF;
  IF v_nombre = '' OR v_apellido = '' THEN
    RAISE EXCEPTION 'nombre_y_apellido_requeridos' USING errcode = '22023';
  END IF;
  IF p_genero IS NULL OR p_estado_civil IS NULL THEN
    RAISE EXCEPTION 'genero_y_estado_civil_requeridos' USING errcode = '22023';
  END IF;
  IF v_cedula IS NULL AND p_fecha_nacimiento IS NULL THEN
    RAISE EXCEPTION 'fecha_nacimiento_requerida_sin_cedula' USING errcode = '22023';
  END IF;
  IF p_representante_id IS NOT NULL THEN
    IF v_tipo_rep NOT IN ('padre', 'tutor') THEN
      RAISE EXCEPTION 'tipo_representante_invalido' USING errcode = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_representante_id) THEN
      RAISE EXCEPTION 'representante_no_encontrado' USING errcode = '22023';
    END IF;
  END IF;

  -- The campus.
  IF p_campus_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.usuario_campus uc
                    WHERE uc.usuario_id = v_actor AND uc.campus_id = p_campus_id)
       AND NOT public.es_admin_o_pastor(auth.uid()) THEN
      RAISE EXCEPTION 'campus_ajeno' USING errcode = '42501';
    END IF;
    v_campus := p_campus_id;
  ELSE
    SELECT uc.campus_id INTO v_campus FROM public.usuario_campus uc
     WHERE uc.usuario_id = v_actor AND uc.es_campus_principal
     LIMIT 1;
    IF v_campus IS NULL THEN
      RAISE EXCEPTION 'actor_sin_campus' USING errcode = '22023';
    END IF;
  END IF;

  -- Never duplicate: by cedula ...
  IF v_cedula IS NOT NULL THEN
    v_cedula := public.normalizar_cedula_ve(v_cedula);
    SELECT u.* INTO v_existe FROM public.usuarios u
     WHERE u.cedula = v_cedula OR public.normalizar_cedula_ve(u.cedula) = v_cedula
     ORDER BY (u.cedula = v_cedula) DESC
     LIMIT 1;
    IF v_existe.id IS NOT NULL THEN
      RETURN jsonb_build_object('resultado', 'existente', 'persona_id', v_existe.id,
                                'nombre', btrim(v_existe.nombre || ' ' || v_existe.apellido));
    END IF;
  ELSE
    -- ... or, without one, by full name and birth date.
    SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
                                        'fecha_nacimiento', u.fecha_nacimiento) ORDER BY u.apellido, u.nombre)
      INTO v_cand
      FROM public.usuarios u
     WHERE u.fecha_nacimiento = p_fecha_nacimiento
       AND public.dream_team_clave_nombre(u.nombre, u.apellido) = public.dream_team_clave_nombre(v_nombre, v_apellido);
    IF v_cand IS NOT NULL THEN
      RETURN jsonb_build_object('resultado', 'coincidencias', 'candidatos', v_cand);
    END IF;
  END IF;

  SELECT rs.id INTO v_miembro FROM public.roles_sistema rs WHERE rs.nombre_interno = 'miembro';

  INSERT INTO public.usuarios (nombre, apellido, cedula, genero, estado_civil, fecha_nacimiento,
                               telefono, bautizado, fecha_bautizo, talla_franela, redes_sociales)
  VALUES (v_nombre, v_apellido, v_cedula, p_genero, p_estado_civil, p_fecha_nacimiento,
          nullif(btrim(coalesce(p_telefono, '')), ''), p_bautizado, p_fecha_bautizo,
          nullif(upper(btrim(coalesce(p_talla_franela, ''))), ''),
          nullif(btrim(coalesce(p_redes_sociales, '')), ''))
  RETURNING id INTO v_persona;

  IF v_miembro IS NOT NULL THEN
    INSERT INTO public.usuario_roles (usuario_id, rol_id)
    VALUES (v_persona, v_miembro)
    ON CONFLICT ON CONSTRAINT usuario_roles_unico DO NOTHING;
  END IF;

  INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
  VALUES (v_persona, v_campus, true);

  IF p_representante_id IS NOT NULL THEN
    INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
    VALUES (v_persona, p_representante_id, v_tipo_rep, false);
  END IF;

  INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
  VALUES (v_persona, p_equipo_id, p_rol_id, 'postulado', now(), 'admin_asignacion')
  RETURNING id INTO v_servicio;

  INSERT INTO public.dream_team_estados_historial
    (servicio_id, estado_anterior, estado_nuevo, motivo, actor_persona_id)
  VALUES (v_servicio, 'postulado', 'postulado', 'admin_asignacion', v_actor);

  INSERT INTO public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
  SELECT v_servicio, rq.id, 'pendiente'
    FROM public.dream_team_requisitos rq
   WHERE rq.rol_id = p_rol_id;

  RETURN jsonb_build_object('resultado', 'creada', 'persona_id', v_persona,
                            'nombre', v_nombre || ' ' || v_apellido, 'servicio_id', v_servicio);
END;
$function$;

COMMENT ON FUNCTION public.dream_team_registrar_persona(uuid, uuid, text, text, public.enum_genero,
  public.enum_estado_civil, text, date, text, boolean, date, text, text, uuid, uuid,
  public.enum_tipo_relacion) IS
  'Registers a person who is not in the system yet and assigns them a servicio postulado in one '
  'transaction (T7). Actor = auth.uid(); authority = the dream_team_servicios INSERT policy on the '
  'equipo. Never duplicates: an existing cedula answers existente, the same name and birth date '
  'answers coincidencias, both without writing. Optional representative link (T9).';

REVOKE ALL ON FUNCTION public.dream_team_registrar_persona(uuid, uuid, text, text, public.enum_genero,
  public.enum_estado_civil, text, date, text, boolean, date, text, text, uuid, uuid,
  public.enum_tipo_relacion) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_registrar_persona(uuid, uuid, text, text, public.enum_genero,
  public.enum_estado_civil, text, date, text, boolean, date, text, text, uuid, uuid,
  public.enum_tipo_relacion) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_persona_por_cedula(p_cedula text)
RETURNS TABLE (id uuid, nombre text, apellido text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor  uuid;
  v_cedula text := nullif(btrim(coalesce(p_cedula, '')), '');
BEGIN
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid();

  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.dream_team_capability_grants g
     WHERE g.persona_id = v_actor
       AND g.revoked_at IS NULL
       AND g.capability_key IN ('dream_team.org.manage', 'dream_team.director.coordinate',
                                'dream_team.direct', 'dream_team.requirements.manage',
                                'talleres_crecimiento.admin.manage', 'talleres_crecimiento.director.write')
  ) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;

  IF v_cedula IS NULL THEN
    RETURN;
  END IF;
  v_cedula := public.normalizar_cedula_ve(v_cedula);

  RETURN QUERY
  SELECT u.id, u.nombre, u.apellido
    FROM public.usuarios u
   WHERE u.cedula = v_cedula OR public.normalizar_cedula_ve(u.cedula) = v_cedula
   ORDER BY (u.cedula = v_cedula) DESC
   LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION public.dream_team_persona_por_cedula(text) IS
  'One person by normalized cedula (id, nombre, apellido), for the representative picker of the '
  'Dream Team assigner (T9). Actor = auth.uid(), with an active Dream Team writing grant.';

REVOKE ALL ON FUNCTION public.dream_team_persona_por_cedula(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_persona_por_cedula(text) TO authenticated;
