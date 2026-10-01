-- noqa: insert-into
-- Varios directores de etapa por grupo en el planificador de GDV.
--
-- Un grupo puede tener de 1 a 4 directores de etapa (p. ej. un matrimonio o dos co-directores);
-- director_etapa_grupos no tiene unicidad por grupo y producción ya tiene grupos con 2 vínculos.
-- Se reemplazan, con la MISMA firma, permisos y comentarios, las dos funciones que forzaban
-- exactamente un vínculo:
--
--   * planner_guardar_planificacion: por grupo lee director_etapa_ids (arreglo de usuarios.id) o,
--     si no viene, la clave escalar heredada director_etapa_id (compatibilidad con el planificador
--     ya desplegado). Cada elemento debe ser un uuid; se deduplican; se exigen entre 1 y 4; cada
--     uno debe ser director_etapa del segmento del grupo (segmento_lideres, resolución
--     determinista ORDER BY id LIMIT 1). Los vínculos del grupo se concilian por conjunto: se
--     borran los de directores fuera del conjunto y los duplicados de un mismo director, y se
--     insertan los que faltan (sin cambios si ya coincide).
--   * planner_publicar_temporada: un grupo vigente falla si no tiene ningún vínculo o si CUALQUIERA
--     de sus vínculos no es un director_etapa del segmento del grupo; varios vínculos válidos
--     están permitidos.
--
-- El resto de ambas funciones (permisos, bloqueos, errores, renombrado en dos fases, bajas
-- lógicas, activación y JSON devuelto) no cambia. planner_directores_etapa_elegibles no cambia.

CREATE OR REPLACE FUNCTION public.planner_guardar_planificacion(
  p_temporada_id uuid,
  p_temporada_origen_id uuid,
  p_grupos jsonb,
  p_grupos_eliminados uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid := auth.uid();
  v_usuario_id uuid;
  v_temporada record;
  v_estado text;
  v_grupo jsonb;
  v_miembro jsonb;
  v_clave text;
  v_claves text[] := '{}';
  v_ids_payload uuid[] := '{}';
  v_id_payload uuid;
  v_usuarios_total integer;
  v_usuarios_distintos integer;
  v_usuarios_existentes integer;
  v_nombre text;
  v_segmento_id uuid;
  v_capacidad integer;
  v_tipado public.grupos;
  v_grupo_id uuid;
  v_existe_en_destino boolean;
  v_usuarios_grupo uuid[];
  v_resultado jsonb := '[]'::jsonb;
  v_insertados integer := 0;
  v_actualizados integer := 0;
  v_eliminados integer := 0;
  v_filas integer;
  v_id_eliminar uuid;
  v_hoy date := current_date;
  v_sl_id uuid;
  v_re_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_texto text;
  v_eliminado_choque boolean;
  v_dir_elementos jsonb;
  v_dir_elemento jsonb;
  v_dir_ids uuid[];
  v_dir_id uuid;
  v_sl_ids uuid[];
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = v_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Permiso denegado para guardar la planificación' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ) THEN
    RAISE EXCEPTION 'Permiso denegado para guardar la planificación' USING ERRCODE = '42501';
  END IF;

  -- Forma del payload.
  IF p_temporada_id IS NULL THEN
    RAISE EXCEPTION 'La temporada a planificar no es válida' USING ERRCODE = '22023';
  END IF;
  IF p_grupos IS NULL OR jsonb_typeof(p_grupos) <> 'array' THEN
    RAISE EXCEPTION 'El listado de grupos debe ser un arreglo' USING ERRCODE = '22023';
  END IF;
  p_grupos_eliminados := coalesce(p_grupos_eliminados, '{}');

  -- Guardia de temporada destino (misma regla que validarTemporadaDestino) + bloqueo.
  IF p_temporada_origen_id IS NOT NULL AND p_temporada_origen_id = p_temporada_id THEN
    RAISE EXCEPTION 'La temporada a planificar no puede ser la misma que la temporada de cierre' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.activa, t.estado INTO v_temporada
  FROM public.temporadas t
  WHERE t.id = p_temporada_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La temporada a planificar no existe' USING ERRCODE = '22023';
  END IF;

  v_estado := lower(btrim(coalesce(v_temporada.estado, '')));
  IF v_temporada.activa IS TRUE OR v_estado = 'activa' THEN
    RAISE EXCEPTION 'La temporada a planificar está activa; no se puede planificar sobre la temporada en curso' USING ERRCODE = '22023';
  END IF;
  IF v_estado IN ('finalizada', 'cerrada') THEN
    RAISE EXCEPTION 'La temporada a planificar ya finalizó; no se puede planificar sobre una temporada cerrada' USING ERRCODE = '22023';
  END IF;

  -- Validación previa de todo el payload (antes de escribir nada).
  FOR v_grupo IN SELECT * FROM jsonb_array_elements(p_grupos) LOOP
    IF jsonb_typeof(v_grupo) <> 'object' THEN
      RAISE EXCEPTION 'Cada grupo debe ser un objeto' USING ERRCODE = '22023';
    END IF;

    v_clave := nullif(btrim(v_grupo->>'clave'), '');
    IF v_clave IS NULL THEN
      RAISE EXCEPTION 'Cada grupo debe traer una clave' USING ERRCODE = '22023';
    END IF;
    IF v_clave = ANY (v_claves) THEN
      RAISE EXCEPTION 'Hay grupos con la misma clave en el envío' USING ERRCODE = '22023';
    END IF;
    v_claves := v_claves || v_clave;

    IF nullif(btrim(v_grupo->>'nombre'), '') IS NULL THEN
      RAISE EXCEPTION 'Cada grupo debe tener nombre' USING ERRCODE = '22023';
    END IF;

    IF nullif(v_grupo->>'segmento_id', '') IS NULL THEN
      RAISE EXCEPTION 'Cada grupo debe tener segmento' USING ERRCODE = '22023';
    END IF;

    -- Formato de todos los campos, antes de cualquier cast (error claro 22023, no 22P02).
    IF coalesce(v_grupo->>'segmento_id', '') !~ v_re_uuid THEN
      RAISE EXCEPTION 'El grupo con clave % tiene un segmento_id con formato inválido', v_clave USING ERRCODE = '22023';
    END IF;
    IF nullif(v_grupo->>'id', '') IS NOT NULL AND (v_grupo->>'id') !~ v_re_uuid THEN
      RAISE EXCEPTION 'El grupo con clave % tiene un id con formato inválido', v_clave USING ERRCODE = '22023';
    END IF;
    v_texto := nullif(v_grupo->>'capacidad_maxima', '');
    IF v_texto IS NOT NULL AND v_texto !~ '^[0-9]{1,6}$' THEN
      RAISE EXCEPTION 'El grupo con clave % tiene una capacidad_maxima que no es un entero válido', v_clave USING ERRCODE = '22023';
    END IF;
    v_texto := nullif(v_grupo->>'dia_reunion', '');
    IF v_texto IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(enum_range(NULL::public.enum_dia_semana)) d WHERE d::text = v_texto
    ) THEN
      RAISE EXCEPTION 'El grupo con clave % tiene un dia_reunion inválido', v_clave USING ERRCODE = '22023';
    END IF;
    v_texto := nullif(btrim(v_grupo->>'hora_reunion'), '');
    IF v_texto IS NOT NULL THEN
      -- Acepta (sin espacios alrededor) 'H:MM', 'HH:MM', 'HH:MM:SS', fracciones y sufijo AM/PM ('7:30', '19:30:00.000', '7:30 PM'). La forma se
      -- valida antes del cast para rechazar literales especiales como 'now' o 'allballs'.
      IF v_texto !~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(\s*[AaPp][Mm])?$' THEN
        RAISE EXCEPTION 'El grupo con clave % tiene una hora_reunion inválida', v_clave USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM v_texto::time;
      EXCEPTION
        WHEN data_exception THEN
          RAISE EXCEPTION 'El grupo con clave % tiene una hora_reunion inválida', v_clave USING ERRCODE = '22023';
      END;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.segmentos s WHERE s.id = (v_grupo->>'segmento_id')::uuid) THEN
      RAISE EXCEPTION 'Hay un grupo con un segmento inexistente' USING ERRCODE = '22023';
    END IF;

    -- Directores de etapa: de 1 a 4, todos elegibles (regla de crear_grupo_con_director). Se lee
    -- director_etapa_ids (arreglo) o, si no viene, la clave escalar heredada director_etapa_id.
    IF v_grupo->'director_etapa_ids' IS NOT NULL AND jsonb_typeof(v_grupo->'director_etapa_ids') = 'array' THEN
      v_dir_elementos := v_grupo->'director_etapa_ids';
    ELSIF v_grupo->'director_etapa_ids' IS NOT NULL AND jsonb_typeof(v_grupo->'director_etapa_ids') <> 'null' THEN
      RAISE EXCEPTION 'El grupo con clave % tiene un director_etapa_ids que no es un arreglo', v_clave USING ERRCODE = '22023';
    ELSIF nullif(v_grupo->>'director_etapa_id', '') IS NOT NULL THEN
      v_dir_elementos := jsonb_build_array(v_grupo->'director_etapa_id');
    ELSE
      v_dir_elementos := '[]'::jsonb;
    END IF;

    -- Formato de cada elemento antes de cualquier cast (error claro 22023, no 22P02).
    FOR v_dir_elemento IN SELECT * FROM jsonb_array_elements(v_dir_elementos) LOOP
      IF jsonb_typeof(v_dir_elemento) <> 'string' OR (v_dir_elemento #>> '{}') !~ v_re_uuid THEN
        RAISE EXCEPTION 'El grupo con clave % tiene un director de etapa con formato inválido', v_clave USING ERRCODE = '22023';
      END IF;
    END LOOP;

    SELECT coalesce(array_agg(DISTINCT (e.value #>> '{}')::uuid), '{}')
    INTO v_dir_ids
    FROM jsonb_array_elements(v_dir_elementos) e;

    IF cardinality(v_dir_ids) < 1 THEN
      RAISE EXCEPTION 'El grupo con clave % requiere un director de etapa', v_clave USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_dir_ids) > 4 THEN
      RAISE EXCEPTION 'El grupo con clave % tiene más de 4 directores de etapa', v_clave USING ERRCODE = '22023';
    END IF;

    FOREACH v_dir_id IN ARRAY v_dir_ids LOOP
      SELECT sl.id INTO v_sl_id
      FROM public.segmento_lideres sl
      WHERE sl.usuario_id = v_dir_id
        AND sl.segmento_id = (v_grupo->>'segmento_id')::uuid
        AND sl.tipo_lider = 'director_etapa'
      ORDER BY sl.id
      LIMIT 1;
      IF v_sl_id IS NULL THEN
        RAISE EXCEPTION 'El director de etapa indicado para el grupo con clave % no pertenece al segmento', v_clave
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF nullif(v_grupo->>'id', '') IS NOT NULL THEN
      v_id_payload := (v_grupo->>'id')::uuid;
      IF v_id_payload = ANY (v_ids_payload) THEN
        RAISE EXCEPTION 'Hay grupos repetidos (mismo id) en el envío' USING ERRCODE = '22023';
      END IF;
      v_ids_payload := v_ids_payload || v_id_payload;
    END IF;

    IF v_grupo->'miembros' IS NOT NULL AND jsonb_typeof(v_grupo->'miembros') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION 'Los miembros de cada grupo deben ser un arreglo' USING ERRCODE = '22023';
    END IF;

    FOR v_miembro IN SELECT * FROM jsonb_array_elements(coalesce(nullif(v_grupo->'miembros', 'null'::jsonb), '[]'::jsonb)) LOOP
      IF jsonb_typeof(v_miembro) <> 'object' OR nullif(v_miembro->>'usuario_id', '') IS NULL THEN
        RAISE EXCEPTION 'Cada miembro debe traer usuario_id' USING ERRCODE = '22023';
      END IF;
      IF (v_miembro->>'usuario_id') !~ v_re_uuid THEN
        RAISE EXCEPTION 'El grupo con clave % tiene un miembro con usuario_id de formato inválido', v_clave
          USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_miembro->>'rol', '') NOT IN ('Líder', 'Colíder', 'Miembro') THEN
        RAISE EXCEPTION 'Rol de miembro inválido (use Líder, Colíder o Miembro)' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  -- El prefijo '~' está reservado para los nombres temporales del renombrado en dos fases:
  -- rechazarlo hace que el nombre temporal nunca pueda chocar con un nombre real enviado.
  SELECT btrim(g->>'nombre') INTO v_nombre
  FROM jsonb_array_elements(p_grupos) g
  WHERE btrim(g->>'nombre') LIKE '~%'
  LIMIT 1;
  IF v_nombre IS NOT NULL THEN
    RAISE EXCEPTION 'El nombre de grupo "%" no puede empezar con "~"', v_nombre USING ERRCODE = '22023';
  END IF;

  -- Nombres duplicados dentro del envío. El índice grupos_unico es UNIQUE (nombre, segmento_id,
  -- temporada_id): el alcance es el segmento dentro de la temporada. Aquí se compara sin
  -- distinguir mayúsculas ni espacios (más estricto que el índice, a propósito).
  SELECT min(btrim(g->>'nombre')) INTO v_nombre
  FROM jsonb_array_elements(p_grupos) g
  GROUP BY lower(btrim(g->>'nombre')), (g->>'segmento_id')::uuid
  HAVING count(*) > 1
  LIMIT 1;
  IF v_nombre IS NOT NULL THEN
    RAISE EXCEPTION 'Hay grupos con el nombre duplicado "%" en el mismo segmento dentro del envío', v_nombre
      USING ERRCODE = '22023';
  END IF;

  -- Choques con grupos ya existentes del destino, INCLUYENDO eliminados (el índice los cuenta).
  -- Se excluyen los grupos no eliminados que esta llamada renombra (mismo id en el envío) o da de
  -- baja (la baja renombra la fila y libera el nombre). Un grupo eliminado antes de esta función
  -- conserva su nombre original y sí bloquea.
  SELECT g.nombre, g.eliminado INTO v_nombre, v_eliminado_choque
  FROM public.grupos g
  JOIN jsonb_array_elements(p_grupos) x
    ON lower(btrim(g.nombre)) = lower(btrim(x->>'nombre'))
   AND g.segmento_id = (x->>'segmento_id')::uuid
  WHERE g.temporada_id = p_temporada_id
    AND NOT (g.eliminado = false AND g.id = ANY (v_ids_payload))
    AND NOT (g.eliminado = false AND g.id = ANY (p_grupos_eliminados))
  ORDER BY g.eliminado
  LIMIT 1;
  IF v_nombre IS NOT NULL THEN
    IF v_eliminado_choque THEN
      RAISE EXCEPTION 'Existe un grupo eliminado con el nombre "%" en el mismo segmento', v_nombre
        USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'Ya existe un grupo con el nombre "%" en el mismo segmento de la temporada a planificar', v_nombre
      USING ERRCODE = '22023';
  END IF;

  -- Una persona en a lo sumo un grupo del payload; todas deben existir.
  SELECT count(*), count(DISTINCT (m->>'usuario_id')::uuid)
  INTO v_usuarios_total, v_usuarios_distintos
  FROM jsonb_array_elements(p_grupos) g,
       jsonb_array_elements(coalesce(nullif(g->'miembros', 'null'::jsonb), '[]'::jsonb)) m;

  IF v_usuarios_total <> v_usuarios_distintos THEN
    RAISE EXCEPTION 'Hay % asignaciones de personas repetidas entre grupos; cada persona solo puede estar en un grupo',
      v_usuarios_total - v_usuarios_distintos USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_usuarios_existentes
  FROM public.usuarios u
  WHERE u.id IN (
    SELECT (m->>'usuario_id')::uuid
    FROM jsonb_array_elements(p_grupos) g,
         jsonb_array_elements(coalesce(nullif(g->'miembros', 'null'::jsonb), '[]'::jsonb)) m
  );
  IF v_usuarios_existentes <> v_usuarios_distintos THEN
    RAISE EXCEPTION 'Hay % personas asignadas que no existen', v_usuarios_distintos - v_usuarios_existentes
      USING ERRCODE = '22023';
  END IF;

  -- Bajas: deben ser grupos de la temporada destino y no estar también en el envío.
  IF EXISTS (SELECT 1 FROM unnest(p_grupos_eliminados) e WHERE e = ANY (v_ids_payload)) THEN
    RAISE EXCEPTION 'Un grupo no puede venir a la vez para guardar y para eliminar' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_grupos_eliminados) e
    WHERE NOT EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = e AND g.temporada_id = p_temporada_id)
  ) THEN
    RAISE EXCEPTION 'Solo se pueden eliminar grupos de la temporada a planificar' USING ERRCODE = '22023';
  END IF;

  -- Bajas lógicas (ya validadas como grupos del destino) ANTES de escribir: así un nombre
  -- liberado puede reutilizarse en la misma llamada.
  FOREACH v_id_eliminar IN ARRAY p_grupos_eliminados LOOP
    UPDATE public.grupos g
    SET eliminado = true,
        activo = false,
        -- El índice único cuenta las filas eliminadas: se renombra para liberar el nombre.
        nombre = g.nombre || ' [eliminado ' || substr(md5(g.id::text), 1, 8) || ']'
    WHERE g.id = v_id_eliminar
      AND g.temporada_id = p_temporada_id
      AND g.eliminado = false;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    v_eliminados := v_eliminados + v_filas;
  END LOOP;

  -- Fase 1 de renombrado: todo grupo del destino que se va a actualizar toma un nombre temporal
  -- único (corto, derivado solo del id), de modo que los nombres finales (ya validados como distintos entre sí y
  -- frente a los grupos no tocados) no choquen con el índice único sea cual sea el orden:
  -- intercambios de nombre y renombres posteriores incluidos.
  UPDATE public.grupos g
  SET nombre = '~' || substr(md5(g.id::text), 1, 12)
  WHERE g.id = ANY (v_ids_payload)
    AND g.temporada_id = p_temporada_id
    AND g.eliminado = false;

  -- Escritura (fase 2: nombres finales).
  FOR v_grupo IN SELECT * FROM jsonb_array_elements(p_grupos) LOOP
    v_clave := btrim(v_grupo->>'clave');
    v_nombre := btrim(v_grupo->>'nombre');
    v_segmento_id := (v_grupo->>'segmento_id')::uuid;
    v_capacidad := coalesce(nullif(v_grupo->>'capacidad_maxima', '')::integer, 12);
    IF v_capacidad <= 0 THEN
      v_capacidad := 12;
    END IF;

    -- Conversión tipada de día y hora con los tipos reales de las columnas.
    v_tipado := jsonb_populate_record(
      NULL::public.grupos,
      jsonb_build_object(
        'dia_reunion', coalesce(nullif(v_grupo->>'dia_reunion', ''), 'Jueves'),
        'hora_reunion', coalesce(nullif(btrim(v_grupo->>'hora_reunion'), ''), '19:30')
      )
    );

    v_existe_en_destino := false;
    v_grupo_id := nullif(v_grupo->>'id', '')::uuid;
    IF v_grupo_id IS NOT NULL THEN
      SELECT TRUE INTO v_existe_en_destino
      FROM public.grupos g
      WHERE g.id = v_grupo_id
        AND g.temporada_id = p_temporada_id
        AND g.eliminado = false;
      v_existe_en_destino := coalesce(v_existe_en_destino, false);
    END IF;

    IF v_existe_en_destino THEN
      UPDATE public.grupos g
      SET nombre = v_nombre,
          segmento_id = v_segmento_id,
          capacidad_maxima = v_capacidad,
          dia_reunion = v_tipado.dia_reunion,
          hora_reunion = v_tipado.hora_reunion,
          estado_ciclo = 'proximo',
          activo = false,
          eliminado = false
      WHERE g.id = v_grupo_id
        AND g.temporada_id = p_temporada_id;
      v_actualizados := v_actualizados + 1;
    ELSE
      INSERT INTO public.grupos (
        nombre, temporada_id, segmento_id, capacidad_maxima, dia_reunion, hora_reunion,
        estado_ciclo, estado_aprobacion, activo, eliminado, creado_por_usuario_id
      )
      VALUES (
        v_nombre, p_temporada_id, v_segmento_id, v_capacidad, v_tipado.dia_reunion, v_tipado.hora_reunion,
        'proximo', 'pendiente', false, false, v_usuario_id
      )
      RETURNING id INTO v_grupo_id;
      v_insertados := v_insertados + 1;
    END IF;

    -- Directores de etapa: mismos vínculos que crear_grupo_con_director; se concilia el conjunto del
    -- grupo (ya validado arriba): se quitan los vínculos fuera del conjunto y los duplicados de un
    -- mismo director, y se agregan los que faltan.
    SELECT coalesce(array_agg(
      (SELECT sl.id
       FROM public.segmento_lideres sl
       WHERE sl.usuario_id = d.uid
         AND sl.segmento_id = v_segmento_id
         AND sl.tipo_lider = 'director_etapa'
       ORDER BY sl.id
       LIMIT 1)
    ), '{}')
    INTO v_sl_ids
    FROM (
      SELECT DISTINCT (e.value #>> '{}')::uuid AS uid
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(v_grupo->'director_etapa_ids') = 'array' THEN v_grupo->'director_etapa_ids'
          ELSE jsonb_build_array(v_grupo->'director_etapa_id')
        END
      ) e
    ) d;

    DELETE FROM public.director_etapa_grupos deg
    USING (
      SELECT x.id, x.director_etapa_id,
             row_number() OVER (PARTITION BY x.director_etapa_id ORDER BY x.id) AS rn
      FROM public.director_etapa_grupos x
      WHERE x.grupo_id = v_grupo_id
    ) viejo
    WHERE deg.id = viejo.id
      AND (viejo.rn > 1 OR NOT (viejo.director_etapa_id = ANY (v_sl_ids)));

    INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
    SELECT v_grupo_id, s.sl_id
    FROM unnest(v_sl_ids) AS s(sl_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.director_etapa_grupos deg
      WHERE deg.grupo_id = v_grupo_id AND deg.director_etapa_id = s.sl_id
    );

    -- Miembros: conciliar contra la lista nueva (todas las escrituras filtradas por v_grupo_id,
    -- que ya es un grupo de la temporada destino).
    SELECT coalesce(array_agg((m->>'usuario_id')::uuid), '{}')
    INTO v_usuarios_grupo
    FROM jsonb_array_elements(coalesce(nullif(v_grupo->'miembros', 'null'::jsonb), '[]'::jsonb)) m;

    DELETE FROM public.grupo_miembros gm
    WHERE gm.grupo_id = v_grupo_id
      AND NOT (gm.usuario_id = ANY (v_usuarios_grupo));

    FOR v_miembro IN SELECT * FROM jsonb_array_elements(coalesce(nullif(v_grupo->'miembros', 'null'::jsonb), '[]'::jsonb)) LOOP
      UPDATE public.grupo_miembros gm
      SET rol = (v_miembro->>'rol')::public.enum_rol_grupo,
          estado = 'activo',
          fecha_salida = NULL
      WHERE gm.grupo_id = v_grupo_id
        AND gm.usuario_id = (v_miembro->>'usuario_id')::uuid;
      GET DIAGNOSTICS v_filas = ROW_COUNT;

      IF v_filas = 0 THEN
        INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_asignacion)
        VALUES (v_grupo_id, (v_miembro->>'usuario_id')::uuid, (v_miembro->>'rol')::public.enum_rol_grupo, 'activo', v_hoy);
      END IF;
    END LOOP;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object('clave', v_clave, 'id', v_grupo_id));
  END LOOP;

  RETURN jsonb_build_object(
    'grupos', v_resultado,
    'insertados', v_insertados,
    'actualizados', v_actualizados,
    'eliminados', v_eliminados
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'No se pudo guardar la planificación: un nombre de grupo o una asignación ya existe en la temporada (duplicado)'
      USING ERRCODE = '22023';
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_guardar_planificacion(uuid, uuid, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_guardar_planificacion(uuid, uuid, jsonb, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.planner_guardar_planificacion(uuid, uuid, jsonb, uuid[]) IS
  'Guarda de forma atómica la planificación de GDV en una temporada destino futura: crea/actualiza grupos planificados (proximo, inactivos), concilia sus miembros y da de baja lógica los eliminados. Actor = auth.uid(); roles admin, pastor, director-general, director-etapa.';

CREATE OR REPLACE FUNCTION public.planner_publicar_temporada(
  p_temporada_id uuid,
  p_temporada_origen_id uuid DEFAULT NULL,
  p_activar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid := auth.uid();
  v_usuario_id uuid;
  v_puede_activar boolean;
  v_temporada record;
  v_estado text;
  v_total integer;
  v_cuenta integer;
  v_nombres text;
  v_publicados integer := 0;
  v_ya_aprobados integer := 0;
  v_activados integer := 0;
  v_archivados integer := 0;
  v_origen record;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = v_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Permiso denegado para publicar la temporada' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ) THEN
    RAISE EXCEPTION 'Permiso denegado para publicar la temporada' USING ERRCODE = '42501';
  END IF;

  p_activar := coalesce(p_activar, false);
  IF p_activar THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_usuario_id
        AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
    ) INTO v_puede_activar;
    IF NOT v_puede_activar THEN
      RAISE EXCEPTION 'Permiso denegado para activar la temporada' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_temporada_id IS NULL THEN
    RAISE EXCEPTION 'La temporada a publicar no es válida' USING ERRCODE = '22023';
  END IF;

  IF p_activar THEN
    IF p_temporada_origen_id IS NULL THEN
      RAISE EXCEPTION 'Para activar se requiere la temporada de origen (la que se cierra)' USING ERRCODE = '22023';
    END IF;
    IF p_temporada_origen_id = p_temporada_id THEN
      RAISE EXCEPTION 'La temporada de origen no puede ser la misma que la temporada a activar' USING ERRCODE = '22023';
    END IF;
    -- Serializa activaciones concurrentes antes de bloquear filas.
    PERFORM pg_advisory_xact_lock(hashtext('planner_publicar_temporada'));
  END IF;

  SELECT t.id, t.activa, t.estado INTO v_temporada
  FROM public.temporadas t
  WHERE t.id = p_temporada_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La temporada a publicar no existe' USING ERRCODE = '22023';
  END IF;

  v_estado := lower(btrim(coalesce(v_temporada.estado, '')));
  IF v_estado IN ('finalizada', 'cerrada') THEN
    RAISE EXCEPTION 'La temporada ya finalizó; no se puede publicar una temporada cerrada' USING ERRCODE = '22023';
  END IF;
  IF v_temporada.activa IS TRUE OR v_estado = 'activa' THEN
    RAISE EXCEPTION 'La temporada ya está activa; solo se puede publicar una temporada en planificación' USING ERRCODE = '22023';
  END IF;

  IF p_activar THEN
    SELECT t.id INTO v_origen FROM public.temporadas t WHERE t.id = p_temporada_origen_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La temporada de origen no existe' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Bloquea los grupos de la temporada ANTES de validar, para que nada cambie entre validar y
  -- escribir. planner_guardar_planificacion y esta función ya se serializan entre sí por el lock
  -- de la fila de temporadas (guardar: FOR UPDATE de la temporada destino; aquí, arriba); este
  -- lock cubre además escrituras directas sobre los grupos.
  PERFORM 1
  FROM public.grupos g
  WHERE g.temporada_id = p_temporada_id AND g.eliminado = false
  ORDER BY g.id
  FOR UPDATE;

  -- Validación previa de todos los grupos vigentes (antes de escribir nada).
  SELECT count(*) INTO v_total
  FROM public.grupos g
  WHERE g.temporada_id = p_temporada_id
    AND g.eliminado = false
    AND g.estado_ciclo IN ('proximo', 'activo');
  IF v_total = 0 THEN
    RAISE EXCEPTION 'La temporada no tiene grupos para publicar' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), string_agg(x.nombre, ', ' ORDER BY x.nombre) FILTER (WHERE x.rn <= 10)
  INTO v_cuenta, v_nombres
  FROM (
    SELECT g.nombre, row_number() OVER (ORDER BY g.nombre) AS rn
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_id
      AND g.eliminado = false
      AND g.estado_ciclo IN ('proximo', 'activo')
      AND NOT EXISTS (
        SELECT 1 FROM public.grupo_miembros gm
        WHERE gm.grupo_id = g.id AND gm.estado = 'activo' AND gm.rol = 'Líder'
      )
  ) x;
  IF v_cuenta > 10 THEN
    v_nombres := v_nombres || ' y ' || (v_cuenta - 10) || ' más';
  END IF;
  IF v_cuenta > 0 THEN
    RAISE EXCEPTION 'Hay % grupo(s) sin líder activo: %', v_cuenta, v_nombres USING ERRCODE = '22023';
  END IF;

  SELECT count(*), string_agg(x.nombre, ', ' ORDER BY x.nombre) FILTER (WHERE x.rn <= 10)
  INTO v_cuenta, v_nombres
  FROM (
    SELECT g.nombre, row_number() OVER (ORDER BY g.nombre) AS rn
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_id
      AND g.eliminado = false
      AND g.estado_ciclo IN ('proximo', 'activo')
      AND NOT EXISTS (
        SELECT 1 FROM public.director_etapa_grupos deg WHERE deg.grupo_id = g.id
      )
  ) x;
  IF v_cuenta > 10 THEN
    v_nombres := v_nombres || ' y ' || (v_cuenta - 10) || ' más';
  END IF;
  IF v_cuenta > 0 THEN
    RAISE EXCEPTION 'Hay % grupo(s) sin director de etapa: %', v_cuenta, v_nombres USING ERRCODE = '22023';
  END IF;

  SELECT count(*), string_agg(x.nombre, ', ' ORDER BY x.nombre) FILTER (WHERE x.rn <= 10)
  INTO v_cuenta, v_nombres
  FROM (
    SELECT g.nombre, row_number() OVER (ORDER BY g.nombre) AS rn
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_id
      AND g.eliminado = false
      AND g.estado_ciclo IN ('proximo', 'activo')
      AND EXISTS (
        SELECT 1
        FROM public.director_etapa_grupos deg
        LEFT JOIN public.segmento_lideres sl
          ON sl.id = deg.director_etapa_id
         AND sl.tipo_lider = 'director_etapa'
         AND sl.segmento_id = g.segmento_id
        WHERE deg.grupo_id = g.id
          AND sl.id IS NULL
      )
  ) x;
  IF v_cuenta > 10 THEN
    v_nombres := v_nombres || ' y ' || (v_cuenta - 10) || ' más';
  END IF;
  IF v_cuenta > 0 THEN
    RAISE EXCEPTION 'Hay % grupo(s) con algún director de etapa que no es elegible para su segmento: %', v_cuenta, v_nombres
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_cuenta
  FROM (
    SELECT gm.usuario_id
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = p_temporada_id
      AND g.eliminado = false
      AND g.estado_ciclo IN ('proximo', 'activo')
      AND gm.estado = 'activo'
    GROUP BY gm.usuario_id
    HAVING count(DISTINCT gm.grupo_id) > 1
  ) d;
  IF v_cuenta > 0 THEN
    RAISE EXCEPTION 'Hay % persona(s) activas en más de un grupo de la temporada; cada persona solo puede estar en un grupo', v_cuenta
      USING ERRCODE = '22023';
  END IF;

  -- Publicar: aprobar los grupos vigentes que aún no lo están.
  SELECT count(*) FILTER (WHERE g.estado_aprobacion = 'aprobado')
  INTO v_ya_aprobados
  FROM public.grupos g
  WHERE g.temporada_id = p_temporada_id
    AND g.eliminado = false
    AND g.estado_ciclo IN ('proximo', 'activo');

  UPDATE public.grupos g
  SET estado_aprobacion = 'aprobado',
      aprobado_en = now(),
      aprobado_por = v_usuario_id,
      updated_at = now()
  WHERE g.temporada_id = p_temporada_id
    AND g.eliminado = false
    AND g.estado_ciclo IN ('proximo', 'activo')
    AND g.estado_aprobacion IS DISTINCT FROM 'aprobado';
  GET DIAGNOSTICS v_publicados = ROW_COUNT;

  IF p_activar THEN
    -- Cierra SOLO la temporada de origen y archiva sus grupos (ver cabecera).
    UPDATE public.temporadas t
    SET activa = false,
        estado = 'finalizada'
    WHERE t.id = p_temporada_origen_id;

    -- Bloqueo ordenado por id de los grupos del origen antes de archivarlos.
    PERFORM 1
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_origen_id AND g.eliminado = false
    ORDER BY g.id
    FOR UPDATE;

    UPDATE public.grupos g
    SET activo = false,
        estado_ciclo = 'archivado',
        updated_at = now()
    WHERE g.temporada_id = p_temporada_origen_id
      AND g.eliminado = false
      AND g.estado_ciclo <> 'cancelado'
      AND (g.activo IS TRUE OR g.estado_ciclo IN ('activo', 'proximo'));
    GET DIAGNOSTICS v_archivados = ROW_COUNT;

    UPDATE public.temporadas t
    SET activa = true,
        estado = 'activa'
    WHERE t.id = p_temporada_id;

    UPDATE public.grupos g
    SET estado_ciclo = 'activo',
        activo = true,
        updated_at = now()
    WHERE g.temporada_id = p_temporada_id
      AND g.eliminado = false
      AND g.estado_ciclo IN ('proximo', 'activo')
      AND g.estado_aprobacion = 'aprobado';
    GET DIAGNOSTICS v_activados = ROW_COUNT;

    IF NOT EXISTS (
      SELECT 1 FROM public.temporadas t
      WHERE t.id = p_temporada_id AND t.activa IS TRUE AND t.estado = 'activa'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.temporadas t
      WHERE t.id = p_temporada_origen_id AND t.activa IS FALSE AND t.estado = 'finalizada'
    ) OR EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.temporada_id = p_temporada_origen_id
        AND g.eliminado = false
        AND g.activo IS TRUE
        AND g.estado_ciclo = 'activo'
    ) THEN
      RAISE EXCEPTION 'No se pudo activar la temporada: el estado final de la temporada activada o de la de origen es inconsistente'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'publicados', v_publicados,
    'ya_aprobados', v_ya_aprobados,
    'activada', p_activar,
    'temporada_anterior_id', CASE WHEN p_activar THEN p_temporada_origen_id END,
    'grupos_activados', v_activados,
    'grupos_archivados', v_archivados
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_publicar_temporada(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_publicar_temporada(uuid, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.planner_publicar_temporada(uuid, uuid, boolean) IS
  'Publica de forma atómica una temporada planificada de GDV (aprueba sus grupos vigentes tras validar líder, director de etapa y unicidad de personas) y, con p_activar, la activa cerrando SOLO la temporada de origen (y archivando sus grupos). Actor = auth.uid(); publicar: admin, pastor, director-general, director-etapa; activar: admin, pastor, director-general.';
