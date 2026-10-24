-- Niños: child records, pickup lists and family writes only reach families
-- of the caller's campuses (odd/tasks/ninos-roles-validacion.md, task R3d).
--
-- Before: the RLS policies of ninos_fichas and ninos_autorizados_retiro only
-- asked ninos_puede_operar_algun_area(), so an Anfitrión of one campus could
-- read (medical fields, notes, pickup people) and update the rows of every
-- campus with a direct table query. ninos_crear_ficha, ninos_vincular_padre
-- and ninos_vincular_revisando_edad accepted any person id, so an id from
-- another campus could be written to even though the searches
-- (20261013100000) no longer show it.
--
-- Now the same scope as the searches applies: a person is reachable when
-- ninos_en_alcance(person, ninos_campus_operables()) holds (they, or a
-- parent/child one hop away, are tied to a campus where the caller operates
-- Niños; admin/pastor reach everyone). Out-of-scope ids are refused as if
-- they did not exist ('nino_no_encontrado' / 'padre_no_encontrado', 22023),
-- so the refusal reveals nothing. Signatures, return shapes and grants are
-- unchanged.
--
-- The app reads both tables only through definer RPCs (which bypass RLS)
-- and updates ninos_fichas.salon_preferido_id directly from the check-in and
-- familias screens for families it found through the scoped searches, so
-- those screens keep working.
--
-- What (definer, empty search path):
--   1. ninos_en_mi_alcance(uuid) (new): the caller's scope for one person;
--      callable by authenticated so RLS policies can use it.
--   2. ninos_fichas / ninos_autorizados_retiro: SELECT, INSERT and UPDATE
--      policies add ninos_en_mi_alcance(child).
--   3. ninos_crear_ficha: the child must be in scope.
--   4. ninos_vincular_padre: every child and an existing parent in scope.
--   5. ninos_vincular_revisando_edad: the person must be in scope.
--
-- Not here (their latest body lives in an open PR, so they are scoped there):
-- ninos_actualizar_nino (#564), ninos_registrar_familia (#559, #563),
-- ninos_checkout (#563).
--
-- Rollback: re-create the six policies from 20261008140000_ninos_checkin_base.sql
-- (USING / WITH CHECK public.ninos_puede_operar_algun_area()), re-apply
-- ninos_crear_ficha from 20261008152000_ninos_rango_edad.sql,
-- ninos_vincular_padre from 20261008156000_ninos_genero_binario.sql and
-- ninos_vincular_revisando_edad from 20261008157000_ninos_revisar_edad.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_en_mi_alcance(uuid);

-- ── 1. the caller's scope for one person ─────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_en_mi_alcance(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_en_alcance(p_persona_id, public.ninos_campus_operables());
$$;

REVOKE ALL ON FUNCTION public.ninos_en_mi_alcance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_en_mi_alcance(uuid) TO authenticated;

-- ── 2. RLS ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ninos_fichas_select ON public.ninos_fichas;
DROP POLICY IF EXISTS ninos_fichas_insert ON public.ninos_fichas;
DROP POLICY IF EXISTS ninos_fichas_update ON public.ninos_fichas;
CREATE POLICY ninos_fichas_select ON public.ninos_fichas
  FOR SELECT TO authenticated
  USING (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(usuario_id));
CREATE POLICY ninos_fichas_insert ON public.ninos_fichas
  FOR INSERT TO authenticated
  WITH CHECK (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(usuario_id));
CREATE POLICY ninos_fichas_update ON public.ninos_fichas
  FOR UPDATE TO authenticated
  USING (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(usuario_id))
  WITH CHECK (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(usuario_id));

DROP POLICY IF EXISTS ninos_autorizados_retiro_select ON public.ninos_autorizados_retiro;
DROP POLICY IF EXISTS ninos_autorizados_retiro_insert ON public.ninos_autorizados_retiro;
DROP POLICY IF EXISTS ninos_autorizados_retiro_update ON public.ninos_autorizados_retiro;
CREATE POLICY ninos_autorizados_retiro_select ON public.ninos_autorizados_retiro
  FOR SELECT TO authenticated
  USING (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(nino_id));
CREATE POLICY ninos_autorizados_retiro_insert ON public.ninos_autorizados_retiro
  FOR INSERT TO authenticated
  WITH CHECK (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(nino_id));
CREATE POLICY ninos_autorizados_retiro_update ON public.ninos_autorizados_retiro
  FOR UPDATE TO authenticated
  USING (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(nino_id))
  WITH CHECK (public.ninos_puede_operar_algun_area() AND public.ninos_en_mi_alcance(nino_id));

-- ── 3. create a ficha ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_crear_ficha(p_nino_id uuid, p_ficha jsonb, p_autorizados jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nac date;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF (p_ficha IS NOT NULL AND jsonb_typeof(p_ficha) <> 'object')
     OR (p_autorizados IS NOT NULL AND jsonb_typeof(p_autorizados) <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  -- Only a child of the caller's campuses (R3d); anyone else is "not found".
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_nino_id)
     OR NOT public.ninos_en_mi_alcance(p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_id) THEN
    RAISE EXCEPTION 'ficha_existente' USING ERRCODE = '23505';
  END IF;
  IF NOT public.ninos_es_hijo_vinculado(p_nino_id) THEN
    RAISE EXCEPTION 'sin_padre' USING ERRCODE = '22023';
  END IF;

  -- Only children in the Niños age range: the birth date sent in the form,
  -- else the one on file. Unknown ⇒ refused.
  BEGIN
    v_nac := coalesce((p_ficha ->> 'fecha_nacimiento')::date,
                      (SELECT u.fecha_nacimiento::date FROM public.usuarios u WHERE u.id = p_nino_id));
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END;
  IF NOT public.ninos_en_rango_edad(v_nac) THEN
    RAISE EXCEPTION 'fuera_de_rango' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ninos_fichas (usuario_id) VALUES (p_nino_id);
  -- Same validation and writes as an edit; any error rolls back the insert.
  PERFORM public.ninos_actualizar_nino(p_nino_id,
    coalesce(p_ficha, '{}'::jsonb) - 'autorizados'
      || jsonb_build_object('autorizados', coalesce(p_autorizados, '[]'::jsonb)));
END;
$$;

-- ── 4. link a parent ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_vincular_padre(p_nino_ids uuid[], p_padre_id uuid, p_padre_nuevo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_padre  uuid := p_padre_id;
  v_nuevo  boolean := false;
  v_campus uuid;
  v_tel    text;
  v_cedula text;
  v_email  text;
  v_nino   uuid;
  v_count  integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NULL OR cardinality(p_nino_ids) = 0 OR array_position(p_nino_ids, NULL) IS NOT NULL
     OR (p_padre_id IS NULL) = (p_padre_nuevo IS NULL)
     OR (p_padre_nuevo IS NOT NULL AND jsonb_typeof(p_padre_nuevo) <> 'object') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'children and exactly one of padre id or new padre';
  END IF;

  -- Only children of the Niños module: a ficha, or a KNOWN birth date in the
  -- Niños age range (with or without a parent link yet: N12). Teens, adults
  -- and people without a birth date are never linked as children here.
  -- And only children of the caller's campuses (R3d).
  FOREACH v_nino IN ARRAY p_nino_ids LOOP
    IF (NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = v_nino)
        AND NOT public.ninos_en_rango_edad((SELECT u.fecha_nacimiento::date FROM public.usuarios u WHERE u.id = v_nino)))
       OR NOT public.ninos_en_mi_alcance(v_nino) THEN
      RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_padre IS NOT NULL THEN
    -- An existing parent must also be of the caller's campuses (R3d).
    IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_padre)
       OR NOT public.ninos_en_mi_alcance(v_padre) THEN
      RAISE EXCEPTION 'padre_no_encontrado' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_tel := public.normalizar_telefono_ve(public.ninos_texto(p_padre_nuevo, 'telefono'));
    v_cedula := public.normalizar_cedula_ve(public.ninos_texto(p_padre_nuevo, 'cedula'));
    v_email := lower(public.ninos_texto(p_padre_nuevo, 'email'));
    IF public.ninos_texto(p_padre_nuevo, 'nombre') IS NULL OR public.ninos_texto(p_padre_nuevo, 'apellido') IS NULL
       OR v_tel IS NULL OR length(regexp_replace(v_tel, '\D', '', 'g')) < 7
       OR coalesce(p_padre_nuevo ->> 'genero', '') NOT IN ('Masculino', 'Femenino')
       OR (v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'padre: nombre, apellido, telefono, genero, email';
    END IF;
    -- Never reuse silently (same rule as ninos_registrar_familia).
    IF public.ninos_padre_coincidencias(v_cedula, v_tel) <> '[]'::jsonb
       OR (v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email) = v_email)) THEN
      RAISE EXCEPTION 'padre_existente' USING ERRCODE = '23505';
    END IF;

    SELECT s.campus_id INTO v_campus
      FROM public.ninos_salones s
     WHERE s.activo AND public.ninos_puede_operar(s.equipo_id)
     ORDER BY EXISTS (SELECT 1 FROM public.usuario_campus uc
                       WHERE uc.usuario_id = v_actor AND uc.campus_id = s.campus_id AND uc.es_campus_principal) DESC,
              s.orden
     LIMIT 1;
    IF v_campus IS NULL THEN
      RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.usuarios (nombre, apellido, cedula, telefono, email, genero, estado_civil)
    VALUES (public.ninos_texto(p_padre_nuevo, 'nombre'), public.ninos_texto(p_padre_nuevo, 'apellido'),
            v_cedula, v_tel, v_email, (p_padre_nuevo ->> 'genero')::public.enum_genero, 'No especificado')
    RETURNING id INTO v_padre;
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
    VALUES (v_padre, v_campus, true);
    v_nuevo := true;
  END IF;

  FOREACH v_nino IN ARRAY p_nino_ids LOOP
    -- No self link and no cycle: the parent cannot be the child's own child.
    IF v_nino = v_padre
       OR EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                   WHERE (r.usuario1_id = v_padre AND r.usuario2_id = v_nino AND r.tipo_relacion IN ('padre', 'tutor'))
                      OR (r.usuario1_id = v_nino AND r.usuario2_id = v_padre AND r.tipo_relacion = 'hijo')) THEN
      RAISE EXCEPTION 'vinculo_invalido' USING ERRCODE = '22023';
    END IF;
    -- Idempotent: an existing link in either direction is kept as is.
    IF NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                    WHERE (r.usuario1_id = v_nino AND r.usuario2_id = v_padre AND r.tipo_relacion IN ('padre', 'tutor'))
                       OR (r.usuario1_id = v_padre AND r.usuario2_id = v_nino AND r.tipo_relacion = 'hijo')) THEN
      INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
      VALUES (v_nino, v_padre, 'padre', false)
      ON CONFLICT (usuario1_id, usuario2_id, tipo_relacion) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('padre_id', v_padre, 'padre_nuevo', v_nuevo, 'vinculados', v_count);
END;
$$;

-- ── 5. link while correcting the birth date ──────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_vincular_revisando_edad(
  p_nino_id uuid, p_fecha_nacimiento date, p_padre_id uuid, p_padre_nuevo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  -- Only a person of the caller's campuses (R3d): the birth date is written
  -- before ninos_vincular_padre checks the scope again.
  IF p_nino_id IS NULL OR NOT public.ninos_revisar_edad_candidato(p_nino_id)
     OR NOT public.ninos_en_mi_alcance(p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ninos_en_rango_edad(p_fecha_nacimiento) THEN
    RAISE EXCEPTION 'edad_fuera_de_rango' USING ERRCODE = '22023';
  END IF;

  UPDATE public.usuarios u SET fecha_nacimiento = p_fecha_nacimiento WHERE u.id = p_nino_id;

  RETURN public.ninos_vincular_padre(ARRAY[p_nino_id], p_padre_id, p_padre_nuevo);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_vincular_revisando_edad(uuid, date, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_vincular_revisando_edad(uuid, date, uuid, jsonb) TO authenticated;
