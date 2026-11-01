-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Mi familia in Mi perfil (odd/tasks/sistema-diseno-v2.md, S15, task T11a).
--
-- What: every person adds their relatives from Mi perfil. A link to a person
-- with an account stays pending until that person confirms it (or a lider /
-- pastor who can edit both people approves it). A relative without an account
-- is a request with the typed data; the campus approves it and only then the
-- ficha is created. Search is masked and campus-only; homonyms need a datum
-- only a relative knows (birth day + month, or the last 4 cédula digits).
--
--   1. Table solicitudes_relacion_familiar (+ open-pair unique indexes) and two
--      internal tables, familia_intentos (rate limits) and familia_candidatos
--      (the opaque tokens a search hands out). RLS on, no policies, no grants
--      for anon or authenticated: only the definer RPCs below touch them.
--   2. usuarios.creado_por: the person whose request created a ficha without
--      an account. puede_editar_usuario gains one branch: the creator edits
--      that ficha while it has no account (auth_id IS NULL). Every other branch
--      of 20261031100000_campus_pastor_global.sql is copied byte for byte.
--   3. Internal helpers (not executable by anon or authenticated).
--   4. RPCs for authenticated (actor always auth.uid(); each returns jsonb
--      {ok, codigo, ...}; a missing row and a forbidden one both answer
--      NO_ENCONTRADO): familia_buscar, familia_verificar, familia_solicitar,
--      familia_solicitar_sin_cuenta, familia_mis_solicitudes,
--      familia_responder, familia_cancelar, familia_quitar, familia_resolver,
--      familia_pendientes_listar.
--
-- Tipo (enum_tipo_relacion, same domain as relaciones_usuarios). A request
-- reads from the solicitante's side: tipo = what the destino is to the
-- solicitante ("padre" = the destino is my father or mother). relaciones_usuarios
-- reads "usuario2 is <tipo> of usuario1", one row per pair. On confirmation:
--   hijo                        -> (usuario1 = destino, usuario2 = solicitante,
--                                   'padre'), the Niños convention
--                                   (ninos_mis_hijos_registrar writes child ->
--                                   parent 'padre').
--   any other tipo              -> (usuario1 = solicitante, usuario2 = destino,
--                                   tipo).
-- Shown to the other side (familia_tipo_inverso, as in the approved prototype):
-- padre <-> hijo; conyuge, hermano and otro_familiar map to themselves;
-- abuelo, tio and tutor map to otro_familiar (there is no nieto / sobrino).
-- Requests accept conyuge, padre, hijo, hermano, abuelo, tio and otro_familiar
-- (tutor stays for Niños).
--
-- Limits: 40 searches, 5 verification attempts and 20 requests per person in
-- 24 hours; search tokens last 2 hours. Notifying the other person (S15 #9)
-- is left to the app; this file stores no notification.
--
-- Rollback (nothing else depends on these objects yet):
--   re-apply section 3 (puede_editar_usuario) of
--   20261031100000_campus_pastor_global.sql, then drop the ten familia_* RPCs,
--   the helpers familia_tipo_inverso, familia_etiqueta,
--   familia_puede_resolver and familia_crear_relacion, the tables
--   familia_candidatos, familia_intentos and solicitudes_relacion_familiar,
--   and finally the column usuarios.creado_por.

-- 1. Tables ------------------------------------------------------------------
CREATE TABLE public.solicitudes_relacion_familiar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  -- NULL while the relative has no ficha yet (datos_sin_cuenta holds the data).
  destino_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,
  -- Only nombre, apellido, fecha_nacimiento, cedula, telefono, genero and the
  -- server-made clave; never medical data.
  datos_sin_cuenta jsonb,
  tipo_relacion public.enum_tipo_relacion NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmada', 'rechazada', 'cancelada')),
  resuelto_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,
  CHECK (destino_id IS NOT NULL OR datos_sin_cuenta IS NOT NULL),
  CHECK (destino_id IS DISTINCT FROM solicitante_id),
  CHECK ((estado = 'pendiente') = (resuelto_en IS NULL))
);

COMMENT ON TABLE public.solicitudes_relacion_familiar IS
  'Mi familia: pending family links. tipo_relacion is what the destino is to the solicitante. Read and written only through the familia_* RPCs.';

-- One open request per pair of people, in either direction.
CREATE UNIQUE INDEX solicitudes_relacion_familiar_par_abierto_uq
  ON public.solicitudes_relacion_familiar
     (LEAST(solicitante_id, destino_id), GREATEST(solicitante_id, destino_id))
  WHERE estado = 'pendiente' AND destino_id IS NOT NULL;

-- One open request per solicitante and relative without a ficha.
CREATE UNIQUE INDEX solicitudes_relacion_familiar_sin_cuenta_abierto_uq
  ON public.solicitudes_relacion_familiar (solicitante_id, (datos_sin_cuenta ->> 'clave'))
  WHERE estado = 'pendiente' AND destino_id IS NULL;

CREATE INDEX solicitudes_relacion_familiar_destino_idx
  ON public.solicitudes_relacion_familiar (destino_id) WHERE estado = 'pendiente';
CREATE INDEX solicitudes_relacion_familiar_solicitante_idx
  ON public.solicitudes_relacion_familiar (solicitante_id, creado_en);

ALTER TABLE public.solicitudes_relacion_familiar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.solicitudes_relacion_familiar FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.solicitudes_relacion_familiar TO service_role;

-- Searches and verification attempts, for the daily limits.
CREATE TABLE public.familia_intentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('buscar', 'verificar')),
  exito boolean,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX familia_intentos_usuario_idx ON public.familia_intentos (usuario_id, tipo, creado_en);

ALTER TABLE public.familia_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.familia_intentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.familia_intentos TO service_role;

-- The opaque token of each search result: the caller never holds a usuarios
-- id, and familia_solicitar only reaches people a search returned.
CREATE TABLE public.familia_candidatos (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  candidato_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  homonimo boolean NOT NULL,
  verificado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX familia_candidatos_usuario_idx ON public.familia_candidatos (usuario_id, creado_en);

ALTER TABLE public.familia_candidatos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.familia_candidatos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.familia_candidatos TO service_role;

-- 2. Creator of a ficha without account ---------------------------------------
-- authenticated holds UPDATE only on telefono, foto_perfil_url, ocupacion_id
-- and profesion_id (20261004120000), so nobody rewrites this column from the
-- client; familia_resolver writes it.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.usuarios.creado_por IS
  'Mi familia: the person whose request created this ficha. While auth_id IS NULL that person may edit it (puede_editar_usuario).';

CREATE INDEX IF NOT EXISTS usuarios_creado_por_idx
  ON public.usuarios (creado_por) WHERE creado_por IS NOT NULL;

-- 3. Who may edit a person: section 3 of 20261031100000_campus_pastor_global.sql plus the creator branch ------
CREATE OR REPLACE FUNCTION public.puede_editar_usuario(p_auth_id uuid, p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  IF p_auth_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_actor_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Autoedición
  IF v_actor_id = p_target_user_id THEN
    RETURN TRUE;
  END IF;

  -- El usuario objetivo debe existir
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_target_user_id) THEN
    RETURN FALSE;
  END IF;

  -- Regla global: Admin (todos los campus)
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Pastor edita a las personas que comparten uno de sus campus
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'pastor'
  ) AND EXISTS (
    SELECT 1
    FROM public.usuario_campus mi_uc
    JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
    WHERE mi_uc.usuario_id = v_actor_id
      AND su_uc.usuario_id = p_target_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Líder puede editar usuarios activos del mismo grupo
  IF EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_actor
    JOIN public.grupo_miembros gm_objetivo
      ON gm_objetivo.grupo_id = gm_actor.grupo_id
    JOIN public.grupos g
      ON g.id = gm_actor.grupo_id
    WHERE gm_actor.usuario_id = v_actor_id
      AND gm_actor.rol = 'Líder'
      AND gm_actor.estado = 'activo'
      AND gm_actor.fecha_salida IS NULL
      AND gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director de etapa puede editar usuarios activos en sus grupos asignados
  IF EXISTS (
    SELECT 1
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl
      ON sl.id = deg.director_etapa_id
    JOIN public.grupo_miembros gm_objetivo
      ON gm_objetivo.grupo_id = deg.grupo_id
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE sl.usuario_id = v_actor_id
      AND sl.tipo_lider = 'director_etapa'
      AND gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director general (scoped). Llama a gdv_dg_ve_grupo directamente:
  -- es_director_general_de_grupo devuelve TRUE para cualquier pastor sobre
  -- cualquier grupo (es_superadmin), lo que saltaba la regla de campus.
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'director-general'
  ) AND EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_objetivo
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
      AND public.gdv_dg_ve_grupo(v_actor_id, gm_objetivo.grupo_id)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: quien pidió crear una ficha sin cuenta (Mi familia) la edita
  -- mientras siga sin cuenta
  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_target_user_id
      AND u.creado_por = v_actor_id
      AND u.auth_id IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated, service_role;

-- 3. Internal helpers (owner only; the RPCs call them) --------------------------

-- What the other person of a link is to me, seen from the other side.
CREATE OR REPLACE FUNCTION public.familia_tipo_inverso(p_tipo public.enum_tipo_relacion)
RETURNS public.enum_tipo_relacion
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p_tipo
           WHEN 'padre' THEN 'hijo'
           WHEN 'hijo' THEN 'padre'
           WHEN 'conyuge' THEN 'conyuge'
           WHEN 'hermano' THEN 'hermano'
           ELSE 'otro_familiar'
         END::public.enum_tipo_relacion;
$$;

-- The masked label a search shows, normalized: first name(s), first surname
-- and the initial of the second surname. Two people with the same label look
-- the same on screen, so they are homonyms.
CREATE OR REPLACE FUNCTION public.familia_etiqueta(p_nombre text, p_apellido text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT public.dream_team_clave_nombre(
    p_nombre,
    concat_ws(' ',
      (regexp_split_to_array(btrim(coalesce(p_apellido, '')), '\s+'))[1],
      left((regexp_split_to_array(btrim(coalesce(p_apellido, '')), '\s+'))[2], 1)));
$$;

-- May the person in the session approve or reject this request? They must be
-- able to edit the solicitante and the destino (when there is one) and be
-- neither of the two.
CREATE OR REPLACE FUNCTION public.familia_puede_resolver(p_solicitud uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_req public.solicitudes_relacion_familiar%ROWTYPE;
BEGIN
  IF v_auth IS NULL OR p_solicitud IS NULL THEN
    RETURN false;
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;
  SELECT * INTO v_req FROM public.solicitudes_relacion_familiar WHERE id = p_solicitud;
  IF v_yo IS NULL OR v_req.id IS NULL THEN
    RETURN false;
  END IF;
  IF v_yo = v_req.solicitante_id OR v_yo IS NOT DISTINCT FROM v_req.destino_id THEN
    RETURN false;
  END IF;
  RETURN public.puede_editar_usuario(v_auth, v_req.solicitante_id)
     AND (v_req.destino_id IS NULL OR public.puede_editar_usuario(v_auth, v_req.destino_id));
END;
$function$;

-- Writes the relaciones_usuarios row of a confirmed request (see the tipo
-- mapping in the header). Returns {ok, codigo, relacion_id}.
CREATE OR REPLACE FUNCTION public.familia_crear_relacion(
  p_solicitante uuid,
  p_destino uuid,
  p_tipo public.enum_tipo_relacion
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.relaciones_usuarios ru
              WHERE LEAST(ru.usuario1_id, ru.usuario2_id) = LEAST(p_solicitante, p_destino)
                AND GREATEST(ru.usuario1_id, ru.usuario2_id) = GREATEST(p_solicitante, p_destino)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RELACIONADOS');
  END IF;

  -- One spouse per person (obtener_conyugue and Talleres read a single one).
  IF p_tipo = 'conyuge' AND EXISTS (
    SELECT 1 FROM public.relaciones_usuarios ru
     WHERE ru.tipo_relacion = 'conyuge'
       AND (ru.usuario1_id IN (p_solicitante, p_destino) OR ru.usuario2_id IN (p_solicitante, p_destino))) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_TIENE_CONYUGE');
  END IF;

  IF p_tipo = 'hijo' THEN
    INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
    VALUES (p_destino, p_solicitante, 'padre', false)
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
    VALUES (p_solicitante, p_destino, p_tipo, false)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'codigo', 'CONFIRMADA', 'relacion_id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.familia_tipo_inverso(public.enum_tipo_relacion) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.familia_etiqueta(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.familia_puede_resolver(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.familia_crear_relacion(uuid, uuid, public.enum_tipo_relacion) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_tipo_inverso(public.enum_tipo_relacion) TO service_role;
GRANT EXECUTE ON FUNCTION public.familia_etiqueta(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.familia_puede_resolver(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familia_crear_relacion(uuid, uuid, public.enum_tipo_relacion) TO service_role;

-- 4. RPCs --------------------------------------------------------------------

-- familia_buscar(q): people with an account in the caller's main campus whose
-- name contains every word of q as a word prefix. At least 3 letters, at most
-- 8 results, masked: an opaque token, first name(s), first surname, initial
-- of the second surname, campus and homonimo (another searchable person of
-- the campus shows the same label). Never photo, phone, email, cédula or age.
-- Leaves out the caller, children under 13 (they live in Niños), people
-- already related to the caller and people with an open request with them.
-- Codes: SIN_SESION, SIN_FICHA, BUSQUEDA_CORTA, SIN_CAMPUS, LIMITE_BUSQUEDAS.
CREATE OR REPLACE FUNCTION public.familia_buscar(p_q text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_campus uuid;
  v_campus_nombre text;
  v_palabras text[];
  v_res jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;
  IF v_yo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_FICHA');
  END IF;

  v_palabras := regexp_split_to_array(public.dream_team_clave_nombre(left(coalesce(p_q, ''), 100), ''), ' ');
  IF length(regexp_replace(left(coalesce(p_q, ''), 100), '[^[:alpha:]]', '', 'g')) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'BUSQUEDA_CORTA');
  END IF;

  SELECT uc.campus_id, c.nombre INTO v_campus, v_campus_nombre
    FROM public.usuario_campus uc
    JOIN public.campus c ON c.id = uc.campus_id
   WHERE uc.usuario_id = v_yo AND uc.es_campus_principal
   LIMIT 1;
  IF v_campus IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_CAMPUS');
  END IF;

  IF (SELECT count(*) FROM public.familia_intentos i
       WHERE i.usuario_id = v_yo AND i.tipo = 'buscar'
         AND i.creado_en > now() - interval '24 hours') >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_BUSQUEDAS');
  END IF;
  INSERT INTO public.familia_intentos (usuario_id, tipo) VALUES (v_yo, 'buscar');

  WITH poblacion AS (
    SELECT u.id, u.nombre, u.apellido,
           public.familia_etiqueta(u.nombre, u.apellido) AS etiqueta,
           ' ' || public.dream_team_clave_nombre(u.nombre, u.apellido) AS clave
      FROM public.usuarios u
     WHERE u.auth_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.usuario_campus uc
                    WHERE uc.usuario_id = u.id AND uc.campus_id = v_campus)
       AND NOT public.ninos_en_rango_edad(u.fecha_nacimiento::date)
  ),
  conteo AS (
    SELECT etiqueta, count(*) AS n FROM poblacion GROUP BY etiqueta
  ),
  coincidencias AS (
    SELECT p.id, p.nombre, p.apellido, p.etiqueta, c.n > 1 AS homonimo
      FROM poblacion p
      JOIN conteo c ON c.etiqueta = p.etiqueta
     WHERE p.id <> v_yo
       AND (SELECT bool_and(p.clave LIKE ('% ' || w || '%')) FROM unnest(v_palabras) w WHERE w <> '')
       AND NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios ru
                        WHERE (ru.usuario1_id = v_yo AND ru.usuario2_id = p.id)
                           OR (ru.usuario1_id = p.id AND ru.usuario2_id = v_yo))
       AND NOT EXISTS (SELECT 1 FROM public.solicitudes_relacion_familiar s
                        WHERE s.estado = 'pendiente'
                          AND ((s.solicitante_id = v_yo AND s.destino_id = p.id)
                            OR (s.solicitante_id = p.id AND s.destino_id = v_yo)))
     ORDER BY p.etiqueta, p.id
     LIMIT 8
  ),
  nuevos AS (
    INSERT INTO public.familia_candidatos (usuario_id, candidato_id, homonimo)
    SELECT v_yo, c.id, c.homonimo FROM coincidencias c
    RETURNING token, candidato_id, homonimo
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'token', n.token,
           'nombres', btrim(c.nombre),
           'primer_apellido', (regexp_split_to_array(btrim(c.apellido), '\s+'))[1],
           'inicial_segundo_apellido', upper(left((regexp_split_to_array(btrim(c.apellido), '\s+'))[2], 1)),
           'campus', v_campus_nombre,
           'homonimo', n.homonimo)
         ORDER BY c.etiqueta, c.id), '[]'::jsonb)
    INTO v_res
    FROM nuevos n
    JOIN coincidencias c ON c.id = n.candidato_id;

  RETURN jsonb_build_object('ok', true, 'resultados', v_res);
END;
$function$;

-- familia_verificar(candidato, dia, mes | ultimos4): does the datum match the
-- person behind the token? Answers only {ok: true, coincide: boolean}; a match
-- marks the token as verified for familia_solicitar. 5 attempts per person in
-- 24 hours. Codes: SIN_SESION, SIN_FICHA, PARAMETROS_INVALIDOS, NO_ENCONTRADO
-- (unknown, expired or somebody else's token), LIMITE_INTENTOS.
CREATE OR REPLACE FUNCTION public.familia_verificar(
  p_candidato uuid,
  p_dia integer DEFAULT NULL,
  p_mes integer DEFAULT NULL,
  p_ultimos4 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_cand public.familia_candidatos%ROWTYPE;
  v_nac date;
  v_cedula text;
  v_coincide boolean;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;
  IF v_yo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_FICHA');
  END IF;

  -- coalesce: a NULL day or month must refuse, not slip through as unknown.
  IF NOT coalesce((p_dia BETWEEN 1 AND 31 AND p_mes BETWEEN 1 AND 12 AND p_ultimos4 IS NULL)
                  OR (p_dia IS NULL AND p_mes IS NULL AND coalesce(p_ultimos4, '') ~ '^[0-9]{4}$'), false) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PARAMETROS_INVALIDOS');
  END IF;

  SELECT * INTO v_cand FROM public.familia_candidatos
   WHERE token = p_candidato AND usuario_id = v_yo
     AND creado_en > now() - interval '2 hours';
  IF v_cand.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;

  IF (SELECT count(*) FROM public.familia_intentos i
       WHERE i.usuario_id = v_yo AND i.tipo = 'verificar'
         AND i.creado_en > now() - interval '24 hours') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_INTENTOS');
  END IF;

  SELECT u.fecha_nacimiento::date, regexp_replace(coalesce(u.cedula, ''), '[^0-9]', '', 'g')
    INTO v_nac, v_cedula
    FROM public.usuarios u WHERE u.id = v_cand.candidato_id;

  IF p_ultimos4 IS NOT NULL THEN
    v_coincide := length(v_cedula) >= 4 AND right(v_cedula, 4) = p_ultimos4;
  ELSE
    v_coincide := v_nac IS NOT NULL
                  AND extract(day FROM v_nac) = p_dia
                  AND extract(month FROM v_nac) = p_mes;
  END IF;
  v_coincide := coalesce(v_coincide, false);

  INSERT INTO public.familia_intentos (usuario_id, tipo, exito) VALUES (v_yo, 'verificar', v_coincide);
  IF v_coincide THEN
    UPDATE public.familia_candidatos SET verificado_en = now() WHERE token = v_cand.token;
  END IF;

  RETURN jsonb_build_object('ok', true, 'coincide', v_coincide);
END;
$function$;

-- familia_solicitar(candidato, tipo): a pending link to the person behind a
-- search token. tipo is what that person is to me. A homonym needs a
-- successful familia_verificar on the same token first. 20 requests per
-- person in 24 hours. Codes: SIN_SESION, SIN_FICHA, TIPO_INVALIDO,
-- NO_ENCONTRADO, VERIFICACION_REQUERIDA, LIMITE_DIARIO, YA_RELACIONADOS,
-- YA_SOLICITADO, YA_TIENE_CONYUGE; ok: ENVIADA with the request id.
CREATE OR REPLACE FUNCTION public.familia_solicitar(p_candidato uuid, p_tipo public.enum_tipo_relacion)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_cand public.familia_candidatos%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;
  IF v_yo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_FICHA');
  END IF;
  IF p_tipo IS NULL OR p_tipo = 'tutor' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'TIPO_INVALIDO');
  END IF;

  SELECT * INTO v_cand FROM public.familia_candidatos
   WHERE token = p_candidato AND usuario_id = v_yo
     AND creado_en > now() - interval '2 hours';
  IF v_cand.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;
  IF v_cand.homonimo AND v_cand.verificado_en IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'VERIFICACION_REQUERIDA');
  END IF;

  IF (SELECT count(*) FROM public.solicitudes_relacion_familiar s
       WHERE s.solicitante_id = v_yo AND s.creado_en > now() - interval '24 hours') >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_DIARIO');
  END IF;

  IF EXISTS (SELECT 1 FROM public.relaciones_usuarios ru
              WHERE (ru.usuario1_id = v_yo AND ru.usuario2_id = v_cand.candidato_id)
                 OR (ru.usuario1_id = v_cand.candidato_id AND ru.usuario2_id = v_yo)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RELACIONADOS');
  END IF;
  IF p_tipo = 'conyuge' AND EXISTS (SELECT 1 FROM public.relaciones_usuarios ru
                                     WHERE ru.tipo_relacion = 'conyuge'
                                       AND v_yo IN (ru.usuario1_id, ru.usuario2_id)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_TIENE_CONYUGE');
  END IF;

  BEGIN
    INSERT INTO public.solicitudes_relacion_familiar (solicitante_id, destino_id, tipo_relacion)
    VALUES (v_yo, v_cand.candidato_id, p_tipo)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_SOLICITADO');
  END;

  RETURN jsonb_build_object('ok', true, 'codigo', 'ENVIADA', 'id', v_id);
END;
$function$;

-- familia_solicitar_sin_cuenta(datos, tipo): a relative without an account.
-- datos keys: nombre, apellido, fecha_nacimiento (required), cedula,
-- telefono, genero ('Masculino' | 'Femenino'); any other key is refused, so
-- no medical data gets in. Under 13 goes to Mis hijos (Niños). Before
-- anything is created it looks for the person: same cédula, or the same full
-- name and birth date (exactly one ficha). When found, the request points at
-- that ficha; the answer is the same either way and never shows the ficha.
-- The campus approves with familia_resolver. Codes: SIN_SESION, SIN_FICHA,
-- TIPO_INVALIDO, CAMPO_NO_PERMITIDO, DATOS_INVALIDOS, USAR_MIS_HIJOS,
-- SIN_CAMPUS, LIMITE_DIARIO, YA_RELACIONADOS, YA_SOLICITADO,
-- YA_TIENE_CONYUGE; ok: ENVIADA with the request id.
CREATE OR REPLACE FUNCTION public.familia_solicitar_sin_cuenta(p_datos jsonb, p_tipo public.enum_tipo_relacion)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_nombre text;
  v_apellido text;
  v_nac date;
  v_cedula text;
  v_telefono text;
  v_genero text;
  v_clave text;
  v_destino uuid;
  v_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;
  IF v_yo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_FICHA');
  END IF;
  IF p_tipo IS NULL OR p_tipo = 'tutor' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'TIPO_INVALIDO');
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos) k
              WHERE k NOT IN ('nombre', 'apellido', 'fecha_nacimiento', 'cedula', 'telefono', 'genero')) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CAMPO_NO_PERMITIDO');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_datos) e
              WHERE jsonb_typeof(e.value) NOT IN ('string', 'null')
                 OR length(e.value #>> '{}') > 100) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS');
  END IF;

  v_nombre := nullif(btrim(p_datos ->> 'nombre'), '');
  v_apellido := nullif(btrim(p_datos ->> 'apellido'), '');
  v_cedula := public.normalizar_cedula_ve(nullif(btrim(p_datos ->> 'cedula'), ''));
  v_telefono := nullif(btrim(p_datos ->> 'telefono'), '');
  v_genero := nullif(btrim(p_datos ->> 'genero'), '');
  BEGIN
    v_nac := (p_datos ->> 'fecha_nacimiento')::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS');
  END;
  IF v_nombre IS NULL OR v_apellido IS NULL OR v_nac IS NULL OR v_nac > public.ninos_hoy()
     OR v_nac < DATE '1900-01-01'
     OR (v_genero IS NOT NULL AND v_genero NOT IN ('Masculino', 'Femenino')) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS');
  END IF;
  IF public.ninos_en_rango_edad(v_nac) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'USAR_MIS_HIJOS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_campus uc
                  WHERE uc.usuario_id = v_yo AND uc.es_campus_principal) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_CAMPUS');
  END IF;
  IF (SELECT count(*) FROM public.solicitudes_relacion_familiar s
       WHERE s.solicitante_id = v_yo AND s.creado_en > now() - interval '24 hours') >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_DIARIO');
  END IF;

  v_clave := public.dream_team_clave_nombre(v_nombre, v_apellido) || '|' || v_nac::text;

  -- Dedupe: the cédula first, then exactly one ficha with the same name key
  -- and birth date.
  IF v_cedula IS NOT NULL THEN
    SELECT u.id INTO v_destino FROM public.usuarios u WHERE u.cedula = v_cedula;
  END IF;
  IF v_destino IS NULL THEN
    SELECT min(u.id::text)::uuid INTO v_destino
      FROM public.usuarios u
     WHERE u.fecha_nacimiento::date = v_nac
       AND public.dream_team_clave_nombre(u.nombre, u.apellido) = public.dream_team_clave_nombre(v_nombre, v_apellido)
    HAVING count(*) = 1;
  END IF;
  IF v_destino = v_yo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS');
  END IF;

  IF v_destino IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.relaciones_usuarios ru
        WHERE (ru.usuario1_id = v_yo AND ru.usuario2_id = v_destino)
           OR (ru.usuario1_id = v_destino AND ru.usuario2_id = v_yo)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RELACIONADOS');
  END IF;
  IF p_tipo = 'conyuge' AND EXISTS (SELECT 1 FROM public.relaciones_usuarios ru
                                     WHERE ru.tipo_relacion = 'conyuge'
                                       AND v_yo IN (ru.usuario1_id, ru.usuario2_id)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_TIENE_CONYUGE');
  END IF;

  BEGIN
    INSERT INTO public.solicitudes_relacion_familiar (solicitante_id, destino_id, datos_sin_cuenta, tipo_relacion)
    VALUES (v_yo, v_destino,
            jsonb_strip_nulls(jsonb_build_object(
              'nombre', v_nombre, 'apellido', v_apellido, 'fecha_nacimiento', v_nac,
              'cedula', v_cedula, 'telefono', v_telefono, 'genero', v_genero, 'clave', v_clave)),
            p_tipo)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_SOLICITADO');
  END;

  RETURN jsonb_build_object('ok', true, 'codigo', 'ENVIADA', 'id', v_id);
END;
$function$;

-- familia_mis_solicitudes(): the caller's Mi familia, minimal fields.
--   enviadas: my open requests; nombre/apellido are what I typed (without
--     account) or the masked search label (with account); espera 'persona'
--     when the other person may confirm, 'campus' otherwise (always 'campus'
--     for a request made without account, so a dedupe match stays hidden).
--   recibidas: open requests that name me; relacion is what the solicitante
--     says they are to me.
--   familiares: my confirmed links; relacion is what the other is to me;
--     puedo_editar when I created their ficha and it still has no account;
--     es_nino when they are under 13 (managed in Mis hijos).
-- Codes: SIN_SESION, SIN_FICHA.
CREATE OR REPLACE FUNCTION public.familia_mis_solicitudes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;
  IF v_yo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_FICHA');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enviadas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'tipo_relacion', s.tipo_relacion,
               'nombre', CASE WHEN s.datos_sin_cuenta IS NOT NULL THEN s.datos_sin_cuenta ->> 'nombre' ELSE btrim(d.nombre) END,
               'apellido', CASE WHEN s.datos_sin_cuenta IS NOT NULL THEN s.datos_sin_cuenta ->> 'apellido'
                                ELSE concat_ws(' ',
                                       (regexp_split_to_array(btrim(d.apellido), '\s+'))[1],
                                       upper(left((regexp_split_to_array(btrim(d.apellido), '\s+'))[2], 1)) || '.') END,
               'genero', CASE WHEN s.datos_sin_cuenta IS NOT NULL THEN s.datos_sin_cuenta ->> 'genero' ELSE d.genero::text END,
               'espera', CASE WHEN s.datos_sin_cuenta IS NULL AND d.auth_id IS NOT NULL THEN 'persona' ELSE 'campus' END,
               'creado_en', s.creado_en)
             ORDER BY s.creado_en DESC, s.id), '[]'::jsonb)
        FROM public.solicitudes_relacion_familiar s
        LEFT JOIN public.usuarios d ON d.id = s.destino_id
       WHERE s.solicitante_id = v_yo AND s.estado = 'pendiente'),
    'recibidas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'relacion', public.familia_tipo_inverso(s.tipo_relacion),
               'nombre', btrim(o.nombre),
               'apellido', btrim(o.apellido),
               'genero', o.genero,
               'creado_en', s.creado_en)
             ORDER BY s.creado_en DESC, s.id), '[]'::jsonb)
        FROM public.solicitudes_relacion_familiar s
        JOIN public.usuarios o ON o.id = s.solicitante_id
       WHERE s.destino_id = v_yo AND s.estado = 'pendiente'),
    'familiares', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'relacion_id', ru.id,
               'usuario_id', o.id,
               'relacion', CASE WHEN ru.usuario1_id = v_yo THEN ru.tipo_relacion
                                ELSE public.familia_tipo_inverso(ru.tipo_relacion) END,
               'nombre', btrim(o.nombre),
               'apellido', btrim(o.apellido),
               'genero', o.genero,
               'cuenta', o.auth_id IS NOT NULL,
               'puedo_editar', o.auth_id IS NULL AND o.creado_por = v_yo,
               'es_nino', public.ninos_en_rango_edad(o.fecha_nacimiento::date))
             ORDER BY o.nombre, o.apellido, ru.id), '[]'::jsonb)
        FROM public.relaciones_usuarios ru
        JOIN public.usuarios o ON o.id = CASE WHEN ru.usuario1_id = v_yo THEN ru.usuario2_id ELSE ru.usuario1_id END
       WHERE v_yo IN (ru.usuario1_id, ru.usuario2_id)));
END;
$function$;

-- familia_responder(id, aceptar): only the destino of an open request.
-- Accepting writes the relaciones_usuarios row (header mapping). Codes:
-- SIN_SESION, PARAMETROS_INVALIDOS, NO_ENCONTRADO, YA_RESUELTO,
-- YA_RELACIONADOS, YA_TIENE_CONYUGE; ok: CONFIRMADA (relacion_id) or
-- RECHAZADA.
CREATE OR REPLACE FUNCTION public.familia_responder(p_id uuid, p_aceptar boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_req public.solicitudes_relacion_familiar%ROWTYPE;
  v_res jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  IF p_id IS NULL OR p_aceptar IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PARAMETROS_INVALIDOS');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;

  SELECT * INTO v_req FROM public.solicitudes_relacion_familiar WHERE id = p_id FOR UPDATE;
  IF v_yo IS NULL OR v_req.id IS NULL OR v_req.destino_id IS DISTINCT FROM v_yo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;
  IF v_req.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RESUELTO');
  END IF;

  IF NOT p_aceptar THEN
    UPDATE public.solicitudes_relacion_familiar
       SET estado = 'rechazada', resuelto_por = v_yo, resuelto_en = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'codigo', 'RECHAZADA');
  END IF;

  v_res := public.familia_crear_relacion(v_req.solicitante_id, v_req.destino_id, v_req.tipo_relacion);
  IF NOT (v_res ->> 'ok')::boolean THEN
    RETURN v_res;
  END IF;
  UPDATE public.solicitudes_relacion_familiar
     SET estado = 'confirmada', resuelto_por = v_yo, resuelto_en = now()
   WHERE id = p_id;
  RETURN v_res;
END;
$function$;

-- familia_cancelar(id): only the solicitante of an open request; nobody is
-- notified. Codes: SIN_SESION, NO_ENCONTRADO, YA_RESUELTO; ok: CANCELADA.
CREATE OR REPLACE FUNCTION public.familia_cancelar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_req public.solicitudes_relacion_familiar%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;

  SELECT * INTO v_req FROM public.solicitudes_relacion_familiar WHERE id = p_id FOR UPDATE;
  IF v_yo IS NULL OR v_req.id IS NULL OR v_req.solicitante_id <> v_yo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;
  IF v_req.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RESUELTO');
  END IF;

  UPDATE public.solicitudes_relacion_familiar
     SET estado = 'cancelada', resuelto_por = v_yo, resuelto_en = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'codigo', 'CANCELADA');
END;
$function$;

-- familia_quitar(relacion_id): either person of a confirmed link removes it;
-- both fichas stay. A link with a child under 13 is managed in Mis hijos.
-- Codes: SIN_SESION, NO_ENCONTRADO, USAR_MIS_HIJOS; ok: QUITADA.
CREATE OR REPLACE FUNCTION public.familia_quitar(p_relacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_rel public.relaciones_usuarios%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;

  SELECT * INTO v_rel FROM public.relaciones_usuarios WHERE id = p_relacion_id FOR UPDATE;
  IF v_yo IS NULL OR v_rel.id IS NULL OR v_yo NOT IN (v_rel.usuario1_id, v_rel.usuario2_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios u
              WHERE u.id IN (v_rel.usuario1_id, v_rel.usuario2_id)
                AND public.ninos_en_rango_edad(u.fecha_nacimiento::date)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'USAR_MIS_HIJOS');
  END IF;

  DELETE FROM public.relaciones_usuarios WHERE id = v_rel.id;
  RETURN jsonb_build_object('ok', true, 'codigo', 'QUITADA');
END;
$function$;

-- familia_resolver(id, aprobar): a person who can edit the solicitante and the
-- destino (puede_editar_usuario: lider, director, pastor of the campus,
-- admin) and is neither of them approves or rejects an open request. Without
-- a destino, approving creates the ficha (creado_por = solicitante, campus =
-- the solicitante's main campus) and then the link. Codes: SIN_SESION,
-- PARAMETROS_INVALIDOS, NO_ENCONTRADO, YA_RESUELTO, SIN_CAMPUS,
-- CEDULA_EXISTENTE (somebody took that cédula meanwhile; the request stays
-- open), YA_RELACIONADOS, YA_TIENE_CONYUGE; ok: APROBADA (relacion_id,
-- usuario_id, ficha_creada) or RECHAZADA.
CREATE OR REPLACE FUNCTION public.familia_resolver(p_id uuid, p_aprobar boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_yo uuid;
  v_req public.solicitudes_relacion_familiar%ROWTYPE;
  v_destino uuid;
  v_campus uuid;
  v_creada boolean := false;
  v_res jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;
  IF p_id IS NULL OR p_aprobar IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PARAMETROS_INVALIDOS');
  END IF;
  SELECT id INTO v_yo FROM public.usuarios WHERE auth_id = v_auth;

  SELECT * INTO v_req FROM public.solicitudes_relacion_familiar WHERE id = p_id FOR UPDATE;
  -- Quien ya la resolvió recibe YA_RESUELTO aunque el permiso cambie al
  -- crearse la ficha (el destino nuevo puede no ser editable para el líder).
  IF v_req.id IS NOT NULL AND v_req.estado <> 'pendiente' AND v_req.resuelto_por = v_yo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RESUELTO');
  END IF;
  IF v_req.id IS NULL OR NOT public.familia_puede_resolver(p_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;
  IF v_req.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RESUELTO');
  END IF;

  IF NOT p_aprobar THEN
    UPDATE public.solicitudes_relacion_familiar
       SET estado = 'rechazada', resuelto_por = v_yo, resuelto_en = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'codigo', 'RECHAZADA');
  END IF;

  v_destino := v_req.destino_id;
  IF v_destino IS NULL THEN
    SELECT uc.campus_id INTO v_campus
      FROM public.usuario_campus uc
     WHERE uc.usuario_id = v_req.solicitante_id AND uc.es_campus_principal
     LIMIT 1;
    IF v_campus IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_CAMPUS');
    END IF;
    IF v_req.datos_sin_cuenta ? 'cedula' AND EXISTS (
         SELECT 1 FROM public.usuarios u WHERE u.cedula = v_req.datos_sin_cuenta ->> 'cedula') THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'CEDULA_EXISTENTE');
    END IF;
    -- Checked before the ficha exists, so a refused link leaves no ficha.
    IF v_req.tipo_relacion = 'conyuge' AND EXISTS (
         SELECT 1 FROM public.relaciones_usuarios ru
          WHERE ru.tipo_relacion = 'conyuge'
            AND v_req.solicitante_id IN (ru.usuario1_id, ru.usuario2_id)) THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'YA_TIENE_CONYUGE');
    END IF;

    INSERT INTO public.usuarios (nombre, apellido, genero, estado_civil, fecha_nacimiento, cedula, telefono, creado_por)
    VALUES (v_req.datos_sin_cuenta ->> 'nombre',
            v_req.datos_sin_cuenta ->> 'apellido',
            coalesce(v_req.datos_sin_cuenta ->> 'genero', 'Otro')::public.enum_genero,
            'No especificado',
            (v_req.datos_sin_cuenta ->> 'fecha_nacimiento')::date,
            v_req.datos_sin_cuenta ->> 'cedula',
            v_req.datos_sin_cuenta ->> 'telefono',
            v_req.solicitante_id)
    RETURNING id INTO v_destino;
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
    VALUES (v_destino, v_campus, true);
    v_creada := true;
  END IF;

  v_res := public.familia_crear_relacion(v_req.solicitante_id, v_destino, v_req.tipo_relacion);
  IF NOT (v_res ->> 'ok')::boolean THEN
    RETURN v_res;
  END IF;

  UPDATE public.solicitudes_relacion_familiar
     SET estado = 'confirmada', destino_id = v_destino, resuelto_por = v_yo, resuelto_en = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'codigo', 'APROBADA',
                            'relacion_id', v_res -> 'relacion_id',
                            'usuario_id', v_destino,
                            'ficha_creada', v_creada);
END;
$function$;

-- familia_pendientes_listar(): the open requests the caller may resolve (same
-- rule as familia_resolver), for the Familia section of Usuarios. sin_cuenta
-- holds the typed data (no clave); destino is NULL until a ficha exists;
-- crea_ficha tells "Aprobar y crear ficha" from "Aprobar". Codes: SIN_SESION.
CREATE OR REPLACE FUNCTION public.familia_pendientes_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SIN_SESION');
  END IF;

  RETURN jsonb_build_object('ok', true, 'solicitudes', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'tipo_relacion', s.tipo_relacion,
             'creado_en', s.creado_en,
             'solicitante', jsonb_build_object('id', so.id, 'nombre', so.nombre, 'apellido', so.apellido),
             'destino', CASE WHEN d.id IS NULL THEN NULL
                             ELSE jsonb_build_object('id', d.id, 'nombre', d.nombre, 'apellido', d.apellido,
                                                     'cuenta', d.auth_id IS NOT NULL) END,
             'sin_cuenta', s.datos_sin_cuenta - 'clave',
             'crea_ficha', s.destino_id IS NULL)
           ORDER BY s.creado_en, s.id), '[]'::jsonb)
      FROM public.solicitudes_relacion_familiar s
      JOIN public.usuarios so ON so.id = s.solicitante_id
      LEFT JOIN public.usuarios d ON d.id = s.destino_id
     WHERE s.estado = 'pendiente'
       AND public.familia_puede_resolver(s.id)));
END;
$function$;

-- Privileges: the ten RPCs for authenticated and service_role only.
REVOKE ALL ON FUNCTION public.familia_buscar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_verificar(uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_solicitar(uuid, public.enum_tipo_relacion) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_solicitar_sin_cuenta(jsonb, public.enum_tipo_relacion) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_mis_solicitudes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_responder(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_cancelar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_quitar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_resolver(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familia_pendientes_listar() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.familia_buscar(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_verificar(uuid, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_solicitar(uuid, public.enum_tipo_relacion) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_solicitar_sin_cuenta(jsonb, public.enum_tipo_relacion) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_mis_solicitudes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_responder(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_cancelar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_quitar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_resolver(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_pendientes_listar() TO authenticated, service_role;
