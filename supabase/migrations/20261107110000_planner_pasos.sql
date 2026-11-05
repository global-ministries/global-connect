-- noqa: insert-into
-- Planificador de GDV: cada cambio es un paso guardado, con historial y deshacer
-- (T2 de odd/tasks/planner-gdv.md; S3, S4, S10, S13, S15, S17).
--
-- Por qué: el planificador viejo guardaba todo el tablero de una vez (planner_guardar_planificacion)
-- y su deshacer vivía en memoria. Ahora cada movimiento, alta, edición o baja de grupo es un paso
-- propio en el servidor, con historial por temporada (quién, qué, cuándo) y deshacer, para que
-- varios directores trabajen a la vez sin pisarse.
--
-- Qué crea:
--   1. planner_pasos: un paso por cambio (acción, actor, grupos, personas y segmentos que toca,
--      foto de antes y de después para revertir, descripción para el historial, deshace_paso_id en
--      los pasos de deshacer y deshecho_por en el paso deshecho).
--   2. planner_segmentos_terminados: marca "Terminé mi segmento" (S14; la RPC que marca es T3).
--      S17: todo paso que toca un grupo de un segmento borra su marca y la guarda en antes.
--   3. RPC de pasos (una transacción, serializadas por temporada con pg_advisory_xact_lock, un
--      paso cada una; devuelven jsonb con paso_id, descripción y la foto de después):
--        planner_mover_personas(temporada, personas, grupo destino o NULL = banco, rol)
--        planner_crear_grupo(temporada, datos), planner_editar_grupo(grupo, cambios),
--        planner_eliminar_grupo(grupo), planner_deshacer_paso(paso)
--   4. planner_historial(temporada, límite, antes de): pasos del más nuevo al más viejo, con
--      puede_deshacer y motivo_no_deshacer para quien consulta.
--   5. Ayudantes internos planner_paso_* (no los ejecuta authenticated).
--
-- Reglas:
--   * Roles y alcance de planner_alcance_actor() (20261107100000): admin, pastor y director general
--     cambian cualquier segmento; un director de etapa solo grupos de sus segmentos (S10). Mueve
--     personas solo HACIA grupos de sus segmentos o al banco desde ellos; agrega desde el banco a
--     cualquiera (S11), pero no saca a nadie de un grupo de otro segmento (42501).
--   * Temporada: existe y su estado es 'planificacion', esté activa o no (2026-II, S8).
--   * Una persona está en un solo grupo de la temporada: al moverla sale sola de los demás.
--   * Salir de un grupo (a otro grupo, al banco o porque se elimina el grupo) borra la fila de
--     grupo_miembros, como la app (eliminar_miembro_de_grupo, 20260608173000): muchas lecturas,
--     políticas y permisos no filtran fecha_salida, así que una salida blanda dejaría a la persona
--     visible y a un Líder con permisos sobre el grupo. Ninguna tabla referencia grupo_miembros y la
--     asistencia va por (evento_grupo_id, usuario_id): no se pierde. El paso guarda en antes la fila
--     completa (todas las columnas) y deshacer la reinserta igual (mismo id si está libre).
--   * Entrar a un grupo: INSERT ... ON CONFLICT (grupo_id, usuario_id) DO UPDATE con rol, estado
--     'activo' y fecha_salida NULL (por si quedó una fila de salida blanda hecha en otro lado).
--   * Membresía vigente, como en T1: fecha_salida NULL y estado distinto de 'inactivo' o
--     'eliminado'; una fila con fecha_salida no cuenta ni se toca al salir.
--   * Roles: lider = 'Líder', aprendiz = 'Colíder', miembro = 'Miembro'.
--   * Grupos: nombre libre (S4) único por segmento y temporada sin distinguir mayúsculas ni
--     espacios, eliminados incluidos (grupos_unico los cuenta); localidad de campus_localidades
--     activa, que fija campus_id (S3); de 0 a 4 directores de etapa del segmento del grupo (0 bloquea
--     solo al publicar, S6). Un grupo nuevo nace 'proximo', inactivo y 'pendiente'. Editar cambia
--     solo las claves enviadas y nunca activo ni estado_ciclo (los grupos de 2026-II ya se reúnen).
--     Eliminar es baja lógica: eliminado, inactivo y renombrado para liberar el nombre (como
--     planner_guardar_planificacion); sus personas vuelven al banco.
--   * Deshacer (S15): el autor dentro de 24 horas; director general, admin y pastor cualquier paso
--     de la temporada. Se rechaza, con el motivo, si el paso ya se deshizo, si es un deshacer, si la
--     temporada ya no está en planificación, si un paso posterior no deshecho tocó alguno de sus
--     grupos o personas (40001, nombra a quien y qué) o si el estado cambió fuera del planificador
--     (40001). Restaura la foto de antes (deshacer un alta da de baja el grupo), es un paso propio
--     ('deshacer') y aplica S17.
--   * Errores: 28000 sin sesión, 42501 permiso, 22023 validación, 40001 y 55000 conflictos.
--
-- Orden: numero (identidad) ordena los pasos para conflictos; creado_en (clock_timestamp) es la
-- hora que muestra el historial.
--
-- Blast radius: tablas y funciones nuevas. Escribe grupos, grupo_miembros y director_etapa_grupos
-- solo a través de estas RPC. No cambia tablas, políticas ni funciones existentes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.planner_historial(uuid, integer, timestamptz);
--   DROP FUNCTION IF EXISTS public.planner_deshacer_paso(uuid);
--   DROP FUNCTION IF EXISTS public.planner_eliminar_grupo(uuid);
--   DROP FUNCTION IF EXISTS public.planner_editar_grupo(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.planner_crear_grupo(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.planner_mover_personas(uuid, uuid[], uuid, text);
--   DROP FUNCTION IF EXISTS public.planner_paso_motivo_no_deshacer(uuid, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.planner_paso_registrar(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb, text, uuid);
--   DROP FUNCTION IF EXISTS public.planner_paso_validar_grupo(uuid, uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.planner_paso_aplicar(jsonb);
--   DROP FUNCTION IF EXISTS public.planner_paso_foto(uuid[], jsonb);
--   DROP FUNCTION IF EXISTS public.planner_paso_lista(text[]);
--   DROP TABLE IF EXISTS public.planner_segmentos_terminados;
--   DROP TABLE IF EXISTS public.planner_pasos;

CREATE TABLE IF NOT EXISTS public.planner_pasos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           bigint GENERATED ALWAYS AS IDENTITY,
  temporada_id     uuid NOT NULL REFERENCES public.temporadas(id) ON DELETE CASCADE,
  actor            uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  accion           text NOT NULL CHECK (accion IN ('mover_personas', 'crear_grupo', 'editar_grupo', 'eliminar_grupo', 'deshacer')),
  grupo_ids        uuid[] NOT NULL DEFAULT '{}',
  usuario_ids      uuid[] NOT NULL DEFAULT '{}',
  segmento_ids     uuid[] NOT NULL DEFAULT '{}',
  antes            jsonb NOT NULL DEFAULT '{}'::jsonb,
  despues          jsonb NOT NULL DEFAULT '{}'::jsonb,
  descripcion      text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT clock_timestamp(),
  deshace_paso_id  uuid REFERENCES public.planner_pasos(id) ON DELETE SET NULL,
  deshecho_por     uuid REFERENCES public.planner_pasos(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.planner_pasos IS
  'Planificador de GDV: un paso por cambio (S13) con fotos de antes y después para deshacer (S15). Solo se usa por las RPC planner_*.';

CREATE INDEX IF NOT EXISTS planner_pasos_temporada_creado_idx ON public.planner_pasos (temporada_id, creado_en DESC, numero DESC);
CREATE INDEX IF NOT EXISTS planner_pasos_temporada_numero_idx ON public.planner_pasos (temporada_id, numero);
CREATE INDEX IF NOT EXISTS planner_pasos_actor_idx ON public.planner_pasos (actor);
CREATE INDEX IF NOT EXISTS planner_pasos_deshace_idx ON public.planner_pasos (deshace_paso_id) WHERE deshace_paso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS planner_pasos_deshecho_idx ON public.planner_pasos (deshecho_por) WHERE deshecho_por IS NOT NULL;

ALTER TABLE public.planner_pasos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planner_pasos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.planner_pasos TO service_role;

CREATE TABLE IF NOT EXISTS public.planner_segmentos_terminados (
  temporada_id uuid NOT NULL REFERENCES public.temporadas(id) ON DELETE CASCADE,
  segmento_id  uuid NOT NULL REFERENCES public.segmentos(id) ON DELETE CASCADE,
  marcado_por  uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  marcado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (temporada_id, segmento_id)
);

COMMENT ON TABLE public.planner_segmentos_terminados IS
  'Planificador de GDV: segmentos que su director de etapa marcó como terminados (S14). Un paso que toca un grupo del segmento borra la marca (S17).';

CREATE INDEX IF NOT EXISTS planner_segmentos_terminados_segmento_idx ON public.planner_segmentos_terminados (segmento_id);
CREATE INDEX IF NOT EXISTS planner_segmentos_terminados_marcado_por_idx ON public.planner_segmentos_terminados (marcado_por);

ALTER TABLE public.planner_segmentos_terminados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planner_segmentos_terminados FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.planner_segmentos_terminados TO service_role;

-- Ayudantes internos ---------------------------------------------------------

-- "A", "A y B", "A, B y C".
CREATE OR REPLACE FUNCTION public.planner_paso_lista(p_textos text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN coalesce(cardinality(p_textos), 0) = 0 THEN ''
           WHEN cardinality(p_textos) = 1 THEN p_textos[1]
           ELSE array_to_string(p_textos[1:cardinality(p_textos) - 1], ', ') || ' y ' || p_textos[cardinality(p_textos)]
         END;
$function$;

COMMENT ON FUNCTION public.planner_paso_lista(text[]) IS
  'Interna del planificador: une textos como "A, B y C" para las descripciones. No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_paso_lista(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_paso_lista(text[]) TO service_role;

-- Foto de grupos y de filas de grupo_miembros (por par grupo, persona). Sirve de antes y después de
-- cada paso y para comprobar al deshacer que nada cambió fuera del planificador. 'fila' es la fila
-- completa (para reinsertarla igual); la comparación usa id, rol, estado, vigente y salida_epoch
-- (fecha_salida sin depender de la zona horaria de la sesión).
CREATE OR REPLACE FUNCTION public.planner_paso_foto(p_grupos uuid[], p_miembros jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'grupos', coalesce((
      SELECT jsonb_agg(
               CASE WHEN g.id IS NULL THEN jsonb_build_object('id', x.id, 'existia', false)
               ELSE jsonb_build_object(
                 'id', g.id, 'existia', true, 'nombre', g.nombre, 'segmento_id', g.segmento_id,
                 'localidad_id', g.localidad_id, 'campus_id', g.campus_id, 'dia_reunion', g.dia_reunion::text,
                 'hora_reunion', g.hora_reunion::text, 'capacidad_maxima', g.capacidad_maxima,
                 'activo', g.activo, 'eliminado', g.eliminado,
                 'directores', (SELECT coalesce(jsonb_agg(d.director_etapa_id ORDER BY d.director_etapa_id::text), '[]'::jsonb)
                                  FROM public.director_etapa_grupos d WHERE d.grupo_id = g.id))
               END
             ORDER BY x.id::text)
        FROM (SELECT DISTINCT i AS id FROM unnest(p_grupos) i WHERE i IS NOT NULL) x
        LEFT JOIN public.grupos g ON g.id = x.id
    ), '[]'::jsonb),
    'miembros', coalesce((
      SELECT jsonb_agg(
               CASE WHEN gm.id IS NULL THEN
                 jsonb_build_object('grupo_id', x.grupo_id, 'usuario_id', x.usuario_id, 'existia', false, 'vigente', false)
               ELSE jsonb_build_object(
                 'grupo_id', x.grupo_id, 'usuario_id', x.usuario_id, 'existia', true, 'id', gm.id, 'rol', gm.rol::text,
                 'estado', gm.estado, 'salida_epoch', extract(epoch FROM gm.fecha_salida),
                 'vigente', gm.fecha_salida IS NULL AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado'),
                 'fila', to_jsonb(gm))
               END
             ORDER BY x.grupo_id::text, x.usuario_id::text)
        FROM (SELECT DISTINCT (e->>'grupo_id')::uuid AS grupo_id, (e->>'usuario_id')::uuid AS usuario_id
                FROM jsonb_array_elements(coalesce(p_miembros, '[]'::jsonb)) e) x
        LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = x.grupo_id AND gm.usuario_id = x.usuario_id
    ), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.planner_paso_foto(uuid[], jsonb) IS
  'Interna del planificador: foto de grupos (campos, directores) y de filas de grupo_miembros por par grupo, persona. No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_paso_foto(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_paso_foto(uuid[], jsonb) TO service_role;

-- Deja grupos y filas como dice una foto. Un grupo que no existía se da de baja (eliminado,
-- inactivo, renombrado y sin directores); una fila que no existía se borra (la creó el paso); una
-- fila que existía y ya no está se reinserta completa, con su id si está libre.
CREATE OR REPLACE FUNCTION public.planner_paso_aplicar(p_foto jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_g jsonb;
  v_m jsonb;
  v_id uuid;
  v_fila public.grupos;
  v_miembro public.grupo_miembros;
  v_sl uuid[];
BEGIN
  FOR v_g IN SELECT e FROM jsonb_array_elements(coalesce(p_foto->'grupos', '[]'::jsonb)) e LOOP
    v_id := (v_g->>'id')::uuid;
    IF (v_g->>'existia')::boolean THEN
      v_fila := jsonb_populate_record(NULL::public.grupos, v_g - 'directores' - 'existia');
      UPDATE public.grupos g
         SET nombre = v_fila.nombre,
             segmento_id = v_fila.segmento_id,
             localidad_id = v_fila.localidad_id,
             campus_id = v_fila.campus_id,
             dia_reunion = v_fila.dia_reunion,
             hora_reunion = v_fila.hora_reunion,
             capacidad_maxima = v_fila.capacidad_maxima,
             activo = v_fila.activo,
             eliminado = v_fila.eliminado,
             updated_at = now()
       WHERE g.id = v_id;
      v_sl := ARRAY(SELECT (d #>> '{}')::uuid FROM jsonb_array_elements(coalesce(v_g->'directores', '[]'::jsonb)) d);
      DELETE FROM public.director_etapa_grupos d WHERE d.grupo_id = v_id AND NOT (d.director_etapa_id = ANY (v_sl));
      INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
      SELECT v_id, s FROM unnest(v_sl) s
       WHERE NOT EXISTS (SELECT 1 FROM public.director_etapa_grupos d WHERE d.grupo_id = v_id AND d.director_etapa_id = s);
    ELSE
      UPDATE public.grupos g
         SET eliminado = true,
             activo = false,
             nombre = g.nombre || ' [eliminado ' || substr(md5(g.id::text), 1, 8) || ']',
             updated_at = now()
       WHERE g.id = v_id AND NOT g.eliminado;
      DELETE FROM public.director_etapa_grupos d WHERE d.grupo_id = v_id;
    END IF;
  END LOOP;

  FOR v_m IN SELECT e FROM jsonb_array_elements(coalesce(p_foto->'miembros', '[]'::jsonb)) e LOOP
    IF (v_m->>'existia')::boolean THEN
      v_miembro := jsonb_populate_record(NULL::public.grupo_miembros, v_m->'fila');
      UPDATE public.grupo_miembros gm
         SET rol = v_miembro.rol,
             estado = v_miembro.estado,
             fecha_asignacion = v_miembro.fecha_asignacion,
             fecha_salida = v_miembro.fecha_salida
       WHERE gm.grupo_id = v_miembro.grupo_id AND gm.usuario_id = v_miembro.usuario_id;
      IF NOT FOUND THEN
        BEGIN
          INSERT INTO public.grupo_miembros SELECT (v_miembro).*;
        EXCEPTION
          WHEN unique_violation THEN
            -- Su id ya lo usa otra fila: se reinserta igual con un id nuevo.
            v_miembro.id := gen_random_uuid();
            INSERT INTO public.grupo_miembros SELECT (v_miembro).*;
        END;
      END IF;
    ELSE
      DELETE FROM public.grupo_miembros gm
       WHERE gm.grupo_id = (v_m->>'grupo_id')::uuid AND gm.usuario_id = (v_m->>'usuario_id')::uuid;
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.planner_paso_aplicar(jsonb) IS
  'Interna del planificador: deja grupos, directores y filas de grupo_miembros como dice una foto (deshacer). No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_paso_aplicar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_paso_aplicar(jsonb) TO service_role;

-- Valida y normaliza los datos de un grupo. p_grupo_id NULL = alta (todas las claves); si no,
-- edición parcial (solo las claves enviadas). Devuelve los valores normalizados de las claves
-- presentes, más campus_id (de la localidad) y directores (ids de segmento_lideres ordenados).
CREATE OR REPLACE FUNCTION public.planner_paso_validar_grupo(p_temporada_id uuid, p_grupo_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_re_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_parcial constant boolean := p_grupo_id IS NOT NULL;
  v_actual public.grupos;
  v_out jsonb := '{}'::jsonb;
  v_clave text;
  v_texto text;
  v_nombre text;
  v_segmento_id uuid;
  v_segmento_nombre text;
  v_campus_id uuid;
  v_lista jsonb;
  v_dir_usuarios uuid[];
  v_dir uuid;
  v_sl_id uuid;
  v_sl_ids uuid[] := '{}';
  v_choque record;
BEGIN
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'Los datos del grupo deben ser un objeto' USING ERRCODE = '22023';
  END IF;
  SELECT k INTO v_clave
    FROM jsonb_object_keys(p_datos) k
   WHERE k <> ALL (ARRAY['nombre', 'segmento_id', 'localidad_id', 'dia_reunion', 'hora_reunion', 'capacidad_maxima', 'director_etapa_ids'])
   ORDER BY k
   LIMIT 1;
  IF v_clave IS NOT NULL THEN
    RAISE EXCEPTION 'Campo no permitido: %', v_clave USING ERRCODE = '22023';
  END IF;
  IF v_parcial THEN
    SELECT g.* INTO v_actual FROM public.grupos g WHERE g.id = p_grupo_id;
  END IF;

  -- Nombre libre (S4), sin espacios repetidos.
  IF NOT v_parcial OR p_datos ? 'nombre' THEN
    v_nombre := regexp_replace(btrim(coalesce(p_datos->>'nombre', '')), '\s+', ' ', 'g');
    IF v_nombre = '' THEN
      RAISE EXCEPTION 'El grupo debe tener nombre' USING ERRCODE = '22023';
    END IF;
    -- '~' queda reservado para los nombres temporales de planner_guardar_planificacion.
    IF left(v_nombre, 1) = '~' THEN
      RAISE EXCEPTION 'El nombre del grupo no puede empezar con "~"' USING ERRCODE = '22023';
    END IF;
    IF length(v_nombre) > 120 THEN
      RAISE EXCEPTION 'El nombre del grupo puede tener hasta 120 caracteres' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('nombre', v_nombre);
  ELSE
    v_nombre := v_actual.nombre;
  END IF;

  IF NOT v_parcial OR p_datos ? 'segmento_id' THEN
    v_texto := p_datos->>'segmento_id';
    IF v_texto IS NULL OR v_texto !~ v_re_uuid OR NOT EXISTS (SELECT 1 FROM public.segmentos s WHERE s.id = v_texto::uuid) THEN
      RAISE EXCEPTION 'El grupo debe tener un segmento válido' USING ERRCODE = '22023';
    END IF;
    v_segmento_id := v_texto::uuid;
    v_out := v_out || jsonb_build_object('segmento_id', v_segmento_id);
  ELSE
    v_segmento_id := v_actual.segmento_id;
  END IF;
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = v_segmento_id;

  -- Localidad (S3): activa; fija el campus del grupo. null la quita (bloquea al publicar, S6).
  IF p_datos ? 'localidad_id' THEN
    v_texto := p_datos->>'localidad_id';
    IF v_texto IS NULL THEN
      v_out := v_out || jsonb_build_object('localidad_id', NULL);
    ELSE
      IF v_texto !~ v_re_uuid THEN
        RAISE EXCEPTION 'La localidad no existe o está inactiva' USING ERRCODE = '22023';
      END IF;
      SELECT cl.campus_id INTO v_campus_id FROM public.campus_localidades cl WHERE cl.id = v_texto::uuid AND cl.activo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'La localidad no existe o está inactiva' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object('localidad_id', v_texto::uuid, 'campus_id', v_campus_id);
    END IF;
  END IF;

  IF p_datos ? 'dia_reunion' THEN
    v_texto := nullif(btrim(p_datos->>'dia_reunion'), '');
    IF v_texto IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(enum_range(NULL::public.enum_dia_semana)) d WHERE d::text = v_texto
    ) THEN
      RAISE EXCEPTION 'El día de reunión no es válido' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('dia_reunion', v_texto);
  END IF;

  -- Hora: 'H:MM', 'HH:MM', 'HH:MM:SS' y sufijo AM/PM, como planner_guardar_planificacion; la forma
  -- se valida antes del cast para rechazar literales como 'now'.
  IF p_datos ? 'hora_reunion' THEN
    v_texto := nullif(btrim(p_datos->>'hora_reunion'), '');
    IF v_texto IS NOT NULL THEN
      IF v_texto !~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(\s*[AaPp][Mm])?$' THEN
        RAISE EXCEPTION 'La hora de reunión no es válida' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_texto := v_texto::time::text;
      EXCEPTION
        WHEN data_exception THEN
          RAISE EXCEPTION 'La hora de reunión no es válida' USING ERRCODE = '22023';
      END;
    END IF;
    v_out := v_out || jsonb_build_object('hora_reunion', v_texto);
  END IF;

  IF p_datos ? 'capacidad_maxima' THEN
    v_texto := nullif(btrim(p_datos->>'capacidad_maxima'), '');
    IF v_texto IS NOT NULL AND (v_texto !~ '^[0-9]{1,6}$' OR v_texto::integer <= 0) THEN
      RAISE EXCEPTION 'La capacidad debe ser un número entero mayor que 0' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('capacidad_maxima', v_texto::integer);
  END IF;

  -- Directores de etapa (usuarios.id): de 0 a 4, cada uno director_etapa del segmento del grupo
  -- (resolución determinista ORDER BY id LIMIT 1, como planner_guardar_planificacion). Si cambia el
  -- segmento y no vienen, los actuales deben serlo también del segmento nuevo.
  IF NOT v_parcial OR p_datos ? 'director_etapa_ids' THEN
    v_lista := coalesce(nullif(p_datos->'director_etapa_ids', 'null'::jsonb), '[]'::jsonb);
    IF jsonb_typeof(v_lista) <> 'array' OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lista) e WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ v_re_uuid
    ) THEN
      RAISE EXCEPTION 'Los directores de etapa deben ser una lista de ids' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT (e #>> '{}')::uuid), '{}') INTO v_dir_usuarios FROM jsonb_array_elements(v_lista) e;
  ELSIF v_segmento_id IS DISTINCT FROM v_actual.segmento_id THEN
    SELECT coalesce(array_agg(DISTINCT sl.usuario_id), '{}') INTO v_dir_usuarios
      FROM public.director_etapa_grupos d
      JOIN public.segmento_lideres sl ON sl.id = d.director_etapa_id
     WHERE d.grupo_id = p_grupo_id;
  END IF;
  IF v_dir_usuarios IS NOT NULL THEN
    IF cardinality(v_dir_usuarios) > 4 THEN
      RAISE EXCEPTION 'Un grupo puede tener hasta 4 directores de etapa' USING ERRCODE = '22023';
    END IF;
    FOREACH v_dir IN ARRAY v_dir_usuarios LOOP
      SELECT sl.id INTO v_sl_id
        FROM public.segmento_lideres sl
       WHERE sl.usuario_id = v_dir AND sl.segmento_id = v_segmento_id AND sl.tipo_lider = 'director_etapa'
       ORDER BY sl.id
       LIMIT 1;
      IF v_sl_id IS NULL THEN
        RAISE EXCEPTION '% no es director de etapa de %',
          coalesce((SELECT u.nombre || ' ' || u.apellido FROM public.usuarios u WHERE u.id = v_dir), 'Una de las personas indicadas'),
          v_segmento_nombre
          USING ERRCODE = '22023';
      END IF;
      v_sl_ids := v_sl_ids || v_sl_id;
    END LOOP;
    v_out := v_out || jsonb_build_object('directores', to_jsonb(ARRAY(SELECT x FROM unnest(v_sl_ids) x ORDER BY x::text)));
  END IF;

  -- Nombre único por segmento y temporada, sin distinguir mayúsculas ni espacios, eliminados
  -- incluidos (el índice grupos_unico cuenta las filas eliminadas).
  IF NOT v_parcial OR p_datos ? 'nombre' OR v_segmento_id IS DISTINCT FROM v_actual.segmento_id THEN
    SELECT g.nombre, g.eliminado INTO v_choque
      FROM public.grupos g
     WHERE g.temporada_id = p_temporada_id
       AND g.segmento_id = v_segmento_id
       AND g.id IS DISTINCT FROM p_grupo_id
       AND lower(regexp_replace(btrim(g.nombre), '\s+', ' ', 'g')) = lower(v_nombre)
     ORDER BY g.eliminado, g.id
     LIMIT 1;
    IF FOUND THEN
      IF v_choque.eliminado THEN
        RAISE EXCEPTION 'Existe un grupo eliminado llamado «%» en % en esta temporada; usa otro nombre', v_choque.nombre, v_segmento_nombre
          USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Ya existe un grupo llamado «%» en % en esta temporada', v_choque.nombre, v_segmento_nombre
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.planner_paso_validar_grupo(uuid, uuid, jsonb) IS
  'Interna del planificador: valida y normaliza los datos de un grupo (nombre único, segmento, localidad activa, día, hora, capacidad, 0 a 4 directores elegibles). No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_paso_validar_grupo(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_paso_validar_grupo(uuid, uuid, jsonb) TO service_role;

-- Registra un paso: calcula los segmentos que toca (grupos actuales y los de las fotos), borra sus
-- marcas de terminado (S17) y las guarda en antes->'terminados', y marca el paso deshecho.
CREATE OR REPLACE FUNCTION public.planner_paso_registrar(
  p_temporada_id uuid,
  p_actor uuid,
  p_accion text,
  p_grupo_ids uuid[],
  p_usuario_ids uuid[],
  p_antes jsonb,
  p_despues jsonb,
  p_descripcion text,
  p_deshace_paso_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_segmentos uuid[];
  v_terminados jsonb;
  v_id uuid;
BEGIN
  SELECT coalesce(array_agg(DISTINCT x.s ORDER BY x.s), '{}') INTO v_segmentos
    FROM (SELECT g.segmento_id AS s FROM public.grupos g WHERE g.id = ANY (p_grupo_ids)
          UNION
          SELECT (e->>'segmento_id')::uuid
            FROM jsonb_array_elements(coalesce(p_antes->'grupos', '[]'::jsonb) || coalesce(p_despues->'grupos', '[]'::jsonb)) e
           WHERE e->>'segmento_id' IS NOT NULL) x
   WHERE x.s IS NOT NULL;

  WITH borradas AS (
    DELETE FROM public.planner_segmentos_terminados t
     WHERE t.temporada_id = p_temporada_id AND t.segmento_id = ANY (v_segmentos)
    RETURNING t.segmento_id, t.marcado_por, t.marcado_en
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('segmento_id', b.segmento_id, 'marcado_por', b.marcado_por, 'marcado_en', b.marcado_en)
                            ORDER BY b.segmento_id::text), '[]'::jsonb)
    INTO v_terminados
    FROM borradas b;

  INSERT INTO public.planner_pasos (temporada_id, actor, accion, grupo_ids, usuario_ids, segmento_ids, antes, despues, descripcion, deshace_paso_id)
  VALUES (p_temporada_id, p_actor, p_accion, coalesce(p_grupo_ids, '{}'), coalesce(p_usuario_ids, '{}'), v_segmentos,
          coalesce(p_antes, '{}'::jsonb) || jsonb_build_object('terminados', v_terminados), coalesce(p_despues, '{}'::jsonb),
          p_descripcion, p_deshace_paso_id)
  RETURNING id INTO v_id;

  IF p_deshace_paso_id IS NOT NULL THEN
    UPDATE public.planner_pasos p SET deshecho_por = v_id WHERE p.id = p_deshace_paso_id;
  END IF;

  RETURN jsonb_build_object(
    'paso_id', v_id,
    'segmentos', to_jsonb(v_segmentos),
    'segmentos_reabiertos', (SELECT coalesce(jsonb_agg(e->'segmento_id'), '[]'::jsonb) FROM jsonb_array_elements(v_terminados) e)
  );
END;
$function$;

COMMENT ON FUNCTION public.planner_paso_registrar(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb, text, uuid) IS
  'Interna del planificador: registra un paso, borra las marcas de segmento terminado que toca (S17) y marca el paso deshecho. No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_paso_registrar(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_paso_registrar(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb, text, uuid) TO service_role;

-- Por qué no se puede deshacer un paso (codigo y motivo NULL = sí se puede). p_dirige: admin,
-- pastor o director general (deshacen cualquier paso de la temporada, sin límite de horas).
CREATE OR REPLACE FUNCTION public.planner_paso_motivo_no_deshacer(
  p_paso_id uuid,
  p_usuario_id uuid,
  p_dirige boolean,
  OUT codigo text,
  OUT motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_paso public.planner_pasos;
  v_estado text;
  v_posterior record;
  v_foto jsonb;
BEGIN
  SELECT p.* INTO v_paso FROM public.planner_pasos p WHERE p.id = p_paso_id;
  IF NOT FOUND THEN
    codigo := '22023'; motivo := 'El paso no existe'; RETURN;
  END IF;
  IF v_paso.deshecho_por IS NOT NULL THEN
    codigo := '55000'; motivo := 'Este paso ya se deshizo'; RETURN;
  END IF;
  IF v_paso.accion = 'deshacer' THEN
    codigo := '55000'; motivo := 'Un deshacer no se puede deshacer; vuelve a hacer el cambio'; RETURN;
  END IF;
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = v_paso.temporada_id;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    codigo := '22023'; motivo := 'La temporada ya no está en planificación'; RETURN;
  END IF;
  IF NOT coalesce(p_dirige, false) THEN
    IF v_paso.actor IS DISTINCT FROM p_usuario_id THEN
      codigo := '42501';
      motivo := 'Solo quien hizo el cambio, el director general, un pastor o un administrador pueden deshacerlo';
      RETURN;
    END IF;
    IF v_paso.creado_en < now() - interval '24 hours' THEN
      codigo := '42501'; motivo := 'Solo puedes deshacer tus pasos de las últimas 24 horas'; RETURN;
    END IF;
  END IF;

  -- Un paso posterior, vigente y que no es un deshacer, tocó los mismos grupos o personas. Los
  -- deshechos y los deshacer se ignoran: juntos no dejan cambio.
  SELECT p.descripcion, coalesce(nullif(btrim(u.nombre || ' ' || u.apellido), ''), 'alguien') AS actor_nombre
    INTO v_posterior
    FROM public.planner_pasos p
    LEFT JOIN public.usuarios u ON u.id = p.actor
   WHERE p.temporada_id = v_paso.temporada_id
     AND p.numero > v_paso.numero
     AND p.deshecho_por IS NULL
     AND p.accion <> 'deshacer'
     AND (p.grupo_ids && v_paso.grupo_ids OR p.usuario_ids && v_paso.usuario_ids)
   ORDER BY p.numero
   LIMIT 1;
  IF FOUND THEN
    codigo := '40001';
    motivo := format('No se puede deshacer: después %s %s', v_posterior.actor_nombre, v_posterior.descripcion);
    RETURN;
  END IF;

  -- El estado actual debe ser el que dejó el paso (nadie lo cambió fuera del planificador).
  v_foto := public.planner_paso_foto(
    ARRAY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(coalesce(v_paso.despues->'grupos', '[]'::jsonb)) e),
    v_paso.despues->'miembros');
  IF coalesce(v_foto->'grupos', '[]'::jsonb) IS DISTINCT FROM coalesce(v_paso.despues->'grupos', '[]'::jsonb)
     OR (SELECT coalesce(jsonb_agg(m - 'fila' ORDER BY o), '[]'::jsonb)
           FROM jsonb_array_elements(coalesce(v_foto->'miembros', '[]'::jsonb)) WITH ORDINALITY x(m, o))
        IS DISTINCT FROM
        (SELECT coalesce(jsonb_agg(m - 'fila' ORDER BY o), '[]'::jsonb)
           FROM jsonb_array_elements(coalesce(v_paso.despues->'miembros', '[]'::jsonb)) WITH ORDINALITY x(m, o))
  THEN
    codigo := '40001'; motivo := 'No se puede deshacer: el grupo o sus personas cambiaron fuera del planificador'; RETURN;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.planner_paso_motivo_no_deshacer(uuid, uuid, boolean) IS
  'Interna del planificador: código y motivo por el que un actor no puede deshacer un paso (NULL = puede), S15. No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_paso_motivo_no_deshacer(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_paso_motivo_no_deshacer(uuid, uuid, boolean) TO service_role;

-- RPC de pasos -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.planner_mover_personas(
  p_temporada_id uuid,
  p_usuarios uuid[],
  p_grupo_destino uuid,
  p_rol text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_estado text;
  v_rol text;
  v_rol_etiqueta text;
  v_usuarios uuid[];
  v_destino record;
  v_actuales jsonb;
  v_fuera record;
  v_cambian uuid[];
  v_salidas jsonb;
  v_pares jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_grupo_ids uuid[];
  v_personas text;
  v_origenes text;
  v_descripcion text;
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || p_temporada_id::text, 0));
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = p_temporada_id FOR SHARE;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'La temporada no está en planificación' USING ERRCODE = '22023';
  END IF;

  IF p_grupo_destino IS NOT NULL THEN
    v_rol := CASE lower(btrim(coalesce(p_rol, '')))
               WHEN 'lider' THEN 'Líder' WHEN 'aprendiz' THEN 'Colíder' WHEN 'miembro' THEN 'Miembro'
             END;
    IF v_rol IS NULL THEN
      RAISE EXCEPTION 'El rol debe ser lider, aprendiz o miembro' USING ERRCODE = '22023';
    END IF;
    v_rol_etiqueta := CASE v_rol WHEN 'Líder' THEN 'líder' WHEN 'Colíder' THEN 'aprendiz' ELSE 'miembro' END;
  END IF;

  -- Personas sin repetir, en el orden enviado (la pareja la manda el cliente, S2).
  SELECT coalesce(array_agg(x.u ORDER BY x.o), '{}') INTO v_usuarios
    FROM (SELECT t.u, min(t.o) AS o FROM unnest(p_usuarios) WITH ORDINALITY t(u, o) WHERE t.u IS NOT NULL GROUP BY t.u) x;
  IF cardinality(v_usuarios) = 0 THEN
    RAISE EXCEPTION 'Indica al menos una persona' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_usuarios) > 20 THEN
    RAISE EXCEPTION 'Puedes mover hasta 20 personas por paso' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.usuarios u WHERE u.id = ANY (v_usuarios)) <> cardinality(v_usuarios) THEN
    RAISE EXCEPTION 'Alguna de las personas no existe' USING ERRCODE = '22023';
  END IF;

  IF p_grupo_destino IS NOT NULL THEN
    SELECT g.id, g.nombre, g.segmento_id, g.temporada_id, g.eliminado, s.nombre AS segmento_nombre INTO v_destino
      FROM public.grupos g JOIN public.segmentos s ON s.id = g.segmento_id
     WHERE g.id = p_grupo_destino
       FOR UPDATE OF g;
    IF NOT FOUND OR v_destino.eliminado THEN
      RAISE EXCEPTION 'El grupo no existe o fue eliminado' USING ERRCODE = '22023';
    END IF;
    IF v_destino.temporada_id <> p_temporada_id THEN
      RAISE EXCEPTION 'El grupo no es de esta temporada' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_actor.ve_todo OR v_destino.segmento_id = ANY (v_actor.segmentos)) THEN
      RAISE EXCEPTION 'No puedes mover personas a %: es de otro segmento (%)', v_destino.nombre, v_destino.segmento_nombre
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Membresías vigentes de las personas en la temporada.
  SELECT coalesce(jsonb_agg(jsonb_build_object('usuario_id', gm.usuario_id, 'grupo_id', g.id, 'grupo_nombre', g.nombre,
                                               'segmento_id', g.segmento_id, 'segmento_nombre', s.nombre, 'rol', gm.rol::text)
                            ORDER BY array_position(v_usuarios, gm.usuario_id), g.nombre, g.id), '[]'::jsonb)
    INTO v_actuales
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id
    JOIN public.segmentos s ON s.id = g.segmento_id
   WHERE gm.usuario_id = ANY (v_usuarios)
     AND g.temporada_id = p_temporada_id
     AND NOT g.eliminado
     AND gm.fecha_salida IS NULL
     AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado');

  -- Alcance (S10): sacar a alguien de un grupo exige que sea de un segmento del actor.
  SELECT u.nombre || ' ' || u.apellido AS persona, e->>'grupo_nombre' AS grupo, e->>'segmento_nombre' AS segmento INTO v_fuera
    FROM jsonb_array_elements(v_actuales) e
    JOIN public.usuarios u ON u.id = (e->>'usuario_id')::uuid
   WHERE (e->>'grupo_id')::uuid IS DISTINCT FROM p_grupo_destino
     AND NOT (v_actor.ve_todo OR (e->>'segmento_id')::uuid = ANY (v_actor.segmentos))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'No puedes mover a %: está en %, que es de otro segmento (%)', v_fuera.persona, v_fuera.grupo, v_fuera.segmento
      USING ERRCODE = '42501';
  END IF;

  -- Quiénes cambian: al banco, quien tiene grupo; a un grupo, quien está en otro, no está en el
  -- destino o está con otro rol.
  SELECT coalesce(array_agg(x ORDER BY array_position(v_usuarios, x)), '{}') INTO v_cambian
    FROM unnest(v_usuarios) x
   WHERE CASE
           WHEN p_grupo_destino IS NULL THEN
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_actuales) e WHERE (e->>'usuario_id')::uuid = x)
           ELSE
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_actuales) e
                      WHERE (e->>'usuario_id')::uuid = x AND (e->>'grupo_id')::uuid <> p_grupo_destino)
             OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_actuales) e
                             WHERE (e->>'usuario_id')::uuid = x AND (e->>'grupo_id')::uuid = p_grupo_destino AND e->>'rol' = v_rol)
         END;

  v_personas := public.planner_paso_lista(ARRAY(
    SELECT u.nombre || ' ' || u.apellido FROM unnest(v_usuarios) WITH ORDINALITY x(id, o) JOIN public.usuarios u ON u.id = x.id ORDER BY x.o));
  IF cardinality(v_cambian) = 0 THEN
    IF p_grupo_destino IS NULL THEN
      IF cardinality(v_usuarios) = 1 THEN
        RAISE EXCEPTION '% ya está en el banco', v_personas USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Ya están en el banco: %', v_personas USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_usuarios) = 1 THEN
      RAISE EXCEPTION '% ya está en % como %', v_personas, v_destino.nombre, v_rol_etiqueta USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'Ya están en % como %: %', v_destino.nombre, v_rol_etiqueta, v_personas USING ERRCODE = '22023';
  END IF;

  -- Filas tocadas: las salidas (otros grupos de la temporada) y el destino.
  SELECT coalesce(jsonb_agg(jsonb_build_object('grupo_id', e->>'grupo_id', 'usuario_id', e->>'usuario_id')), '[]'::jsonb)
    INTO v_salidas
    FROM jsonb_array_elements(v_actuales) e
   WHERE (e->>'usuario_id')::uuid = ANY (v_cambian)
     AND (e->>'grupo_id')::uuid IS DISTINCT FROM p_grupo_destino;
  v_pares := v_salidas || CASE
    WHEN p_grupo_destino IS NULL THEN '[]'::jsonb
    ELSE (SELECT jsonb_agg(jsonb_build_object('grupo_id', p_grupo_destino, 'usuario_id', x)) FROM unnest(v_cambian) x)
  END;
  v_antes := public.planner_paso_foto('{}', v_pares);

  -- Salir: se borra la fila, como la app; la fila completa queda en v_antes.
  DELETE FROM public.grupo_miembros gm
   USING jsonb_array_elements(v_salidas) e
   WHERE gm.grupo_id = (e->>'grupo_id')::uuid
     AND gm.usuario_id = (e->>'usuario_id')::uuid;

  IF p_grupo_destino IS NOT NULL THEN
    INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_asignacion)
    SELECT p_grupo_destino, x, v_rol::public.enum_rol_grupo, 'activo', current_date FROM unnest(v_cambian) x
    ON CONFLICT (grupo_id, usuario_id) DO UPDATE
       SET rol = EXCLUDED.rol, estado = 'activo', fecha_salida = NULL;
  END IF;
  v_despues := public.planner_paso_foto('{}', v_pares);

  v_personas := public.planner_paso_lista(ARRAY(
    SELECT u.nombre || ' ' || u.apellido FROM unnest(v_cambian) WITH ORDINALITY x(id, o) JOIN public.usuarios u ON u.id = x.id ORDER BY x.o));
  v_origenes := public.planner_paso_lista(ARRAY(
    SELECT DISTINCT e->>'grupo_nombre' FROM jsonb_array_elements(v_actuales) e
     WHERE (e->>'usuario_id')::uuid = ANY (v_cambian) AND (e->>'grupo_id')::uuid IS DISTINCT FROM p_grupo_destino
     ORDER BY 1));
  IF p_grupo_destino IS NULL THEN
    v_descripcion := format('devolvió a %s al banco desde %s', v_personas, v_origenes);
  ELSIF v_origenes = '' AND NOT EXISTS (
    SELECT 1 FROM unnest(v_cambian) x
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_actuales) e
                        WHERE (e->>'usuario_id')::uuid = x AND (e->>'grupo_id')::uuid = p_grupo_destino)
  ) THEN
    v_descripcion := format('cambió el rol de %s a %s en %s', v_personas, v_rol_etiqueta, v_destino.nombre);
  ELSE
    v_descripcion := 'movió a ' || v_personas
      || CASE WHEN v_origenes <> '' THEN ' de ' || v_origenes ELSE '' END
      || ' a ' || v_destino.nombre
      || CASE WHEN v_rol <> 'Miembro' THEN ' como ' || v_rol_etiqueta ELSE '' END;
  END IF;

  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_grupo_ids
    FROM (SELECT (e->>'grupo_id')::uuid AS x FROM jsonb_array_elements(v_pares) e) y;

  RETURN public.planner_paso_registrar(p_temporada_id, v_actor.usuario_id, 'mover_personas', v_grupo_ids, v_cambian,
                                       v_antes, v_despues, v_descripcion)
         || jsonb_build_object('descripcion', v_descripcion, 'grupo_ids', to_jsonb(v_grupo_ids),
                               'usuario_ids', to_jsonb(v_cambian), 'despues', v_despues);
END;
$function$;

COMMENT ON FUNCTION public.planner_mover_personas(uuid, uuid[], uuid, text) IS
  'Planificador de GDV (S13): mueve una persona o pareja a un grupo de la temporada (rol lider, aprendiz o miembro) o al banco (destino NULL). '
  'Sale sola de los demás grupos de la temporada (se borra la fila; el paso la guarda completa). Director de etapa: solo hacia '
  'grupos de sus segmentos y sin sacar a nadie de otro segmento (S10). Registra un paso y aplica S17.';

REVOKE ALL ON FUNCTION public.planner_mover_personas(uuid, uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_mover_personas(uuid, uuid[], uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_crear_grupo(p_temporada_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_re_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_actor record;
  v_estado text;
  v_texto text;
  v_segmento_nombre text;
  v_datos jsonb;
  v_tipado public.grupos;
  v_id uuid := gen_random_uuid();
  v_antes jsonb;
  v_despues jsonb;
  v_descripcion text;
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || p_temporada_id::text, 0));
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = p_temporada_id FOR SHARE;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'La temporada no está en planificación' USING ERRCODE = '22023';
  END IF;

  -- Alcance (S10) antes de validar el resto.
  v_texto := CASE WHEN jsonb_typeof(p_datos) = 'object' THEN p_datos->>'segmento_id' END;
  IF v_texto ~ v_re_uuid THEN
    SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = v_texto::uuid;
    IF FOUND AND NOT (v_actor.ve_todo OR v_texto::uuid = ANY (v_actor.segmentos)) THEN
      RAISE EXCEPTION 'No puedes crear grupos en %: no es uno de tus segmentos', v_segmento_nombre USING ERRCODE = '42501';
    END IF;
  END IF;

  v_datos := public.planner_paso_validar_grupo(p_temporada_id, NULL, p_datos);
  v_tipado := jsonb_populate_record(NULL::public.grupos, jsonb_build_object(
    'dia_reunion', coalesce(v_datos->>'dia_reunion', 'Jueves'),
    'hora_reunion', coalesce(v_datos->>'hora_reunion', '19:30')));
  v_antes := public.planner_paso_foto(ARRAY[v_id], '[]'::jsonb);

  INSERT INTO public.grupos (
    id, nombre, temporada_id, segmento_id, localidad_id, campus_id, capacidad_maxima, dia_reunion, hora_reunion,
    estado_ciclo, estado_aprobacion, activo, eliminado, creado_por_usuario_id
  )
  VALUES (
    v_id, v_datos->>'nombre', p_temporada_id, (v_datos->>'segmento_id')::uuid, (v_datos->>'localidad_id')::uuid,
    coalesce((v_datos->>'campus_id')::uuid, (SELECT s.campus_id FROM public.segmentos s WHERE s.id = (v_datos->>'segmento_id')::uuid)),
    coalesce((v_datos->>'capacidad_maxima')::integer, 12), v_tipado.dia_reunion, v_tipado.hora_reunion,
    'proximo', 'pendiente', false, false, v_actor.usuario_id
  );
  INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
  SELECT v_id, (d #>> '{}')::uuid FROM jsonb_array_elements(v_datos->'directores') d;

  v_despues := public.planner_paso_foto(ARRAY[v_id], '[]'::jsonb);
  v_descripcion := format('creó el grupo %s', v_datos->>'nombre');

  RETURN public.planner_paso_registrar(p_temporada_id, v_actor.usuario_id, 'crear_grupo', ARRAY[v_id], '{}',
                                       v_antes, v_despues, v_descripcion)
         || jsonb_build_object('grupo_id', v_id, 'descripcion', v_descripcion, 'despues', v_despues);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'No se pudo crear el grupo: ya existe un grupo con ese nombre en el segmento' USING ERRCODE = '22023';
END;
$function$;

COMMENT ON FUNCTION public.planner_crear_grupo(uuid, jsonb) IS
  'Planificador de GDV: crea un grupo en la temporada (nombre libre único por segmento S4, segmento, localidad que fija el campus S3, día, '
  'hora, capacidad, 0 a 4 directores de etapa). Nace proximo, inactivo y pendiente. Director de etapa: solo en sus segmentos (S10). Registra un paso.';

REVOKE ALL ON FUNCTION public.planner_crear_grupo(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_crear_grupo(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_editar_grupo(p_grupo_id uuid, p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_re_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_actor record;
  v_temporada_id uuid;
  v_estado text;
  v_grupo public.grupos;
  v_segmento_nombre text;
  v_texto text;
  v_datos jsonb;
  v_tipado public.grupos;
  v_campos text[] := '{}';
  v_sl uuid[];
  v_antes jsonb;
  v_despues jsonb;
  v_descripcion text;
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  SELECT g.temporada_id INTO v_temporada_id FROM public.grupos g WHERE g.id = p_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El grupo no existe o fue eliminado' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || v_temporada_id::text, 0));
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = v_temporada_id FOR SHARE;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'La temporada no está en planificación' USING ERRCODE = '22023';
  END IF;
  SELECT g.* INTO v_grupo FROM public.grupos g WHERE g.id = p_grupo_id FOR UPDATE;
  IF v_grupo.eliminado THEN
    RAISE EXCEPTION 'El grupo no existe o fue eliminado' USING ERRCODE = '22023';
  END IF;
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = v_grupo.segmento_id;
  IF NOT (v_actor.ve_todo OR v_grupo.segmento_id = ANY (v_actor.segmentos)) THEN
    RAISE EXCEPTION 'No puedes cambiar %: es de otro segmento (%)', v_grupo.nombre, v_segmento_nombre USING ERRCODE = '42501';
  END IF;
  v_texto := CASE WHEN jsonb_typeof(p_cambios) = 'object' THEN p_cambios->>'segmento_id' END;
  IF v_texto ~ v_re_uuid THEN
    SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = v_texto::uuid;
    IF FOUND AND NOT (v_actor.ve_todo OR v_texto::uuid = ANY (v_actor.segmentos)) THEN
      RAISE EXCEPTION 'No puedes mover grupos a %: no es uno de tus segmentos', v_segmento_nombre USING ERRCODE = '42501';
    END IF;
  END IF;

  v_datos := public.planner_paso_validar_grupo(v_temporada_id, p_grupo_id, p_cambios);

  IF v_datos ? 'nombre' AND v_datos->>'nombre' IS DISTINCT FROM v_grupo.nombre THEN v_campos := v_campos || 'nombre'::text; END IF;
  IF v_datos ? 'segmento_id' AND (v_datos->>'segmento_id')::uuid IS DISTINCT FROM v_grupo.segmento_id THEN v_campos := v_campos || 'segmento'::text; END IF;
  IF v_datos ? 'localidad_id' AND (v_datos->>'localidad_id')::uuid IS DISTINCT FROM v_grupo.localidad_id THEN v_campos := v_campos || 'localidad'::text; END IF;
  IF v_datos ? 'dia_reunion' AND v_datos->>'dia_reunion' IS DISTINCT FROM v_grupo.dia_reunion::text THEN v_campos := v_campos || 'día'::text; END IF;
  IF v_datos ? 'hora_reunion' AND v_datos->>'hora_reunion' IS DISTINCT FROM v_grupo.hora_reunion::text THEN v_campos := v_campos || 'hora'::text; END IF;
  IF v_datos ? 'capacidad_maxima' AND (v_datos->>'capacidad_maxima')::integer IS DISTINCT FROM v_grupo.capacidad_maxima THEN
    v_campos := v_campos || 'capacidad'::text;
  END IF;
  IF v_datos ? 'directores' AND v_datos->'directores' IS DISTINCT FROM (
    SELECT coalesce(jsonb_agg(d.director_etapa_id ORDER BY d.director_etapa_id::text), '[]'::jsonb)
      FROM public.director_etapa_grupos d WHERE d.grupo_id = p_grupo_id
  ) THEN
    v_campos := v_campos || 'directores de etapa'::text;
  END IF;
  IF cardinality(v_campos) = 0 THEN
    RAISE EXCEPTION 'No hay cambios para guardar' USING ERRCODE = '22023';
  END IF;

  v_antes := public.planner_paso_foto(ARRAY[p_grupo_id], '[]'::jsonb);
  v_tipado := jsonb_populate_record(NULL::public.grupos, v_datos - 'directores');
  -- Solo las claves enviadas; activo y estado_ciclo nunca (S8).
  UPDATE public.grupos g
     SET nombre = CASE WHEN v_datos ? 'nombre' THEN v_tipado.nombre ELSE g.nombre END,
         segmento_id = CASE WHEN v_datos ? 'segmento_id' THEN v_tipado.segmento_id ELSE g.segmento_id END,
         localidad_id = CASE WHEN v_datos ? 'localidad_id' THEN v_tipado.localidad_id ELSE g.localidad_id END,
         campus_id = CASE WHEN v_datos ? 'campus_id' THEN v_tipado.campus_id ELSE g.campus_id END,
         dia_reunion = CASE WHEN v_datos ? 'dia_reunion' THEN v_tipado.dia_reunion ELSE g.dia_reunion END,
         hora_reunion = CASE WHEN v_datos ? 'hora_reunion' THEN v_tipado.hora_reunion ELSE g.hora_reunion END,
         capacidad_maxima = CASE WHEN v_datos ? 'capacidad_maxima' THEN v_tipado.capacidad_maxima ELSE g.capacidad_maxima END,
         updated_at = now()
   WHERE g.id = p_grupo_id;
  IF v_datos ? 'directores' THEN
    v_sl := ARRAY(SELECT (d #>> '{}')::uuid FROM jsonb_array_elements(v_datos->'directores') d);
    DELETE FROM public.director_etapa_grupos d WHERE d.grupo_id = p_grupo_id AND NOT (d.director_etapa_id = ANY (v_sl));
    INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
    SELECT p_grupo_id, s FROM unnest(v_sl) s
     WHERE NOT EXISTS (SELECT 1 FROM public.director_etapa_grupos d WHERE d.grupo_id = p_grupo_id AND d.director_etapa_id = s);
  END IF;
  v_despues := public.planner_paso_foto(ARRAY[p_grupo_id], '[]'::jsonb);
  v_descripcion := format('editó el grupo %s (%s)', coalesce(v_datos->>'nombre', v_grupo.nombre), public.planner_paso_lista(v_campos));

  RETURN public.planner_paso_registrar(v_temporada_id, v_actor.usuario_id, 'editar_grupo', ARRAY[p_grupo_id], '{}',
                                       v_antes, v_despues, v_descripcion)
         || jsonb_build_object('grupo_id', p_grupo_id, 'descripcion', v_descripcion, 'despues', v_despues);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'No se pudo editar el grupo: ya existe un grupo con ese nombre en el segmento' USING ERRCODE = '22023';
END;
$function$;

COMMENT ON FUNCTION public.planner_editar_grupo(uuid, jsonb) IS
  'Planificador de GDV: edición parcial de un grupo de la temporada (solo las claves enviadas: nombre, segmento_id, localidad_id, '
  'dia_reunion, hora_reunion, capacidad_maxima, director_etapa_ids). Nunca toca activo ni estado_ciclo (S8). Director de etapa: solo en sus '
  'segmentos (S10). Registra un paso y aplica S17.';

REVOKE ALL ON FUNCTION public.planner_editar_grupo(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_editar_grupo(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_eliminar_grupo(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_temporada_id uuid;
  v_estado text;
  v_grupo public.grupos;
  v_segmento_nombre text;
  v_usuarios uuid[];
  v_pares jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_descripcion text;
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  SELECT g.temporada_id INTO v_temporada_id FROM public.grupos g WHERE g.id = p_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El grupo no existe o fue eliminado' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || v_temporada_id::text, 0));
  SELECT t.estado INTO v_estado FROM public.temporadas t WHERE t.id = v_temporada_id FOR SHARE;
  IF lower(btrim(coalesce(v_estado, ''))) <> 'planificacion' THEN
    RAISE EXCEPTION 'La temporada no está en planificación' USING ERRCODE = '22023';
  END IF;
  SELECT g.* INTO v_grupo FROM public.grupos g WHERE g.id = p_grupo_id FOR UPDATE;
  IF v_grupo.eliminado THEN
    RAISE EXCEPTION 'El grupo no existe o fue eliminado' USING ERRCODE = '22023';
  END IF;
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = v_grupo.segmento_id;
  IF NOT (v_actor.ve_todo OR v_grupo.segmento_id = ANY (v_actor.segmentos)) THEN
    RAISE EXCEPTION 'No puedes cambiar %: es de otro segmento (%)', v_grupo.nombre, v_segmento_nombre USING ERRCODE = '42501';
  END IF;

  -- Personas vigentes del grupo, que vuelven al banco.
  SELECT coalesce(array_agg(gm.usuario_id ORDER BY u.apellido, u.nombre, u.id), '{}') INTO v_usuarios
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
   WHERE gm.grupo_id = p_grupo_id
     AND gm.fecha_salida IS NULL
     AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado');
  SELECT coalesce(jsonb_agg(jsonb_build_object('grupo_id', p_grupo_id, 'usuario_id', x)), '[]'::jsonb) INTO v_pares FROM unnest(v_usuarios) x;
  v_antes := public.planner_paso_foto(ARRAY[p_grupo_id], v_pares);

  UPDATE public.grupos g
     SET eliminado = true,
         activo = false,
         -- El índice único cuenta las filas eliminadas: se renombra para liberar el nombre.
         nombre = g.nombre || ' [eliminado ' || substr(md5(g.id::text), 1, 8) || ']',
         updated_at = now()
   WHERE g.id = p_grupo_id;
  DELETE FROM public.grupo_miembros gm
   WHERE gm.grupo_id = p_grupo_id
     AND gm.usuario_id = ANY (v_usuarios);
  v_despues := public.planner_paso_foto(ARRAY[p_grupo_id], v_pares);

  v_descripcion := 'eliminó el grupo ' || v_grupo.nombre || CASE
    WHEN cardinality(v_usuarios) = 0 THEN ''
    WHEN cardinality(v_usuarios) <= 3 THEN ' y devolvió a ' || public.planner_paso_lista(ARRAY(
      SELECT u.nombre || ' ' || u.apellido FROM unnest(v_usuarios) WITH ORDINALITY x(id, o) JOIN public.usuarios u ON u.id = x.id ORDER BY x.o))
      || ' al banco'
    ELSE ' y devolvió a ' || cardinality(v_usuarios) || ' personas al banco'
  END;

  RETURN public.planner_paso_registrar(v_temporada_id, v_actor.usuario_id, 'eliminar_grupo', ARRAY[p_grupo_id], v_usuarios,
                                       v_antes, v_despues, v_descripcion)
         || jsonb_build_object('grupo_id', p_grupo_id, 'descripcion', v_descripcion, 'despues', v_despues);
END;
$function$;

COMMENT ON FUNCTION public.planner_eliminar_grupo(uuid) IS
  'Planificador de GDV: baja lógica de un grupo de la temporada (eliminado, inactivo, renombrado para liberar el nombre); sus personas vuelven '
  'al banco (se borran sus filas; el paso las guarda completas). Director de etapa: solo en sus segmentos (S10). Registra un paso y aplica S17.';

REVOKE ALL ON FUNCTION public.planner_eliminar_grupo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_eliminar_grupo(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_deshacer_paso(p_paso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_paso public.planner_pasos;
  v_no record;
  v_g jsonb;
  v_choque text;
  v_grupos uuid[];
  v_antes jsonb;
  v_despues jsonb;
  v_autor text;
  v_descripcion text;
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  SELECT p.* INTO v_paso FROM public.planner_pasos p WHERE p.id = p_paso_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El paso no existe' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planner_pasos:' || v_paso.temporada_id::text, 0));
  PERFORM 1 FROM public.temporadas t WHERE t.id = v_paso.temporada_id FOR SHARE;
  SELECT p.* INTO v_paso FROM public.planner_pasos p WHERE p.id = p_paso_id FOR UPDATE;

  -- S15: admin, pastor y director general (ve_todo) deshacen cualquier paso; el resto, los suyos.
  SELECT m.codigo, m.motivo INTO v_no FROM public.planner_paso_motivo_no_deshacer(p_paso_id, v_actor.usuario_id, v_actor.ve_todo) m;
  IF v_no.codigo IS NOT NULL THEN
    RAISE EXCEPTION '%', v_no.motivo USING ERRCODE = v_no.codigo;
  END IF;

  -- Un grupo que vuelve a estar vigente recupera su nombre: no debe haberlo tomado otro.
  FOR v_g IN SELECT e FROM jsonb_array_elements(coalesce(v_paso.antes->'grupos', '[]'::jsonb)) e
              WHERE (e->>'existia')::boolean AND NOT (e->>'eliminado')::boolean LOOP
    SELECT g.nombre || '» en ' || s.nombre INTO v_choque
      FROM public.grupos g JOIN public.segmentos s ON s.id = g.segmento_id
     WHERE g.temporada_id = v_paso.temporada_id
       AND g.segmento_id = (v_g->>'segmento_id')::uuid
       AND g.id <> (v_g->>'id')::uuid
       AND lower(regexp_replace(btrim(g.nombre), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_g->>'nombre'), '\s+', ' ', 'g'))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'No se puede deshacer: ya existe un grupo llamado «% en esta temporada', v_choque USING ERRCODE = '40001';
    END IF;
  END LOOP;

  v_grupos := ARRAY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(coalesce(v_paso.despues->'grupos', '[]'::jsonb)) e);
  v_antes := public.planner_paso_foto(v_grupos, v_paso.despues->'miembros');
  PERFORM public.planner_paso_aplicar(v_paso.antes);
  v_despues := public.planner_paso_foto(v_grupos, v_paso.despues->'miembros');

  SELECT coalesce(nullif(btrim(u.nombre || ' ' || u.apellido), ''), 'alguien') INTO v_autor FROM public.usuarios u WHERE u.id = v_paso.actor;
  v_descripcion := format('deshizo el paso de %s: %s', coalesce(v_autor, 'alguien'), v_paso.descripcion);

  RETURN public.planner_paso_registrar(v_paso.temporada_id, v_actor.usuario_id, 'deshacer', v_paso.grupo_ids, v_paso.usuario_ids,
                                       v_antes, v_despues, v_descripcion, v_paso.id)
         || jsonb_build_object('deshace_paso_id', v_paso.id, 'descripcion', v_descripcion, 'despues', v_despues);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'No se puede deshacer: un nombre de grupo o una asignación ya existe' USING ERRCODE = '40001';
END;
$function$;

COMMENT ON FUNCTION public.planner_deshacer_paso(uuid) IS
  'Planificador de GDV (S15): deshace un paso restaurando su foto de antes. El autor dentro de 24 horas; admin, pastor y director general '
  'cualquiera de la temporada. Rechaza con el motivo si ya se deshizo, es un deshacer, la temporada no está en planificación, un paso '
  'posterior tocó lo mismo (40001) o cambió fuera del planificador (40001). Es un paso propio y aplica S17.';

REVOKE ALL ON FUNCTION public.planner_deshacer_paso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_deshacer_paso(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_historial(
  p_temporada_id uuid,
  p_limite integer DEFAULT 100,
  p_antes timestamptz DEFAULT NULL
)
RETURNS TABLE (
  paso_id             uuid,
  numero              bigint,
  accion              text,
  descripcion         text,
  creado_en           timestamptz,
  actor_id            uuid,
  actor_nombre        text,
  segmentos           jsonb,
  grupo_ids           uuid[],
  usuario_ids         uuid[],
  deshace_paso_id     uuid,
  deshecho_por        uuid,
  deshecho_por_nombre text,
  puede_deshacer      boolean,
  motivo_no_deshacer  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_actor record;
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
BEGIN
  SELECT a.usuario_id, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH pasos AS (
    SELECT p.*
      FROM public.planner_pasos p
     WHERE p.temporada_id = p_temporada_id
       AND (v_actor.ve_todo OR p.segmento_ids && v_actor.segmentos)
       AND (p_antes IS NULL OR p.creado_en < p_antes)
     ORDER BY p.creado_en DESC, p.numero DESC
     LIMIT v_limite
  )
  SELECT p.id, p.numero, p.accion, p.descripcion, p.creado_en, p.actor,
         coalesce(nullif(btrim(u.nombre || ' ' || u.apellido), ''), 'alguien'),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre, s.id), '[]'::jsonb)
            FROM public.segmentos s WHERE s.id = ANY (p.segmento_ids)),
         p.grupo_ids, p.usuario_ids, p.deshace_paso_id, p.deshecho_por,
         CASE WHEN d.id IS NOT NULL THEN coalesce(nullif(btrim(du.nombre || ' ' || du.apellido), ''), 'alguien') END,
         m.codigo IS NULL, m.motivo
    FROM pasos p
    LEFT JOIN public.usuarios u ON u.id = p.actor
    LEFT JOIN public.planner_pasos d ON d.id = p.deshecho_por
    LEFT JOIN public.usuarios du ON du.id = d.actor
    CROSS JOIN LATERAL public.planner_paso_motivo_no_deshacer(p.id, v_actor.usuario_id, v_actor.ve_todo) m
   ORDER BY p.creado_en DESC, p.numero DESC;
END;
$function$;

COMMENT ON FUNCTION public.planner_historial(uuid, integer, timestamptz) IS
  'Planificador de GDV (S13, S15): pasos de la temporada del más nuevo al más viejo (límite 1 a 500, antes de una fecha para paginar), con '
  'actor, descripción, segmentos, deshecho/deshace y puede_deshacer con su motivo para quien consulta. Director de etapa: pasos que tocan sus '
  'segmentos; admin, pastor y director general: todos. 22023 si la temporada no existe.';

REVOKE ALL ON FUNCTION public.planner_historial(uuid, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_historial(uuid, integer, timestamptz) TO authenticated, service_role;
