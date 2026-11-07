-- Planificador de GDV: guardar los cambios de la sesión con un botón, todo o nada
-- (S24 de odd/tasks/planner-gdv.md; reemplaza el guardado automático de S13; S10, S15, S17, S22).
--
-- Por qué: el director mueve, crea y edita en el navegador sin guardar, y al tocar "Guardar" se
-- aplican todos los cambios pendientes en UNA transacción: si uno falla no queda nada guardado.
-- Cada cambio sigue siendo su propio paso (historial y deshacer, S15).
--
-- Qué crea:
--   planner_guardar_cambios(temporada, cambios jsonb) RETURNS jsonb. cambios es una lista ordenada
--   de 1 a 200 objetos:
--     {"tipo": "mover", "usuarios": [uuid...], "grupo": uuid | "tmp:<clave>" | null, "rol": "lider" | "aprendiz" | "miembro" | null}
--     {"tipo": "crear", "clave": "tmp:<clave>", "datos": {... como planner_crear_grupo}}
--     {"tipo": "editar", "grupo": uuid | "tmp:<clave>", "cambios": {... como planner_editar_grupo}}
--     {"tipo": "eliminar", "grupo": uuid}
--   Devuelve {"guardados": n, "pasos": [paso_id...], "grupos_creados": {"tmp:<clave>": uuid}}.
--
-- Reglas:
--   * Aplica los cambios EN ORDEN llamando a las RPC de pasos existentes (planner_mover_personas,
--     planner_crear_grupo, planner_editar_grupo, planner_eliminar_grupo): misma validación, alcance
--     (S10), S22, S17, historial y deshacer; un paso por cambio.
--   * "tmp:<clave>" apunta al grupo que creó un "crear" anterior de la misma lista; una clave
--     repetida, desconocida o usada antes de su "crear" da 22023.
--   * La forma de toda la lista se valida antes de aplicar nada (22023).
--   * Temporada: existe y está en 'planificacion' (22023); todo grupo editado, eliminado o destino de
--     un movimiento es de esa temporada (22023).
--   * Todo o nada: si un cambio falla se relanza con el MISMO SQLSTATE, el mensaje con el prefijo
--     "Cambio N de M: " y DETAIL {"indice": i} (desde 0) para que el cliente lo señale; la
--     transacción entera se revierte.
--   * Serializada por temporada con el mismo pg_advisory_xact_lock que las RPC de pasos (que lo
--     vuelven a tomar en la misma transacción, sin bloquearse).
--   * Errores: 28000 sin sesión, 42501 permiso, 22023 validación; los de cada cambio, los suyos.
--
-- Blast radius: función nueva. Escribe solo a través de las RPC de pasos. No cambia tablas,
-- políticas ni funciones existentes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.planner_guardar_cambios(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.planner_guardar_cambios(p_temporada_id uuid, p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_re_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_re_tmp constant text := '^tmp:[A-Za-z0-9_.:-]{1,64}$';
  v_estado text;
  v_total integer;
  v_i integer;
  v_cambio jsonb;
  v_tipo text;
  v_clave text;
  v_grupo text;
  v_problema text;
  v_claves text[] := '{}';
  v_creados jsonb := '{}'::jsonb;
  v_pasos jsonb := '[]'::jsonb;
  v_res jsonb;
  v_grupo_id uuid;
  v_temporada_grupo uuid;
  v_sqlstate text;
  v_mensaje text;
  v_pista text;
BEGIN
  -- Sesión y rol primero (28000, 42501), como las RPC de pasos.
  PERFORM 1 FROM public.planner_alcance_actor();
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || p_temporada_id::text, 0));
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = p_temporada_id FOR SHARE;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'La temporada no está en planificación' USING ERRCODE = '22023';
  END IF;

  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'array' OR jsonb_array_length(p_cambios) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Los cambios deben ser una lista de 1 a 200 cambios' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_cambios);

  -- Forma de toda la lista antes de aplicar nada. v_claves guarda las claves "tmp:" ya creadas,
  -- para que una referencia solo apunte a un "crear" anterior.
  FOR v_i IN 0 .. v_total - 1 LOOP
    v_cambio := p_cambios->v_i;
    v_problema := NULL;
    IF jsonb_typeof(v_cambio) <> 'object' THEN
      v_problema := 'cada cambio debe ser un objeto';
    ELSE
      v_tipo := v_cambio->>'tipo';
      SELECT 'campo no permitido: ' || k INTO v_problema
        FROM jsonb_object_keys(v_cambio) k
       WHERE k <> ALL (CASE v_tipo
                         WHEN 'mover' THEN ARRAY['tipo', 'usuarios', 'grupo', 'rol']
                         WHEN 'crear' THEN ARRAY['tipo', 'clave', 'datos']
                         WHEN 'editar' THEN ARRAY['tipo', 'grupo', 'cambios']
                         WHEN 'eliminar' THEN ARRAY['tipo', 'grupo']
                         ELSE ARRAY[k]
                       END)
       ORDER BY k
       LIMIT 1;
      v_grupo := CASE WHEN jsonb_typeof(v_cambio->'grupo') = 'string' THEN v_cambio->>'grupo' END;
      IF v_problema IS NOT NULL THEN
        NULL;
      ELSIF v_tipo IS NULL OR v_tipo NOT IN ('mover', 'crear', 'editar', 'eliminar') THEN
        v_problema := 'el tipo debe ser mover, crear, editar o eliminar';
      ELSIF v_tipo = 'mover' THEN
        -- CASE: jsonb_array_length y jsonb_array_elements fallan si no es una lista.
        IF (CASE WHEN jsonb_typeof(v_cambio->'usuarios') IS DISTINCT FROM 'array' THEN true
                 WHEN jsonb_array_length(v_cambio->'usuarios') = 0 THEN true
                 ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(v_cambio->'usuarios') e
                               WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ v_re_uuid)
            END) THEN
          v_problema := 'usuarios debe ser una lista de ids';
        ELSIF NOT (v_cambio ? 'grupo')
              OR (jsonb_typeof(v_cambio->'grupo') <> 'null' AND coalesce(v_grupo ~ v_re_uuid OR v_grupo ~ v_re_tmp, false) = false) THEN
          v_problema := 'grupo debe ser un id, "tmp:<clave>" o null';
        ELSIF coalesce(jsonb_typeof(v_cambio->'rol'), 'null') <> 'null'
              AND (jsonb_typeof(v_cambio->'rol') <> 'string' OR v_cambio->>'rol' NOT IN ('lider', 'aprendiz', 'miembro')) THEN
          v_problema := 'rol debe ser lider, aprendiz, miembro o null';
        END IF;
      ELSIF v_tipo = 'crear' THEN
        v_clave := CASE WHEN jsonb_typeof(v_cambio->'clave') = 'string' THEN v_cambio->>'clave' END;
        IF v_clave IS NULL OR v_clave !~ v_re_tmp THEN
          v_problema := 'la clave de un grupo nuevo debe ser "tmp:<clave>"';
        ELSIF v_clave = ANY (v_claves) THEN
          v_problema := format('la clave %s ya se usó en otro grupo nuevo', v_clave);
        ELSIF jsonb_typeof(v_cambio->'datos') IS DISTINCT FROM 'object' THEN
          v_problema := 'datos debe ser un objeto';
        ELSE
          v_claves := v_claves || v_clave;
        END IF;
      ELSIF v_tipo = 'editar' THEN
        IF coalesce(v_grupo ~ v_re_uuid OR v_grupo ~ v_re_tmp, false) = false THEN
          v_problema := 'grupo debe ser un id o "tmp:<clave>"';
        ELSIF jsonb_typeof(v_cambio->'cambios') IS DISTINCT FROM 'object' THEN
          v_problema := 'cambios debe ser un objeto';
        END IF;
      ELSIF coalesce(v_grupo ~ v_re_uuid, false) = false THEN
        v_problema := 'grupo debe ser un id';
      END IF;
      -- Una referencia "tmp:" (mover o editar) debe ser de un "crear" anterior.
      IF v_problema IS NULL AND v_tipo IN ('mover', 'editar') AND v_grupo ~ v_re_tmp AND NOT (v_grupo = ANY (v_claves)) THEN
        v_problema := format('%s no es un grupo nuevo creado antes en estos cambios', v_grupo);
      END IF;
    END IF;
    IF v_problema IS NOT NULL THEN
      RAISE EXCEPTION 'Cambio % de %: %', v_i + 1, v_total, v_problema
        USING ERRCODE = '22023', DETAIL = jsonb_build_object('indice', v_i)::text;
    END IF;
  END LOOP;

  -- Aplicar en orden. Cada cambio en su bloque: si falla, se relanza con su posición y el mismo
  -- SQLSTATE, y la transacción entera se revierte.
  FOR v_i IN 0 .. v_total - 1 LOOP
    v_cambio := p_cambios->v_i;
    v_tipo := v_cambio->>'tipo';
    v_grupo := CASE WHEN jsonb_typeof(v_cambio->'grupo') = 'string' THEN v_cambio->>'grupo' END;
    BEGIN
      v_grupo_id := CASE WHEN v_grupo ~ v_re_tmp THEN (v_creados->>v_grupo)::uuid ELSE v_grupo::uuid END;
      -- Editar y eliminar reciben solo el grupo: aquí se comprueba que sea de esta temporada (mover
      -- lo comprueba planner_mover_personas con la temporada que recibe).
      IF v_tipo IN ('editar', 'eliminar') THEN
        SELECT g.temporada_id INTO v_temporada_grupo FROM public.grupos g WHERE g.id = v_grupo_id;
        IF FOUND AND v_temporada_grupo <> p_temporada_id THEN
          RAISE EXCEPTION 'El grupo no es de esta temporada' USING ERRCODE = '22023';
        END IF;
      END IF;

      CASE v_tipo
        WHEN 'mover' THEN
          v_res := public.planner_mover_personas(
            p_temporada_id,
            ARRAY(SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(v_cambio->'usuarios') WITH ORDINALITY x(e, o) ORDER BY o),
            v_grupo_id,
            v_cambio->>'rol');
        WHEN 'crear' THEN
          v_res := public.planner_crear_grupo(p_temporada_id, v_cambio->'datos');
          v_creados := v_creados || jsonb_build_object(v_cambio->>'clave', v_res->'grupo_id');
        WHEN 'editar' THEN
          v_res := public.planner_editar_grupo(v_grupo_id, v_cambio->'cambios');
        ELSE
          v_res := public.planner_eliminar_grupo(v_grupo_id);
      END CASE;
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_mensaje = MESSAGE_TEXT, v_pista = PG_EXCEPTION_HINT;
        IF coalesce(v_pista, '') = '' THEN
          RAISE EXCEPTION 'Cambio % de %: %', v_i + 1, v_total, v_mensaje
            USING ERRCODE = v_sqlstate, DETAIL = jsonb_build_object('indice', v_i)::text;
        END IF;
        RAISE EXCEPTION 'Cambio % de %: %', v_i + 1, v_total, v_mensaje
          USING ERRCODE = v_sqlstate, DETAIL = jsonb_build_object('indice', v_i)::text, HINT = v_pista;
    END;
    v_pasos := v_pasos || jsonb_build_array(v_res->'paso_id');
  END LOOP;

  RETURN jsonb_build_object('guardados', v_total, 'pasos', v_pasos, 'grupos_creados', v_creados);
END;
$function$;

COMMENT ON FUNCTION public.planner_guardar_cambios(uuid, jsonb) IS
  'Planificador de GDV (S24): aplica en orden y en una sola transacción de 1 a 200 cambios (mover, crear, editar, eliminar) con las RPC de '
  'pasos, un paso por cambio; "tmp:<clave>" apunta a un grupo creado antes en la lista. Si uno falla no se guarda nada y el error lleva '
  '"Cambio N de M: ", el mismo SQLSTATE y DETAIL {"indice": i}. Devuelve guardados, pasos y grupos_creados.';

REVOKE ALL ON FUNCTION public.planner_guardar_cambios(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_guardar_cambios(uuid, jsonb) TO authenticated, service_role;
