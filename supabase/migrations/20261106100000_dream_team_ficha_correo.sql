-- Dream Team: the email in "Editar ficha" (odd/tasks/dream-team-pendientes-director.md,
-- T2, S3: "Si el director puede editar el correo de los que no tienen cuenta,
-- si alguien tiene cuenta no puede solo lo puede hacer un administrador").
--
-- Why: the ficha left the email out on purpose (20261008100000: it may be tied
-- to the auth account), so a director could not fix the email of a person
-- they are about to invite. The email of a person WITHOUT account is just a
-- ficha field; the email of a person WITH account is their login identity.
--
-- What (same signatures, grants and owners; every other field unchanged):
--   1. public.dream_team_ficha_actor_es_admin(): whether the actor holds the
--      system role admin. Pastor is NOT included on purpose (es_admin_o_pastor
--      and es_superadmin both count pastor; S3 says "un administrador").
--      Internal: no EXECUTE for PUBLIC, anon or authenticated.
--   2. public.dream_team_ficha_persona(p): also answers email, tiene_cuenta
--      (auth_id IS NOT NULL) and puede_editar_email (no account, or the actor
--      is admin), so the UI locks the field from the database's answer.
--   3. public.dream_team_editar_ficha(p, datos): 'email' is an editable key.
--      Same authority as the rest of the ficha (dream_team_puede_editar_ficha);
--      on top of it, a person with account needs an admin. The email is
--      trimmed and lowercased; the same email (any case) is not a change.
--      New errors (RAISE '<code>'): 42501 email_solo_admin; 22023
--      email_invalido (format of invitacion_cuenta_crear: ^[^@\s]+@[^@\s]+\.[^@\s]+$,
--      at most 254; blank is allowed only without account and clears it);
--      23505 email_en_uso (another ficha holds it, any case, or an auth account
--      that is neither this person's nor one this person's invitations created,
--      as invitacion_cuenta_crear checks it). A unique violation on the email
--      index maps to email_en_uso, any other to cedula_duplicada as before.
--
-- auth.users is NOT touched: an admin changing the email of a person with
-- account updates usuarios.email only; the login email stays the old one
-- until an auth sync exists (follow-up: the repo has no flow that updates
-- auth.users.email). Account invitations are not touched either: an open
-- invitation keeps the email it was sent to (its link still works for that
-- address) and the next send uses the email of the ficha, as
-- invitacion_cuenta_crear already does.
--
-- Blast radius: one new internal helper, two replaced functions. The PATCH
-- route, the "Editar ficha" panel and fichas_editables are the only callers.
--
-- Rollback: re-apply the CREATE OR REPLACE of dream_team_ficha_persona and
-- dream_team_editar_ficha from 20261008100000_dream_team_editar_ficha.sql, then
-- DROP FUNCTION IF EXISTS public.dream_team_ficha_actor_es_admin();

CREATE OR REPLACE FUNCTION public.dream_team_ficha_actor_es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1
                   FROM public.usuarios u
                   JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                   JOIN public.roles_sistema r ON r.id = ur.rol_id
                  WHERE u.auth_id = auth.uid()
                    AND r.nombre_interno = 'admin');
$function$;

COMMENT ON FUNCTION public.dream_team_ficha_actor_es_admin() IS
  'Whether the actor (auth.uid()) holds the system role admin (pastor not included): who may change '
  'the email of a person with account in dream_team_editar_ficha.';

REVOKE ALL ON FUNCTION public.dream_team_ficha_actor_es_admin() FROM PUBLIC, anon, authenticated;

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
           'telefono', u.telefono, 'redes_sociales', u.redes_sociales,
           'email', u.email,
           'tiene_cuenta', u.auth_id IS NOT NULL,
           'puede_editar_email', u.auth_id IS NULL OR public.dream_team_ficha_actor_es_admin())
    INTO v_ficha
    FROM public.usuarios u
   WHERE u.id = p_persona_id;
  RETURN v_ficha;
END;
$function$;

COMMENT ON FUNCTION public.dream_team_ficha_persona(uuid) IS
  'The editable ficha fields of a person (plus email, tiene_cuenta, puede_editar_email), for whoever '
  'dream_team_puede_editar_ficha allows.';

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
  v_clave       text;
  v_texto       text;
  v_fecha       date;
  v_cedula      text;
  v_email       text;
  v_restriccion text;
  v_actual      public.usuarios%ROWTYPE;
BEGIN
  IF NOT public.dream_team_puede_editar_ficha(p_persona_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'datos_invalidos' USING errcode = '22023';
  END IF;
  FOR v_clave IN SELECT jsonb_object_keys(p_datos) LOOP
    IF v_clave NOT IN ('fecha_nacimiento', 'cedula', 'genero', 'estado_civil', 'telefono', 'redes_sociales', 'email') THEN
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

  -- Email: free without account; with account (the login identity) only an
  -- admin. The same email in another case is not a change.
  IF p_datos ? 'email' THEN
    v_email := lower(nullif(btrim(coalesce(p_datos ->> 'email', '')), ''));
    IF v_email IS DISTINCT FROM lower(nullif(btrim(coalesce(v_actual.email, '')), '')) THEN
      IF v_actual.auth_id IS NOT NULL AND NOT public.dream_team_ficha_actor_es_admin() THEN
        RAISE EXCEPTION 'email_solo_admin' USING errcode = '42501';
      END IF;
      IF v_email IS NULL THEN
        IF v_actual.auth_id IS NOT NULL THEN
          RAISE EXCEPTION 'email_invalido' USING errcode = '22023';
        END IF;
      ELSE
        IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
          RAISE EXCEPTION 'email_invalido' USING errcode = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM public.usuarios u
                    WHERE u.id <> p_persona_id AND lower(btrim(u.email)) = v_email) THEN
          RAISE EXCEPTION 'email_en_uso' USING errcode = '23505';
        END IF;
        IF EXISTS (SELECT 1 FROM auth.users au
                    WHERE lower(au.email) = v_email
                      AND au.id IS DISTINCT FROM v_actual.auth_id
                      AND au.id NOT IN (SELECT ic.auth_user_id FROM public.invitaciones_cuenta ic
                                         WHERE ic.usuario_id = p_persona_id
                                           AND ic.auth_user_id IS NOT NULL)) THEN
          RAISE EXCEPTION 'email_en_uso' USING errcode = '23505';
        END IF;
      END IF;
      v_actual.email := v_email;
    END IF;
  END IF;

  BEGIN
    UPDATE public.usuarios u
       SET fecha_nacimiento = v_actual.fecha_nacimiento,
           cedula           = v_actual.cedula,
           genero           = v_actual.genero,
           estado_civil     = v_actual.estado_civil,
           telefono         = v_actual.telefono,
           redes_sociales   = v_actual.redes_sociales,
           email            = v_actual.email
     WHERE u.id = p_persona_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
    IF v_restriccion LIKE '%email%' THEN
      RAISE EXCEPTION 'email_en_uso' USING errcode = '23505';
    END IF;
    RAISE EXCEPTION 'cedula_duplicada' USING errcode = '23505';
  END;

  RETURN public.dream_team_ficha_persona(p_persona_id);
END;
$function$;

COMMENT ON FUNCTION public.dream_team_editar_ficha(uuid, jsonb) IS
  'Partial update of a person''s ficha (fecha_nacimiento, cedula, genero, estado_civil, telefono, '
  'redes_sociales, email) by whoever dream_team_puede_editar_ficha allows; the email of a person with '
  'account only by an admin (dream_team_ficha_actor_es_admin). Returns the updated ficha.';

REVOKE ALL ON FUNCTION public.dream_team_editar_ficha(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_editar_ficha(uuid, jsonb) TO authenticated;
