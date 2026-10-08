-- Dream Team: the volunteer coordinator fixes the personal data of the people
-- they serve with (T11 of odd/tasks/ninos-voluntarios-waumba.md).
--
-- Imported volunteers arrive with gaps (no birth date, 'No especificado',
-- no cedula, no phone). puede_editar_usuario gates the FULL user edit (self,
-- admin/pastor, Grupos de Vida leaders) and stays as it is; this adds a
-- narrow door for a handful of fields.
--
-- What:
--   1. public.dream_team_puede_editar_ficha(p_persona_id): whether the actor
--      (auth.uid()) may edit the person's ficha. Same authority as registering
--      a new person (20261006110100, dream_team_equipos_registrables: the
--      Coordinador of "Atención al Voluntario" over the parent area, a
--      dream_team.org.manage grant, admin or pastor; an area director, a team
--      leader, an Entrenador or a plain volunteer are NOT included), and the
--      target must hold a non-retired servicio in one of those equipos.
--   2. public.dream_team_ficha_persona(p_persona_id): the editable fields, to
--      prefill the form (usuarios RLS hides other people from a coordinator).
--   3. public.dream_team_editar_ficha(p_persona_id, p_datos jsonb): partial
--      update; only the keys present change. Editable keys: fecha_nacimiento,
--      cedula, genero, estado_civil, telefono, redes_sociales. Email is NOT
--      editable here (it may be tied to the auth account). Any other key is
--      refused. Errors (RAISE '<code>'):
--        42501 sin_autoridad; 22023 datos_invalidos, campo_no_editable,
--        fecha_nacimiento_invalida, genero_invalido, estado_civil_invalido,
--        redes_sociales_largo; 23505 cedula_duplicada.
--      The cedula and the phone are normalized by the usuarios triggers
--      (usuarios_normalizar_cedula, usuarios_normalizar_telefono); the
--      duplicate check compares through normalizar_cedula_ve as the
--      registration does. There is no person audit table in Dream Team, so
--      nothing is logged.
--
-- Blast radius: three new functions; no table, policy or trigger changes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dream_team_editar_ficha(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.dream_team_ficha_persona(uuid);
--   DROP FUNCTION IF EXISTS public.dream_team_puede_editar_ficha(uuid);

CREATE OR REPLACE FUNCTION public.dream_team_puede_editar_ficha(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid())
     AND EXISTS (
       SELECT 1
         FROM public.dream_team_servicios s
         JOIN public.dream_team_equipos_registrables() r ON r.equipo_id = s.equipo_id
        WHERE s.persona_id = p_persona_id
          AND s.estado <> 'retirado'
     );
$function$;

COMMENT ON FUNCTION public.dream_team_puede_editar_ficha(uuid) IS
  'Whether the actor (auth.uid()) may edit the person''s ficha: the person holds a non-retired '
  'servicio in an equipo of dream_team_equipos_registrables() (volunteer coordinator, org.manage, admin, pastor).';

REVOKE ALL ON FUNCTION public.dream_team_puede_editar_ficha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_puede_editar_ficha(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_ficha_persona(p_persona_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ficha jsonb;
BEGIN
  IF NOT public.dream_team_puede_editar_ficha(p_persona_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
           'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
           'fecha_nacimiento', u.fecha_nacimiento, 'cedula', u.cedula,
           'genero', u.genero, 'estado_civil', u.estado_civil,
           'telefono', u.telefono, 'redes_sociales', u.redes_sociales)
    INTO v_ficha
    FROM public.usuarios u
   WHERE u.id = p_persona_id;
  RETURN v_ficha;
END;
$function$;

COMMENT ON FUNCTION public.dream_team_ficha_persona(uuid) IS
  'The editable ficha fields of a person, for whoever dream_team_puede_editar_ficha allows.';

REVOKE ALL ON FUNCTION public.dream_team_ficha_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_ficha_persona(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_editar_ficha(p_persona_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_clave   text;
  v_texto   text;
  v_fecha   date;
  v_cedula  text;
  v_actual  public.usuarios%ROWTYPE;
BEGIN
  IF NOT public.dream_team_puede_editar_ficha(p_persona_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'datos_invalidos' USING errcode = '22023';
  END IF;
  FOR v_clave IN SELECT jsonb_object_keys(p_datos) LOOP
    IF v_clave NOT IN ('fecha_nacimiento', 'cedula', 'genero', 'estado_civil', 'telefono', 'redes_sociales') THEN
      RAISE EXCEPTION 'campo_no_editable' USING errcode = '22023';
    END IF;
  END LOOP;

  SELECT u.* INTO v_actual FROM public.usuarios u WHERE u.id = p_persona_id FOR UPDATE;

  -- Birth date: null clears it; otherwise a real date, not in the future, not before 1900.
  IF p_datos ? 'fecha_nacimiento' THEN
    v_texto := nullif(btrim(coalesce(p_datos ->> 'fecha_nacimiento', '')), '');
    IF v_texto IS NULL THEN
      v_actual.fecha_nacimiento := NULL;
    ELSE
      BEGIN
        IF v_texto !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RAISE EXCEPTION 'formato';
        END IF;
        v_fecha := v_texto::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'fecha_nacimiento_invalida' USING errcode = '22023';
      END;
      IF v_fecha > current_date OR v_fecha < DATE '1900-01-01' THEN
        RAISE EXCEPTION 'fecha_nacimiento_invalida' USING errcode = '22023';
      END IF;
      v_actual.fecha_nacimiento := v_fecha;
    END IF;
  END IF;

  -- Cedula: null or blank clears it; otherwise normalized and unique.
  IF p_datos ? 'cedula' THEN
    v_cedula := nullif(btrim(coalesce(p_datos ->> 'cedula', '')), '');
    IF v_cedula IS NOT NULL THEN
      v_cedula := public.normalizar_cedula_ve(v_cedula);
      IF EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.id <> p_persona_id
                    AND (u.cedula = v_cedula OR public.normalizar_cedula_ve(u.cedula) = v_cedula)) THEN
        RAISE EXCEPTION 'cedula_duplicada' USING errcode = '23505';
      END IF;
    END IF;
    v_actual.cedula := v_cedula;
  END IF;

  IF p_datos ? 'genero' THEN
    v_texto := p_datos ->> 'genero';
    IF v_texto IS NULL OR NOT (v_texto = ANY (enum_range(NULL::public.enum_genero)::text[])) THEN
      RAISE EXCEPTION 'genero_invalido' USING errcode = '22023';
    END IF;
    v_actual.genero := v_texto::public.enum_genero;
  END IF;

  IF p_datos ? 'estado_civil' THEN
    v_texto := p_datos ->> 'estado_civil';
    IF v_texto IS NULL OR NOT (v_texto = ANY (enum_range(NULL::public.enum_estado_civil)::text[])) THEN
      RAISE EXCEPTION 'estado_civil_invalido' USING errcode = '22023';
    END IF;
    v_actual.estado_civil := v_texto::public.enum_estado_civil;
  END IF;

  IF p_datos ? 'telefono' THEN
    v_actual.telefono := nullif(btrim(coalesce(p_datos ->> 'telefono', '')), '');
  END IF;

  IF p_datos ? 'redes_sociales' THEN
    v_texto := nullif(btrim(coalesce(p_datos ->> 'redes_sociales', '')), '');
    IF char_length(v_texto) > 300 THEN
      RAISE EXCEPTION 'redes_sociales_largo' USING errcode = '22023';
    END IF;
    v_actual.redes_sociales := v_texto;
  END IF;

  BEGIN
    UPDATE public.usuarios u
       SET fecha_nacimiento = v_actual.fecha_nacimiento,
           cedula           = v_actual.cedula,
           genero           = v_actual.genero,
           estado_civil     = v_actual.estado_civil,
           telefono         = v_actual.telefono,
           redes_sociales   = v_actual.redes_sociales
     WHERE u.id = p_persona_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'cedula_duplicada' USING errcode = '23505';
  END;

  RETURN public.dream_team_ficha_persona(p_persona_id);
END;
$function$;

COMMENT ON FUNCTION public.dream_team_editar_ficha(uuid, jsonb) IS
  'Partial update of a person''s ficha (fecha_nacimiento, cedula, genero, estado_civil, telefono, '
  'redes_sociales) by whoever dream_team_puede_editar_ficha allows (T11). Returns the updated ficha.';

REVOKE ALL ON FUNCTION public.dream_team_editar_ficha(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_editar_ficha(uuid, jsonb) TO authenticated;
