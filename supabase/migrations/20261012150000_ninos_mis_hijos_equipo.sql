-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: the staff side of "Mis hijos" (odd/tasks/ninos-mis-hijos.md, task M6)
-- and the minor-account rule of G8 (odd/tasks/ninos-cobertura.md). Sections:
-- M6a (1–3) requests from an account, M6b (4–6) "Registrado desde casa",
-- M6c (7) pickup-change email recipients, G8 (8–11) no Mis hijos for minors.
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

-- ── M6b. "Registrado desde casa" until the first check-in (D1) ───────
--
-- A child registered from home (ninos_fichas.desde_casa_at) carries a badge
-- in the staff family and check-in views until the first check-in, so the
-- anfitrión confirms the room and the data once. The first check-in stamps
-- desde_casa_confirmado_at; desde_casa_at/por stay as history (they also
-- feed the per-account daily cap of ninos_mis_hijos_registrar). VIP / first
-- visit is unchanged: set at the table as today (adopted default).
--   4. ninos_fichas.desde_casa_confirmado_at.
--   5. Trigger ninos_checkins_desde_casa (AFTER INSERT on ninos_checkins):
--      stamps the child's ficha. Its function is not executable by clients.
--   6. ninos_familia_hijos(uuid): same body as 20261008152000 plus
--      'desde_casa' (registered from home and never checked in). Internal, as
--      before.
--
-- Rollback (M6b): re-run ninos_familia_hijos from 20261008152000_ninos_rango_edad.sql;
--   DROP TRIGGER IF EXISTS ninos_checkins_desde_casa ON public.ninos_checkins;
--   DROP FUNCTION IF EXISTS public.ninos_checkins_confirmar_desde_casa();
--   and remove the column ninos_fichas.desde_casa_confirmado_at.

ALTER TABLE public.ninos_fichas ADD COLUMN IF NOT EXISTS desde_casa_confirmado_at timestamptz;

CREATE OR REPLACE FUNCTION public.ninos_checkins_confirmar_desde_casa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.ninos_fichas f
     SET desde_casa_confirmado_at = now()
   WHERE f.usuario_id = NEW.nino_id AND f.desde_casa_at IS NOT NULL AND f.desde_casa_confirmado_at IS NULL;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkins_confirmar_desde_casa() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER ninos_checkins_desde_casa
  AFTER INSERT ON public.ninos_checkins
  FOR EACH ROW EXECUTE FUNCTION public.ninos_checkins_confirmar_desde_casa();

CREATE OR REPLACE FUNCTION public.ninos_familia_hijos(p_padre_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
           'fecha_nacimiento', u.fecha_nacimiento::date, 'genero', u.genero,
           'tiene_ficha', f.usuario_id IS NOT NULL,
           'grado', f.grado, 'alergias', f.alergias, 'necesidades_especiales', f.necesidades_especiales,
           'habitos', f.habitos, 'notas', f.notas, 'puede_comer', f.puede_comer,
           'cambio_panal', f.cambio_panal, 'autoriza_imagen', f.autoriza_imagen,
           'escolarizado', f.escolarizado, 'salon_preferido_id', f.salon_preferido_id,
           'es_vip_desde', f.es_vip_desde,
           'desde_casa', coalesce(f.desde_casa_at IS NOT NULL AND f.desde_casa_confirmado_at IS NULL, false),
           'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'id', a.id, 'nombre', a.nombre, 'telefono', a.telefono, 'relacion', a.relacion)
                              ORDER BY a.created_at), '[]'::jsonb)
                             FROM public.ninos_autorizados_retiro a WHERE a.nino_id = u.id AND a.activo))
           ORDER BY u.fecha_nacimiento, u.nombre), '[]'::jsonb)
  FROM public.usuarios u
  LEFT JOIN public.ninos_fichas f ON f.usuario_id = u.id
  WHERE u.id IN (
    SELECT r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor')
    UNION
    SELECT r.usuario2_id FROM public.relaciones_usuarios r
     WHERE r.usuario1_id = p_padre_id AND r.tipo_relacion = 'hijo'
  )
  AND (f.usuario_id IS NOT NULL OR public.ninos_en_rango_edad(u.fecha_nacimiento::date));
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_hijos(uuid) FROM PUBLIC, anon, authenticated;

-- ── M6c. Pickup-change email to the other parents (D2) ───────────────
--
-- When a parent changes the authorized pickup list from Mis hijos, the other
-- linked parents get an email. The route handler saves through
-- ninos_mis_hijos_guardar as the user and, after the response, reads the
-- recipients here with the service role: the parent's client never receives
-- another parent's email address.
--   7. ninos_aviso_autorizados(p_nino_id uuid, p_auth_id uuid) → jsonb, for
--      service_role only. The latest pickup-list change ('autorizados' in
--      ninos_fichas_cambios, origen 'padre') made on that child by the account
--      p_auth_id in the last 10 minutes, or NULL. Returns {cambio_id,
--      nino_nombre, actor_nombre, autorizados: [{nombre, relacion}],
--      destinatarios: [{id, nombre, email}]} — every other parent or tutor
--      linked to the child (both link directions) with an email.
--      p_auth_id is not compared with auth.uid(): only the service role can
--      execute it, and the route passes the session user's id it verified.
--
-- Rollback (M6c): DROP FUNCTION IF EXISTS public.ninos_aviso_autorizados(uuid, uuid);

CREATE OR REPLACE FUNCTION public.ninos_aviso_autorizados(p_nino_id uuid, p_auth_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'cambio_id', c.id,
           'nino_nombre', n.nombre,
           'actor_nombre', trim(a.nombre || ' ' || coalesce(a.apellido, '')),
           'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', x.v ->> 'nombre', 'relacion', x.v ->> 'relacion')
                                                     ORDER BY x.n), '[]'::jsonb)
                             FROM jsonb_array_elements(coalesce(c.autorizados_despues, '[]'::jsonb)) WITH ORDINALITY x(v, n)),
           'destinatarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email)
                                                       ORDER BY p.apellido, p.nombre), '[]'::jsonb)
                               FROM public.usuarios p
                              WHERE p.id <> a.id AND p.email IS NOT NULL AND btrim(p.email) <> ''
                                AND p.id IN (SELECT r.usuario2_id FROM public.relaciones_usuarios r
                                              WHERE r.usuario1_id = n.id AND r.tipo_relacion IN ('padre', 'tutor')
                                             UNION
                                             SELECT r.usuario1_id FROM public.relaciones_usuarios r
                                              WHERE r.usuario2_id = n.id AND r.tipo_relacion = 'hijo')))
    FROM public.ninos_fichas_cambios c
    JOIN public.usuarios a ON a.id = c.actor_id
    JOIN public.usuarios n ON n.id = c.nino_id
   WHERE c.nino_id = p_nino_id AND a.auth_id = p_auth_id AND c.origen = 'padre'
     AND 'autorizados' = ANY (c.campos) AND c.created_at > now() - interval '10 minutes'
   ORDER BY c.created_at DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ninos_aviso_autorizados(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_aviso_autorizados(uuid, uuid) TO service_role;

-- ── G8 (part). No Mis hijos for an account of a minor ────────────────
--
-- Adopted default (odd/tasks/ninos-cobertura.md, G8): an adult whose birth
-- date says under 18 does not get Mis hijos (a teen wrongly linked as a parent
-- must not see or edit a child's ficha, nor register children). An unknown
-- birth date counts as adult. Staff functions are unchanged.
--   8. ninos_es_mayor_de_edad(uuid) → boolean. Internal: no client may execute it.
--   9. ninos_es_mi_hijo(uuid): same as 20261010140000 plus the adult check
--      (so ninos_mis_hijos_guardar refuses a minor: nino_no_encontrado).
--  10. ninos_mis_hijos(): '[]' for a minor; otherwise as 20261010140000.
--  11. ninos_mis_hijos_campus() and ninos_mis_hijos_registrar(jsonb): same as
--      20261012140000; a minor gets sin_autoridad (42501).
--
-- Rollback (G8 part): re-run the four functions from 20261010140000 and
--   20261012140000, then DROP FUNCTION IF EXISTS public.ninos_es_mayor_de_edad(uuid);

CREATE OR REPLACE FUNCTION public.ninos_es_mayor_de_edad(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.usuarios u
                      WHERE u.id = p_usuario_id AND u.fecha_nacimiento IS NOT NULL
                        AND u.fecha_nacimiento::date > (public.ninos_hoy() - interval '18 years')::date);
$$;
REVOKE ALL ON FUNCTION public.ninos_es_mayor_de_edad(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_es_mi_hijo(p_nino_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_nino_id IS NOT NULL
     AND public.ninos_usuario_actual() IS NOT NULL
     AND public.ninos_es_mayor_de_edad(public.ninos_usuario_actual())
     AND EXISTS (SELECT 1
                   FROM jsonb_array_elements(public.ninos_familia_hijos(public.ninos_usuario_actual())) e(h)
                  WHERE (e.h ->> 'id')::uuid = p_nino_id);
$$;
REVOKE ALL ON FUNCTION public.ninos_es_mi_hijo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos()
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
  -- An account whose birth date says under 18 has no Mis hijos (G8).
  IF NOT public.ninos_es_mayor_de_edad(v_yo) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
             'fecha_nacimiento', u.fecha_nacimiento, 'genero', u.genero,
             'edad', extract(year FROM age(public.ninos_hoy()::timestamp, u.fecha_nacimiento::timestamp))::integer,
             'tiene_ficha', f.usuario_id IS NOT NULL,
             'grado', f.grado, 'alergias', f.alergias, 'necesidades_especiales', f.necesidades_especiales,
             'habitos', f.habitos, 'notas', f.notas, 'puede_comer', f.puede_comer,
             'cambio_panal', f.cambio_panal, 'autoriza_imagen', f.autoriza_imagen,
             'escolarizado', f.escolarizado,
             'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'id', a.id, 'nombre', a.nombre, 'telefono', a.telefono, 'relacion', a.relacion)
                                ORDER BY a.created_at, a.nombre), '[]'::jsonb)
                               FROM public.ninos_autorizados_retiro a WHERE a.nino_id = u.id AND a.activo),
             'otros_padres', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', pa.nombre, 'apellido', pa.apellido)
                                 ORDER BY pa.apellido, pa.nombre), '[]'::jsonb)
                                FROM public.usuarios pa
                               WHERE pa.id <> v_yo
                                 AND pa.id IN (SELECT r.usuario2_id FROM public.relaciones_usuarios r
                                                WHERE r.usuario1_id = u.id AND r.tipo_relacion IN ('padre', 'tutor')
                                               UNION
                                               SELECT r.usuario1_id FROM public.relaciones_usuarios r
                                                WHERE r.usuario2_id = u.id AND r.tipo_relacion = 'hijo')),
             'puede_editar_identidad', u.auth_id IS NULL)
             ORDER BY u.fecha_nacimiento, u.nombre), '[]'::jsonb)
    FROM public.usuarios u
    LEFT JOIN public.ninos_fichas f ON f.usuario_id = u.id
    WHERE u.id IN (SELECT (e.h ->> 'id')::uuid FROM jsonb_array_elements(public.ninos_familia_hijos(v_yo)) e(h))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_hijos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_hijos() TO authenticated;

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos_campus()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo uuid := public.ninos_usuario_actual();
BEGIN
  -- An account whose birth date says under 18 has no Mis hijos (G8).
  IF v_yo IS NULL OR NOT public.ninos_es_mayor_de_edad(v_yo) THEN
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
  -- An account whose birth date says under 18 has no Mis hijos (G8).
  IF v_yo IS NULL OR NOT public.ninos_es_mayor_de_edad(v_yo) THEN
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
