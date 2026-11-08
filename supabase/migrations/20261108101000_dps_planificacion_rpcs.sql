-- DPS planning, phase 1a-1: RPCs (odd/tasks/dps-asistencia-pco.md, T8a; S6,
-- S7.1-S7.3). Schema and authority helpers: 20261108100000_dps_planificacion_base.sql.
--
-- Read (dps_puede_ver: planners, DPS coordinators/directors, active DPS servidores):
--   dps_puestos_listar(equipo)              active puestos of a DPS equipo and its
--                                           subtree (NULL = all of DPS).
--   dps_planes_rango(desde, hasta)          plans of the range (at most 400 days),
--                                           for the sheet and the matrix.
--   dps_plan_leer(plan)                     one plan, with puede_editar.
-- Write (dps_puede_planificar):
--   dps_puesto_guardar(id, equipo, nombre, cantidad, orden)  create (id NULL) or edit.
--   dps_puesto_desactivar(id)
--   dps_serie_crear(nombre, color, semanas, primer_domingo, sinopsis, enlace)
--       the series and its N Sunday plans (semana 1..N, one week apart); a
--       Sunday that already has a 'domingo' plan without a series is attached
--       to it instead of duplicated.
--   dps_serie_actualizar(serie, nombre, color, semanas, sinopsis, enlace)
--       more semanas create or attach the new Sundays; fewer detach the
--       trailing plans (they stay, without a series).
--   dps_serie_imagen(serie, path)          cover path '<serie_id>/<file>' in the
--                                           dps-series bucket (NULL clears).
--   dps_plan_crear(fecha, tipo, titulo)     horarios and llegada from dps_config.
--   dps_plan_campo(plan, campo, valor)      one cell (whitelist below).
--   dps_config_leer(), dps_config_guardar(horarios, llegada)
--   dps_planificador_agregar(persona), dps_planificador_quitar(persona)
--   dps_pasan_asistencia_guardar(equipo, habilitado)  NULL = inherit.
--
-- dps_plan_campo whitelist: titulo (string|null), llegada ('HH:MM'), horarios
-- (array of 'HH:MM'), productor / host / comunicador (null, {"persona_id": uuid}
-- or {"texto": string}; both or neither is 'persona_o_texto'), and the creative
-- campos opener, anuncios, cantantes, closer, historia_vida, sinopsis_override,
-- notas (string|null, at most 4000) and canciones (array of at most 10 strings
-- of at most 200, or null). A null creative value removes the key. fecha, tipo
-- and serie are not editable through it.
--
-- Errors: 'sin_autoridad' (42501) without a session or authority; 22023 for
-- equipo_invalido, nombre_invalido, cantidad_invalida, orden_invalido,
-- puesto_invalido, puesto_duplicado, color_invalido, semanas_invalidas,
-- fecha_invalida, enlace_invalido, sinopsis_invalida, serie_invalida,
-- domingo_ocupado (a Sunday plan of another series), imagen_invalida,
-- tipo_invalido, titulo_invalido, plan_invalido, plan_duplicado,
-- rango_invalido, campo_invalido, valor_invalido, persona_o_texto,
-- persona_invalida, horarios_invalidos, llegada_invalida.
--
-- Rollback: DROP FUNCTION IF EXISTS for each function below (signatures as
-- created), then the base migration's rollback.

-- ── 0. internal helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_exigir_planificador()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
BEGIN
  IF v_actor IS NULL OR NOT public.dps_puede_planificar() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_exigir_planificador() FROM PUBLIC, anon, authenticated;

-- Configuration (who plans, who passes attendance, default times) is
-- reserved to admin/pastor and the DPS direction itself: an added planner
-- plans, but cannot grant planning to others.
CREATE OR REPLACE FUNCTION public.dps_exigir_configurador()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_raiz uuid := public.dps_raiz();
BEGIN
  IF v_actor IS NULL OR NOT (
       public.es_admin_o_pastor(auth.uid())
       OR (v_raiz IS NOT NULL AND (
             public.auth_has_dream_team_capability_in_tree('dream_team.direct', v_raiz)
             OR public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', v_raiz)))) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_exigir_configurador() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_persona_json(p_persona_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
           WHEN p_persona_id IS NOT NULL THEN jsonb_build_object('persona_id', p_persona_id, 'texto', NULL,
             'nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios u WHERE u.id = p_persona_id))
           WHEN p_texto IS NOT NULL THEN jsonb_build_object('persona_id', NULL, 'texto', p_texto, 'nombre', p_texto)
         END;
$$;
REVOKE ALL ON FUNCTION public.dps_persona_json(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_json(p_plan_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'id', p.id, 'fecha', p.fecha, 'tipo', p.tipo, 'titulo', p.titulo, 'semana', p.semana,
           'serie', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
                      'id', s.id, 'nombre', s.nombre, 'color', s.color, 'imagen_path', s.imagen_path,
                      'semanas', s.semanas, 'primer_domingo', s.primer_domingo,
                      'sinopsis', s.sinopsis, 'enlace_recurso', s.enlace_recurso) END,
           'horarios', p.horarios, 'llegada', to_char(p.llegada, 'HH24:MI'),
           'productor', public.dps_persona_json(p.productor_persona_id, p.productor_texto),
           'host', public.dps_persona_json(p.host_persona_id, p.host_texto),
           'comunicador', public.dps_persona_json(p.comunicador_persona_id, p.comunicador_texto),
           'campos', p.campos, 'updated_at', p.updated_at)
    FROM public.dps_planes p
    LEFT JOIN public.dps_series s ON s.id = p.serie_id
   WHERE p.id = p_plan_id;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_json(uuid) FROM PUBLIC, anon, authenticated;

-- Attaches or creates the Sunday plans of semanas desde..hasta of a series.
CREATE OR REPLACE FUNCTION public.dps_serie_semanas(p_serie_id uuid, p_desde integer, p_hasta integer, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_serie public.dps_series%ROWTYPE;
  v_cfg public.dps_config%ROWTYPE;
  v_fecha date;
  v_plan public.dps_planes%ROWTYPE;
  v_id uuid;
  v_existente boolean;
  v_planes jsonb := '[]'::jsonb;
BEGIN
  SELECT s.* INTO v_serie FROM public.dps_series s WHERE s.id = p_serie_id;
  SELECT c.* INTO v_cfg FROM public.dps_config c WHERE c.id;
  -- Serializes Sunday plan creation (also against dps_plan_crear).
  PERFORM pg_advisory_xact_lock(hashtext('dps_planes_domingo'));
  FOR i IN p_desde .. p_hasta LOOP
    v_fecha := v_serie.primer_domingo + 7 * (i - 1);
    SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.fecha = v_fecha AND p.tipo = 'domingo' FOR UPDATE;
    v_existente := FOUND;
    IF v_existente THEN
      IF v_plan.serie_id IS NOT NULL AND v_plan.serie_id <> p_serie_id THEN
        RAISE EXCEPTION 'domingo_ocupado' USING ERRCODE = '22023', DETAIL = v_fecha::text;
      END IF;
      UPDATE public.dps_planes
         SET serie_id = p_serie_id, semana = i, updated_at = now(), updated_by = p_actor
       WHERE id = v_plan.id;
      v_id := v_plan.id;
    ELSE
      INSERT INTO public.dps_planes (fecha, tipo, serie_id, semana, horarios, llegada, updated_by) -- noqa: insert-into
      VALUES (v_fecha, 'domingo', p_serie_id, i, coalesce(v_cfg.horarios, '["09:15", "11:15"]'::jsonb),
              coalesce(v_cfg.llegada, '07:00'::time), p_actor)
      RETURNING id INTO v_id;
    END IF;
    v_planes := v_planes || jsonb_build_object('id', v_id, 'fecha', v_fecha, 'semana', i, 'existente', v_existente);
  END LOOP;
  RETURN v_planes;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_serie_semanas(uuid, integer, integer, uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. puestos ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_puestos_listar(p_equipo_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, equipo_id uuid, equipo text, ruta text, nombre text, cantidad integer, orden integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_equipo_id IS NOT NULL AND NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH RECURSIVE arbol AS MATERIALIZED (
    SELECT d.equipo_id AS eq, d.parent_equipo_id AS padre, d.label AS etiqueta, d.ruta AS camino
      FROM public.dps_equipos() d
  ), sub AS (
    SELECT a.eq FROM arbol a WHERE p_equipo_id IS NULL OR a.eq = p_equipo_id
    UNION
    SELECT a.eq FROM arbol a JOIN sub s ON a.padre = s.eq
  )
  SELECT pu.id, pu.equipo_id, a.etiqueta, a.camino, pu.nombre, pu.cantidad, pu.orden
    FROM public.dps_puestos pu
    JOIN arbol a ON a.eq = pu.equipo_id
   WHERE pu.activo AND pu.equipo_id IN (SELECT s.eq FROM sub s)
   ORDER BY a.camino, pu.orden, lower(pu.nombre);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_puestos_listar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puestos_listar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_puesto_guardar(
  p_id uuid,
  p_equipo_id uuid,
  p_nombre text,
  p_cantidad integer DEFAULT 1,
  p_orden integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nombre text := btrim(p_nombre);
  v_id uuid;
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_nombre IS NULL OR v_nombre = '' OR char_length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'nombre_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'cantidad_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_orden IS NOT NULL AND p_orden NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'orden_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dps_puestos x
              WHERE x.activo AND x.equipo_id = p_equipo_id AND lower(btrim(x.nombre)) = lower(v_nombre)
                AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'puesto_duplicado' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.dps_puestos (equipo_id, nombre, cantidad, orden) -- noqa: insert-into
    VALUES (p_equipo_id, v_nombre, p_cantidad,
            coalesce(p_orden, (SELECT coalesce(max(x.orden) + 1, 0) FROM public.dps_puestos x
                                WHERE x.equipo_id = p_equipo_id AND x.activo)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dps_puestos
       SET equipo_id = p_equipo_id, nombre = v_nombre, cantidad = p_cantidad,
           orden = coalesce(p_orden, orden), updated_at = now()
     WHERE id = p_id AND activo
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'puesto_duplicado' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.dps_puesto_guardar(uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puesto_guardar(uuid, uuid, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_puesto_desactivar(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF NOT EXISTS (SELECT 1 FROM public.dps_puestos x WHERE x.id = p_id) THEN
    RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.dps_puestos SET activo = false, updated_at = now() WHERE id = p_id AND activo;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_puesto_desactivar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puesto_desactivar(uuid) TO authenticated;

-- ── 2. series ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_serie_validar(p_nombre text, p_color text, p_semanas integer, p_sinopsis text, p_enlace text)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' OR char_length(btrim(p_nombre)) > 120 THEN
    RAISE EXCEPTION 'nombre_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_color IS NULL OR p_color NOT IN ('chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5') THEN
    RAISE EXCEPTION 'color_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_semanas IS NULL OR p_semanas NOT BETWEEN 1 AND 52 THEN
    RAISE EXCEPTION 'semanas_invalidas' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_sinopsis) > 4000 THEN
    RAISE EXCEPTION 'sinopsis_invalida' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_enlace), '') IS NOT NULL
     AND (char_length(btrim(p_enlace)) > 500 OR btrim(p_enlace) !~* '^https?://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'enlace_invalido' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_serie_validar(text, text, integer, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_serie_crear(
  p_nombre text,
  p_color text,
  p_semanas integer,
  p_primer_domingo date,
  p_sinopsis text DEFAULT NULL,
  p_enlace text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_id uuid;
BEGIN
  PERFORM public.dps_serie_validar(p_nombre, p_color, p_semanas, p_sinopsis, p_enlace);
  IF p_primer_domingo IS NULL OR extract(dow FROM p_primer_domingo)::int <> 0 THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_series (nombre, color, semanas, primer_domingo, sinopsis, enlace_recurso, created_by) -- noqa: insert-into
  VALUES (btrim(p_nombre), p_color, p_semanas, p_primer_domingo, nullif(btrim(p_sinopsis), ''),
          nullif(btrim(p_enlace), ''), v_actor)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('serie_id', v_id, 'planes', public.dps_serie_semanas(v_id, 1, p_semanas, v_actor));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_serie_crear(text, text, integer, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_serie_crear(text, text, integer, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_serie_actualizar(
  p_serie_id uuid,
  p_nombre text,
  p_color text,
  p_semanas integer,
  p_sinopsis text DEFAULT NULL,
  p_enlace text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_serie public.dps_series%ROWTYPE;
  v_nuevos jsonb := '[]'::jsonb;
BEGIN
  SELECT s.* INTO v_serie FROM public.dps_series s WHERE s.id = p_serie_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'serie_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM public.dps_serie_validar(p_nombre, p_color, p_semanas, p_sinopsis, p_enlace);
  UPDATE public.dps_series
     SET nombre = btrim(p_nombre), color = p_color, semanas = p_semanas,
         sinopsis = nullif(btrim(p_sinopsis), ''), enlace_recurso = nullif(btrim(p_enlace), ''), updated_at = now()
   WHERE id = p_serie_id;
  IF p_semanas > v_serie.semanas THEN
    v_nuevos := public.dps_serie_semanas(p_serie_id, v_serie.semanas + 1, p_semanas, v_actor);
  ELSIF p_semanas < v_serie.semanas THEN
    UPDATE public.dps_planes
       SET serie_id = NULL, semana = NULL, updated_at = now(), updated_by = v_actor
     WHERE serie_id = p_serie_id AND semana > p_semanas;
  END IF;
  RETURN jsonb_build_object('serie_id', p_serie_id, 'planes', v_nuevos);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_serie_actualizar(uuid, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_serie_actualizar(uuid, text, text, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_serie_imagen(p_serie_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF NOT EXISTS (SELECT 1 FROM public.dps_series s WHERE s.id = p_serie_id) THEN
    RAISE EXCEPTION 'serie_invalida' USING ERRCODE = '22023';
  END IF;
  -- The server uploads to '<serie_id>/<file>' with the service role.
  IF p_path IS NOT NULL AND (char_length(p_path) > 300 OR p_path LIKE '%..%'
     OR p_path !~ ('^' || p_serie_id::text || '/[A-Za-z0-9._-]+$')) THEN
    RAISE EXCEPTION 'imagen_invalida' USING ERRCODE = '22023';
  END IF;
  UPDATE public.dps_series SET imagen_path = p_path, updated_at = now() WHERE id = p_serie_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_serie_imagen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_serie_imagen(uuid, text) TO authenticated;

-- ── 3. planes ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_planes_rango(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 400 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(public.dps_plan_json(p.id) ORDER BY p.fecha, p.tipo, p.titulo NULLS FIRST), '[]'::jsonb)
            FROM public.dps_planes p
           WHERE p.fecha BETWEEN p_desde AND p_hasta);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_planes_rango(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_planes_rango(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_leer(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan jsonb;
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  v_plan := public.dps_plan_json(p_plan_id);
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN v_plan || jsonb_build_object('puede_editar', public.dps_puede_planificar());
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_leer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_leer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_crear(p_fecha date, p_tipo text, p_titulo text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_titulo text := nullif(btrim(p_titulo), '');
  v_cfg public.dps_config%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('domingo', 'cena_del_senor', 'noche_adoracion', 'especial', 'libre') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR (p_tipo = 'domingo' AND extract(dow FROM p_fecha)::int <> 0) THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_titulo) > 120 THEN
    RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dps_planes_domingo'));
  SELECT c.* INTO v_cfg FROM public.dps_config c WHERE c.id;
  INSERT INTO public.dps_planes (fecha, tipo, titulo, horarios, llegada, updated_by) -- noqa: insert-into
  VALUES (p_fecha, p_tipo, v_titulo, coalesce(v_cfg.horarios, '["09:15", "11:15"]'::jsonb),
          coalesce(v_cfg.llegada, '07:00'::time), v_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'plan_duplicado' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_crear(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_crear(date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_campo(p_plan_id uuid, p_campo text, p_valor jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_tipo text := jsonb_typeof(p_valor);
  v_texto text;
  v_persona uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_valor IS NULL OR v_tipo = 'null' THEN
    v_tipo := 'null';
  END IF;

  IF p_campo = 'titulo' THEN
    IF v_tipo NOT IN ('null', 'string') OR char_length(btrim(p_valor #>> '{}')) > 120 THEN
      RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes SET titulo = nullif(btrim(p_valor #>> '{}'), '') WHERE id = p_plan_id;

  ELSIF p_campo = 'llegada' THEN
    IF v_tipo <> 'string' OR NOT (p_valor #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'llegada_invalida' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes SET llegada = (p_valor #>> '{}')::time WHERE id = p_plan_id;

  ELSIF p_campo = 'horarios' THEN
    UPDATE public.dps_planes SET horarios = public.dps_horarios_normalizar(p_valor) WHERE id = p_plan_id;

  ELSIF p_campo IN ('productor', 'host', 'comunicador') THEN
    IF v_tipo = 'null' THEN
      v_persona := NULL;
      v_texto := NULL;
    ELSIF v_tipo <> 'object' THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    ELSIF EXISTS (SELECT 1 FROM jsonb_object_keys(p_valor) k WHERE k NOT IN ('persona_id', 'texto'))
       OR num_nonnulls(nullif(p_valor -> 'persona_id', 'null'::jsonb),
                       nullif(btrim(nullif(p_valor -> 'texto', 'null'::jsonb) #>> '{}'), '')) <> 1 THEN
      RAISE EXCEPTION 'persona_o_texto' USING ERRCODE = '22023';
    ELSIF p_valor ? 'persona_id' AND jsonb_typeof(p_valor -> 'persona_id') <> 'null' THEN
      IF jsonb_typeof(p_valor -> 'persona_id') <> 'string'
         OR (p_valor ->> 'persona_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
      END IF;
      v_persona := (p_valor ->> 'persona_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_persona) THEN
        RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF jsonb_typeof(p_valor -> 'texto') <> 'string' OR char_length(btrim(p_valor ->> 'texto')) > 120 THEN
        RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
      END IF;
      v_texto := btrim(p_valor ->> 'texto');
    END IF;
    IF p_campo = 'productor' THEN
      UPDATE public.dps_planes SET productor_persona_id = v_persona, productor_texto = v_texto WHERE id = p_plan_id;
    ELSIF p_campo = 'host' THEN
      UPDATE public.dps_planes SET host_persona_id = v_persona, host_texto = v_texto WHERE id = p_plan_id;
    ELSE
      UPDATE public.dps_planes SET comunicador_persona_id = v_persona, comunicador_texto = v_texto WHERE id = p_plan_id;
    END IF;

  ELSIF p_campo IN ('opener', 'anuncios', 'cantantes', 'closer', 'historia_vida', 'sinopsis_override', 'notas') THEN
    IF v_tipo NOT IN ('null', 'string') OR char_length(p_valor #>> '{}') > 4000 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes
       SET campos = CASE WHEN nullif(btrim(p_valor #>> '{}'), '') IS NULL THEN campos - p_campo
                         ELSE jsonb_set(campos, ARRAY[p_campo], to_jsonb(btrim(p_valor #>> '{}'))) END
     WHERE id = p_plan_id;

  ELSIF p_campo = 'canciones' THEN
    IF v_tipo = 'null' THEN
      UPDATE public.dps_planes SET campos = campos - 'canciones' WHERE id = p_plan_id;
    ELSIF v_tipo <> 'array' THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    ELSIF jsonb_array_length(p_valor) > 10
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_valor) c
                   WHERE jsonb_typeof(c) <> 'string' OR char_length(c #>> '{}') > 200) THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    ELSIF jsonb_array_length(p_valor) = 0 THEN
      UPDATE public.dps_planes SET campos = campos - 'canciones' WHERE id = p_plan_id;
    ELSE
      UPDATE public.dps_planes
         SET campos = jsonb_set(campos, '{canciones}',
               (SELECT jsonb_agg(btrim(t.c #>> '{}') ORDER BY t.o) FROM jsonb_array_elements(p_valor) WITH ORDINALITY AS t(c, o)))
       WHERE id = p_plan_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.dps_planes SET updated_at = now(), updated_by = v_actor WHERE id = p_plan_id;
  RETURN public.dps_plan_json(p_plan_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'plan_duplicado' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_campo(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_campo(uuid, text, jsonb) TO authenticated;

-- ── 4. configuration ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_config_leer()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cfg public.dps_config%ROWTYPE;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT c.* INTO v_cfg FROM public.dps_config c WHERE c.id;
  RETURN jsonb_build_object(
    'horarios', coalesce(v_cfg.horarios, '["09:15", "11:15"]'::jsonb),
    'llegada', to_char(coalesce(v_cfg.llegada, '07:00'::time), 'HH24:MI'),
    'planificadores', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'persona_id', p.persona_id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
                          'agregado_at', p.created_at) ORDER BY u.nombre, u.apellido), '[]'::jsonb)
                         FROM public.dps_planificadores p JOIN public.usuarios u ON u.id = p.persona_id),
    'pasan_asistencia', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                            'equipo_id', d.equipo_id, 'equipo', d.label, 'ruta', d.ruta, 'profundidad', d.profundidad,
                            'habilitado', public.dps_asistencia_habilitada(d.equipo_id),
                            'explicito', pa.habilitado) ORDER BY d.ruta), '[]'::jsonb)
                           FROM public.dps_equipos() d
                           LEFT JOIN public.dps_pasan_asistencia pa ON pa.equipo_id = d.equipo_id));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_config_leer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_config_leer() TO authenticated;

-- Only plans created afterwards take the new defaults.
CREATE OR REPLACE FUNCTION public.dps_config_guardar(p_horarios jsonb, p_llegada time)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_configurador();
  v_horarios jsonb := public.dps_horarios_normalizar(p_horarios);
BEGIN
  IF p_llegada IS NULL THEN
    RAISE EXCEPTION 'llegada_invalida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_config AS c (id, horarios, llegada, updated_by) -- noqa: insert-into
  VALUES (true, v_horarios, p_llegada, v_actor)
  ON CONFLICT (id) DO UPDATE
     SET horarios = excluded.horarios, llegada = excluded.llegada, updated_at = now(), updated_by = excluded.updated_by;
  RETURN jsonb_build_object('horarios', v_horarios, 'llegada', to_char(p_llegada, 'HH24:MI'));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_config_guardar(jsonb, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_config_guardar(jsonb, time) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_planificador_agregar(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_configurador();
BEGIN
  IF p_persona_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_persona_id) THEN
    RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_planificadores (persona_id, agregado_por) -- noqa: insert-into
  VALUES (p_persona_id, v_actor)
  ON CONFLICT (persona_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_planificador_agregar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_planificador_agregar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_planificador_quitar(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.dps_exigir_configurador();
  DELETE FROM public.dps_planificadores WHERE persona_id = p_persona_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_planificador_quitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_planificador_quitar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_pasan_asistencia_guardar(p_equipo_id uuid, p_habilitado boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_configurador();
BEGIN
  IF NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_habilitado IS NULL THEN
    DELETE FROM public.dps_pasan_asistencia WHERE equipo_id = p_equipo_id;
  ELSE
    INSERT INTO public.dps_pasan_asistencia AS a (equipo_id, habilitado, updated_by) -- noqa: insert-into
    VALUES (p_equipo_id, p_habilitado, v_actor)
    ON CONFLICT (equipo_id) DO UPDATE
       SET habilitado = excluded.habilitado, updated_at = now(), updated_by = excluded.updated_by;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_pasan_asistencia_guardar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_pasan_asistencia_guardar(uuid, boolean) TO authenticated;
