-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: register a child from home in Mi Perfil (odd/tasks/ninos-mis-hijos.md,
-- task M3, decisions D1 and D3).
--
-- A signed-in adult registers their own children so the Sunday table only
-- confirms instead of typing. The parent is always ninos_usuario_actual(),
-- never a payload field; registering only links the children created in that
-- same call to the caller (no way to link another adult, D3).
--
-- D1: a registered child is usable right away (a ficha, a child → me 'padre'
-- link and the chosen campus) and carries a "registered from home" marker
-- (ninos_fichas.desde_casa_at / desde_casa_por) the team clears on the first
-- check-in. Only a likely duplicate (same name key and birth date as a person
-- outside my family) is not created: it waits in the staff pending list as a
-- pre-registration requested from the account (solicitado_por).
--
-- What (definer functions, empty search path, fully qualified names):
--   1. ninos_fichas.desde_casa_at, desde_casa_por; ninos_preregistros.solicitado_por
--      (+ index for the per-account daily cap).
--   2. ninos_mis_hijos_campus() → jsonb: the campus with an active Niños room,
--      the caller's principal campus flagged, for the form.
--   3. ninos_mis_hijos_registrar(jsonb) → jsonb, for authenticated users.
--      Payload keys: campus_id, hijos (1..10), autorizados (0..6, for every
--      child of the call). Child keys: nombre, apellido, fecha_nacimiento,
--      genero, grado, alergias, necesidades_especiales, habitos, notas,
--      puede_comer, cambio_panal, autoriza_imagen, escolarizado (never the
--      room, VIP or origen). At most 500 characters per text, a 32 KB
--      payload and 10 children per account in 24 hours (registered plus
--      pending). Returns {"registrados": [{id, nombre, apellido}],
--      "pendientes": [{nombre, apellido}]}.
--   4. ninos_mis_hijos_pendientes() → jsonb: my own pending requests (30 days).
--   5. ninos_preregistros_pendientes(): the staff list keeps the last 7 days
--      for the public QR (the rolling window of the coverage fix,
--      20261012130000_ninos_cobertura_pendientes.sql, on another branch) and
--      30 days for requests from an account. Same columns, authority and
--      grants. Whichever of the two migrations lands second must keep both
--      clauses.
--
-- Errors of ninos_mis_hijos_registrar: sin_autoridad (42501) without a current
-- user; campo_no_permitido (42501) for another key; sin_campus,
-- limite_hijos, limite_autorizados, texto_muy_largo, edad_fuera_de_rango
-- (future birth date or 13 or older), limite_diario and datos_invalidos
-- (22023); hijo_ya_registrado (23505) for a child already in my family, in
-- my pending requests or twice in the call. All or nothing.
--
-- Rollback: re-run ninos_preregistros_pendientes from
-- 20261008153000_ninos_unificar.sql (or the coverage fix once merged), then
--   DROP FUNCTION IF EXISTS public.ninos_mis_hijos_pendientes();
--   DROP FUNCTION IF EXISTS public.ninos_mis_hijos_registrar(jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_mis_hijos_campus();
--   DROP INDEX IF EXISTS public.usuarios_fecha_nacimiento_idx;
--   DROP INDEX IF EXISTS public.ninos_preregistros_solicitado_idx;
--   DROP INDEX IF EXISTS public.ninos_fichas_desde_casa_idx;
--   and remove the columns ninos_preregistros.solicitado_por,
--   ninos_fichas.desde_casa_por and ninos_fichas.desde_casa_at.

-- ── 1. columns ───────────────────────────────────────────────────────

ALTER TABLE public.ninos_fichas
  ADD COLUMN IF NOT EXISTS desde_casa_at timestamptz,
  ADD COLUMN IF NOT EXISTS desde_casa_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ninos_fichas_desde_casa_idx
  ON public.ninos_fichas (desde_casa_por, desde_casa_at) WHERE desde_casa_por IS NOT NULL;

ALTER TABLE public.ninos_preregistros
  ADD COLUMN IF NOT EXISTS solicitado_por uuid REFERENCES public.usuarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ninos_preregistros_solicitado_idx
  ON public.ninos_preregistros (solicitado_por, created_at DESC) WHERE solicitado_por IS NOT NULL;
-- The likely-duplicate lookup is by birth date first.
CREATE INDEX IF NOT EXISTS usuarios_fecha_nacimiento_idx
  ON public.usuarios (fecha_nacimiento) WHERE fecha_nacimiento IS NOT NULL;

-- ── 2. campus for the form ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos_campus()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo uuid := public.ninos_usuario_actual();
BEGIN
  IF v_yo IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre,
             'principal', EXISTS (SELECT 1 FROM public.usuario_campus uc
                                   WHERE uc.usuario_id = v_yo AND uc.campus_id = c.id AND uc.es_campus_principal))
             ORDER BY c.nombre), '[]'::jsonb)
      FROM public.campus c
     WHERE EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = c.id AND s.activo)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_hijos_campus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_hijos_campus() TO authenticated;

-- ── 3. register from home ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos_registrar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_claves     CONSTANT text[] := ARRAY['campus_id', 'hijos', 'autorizados'];
  v_hijo_claves CONSTANT text[] := ARRAY['nombre', 'apellido', 'fecha_nacimiento', 'genero', 'grado', 'alergias',
    'necesidades_especiales', 'habitos', 'notas', 'puede_comer', 'cambio_panal', 'autoriza_imagen', 'escolarizado'];
  v_textos     CONSTANT text[] := ARRAY['nombre', 'apellido', 'alergias', 'necesidades_especiales', 'habitos', 'notas'];
  v_si_no      CONSTANT text[] := ARRAY['puede_comer', 'cambio_panal', 'autoriza_imagen', 'escolarizado'];
  v_yo         uuid := public.ninos_usuario_actual();
  v_campus     uuid;
  v_hijo       jsonb;
  v_aut        jsonb;
  v_nac        date;
  v_grado      integer;
  v_clave      text;
  v_claves_vistas text[] := '{}';
  v_nino       uuid;
  v_creados    uuid[] := '{}';
  v_registrados jsonb := '[]'::jsonb;
  v_pendientes jsonb := '[]'::jsonb;
  v_padre      public.usuarios%ROWTYPE;
BEGIN
  IF v_yo IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR octet_length(p::text) > 32768
     OR jsonb_typeof(p -> 'hijos') IS DISTINCT FROM 'array' OR jsonb_array_length(p -> 'hijos') = 0
     OR (p ? 'autorizados' AND jsonb_typeof(p -> 'autorizados') <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  -- Never a parent, a room, VIP or any other key from the payload.
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) k WHERE k <> ALL (v_claves))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p -> 'hijos') h(x)
                 WHERE jsonb_typeof(h.x) = 'object'
                   AND EXISTS (SELECT 1 FROM jsonb_object_keys(h.x) k WHERE k <> ALL (v_hijo_claves))) THEN
    RAISE EXCEPTION 'campo_no_permitido' USING ERRCODE = '42501';
  END IF;
  IF jsonb_array_length(p -> 'hijos') > 10 THEN
    RAISE EXCEPTION 'limite_hijos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(p -> 'autorizados', '[]'::jsonb)) > 6 THEN
    RAISE EXCEPTION 'limite_autorizados' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p -> 'hijos') h(x)
              WHERE jsonb_typeof(h.x) = 'object'
                AND EXISTS (SELECT 1 FROM unnest(v_hijo_claves) k WHERE length(h.x ->> k) > 500))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p -> 'autorizados', '[]'::jsonb)) a(x)
                 WHERE jsonb_typeof(a.x) = 'object'
                   AND greatest(length(a.x ->> 'nombre'), length(a.x ->> 'telefono'), length(a.x ->> 'relacion')) > 500) THEN
    RAISE EXCEPTION 'texto_muy_largo' USING ERRCODE = '22023';
  END IF;
  FOR v_aut IN SELECT x FROM jsonb_array_elements(coalesce(p -> 'autorizados', '[]'::jsonb)) AS t(x) LOOP
    IF jsonb_typeof(v_aut) <> 'object' OR public.ninos_texto(v_aut, 'nombre') IS NULL THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'autorizado: nombre';
    END IF;
  END LOOP;

  BEGIN
    v_campus := (p ->> 'campus_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
  END;
  IF v_campus IS NULL OR NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = v_campus AND s.activo) THEN
    RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
  END IF;

  -- One registration per account at a time, so the daily cap cannot be raced.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_mis_hijos_registrar:' || v_yo::text, 0));
  IF (SELECT count(*) FROM public.ninos_fichas f
       WHERE f.desde_casa_por = v_yo AND f.desde_casa_at > now() - interval '24 hours')
     + (SELECT coalesce(sum(jsonb_array_length(r.payload -> 'hijos')), 0) FROM public.ninos_preregistros r
         WHERE r.solicitado_por = v_yo AND r.created_at > now() - interval '24 hours')
     + jsonb_array_length(p -> 'hijos') > 10 THEN
    RAISE EXCEPTION 'limite_diario' USING ERRCODE = '22023';
  END IF;

  FOR v_hijo IN SELECT x FROM jsonb_array_elements(p -> 'hijos') AS t(x) LOOP
    IF jsonb_typeof(v_hijo) <> 'object' OR public.ninos_texto(v_hijo, 'nombre') IS NULL
       OR public.ninos_texto(v_hijo, 'apellido') IS NULL
       OR coalesce(v_hijo ->> 'genero', '') NOT IN ('Masculino', 'Femenino')
       OR EXISTS (SELECT 1 FROM unnest(v_si_no) k WHERE v_hijo ? k AND jsonb_typeof(v_hijo -> k) NOT IN ('boolean', 'null'))
       OR EXISTS (SELECT 1 FROM unnest(v_textos) k WHERE v_hijo ? k AND jsonb_typeof(v_hijo -> k) NOT IN ('string', 'null')) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: nombre, apellido, genero';
    END IF;
    BEGIN
      v_nac := (v_hijo ->> 'fecha_nacimiento')::date;
      v_grado := (v_hijo ->> 'grado')::integer;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado';
    END;
    IF v_nac IS NULL OR (v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado';
    END IF;
    IF NOT public.ninos_en_rango_edad(v_nac) THEN
      RAISE EXCEPTION 'edad_fuera_de_rango' USING ERRCODE = '22023';
    END IF;

    v_clave := public.dream_team_clave_nombre(public.ninos_texto(v_hijo, 'nombre'), public.ninos_texto(v_hijo, 'apellido'))
               || '|' || v_nac::text;
    -- Already in my family, already waiting in my requests, or twice in this call.
    IF v_clave = ANY (v_claves_vistas)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(public.ninos_familia_hijos(v_yo)) e(h)
                   WHERE public.dream_team_clave_nombre(e.h ->> 'nombre', e.h ->> 'apellido') || '|'
                         || (e.h ->> 'fecha_nacimiento') = v_clave)
       OR EXISTS (SELECT 1 FROM public.ninos_preregistros r, jsonb_array_elements(r.payload -> 'hijos') e(h)
                   WHERE r.solicitado_por = v_yo AND r.estado = 'pendiente'
                     AND public.dream_team_clave_nombre(e.h ->> 'nombre', e.h ->> 'apellido') || '|'
                         || (e.h ->> 'fecha_nacimiento') = v_clave) THEN
      RAISE EXCEPTION 'hijo_ya_registrado' USING ERRCODE = '23505';
    END IF;
    v_claves_vistas := v_claves_vistas || v_clave;

    -- A likely duplicate of someone outside my family waits for the team (D1).
    IF EXISTS (SELECT 1 FROM public.usuarios u
                WHERE u.fecha_nacimiento = v_nac AND u.id <> ALL (v_creados)
                  AND public.dream_team_clave_nombre(u.nombre, u.apellido)
                    = public.dream_team_clave_nombre(public.ninos_texto(v_hijo, 'nombre'), public.ninos_texto(v_hijo, 'apellido'))) THEN
      v_pendientes := v_pendientes || jsonb_build_array(jsonb_build_object(
        'nombre', public.ninos_texto(v_hijo, 'nombre'), 'apellido', public.ninos_texto(v_hijo, 'apellido'),
        'fecha_nacimiento', v_nac, 'genero', v_hijo ->> 'genero', 'grado', v_grado,
        'alergias', public.ninos_texto(v_hijo, 'alergias'),
        'necesidades_especiales', public.ninos_texto(v_hijo, 'necesidades_especiales'),
        'habitos', public.ninos_texto(v_hijo, 'habitos'), 'notas', public.ninos_texto(v_hijo, 'notas'),
        'puede_comer', (v_hijo ->> 'puede_comer')::boolean, 'cambio_panal', (v_hijo ->> 'cambio_panal')::boolean,
        'autoriza_imagen', (v_hijo ->> 'autoriza_imagen')::boolean, 'escolarizado', (v_hijo ->> 'escolarizado')::boolean,
        'salon_preferido_id', NULL));
      CONTINUE;
    END IF;

    INSERT INTO public.usuarios (nombre, apellido, genero, estado_civil, fecha_nacimiento)
    VALUES (public.ninos_texto(v_hijo, 'nombre'), public.ninos_texto(v_hijo, 'apellido'),
            (v_hijo ->> 'genero')::public.enum_genero, 'No especificado', v_nac)
    RETURNING id INTO v_nino;
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
    VALUES (v_nino, v_campus, true);
    INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
    VALUES (v_nino, v_yo, 'padre', true);
    INSERT INTO public.ninos_fichas (usuario_id, grado, alergias, necesidades_especiales, habitos, notas,
                                     puede_comer, cambio_panal, autoriza_imagen, escolarizado,
                                     desde_casa_at, desde_casa_por)
    VALUES (v_nino, v_grado, public.ninos_texto(v_hijo, 'alergias'), public.ninos_texto(v_hijo, 'necesidades_especiales'),
            public.ninos_texto(v_hijo, 'habitos'), public.ninos_texto(v_hijo, 'notas'),
            (v_hijo ->> 'puede_comer')::boolean, (v_hijo ->> 'cambio_panal')::boolean,
            (v_hijo ->> 'autoriza_imagen')::boolean, (v_hijo ->> 'escolarizado')::boolean,
            now(), v_yo);
    INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, telefono, relacion)
    SELECT v_nino, public.ninos_texto(a.x, 'nombre'), public.ninos_texto(a.x, 'telefono'), public.ninos_texto(a.x, 'relacion')
      FROM jsonb_array_elements(coalesce(p -> 'autorizados', '[]'::jsonb)) AS a(x);

    v_creados := v_creados || v_nino;
    v_registrados := v_registrados || jsonb_build_array(jsonb_build_object(
      'id', v_nino, 'nombre', public.ninos_texto(v_hijo, 'nombre'), 'apellido', public.ninos_texto(v_hijo, 'apellido')));
  END LOOP;

  IF jsonb_array_length(v_pendientes) > 0 THEN
    SELECT u.* INTO v_padre FROM public.usuarios u WHERE u.id = v_yo;
    -- The payload of a public pre-registration, so the table reviews it the same way.
    INSERT INTO public.ninos_preregistros (campus_id, payload, solicitado_por)
    VALUES (v_campus,
            jsonb_build_object(
              'padre', jsonb_build_object('nombre', v_padre.nombre, 'apellido', v_padre.apellido,
                                          'telefono', v_padre.telefono, 'email', v_padre.email,
                                          'cedula', v_padre.cedula, 'genero', v_padre.genero),
              'hijos', v_pendientes,
              'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                 'nombre', public.ninos_texto(a.x, 'nombre'), 'telefono', public.ninos_texto(a.x, 'telefono'),
                                 'relacion', public.ninos_texto(a.x, 'relacion'))), '[]'::jsonb)
                                FROM jsonb_array_elements(coalesce(p -> 'autorizados', '[]'::jsonb)) AS a(x))),
            v_yo);
  END IF;

  RETURN jsonb_build_object(
    'registrados', v_registrados,
    'pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', e.h ->> 'nombre', 'apellido', e.h ->> 'apellido')),
                                   '[]'::jsonb)
                     FROM jsonb_array_elements(v_pendientes) e(h)));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_hijos_registrar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_hijos_registrar(jsonb) TO authenticated;

-- ── 4. my pending requests ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos_pendientes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo uuid := public.ninos_usuario_actual();
BEGIN
  IF v_yo IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'nombre', e.h ->> 'nombre', 'apellido', e.h ->> 'apellido', 'created_at', r.created_at)
             ORDER BY r.created_at, e.n), '[]'::jsonb)
      FROM public.ninos_preregistros r, jsonb_array_elements(r.payload -> 'hijos') WITH ORDINALITY e(h, n)
     WHERE r.solicitado_por = v_yo AND r.estado = 'pendiente' AND r.created_at > now() - interval '30 days'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_hijos_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_hijos_pendientes() TO authenticated;

-- ── 5. the staff pending list keeps account requests for 30 days ─────

CREATE OR REPLACE FUNCTION public.ninos_preregistros_pendientes()
RETURNS TABLE (id uuid, campus_id uuid, payload jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT r.id, r.campus_id, r.payload, r.created_at
    FROM public.ninos_preregistros r
   WHERE r.estado = 'pendiente'
     AND (r.created_at > now() - interval '7 days'
          OR (r.solicitado_por IS NOT NULL AND r.created_at > now() - interval '30 days'))
     AND EXISTS (SELECT 1 FROM public.ninos_salones s
                  WHERE s.campus_id = r.campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
   ORDER BY r.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistros_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistros_pendientes() TO authenticated;
