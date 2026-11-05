-- noqa: insert-into
-- Planificador de GDV: crear temporada, bloqueos, "Terminé mi segmento" y publicar
-- (T3 de odd/tasks/planner-gdv.md; S6, S8, S12, S14, S16, S17, S18, S19, S20).
--
-- Por qué: el planificador viejo publicaba con planner_publicar_temporada(destino, origen, activar),
-- donde el cliente elegía la temporada que se cerraba, y no tenía marca de segmento terminado ni el
-- bloqueo por localidad. Esa RPC (y planner_guardar_planificacion) siguen intactas porque
-- planner.yosoyglobal.org las usa en producción; estas funciones son nuevas.
--
-- Qué crea:
--   1. planner_crear_temporada(nombre, inicio, fin) → jsonb (S18, S20): admin, pastor y director
--      general. Nombre sin espacios repetidos, único sin distinguir mayúsculas, tildes, espacios ni
--      signos ("2026-II" = "2026 II" = "2026 - ii"), con cohorte I o II (planner_cohorte, S19); fin
--      posterior al inicio; inicio posterior al de la última temporada de su cohorte (si no, se
--      volvería el origen de una existente y publicar cerraría la equivocada). Nace 'planificacion'
--      e inactiva. Devuelve su cohorte y su origen.
--   2. planner_bloqueos_temporada(temporada) → bloqueos de todos los segmentos. Interna.
--   3. planner_bloqueos(temporada) → los mismos bloqueos, limitados a los segmentos del actor
--      (director de etapa: los suyos, S10). Tipos (S6):
--        sin_lider              ningún 'Líder' vigente;
--        sin_director           ningún vínculo director_etapa_grupos con un director_etapa del
--                               segmento del grupo (uno de otro segmento no cuenta);
--        sin_localidad          localidad_id NULL;
--        persona_en_dos_grupos  una persona vigente en 2 o más grupos de la temporada: una fila por
--                               persona y grupo.
--      Grupos vigentes de la temporada = no eliminados y con estado_ciclo 'proximo' o 'activo', como
--      planner_publicar_temporada: un grupo 'cancelado' o 'archivado' del destino no se valida, no
--      cuenta para marcar ni publicar y publicar no lo aprueba ni lo activa. Membresía vigente =
--      fecha_salida NULL y estado distinto de 'inactivo' o 'eliminado' (T1, T2).
--   4. planner_marcar_segmento(temporada, segmento, terminado) → jsonb (S14): quien edita el
--      segmento (su director de etapa, o admin, pastor, director general). Marcar exige que el
--      segmento tenga grupos y 0 bloqueos (22023 con la cuenta); desmarcar siempre. Escribe
--      planner_segmentos_terminados (marcado_por = actor; marcar lo ya marcado conserva quién y
--      cuándo).
--   5. planner_estado_publicacion(temporada) → jsonb (S16): bloqueos por tipo, segmentos con grupos
--      y su marca (quién, cuándo), faltan_segmentos, puede_publicar, origen por cohorte con los grupos
--      que se archivarían y otras temporadas activas que no se tocan.
--   6. planner_publicar(temporada) → jsonb (S8, S12, S19): admin, pastor y director general.
--
-- Publicar, en una transacción:
--   * Serializa con el planificador viejo (pg_advisory_xact_lock(hashtext('planner_publicar_temporada')),
--     el mismo lock) y con los pasos de T2 de la temporada (hashtextextended('planner_pasos:' || id, 0)),
--     y bloquea la fila de la temporada, la del origen y los grupos de ambas antes de validar.
--   * Exige estado 'planificacion' (activa puede ser true: 2026-II en producción), al menos un grupo vigente,
--     0 bloqueos en TODOS los segmentos (sin importar el alcance del actor) y todos los segmentos con
--     grupos marcados como terminados (22023 con las cuentas).
--   * Destino: activa, estado 'activa'; sus grupos vigentes activo true, estado_ciclo 'activo' y aprobados
--     (aprobado_por = actor y aprobado_en = now() solo en los que no lo estaban, como el RPC viejo).
--   * Origen = planner_temporada_origen (la anterior de la misma cohorte, S19): inactiva, 'finalizada'
--     y sus grupos no eliminados archivados (activo false; estado_ciclo 'archivado', salvo
--     'cancelado', que se queda así), aunque ya estuviera finalizada (2025-II en producción, S8). Sin
--     origen (primera de su cohorte o sin cohorte) no se cierra nada.
--   * Ninguna otra temporada se toca: la otra cohorte sigue corriendo. Las membresías tampoco.
--   * Comprueba el estado final como el RPC viejo (55000 si es inconsistente).
--
-- Pasos (T2): marcar, desmarcar y publicar NO se registran en planner_pasos. Un paso sin grupos ni
-- personas no choca con nada, saldría deshacible y su deshacer no revertiría nada; además
-- planner_paso_registrar borra las marcas de los segmentos que toca. La marca guarda quién y cuándo
-- en planner_segmentos_terminados, y publicar queda en grupos.aprobado_por/aprobado_en. S17 sigue
-- igual: cualquier paso posterior que toca un grupo del segmento borra su marca. Después de publicar
-- la temporada ya no está en planificación, así que ningún paso se puede hacer ni deshacer.
-- Por eso no cambia el CHECK de planner_pasos.accion.
--
-- Copiar los grupos del origen (S18, paso 4) no está aquí: un paso que crea grupos con sus líderes
-- nunca se podría deshacer con planner_deshacer_paso (rechaza deshacer un alta con personas). El
-- cliente lo hace con planner_crear_grupo y planner_mover_personas, un paso deshacible por grupo.
--
-- Errores: 28000 sin sesión, 42501 permiso, 22023 validación, 55000 estado final inconsistente.
--
-- Blast radius: funciones nuevas. Escribe temporadas (crear y publicar), grupos (publicar) y
-- planner_segmentos_terminados (marcar). No cambia tablas, políticas ni funciones existentes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.planner_publicar(uuid);
--   DROP FUNCTION IF EXISTS public.planner_estado_publicacion(uuid);
--   DROP FUNCTION IF EXISTS public.planner_marcar_segmento(uuid, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.planner_bloqueos(uuid);
--   DROP FUNCTION IF EXISTS public.planner_bloqueos_temporada(uuid);
--   DROP FUNCTION IF EXISTS public.planner_crear_temporada(text, date, date);

CREATE OR REPLACE FUNCTION public.planner_crear_temporada(p_nombre text, p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_nombre text;
  v_choque text;
  v_ultima record;
  v_id uuid := gen_random_uuid();
  v_origen record;
BEGIN
  SELECT a.usuario_id, a.roles INTO v_actor FROM public.planner_alcance_actor() a;
  IF NOT (v_actor.roles && ARRAY['admin', 'pastor', 'director-general']) THEN
    RAISE EXCEPTION 'Solo el director general, un pastor o un administrador pueden crear temporadas' USING ERRCODE = '42501';
  END IF;

  v_nombre := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'La temporada debe tener nombre' USING ERRCODE = '22023';
  END IF;
  IF length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'El nombre de la temporada puede tener hasta 80 caracteres' USING ERRCODE = '22023';
  END IF;
  IF public.planner_cohorte(v_nombre) IS NULL THEN
    RAISE EXCEPTION 'El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I»'
      USING ERRCODE = '22023';
  END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL THEN
    RAISE EXCEPTION 'Indica la fecha de inicio y la de fin' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_fin <= p_fecha_inicio THEN
    RAISE EXCEPTION 'La fecha de fin debe ser posterior a la de inicio' USING ERRCODE = '22023';
  END IF;

  -- Serializa altas concurrentes para que las comprobaciones de nombre y fecha sean firmes.
  PERFORM pg_advisory_xact_lock(hashtext('planner_crear_temporada'));
  -- Nombre único sin signos, espacios, mayúsculas ni tildes: "2026 II", "2026-II" y "2026 - ii" son
  -- la misma temporada (B1: una variante robaría el origen de la existente, S19).
  SELECT t.nombre INTO v_choque
    FROM public.temporadas t
   WHERE translate(lower(regexp_replace(t.nombre, '[^[:alnum:]]+', '', 'g')), 'áéíóúüñ', 'aeiouun')
       = translate(lower(regexp_replace(v_nombre, '[^[:alnum:]]+', '', 'g')), 'áéíóúüñ', 'aeiouun')
   ORDER BY t.fecha_inicio, t.id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una temporada llamada «%»', v_choque USING ERRCODE = '22023';
  END IF;
  -- Una temporada nueva empieza después de la última de su cohorte: si no, sería el origen de una
  -- existente y publicar esa existente cerraría la nueva en vez de la anterior (S8, S19).
  SELECT t.nombre, t.fecha_inicio::date AS inicio INTO v_ultima
    FROM public.temporadas t
   WHERE public.planner_cohorte(t.nombre) = public.planner_cohorte(v_nombre)
   ORDER BY t.fecha_inicio DESC, t.id
   LIMIT 1;
  IF FOUND AND p_fecha_inicio <= v_ultima.inicio THEN
    RAISE EXCEPTION 'La temporada debe empezar después del %, inicio de «%», la última de la cohorte %',
      to_char(v_ultima.inicio, 'YYYY-MM-DD'), v_ultima.nombre, public.planner_cohorte(v_nombre)
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado)
  VALUES (v_id, v_nombre, p_fecha_inicio, p_fecha_fin, false, 'planificacion');

  SELECT o.id, o.nombre INTO v_origen FROM public.temporadas o WHERE o.id = public.planner_temporada_origen(v_id);

  RETURN jsonb_build_object(
    'id', v_id,
    'nombre', v_nombre,
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
    'estado', 'planificacion',
    'activa', false,
    'cohorte', public.planner_cohorte(v_nombre),
    'origen', CASE WHEN v_origen.id IS NOT NULL THEN jsonb_build_object('id', v_origen.id, 'nombre', v_origen.nombre) END
  );
END;
$function$;

COMMENT ON FUNCTION public.planner_crear_temporada(text, date, date) IS
  'Planificador de GDV (S18, S20): crea una temporada en planificación e inactiva. Admin, pastor y director general (42501 el resto). '
  'Nombre único sin distinguir mayúsculas, tildes, espacios ni signos y con cohorte I o II (S19); fin posterior al inicio; inicio posterior '
  'al de la última temporada de su cohorte (22023). Devuelve cohorte y origen.';

REVOKE ALL ON FUNCTION public.planner_crear_temporada(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_crear_temporada(text, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_bloqueos_temporada(p_temporada_id uuid)
RETURNS TABLE (tipo text, segmento_id uuid, grupo_id uuid, grupo_nombre text, usuario_id uuid, detalle text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH g AS MATERIALIZED (
    SELECT g.id, g.nombre, g.segmento_id, g.localidad_id
      FROM public.grupos g
     WHERE g.temporada_id = p_temporada_id
       AND NOT g.eliminado
       AND g.estado_ciclo IN ('proximo', 'activo')
  ),
  m AS MATERIALIZED (
    SELECT gm.grupo_id, gm.usuario_id, gm.rol::text AS rol
      FROM public.grupo_miembros gm
      JOIN g ON g.id = gm.grupo_id
     WHERE gm.fecha_salida IS NULL
       AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado')
  ),
  dobles AS (
    SELECT m.usuario_id FROM m GROUP BY m.usuario_id HAVING count(DISTINCT m.grupo_id) > 1
  ),
  b AS (
    SELECT 1 AS orden, 'sin_lider' AS tipo, g.segmento_id, g.id AS grupo_id, g.nombre AS grupo_nombre,
           NULL::uuid AS usuario_id, NULL::text AS persona, 'No tiene líder' AS detalle
      FROM g
     WHERE NOT EXISTS (SELECT 1 FROM m WHERE m.grupo_id = g.id AND m.rol = 'Líder')
    UNION ALL
    SELECT 2, 'sin_director', g.segmento_id, g.id, g.nombre, NULL, NULL,
           'No tiene director de etapa de ' || s.nombre
      FROM g
      JOIN public.segmentos s ON s.id = g.segmento_id
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.director_etapa_grupos d
         JOIN public.segmento_lideres sl
           ON sl.id = d.director_etapa_id AND sl.tipo_lider = 'director_etapa' AND sl.segmento_id = g.segmento_id
        WHERE d.grupo_id = g.id)
    UNION ALL
    SELECT 3, 'sin_localidad', g.segmento_id, g.id, g.nombre, NULL, NULL, 'No tiene localidad'
      FROM g
     WHERE g.localidad_id IS NULL
    UNION ALL
    SELECT 4, 'persona_en_dos_grupos', g.segmento_id, g.id, g.nombre, m.usuario_id, u.apellido || ' ' || u.nombre,
           u.nombre || ' ' || u.apellido || ' también está en ' || public.planner_paso_lista(ARRAY(
             SELECT o.nombre FROM m x JOIN g o ON o.id = x.grupo_id
              WHERE x.usuario_id = m.usuario_id AND x.grupo_id <> m.grupo_id
              ORDER BY o.nombre, o.id))
      FROM m
      JOIN dobles d ON d.usuario_id = m.usuario_id
      JOIN g ON g.id = m.grupo_id
      JOIN public.usuarios u ON u.id = m.usuario_id
  )
  SELECT b.tipo, b.segmento_id, b.grupo_id, b.grupo_nombre, b.usuario_id, b.detalle
    FROM b
    JOIN public.segmentos s ON s.id = b.segmento_id
   ORDER BY b.orden, s.nombre, b.grupo_nombre, b.grupo_id, b.persona, b.usuario_id;
$function$;

COMMENT ON FUNCTION public.planner_bloqueos_temporada(uuid) IS
  'Interna del planificador: bloqueos de publicación (S6) de los grupos vigentes (no eliminados, proximo o activo) de la temporada: sin_lider, sin_director, '
  'sin_localidad, persona_en_dos_grupos (una fila por persona y grupo). No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_bloqueos_temporada(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_bloqueos_temporada(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.planner_bloqueos(p_temporada_id uuid)
RETURNS TABLE (tipo text, segmento_id uuid, grupo_id uuid, grupo_nombre text, usuario_id uuid, detalle text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_actor record;
BEGIN
  SELECT a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.tipo, b.segmento_id, b.grupo_id, b.grupo_nombre, b.usuario_id, b.detalle
    FROM public.planner_bloqueos_temporada(p_temporada_id) WITH ORDINALITY b(tipo, segmento_id, grupo_id, grupo_nombre, usuario_id, detalle, n)
   WHERE v_actor.ve_todo OR b.segmento_id = ANY (v_actor.segmentos)
   ORDER BY b.n;
END;
$function$;

COMMENT ON FUNCTION public.planner_bloqueos(uuid) IS
  'Planificador de GDV (S6): bloqueos de publicación de los grupos que el actor ve (director de etapa: sus segmentos, S10): sin_lider, '
  'sin_director, sin_localidad, persona_en_dos_grupos (una fila por persona y grupo). 22023 si la temporada no existe.';

REVOKE ALL ON FUNCTION public.planner_bloqueos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_bloqueos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_marcar_segmento(p_temporada_id uuid, p_segmento_id uuid, p_terminado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_estado text;
  v_segmento_nombre text;
  v_bloqueos integer;
  v_marca record;
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  -- El mismo lock que los pasos de T2: ninguna marca se cruza con un paso en curso (S17).
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || p_temporada_id::text, 0));
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = p_temporada_id FOR SHARE;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'La temporada no está en planificación' USING ERRCODE = '22023';
  END IF;
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = p_segmento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El segmento no existe' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_actor.ve_todo OR p_segmento_id = ANY (v_actor.segmentos)) THEN
    RAISE EXCEPTION 'No puedes marcar %: no es uno de tus segmentos', v_segmento_nombre USING ERRCODE = '42501';
  END IF;
  IF p_terminado IS NULL THEN
    RAISE EXCEPTION 'Indica si el segmento está terminado' USING ERRCODE = '22023';
  END IF;

  IF p_terminado THEN
    IF NOT EXISTS (SELECT 1 FROM public.grupos g
                    WHERE g.temporada_id = p_temporada_id AND g.segmento_id = p_segmento_id AND NOT g.eliminado
                      AND g.estado_ciclo IN ('proximo', 'activo')) THEN
      RAISE EXCEPTION '% no tiene grupos en esta temporada', v_segmento_nombre USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_bloqueos FROM public.planner_bloqueos_temporada(p_temporada_id) b WHERE b.segmento_id = p_segmento_id;
    IF v_bloqueos > 0 THEN
      RAISE EXCEPTION 'No puedes marcar % como terminado: tiene % por resolver', v_segmento_nombre,
        v_bloqueos || CASE WHEN v_bloqueos = 1 THEN ' bloqueo' ELSE ' bloqueos' END
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.planner_segmentos_terminados (temporada_id, segmento_id, marcado_por)
    VALUES (p_temporada_id, p_segmento_id, v_actor.usuario_id)
    ON CONFLICT (temporada_id, segmento_id) DO NOTHING;
  ELSE
    DELETE FROM public.planner_segmentos_terminados t WHERE t.temporada_id = p_temporada_id AND t.segmento_id = p_segmento_id;
  END IF;

  SELECT t.marcado_por, t.marcado_en, nullif(btrim(u.nombre || ' ' || u.apellido), '') AS nombre INTO v_marca
    FROM public.planner_segmentos_terminados t
    LEFT JOIN public.usuarios u ON u.id = t.marcado_por
   WHERE t.temporada_id = p_temporada_id AND t.segmento_id = p_segmento_id;

  RETURN jsonb_build_object(
    'temporada_id', p_temporada_id,
    'segmento_id', p_segmento_id,
    'segmento_nombre', v_segmento_nombre,
    'terminado', p_terminado,
    'marcado_por', v_marca.marcado_por,
    'marcado_por_nombre', v_marca.nombre,
    'marcado_en', v_marca.marcado_en
  );
END;
$function$;

COMMENT ON FUNCTION public.planner_marcar_segmento(uuid, uuid, boolean) IS
  'Planificador de GDV (S14): marca o desmarca "Terminé mi segmento". Quien edita el segmento (su director de etapa, admin, pastor o director '
  'general; 42501 el resto). Marcar exige temporada en planificación, grupos en el segmento y 0 bloqueos (22023 con la cuenta); desmarcar '
  'siempre. No registra paso; cualquier paso posterior en el segmento borra la marca (S17).';

REVOKE ALL ON FUNCTION public.planner_marcar_segmento(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_marcar_segmento(uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_estado_publicacion(p_temporada_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_temporada record;
  v_origen_id uuid;
  v_dirige boolean;
  v_bloqueos jsonb;
  v_segmentos jsonb;
  v_grupos integer;
  v_con_grupos integer;
  v_terminados integer;
BEGIN
  SELECT a.roles INTO v_actor FROM public.planner_alcance_actor() a;
  SELECT t.id, t.nombre, t.estado, t.activa INTO v_temporada FROM public.temporadas t WHERE t.id = p_temporada_id;
  IF NOT FOUND OR p_temporada_id IS NULL THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  v_dirige := v_actor.roles && ARRAY['admin', 'pastor', 'director-general'];
  v_origen_id := public.planner_temporada_origen(p_temporada_id);

  -- Bloqueos de toda la temporada: publicar los exige en 0 sin importar el alcance del actor.
  SELECT jsonb_build_object(
           'total', count(*),
           'sin_lider', count(*) FILTER (WHERE b.tipo = 'sin_lider'),
           'sin_director', count(*) FILTER (WHERE b.tipo = 'sin_director'),
           'sin_localidad', count(*) FILTER (WHERE b.tipo = 'sin_localidad'),
           'persona_en_dos_grupos', count(*) FILTER (WHERE b.tipo = 'persona_en_dos_grupos'))
    INTO v_bloqueos
    FROM public.planner_bloqueos_temporada(p_temporada_id) b;

  WITH seg AS (
    SELECT g.segmento_id, count(*) AS grupos
      FROM public.grupos g
     WHERE g.temporada_id = p_temporada_id AND NOT g.eliminado AND g.estado_ciclo IN ('proximo', 'activo')
     GROUP BY g.segmento_id
  ),
  blq AS (
    SELECT b.segmento_id, count(*) AS n FROM public.planner_bloqueos_temporada(p_temporada_id) b GROUP BY b.segmento_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nombre', s.nombre,
           'grupos', seg.grupos,
           'bloqueos', coalesce(blq.n, 0),
           'terminado', t.segmento_id IS NOT NULL,
           'marcado_por', CASE WHEN t.segmento_id IS NOT NULL AND t.marcado_por IS NOT NULL THEN
                            jsonb_build_object('id', t.marcado_por, 'nombre', nullif(btrim(u.nombre || ' ' || u.apellido), ''))
                          END,
           'marcado_en', t.marcado_en
         ) ORDER BY s.nombre, s.id), '[]'::jsonb),
         coalesce(sum(seg.grupos), 0)::integer,
         count(*)::integer,
         count(t.segmento_id)::integer
    INTO v_segmentos, v_grupos, v_con_grupos, v_terminados
    FROM seg
    JOIN public.segmentos s ON s.id = seg.segmento_id
    LEFT JOIN blq ON blq.segmento_id = seg.segmento_id
    LEFT JOIN public.planner_segmentos_terminados t ON t.temporada_id = p_temporada_id AND t.segmento_id = seg.segmento_id
    LEFT JOIN public.usuarios u ON u.id = t.marcado_por;

  RETURN jsonb_build_object(
    'temporada', jsonb_build_object('id', v_temporada.id, 'nombre', v_temporada.nombre, 'estado', v_temporada.estado,
                                    'activa', v_temporada.activa, 'cohorte', public.planner_cohorte(v_temporada.nombre)),
    'bloqueos', v_bloqueos,
    'grupos', v_grupos,
    'segmentos', v_segmentos,
    'segmentos_con_grupos', v_con_grupos,
    'segmentos_terminados', v_terminados,
    'faltan_segmentos', v_con_grupos - v_terminados,
    'rol_puede_publicar', v_dirige,
    'puede_publicar', v_dirige
                      AND lower(btrim(coalesce(v_temporada.estado, ''))) = 'planificacion'
                      AND v_grupos > 0
                      AND (v_bloqueos->>'total')::integer = 0
                      AND v_con_grupos = v_terminados,
    'origen', (
      SELECT jsonb_build_object(
               'id', o.id, 'nombre', o.nombre, 'estado', o.estado, 'activa', o.activa,
               -- Los mismos que archiva planner_publicar.
               'grupos_a_archivar', (SELECT count(*) FROM public.grupos g
                                      WHERE g.temporada_id = o.id AND NOT g.eliminado
                                        AND (g.activo OR g.estado_ciclo NOT IN ('archivado', 'cancelado'))))
        FROM public.temporadas o WHERE o.id = v_origen_id
    ),
    'otras_activas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre, 'cohorte', public.planner_cohorte(t.nombre))
                                ORDER BY t.fecha_inicio DESC, t.id), '[]'::jsonb)
        FROM public.temporadas t
       WHERE (t.activa OR lower(btrim(coalesce(t.estado, ''))) = 'activa')
         AND t.id <> p_temporada_id
         AND t.id IS DISTINCT FROM v_origen_id
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.planner_estado_publicacion(uuid) IS
  'Planificador de GDV (S16): estado de publicación de la temporada: bloqueos por tipo (toda la temporada), segmentos con grupos y su marca '
  '(quién, cuándo; grupos vigentes = proximo o activo), faltan_segmentos, puede_publicar (admin, pastor o director general, en planificación, con grupos, 0 bloqueos y todos los '
  'segmentos terminados), origen por cohorte (S19) con los grupos que se archivarían y otras temporadas activas que no se tocan.';

REVOKE ALL ON FUNCTION public.planner_estado_publicacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_estado_publicacion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_publicar(p_temporada_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_temporada record;
  v_origen_id uuid;
  v_origen_nombre text;
  v_grupos integer;
  v_bloqueos record;
  v_faltan integer;
  v_faltan_nombres text;
  v_publicados integer := 0;
  v_ya_aprobados integer := 0;
  v_activados integer := 0;
  v_archivados integer := 0;
BEGIN
  SELECT a.usuario_id, a.roles INTO v_actor FROM public.planner_alcance_actor() a;
  IF NOT (v_actor.roles && ARRAY['admin', 'pastor', 'director-general']) THEN
    RAISE EXCEPTION 'Solo el director general, un pastor o un administrador pueden publicar la temporada' USING ERRCODE = '42501';
  END IF;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;

  -- Serializa activaciones con el planificador viejo (mismo lock) y con los pasos de la temporada.
  PERFORM pg_advisory_xact_lock(hashtext('planner_publicar_temporada'));
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || p_temporada_id::text, 0));

  SELECT t.id, t.nombre, t.activa, t.estado INTO v_temporada FROM public.temporadas t WHERE t.id = p_temporada_id FOR UPDATE;
  IF lower(btrim(coalesce(v_temporada.estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'Solo se puede publicar una temporada en planificación' USING ERRCODE = '22023';
  END IF;

  v_origen_id := public.planner_temporada_origen(p_temporada_id);
  IF v_origen_id IS NOT NULL THEN
    SELECT t.nombre INTO v_origen_nombre FROM public.temporadas t WHERE t.id = v_origen_id FOR UPDATE;
  END IF;

  -- Bloquea los grupos del destino y del origen (en orden de id) antes de validar.
  PERFORM 1
    FROM public.grupos g
   WHERE g.temporada_id IN (p_temporada_id, v_origen_id) AND NOT g.eliminado
   ORDER BY g.id
     FOR UPDATE;

  SELECT count(*) INTO v_grupos
    FROM public.grupos g
   WHERE g.temporada_id = p_temporada_id AND NOT g.eliminado AND g.estado_ciclo IN ('proximo', 'activo');
  IF v_grupos = 0 THEN
    RAISE EXCEPTION 'La temporada no tiene grupos para publicar' USING ERRCODE = '22023';
  END IF;

  -- S6: 0 bloqueos en todos los segmentos.
  SELECT count(*) AS total,
         count(*) FILTER (WHERE b.tipo = 'sin_lider') AS sin_lider,
         count(*) FILTER (WHERE b.tipo = 'sin_director') AS sin_director,
         count(*) FILTER (WHERE b.tipo = 'sin_localidad') AS sin_localidad,
         count(*) FILTER (WHERE b.tipo = 'persona_en_dos_grupos') AS dobles
    INTO v_bloqueos
    FROM public.planner_bloqueos_temporada(p_temporada_id) b;
  IF v_bloqueos.total > 0 THEN
    RAISE EXCEPTION 'No se puede publicar: hay % por resolver (%)',
      v_bloqueos.total || CASE WHEN v_bloqueos.total = 1 THEN ' bloqueo' ELSE ' bloqueos' END,
      array_to_string(ARRAY[
        CASE WHEN v_bloqueos.sin_lider > 0 THEN 'sin líder: ' || v_bloqueos.sin_lider END,
        CASE WHEN v_bloqueos.sin_director > 0 THEN 'sin director de etapa: ' || v_bloqueos.sin_director END,
        CASE WHEN v_bloqueos.sin_localidad > 0 THEN 'sin localidad: ' || v_bloqueos.sin_localidad END,
        CASE WHEN v_bloqueos.dobles > 0 THEN 'persona en dos grupos: ' || v_bloqueos.dobles END], ', ')
      USING ERRCODE = '22023';
  END IF;

  -- S14: cada segmento con grupos, marcado por su director de etapa.
  SELECT count(*), public.planner_paso_lista(array_agg(x.nombre ORDER BY x.nombre))
    INTO v_faltan, v_faltan_nombres
    FROM (SELECT DISTINCT s.id, s.nombre
            FROM public.grupos g
            JOIN public.segmentos s ON s.id = g.segmento_id
           WHERE g.temporada_id = p_temporada_id AND NOT g.eliminado AND g.estado_ciclo IN ('proximo', 'activo')
             AND NOT EXISTS (SELECT 1 FROM public.planner_segmentos_terminados t
                              WHERE t.temporada_id = p_temporada_id AND t.segmento_id = g.segmento_id)) x;
  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'No se puede publicar: % por terminar (%)',
      CASE WHEN v_faltan = 1 THEN 'falta 1 segmento' ELSE 'faltan ' || v_faltan || ' segmentos' END, v_faltan_nombres
      USING ERRCODE = '22023';
  END IF;

  -- Aprobar los grupos que aún no lo están (como el RPC viejo).
  SELECT count(*) FILTER (WHERE g.estado_aprobacion = 'aprobado') INTO v_ya_aprobados
    FROM public.grupos g
   WHERE g.temporada_id = p_temporada_id AND NOT g.eliminado AND g.estado_ciclo IN ('proximo', 'activo');
  UPDATE public.grupos g
     SET estado_aprobacion = 'aprobado',
         aprobado_en = now(),
         aprobado_por = v_actor.usuario_id,
         updated_at = now()
   WHERE g.temporada_id = p_temporada_id
     AND NOT g.eliminado
     AND g.estado_ciclo IN ('proximo', 'activo')
     AND g.estado_aprobacion IS DISTINCT FROM 'aprobado';
  GET DIAGNOSTICS v_publicados = ROW_COUNT;

  -- Cerrar SOLO el origen de la misma cohorte (S19), aunque ya estuviera finalizado (S8).
  IF v_origen_id IS NOT NULL THEN
    UPDATE public.temporadas t SET activa = false, estado = 'finalizada' WHERE t.id = v_origen_id;
    UPDATE public.grupos g
       SET activo = false,
           estado_ciclo = CASE WHEN g.estado_ciclo = 'cancelado' THEN 'cancelado' ELSE 'archivado' END,
           updated_at = now()
     WHERE g.temporada_id = v_origen_id
       AND NOT g.eliminado
       AND (g.activo OR g.estado_ciclo NOT IN ('archivado', 'cancelado'));
    GET DIAGNOSTICS v_archivados = ROW_COUNT;
  END IF;

  UPDATE public.temporadas t SET activa = true, estado = 'activa' WHERE t.id = p_temporada_id;
  UPDATE public.grupos g
     SET activo = true,
         estado_ciclo = 'activo',
         updated_at = now()
   WHERE g.temporada_id = p_temporada_id
     AND NOT g.eliminado
     AND g.estado_ciclo IN ('proximo', 'activo')
     AND (NOT g.activo OR g.estado_ciclo <> 'activo');
  GET DIAGNOSTICS v_activados = ROW_COUNT;

  IF NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id AND t.activa AND t.estado = 'activa')
     OR EXISTS (SELECT 1 FROM public.grupos g
                 WHERE g.temporada_id = p_temporada_id AND NOT g.eliminado
                   AND g.estado_ciclo IN ('proximo', 'activo')
                   AND (NOT g.activo OR g.estado_ciclo <> 'activo' OR g.estado_aprobacion <> 'aprobado'))
     OR (v_origen_id IS NOT NULL AND (
           NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = v_origen_id AND NOT t.activa AND t.estado = 'finalizada')
           OR EXISTS (SELECT 1 FROM public.grupos g
                       WHERE g.temporada_id = v_origen_id AND NOT g.eliminado
                         AND (g.activo OR g.estado_ciclo IN ('activo', 'proximo')))))
  THEN
    RAISE EXCEPTION 'No se pudo publicar la temporada: el estado final de la temporada o de la de origen es inconsistente'
      USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object(
    'temporada_id', p_temporada_id,
    'nombre', v_temporada.nombre,
    'grupos', v_grupos,
    'publicados', v_publicados,
    'ya_aprobados', v_ya_aprobados,
    'grupos_activados', v_activados,
    'origen_id', v_origen_id,
    'origen_nombre', v_origen_nombre,
    'grupos_archivados', v_archivados
  );
END;
$function$;

COMMENT ON FUNCTION public.planner_publicar(uuid) IS
  'Planificador de GDV (S8, S12, S19): publica y activa una temporada en planificación (activa puede ser true). Admin, pastor y director '
  'general (42501). Exige grupos vigentes (proximo o activo), 0 bloqueos y todos los segmentos con grupos terminados (22023). Activa la '
  'temporada y sus grupos vigentes (aprobados; cancelados y archivados no se tocan); '
  'finaliza solo el origen de la misma cohorte y archiva sus grupos aunque ya estuviera finalizado; no toca otras temporadas ni membresías. '
  'No registra paso.';

REVOKE ALL ON FUNCTION public.planner_publicar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_publicar(uuid) TO authenticated, service_role;
