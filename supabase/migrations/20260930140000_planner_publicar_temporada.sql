-- noqa: insert-into
-- Publicación (y activación opcional) atómica de una temporada planificada de GDV.
--
-- planner_publicar_temporada reemplaza al flujo de N llamadas sueltas del planificador
-- (aprobar grupos + activar temporada, donde un fallo a mitad dejaba la temporada a medias
-- y el error al activar solo se registraba como aviso).
--
-- Reglas:
--   * Publicar: admin, pastor, director-general o director-etapa. Activar (p_activar = true):
--     SOLO admin, pastor o director-general. Actor = auth.uid().
--   * Se bloquea (FOR UPDATE) la temporada destino. Debe existir, no estar finalizada/cerrada y
--     no ser la temporada activa. Al activar, además se serializa con un lock de transacción para
--     que dos activaciones concurrentes no dejen dos temporadas activas.
--   * "Grupos vigentes" = no eliminados y con estado_ciclo 'proximo' o 'activo' (los cancelados o
--     archivados no se validan, no se publican y no se activan).
--   * Antes de escribir se validan TODOS los grupos vigentes: al menos un grupo; cada grupo con
--     >= 1 miembro activo con rol 'Líder'; cada grupo con exactamente un vínculo en
--     director_etapa_grupos hacia una fila de segmento_lideres tipo 'director_etapa' del segmento
--     del grupo (misma elegibilidad que planner_guardar_planificacion); ninguna persona activa en
--     dos grupos de la temporada. Los mensajes llevan conteos y nombres de grupo, nunca datos de
--     personas.
--   * Publicar: estado_aprobacion = 'aprobado', aprobado_en = now(), aprobado_por = usuarios.id del
--     actor, solo en los grupos aún no aprobados. Sin activar, los grupos siguen 'proximo'/inactivos.
--   * Activar: las demás temporadas activas pasan a activa = false, estado = 'finalizada'; esta
--     pasa a activa = true, estado = 'activa'; sus grupos vigentes quedan estado_ciclo = 'activo',
--     activo = true. Al final se verifica que haya exactamente una temporada activa.
--   * DECISIÓN DEL USUARIO (refleja el precedente del backfill 20260312_003): al activar, los grupos
--     de las temporadas cerradas (no eliminados, no cancelados, con activo = true o estado_ciclo
--     'activo'/'proximo') pasan a activo = false, estado_ciclo = 'archivado'. No se tocan los
--     eliminados ni cancelados, ni grupo_miembros, director_etapa_grupos ni casas (historial intacto).
--     'grupos_archivados' devuelve la cantidad real. Publicar sin activar nunca toca grupos de otras
--     temporadas y deja los de esta en 'proximo' / inactivos.

CREATE OR REPLACE FUNCTION public.planner_publicar_temporada(
  p_temporada_id uuid,
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
  v_anteriores uuid[] := '{}';
  v_anterior_id uuid;
  v_activas integer;
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

  -- Serializa activaciones concurrentes (evita dos temporadas activas) antes de bloquear filas.
  IF p_activar THEN
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
      AND (
        SELECT count(*) FROM public.director_etapa_grupos deg WHERE deg.grupo_id = g.id
      ) <> 1
  ) x;
  IF v_cuenta > 10 THEN
    v_nombres := v_nombres || ' y ' || (v_cuenta - 10) || ' más';
  END IF;
  IF v_cuenta > 0 THEN
    RAISE EXCEPTION 'Hay % grupo(s) sin exactamente un director de etapa: %', v_cuenta, v_nombres USING ERRCODE = '22023';
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
        SELECT 1
        FROM public.director_etapa_grupos deg
        JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
        WHERE deg.grupo_id = g.id
          AND sl.tipo_lider = 'director_etapa'
          AND sl.segmento_id = g.segmento_id
      )
  ) x;
  IF v_cuenta > 10 THEN
    v_nombres := v_nombres || ' y ' || (v_cuenta - 10) || ' más';
  END IF;
  IF v_cuenta > 0 THEN
    RAISE EXCEPTION 'Hay % grupo(s) con un director de etapa que no es elegible para su segmento: %', v_cuenta, v_nombres
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
    -- Cierra las demás temporadas activas y archiva sus grupos (ver cabecera).
    SELECT coalesce(array_agg(x.id ORDER BY x.fecha_fin DESC NULLS LAST, x.id), '{}')
    INTO v_anteriores
    FROM (
      SELECT t.id, t.fecha_fin
      FROM public.temporadas t
      WHERE t.id <> p_temporada_id
        AND (t.activa IS TRUE OR lower(btrim(coalesce(t.estado, ''))) = 'activa')
      ORDER BY t.id
      FOR UPDATE
    ) x;

    IF array_length(v_anteriores, 1) IS NOT NULL THEN
      v_anterior_id := v_anteriores[1];
      UPDATE public.temporadas t
      SET activa = false,
          estado = 'finalizada'
      WHERE t.id = ANY (v_anteriores);

      -- Bloqueo ordenado por id de los grupos de las temporadas cerradas antes de archivarlos.
      PERFORM 1
      FROM public.grupos g
      WHERE g.temporada_id = ANY (v_anteriores) AND g.eliminado = false
      ORDER BY g.id
      FOR UPDATE;

      UPDATE public.grupos g
      SET activo = false,
          estado_ciclo = 'archivado',
          updated_at = now()
      WHERE g.temporada_id = ANY (v_anteriores)
        AND g.eliminado = false
        AND g.estado_ciclo <> 'cancelado'
        AND (g.activo IS TRUE OR g.estado_ciclo IN ('activo', 'proximo'));
      GET DIAGNOSTICS v_archivados = ROW_COUNT;

      IF EXISTS (
        SELECT 1 FROM public.grupos g
        WHERE g.temporada_id = ANY (v_anteriores)
          AND g.eliminado = false
          AND g.activo IS TRUE
          AND g.estado_ciclo = 'activo'
      ) THEN
        RAISE EXCEPTION 'No se pudo activar la temporada: quedaron grupos activos en temporadas cerradas'
          USING ERRCODE = '55000';
      END IF;
    END IF;

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

    SELECT count(*) INTO v_activas
    FROM public.temporadas t
    WHERE t.activa IS TRUE OR lower(btrim(coalesce(t.estado, ''))) = 'activa';
    IF v_activas <> 1 OR NOT EXISTS (
      SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id AND t.activa IS TRUE
    ) THEN
      RAISE EXCEPTION 'No se pudo activar la temporada: debe quedar exactamente una temporada activa (hay %)', v_activas
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'publicados', v_publicados,
    'ya_aprobados', v_ya_aprobados,
    'activada', p_activar,
    'temporada_anterior_id', v_anterior_id,
    'grupos_activados', v_activados,
    'grupos_archivados', v_archivados
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_publicar_temporada(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_publicar_temporada(uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.planner_publicar_temporada(uuid, boolean) IS
  'Publica de forma atómica una temporada planificada de GDV (aprueba sus grupos vigentes tras validar líder, director de etapa y unicidad de personas) y, con p_activar, la activa cerrando la temporada activa anterior. Actor = auth.uid(); publicar: admin, pastor, director-general, director-etapa; activar: admin, pastor, director-general.';
