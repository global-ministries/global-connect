-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: "Mis hijos" in Mi Perfil, write side (odd/tasks/ninos-mis-hijos.md,
-- task M2). The parent updates, the team verifies: a parent's edit applies at
-- once and leaves a change history.
--
-- What (definer functions, empty search path, fully qualified names):
--   1. ninos_fichas_cambios: one row per edit that changed something — child,
--      actor, origen ('padre' or 'equipo'), the changed fields and, when the
--      pickup list changed, the list before and after. RLS on, no policies,
--      no grants: only these functions write it.
--   2. ninos_ficha_estado(uuid) → jsonb (internal): the editable fields and
--      the active pickup list of a child with a ficha, compared before and
--      after an edit.
--   3. ninos_aplicar_ficha(uuid, jsonb, text) → text[] (internal): the update
--      logic that lived in ninos_actualizar_nino (same validation, errors and
--      writes). It now locks the ficha row so two edits of one child run one
--      after the other, records the change history with the given origen and
--      returns the changed fields.
--   4. ninos_actualizar_nino(uuid, jsonb): same signature, authority, errors
--      and behavior; it calls ninos_aplicar_ficha with origen 'equipo' (so
--      ninos_crear_ficha, which reuses it, is recorded too).
--   5. ninos_mis_hijos_guardar(uuid, jsonb) → jsonb, for authenticated users:
--      a parent saves one of their children (ninos_es_mi_hijo, checked first
--      and again after the change). Accepted keys: grado, alergias,
--      necesidades_especiales, habitos, notas, puede_comer, cambio_panal,
--      autoriza_imagen, escolarizado, autorizados, nombre, apellido,
--      fecha_nacimiento, genero; the last four only when the child has no
--      own account. At most 6 pickup people and 500 characters per text. A
--      linked child under 13 without a ficha gets one. Returns
--      {"campos": [changed fields]}.
--
-- Errors of ninos_mis_hijos_guardar: sin_autoridad (42501) without a current
-- user; nino_no_encontrado (22023) for anything but one of my children (never
-- says whether the child exists); campo_no_permitido (42501) for another key
-- or the identity of a child with an own account; limite_autorizados,
-- texto_muy_largo, edad_fuera_de_rango (future birth date, 18 or older, or a
-- child without ficha who would be 13 or older) and datos_invalidos (22023).
--
-- Rollback: re-run ninos_actualizar_nino from
-- 20261008156000_ninos_genero_binario.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_mis_hijos_guardar(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_aplicar_ficha(uuid, jsonb, text);
--   DROP FUNCTION IF EXISTS public.ninos_ficha_estado(uuid);
--   DROP TABLE IF EXISTS public.ninos_fichas_cambios;

-- ── 1. change history ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_fichas_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN ('padre', 'equipo')),
  campos text[] NOT NULL CHECK (cardinality(campos) > 0),
  autorizados_antes jsonb,
  autorizados_despues jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ninos_fichas_cambios_nino_idx ON public.ninos_fichas_cambios (nino_id, created_at);

ALTER TABLE public.ninos_fichas_cambios ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.ninos_fichas_cambios FROM PUBLIC, anon, authenticated;

-- ── 2. the editable state of a child ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_ficha_estado(p_nino_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'nombre', u.nombre, 'apellido', u.apellido, 'fecha_nacimiento', u.fecha_nacimiento,
           'genero', u.genero, 'grado', f.grado, 'alergias', f.alergias,
           'necesidades_especiales', f.necesidades_especiales, 'habitos', f.habitos, 'notas', f.notas,
           'puede_comer', f.puede_comer, 'cambio_panal', f.cambio_panal, 'autoriza_imagen', f.autoriza_imagen,
           'escolarizado', f.escolarizado, 'salon_preferido_id', f.salon_preferido_id,
           'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'nombre', a.nombre, 'telefono', a.telefono, 'relacion', a.relacion)
                              ORDER BY a.nombre, a.telefono, a.relacion), '[]'::jsonb)
                             FROM public.ninos_autorizados_retiro a WHERE a.nino_id = u.id AND a.activo))
    FROM public.usuarios u
    JOIN public.ninos_fichas f ON f.usuario_id = u.id
   WHERE u.id = p_nino_id;
$$;
REVOKE ALL ON FUNCTION public.ninos_ficha_estado(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. the shared update logic ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_aplicar_ficha(p_nino_id uuid, p jsonb, p_origen text)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grado   integer;
  v_nac     date;
  v_salon   uuid;
  v_aut     jsonb;
  v_antes   jsonb;
  v_despues jsonb;
  v_campos  text[];
BEGIN
  IF p_origen IS NULL OR p_origen NOT IN ('padre', 'equipo') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'origen';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object'
     OR (p ? 'autorizados' AND jsonb_typeof(p -> 'autorizados') <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  -- One edit of a child at a time: the pickup list is replaced as a whole.
  PERFORM 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_grado := (p ->> 'grado')::integer;
    v_nac := (p ->> 'fecha_nacimiento')::date;
    v_salon := (p ->> 'salon_preferido_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END;
  IF (v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6)
     OR (v_salon IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.id = v_salon AND s.activo)) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF (p ? 'nombre' AND public.ninos_texto(p, 'nombre') IS NULL)
     OR (p ? 'apellido' AND public.ninos_texto(p, 'apellido') IS NULL)
     OR (p ? 'genero' AND coalesce(p ->> 'genero', '') NOT IN ('Masculino', 'Femenino'))
     OR (p ? 'fecha_nacimiento' AND (v_nac IS NULL OR v_nac > public.ninos_hoy()
                                     OR v_nac < public.ninos_hoy() - interval '18 years')) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'nombre, apellido, fecha_nacimiento, genero';
  END IF;

  v_antes := public.ninos_ficha_estado(p_nino_id);

  UPDATE public.usuarios u SET
    nombre = CASE WHEN p ? 'nombre' THEN public.ninos_texto(p, 'nombre') ELSE u.nombre END,
    apellido = CASE WHEN p ? 'apellido' THEN public.ninos_texto(p, 'apellido') ELSE u.apellido END,
    fecha_nacimiento = CASE WHEN p ? 'fecha_nacimiento' THEN v_nac ELSE u.fecha_nacimiento END,
    genero = CASE WHEN p ? 'genero' THEN (p ->> 'genero')::public.enum_genero ELSE u.genero END
  WHERE u.id = p_nino_id
    AND (p ? 'nombre' OR p ? 'apellido' OR p ? 'fecha_nacimiento' OR p ? 'genero');

  UPDATE public.ninos_fichas f SET
    grado = CASE WHEN p ? 'grado' THEN v_grado ELSE f.grado END,
    alergias = CASE WHEN p ? 'alergias' THEN public.ninos_texto(p, 'alergias') ELSE f.alergias END,
    necesidades_especiales = CASE WHEN p ? 'necesidades_especiales'
                                  THEN public.ninos_texto(p, 'necesidades_especiales') ELSE f.necesidades_especiales END,
    habitos = CASE WHEN p ? 'habitos' THEN public.ninos_texto(p, 'habitos') ELSE f.habitos END,
    notas = CASE WHEN p ? 'notas' THEN public.ninos_texto(p, 'notas') ELSE f.notas END,
    puede_comer = CASE WHEN p ? 'puede_comer' THEN (p ->> 'puede_comer')::boolean ELSE f.puede_comer END,
    cambio_panal = CASE WHEN p ? 'cambio_panal' THEN (p ->> 'cambio_panal')::boolean ELSE f.cambio_panal END,
    autoriza_imagen = CASE WHEN p ? 'autoriza_imagen' THEN (p ->> 'autoriza_imagen')::boolean ELSE f.autoriza_imagen END,
    escolarizado = CASE WHEN p ? 'escolarizado' THEN (p ->> 'escolarizado')::boolean ELSE f.escolarizado END,
    salon_preferido_id = CASE WHEN p ? 'salon_preferido_id' THEN v_salon ELSE f.salon_preferido_id END
  WHERE f.usuario_id = p_nino_id;

  IF p ? 'autorizados' THEN
    UPDATE public.ninos_autorizados_retiro a SET activo = false WHERE a.nino_id = p_nino_id AND a.activo;
    FOR v_aut IN SELECT x FROM jsonb_array_elements(p -> 'autorizados') AS t(x) LOOP
      IF jsonb_typeof(v_aut) <> 'object' OR public.ninos_texto(v_aut, 'nombre') IS NULL THEN
        RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'autorizado: nombre';
      END IF;
      INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, telefono, relacion)
      VALUES (p_nino_id, public.ninos_texto(v_aut, 'nombre'), public.ninos_texto(v_aut, 'telefono'),
              public.ninos_texto(v_aut, 'relacion'));
    END LOOP;
  END IF;

  v_despues := public.ninos_ficha_estado(p_nino_id);
  SELECT coalesce(array_agg(c.campo ORDER BY c.n), '{}') INTO v_campos
    FROM unnest(ARRAY['nombre', 'apellido', 'fecha_nacimiento', 'genero', 'grado', 'alergias',
                      'necesidades_especiales', 'habitos', 'notas', 'puede_comer', 'cambio_panal',
                      'autoriza_imagen', 'escolarizado', 'salon_preferido_id', 'autorizados'])
         WITH ORDINALITY AS c(campo, n)
   WHERE v_antes -> c.campo IS DISTINCT FROM v_despues -> c.campo;

  IF cardinality(v_campos) > 0 THEN
    INSERT INTO public.ninos_fichas_cambios (nino_id, actor_id, origen, campos, autorizados_antes, autorizados_despues)
    VALUES (p_nino_id, public.ninos_usuario_actual(), p_origen, v_campos,
            CASE WHEN 'autorizados' = ANY (v_campos) THEN v_antes -> 'autorizados' END,
            CASE WHEN 'autorizados' = ANY (v_campos) THEN v_despues -> 'autorizados' END);
  END IF;
  RETURN v_campos;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_aplicar_ficha(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ── 4. the team's edit (unchanged behavior) ──────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_actualizar_nino(p_nino_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ninos_aplicar_ficha(p_nino_id, p, 'equipo');
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) TO authenticated;

-- ── 5. the parent's save ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos_guardar(p_nino_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_permitidos CONSTANT text[] := ARRAY['grado', 'alergias', 'necesidades_especiales', 'habitos', 'notas',
    'puede_comer', 'cambio_panal', 'autoriza_imagen', 'escolarizado', 'autorizados',
    'nombre', 'apellido', 'fecha_nacimiento', 'genero'];
  v_identidad  CONSTANT text[] := ARRAY['nombre', 'apellido', 'fecha_nacimiento', 'genero'];
  v_si_no      CONSTANT text[] := ARRAY['puede_comer', 'cambio_panal', 'autoriza_imagen', 'escolarizado'];
  v_nac    date;
  v_campos text[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  -- The same answer whether the child does not exist or is not mine.
  IF NOT public.ninos_es_mi_hijo(p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR octet_length(p::text) > 32768 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) k WHERE k <> ALL (v_permitidos)) THEN
    RAISE EXCEPTION 'campo_no_permitido' USING ERRCODE = '42501';
  END IF;
  -- A child with an own account keeps their own name, birth date and gender.
  IF p ?| v_identidad AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_nino_id AND u.auth_id IS NOT NULL) THEN
    RAISE EXCEPTION 'campo_no_permitido' USING ERRCODE = '42501', DETAIL = 'identidad';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_si_no) k WHERE p ? k AND jsonb_typeof(p -> k) NOT IN ('boolean', 'null'))
     OR (p ? 'autorizados' AND jsonb_typeof(p -> 'autorizados') <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p ? 'autorizados' AND jsonb_array_length(p -> 'autorizados') > 6 THEN
    RAISE EXCEPTION 'limite_autorizados' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_permitidos) k WHERE k <> 'autorizados' AND length(p ->> k) > 500)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p -> 'autorizados', '[]'::jsonb)) a(x)
                 WHERE jsonb_typeof(a.x) = 'object'
                   AND greatest(length(a.x ->> 'nombre'), length(a.x ->> 'telefono'), length(a.x ->> 'relacion')) > 500) THEN
    RAISE EXCEPTION 'texto_muy_largo' USING ERRCODE = '22023';
  END IF;
  IF p ? 'fecha_nacimiento' THEN
    BEGIN
      v_nac := (p ->> 'fecha_nacimiento')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
    END;
    IF v_nac > public.ninos_hoy() OR v_nac < public.ninos_hoy() - interval '18 years' THEN
      RAISE EXCEPTION 'edad_fuera_de_rango' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- A linked child without a ficha is mine only while under 13: check the
  -- birth date this save leaves before creating the ficha.
  IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_id) THEN
    IF NOT public.ninos_en_rango_edad(coalesce(v_nac, (SELECT u.fecha_nacimiento FROM public.usuarios u
                                                        WHERE u.id = p_nino_id))) THEN
      RAISE EXCEPTION 'edad_fuera_de_rango' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.ninos_fichas (usuario_id) VALUES (p_nino_id) ON CONFLICT (usuario_id) DO NOTHING;
  END IF;

  v_campos := public.ninos_aplicar_ficha(p_nino_id, p, 'padre');

  IF NOT public.ninos_es_mi_hijo(p_nino_id) THEN
    RAISE EXCEPTION 'edad_fuera_de_rango' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('campos', to_jsonb(v_campos));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_hijos_guardar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_hijos_guardar(uuid, jsonb) TO authenticated;
