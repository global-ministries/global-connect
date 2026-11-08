-- noqa: insert-into (the rows written here are the S8.5 backfill, inside ninos_eventos_sembrar)
-- Niños: eventos, horarios and salón rules (odd/tasks/ninos-checkin-pco.md,
-- T1a, S5, S8).
--
-- What:
--   1. ninos_eventos: the events of a campus (Domingo semanal, a camp, a
--      parents' night). tipo 'semanal' (dia_semana), 'diario' (fecha_inicio
--      to fecha_fin, at most 31 days) or 'unico' (fecha_inicio). Options:
--      precheck_app, avisos_push, visitante_una_vez, integracion_dream_team,
--      anuncio_mesa (up to 140 characters, the artboard's limit).
--   2. ninos_evento_horarios: one row per service of an event. Every horario
--      links one dream_team_turnos row (S8.1, turno_id NOT NULL and UNIQUE);
--      the hour lives in the turno (S8.2), the horario only holds the
--      check-in window: abre_min_antes / cierra_min_despues (0 to 240,
--      default 120 = today's fixed ±2 h). turno_creado marks a turno Niños
--      created for the horario.
--   3. ninos_carpetas: per campus and area (waumba / upstreet) the
--      distribution ('en_orden' | 'equilibrada') and "mantener a los
--      regulares en su salón".
--   4. ninos_salones gains the salón rules, once per salón (S8.4): fecha de
--      corte (corte_mes/corte_dia) and promoción (promocion_mes/
--      promocion_dia), NULL = no rule; cupo_visitantes (capacidad stays the
--      regulars' quota); ninos_por_voluntario (NULL = no rule);
--      min_voluntarios; abierto; opcion_panal; opcion_merienda.
--   5. Backfill (S8.5), ninos_eventos_sembrar(): every campus with salones
--      and no event yet gets "Domingo semanal" (semanal, dia_semana 0); its
--      unlinked active Sunday weekly turnos (dia_semana 0, tipo 'semanal';
--      never 'fechas') become its horarios with 120/120; one ninos_carpetas
--      row per campus and area of its salones. Re-running adds nothing when
--      nothing changed.
--   6. Authority. Events and horarios create Dream Team turnos for the whole
--      campus, so writing them needs authority over all of Niños there:
--        ninos_puede_configurar_campus(campus)  admin/pastor, or
--          ninos_puede_configurar on EVERY active salón equipo of the campus
--          (at least one); an area coordinator alone does not qualify.
--        ninos_puede_configurar_algun_area_campus(campus)  admin/pastor, or
--          ninos_puede_configurar on ANY active salón equipo of the campus
--          (reads ninos_eventos_admin: an area coordinator sees the events).
--        ninos_puede_operar_campus(campus)  the same with ninos_puede_operar
--          on any of them (RLS read).
--      Salón rules stay per salón (ninos_puede_configurar on its equipo) and
--      carpetas per area.
--      RLS: the three tables are readable by who operates Niños in the
--      campus; authenticated has no write privilege, writes go through the
--      RPCs below.
--   7. RPCs (definer, search_path '', EXECUTE for authenticated only):
--        ninos_eventos_admin(campus)                 events + horarios + last 6 sessions
--        ninos_evento_guardar(...)                   create / update an event
--        ninos_evento_archivar(evento, activo)       archive or restore
--        ninos_horario_agregar(evento, ...)          link or create the turno
--        ninos_horario_ventana_guardar(horario, ...) abre / cierra
--        ninos_horario_quitar(horario)               unlink (and drop an unused
--                                                    dated turno Niños created)
--        ninos_salon_reglas_guardar(salon, ...)      salón rules
--        ninos_carpeta_guardar(campus, area, ...)    carpeta settings
--        ninos_horario_de_turno(turno)               window, 120/120 fallback
--        ninos_es_visitante(nino, fecha)             fewer than 3 prior check-in
--                                                    fechas (S8.3)
--
-- Errors: the message is a short code the UI maps (sin_autoridad, 42501;
-- the rest 22023, or 23505 for duplicates) and the HINT a Spanish sentence
-- the UI can show as is.
--
-- Turnos (S8.1): a semanal event links an active weekly turno of the campus
-- on its weekday, or creates one (weekly turnos are campus-wide, so it is not
-- listed in dream_team_equipo_turnos: listing a weekly turno restricts a node
-- to its listed weekly turnos). A diario / unico event creates a turno tipo
-- 'fechas' with one dream_team_turno_fechas row per day and lists it for the
-- equipos of the campus's active salones, the way dated turnos are served
-- (20261026140000). Changing a diario / unico event's dates re-syncs the
-- planned dates of its dated turnos. Weekly turnos are never deactivated or
-- deleted by Niños; ninos_horario_quitar deletes only a dated turno it
-- created, with no check-in and no planned date before today.
--
-- Blast radius (S8.5): new tables, new functions, new ninos_salones columns
-- with constant defaults (no rewrite; existing rows read today's behavior:
-- no visitor quota, no ratio, open, no options). No existing function is
-- replaced: check-in, pre-check, QR, the volunteers sheet and the reports
-- keep reading turno_id exactly as before.
--
-- Rollback (drop order):
--   DROP FUNCTION IF EXISTS public.ninos_es_visitante(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_horario_de_turno(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_carpeta_guardar(uuid, text, text, boolean);
--   DROP FUNCTION IF EXISTS public.ninos_salon_reglas_guardar(uuid, integer, integer, integer, boolean,
--     boolean, boolean, smallint, smallint, smallint, smallint);
--   DROP FUNCTION IF EXISTS public.ninos_horario_quitar(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_horario_ventana_guardar(uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.ninos_horario_agregar(uuid, uuid, text, time, integer, integer);
--   DROP FUNCTION IF EXISTS public.ninos_evento_archivar(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.ninos_evento_guardar(uuid, uuid, text, text, smallint, date, date,
--     boolean, boolean, boolean, boolean, text, integer);
--   DROP FUNCTION IF EXISTS public.ninos_eventos_admin(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_evento_sync_fechas(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_eventos_sembrar();
--   DROP TABLE IF EXISTS public.ninos_carpetas;
--   DROP TABLE IF EXISTS public.ninos_evento_horarios;
--   DROP TABLE IF EXISTS public.ninos_eventos;
--   DROP FUNCTION IF EXISTS public.ninos_eventos_touch();
--   DROP FUNCTION IF EXISTS public.ninos_puede_operar_campus(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_puede_configurar_algun_area_campus(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_puede_configurar_campus(uuid);
--   ALTER TABLE public.ninos_salones
--     DROP COLUMN IF EXISTS corte_mes, DROP COLUMN IF EXISTS corte_dia,
--     DROP COLUMN IF EXISTS promocion_mes, DROP COLUMN IF EXISTS promocion_dia,
--     DROP COLUMN IF EXISTS cupo_visitantes, DROP COLUMN IF EXISTS ninos_por_voluntario,
--     DROP COLUMN IF EXISTS min_voluntarios, DROP COLUMN IF EXISTS abierto,
--     DROP COLUMN IF EXISTS opcion_panal, DROP COLUMN IF EXISTS opcion_merienda;
--   Dated turnos created by Niños stay in dream_team_turnos (delete them by
--   hand if wanted).

-- ── 1. authority helpers ─────────────────────────────────────────────

-- Authority over all of Niños in the campus: every active salón equipo.
CREATE OR REPLACE FUNCTION public.ninos_puede_configurar_campus(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_campus_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR (EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = p_campus_id AND s.activo)
        AND NOT EXISTS (
          SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s
                          WHERE s.campus_id = p_campus_id AND s.activo) a
           WHERE NOT public.ninos_puede_configurar(a.equipo_id)))
  );
$$;

-- Authority over at least one area of Niños in the campus.
CREATE OR REPLACE FUNCTION public.ninos_puede_configurar_algun_area_campus(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_campus_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s
                      WHERE s.campus_id = p_campus_id AND s.activo) a
       WHERE public.ninos_puede_configurar(a.equipo_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.ninos_puede_operar_campus(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_campus_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s
                      WHERE s.campus_id = p_campus_id AND s.activo) a
       WHERE public.ninos_puede_operar(a.equipo_id))
  );
$$;

REVOKE ALL ON FUNCTION public.ninos_puede_configurar_campus(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_puede_operar_campus(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_puede_configurar_algun_area_campus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_puede_configurar_campus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_puede_configurar_algun_area_campus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_puede_operar_campus(uuid) TO authenticated;

-- ── 2. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  nombre text NOT NULL CHECK (btrim(nombre) <> '' AND length(nombre) <= 80),
  tipo text NOT NULL CHECK (tipo IN ('semanal', 'diario', 'unico')),
  -- 0 = domingo … 6 = sábado, as dream_team_turnos.
  dia_semana smallint CHECK (dia_semana BETWEEN 0 AND 6),
  fecha_inicio date,
  fecha_fin date,
  precheck_app boolean NOT NULL DEFAULT true,
  avisos_push boolean NOT NULL DEFAULT true,
  visitante_una_vez boolean NOT NULL DEFAULT false,
  integracion_dream_team boolean NOT NULL DEFAULT true,
  anuncio_mesa text CHECK (anuncio_mesa IS NULL OR length(anuncio_mesa) <= 140),
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ninos_eventos_fechas_por_tipo CHECK (
    CASE tipo
      WHEN 'semanal' THEN dia_semana IS NOT NULL AND fecha_inicio IS NULL AND fecha_fin IS NULL
      WHEN 'diario' THEN dia_semana IS NULL AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL
                         AND fecha_fin >= fecha_inicio AND fecha_fin - fecha_inicio <= 30
      WHEN 'unico' THEN dia_semana IS NULL AND fecha_inicio IS NOT NULL AND fecha_fin IS NULL
    END)
);
CREATE UNIQUE INDEX IF NOT EXISTS ninos_eventos_nombre_activo_idx
  ON public.ninos_eventos (campus_id, lower(btrim(nombre))) WHERE activo;
CREATE INDEX IF NOT EXISTS ninos_eventos_campus_idx ON public.ninos_eventos (campus_id, orden);

COMMENT ON TABLE public.ninos_eventos IS
  'Niños events of a campus: semanal (dia_semana), diario (fecha_inicio..fecha_fin) or unico (fecha_inicio). Written by the ninos_evento_* RPCs.';

CREATE TABLE IF NOT EXISTS public.ninos_evento_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ninos_eventos(id) ON DELETE CASCADE,
  -- The hour lives in the turno (S8.2); one turno belongs to one horario.
  turno_id uuid NOT NULL UNIQUE REFERENCES public.dream_team_turnos(id) ON DELETE CASCADE,
  abre_min_antes integer NOT NULL DEFAULT 120 CHECK (abre_min_antes BETWEEN 0 AND 240),
  cierra_min_despues integer NOT NULL DEFAULT 120 CHECK (cierra_min_despues BETWEEN 0 AND 240),
  turno_creado boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ninos_evento_horarios_evento_idx ON public.ninos_evento_horarios (evento_id, orden);

COMMENT ON TABLE public.ninos_evento_horarios IS
  'Services of a Niños event: the linked dream_team_turnos row (hour, dates, volunteers) and the check-in window in minutes.';

CREATE TABLE IF NOT EXISTS public.ninos_carpetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  area text NOT NULL CHECK (area IN ('waumba', 'upstreet')),
  distribucion text NOT NULL DEFAULT 'en_orden' CHECK (distribucion IN ('en_orden', 'equilibrada')),
  mantener_regulares boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campus_id, area)
);

COMMENT ON TABLE public.ninos_carpetas IS
  'Room-assignment settings per campus and area (Waumba Land / UpStreet): distribution and keeping regulars in their room.';

-- Salón rules, once per salón (S8.4). Constant defaults: no table rewrite.
ALTER TABLE public.ninos_salones
  ADD COLUMN IF NOT EXISTS corte_mes smallint CHECK (corte_mes BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS corte_dia smallint CHECK (corte_dia BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS promocion_mes smallint CHECK (promocion_mes BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS promocion_dia smallint CHECK (promocion_dia BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS cupo_visitantes integer NOT NULL DEFAULT 0 CHECK (cupo_visitantes BETWEEN 0 AND 500),
  ADD COLUMN IF NOT EXISTS ninos_por_voluntario integer CHECK (ninos_por_voluntario BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS min_voluntarios integer NOT NULL DEFAULT 0 CHECK (min_voluntarios BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS abierto boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS opcion_panal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opcion_merienda boolean NOT NULL DEFAULT false;

-- Day and month go together and form a real date (29 Feb allowed).
ALTER TABLE public.ninos_salones DROP CONSTRAINT IF EXISTS ninos_salones_corte_fecha_check;
ALTER TABLE public.ninos_salones ADD CONSTRAINT ninos_salones_corte_fecha_check CHECK (
  (corte_mes IS NULL AND corte_dia IS NULL)
  OR (corte_mes IS NOT NULL AND corte_dia IS NOT NULL
      AND corte_dia <= extract(day FROM make_date(2000, corte_mes, 1) + interval '1 month - 1 day')));
ALTER TABLE public.ninos_salones DROP CONSTRAINT IF EXISTS ninos_salones_promocion_fecha_check;
ALTER TABLE public.ninos_salones ADD CONSTRAINT ninos_salones_promocion_fecha_check CHECK (
  (promocion_mes IS NULL AND promocion_dia IS NULL)
  OR (promocion_mes IS NOT NULL AND promocion_dia IS NOT NULL
      AND promocion_dia <= extract(day FROM make_date(2000, promocion_mes, 1) + interval '1 month - 1 day')));

COMMENT ON COLUMN public.ninos_salones.capacidad IS 'Cupo de regulares.';
COMMENT ON COLUMN public.ninos_salones.cupo_visitantes IS 'Places kept for visitors (ninos_es_visitante), on top of capacidad.';
COMMENT ON COLUMN public.ninos_salones.ninos_por_voluntario IS 'One volunteer every N children; NULL = no rule.';

-- updated_at on the three tables (invoker trigger).
CREATE OR REPLACE FUNCTION public.ninos_eventos_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_eventos_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ninos_eventos_touch ON public.ninos_eventos;
CREATE TRIGGER ninos_eventos_touch BEFORE UPDATE ON public.ninos_eventos
  FOR EACH ROW EXECUTE FUNCTION public.ninos_eventos_touch();
DROP TRIGGER IF EXISTS ninos_evento_horarios_touch ON public.ninos_evento_horarios;
CREATE TRIGGER ninos_evento_horarios_touch BEFORE UPDATE ON public.ninos_evento_horarios
  FOR EACH ROW EXECUTE FUNCTION public.ninos_eventos_touch();
DROP TRIGGER IF EXISTS ninos_carpetas_touch ON public.ninos_carpetas;
CREATE TRIGGER ninos_carpetas_touch BEFORE UPDATE ON public.ninos_carpetas
  FOR EACH ROW EXECUTE FUNCTION public.ninos_eventos_touch();

-- ── 3. RLS and privileges ────────────────────────────────────────────

ALTER TABLE public.ninos_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_evento_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_carpetas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ninos_eventos, public.ninos_evento_horarios, public.ninos_carpetas
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ninos_eventos, public.ninos_evento_horarios, public.ninos_carpetas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ninos_eventos, public.ninos_evento_horarios, public.ninos_carpetas
  TO service_role;

DROP POLICY IF EXISTS ninos_eventos_select ON public.ninos_eventos;
CREATE POLICY ninos_eventos_select ON public.ninos_eventos
  FOR SELECT TO authenticated USING (public.ninos_puede_operar_campus(campus_id));

DROP POLICY IF EXISTS ninos_evento_horarios_select ON public.ninos_evento_horarios;
CREATE POLICY ninos_evento_horarios_select ON public.ninos_evento_horarios
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ninos_eventos e
                  WHERE e.id = evento_id AND public.ninos_puede_operar_campus(e.campus_id)));

DROP POLICY IF EXISTS ninos_carpetas_select ON public.ninos_carpetas;
CREATE POLICY ninos_carpetas_select ON public.ninos_carpetas
  FOR SELECT TO authenticated USING (public.ninos_puede_operar_campus(campus_id));

-- ── 4. backfill (S8.5) ───────────────────────────────────────────────

-- Runs as its caller (the migration, or postgres in the tests); nobody else
-- may execute it. Returns how many rows it inserted.
CREATE OR REPLACE FUNCTION public.ninos_eventos_sembrar()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_n integer;
  v_total integer := 0;
BEGIN
  INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana, orden)
  SELECT DISTINCT s.campus_id, 'Domingo semanal', 'semanal', 0::smallint, 0
    FROM public.ninos_salones s
   WHERE NOT EXISTS (SELECT 1 FROM public.ninos_eventos e WHERE e.campus_id = s.campus_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  INSERT INTO public.ninos_evento_horarios (evento_id, turno_id, abre_min_antes, cierra_min_despues, orden)
  SELECT e.id, t.id, 120, 120, t.orden
    FROM public.dream_team_turnos t
    JOIN LATERAL (
      SELECT e.id FROM public.ninos_eventos e
       WHERE e.campus_id = t.campus_id AND e.activo AND e.tipo = 'semanal' AND e.dia_semana = 0
         AND e.nombre = 'Domingo semanal'
       ORDER BY e.created_at, e.id
       LIMIT 1) e ON true
   WHERE t.activo AND t.tipo = 'semanal' AND t.dia_semana = 0
     AND EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = t.campus_id)
     AND NOT EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.turno_id = t.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  INSERT INTO public.ninos_carpetas (campus_id, area)
  SELECT DISTINCT s.campus_id, s.area FROM public.ninos_salones s
  ON CONFLICT (campus_id, area) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_eventos_sembrar() FROM PUBLIC, anon, authenticated;

SELECT public.ninos_eventos_sembrar();

-- ── 5. read ──────────────────────────────────────────────────────────

-- The events of a campus with their horarios (hour and name from the turno,
-- planned dates of a dated turno) and the last 6 session dates (children
-- checked in per fecha, distinct, across the event's turnos).
CREATE OR REPLACE FUNCTION public.ninos_eventos_admin(p_campus_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.ninos_puede_configurar_algun_area_campus(p_campus_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para ver los eventos de Niños de este campus.';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'campus_id', e.campus_id, 'nombre', e.nombre, 'tipo', e.tipo,
             'dia_semana', e.dia_semana, 'fecha_inicio', e.fecha_inicio, 'fecha_fin', e.fecha_fin,
             'precheck_app', e.precheck_app, 'avisos_push', e.avisos_push,
             'visitante_una_vez', e.visitante_una_vez, 'integracion_dream_team', e.integracion_dream_team,
             'anuncio_mesa', e.anuncio_mesa, 'activo', e.activo, 'orden', e.orden,
             'horarios', (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'id', h.id, 'turno_id', t.id, 'nombre', t.nombre, 'hora', to_char(t.hora, 'HH24:MI'),
                        'dia_semana', t.dia_semana, 'turno_tipo', t.tipo, 'turno_activo', t.activo,
                        'fechas', (SELECT coalesce(jsonb_agg(f.fecha ORDER BY f.fecha), '[]'::jsonb)
                                     FROM public.dream_team_turno_fechas f
                                    WHERE f.turno_id = t.id AND t.tipo = 'fechas'),
                        'abre_min_antes', h.abre_min_antes, 'cierra_min_despues', h.cierra_min_despues,
                        'turno_creado', h.turno_creado, 'orden', h.orden, 'activo', h.activo)
                        ORDER BY h.orden, t.hora, t.nombre), '[]'::jsonb)
                 FROM public.ninos_evento_horarios h
                 JOIN public.dream_team_turnos t ON t.id = h.turno_id
                WHERE h.evento_id = e.id),
             'sesiones', (
               SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', x.fecha, 'ninos', x.ninos)
                                         ORDER BY x.fecha DESC), '[]'::jsonb)
                 FROM (SELECT c.fecha, count(DISTINCT c.nino_id)::int AS ninos
                         FROM public.ninos_checkins c
                         JOIN public.ninos_evento_horarios h ON h.turno_id = c.turno_id
                        WHERE h.evento_id = e.id
                        GROUP BY c.fecha
                        ORDER BY c.fecha DESC
                        LIMIT 6) x))
             ORDER BY e.activo DESC, e.orden, e.nombre), '[]'::jsonb)
      FROM public.ninos_eventos e
     WHERE e.campus_id = p_campus_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_eventos_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_eventos_admin(uuid) TO authenticated;

-- ── 6. events ────────────────────────────────────────────────────────

-- Makes the planned dates of the event's dated turnos match its days
-- (diario: fecha_inicio..fecha_fin; unico: fecha_inicio). Internal: called
-- by the definer RPCs only.
CREATE OR REPLACE FUNCTION public.ninos_evento_sync_fechas(p_evento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ev public.ninos_eventos%ROWTYPE;
BEGIN
  SELECT * INTO v_ev FROM public.ninos_eventos e WHERE e.id = p_evento_id;
  IF NOT FOUND OR v_ev.tipo = 'semanal' THEN
    RETURN;
  END IF;

  DELETE FROM public.dream_team_turno_fechas f
   USING public.ninos_evento_horarios h
   WHERE h.evento_id = p_evento_id AND f.turno_id = h.turno_id
     AND f.fecha NOT BETWEEN v_ev.fecha_inicio AND coalesce(v_ev.fecha_fin, v_ev.fecha_inicio);

  INSERT INTO public.dream_team_turno_fechas (turno_id, fecha)
  SELECT h.turno_id, d::date
    FROM public.ninos_evento_horarios h
    JOIN public.dream_team_turnos t ON t.id = h.turno_id AND t.tipo = 'fechas'
   CROSS JOIN generate_series(v_ev.fecha_inicio, coalesce(v_ev.fecha_fin, v_ev.fecha_inicio), interval '1 day') d
   WHERE h.evento_id = p_evento_id
  ON CONFLICT (turno_id, fecha) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_evento_sync_fechas(uuid) FROM PUBLIC, anon, authenticated;

-- Creates (p_evento_id NULL) or updates an event of p_campus_id. NULL
-- options keep the current value (the defaults on create). Returns its id.
CREATE OR REPLACE FUNCTION public.ninos_evento_guardar(
  p_campus_id uuid,
  p_evento_id uuid,
  p_nombre text,
  p_tipo text,
  p_dia_semana smallint DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_precheck_app boolean DEFAULT NULL,
  p_avisos_push boolean DEFAULT NULL,
  p_visitante_una_vez boolean DEFAULT NULL,
  p_integracion_dream_team boolean DEFAULT NULL,
  p_anuncio_mesa text DEFAULT NULL,
  p_orden integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_anuncio text := nullif(btrim(coalesce(p_anuncio_mesa, '')), '');
  v_old public.ninos_eventos%ROWTYPE;
  v_dia smallint := p_dia_semana;
  v_ini date := p_fecha_inicio;
  v_fin date := p_fecha_fin;
  v_id uuid;
BEGIN
  IF p_evento_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.ninos_eventos e WHERE e.id = p_evento_id FOR UPDATE;
    IF NOT FOUND OR v_old.campus_id IS DISTINCT FROM p_campus_id THEN
      RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = '22023',
        HINT = 'El evento no existe en este campus.';
    END IF;
  END IF;
  IF NOT public.ninos_puede_configurar_campus(p_campus_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.';
  END IF;

  IF v_nombre = '' OR length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'nombre_invalido' USING ERRCODE = '22023',
      HINT = 'El evento necesita un nombre de hasta 80 caracteres.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('semanal', 'diario', 'unico') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = '22023',
      HINT = 'El evento es semanal, diario o de un solo día.';
  END IF;
  IF p_tipo = 'semanal' THEN
    IF v_dia IS NULL OR v_dia NOT BETWEEN 0 AND 6 THEN
      RAISE EXCEPTION 'dia_invalido' USING ERRCODE = '22023',
        HINT = 'Un evento semanal necesita el día de la semana.';
    END IF;
    v_ini := NULL;
    v_fin := NULL;
  ELSIF p_tipo = 'diario' THEN
    IF v_ini IS NULL OR v_fin IS NULL OR v_fin < v_ini OR v_fin - v_ini > 30 THEN
      RAISE EXCEPTION 'fechas_invalidas' USING ERRCODE = '22023',
        HINT = 'Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.';
    END IF;
    v_dia := NULL;
  ELSE
    IF v_ini IS NULL OR (v_fin IS NOT NULL AND v_fin <> v_ini) THEN
      RAISE EXCEPTION 'fechas_invalidas' USING ERRCODE = '22023',
        HINT = 'Un evento de un solo día necesita su fecha.';
    END IF;
    v_dia := NULL;
    v_fin := NULL;
  END IF;
  IF length(v_anuncio) > 140 THEN
    RAISE EXCEPTION 'anuncio_largo' USING ERRCODE = '22023',
      HINT = 'El anuncio de la mesa admite hasta 140 caracteres.';
  END IF;

  -- Horarios are bound to turnos of the event's kind (weekly or dated) and,
  -- for a weekly event, its weekday. diario <-> unico re-syncs the dates.
  IF p_evento_id IS NOT NULL
     AND ((v_old.tipo = 'semanal') <> (p_tipo = 'semanal')
          OR (p_tipo = 'semanal' AND v_old.dia_semana IS DISTINCT FROM v_dia))
     AND EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.evento_id = p_evento_id) THEN
    RAISE EXCEPTION 'evento_con_horarios' USING ERRCODE = '22023',
      HINT = 'Quita los horarios antes de cambiar el tipo o el día del evento.';
  END IF;

  BEGIN
    IF p_evento_id IS NULL THEN
      INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana, fecha_inicio, fecha_fin,
                                        precheck_app, avisos_push, visitante_una_vez, integracion_dream_team,
                                        anuncio_mesa, orden)
      VALUES (p_campus_id, v_nombre, p_tipo, v_dia, v_ini, v_fin,
              coalesce(p_precheck_app, true), coalesce(p_avisos_push, true),
              coalesce(p_visitante_una_vez, false), coalesce(p_integracion_dream_team, true),
              v_anuncio,
              coalesce(p_orden, (SELECT coalesce(max(e.orden), 0) + 1 FROM public.ninos_eventos e
                                  WHERE e.campus_id = p_campus_id)))
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.ninos_eventos e
         SET nombre = v_nombre, tipo = p_tipo, dia_semana = v_dia, fecha_inicio = v_ini, fecha_fin = v_fin,
             precheck_app = coalesce(p_precheck_app, e.precheck_app),
             avisos_push = coalesce(p_avisos_push, e.avisos_push),
             visitante_una_vez = coalesce(p_visitante_una_vez, e.visitante_una_vez),
             integracion_dream_team = coalesce(p_integracion_dream_team, e.integracion_dream_team),
             anuncio_mesa = v_anuncio,
             orden = coalesce(p_orden, e.orden)
       WHERE e.id = p_evento_id
      RETURNING e.id INTO v_id;
      PERFORM public.ninos_evento_sync_fechas(v_id);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'nombre_duplicado' USING ERRCODE = '23505',
      HINT = 'Ya hay un evento activo con ese nombre en este campus.';
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_evento_guardar(uuid, uuid, text, text, smallint, date, date,
  boolean, boolean, boolean, boolean, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_evento_guardar(uuid, uuid, text, text, smallint, date, date,
  boolean, boolean, boolean, boolean, text, integer) TO authenticated;

-- Archives (p_activo false) or restores an event. Its horarios and turnos stay.
CREATE OR REPLACE FUNCTION public.ninos_evento_archivar(p_evento_id uuid, p_activo boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_campus uuid;
BEGIN
  SELECT e.campus_id INTO v_campus FROM public.ninos_eventos e WHERE e.id = p_evento_id FOR UPDATE;
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = '22023',
      HINT = 'El evento no existe en este campus.';
  END IF;
  IF NOT public.ninos_puede_configurar_campus(v_campus) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.';
  END IF;
  BEGIN
    UPDATE public.ninos_eventos e SET activo = coalesce(p_activo, false) WHERE e.id = p_evento_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'nombre_duplicado' USING ERRCODE = '23505',
      HINT = 'Ya hay un evento activo con ese nombre en este campus.';
  END;
  RETURN coalesce(p_activo, false);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_evento_archivar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_evento_archivar(uuid, boolean) TO authenticated;

-- ── 7. horarios ──────────────────────────────────────────────────────

-- Adds a horario to an event (S8.1). Semanal: links p_turno_id (an active
-- weekly turno of the campus on the event's weekday) or, without it, creates
-- a weekly turno p_nombre at p_hora. Diario / unico: creates a turno
-- 'fechas' at p_hora with one planned date per day of the event, served by
-- the equipos of the campus's active salones. Returns the horario id.
CREATE OR REPLACE FUNCTION public.ninos_horario_agregar(
  p_evento_id uuid,
  p_turno_id uuid DEFAULT NULL,
  p_nombre text DEFAULT NULL,
  p_hora time DEFAULT NULL,
  p_abre_min_antes integer DEFAULT 120,
  p_cierra_min_despues integer DEFAULT 120
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ev public.ninos_eventos%ROWTYPE;
  v_turno uuid := p_turno_id;
  v_creado boolean := false;
  v_nombre text;
  v_abre integer := coalesce(p_abre_min_antes, 120);
  v_cierra integer := coalesce(p_cierra_min_despues, 120);
  v_id uuid;
BEGIN
  SELECT * INTO v_ev FROM public.ninos_eventos e WHERE e.id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = '22023',
      HINT = 'El evento no existe en este campus.';
  END IF;
  IF NOT public.ninos_puede_configurar_campus(v_ev.campus_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.';
  END IF;
  IF NOT v_ev.activo THEN
    RAISE EXCEPTION 'evento_archivado' USING ERRCODE = '22023',
      HINT = 'El evento está archivado: restáuralo antes de agregar horarios.';
  END IF;
  IF v_abre NOT BETWEEN 0 AND 240 OR v_cierra NOT BETWEEN 0 AND 240 THEN
    RAISE EXCEPTION 'ventana_invalida' USING ERRCODE = '22023',
      HINT = 'La apertura y el cierre van de 0 a 240 minutos.';
  END IF;

  IF v_turno IS NOT NULL THEN
    IF v_ev.tipo <> 'semanal' OR NOT EXISTS (
      SELECT 1 FROM public.dream_team_turnos t
       WHERE t.id = v_turno AND t.campus_id = v_ev.campus_id AND t.activo
         AND t.tipo = 'semanal' AND t.dia_semana = v_ev.dia_semana) THEN
      RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023',
        HINT = 'El turno no es un turno semanal activo de este campus en el día del evento.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.turno_id = v_turno) THEN
      RAISE EXCEPTION 'turno_ya_vinculado' USING ERRCODE = '23505',
        HINT = 'Ese turno ya es un horario de un evento de Niños.';
    END IF;
  ELSE
    IF p_hora IS NULL THEN
      RAISE EXCEPTION 'hora_requerida' USING ERRCODE = '22023',
        HINT = 'Indica la hora del servicio.';
    END IF;
    v_nombre := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''),
                         v_ev.nombre || ' ' || to_char(p_hora, 'FMHH24:MI'));
    IF length(v_nombre) > 80 THEN
      RAISE EXCEPTION 'nombre_invalido' USING ERRCODE = '22023',
        HINT = 'El nombre del horario admite hasta 80 caracteres.';
    END IF;
    BEGIN
      INSERT INTO public.dream_team_turnos (campus_id, nombre, dia_semana, hora, orden, tipo)
      VALUES (v_ev.campus_id, v_nombre,
              CASE WHEN v_ev.tipo = 'semanal' THEN v_ev.dia_semana
                   ELSE extract(dow FROM v_ev.fecha_inicio)::smallint END,
              p_hora,
              (SELECT coalesce(max(t.orden), 0) + 1 FROM public.dream_team_turnos t
                WHERE t.campus_id = v_ev.campus_id),
              CASE WHEN v_ev.tipo = 'semanal' THEN 'semanal' ELSE 'fechas' END)
      RETURNING id INTO v_turno;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'turno_duplicado' USING ERRCODE = '23505',
        HINT = 'Ya hay un turno de Dream Team con ese nombre en el campus.';
    END;
    v_creado := true;

    IF v_ev.tipo <> 'semanal' THEN
      -- A dated turno is served only by the nodes that list it.
      INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id)
      SELECT DISTINCT s.equipo_id, v_turno FROM public.ninos_salones s
       WHERE s.campus_id = v_ev.campus_id AND s.activo
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.ninos_evento_horarios (evento_id, turno_id, abre_min_antes, cierra_min_despues,
                                            turno_creado, orden)
  VALUES (p_evento_id, v_turno, v_abre, v_cierra, v_creado,
          (SELECT coalesce(max(h.orden), 0) + 1 FROM public.ninos_evento_horarios h
            WHERE h.evento_id = p_evento_id))
  RETURNING id INTO v_id;

  PERFORM public.ninos_evento_sync_fechas(p_evento_id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_horario_agregar(uuid, uuid, text, time, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_horario_agregar(uuid, uuid, text, time, integer, integer) TO authenticated;

-- Sets when the check-in opens (minutes before the turno's hour) and when
-- pickup closes (minutes after).
CREATE OR REPLACE FUNCTION public.ninos_horario_ventana_guardar(
  p_horario_id uuid, p_abre_min_antes integer, p_cierra_min_despues integer
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_campus uuid;
BEGIN
  SELECT e.campus_id INTO v_campus
    FROM public.ninos_evento_horarios h JOIN public.ninos_eventos e ON e.id = h.evento_id
   WHERE h.id = p_horario_id;
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'horario_no_encontrado' USING ERRCODE = '22023',
      HINT = 'El horario no existe.';
  END IF;
  IF NOT public.ninos_puede_configurar_campus(v_campus) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.';
  END IF;
  IF p_abre_min_antes IS NULL OR p_cierra_min_despues IS NULL
     OR p_abre_min_antes NOT BETWEEN 0 AND 240 OR p_cierra_min_despues NOT BETWEEN 0 AND 240 THEN
    RAISE EXCEPTION 'ventana_invalida' USING ERRCODE = '22023',
      HINT = 'La apertura y el cierre van de 0 a 240 minutos.';
  END IF;

  UPDATE public.ninos_evento_horarios h
     SET abre_min_antes = p_abre_min_antes, cierra_min_despues = p_cierra_min_despues
   WHERE h.id = p_horario_id;
  RETURN p_horario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_horario_ventana_guardar(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_horario_ventana_guardar(uuid, integer, integer) TO authenticated;

-- Removes a horario. Its turno is unlinked; past sessions and attendance
-- stay. A dated turno Niños created for it is deleted only when it has no
-- check-in, no planned date before today and nothing else references it.
-- Returns {"turno_borrado": bool}.
CREATE OR REPLACE FUNCTION public.ninos_horario_quitar(p_horario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_h public.ninos_evento_horarios%ROWTYPE;
  v_campus uuid;
  v_tipo text;
  v_borrado boolean := false;
BEGIN
  SELECT h.* INTO v_h FROM public.ninos_evento_horarios h WHERE h.id = p_horario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horario_no_encontrado' USING ERRCODE = '22023',
      HINT = 'El horario no existe.';
  END IF;
  SELECT e.campus_id INTO v_campus FROM public.ninos_eventos e WHERE e.id = v_h.evento_id;
  IF NOT public.ninos_puede_configurar_campus(v_campus) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.';
  END IF;

  DELETE FROM public.ninos_evento_horarios h WHERE h.id = p_horario_id;

  SELECT t.tipo INTO v_tipo FROM public.dream_team_turnos t WHERE t.id = v_h.turno_id FOR UPDATE;
  IF v_h.turno_creado AND v_tipo = 'fechas'
     AND NOT EXISTS (SELECT 1 FROM public.ninos_checkins c WHERE c.turno_id = v_h.turno_id)
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_turno_fechas f
                      WHERE f.turno_id = v_h.turno_id AND f.fecha < public.ninos_hoy()) THEN
    BEGIN
      DELETE FROM public.dream_team_turnos t WHERE t.id = v_h.turno_id;
      v_borrado := true;
    EXCEPTION WHEN foreign_key_violation THEN
      v_borrado := false;
    END;
  END IF;

  RETURN jsonb_build_object('turno_borrado', v_borrado);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_horario_quitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_horario_quitar(uuid) TO authenticated;

-- ── 8. salón rules and carpetas ──────────────────────────────────────

-- Replaces the rules of one salón (every argument is the new value; NULL
-- ninos_por_voluntario, corte or promoción = no rule).
CREATE OR REPLACE FUNCTION public.ninos_salon_reglas_guardar(
  p_salon_id uuid,
  p_cupo_visitantes integer,
  p_ninos_por_voluntario integer,
  p_min_voluntarios integer,
  p_abierto boolean,
  p_opcion_panal boolean,
  p_opcion_merienda boolean,
  p_corte_mes smallint DEFAULT NULL,
  p_corte_dia smallint DEFAULT NULL,
  p_promocion_mes smallint DEFAULT NULL,
  p_promocion_dia smallint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_equipo uuid;
BEGIN
  SELECT s.equipo_id INTO v_equipo FROM public.ninos_salones s WHERE s.id = p_salon_id FOR UPDATE;
  IF v_equipo IS NULL THEN
    RAISE EXCEPTION 'salon_no_encontrado' USING ERRCODE = '22023',
      HINT = 'El salón no existe.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.ninos_puede_configurar(v_equipo) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para configurar este salón.';
  END IF;
  IF p_abierto IS NULL OR p_opcion_panal IS NULL OR p_opcion_merienda IS NULL THEN
    RAISE EXCEPTION 'reglas_invalidas' USING ERRCODE = '22023',
      HINT = 'Indica si el salón está abierto y sus opciones.';
  END IF;
  IF p_cupo_visitantes IS NULL OR p_cupo_visitantes NOT BETWEEN 0 AND 500 THEN
    RAISE EXCEPTION 'cupo_invalido' USING ERRCODE = '22023',
      HINT = 'El cupo de visitantes va de 0 a 500.';
  END IF;
  IF (p_ninos_por_voluntario IS NOT NULL AND p_ninos_por_voluntario NOT BETWEEN 1 AND 100)
     OR p_min_voluntarios IS NULL OR p_min_voluntarios NOT BETWEEN 0 AND 50 THEN
    RAISE EXCEPTION 'voluntarios_invalidos' USING ERRCODE = '22023',
      HINT = 'Niños por voluntario va de 1 a 100 y el mínimo de voluntarios de 0 a 50.';
  END IF;
  IF (p_corte_mes IS NULL) <> (p_corte_dia IS NULL)
     OR (p_corte_mes IS NOT NULL AND (p_corte_mes NOT BETWEEN 1 AND 12 OR p_corte_dia < 1
         OR p_corte_dia > extract(day FROM make_date(2000, p_corte_mes, 1) + interval '1 month - 1 day'))) THEN
    RAISE EXCEPTION 'corte_invalido' USING ERRCODE = '22023',
      HINT = 'La fecha de corte necesita un día y un mes válidos.';
  END IF;
  IF (p_promocion_mes IS NULL) <> (p_promocion_dia IS NULL)
     OR (p_promocion_mes IS NOT NULL AND (p_promocion_mes NOT BETWEEN 1 AND 12 OR p_promocion_dia < 1
         OR p_promocion_dia > extract(day FROM make_date(2000, p_promocion_mes, 1) + interval '1 month - 1 day'))) THEN
    RAISE EXCEPTION 'promocion_invalida' USING ERRCODE = '22023',
      HINT = 'La fecha de promoción necesita un día y un mes válidos.';
  END IF;

  UPDATE public.ninos_salones s
     SET cupo_visitantes = p_cupo_visitantes, ninos_por_voluntario = p_ninos_por_voluntario,
         min_voluntarios = p_min_voluntarios, abierto = p_abierto,
         opcion_panal = p_opcion_panal, opcion_merienda = p_opcion_merienda,
         corte_mes = p_corte_mes, corte_dia = p_corte_dia,
         promocion_mes = p_promocion_mes, promocion_dia = p_promocion_dia,
         updated_at = now()
   WHERE s.id = p_salon_id;
  RETURN p_salon_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_salon_reglas_guardar(uuid, integer, integer, integer, boolean,
  boolean, boolean, smallint, smallint, smallint, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_salon_reglas_guardar(uuid, integer, integer, integer, boolean,
  boolean, boolean, smallint, smallint, smallint, smallint) TO authenticated;

-- Saves the carpeta of an area in a campus. Allowed to who configures an
-- active salón of that area in that campus.
CREATE OR REPLACE FUNCTION public.ninos_carpeta_guardar(
  p_campus_id uuid, p_area text, p_distribucion text, p_mantener_regulares boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_area IS NULL OR p_area NOT IN ('waumba', 'upstreet') THEN
    RAISE EXCEPTION 'area_invalida' USING ERRCODE = '22023',
      HINT = 'El área es Waumba Land o UpStreet.';
  END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s
                    WHERE s.campus_id = p_campus_id AND s.area = p_area AND s.activo) a
     WHERE public.ninos_puede_configurar(a.equipo_id)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para configurar esta área en este campus.';
  END IF;
  IF p_distribucion IS NULL OR p_distribucion NOT IN ('en_orden', 'equilibrada') THEN
    RAISE EXCEPTION 'distribucion_invalida' USING ERRCODE = '22023',
      HINT = 'La distribución es en orden o equilibrada.';
  END IF;
  IF p_mantener_regulares IS NULL THEN
    RAISE EXCEPTION 'reglas_invalidas' USING ERRCODE = '22023',
      HINT = 'Indica si los regulares se quedan en su salón.';
  END IF;

  INSERT INTO public.ninos_carpetas (campus_id, area, distribucion, mantener_regulares)
  VALUES (p_campus_id, p_area, p_distribucion, p_mantener_regulares)
  ON CONFLICT (campus_id, area) DO UPDATE
     SET distribucion = excluded.distribucion, mantener_regulares = excluded.mantener_regulares
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_carpeta_guardar(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_carpeta_guardar(uuid, text, text, boolean) TO authenticated;

-- ── 9. helpers for check-in (T1b and later) ──────────────────────────

-- The check-in window of a turno: its active horario of an active event, or
-- today's fixed 120 / 120 minutes.
CREATE OR REPLACE FUNCTION public.ninos_horario_de_turno(p_turno_id uuid)
RETURNS TABLE (abre_min_antes integer, cierra_min_despues integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(x.abre_min_antes, 120), coalesce(x.cierra_min_despues, 120)
    FROM (SELECT 1) uno
    LEFT JOIN LATERAL (
      SELECT h.abre_min_antes, h.cierra_min_despues
        FROM public.ninos_evento_horarios h
        JOIN public.ninos_eventos e ON e.id = h.evento_id
       WHERE h.turno_id = p_turno_id AND h.activo AND e.activo) x ON true;
$$;

REVOKE ALL ON FUNCTION public.ninos_horario_de_turno(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_horario_de_turno(uuid) TO authenticated;

-- S8.3 "Hasta su 3.ª visita": a child is a visitor while they have fewer
-- than 3 distinct check-in fechas before p_fecha (visits 1 to 3), regular
-- from the 4th. Only for who operates Niños.
CREATE OR REPLACE FUNCTION public.ninos_es_visitante(p_nino_id uuid, p_fecha date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para operar Niños.';
  END IF;
  IF p_nino_id IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023',
      HINT = 'Indica el niño y la fecha.';
  END IF;
  RETURN (SELECT count(DISTINCT c.fecha) < 3
            FROM public.ninos_checkins c
           WHERE c.nino_id = p_nino_id AND c.fecha < p_fecha);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_es_visitante(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_es_visitante(uuid, date) TO authenticated;
