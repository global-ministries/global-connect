-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: "¿Vienen hoy?" in the public QR wizard (odd/tasks/ninos-precheck.md P4,
-- odd/tasks/ninos-pendientes-2.md T3).
--
-- A family without an account pre-registers at /ninos/registro and, as a last
-- optional step, tells the table which of today's services it is coming to.
-- The family has no ficha yet, so the notice cannot be a ninos_prechecks row
-- (those name a child). It is a notice on the pre-registration itself: the
-- table sees it in the same "Llegando" list (ninos_prechecks_pendientes) and
-- opens the pre-registration review, whose confirmation registers the family
-- and selects it for the usual ninos_checkin. Nothing counts as attendance and
-- the phone never gets a code.
--
-- Binding. The anonymous wizard has no session. When the route handler stores
-- the pre-registration it also sends the SHA-256 of a random 256-bit token it
-- generated; the wizard keeps the token in memory and the database keeps only
-- its hash. A notice needs the pre-registration id plus that token, the row
-- must still be pending and created today (Caracas), and the turno must be of
-- the pre-registration's campus and inside ninos_precheck_en_ventana (2 h
-- before to 2 h after its start). One notice per pre-registration per service.
-- Rate limit like the pre-registration: 5 per ip_hash per 10 minutes and 200
-- per campus per hour. A wrong id, token, state or day all read 'sin_autoridad'
-- so nothing tells which part was wrong.
--
-- What (definer functions, empty search path, fully qualified names):
--   1. ninos_preregistros.aviso_token_hash (sha-256 hex, NULL for rows stored
--      without a token).
--   2. ninos_preregistro_avisos (preregistro_id, turno_id, fecha, ip_hash,
--      created_at), unique (preregistro_id, turno_id, fecha). RLS on, no
--      client privileges.
--   3. ninos_preregistro_servicios_hoy(campus) → jsonb [{turno_id, nombre,
--      hora}]: the campus turnos in their window today. Internal.
--   4. ninos_preregistro_crear(campus, payload, ip_hash, token_hash) → jsonb
--      {estado: ok | limite, id, servicios}: the existing create (same checks,
--      lock and limits) that also stores the token hash and answers the row
--      id and today's services. id and servicios only when a token was given.
--      service_role only.
--      The 3-argument ninos_preregistro_crear keeps its contract ('ok' |
--      'limite') and delegates to it.
--   5. ninos_preregistro_avisar(id, token_hash, turno, ip_hash) → text
--      'ok' | 'limite'. service_role only. Errors: sin_autoridad (42501),
--      fuera_de_horario, ya_avisado (22023).
--   6. ninos_prechecks_pendientes(turno, fecha): also lists the pending
--      pre-registrations with a notice for that service, as
--      {tipo: 'preregistro', preregistro_id, padre: {nombre, apellido},
--      avisado_at, hijos: [{nombre, apellido, alergias,
--      necesidades_especiales}]}, behind the same gate (operate an active room
--      of the turno's campus). Family entries are unchanged.
--
-- Rollback:
--   (re-run the section 6 body of 20261012160000_ninos_precheck.sql)
--   (re-run the section 3 body of 20261008150000_ninos_preregistro.sql)
--   DROP FUNCTION IF EXISTS public.ninos_preregistro_avisar(uuid, text, uuid, text),
--     public.ninos_preregistro_crear(uuid, jsonb, text, text),
--     public.ninos_preregistro_servicios_hoy(uuid);
--   DROP TABLE IF EXISTS public.ninos_preregistro_avisos;
--   then remove the column ninos_preregistros.aviso_token_hash (ALTER TABLE).

-- ── 1. token hash on the pre-registration ────────────────────────────

ALTER TABLE public.ninos_preregistros
  ADD COLUMN IF NOT EXISTS aviso_token_hash text
  CHECK (aviso_token_hash IS NULL OR aviso_token_hash ~ '^[0-9a-f]{64}$');

-- ── 2. notices ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_preregistro_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preregistro_id uuid NOT NULL REFERENCES public.ninos_preregistros(id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES public.dream_team_turnos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ninos_preregistro_avisos_un_servicio UNIQUE (preregistro_id, turno_id, fecha)
);
CREATE INDEX IF NOT EXISTS ninos_preregistro_avisos_servicio_idx
  ON public.ninos_preregistro_avisos (turno_id, fecha);
CREATE INDEX IF NOT EXISTS ninos_preregistro_avisos_ip_idx
  ON public.ninos_preregistro_avisos (ip_hash, created_at DESC);

ALTER TABLE public.ninos_preregistro_avisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ninos_preregistro_avisos FROM PUBLIC, anon, authenticated;

-- ── 3. today's services of a campus ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_servicios_hoy(p_campus_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('turno_id', t.id, 'nombre', t.nombre, 'hora', t.hora)
                            ORDER BY t.hora, t.orden), '[]'::jsonb)
    FROM public.dream_team_turnos t
   WHERE t.campus_id = p_campus_id
     AND public.ninos_precheck_en_ventana(t.id)
     AND EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = t.campus_id AND s.activo);
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_servicios_hoy(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. create with a token ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_crear(p_campus_id uuid, p_payload jsonb, p_ip_hash text, p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR jsonb_typeof(p_payload -> 'padre') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload -> 'hijos') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'hijos') NOT BETWEEN 1 AND 10
     OR octet_length(p_payload::text) > 32768
     OR (p_token_hash IS NOT NULL AND p_token_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = p_campus_id AND s.activo) THEN
    RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_preregistro:' || coalesce(p_ip_hash, '-'), 0));
  IF (SELECT count(*) FROM public.ninos_preregistros r
       WHERE r.ip_hash = p_ip_hash AND r.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.ninos_preregistros r
          WHERE r.campus_id = p_campus_id AND r.created_at > now() - interval '1 hour') >= 200 THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  INSERT INTO public.ninos_preregistros (campus_id, payload, ip_hash, aviso_token_hash)
  VALUES (p_campus_id, p_payload, p_ip_hash, p_token_hash)
  RETURNING id INTO v_id;
  IF p_token_hash IS NULL THEN
    RETURN jsonb_build_object('estado', 'ok');
  END IF;
  RETURN jsonb_build_object('estado', 'ok', 'id', v_id,
                            'servicios', public.ninos_preregistro_servicios_hoy(p_campus_id));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text, text) TO service_role;

-- The original contract, for any caller still on three arguments.
CREATE OR REPLACE FUNCTION public.ninos_preregistro_crear(p_campus_id uuid, p_payload jsonb, p_ip_hash text)
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_preregistro_crear(p_campus_id, p_payload, p_ip_hash, NULL::text) ->> 'estado';
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text) TO service_role;

-- ── 5. "¿Vienen hoy?" ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_avisar(p_id uuid, p_token_hash text, p_turno_id uuid, p_ip_hash text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.ninos_preregistros%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_n   integer;
BEGIN
  SELECT * INTO v_row FROM public.ninos_preregistros r WHERE r.id = p_id;
  IF NOT FOUND OR p_token_hash IS NULL OR v_row.aviso_token_hash IS NULL
     OR v_row.aviso_token_hash <> p_token_hash OR v_row.estado <> 'pendiente'
     OR (v_row.created_at AT TIME ZONE 'America/Caracas')::date <> v_hoy THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_turno_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.campus_id = v_row.campus_id)
     OR NOT public.ninos_precheck_en_ventana(p_turno_id)
     OR NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = v_row.campus_id AND s.activo) THEN
    RAISE EXCEPTION 'fuera_de_horario' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_preregistro_avisar:' || coalesce(p_ip_hash, '-'), 0));
  IF (SELECT count(*) FROM public.ninos_preregistro_avisos a
       WHERE a.ip_hash = p_ip_hash AND a.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.ninos_preregistro_avisos a
           JOIN public.ninos_preregistros r ON r.id = a.preregistro_id
          WHERE r.campus_id = v_row.campus_id AND a.created_at > now() - interval '1 hour') >= 200 THEN
    RETURN 'limite';
  END IF;

  INSERT INTO public.ninos_preregistro_avisos (preregistro_id, turno_id, fecha, ip_hash)
  VALUES (p_id, p_turno_id, v_hoy, p_ip_hash)
  ON CONFLICT (preregistro_id, turno_id, fecha) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'ya_avisado' USING ERRCODE = '22023';
  END IF;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_avisar(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_avisar(uuid, text, uuid, text) TO service_role;

-- ── 6. the table's "Llegando" list, with pre-registrations ───────────

CREATE OR REPLACE FUNCTION public.ninos_prechecks_pendientes(p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH turno AS (
    SELECT t.id, t.campus_id FROM public.dream_team_turnos t
     WHERE t.id = p_turno_id AND p_fecha = public.ninos_hoy()
       AND public.ninos_precheck_en_ventana(t.id)
       AND EXISTS (SELECT 1 FROM public.ninos_salones s
                    WHERE s.campus_id = t.campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
  ), pendientes AS (
    SELECT p.solicitado_por, p.nino_id, p.created_at
      FROM public.ninos_prechecks p JOIN turno ON turno.id = p.turno_id
     WHERE p.fecha = p_fecha AND p.estado = 'pendiente'
       AND NOT EXISTS (SELECT 1 FROM public.ninos_checkins c
                        WHERE c.nino_id = p.nino_id AND c.turno_id = p.turno_id AND c.fecha = p.fecha)
  ), familias AS (
    SELECT min(pe.created_at) AS avisado_at,
           jsonb_build_object(
             'padre', jsonb_build_object('id', u.id, 'nombre', u.nombre, 'apellido', u.apellido),
             'avisado_at', min(pe.created_at),
             'hijos', (SELECT coalesce(jsonb_agg(e.h), '[]'::jsonb)
                         FROM jsonb_array_elements(public.ninos_familia_hijos(u.id)) e(h)
                        WHERE (e.h ->> 'id')::uuid = ANY (array_agg(pe.nino_id)))) AS familia
      FROM pendientes pe
      JOIN public.usuarios u ON u.id = pe.solicitado_por
     GROUP BY u.id, u.nombre, u.apellido
  ), preregistros AS (
    -- Families without a ficha yet: the review at the table registers them.
    SELECT a.created_at AS avisado_at,
           jsonb_build_object(
             'tipo', 'preregistro',
             'preregistro_id', r.id,
             'padre', jsonb_build_object('nombre', coalesce(r.payload -> 'padre' ->> 'nombre', ''),
                                         'apellido', coalesce(r.payload -> 'padre' ->> 'apellido', '')),
             'avisado_at', a.created_at,
             'hijos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                 'nombre', coalesce(h ->> 'nombre', ''), 'apellido', coalesce(h ->> 'apellido', ''),
                                 'alergias', h ->> 'alergias', 'necesidades_especiales', h ->> 'necesidades_especiales')
                               ORDER BY o), '[]'::jsonb)
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.payload -> 'hijos') = 'array'
                                                        THEN r.payload -> 'hijos' ELSE '[]'::jsonb END)
                              WITH ORDINALITY e(h, o)
                        WHERE jsonb_typeof(h) = 'object')) AS familia
      FROM public.ninos_preregistro_avisos a
      JOIN turno ON turno.id = a.turno_id
      JOIN public.ninos_preregistros r ON r.id = a.preregistro_id AND r.campus_id = turno.campus_id
     WHERE a.fecha = p_fecha AND r.estado = 'pendiente'
  )
  SELECT coalesce(jsonb_agg(x.familia ORDER BY x.avisado_at), '[]'::jsonb)
    FROM (SELECT * FROM familias UNION ALL SELECT * FROM preregistros) x;
$$;
REVOKE ALL ON FUNCTION public.ninos_prechecks_pendientes(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_prechecks_pendientes(uuid, date) TO authenticated;
