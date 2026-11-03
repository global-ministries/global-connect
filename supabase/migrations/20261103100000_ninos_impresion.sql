-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: print queue for the check-in labels (odd/tasks/ninos-v2.md, S10, task N6b).
--
-- Any device at the desk confirms the ingreso; the server queues the labels;
-- a print agent on the computer that has the printer claims them and prints
-- them with no dialog (tools/agente-impresion/, N6c). Flow and agent API:
-- docs/ninos/impresion.md.
--
-- What:
--   1. ninos_estaciones_impresion: one per desk printer. campus, nombre, label
--      size in mm (ancho_mm / alto_mm, both NULL until the roll is measured),
--      dpi (203 or 300), activa, ultima_conexion. The agent authenticates with
--      a per-station secret token (64 hex chars from gen_random_bytes(32)),
--      returned once by crear / rotar_token and stored only as its sha256 hex.
--   2. ninos_impresiones: the jobs. One 'nino' label per child check-in and
--      one 'representante' label per family visit (código). The payload is
--      built here from the database, never from client text:
--        nino:          nombre, apellido, codigo, salon, area, alergias (bool),
--                       fecha, servicio (turno nombre), hora
--        representante: codigo, ninos (first names), areas, fecha, servicio, hora
--      No phone, cédula, allergy text or medical notes. estado pendiente →
--      impresa | error; intentos counts claims.
--   3. RLS on both with no policies and no table privileges for anon or
--      authenticated: everything goes through the definer RPCs below.
--   4. People (authenticated):
--        ninos_impresion_estaciones()                    stations of the campuses
--                                                        where I operate Niños
--        ninos_impresion_estacion_crear(...)             } admin: ninos_puede_configurar
--        ninos_impresion_estacion_rotar_token(uuid)      } on a room of the campus (the
--        ninos_impresion_estacion_actualizar(...)        } authority that manages salones)
--        ninos_impresion_encolar(estacion, turno, fecha, ninos)   after ninos_checkin
--        ninos_impresion_reimprimir(estacion, turno, fecha, codigo, tipo, nino)
--      Enqueue / reprint need ninos_puede_operar on the room of every check-in
--      (same as ninos_checkin) and a station of the same campus; only open
--      check-ins (salida_at IS NULL) get labels.
--   5. Agent (service_role only; the route handler hashes the Bearer token):
--        ninos_impresion_agente_estacion(token_hash)    active station + size,
--                                                       touches ultima_conexion
--        ninos_impresion_agente_reclamar(estacion, max) claims pending jobs
--          (FOR UPDATE SKIP LOCKED); a claim older than 2 minutes without a
--          report is claimed again; after 5 claims it becomes error
--          'sin_respuesta'; a job not printed within 12 hours becomes error
--          'vencida' (no labels from an old service).
--        ninos_impresion_agente_reportar(estacion, job, estado, error)
--
-- Errors: sin_autoridad (42501); datos_invalidos, estacion_no_encontrada,
-- estacion_inactiva, checkin_no_encontrado, trabajo_no_encontrado (22023).
-- A station or check-in outside the caller's scope is "no encontrada".
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_impresion_agente_reportar(uuid, uuid, text, text),
--     public.ninos_impresion_agente_reclamar(uuid, integer),
--     public.ninos_impresion_agente_estacion(text),
--     public.ninos_impresion_reimprimir(uuid, uuid, date, text, text, uuid),
--     public.ninos_impresion_encolar(uuid, uuid, date, uuid[]),
--     public.ninos_impresion_insertar(uuid, uuid[], boolean, boolean),
--     public.ninos_impresion_estacion_actualizar(uuid, text, numeric, numeric, integer, boolean),
--     public.ninos_impresion_estacion_rotar_token(uuid),
--     public.ninos_impresion_estacion_crear(uuid, text, numeric, numeric, integer),
--     public.ninos_impresion_estaciones(),
--     public.ninos_impresion_estacion_fila(public.ninos_estaciones_impresion),
--     public.ninos_impresion_medidas_validas(numeric, numeric, integer),
--     public.ninos_impresion_estacion_operable(uuid),
--     public.ninos_impresion_puede_administrar(uuid),
--     public.ninos_impresion_puede_operar(uuid),
--     public.ninos_impresion_nuevo_token();
--   DROP TABLE IF EXISTS public.ninos_impresiones, public.ninos_estaciones_impresion;

-- ── 1–2. tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_estaciones_impresion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  nombre text NOT NULL CHECK (btrim(nombre) <> '' AND char_length(nombre) <= 60),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ancho_mm numeric(5, 1) CHECK (ancho_mm BETWEEN 20 AND 120),
  alto_mm numeric(5, 1) CHECK (alto_mm BETWEEN 10 AND 300),
  dpi integer NOT NULL DEFAULT 203 CHECK (dpi IN (203, 300)),
  activa boolean NOT NULL DEFAULT true,
  ultima_conexion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CHECK ((ancho_mm IS NULL) = (alto_mm IS NULL))
);
CREATE INDEX IF NOT EXISTS ninos_estaciones_impresion_campus_idx ON public.ninos_estaciones_impresion (campus_id);
CREATE INDEX IF NOT EXISTS ninos_estaciones_impresion_created_by_idx ON public.ninos_estaciones_impresion (created_by);

CREATE TABLE IF NOT EXISTS public.ninos_impresiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estacion_id uuid NOT NULL REFERENCES public.ninos_estaciones_impresion(id) ON DELETE CASCADE,
  checkin_id uuid NOT NULL REFERENCES public.ninos_checkins(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('nino', 'representante')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'impresa', 'error')),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  error text CHECK (char_length(error) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  reclamada_at timestamptz,
  impresa_at timestamptz
);
-- The agent's poll: pending jobs of one station, oldest first.
CREATE INDEX IF NOT EXISTS ninos_impresiones_pendientes_idx
  ON public.ninos_impresiones (estacion_id, created_at) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS ninos_impresiones_checkin_idx ON public.ninos_impresiones (checkin_id);
CREATE INDEX IF NOT EXISTS ninos_impresiones_created_by_idx ON public.ninos_impresiones (created_by);

-- ── 3. RLS and privileges ────────────────────────────────────────────

ALTER TABLE public.ninos_estaciones_impresion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_impresiones ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; no direct access.
REVOKE ALL ON public.ninos_estaciones_impresion, public.ninos_impresiones FROM PUBLIC, anon, authenticated;

-- ── internal helpers ─────────────────────────────────────────────────

-- 64 hex chars (32 random bytes). pgcrypto lives in the extensions schema.
CREATE OR REPLACE FUNCTION public.ninos_impresion_nuevo_token()
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- Operate Niños on some active room of the campus (or admin/pastor).
CREATE OR REPLACE FUNCTION public.ninos_impresion_puede_operar(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_campus_id IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR EXISTS (SELECT 1 FROM public.ninos_salones s
                WHERE s.campus_id = p_campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
  );
$$;

-- Manage the stations of a campus: the authority that manages its rooms
-- (ninos_salones RLS: ninos_puede_configurar on the room equipo), or admin/pastor.
CREATE OR REPLACE FUNCTION public.ninos_impresion_puede_administrar(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_campus_id IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR EXISTS (SELECT 1 FROM public.ninos_salones s
                WHERE s.campus_id = p_campus_id AND s.activo AND public.ninos_puede_configurar(s.equipo_id))
  );
$$;

-- The caller may print to this station: it exists in an operable campus and is active.
CREATE OR REPLACE FUNCTION public.ninos_impresion_estacion_operable(p_estacion_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_campus uuid;
  v_activa boolean;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT e.campus_id, e.activa INTO v_campus, v_activa
    FROM public.ninos_estaciones_impresion e WHERE e.id = p_estacion_id;
  IF v_campus IS NULL OR NOT public.ninos_impresion_puede_operar(v_campus) THEN
    RAISE EXCEPTION 'estacion_no_encontrada' USING ERRCODE = '22023';
  END IF;
  IF NOT v_activa THEN
    RAISE EXCEPTION 'estacion_inactiva' USING ERRCODE = '22023';
  END IF;
  RETURN v_campus;
END;
$$;

-- Label size: both NULL (unknown roll) or both set within the printer range.
CREATE OR REPLACE FUNCTION public.ninos_impresion_medidas_validas(p_ancho_mm numeric, p_alto_mm numeric, p_dpi integer)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT coalesce(p_dpi IN (203, 300)
                  AND ((p_ancho_mm IS NULL AND p_alto_mm IS NULL)
                       OR (p_ancho_mm BETWEEN 20 AND 120 AND p_alto_mm BETWEEN 10 AND 300)), false);
$$;

-- The public shape of a station (never the token hash).
CREATE OR REPLACE FUNCTION public.ninos_impresion_estacion_fila(e public.ninos_estaciones_impresion)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT jsonb_build_object('id', e.id, 'campus_id', e.campus_id, 'nombre', e.nombre,
                            'ancho_mm', e.ancho_mm, 'alto_mm', e.alto_mm, 'dpi', e.dpi,
                            'activa', e.activa, 'ultima_conexion', e.ultima_conexion);
$$;

-- Queues the labels of open check-ins on a station: one 'nino' per check-in
-- (p_ninos) and one 'representante' per family visit (p_representantes).
-- Callers validate the station first; the checks are repeated here.
CREATE OR REPLACE FUNCTION public.ninos_impresion_insertar(
  p_estacion_id uuid, p_checkin_ids uuid[], p_ninos boolean, p_representantes boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_campus uuid := public.ninos_impresion_estacion_operable(p_estacion_id);
  v_actor uuid := public.ninos_usuario_actual();
  v_ninos integer := 0;
  v_representantes integer := 0;
BEGIN
  IF p_checkin_ids IS NULL OR cardinality(p_checkin_ids) = 0 THEN
    RAISE EXCEPTION 'checkin_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_checkin_ids) AS x(id)
    LEFT JOIN public.ninos_checkins c ON c.id = x.id
    LEFT JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.id IS NULL OR c.salida_at IS NOT NULL OR c.campus_id <> v_campus
       OR NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'checkin_no_encontrado' USING ERRCODE = '22023';
  END IF;

  IF p_ninos THEN
    INSERT INTO public.ninos_impresiones (estacion_id, checkin_id, tipo, payload, created_by)
    SELECT p_estacion_id, c.id, 'nino',
           jsonb_build_object('nombre', u.nombre, 'apellido', coalesce(u.apellido, ''), 'codigo', c.codigo,
                              'salon', s.nombre, 'area', s.area,
                              'alergias', coalesce(btrim(f.alergias), '') <> '',
                              'fecha', c.fecha, 'servicio', t.nombre, 'hora', to_char(t.hora, 'HH24:MI')),
           v_actor
      FROM public.ninos_checkins c
      JOIN public.usuarios u ON u.id = c.nino_id
      JOIN public.ninos_salones s ON s.id = c.salon_id
      JOIN public.dream_team_turnos t ON t.id = c.turno_id
      LEFT JOIN public.ninos_fichas f ON f.usuario_id = c.nino_id
     WHERE c.id = ANY (p_checkin_ids);
    GET DIAGNOSTICS v_ninos = ROW_COUNT;
  END IF;

  IF p_representantes THEN
    INSERT INTO public.ninos_impresiones (estacion_id, checkin_id, tipo, payload, created_by)
    SELECT p_estacion_id, (array_agg(c.id ORDER BY u.nombre, c.id))[1], 'representante',
           jsonb_build_object('codigo', min(c.codigo),
                              'ninos', jsonb_agg(u.nombre ORDER BY u.nombre, c.id),
                              'areas', jsonb_agg(DISTINCT s.area ORDER BY s.area),
                              'fecha', min(c.fecha), 'servicio', min(t.nombre),
                              'hora', to_char(min(t.hora), 'HH24:MI')),
           v_actor
      FROM public.ninos_checkins c
      JOIN public.usuarios u ON u.id = c.nino_id
      JOIN public.ninos_salones s ON s.id = c.salon_id
      JOIN public.dream_team_turnos t ON t.id = c.turno_id
     WHERE c.id = ANY (p_checkin_ids)
     GROUP BY c.visita_id;
    GET DIAGNOSTICS v_representantes = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ninos', v_ninos, 'representantes', v_representantes);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_impresion_nuevo_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_puede_operar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_puede_administrar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_estacion_operable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_medidas_validas(numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_estacion_fila(public.ninos_estaciones_impresion) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_insertar(uuid, uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;

-- ── 4. people: stations ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_impresion_estaciones()
RETURNS TABLE (id uuid, campus_id uuid, nombre text, ancho_mm numeric, alto_mm numeric, dpi integer,
               activa boolean, ultima_conexion timestamptz, pendientes integer, puede_administrar boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF public.ninos_usuario_actual() IS NULL
     OR NOT (public.ninos_puede_operar_algun_area() OR public.es_admin_o_pastor(auth.uid())) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.campus_id, e.nombre, e.ancho_mm, e.alto_mm, e.dpi, e.activa, e.ultima_conexion,
         (SELECT count(*)::int FROM public.ninos_impresiones i WHERE i.estacion_id = e.id AND i.estado = 'pendiente'),
         public.ninos_impresion_puede_administrar(e.campus_id)
    FROM public.ninos_estaciones_impresion e
   WHERE public.ninos_impresion_puede_operar(e.campus_id)
   ORDER BY e.nombre, e.id;
END;
$$;

-- Returns { estacion, token }; the token is never stored nor shown again.
CREATE OR REPLACE FUNCTION public.ninos_impresion_estacion_crear(
  p_campus_id uuid, p_nombre text, p_ancho_mm numeric, p_alto_mm numeric, p_dpi integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_token text := public.ninos_impresion_nuevo_token();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_dpi integer := coalesce(p_dpi, 203);
  v_estacion public.ninos_estaciones_impresion%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.ninos_impresion_puede_administrar(p_campus_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_nombre = '' OR char_length(v_nombre) > 60
     OR NOT public.ninos_impresion_medidas_validas(p_ancho_mm, p_alto_mm, v_dpi) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ninos_estaciones_impresion (campus_id, nombre, token_hash, ancho_mm, alto_mm, dpi, created_by)
  VALUES (p_campus_id, v_nombre, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_ancho_mm, p_alto_mm, v_dpi, v_actor)
  RETURNING * INTO v_estacion;

  RETURN jsonb_build_object('estacion', public.ninos_impresion_estacion_fila(v_estacion), 'token', v_token);
END;
$$;

-- A new token; the old one stops working at once.
CREATE OR REPLACE FUNCTION public.ninos_impresion_estacion_rotar_token(p_estacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token text := public.ninos_impresion_nuevo_token();
  v_estacion public.ninos_estaciones_impresion%ROWTYPE;
BEGIN
  SELECT * INTO v_estacion FROM public.ninos_estaciones_impresion e WHERE e.id = p_estacion_id;
  IF public.ninos_usuario_actual() IS NULL OR NOT FOUND
     OR NOT public.ninos_impresion_puede_administrar(v_estacion.campus_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ninos_estaciones_impresion e
     SET token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
   WHERE e.id = p_estacion_id
  RETURNING * INTO v_estacion;

  RETURN jsonb_build_object('estacion', public.ninos_impresion_estacion_fila(v_estacion), 'token', v_token);
END;
$$;

-- Replaces name, label size (NULL/NULL = unknown roll), dpi and activa.
CREATE OR REPLACE FUNCTION public.ninos_impresion_estacion_actualizar(
  p_estacion_id uuid, p_nombre text, p_ancho_mm numeric, p_alto_mm numeric, p_dpi integer, p_activa boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_estacion public.ninos_estaciones_impresion%ROWTYPE;
BEGIN
  SELECT * INTO v_estacion FROM public.ninos_estaciones_impresion e WHERE e.id = p_estacion_id;
  IF public.ninos_usuario_actual() IS NULL OR NOT FOUND
     OR NOT public.ninos_impresion_puede_administrar(v_estacion.campus_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_nombre = '' OR char_length(v_nombre) > 60 OR p_activa IS NULL
     OR NOT public.ninos_impresion_medidas_validas(p_ancho_mm, p_alto_mm, p_dpi) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ninos_estaciones_impresion e
     SET nombre = v_nombre, ancho_mm = p_ancho_mm, alto_mm = p_alto_mm, dpi = p_dpi, activa = p_activa
   WHERE e.id = p_estacion_id
  RETURNING * INTO v_estacion;

  RETURN public.ninos_impresion_estacion_fila(v_estacion);
END;
$$;

-- ── 4. people: enqueue and reprint ───────────────────────────────────

-- After ninos_checkin (which returns no check-in ids): the open check-ins of
-- those children in that service. Returns { ninos, representantes }.
CREATE OR REPLACE FUNCTION public.ninos_impresion_encolar(
  p_estacion_id uuid, p_turno_id uuid, p_fecha date, p_nino_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM public.ninos_impresion_estacion_operable(p_estacion_id);
  IF p_nino_ids IS NULL OR cardinality(p_nino_ids) = 0 OR cardinality(p_nino_ids) > 20
     OR p_turno_id IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(c.id) INTO v_ids
    FROM public.ninos_checkins c
   WHERE c.nino_id = ANY (p_nino_ids) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL;
  IF v_ids IS NULL OR cardinality(v_ids) <> (SELECT count(DISTINCT n) FROM unnest(p_nino_ids) AS n) THEN
    RAISE EXCEPTION 'checkin_no_encontrado' USING ERRCODE = '22023';
  END IF;

  RETURN public.ninos_impresion_insertar(p_estacion_id, v_ids, true, true);
END;
$$;

-- Reprint for an open family visit (código of the service):
--   'todas'          every child label + the parent label
--   'representante'  the parent label
--   'nino'           the label of p_nino_id
CREATE OR REPLACE FUNCTION public.ninos_impresion_reimprimir(
  p_estacion_id uuid, p_turno_id uuid, p_fecha date, p_codigo text, p_tipo text, p_nino_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM public.ninos_impresion_estacion_operable(p_estacion_id);
  IF p_tipo IS NULL OR p_tipo NOT IN ('todas', 'representante', 'nino') OR (p_tipo = 'nino') <> (p_nino_id IS NOT NULL)
     OR p_codigo IS NULL OR p_codigo !~ '^[0-9]{3,4}$' OR p_turno_id IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(c.id) INTO v_ids
    FROM public.ninos_checkins c
   WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
     AND (p_nino_id IS NULL OR c.nino_id = p_nino_id);
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'checkin_no_encontrado' USING ERRCODE = '22023';
  END IF;

  RETURN public.ninos_impresion_insertar(p_estacion_id, v_ids, p_tipo IN ('todas', 'nino'), p_tipo IN ('todas', 'representante'));
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_impresion_estaciones() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_impresion_estacion_crear(uuid, text, numeric, numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_impresion_estacion_rotar_token(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_impresion_estacion_actualizar(uuid, text, numeric, numeric, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_impresion_encolar(uuid, uuid, date, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_impresion_reimprimir(uuid, uuid, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_estaciones() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_estacion_crear(uuid, text, numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_estacion_rotar_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_estacion_actualizar(uuid, text, numeric, numeric, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_encolar(uuid, uuid, date, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_reimprimir(uuid, uuid, date, text, text, uuid) TO authenticated;

-- ── 5. agent (service_role) ──────────────────────────────────────────

-- The active station of a token hash with its label size, or NULL. Each call
-- is a heartbeat (ultima_conexion). The route compares token_hash in constant time.
CREATE OR REPLACE FUNCTION public.ninos_impresion_agente_estacion(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_estacion public.ninos_estaciones_impresion%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  UPDATE public.ninos_estaciones_impresion e
     SET ultima_conexion = now()
   WHERE e.token_hash = p_token_hash AND e.activa
  RETURNING * INTO v_estacion;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public.ninos_impresion_estacion_fila(v_estacion) || jsonb_build_object('token_hash', v_estacion.token_hash);
END;
$$;

-- Claims up to p_max (1–20) jobs, oldest first, and returns them as a jsonb
-- array of { id, tipo, payload, intentos, created_at }.
CREATE OR REPLACE FUNCTION public.ninos_impresion_agente_reclamar(p_estacion_id uuid, p_max integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c_reintento constant interval := interval '2 minutes';
  c_vigencia constant interval := interval '12 hours';
  c_max_intentos constant integer := 5;
  v_max integer := least(greatest(coalesce(p_max, 10), 1), 20);
  v_trabajos jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ninos_estaciones_impresion e WHERE e.id = p_estacion_id AND e.activa) THEN
    RAISE EXCEPTION 'estacion_no_encontrada' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ninos_impresiones i
     SET estado = 'error',
         error = CASE WHEN i.created_at < now() - c_vigencia THEN 'vencida' ELSE 'sin_respuesta' END
   WHERE i.estacion_id = p_estacion_id AND i.estado = 'pendiente'
     AND (i.created_at < now() - c_vigencia
          OR (i.intentos >= c_max_intentos AND i.reclamada_at < now() - c_reintento));

  WITH elegidos AS (
    SELECT i.id FROM public.ninos_impresiones i
     WHERE i.estacion_id = p_estacion_id AND i.estado = 'pendiente'
       AND (i.reclamada_at IS NULL OR i.reclamada_at < now() - c_reintento)
     ORDER BY i.created_at, i.id
     LIMIT v_max
     FOR UPDATE SKIP LOCKED
  ), reclamados AS (
    UPDATE public.ninos_impresiones i
       SET reclamada_at = now(), intentos = i.intentos + 1
      FROM elegidos
     WHERE i.id = elegidos.id
    RETURNING i.id, i.tipo, i.payload, i.intentos, i.created_at
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'tipo', r.tipo, 'payload', r.payload,
                                               'intentos', r.intentos, 'created_at', r.created_at)
                            ORDER BY r.created_at, r.id), '[]'::jsonb)
    INTO v_trabajos
    FROM reclamados r;

  RETURN v_trabajos;
END;
$$;

-- Reports a claimed job as 'impresa' or 'error'. A job already reported keeps
-- its first result (a retried report is a no-op). Returns { id, estado }.
CREATE OR REPLACE FUNCTION public.ninos_impresion_agente_reportar(
  p_estacion_id uuid, p_impresion_id uuid, p_estado text, p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_estado text;
BEGIN
  IF p_estado IS NULL OR p_estado NOT IN ('impresa', 'error') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT i.estado INTO v_estado FROM public.ninos_impresiones i
   WHERE i.id = p_impresion_id AND i.estacion_id = p_estacion_id AND i.reclamada_at IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trabajo_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_estado <> 'pendiente' THEN
    RETURN jsonb_build_object('id', p_impresion_id, 'estado', v_estado);
  END IF;

  UPDATE public.ninos_impresiones i
     SET estado = p_estado,
         impresa_at = CASE WHEN p_estado = 'impresa' THEN now() END,
         error = CASE WHEN p_estado = 'error' THEN coalesce(left(nullif(btrim(p_error), ''), 300), 'error') END
   WHERE i.id = p_impresion_id;

  RETURN jsonb_build_object('id', p_impresion_id, 'estado', p_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_impresion_agente_estacion(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_agente_reclamar(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_impresion_agente_reportar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_agente_estacion(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_agente_reclamar(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_agente_reportar(uuid, uuid, text, text) TO service_role;
