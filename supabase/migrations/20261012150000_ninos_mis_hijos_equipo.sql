-- Niños: the staff side of "Mis hijos" (odd/tasks/ninos-mis-hijos.md, task M6).
--
-- M6a — confirming a request made from an account. ninos_mis_hijos_registrar
-- (20261012140000) leaves a likely duplicate child as a pending request with
-- solicitado_por = the parent's account. Confirming it at the table used to
-- send the copied parent data to ninos_registrar_familia, which refused it as
-- padre_existente (the parent exists: it is the account). Now:
--   * the requester is always the parent: the staff payload's padre is
--     replaced by {id: solicitado_por}, so no new adult is ever created;
--   * a child of the request may carry existente_id: the person the team
--     recognised as the same child (same name key and birth date, the rule
--     that made it a likely duplicate). That child is linked to the requester
--     through ninos_vincular_padre instead of being created again;
--   * the other children are created through ninos_registrar_familia
--     (unchanged; redefined by another open branch) and linked to the
--     requester.
--   * ninos_preregistros_cuentas() gives the pending list, for each visible
--     request made from an account, the requester's name and the existing
--     people that match each child (name, birth date, ficha, parents' names;
--     never contact data).
--
-- What (definer functions, empty search path, fully qualified names):
--   1. ninos_preregistro_confirmar_cuenta(uuid, jsonb) → jsonb. Internal: no
--      client may execute it; only ninos_preregistro_resolver calls it.
--   2. ninos_preregistro_resolver(uuid, text, jsonb): same signature, grants
--      and errors as 20261008150000; 'confirmar' on a request with
--      solicitado_por goes through (1). existente_id on a public QR request →
--      datos_invalidos.
--   3. ninos_preregistros_cuentas() → jsonb, for authenticated staff: only the
--      requests ninos_preregistros_pendientes() shows the caller.
--
-- Errors of (1): datos_invalidos (22023) for a malformed payload or
-- existente_id; nino_no_encontrado (22023) when existente_id is not a person
-- with the child's name key and birth date; plus every error of
-- ninos_vincular_padre and ninos_registrar_familia. All or nothing.
--
-- Rollback:
--   re-run ninos_preregistro_resolver from 20261008150000_ninos_preregistro.sql;
--   DROP FUNCTION IF EXISTS public.ninos_preregistros_cuentas();
--   DROP FUNCTION IF EXISTS public.ninos_preregistro_confirmar_cuenta(uuid, jsonb);

-- ── 1. confirm a request made from an account ────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_confirmar_cuenta(p_solicitante uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_hijo      jsonb;
  v_existente uuid;
  v_nac       date;
  v_vincular  uuid[] := '{}';
  v_nuevos    jsonb := '[]'::jsonb;
  v_res       jsonb;
BEGIN
  IF p_solicitante IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_solicitante) THEN
    RAISE EXCEPTION 'padre_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR jsonb_typeof(p -> 'hijos') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p -> 'hijos') = 0 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'non-empty hijos array required';
  END IF;

  FOR v_hijo IN SELECT x FROM jsonb_array_elements(p -> 'hijos') AS t(x) LOOP
    IF jsonb_typeof(v_hijo) <> 'object' THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo';
    END IF;
    IF jsonb_typeof(v_hijo -> 'existente_id') IS NULL OR jsonb_typeof(v_hijo -> 'existente_id') = 'null' THEN
      v_nuevos := v_nuevos || jsonb_build_array(v_hijo - 'existente_id');
      CONTINUE;
    END IF;
    BEGIN
      v_existente := (v_hijo ->> 'existente_id')::uuid;
      v_nac := (v_hijo ->> 'fecha_nacimiento')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: existente_id or fecha_nacimiento';
    END;
    -- Only the person that made this child a likely duplicate: same name key
    -- and birth date as the child under review. Never an arbitrary person.
    IF v_existente IS NULL OR v_existente = p_solicitante
       OR NOT EXISTS (SELECT 1 FROM public.usuarios u
                       WHERE u.id = v_existente AND u.fecha_nacimiento = v_nac
                         AND public.dream_team_clave_nombre(u.nombre, u.apellido)
                           = public.dream_team_clave_nombre(public.ninos_texto(v_hijo, 'nombre'),
                                                            public.ninos_texto(v_hijo, 'apellido'))) THEN
      RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
    END IF;
    IF NOT v_existente = ANY (v_vincular) THEN
      v_vincular := v_vincular || v_existente;
    END IF;
  END LOOP;

  -- Links an existing child (idempotent; staff authority checked inside).
  IF cardinality(v_vincular) > 0 THEN
    PERFORM public.ninos_vincular_padre(v_vincular, p_solicitante, NULL);
  END IF;

  IF jsonb_array_length(v_nuevos) > 0 THEN
    -- The requester is the parent: the copied parent data is never used.
    v_res := public.ninos_registrar_familia(
      (p - 'padre') || jsonb_build_object('padre', jsonb_build_object('id', p_solicitante), 'hijos', v_nuevos));
  ELSE
    v_res := jsonb_build_object('padre_id', p_solicitante, 'padre_nuevo', false, 'hijos', '[]'::jsonb,
                                'conyuge_id', NULL);
  END IF;
  RETURN v_res || jsonb_build_object('vinculados', to_jsonb(v_vincular));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_confirmar_cuenta(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 2. the resolver routes account requests through (1) ──────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_resolver(p_id uuid, p_accion text, p_payload jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_row    public.ninos_preregistros%ROWTYPE;
  v_res    jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.ninos_preregistros r WHERE r.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.ninos_salones s
                               WHERE s.campus_id = v_row.campus_id AND s.activo
                                 AND public.ninos_puede_operar(s.equipo_id)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_row.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'preregistro_resuelto' USING ERRCODE = '22023';
  END IF;
  IF p_accion = 'descartar' THEN
    UPDATE public.ninos_preregistros
       SET estado = 'descartado', confirmado_por = v_actor, confirmado_at = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('estado', 'descartado');
  ELSIF p_accion = 'confirmar' THEN
    IF v_row.solicitado_por IS NOT NULL THEN
      v_res := public.ninos_preregistro_confirmar_cuenta(v_row.solicitado_por, p_payload);
    ELSE
      IF jsonb_typeof(p_payload -> 'hijos') = 'array'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload -> 'hijos') h(x)
                      WHERE jsonb_typeof(h.x) = 'object' AND h.x ? 'existente_id') THEN
        RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'existente_id only for account requests';
      END IF;
      v_res := public.ninos_registrar_familia(p_payload);
    END IF;
    UPDATE public.ninos_preregistros
       SET estado = 'confirmado', confirmado_por = v_actor, confirmado_at = now(),
           familia_padre_id = (v_res ->> 'padre_id')::uuid, payload = p_payload
     WHERE id = p_id;
    RETURN v_res || jsonb_build_object('estado', 'confirmado');
  END IF;
  RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'accion: confirmar | descartar';
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_resolver(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_resolver(uuid, text, jsonb) TO authenticated;

-- ── 3. requester and likely duplicates for the pending list ──────────

CREATE OR REPLACE FUNCTION public.ninos_preregistros_cuentas()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'solicitante', jsonb_build_object('id', s.id, 'nombre', s.nombre, 'apellido', s.apellido),
           'coincidencias', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'indice', e.n - 1, 'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
                      'fecha_nacimiento', c.fecha_nacimiento::date,
                      'tiene_ficha', EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = c.id),
                      'padres', (SELECT coalesce(jsonb_agg(pa.nombre || ' ' || pa.apellido ORDER BY pa.apellido, pa.nombre),
                                                 '[]'::jsonb)
                                   FROM public.usuarios pa
                                  WHERE pa.id IN (SELECT rel.usuario2_id FROM public.relaciones_usuarios rel
                                                   WHERE rel.usuario1_id = c.id AND rel.tipo_relacion IN ('padre', 'tutor')
                                                  UNION
                                                  SELECT rel.usuario1_id FROM public.relaciones_usuarios rel
                                                   WHERE rel.usuario2_id = c.id AND rel.tipo_relacion = 'hijo')))
                      ORDER BY e.n, c.apellido, c.nombre), '[]'::jsonb)
               FROM jsonb_array_elements(r.payload -> 'hijos') WITH ORDINALITY e(h, n)
               JOIN public.usuarios c
                 ON c.fecha_nacimiento = CASE WHEN (e.h ->> 'fecha_nacimiento') ~ '^\d{4}-\d{2}-\d{2}$'
                                              THEN (e.h ->> 'fecha_nacimiento')::date END
                AND c.id <> s.id
                AND public.dream_team_clave_nombre(c.nombre, c.apellido)
                  = public.dream_team_clave_nombre(e.h ->> 'nombre', e.h ->> 'apellido')
              WHERE jsonb_typeof(r.payload -> 'hijos') = 'array'))
           ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM public.ninos_preregistros r
    JOIN public.usuarios s ON s.id = r.solicitado_por
   WHERE r.id IN (SELECT p.id FROM public.ninos_preregistros_pendientes() p);
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistros_cuentas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistros_cuentas() TO authenticated;
