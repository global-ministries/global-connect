-- noqa: insert-into
-- Guardado atómico de la planificación de GDV (planificador).
--
-- planner_guardar_planificacion guarda en UNA transacción los grupos planificados de
-- una temporada destino, sus miembros y las bajas, para que un fallo a mitad no deje
-- la planificación a medias (el planificador hoy lo hace con N llamadas sueltas).
--
-- Reglas:
--   * Solo admin, pastor, director-general o director-etapa (actor = auth.uid()).
--   * La temporada destino debe existir, no estar activa/finalizada/cerrada y no ser la
--     de origen. Se bloquea (FOR UPDATE) para serializar guardados concurrentes.
--   * Un grupo con id que pertenece al destino (y no eliminado) se actualiza; cualquier
--     otro (id nulo o de otra temporada, p. ej. importado del origen) se INSERTA como
--     grupo nuevo del destino. Nunca se modifica un grupo fuera de la temporada destino
--     y nunca se empareja por nombre.
--   * Los grupos planificados quedan estado_ciclo = 'proximo' y activo = false; en los
--     nuevos estado_aprobacion = 'pendiente'. En los existentes no se toca la aprobación.
--   * Cada persona puede estar a lo sumo en un grupo del payload.
--   * Todo grupo planificado exige director_etapa_id (usuarios.id). Elegibilidad = la de
--     crear_grupo_con_director: fila de segmento_lideres con ese usuario, el segmento del
--     grupo y tipo_lider = 'director_etapa'. Un director elegible puede asignarse a sí mismo.
--     El vínculo se guarda en director_etapa_grupos (director_etapa_id = segmento_lideres.id).
--   * Nombres: no se permiten duplicados (sin distinguir mayúsculas ni espacios) dentro del
--     envío ni contra grupos no eliminados del destino.
--   * DECISIÓN DE PRODUCTO (confirmada por el usuario): el planificador NO limita por segmento
--     a director-general ni a director-etapa; la autorización es solo por rol. A diferencia de
--     puede_crear_grupo, aquí no se exige que el segmento les esté asignado.

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
  v_vinculos integer;
  v_vinculo_ok boolean;
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
    IF NOT EXISTS (SELECT 1 FROM public.segmentos s WHERE s.id = (v_grupo->>'segmento_id')::uuid) THEN
      RAISE EXCEPTION 'Hay un grupo con un segmento inexistente' USING ERRCODE = '22023';
    END IF;

    -- Director de etapa obligatorio y elegible (regla de crear_grupo_con_director).
    IF nullif(v_grupo->>'director_etapa_id', '') IS NULL THEN
      RAISE EXCEPTION 'El grupo con clave % requiere un director de etapa', v_clave USING ERRCODE = '22023';
    END IF;
    SELECT sl.id INTO v_sl_id
    FROM public.segmento_lideres sl
    WHERE sl.usuario_id = (v_grupo->>'director_etapa_id')::uuid
      AND sl.segmento_id = (v_grupo->>'segmento_id')::uuid
      AND sl.tipo_lider = 'director_etapa'
    LIMIT 1;
    IF v_sl_id IS NULL THEN
      RAISE EXCEPTION 'El director de etapa indicado para el grupo con clave % no pertenece al segmento', v_clave
        USING ERRCODE = '22023';
    END IF;

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
      IF nullif(v_miembro->>'usuario_id', '') IS NULL THEN
        RAISE EXCEPTION 'Cada miembro debe traer usuario_id' USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_miembro->>'rol', '') NOT IN ('Líder', 'Colíder', 'Miembro') THEN
        RAISE EXCEPTION 'Rol de miembro inválido (use Líder, Colíder o Miembro)' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  -- Nombres duplicados dentro del envío.
  SELECT min(btrim(g->>'nombre')) INTO v_nombre
  FROM jsonb_array_elements(p_grupos) g
  GROUP BY lower(btrim(g->>'nombre'))
  HAVING count(*) > 1
  LIMIT 1;
  IF v_nombre IS NOT NULL THEN
    RAISE EXCEPTION 'Hay grupos con el nombre duplicado "%" en el envío', v_nombre USING ERRCODE = '22023';
  END IF;

  -- Nombres que chocan con grupos no eliminados del destino (salvo los que se guardan con su
  -- mismo id —se renombran— o se eliminan en esta misma llamada).
  SELECT g.nombre INTO v_nombre
  FROM public.grupos g
  WHERE g.temporada_id = p_temporada_id
    AND g.eliminado = false
    AND NOT (g.id = ANY (v_ids_payload))
    AND NOT (g.id = ANY (p_grupos_eliminados))
    AND lower(btrim(g.nombre)) IN (SELECT lower(btrim(x->>'nombre')) FROM jsonb_array_elements(p_grupos) x)
  LIMIT 1;
  IF v_nombre IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe un grupo con el nombre "%" en la temporada a planificar', v_nombre USING ERRCODE = '22023';
  END IF;

  -- Una persona en a lo sumo un grupo del payload; todas deben existir.
  SELECT count(*), count(DISTINCT m->>'usuario_id')
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

  -- Escritura.
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
        'hora_reunion', coalesce(nullif(v_grupo->>'hora_reunion', ''), '19:30')
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

    -- Director de etapa: mismo vínculo que crear_grupo_con_director; se reemplaza si cambió.
    SELECT sl.id INTO v_sl_id
    FROM public.segmento_lideres sl
    WHERE sl.usuario_id = (v_grupo->>'director_etapa_id')::uuid
      AND sl.segmento_id = v_segmento_id
      AND sl.tipo_lider = 'director_etapa'
    LIMIT 1;

    SELECT count(*), coalesce(bool_and(deg.director_etapa_id = v_sl_id), false)
    INTO v_vinculos, v_vinculo_ok
    FROM public.director_etapa_grupos deg
    WHERE deg.grupo_id = v_grupo_id;

    IF NOT (v_vinculos = 1 AND v_vinculo_ok) THEN
      DELETE FROM public.director_etapa_grupos deg WHERE deg.grupo_id = v_grupo_id;
      INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
      VALUES (v_grupo_id, v_sl_id);
    END IF;

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

  -- Bajas lógicas (ya validadas como grupos del destino).
  FOREACH v_id_eliminar IN ARRAY p_grupos_eliminados LOOP
    UPDATE public.grupos g
    SET eliminado = true,
        activo = false
    WHERE g.id = v_id_eliminar
      AND g.temporada_id = p_temporada_id
      AND g.eliminado = false;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    v_eliminados := v_eliminados + v_filas;
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

-- Directores de etapa elegibles para asignar a un grupo planificado: una fila por
-- (persona, segmento), con la misma regla que crear_grupo_con_director (segmento_lideres,
-- tipo_lider = 'director_etapa'). El planificador filtra por el segmento del grupo.
-- Mismos roles que planner_guardar_planificacion (sin límite por segmento, ver arriba).
CREATE OR REPLACE FUNCTION public.planner_directores_etapa_elegibles()
RETURNS TABLE (id uuid, nombre text, apellido text, segmento_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid := auth.uid();
  v_usuario_id uuid;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = v_auth_id;
  IF v_usuario_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ) THEN
    RAISE EXCEPTION 'Permiso denegado para consultar directores de etapa' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT u.id, u.nombre::text, u.apellido::text, sl.segmento_id
  FROM public.segmento_lideres sl
  JOIN public.usuarios u ON u.id = sl.usuario_id
  WHERE sl.tipo_lider = 'director_etapa'
  ORDER BY u.apellido::text, u.nombre::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_directores_etapa_elegibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_directores_etapa_elegibles() TO authenticated, service_role;
