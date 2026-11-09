-- noqa: insert-into
-- DPS planning: service notices in the app panel (odd/tasks/dps-asistencia-pco.md,
-- T15a; S13.1-S13.4, S13.6; L62-L65; artboards design/dps-avisos 01-07).
-- Builds on 20261108200000..20261109200000.
--
-- The user asked (L62): "si luego más adelante se cambia otra vez la persona y
-- ya le habíamos avisado entonces cómo debería funcionar esta parte también?",
-- and chose (L63): "ahora mismo solo en el panel de la app y mas adelanta lo
-- hacemos por correo..". Approved with the recommended answers (L65): a change
-- of hours only keeps the confirmation, a change of puesto asks again (S13.4);
-- a blocked date only warns (S13.6); «Sin cuenta» never gets a notice.
--
-- What:
--   1. Tables (RLS on, no policies, no privilege for anon or authenticated):
--        dps_avisos   the last NOTIFIED snapshot per plan and person (one per
--                     pair, as the attendance): claves (sorted 'p:<puesto_id>'
--                     / 'c:<columna>'), roles (what the person was told: per
--                     role origen, puesto_id / columna, nombre, equipo,
--                     direccion, automatico), fecha, horarios and llegada at
--                     send time; *_antes = the previous value of whatever the
--                     last «cambio» changed (NULL otherwise); estado
--                     ('pendiente', 'confirmo', 'no_puede') with motivo (only
--                     for no_puede, up to 300) and respondido_at; enviado_at /
--                     enviado_por; quitado (taken out after the notice); cambio
--                     (changed after the notice; the person's answer clears
--                     it); visto_at (the person dismissed «Ya no estás
--                     programado» / «Cambió tu servicio»).
--        dream_team_fechas_bloqueadas   the dates a person cannot serve
--                     (persona_id, desde, hasta, nota up to 200, created_at);
--                     desde <= hasta, at most 366 days; one row per person and
--                     range. Personal: only its owner reads or writes it, the
--                     planners see who is blocked on a plan's date.
--   2. Pending notices are COMPUTED, never stored: the current assignments
--      (dps_convocados, automatic directors included, and the persona rows of
--      dps_plan_personas; a written name «Sin cuenta» never counts) against
--      dps_avisos, only for plans dated ninos_hoy() or later:
--        assigned, no notice (or a quitado one)          -> 'nueva'
--        notified, other puestos / columnas or other fecha -> 'cambio' that
--                                                           asks again
--        notified, only horarios / llegada changed        -> 'cambio' that keeps
--                                                           the answer
--        notified, no longer assigned, not 'no_puede'     -> 'quitado'
--        notified 'no_puede', no longer assigned          -> closed silently
--                                                           (no notice, L64 02)
--      So changing Juan -> Pedro -> Pedro2 before sending leaves nothing for
--      Juan or Pedro, and taking someone out and back in before sending leaves
--      their notice as it was («Deshacer» of 01).
--   3. For planners (dps_exigir_planificador; each syncs the automatic
--      directors of the plans first, so they are VOLATILE; past plans and
--      unknown ids are ignored; more than 400 ids is 'demasiados'):
--        dps_avisos_pendientes(plan_ids) -> {total, nuevas, cambios, quitados,
--            no_reciben: {ya_respondieron: [...], sin_cuenta: [...], sin_cambios}}
--            the review panel of 02. total also counts the no_puede taken
--            out (listed under ya_respondieron): sending closes them, so a
--            closure alone still has something to send (L67).
--        dps_avisos_enviar(plan_ids) -> {enviados, nuevas, cambios, quitados,
--            cerrados}   applies every pending notice at once under the plans'
--            locks; a second call sends 0.
--        dps_avisos_estado(plan_ids) -> {por_enviar, planes: [{plan_id, fecha,
--            pasado, por_enviar, resumen, personas}]}   per plan and person:
--            'sin_avisar' (a pending nueva / cambio), 'pendiente', 'confirmo',
--            'no_puede' (with motivo) or 'quitado' (notified, taken out, not
--            sent yet); past plans show their notices as they are.
--            por_enviar (global and per plan) also counts the no_puede taken
--            out, which are not among the personas (L67).
--        dps_personas_bloqueadas(plan) -> (persona_id, nota)   who blocked the
--            plan's date (S13.6: the planner may still pick them, with a
--            warning). A separate function: dps_candidatos_puesto and
--            dps_buscar_personas keep their signatures and row shapes.
--   4. For the person (ninos_usuario_actual(); no planner gate; only their own
--      rows):
--        dps_mis_servicios() -> {servicios, avisos, por_responder,
--            fechas_bloqueadas}   upcoming notified services (not quitado),
--            and the unseen notices: quitado, or cambio of an answered one.
--        dps_mi_servicio(plan) -> {servicio, pasado, personas, confirmaron,
--            companeros, orden}   'sin_autoridad' unless the caller has a
--            notice of that plan that is not quitado. companeros are the
--            notified people (not quitado) with their notified roles and only
--            `confirmo` true / false: another person's no_puede or motivo
--            never leaves the database.
--        dps_responder(plan, respuesta, motivo) -> the service   own notice,
--            not quitado ('sin_autoridad'), plan not past ('plan_pasado');
--            'confirmo' | 'no_puede' ('respuesta_invalida'); motivo only for
--            no_puede, trimmed, up to 300 ('motivo_invalido'); clears cambio.
--        dps_aviso_visto(plan) -> true   dismisses the notice of that plan.
--        dps_mis_fechas_bloqueadas() -> [{id, desde, hasta, nota, conflictos}]
--            ranges that have not ended, by desde.
--        dps_fecha_bloqueada_agregar(desde, hasta, nota) -> {id, desde, hasta,
--            nota, conflictos}   conflictos = own notices (not quitado, from
--            today) inside the range; nothing is answered for the person
--            (S13.6). Errors fecha_invalida, rango_invalido, fecha_pasada (the
--            range ended), nota_invalida, demasiados (100 ranges). The same
--            range again updates its nota.
--        dps_fecha_bloqueada_quitar(id) -> true   own rows ('bloqueo_invalido').
--   5. Internal (no EXECUTE for PUBLIC, anon or authenticated):
--      dps_avisos_asignaciones(plan_ids), dps_avisos_diff(plan_ids),
--      dps_avisos_preparar(plan_ids), dps_aviso_json(aviso),
--      dps_fecha_bloqueada_json(id).
--
-- Errors: 'sin_autoridad' (42501); 22023 for demasiados, plan_invalido,
-- plan_pasado, respuesta_invalida, motivo_invalido, fecha_invalida,
-- rango_invalido, fecha_pasada, nota_invalida, bloqueo_invalido.
--
-- Known limits: deleting a plan deletes its notices (ON DELETE CASCADE), so
-- nobody is told; the e-mail channel comes later (S13.1).
--
-- Suite: supabase/tests/dps-avisos.test.sql.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_fecha_bloqueada_quitar(uuid),
--     public.dps_fecha_bloqueada_agregar(date, date, text), public.dps_mis_fechas_bloqueadas(),
--     public.dps_aviso_visto(uuid), public.dps_responder(uuid, text, text), public.dps_mi_servicio(uuid),
--     public.dps_mis_servicios(), public.dps_personas_bloqueadas(uuid), public.dps_avisos_estado(uuid[]),
--     public.dps_avisos_enviar(uuid[]), public.dps_avisos_pendientes(uuid[]),
--     public.dps_fecha_bloqueada_json(uuid), public.dps_aviso_json(uuid), public.dps_avisos_preparar(uuid[]),
--     public.dps_avisos_diff(uuid[]), public.dps_avisos_asignaciones(uuid[]);
--   DROP TABLE IF EXISTS public.dream_team_fechas_bloqueadas, public.dps_avisos;

-- ── 1. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dps_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.dps_planes(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  claves text[] NOT NULL,
  roles jsonb NOT NULL,
  fecha date NOT NULL,
  horarios jsonb NOT NULL,
  llegada time NOT NULL,
  roles_antes jsonb,
  fecha_antes date,
  horarios_antes jsonb,
  llegada_antes time,
  estado text NOT NULL DEFAULT 'pendiente',
  motivo text,
  respondido_at timestamptz,
  enviado_at timestamptz NOT NULL DEFAULT now(),
  enviado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  quitado boolean NOT NULL DEFAULT false,
  cambio boolean NOT NULL DEFAULT false,
  visto_at timestamptz,
  CONSTRAINT dps_avisos_unico UNIQUE (plan_id, persona_id)
);
CREATE INDEX IF NOT EXISTS dps_avisos_persona_idx ON public.dps_avisos (persona_id);

ALTER TABLE public.dps_avisos DROP CONSTRAINT IF EXISTS dps_avisos_estado_check;
ALTER TABLE public.dps_avisos
  ADD CONSTRAINT dps_avisos_estado_check CHECK (estado IN ('pendiente', 'confirmo', 'no_puede'));
ALTER TABLE public.dps_avisos DROP CONSTRAINT IF EXISTS dps_avisos_motivo_check;
ALTER TABLE public.dps_avisos
  ADD CONSTRAINT dps_avisos_motivo_check
  CHECK (motivo IS NULL OR (estado = 'no_puede' AND btrim(motivo) <> '' AND char_length(motivo) <= 300));
ALTER TABLE public.dps_avisos DROP CONSTRAINT IF EXISTS dps_avisos_forma_check;
ALTER TABLE public.dps_avisos
  ADD CONSTRAINT dps_avisos_forma_check
  CHECK (jsonb_typeof(roles) = 'array' AND jsonb_typeof(horarios) = 'array'
         AND (roles_antes IS NULL OR jsonb_typeof(roles_antes) = 'array')
         AND (horarios_antes IS NULL OR jsonb_typeof(horarios_antes) = 'array'));

CREATE TABLE IF NOT EXISTS public.dream_team_fechas_bloqueadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  desde date NOT NULL,
  hasta date NOT NULL,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dream_team_fechas_bloqueadas_unico UNIQUE (persona_id, desde, hasta)
);
CREATE INDEX IF NOT EXISTS dream_team_fechas_bloqueadas_persona_idx
  ON public.dream_team_fechas_bloqueadas (persona_id, hasta);
CREATE INDEX IF NOT EXISTS dream_team_fechas_bloqueadas_rango_idx
  ON public.dream_team_fechas_bloqueadas (desde, hasta);

ALTER TABLE public.dream_team_fechas_bloqueadas DROP CONSTRAINT IF EXISTS dream_team_fechas_bloqueadas_rango_check;
ALTER TABLE public.dream_team_fechas_bloqueadas
  ADD CONSTRAINT dream_team_fechas_bloqueadas_rango_check CHECK (desde <= hasta AND hasta - desde <= 366);
ALTER TABLE public.dream_team_fechas_bloqueadas DROP CONSTRAINT IF EXISTS dream_team_fechas_bloqueadas_nota_check;
ALTER TABLE public.dream_team_fechas_bloqueadas
  ADD CONSTRAINT dream_team_fechas_bloqueadas_nota_check CHECK (nota IS NULL OR (btrim(nota) <> '' AND char_length(nota) <= 200));

COMMENT ON TABLE public.dps_avisos IS
  'DPS service notices: the last notified snapshot per plan and person, and their answer (S13). Only through the dps_* functions.';
COMMENT ON TABLE public.dream_team_fechas_bloqueadas IS
  'Dates a person cannot serve (S13.6). Personal: only through the dps_* functions.';

ALTER TABLE public.dps_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_team_fechas_bloqueadas ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.dps_avisos, public.dream_team_fechas_bloqueadas FROM PUBLIC, anon, authenticated;

-- ── 2. internal helpers ──────────────────────────────────────────────

-- The current assignments of the plans: one row per person and puesto
-- (clave 'p:<puesto_id>') or column (clave 'c:<columna>'). Written names
-- («Sin cuenta») are not here.
CREATE OR REPLACE FUNCTION public.dps_avisos_asignaciones(p_plan_ids uuid[])
RETURNS TABLE (plan_id uuid, persona_id uuid, clave text, rol jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH arbol AS MATERIALIZED (
    SELECT d.equipo_id, d.profundidad, d.ruta FROM public.dps_equipos() d
  ), raiz AS MATERIALIZED (
    SELECT (SELECT e.label FROM public.dream_team_equipos e WHERE e.id = public.dps_raiz()) AS dps,
           (SELECT e.label FROM public.dream_team_equipos e WHERE e.id = public.dps_equipo_produccion_creativa()) AS pc,
           (SELECT e.label FROM public.dream_team_equipos e WHERE e.id = public.dps_raiz_musica()) AS musica,
           (SELECT e.label FROM public.dream_team_equipos e WHERE e.id = public.dps_equipo_cantantes()) AS cantantes
  )
  SELECT c.plan_id, c.persona_id, 'p:' || c.puesto_id::text,
         jsonb_build_object(
           'origen', 'puesto', 'puesto_id', c.puesto_id, 'columna', NULL, 'nombre', pu.nombre, 'equipo', e.label,
           -- The dirección: the one a director puesto stands for, else the
           -- first level under the DPS root (Global Music is its own root).
           'direccion', coalesce(dir.label,
                                 CASE WHEN a.profundidad IS NULL THEN e.label
                                      WHEN a.profundidad = 0 OR split_part(a.ruta, ' › ', 1) IS DISTINCT FROM r.dps
                                        THEN split_part(a.ruta, ' › ', 1)
                                      ELSE split_part(a.ruta, ' › ', 2) END),
           'automatico', c.automatico)
    FROM public.dps_convocados c
    JOIN public.dps_puestos pu ON pu.id = c.puesto_id
    JOIN public.dream_team_equipos e ON e.id = pu.equipo_id
    LEFT JOIN public.dream_team_equipos dir ON dir.id = pu.direccion_equipo_id
    LEFT JOIN arbol a ON a.equipo_id = pu.equipo_id
   CROSS JOIN raiz r
   WHERE c.plan_id = ANY (p_plan_ids)
  UNION ALL
  SELECT pp.plan_id, pp.persona_id, 'c:' || pp.columna,
         jsonb_build_object(
           'origen', 'columna', 'puesto_id', NULL, 'columna', pp.columna,
           'nombre', CASE pp.columna WHEN 'productor' THEN 'Productor' WHEN 'host' THEN 'Host'
                                     WHEN 'comunicador' THEN 'Comunicador' ELSE 'Cantantes' END,
           'equipo', CASE WHEN pp.columna = 'cantantes' THEN coalesce(r.cantantes, 'Cantantes')
                          ELSE coalesce(r.pc, 'Producción Creativa') END,
           'direccion', CASE WHEN pp.columna = 'cantantes' THEN coalesce(r.musica, 'Global Music')
                             ELSE coalesce(r.pc, 'Producción Creativa') END,
           'automatico', false)
    FROM public.dps_plan_personas pp
   CROSS JOIN raiz r
   WHERE pp.plan_id = ANY (p_plan_ids) AND pp.persona_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_asignaciones(uuid[]) FROM PUBLIC, anon, authenticated;

-- The pending notices of the plans dated today or later (see the header):
-- tipo 'nueva', 'cambio' (reinicia: asks again), 'quitado', 'cerrar' (a
-- no_puede taken out: closed without a notice) or 'igual'. claves / roles are
-- the current ones (NULL when no longer assigned).
CREATE OR REPLACE FUNCTION public.dps_avisos_diff(p_plan_ids uuid[])
RETURNS TABLE (plan_id uuid, persona_id uuid, tipo text, reinicia boolean, claves text[], roles jsonb,
               aviso_id uuid, estado text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH planes AS MATERIALIZED (
    SELECT p.id, p.fecha, p.horarios, p.llegada
      FROM public.dps_planes p
     WHERE p.id = ANY (p_plan_ids) AND p.fecha >= public.ninos_hoy()
  ), actual AS MATERIALIZED (
    SELECT a.plan_id, a.persona_id,
           array_agg(a.clave ORDER BY a.clave COLLATE "C") AS claves,
           jsonb_agg(a.rol ORDER BY a.rol ->> 'direccion', a.rol ->> 'equipo', a.rol ->> 'nombre', a.clave COLLATE "C") AS roles
      FROM public.dps_avisos_asignaciones(ARRAY(SELECT pl.id FROM planes pl)) a
     GROUP BY a.plan_id, a.persona_id
  ), avisos AS MATERIALIZED (
    SELECT v.id, v.plan_id, v.persona_id, v.claves, v.fecha, v.horarios, v.llegada, v.estado, v.quitado
      FROM public.dps_avisos v
     WHERE v.plan_id IN (SELECT pl.id FROM planes pl)
  ), cruce AS (
    SELECT coalesce(ac.plan_id, v.plan_id) AS plan_id, coalesce(ac.persona_id, v.persona_id) AS persona_id,
           ac.claves, ac.roles, v.id AS aviso_id, v.quitado, v.estado,
           v.claves AS claves_avisadas, v.fecha AS fecha_avisada, v.horarios AS horarios_avisados, v.llegada AS llegada_avisada
      FROM actual ac
      FULL JOIN avisos v ON v.plan_id = ac.plan_id AND v.persona_id = ac.persona_id
  ), tipos AS (
    SELECT x.*,
           CASE
             WHEN x.claves IS NOT NULL AND (x.aviso_id IS NULL OR x.quitado) THEN 'nueva'
             WHEN x.claves IS NOT NULL AND (x.claves <> x.claves_avisadas OR x.fecha_avisada <> pl.fecha) THEN 'cambio'
             WHEN x.claves IS NOT NULL AND (x.horarios_avisados <> pl.horarios OR x.llegada_avisada <> pl.llegada) THEN 'cambio'
             WHEN x.claves IS NOT NULL THEN 'igual'
             WHEN x.estado = 'no_puede' THEN 'cerrar'
             ELSE 'quitado'
           END AS tipo,
           (x.claves IS NOT NULL AND x.aviso_id IS NOT NULL AND NOT x.quitado
            AND (x.claves <> x.claves_avisadas OR x.fecha_avisada <> pl.fecha)) AS reinicia
      FROM cruce x
      JOIN planes pl ON pl.id = x.plan_id
     -- A quitado notice of someone still out: nothing to say.
     WHERE x.claves IS NOT NULL OR NOT x.quitado
  )
  SELECT t.plan_id, t.persona_id, t.tipo, t.reinicia, t.claves, t.roles, t.aviso_id, t.estado FROM tipos t;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_diff(uuid[]) FROM PUBLIC, anon, authenticated;

-- The plans of p_plan_ids dated today or later, by fecha, with their
-- automatic directors synced (as dps_plan_equipos does before reading).
CREATE OR REPLACE FUNCTION public.dps_avisos_preparar(p_plan_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
BEGIN
  IF cardinality(p_plan_ids) > 400 THEN
    RAISE EXCEPTION 'demasiados' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(p.id ORDER BY p.fecha, p.id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.dps_planes p
   WHERE p.id = ANY (coalesce(p_plan_ids, ARRAY[]::uuid[])) AND p.fecha >= public.ninos_hoy();
  IF cardinality(v_ids) > 0 THEN
    PERFORM public.dps_directores_puestos_sincronizar();
    FOREACH v_id IN ARRAY v_ids LOOP
      PERFORM public.dps_directores_sincronizar(v_id);
    END LOOP;
  END IF;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_preparar(uuid[]) FROM PUBLIC, anon, authenticated;

-- A notice as the person sees it (what they were told).
CREATE OR REPLACE FUNCTION public.dps_aviso_json(p_aviso_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'plan_id', v.plan_id, 'fecha', v.fecha, 'tipo', p.tipo, 'titulo', p.titulo, 'semana', p.semana,
           'serie', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
                      'nombre', s.nombre, 'color', s.color, 'imagen_path', s.imagen_path) END,
           'roles', v.roles, 'horarios', v.horarios, 'llegada', to_char(v.llegada, 'HH24:MI'),
           'estado', v.estado, 'motivo', v.motivo, 'respondido_at', v.respondido_at,
           'cambio', v.cambio, 'quitado', v.quitado, 'visto_at', v.visto_at,
           'antes', jsonb_build_object('roles', v.roles_antes, 'fecha', v.fecha_antes, 'horarios', v.horarios_antes,
                                       'llegada', to_char(v.llegada_antes, 'HH24:MI')),
           'enviado_at', v.enviado_at,
           'enviado_por', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios u WHERE u.id = v.enviado_por))
    FROM public.dps_avisos v
    JOIN public.dps_planes p ON p.id = v.plan_id
    LEFT JOIN public.dps_series s ON s.id = p.serie_id
   WHERE v.id = p_aviso_id;
$$;
REVOKE ALL ON FUNCTION public.dps_aviso_json(uuid) FROM PUBLIC, anon, authenticated;

-- A blocked range with the owner's notices inside it (S13.6).
CREATE OR REPLACE FUNCTION public.dps_fecha_bloqueada_json(p_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'id', b.id, 'desde', b.desde, 'hasta', b.hasta, 'nota', b.nota,
           'conflictos', coalesce((SELECT jsonb_agg(public.dps_aviso_json(v.id) ORDER BY p.fecha, p.id)
                                     FROM public.dps_avisos v
                                     JOIN public.dps_planes p ON p.id = v.plan_id
                                    WHERE v.persona_id = b.persona_id AND NOT v.quitado
                                      AND p.fecha BETWEEN b.desde AND b.hasta AND p.fecha >= public.ninos_hoy()), '[]'::jsonb))
    FROM public.dream_team_fechas_bloqueadas b
   WHERE b.id = p_id;
$$;
REVOKE ALL ON FUNCTION public.dps_fecha_bloqueada_json(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. planner ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_avisos_pendientes(p_plan_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_ids uuid[];
BEGIN
  v_ids := public.dps_avisos_preparar(p_plan_ids);
  RETURN (
    WITH d AS MATERIALIZED (
      SELECT x.* FROM public.dps_avisos_diff(v_ids) x
    ), f AS MATERIALIZED (
      SELECT d.plan_id, d.persona_id, d.tipo, d.reinicia, d.claves, d.roles,
             v.roles AS roles_avisados, v.claves AS claves_avisadas, v.fecha AS fecha_avisada,
             v.horarios AS horarios_avisados, v.llegada AS llegada_avisada, v.estado AS estado_aviso,
             pl.fecha, pl.horarios, pl.llegada, u.nombre, u.apellido,
             jsonb_build_object(
               'plan_id', d.plan_id, 'fecha', pl.fecha, 'tipo', pl.tipo, 'titulo', pl.titulo, 'serie', s.nombre,
               'persona_id', d.persona_id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
               'iniciales', public.dps_iniciales(u.nombre, u.apellido), 'tiene_cuenta', u.auth_id IS NOT NULL) AS base
        FROM d
        JOIN public.dps_planes pl ON pl.id = d.plan_id
        LEFT JOIN public.dps_series s ON s.id = pl.serie_id
        JOIN public.usuarios u ON u.id = d.persona_id
        LEFT JOIN public.dps_avisos v ON v.id = d.aviso_id
    )
    SELECT jsonb_build_object(
      -- A no_puede taken out (cerrar) counts too: only a send closes it (L67).
      'total', (SELECT count(*) FROM f WHERE f.tipo IN ('nueva', 'cambio', 'quitado', 'cerrar')),
      'nuevas', coalesce((
        SELECT jsonb_agg(f.base || jsonb_build_object(
                 'roles', f.roles,
                 'automatico', EXISTS (SELECT 1 FROM jsonb_array_elements(f.roles) r WHERE (r ->> 'automatico')::boolean),
                 -- Who said no_puede in one of these puestos and no longer holds it (02: «reemplaza a …»).
                 'reemplaza', (SELECT coalesce(jsonb_agg(DISTINCT concat_ws(' ', u2.nombre, u2.apellido)), '[]'::jsonb)
                                 FROM public.dps_avisos v2
                                 JOIN public.usuarios u2 ON u2.id = v2.persona_id
                                WHERE v2.plan_id = f.plan_id AND v2.persona_id <> f.persona_id
                                  AND v2.estado = 'no_puede' AND v2.claves && f.claves
                                  AND NOT EXISTS (SELECT 1 FROM d d2
                                                   WHERE d2.plan_id = v2.plan_id AND d2.persona_id = v2.persona_id
                                                     AND d2.claves && f.claves)))
                 ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
          FROM f WHERE f.tipo = 'nueva'), '[]'::jsonb),
      'cambios', coalesce((
        SELECT jsonb_agg(f.base || jsonb_build_object(
                 'roles', f.roles, 'reinicia', f.reinicia, 'estado', f.estado_aviso,
                 'horarios', f.horarios, 'llegada', to_char(f.llegada, 'HH24:MI'),
                 'roles_antes', CASE WHEN f.claves <> f.claves_avisadas THEN f.roles_avisados END,
                 'fecha_antes', CASE WHEN f.fecha_avisada <> f.fecha THEN f.fecha_avisada END,
                 'horarios_antes', CASE WHEN f.horarios_avisados <> f.horarios THEN f.horarios_avisados END,
                 'llegada_antes', CASE WHEN f.llegada_avisada <> f.llegada THEN to_char(f.llegada_avisada, 'HH24:MI') END)
                 ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
          FROM f WHERE f.tipo = 'cambio'), '[]'::jsonb),
      'quitados', coalesce((
        SELECT jsonb_agg(f.base || jsonb_build_object('roles', f.roles_avisados)
                 ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
          FROM f WHERE f.tipo = 'quitado'), '[]'::jsonb),
      'no_reciben', jsonb_build_object(
        'ya_respondieron', coalesce((
          SELECT jsonb_agg(f.base || jsonb_build_object('roles', f.roles_avisados)
                   ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
            FROM f WHERE f.tipo = 'cerrar'), '[]'::jsonb),
        'sin_cuenta', coalesce((
          SELECT jsonb_agg(jsonb_build_object('plan_id', pp.plan_id, 'fecha', pl.fecha, 'columna', pp.columna, 'nombre', pp.texto)
                   ORDER BY pl.fecha, pp.columna, pp.posicion)
            FROM public.dps_plan_personas pp
            JOIN public.dps_planes pl ON pl.id = pp.plan_id
           WHERE pp.plan_id = ANY (v_ids) AND pp.texto IS NOT NULL), '[]'::jsonb),
        'sin_cambios', (SELECT count(*) FROM f WHERE f.tipo = 'igual')))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_pendientes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_avisos_pendientes(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_avisos_enviar(p_plan_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_ids uuid[];
  v_resultado jsonb;
BEGIN
  v_ids := public.dps_avisos_preparar(p_plan_ids);
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('enviados', 0, 'nuevas', 0, 'cambios', 0, 'quitados', 0, 'cerrados', 0);
  END IF;
  -- The convocados writers take this lock, dps_plan_campo the plan row: the
  -- assignments stay still while the notices are written.
  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || x.id::text))
     FROM unnest(v_ids) AS x(id)
    ORDER BY x.id;
  PERFORM 1 FROM public.dps_planes p WHERE p.id = ANY (v_ids) ORDER BY p.id FOR UPDATE;

  WITH d AS MATERIALIZED (
    SELECT x.*, pl.fecha, pl.horarios, pl.llegada
      FROM public.dps_avisos_diff(v_ids) x
      JOIN public.dps_planes pl ON pl.id = x.plan_id
     WHERE x.tipo IN ('nueva', 'cambio', 'quitado', 'cerrar')
  ), nuevas AS (
    INSERT INTO public.dps_avisos AS v (plan_id, persona_id, claves, roles, fecha, horarios, llegada, enviado_por) -- noqa: insert-into
    SELECT d.plan_id, d.persona_id, d.claves, d.roles, d.fecha, d.horarios, d.llegada, v_actor
      FROM d WHERE d.tipo = 'nueva'
    ON CONFLICT ON CONSTRAINT dps_avisos_unico DO UPDATE
       SET claves = excluded.claves, roles = excluded.roles, fecha = excluded.fecha,
           horarios = excluded.horarios, llegada = excluded.llegada,
           roles_antes = NULL, fecha_antes = NULL, horarios_antes = NULL, llegada_antes = NULL,
           estado = 'pendiente', motivo = NULL, respondido_at = NULL,
           quitado = false, cambio = false, visto_at = NULL,
           enviado_at = now(), enviado_por = excluded.enviado_por
    RETURNING 1
  ), cambios AS (
    UPDATE public.dps_avisos v
       SET claves = d.claves, roles = d.roles, fecha = d.fecha, horarios = d.horarios, llegada = d.llegada,
           roles_antes = CASE WHEN v.claves <> d.claves THEN v.roles END,
           fecha_antes = CASE WHEN v.fecha <> d.fecha THEN v.fecha END,
           horarios_antes = CASE WHEN v.horarios <> d.horarios THEN v.horarios END,
           llegada_antes = CASE WHEN v.llegada <> d.llegada THEN v.llegada END,
           -- S13.4: another puesto (or date) asks again; only the hours keep the answer.
           estado = CASE WHEN d.reinicia THEN 'pendiente' ELSE v.estado END,
           motivo = CASE WHEN d.reinicia THEN NULL ELSE v.motivo END,
           respondido_at = CASE WHEN d.reinicia THEN NULL ELSE v.respondido_at END,
           cambio = true, visto_at = NULL, enviado_at = now(), enviado_por = v_actor
      FROM d
     WHERE v.id = d.aviso_id AND d.tipo = 'cambio'
    RETURNING 1
  ), quitados AS (
    UPDATE public.dps_avisos v
       SET quitado = true, cambio = false,
           -- A no_puede taken out gets no «Ya no estás programado».
           visto_at = CASE WHEN d.tipo = 'cerrar' THEN now() END,
           enviado_at = CASE WHEN d.tipo = 'quitado' THEN now() ELSE v.enviado_at END,
           enviado_por = CASE WHEN d.tipo = 'quitado' THEN v_actor ELSE v.enviado_por END
      FROM d
     WHERE v.id = d.aviso_id AND d.tipo IN ('quitado', 'cerrar')
    RETURNING d.tipo
  )
  SELECT jsonb_build_object(
           'nuevas', (SELECT count(*) FROM nuevas),
           'cambios', (SELECT count(*) FROM cambios),
           'quitados', (SELECT count(*) FROM quitados q WHERE q.tipo = 'quitado'),
           'cerrados', (SELECT count(*) FROM quitados q WHERE q.tipo = 'cerrar'))
    INTO v_resultado;
  RETURN v_resultado || jsonb_build_object(
    'enviados', (v_resultado ->> 'nuevas')::int + (v_resultado ->> 'cambios')::int + (v_resultado ->> 'quitados')::int);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_enviar(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_avisos_enviar(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_avisos_estado(p_plan_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_futuros uuid[];
BEGIN
  v_futuros := public.dps_avisos_preparar(p_plan_ids);
  RETURN (
    WITH planes AS MATERIALIZED (
      SELECT p.id, p.fecha, p.fecha < public.ninos_hoy() AS pasado
        FROM public.dps_planes p
       WHERE p.id = ANY (coalesce(p_plan_ids, ARRAY[]::uuid[]))
    ), d AS MATERIALIZED (
      SELECT x.* FROM public.dps_avisos_diff(v_futuros) x
    ), actuales AS MATERIALIZED (
      SELECT a.plan_id, a.persona_id, array_agg(a.clave ORDER BY a.clave COLLATE "C") AS claves
        FROM public.dps_avisos_asignaciones(ARRAY(SELECT pl.id FROM planes pl WHERE pl.pasado)) a
       GROUP BY a.plan_id, a.persona_id
    ), filas AS MATERIALIZED (
      SELECT d.plan_id, d.persona_id,
             CASE WHEN d.tipo = 'igual' THEN NULL ELSE d.tipo END AS por_enviar,
             CASE WHEN d.tipo IN ('nueva', 'cambio') THEN 'sin_avisar' WHEN d.tipo = 'quitado' THEN 'quitado' ELSE v.estado END AS estado,
             CASE WHEN d.tipo = 'quitado' THEN v.claves ELSE d.claves END AS claves,
             CASE WHEN d.tipo = 'cambio' AND d.claves <> v.claves THEN v.roles END AS roles_antes,
             CASE WHEN d.tipo = 'nueva' THEN NULL ELSE v.id END AS aviso_id
        FROM d
        LEFT JOIN public.dps_avisos v ON v.id = d.aviso_id
       -- A no_puede taken out is not a row of the plan; it only counts in por_enviar.
       WHERE d.tipo <> 'cerrar'
      UNION ALL
      -- Past plans: their notices as they are, nothing to send.
      SELECT v.plan_id, v.persona_id, NULL, v.estado, coalesce(ac.claves, v.claves), NULL, v.id
        FROM public.dps_avisos v
        JOIN planes pl ON pl.id = v.plan_id AND pl.pasado
        LEFT JOIN actuales ac ON ac.plan_id = v.plan_id AND ac.persona_id = v.persona_id
       WHERE NOT v.quitado
    )
    SELECT jsonb_build_object(
      'por_enviar', (SELECT count(*) FROM filas f WHERE f.por_enviar IS NOT NULL)
                    + (SELECT count(*) FROM d WHERE d.tipo = 'cerrar'),
      'planes', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'plan_id', pl.id, 'fecha', pl.fecha, 'pasado', pl.pasado,
                 'por_enviar', (SELECT count(*) FROM filas f WHERE f.plan_id = pl.id AND f.por_enviar IS NOT NULL)
                               + (SELECT count(*) FROM d WHERE d.plan_id = pl.id AND d.tipo = 'cerrar'),
                 'resumen', jsonb_build_object(
                   'sin_avisar', (SELECT count(*) FROM filas f WHERE f.plan_id = pl.id AND f.estado = 'sin_avisar'),
                   'pendiente', (SELECT count(*) FROM filas f WHERE f.plan_id = pl.id AND f.estado = 'pendiente'),
                   'confirmo', (SELECT count(*) FROM filas f WHERE f.plan_id = pl.id AND f.estado = 'confirmo'),
                   'no_puede', (SELECT count(*) FROM filas f WHERE f.plan_id = pl.id AND f.estado = 'no_puede'),
                   'quitado', (SELECT count(*) FROM filas f WHERE f.plan_id = pl.id AND f.estado = 'quitado'),
                   'sin_cuenta', (SELECT count(*) FROM public.dps_plan_personas pp WHERE pp.plan_id = pl.id AND pp.texto IS NOT NULL)),
                 'personas', coalesce((
                   SELECT jsonb_agg(jsonb_build_object(
                            'persona_id', f.persona_id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
                            'iniciales', public.dps_iniciales(u.nombre, u.apellido), 'tiene_cuenta', u.auth_id IS NOT NULL,
                            'estado', f.estado, 'por_enviar', f.por_enviar, 'claves', to_jsonb(f.claves),
                            'roles_antes', f.roles_antes,
                            'estado_aviso', CASE WHEN f.aviso_id IS NOT NULL AND NOT v.quitado THEN v.estado END,
                            'motivo', CASE WHEN f.aviso_id IS NOT NULL AND NOT v.quitado THEN v.motivo END,
                            'respondido_at', CASE WHEN f.aviso_id IS NOT NULL AND NOT v.quitado THEN v.respondido_at END,
                            'enviado_at', CASE WHEN f.aviso_id IS NOT NULL THEN v.enviado_at END)
                            ORDER BY u.nombre, u.apellido, f.persona_id)
                     FROM filas f
                     JOIN public.usuarios u ON u.id = f.persona_id
                     LEFT JOIN public.dps_avisos v ON v.id = f.aviso_id
                    WHERE f.plan_id = pl.id), '[]'::jsonb))
                 ORDER BY pl.fecha, pl.id)
          FROM planes pl), '[]'::jsonb))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_estado(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_avisos_estado(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_personas_bloqueadas(p_plan_id uuid)
RETURNS TABLE (persona_id uuid, nota text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_fecha date;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT p.fecha INTO v_fecha FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (b.persona_id) b.persona_id, b.nota
    FROM public.dream_team_fechas_bloqueadas b
   WHERE v_fecha BETWEEN b.desde AND b.hasta
   ORDER BY b.persona_id, b.nota IS NULL, b.created_at, b.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_personas_bloqueadas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_personas_bloqueadas(uuid) TO authenticated;

-- ── 4. the person ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_mis_servicios()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_hoy date := public.ninos_hoy();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'servicios', coalesce((SELECT jsonb_agg(public.dps_aviso_json(v.id) ORDER BY p.fecha, p.id)
                             FROM public.dps_avisos v JOIN public.dps_planes p ON p.id = v.plan_id
                            WHERE v.persona_id = v_actor AND NOT v.quitado AND p.fecha >= v_hoy), '[]'::jsonb),
    -- Unseen «Ya no estás programado» and «Cambió tu servicio» of an answered
    -- one (a pending one is already a card to answer).
    'avisos', coalesce((SELECT jsonb_agg(public.dps_aviso_json(v.id) ORDER BY p.fecha, p.id)
                          FROM public.dps_avisos v JOIN public.dps_planes p ON p.id = v.plan_id
                         WHERE v.persona_id = v_actor AND v.visto_at IS NULL AND p.fecha >= v_hoy
                           AND (v.quitado OR (v.cambio AND v.estado <> 'pendiente'))), '[]'::jsonb),
    'por_responder', (SELECT count(*) FROM public.dps_avisos v JOIN public.dps_planes p ON p.id = v.plan_id
                       WHERE v.persona_id = v_actor AND NOT v.quitado AND v.estado = 'pendiente' AND p.fecha >= v_hoy),
    'fechas_bloqueadas', (SELECT count(*) FROM public.dream_team_fechas_bloqueadas b
                           WHERE b.persona_id = v_actor AND b.hasta >= v_hoy));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_mis_servicios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_mis_servicios() TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_mi_servicio(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_aviso uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT v.id INTO v_aviso FROM public.dps_avisos v
   WHERE v.plan_id = p_plan_id AND v.persona_id = v_actor AND NOT v.quitado;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH equipo AS MATERIALIZED (
      SELECT v.persona_id, v.roles, v.estado, u.nombre, u.apellido
        FROM public.dps_avisos v
        JOIN public.usuarios u ON u.id = v.persona_id
       WHERE v.plan_id = p_plan_id AND NOT v.quitado
    )
    SELECT jsonb_build_object(
      'servicio', public.dps_aviso_json(v_aviso),
      'pasado', (SELECT p.fecha < public.ninos_hoy() FROM public.dps_planes p WHERE p.id = p_plan_id),
      'personas', (SELECT count(*) FROM equipo),
      'confirmaron', (SELECT count(*) FROM equipo e WHERE e.estado = 'confirmo'),
      -- Only confirmó or not: another person's no_puede and motivo stay private.
      'companeros', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                       'persona_id', e.persona_id, 'nombre', concat_ws(' ', e.nombre, e.apellido),
                                       'iniciales', public.dps_iniciales(e.nombre, e.apellido),
                                       'yo', e.persona_id = v_actor, 'roles', e.roles, 'confirmo', e.estado = 'confirmo')
                                       ORDER BY e.roles -> 0 ->> 'direccion', e.roles -> 0 ->> 'equipo', e.nombre, e.apellido, e.persona_id)
                                FROM equipo e), '[]'::jsonb),
      'orden', coalesce((SELECT jsonb_agg(public.dps_orden_item_json(o.id) ORDER BY o.posicion)
                           FROM public.dps_orden_items o WHERE o.plan_id = p_plan_id), '[]'::jsonb))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_mi_servicio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_mi_servicio(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_responder(p_plan_id uuid, p_respuesta text, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_aviso uuid;
  v_motivo text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT v.id INTO v_aviso FROM public.dps_avisos v
   WHERE v.plan_id = p_plan_id AND v.persona_id = v_actor AND NOT v.quitado
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id AND p.fecha < public.ninos_hoy()) THEN
    RAISE EXCEPTION 'plan_pasado' USING ERRCODE = '22023';
  END IF;
  IF p_respuesta IS NULL OR p_respuesta NOT IN ('confirmo', 'no_puede') THEN
    RAISE EXCEPTION 'respuesta_invalida' USING ERRCODE = '22023';
  END IF;
  v_motivo := CASE WHEN p_respuesta = 'no_puede' THEN nullif(btrim(p_motivo), '') END;
  IF char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.dps_avisos
     SET estado = p_respuesta, motivo = v_motivo, respondido_at = now(), cambio = false
   WHERE id = v_aviso;
  RETURN public.dps_aviso_json(v_aviso);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_responder(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_responder(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_aviso_visto(p_plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  UPDATE public.dps_avisos
     SET visto_at = coalesce(visto_at, now())
   WHERE plan_id = p_plan_id AND persona_id = v_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_aviso_visto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_aviso_visto(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_mis_fechas_bloqueadas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(public.dps_fecha_bloqueada_json(b.id) ORDER BY b.desde, b.hasta, b.id)
                     FROM public.dream_team_fechas_bloqueadas b
                    WHERE b.persona_id = v_actor AND b.hasta >= public.ninos_hoy()), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_mis_fechas_bloqueadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_mis_fechas_bloqueadas() TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_fecha_bloqueada_agregar(p_desde date, p_hasta date, p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_nota text := nullif(btrim(p_nota), '');
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_desde > p_hasta OR p_hasta - p_desde > 366 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_hasta < public.ninos_hoy() THEN
    RAISE EXCEPTION 'fecha_pasada' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_nota) > 200 THEN
    RAISE EXCEPTION 'nota_invalida' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dream_team_fechas_bloqueadas:' || v_actor::text));
  IF (SELECT count(*) FROM public.dream_team_fechas_bloqueadas b
       WHERE b.persona_id = v_actor AND b.hasta >= public.ninos_hoy()) >= 100
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_fechas_bloqueadas b
                      WHERE b.persona_id = v_actor AND b.desde = p_desde AND b.hasta = p_hasta) THEN
    RAISE EXCEPTION 'demasiados' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dream_team_fechas_bloqueadas AS b (persona_id, desde, hasta, nota) -- noqa: insert-into
  VALUES (v_actor, p_desde, p_hasta, v_nota)
  ON CONFLICT ON CONSTRAINT dream_team_fechas_bloqueadas_unico DO UPDATE SET nota = excluded.nota
  RETURNING b.id INTO v_id;
  -- S13.6: the notices inside the range are reported, never answered.
  RETURN public.dps_fecha_bloqueada_json(v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_fecha_bloqueada_agregar(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_fecha_bloqueada_agregar(date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_fecha_bloqueada_quitar(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  -- Another person's range reads as missing.
  DELETE FROM public.dream_team_fechas_bloqueadas b WHERE b.id = p_id AND b.persona_id = v_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bloqueo_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_fecha_bloqueada_quitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_fecha_bloqueada_quitar(uuid) TO authenticated;
