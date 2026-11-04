-- T3 (odd/tasks/dream-team-pendientes-director.md, S4, S5, S7) — what a
-- director still has to fix in their team ("Pendientes"), read-only.
--
-- Covers:
--   a. The DPS director: every alert of S4 with its exact rows and counts —
--      áreas without active servidores (grouping nodes, inactive nodes and
--      Grupos de Vida excluded; a leaf whose only child is inactive counts),
--      sin cédula (NULL or blank), fecha de nacimiento (missing, future,
--      the 1900-01-01 placeholder, before 1910), sin teléfono, estado civil
--      'No especificado', sin cuenta with its invitation state, invitación
--      vencida (latest invitation 'enviada' over 24 h, no account), por
--      activar (postulado, en_orientacion, with since when), sin turno (per
--      servicio, retired ignored), solicitudes the director can resolve;
--      the summary (urgentes, personas en orden, porcentaje); the columns the
--      actions need (servicio, version, cuenta, correo, ficha_editable,
--      invitable); no cédula, phone, email or birth year in any row.
--   b. A sub-área director (Producción Técnica) sees only their subtree:
--      a person serving in and out of it shows by the servicio inside.
--   c. A coordinator (dream_team.coordinate on Atención al Invitado) sees
--      their subtree as in Mi equipo, cannot edit or invite (no invitation
--      state, no vencida), and resolves nothing (their own request).
--   d. The Atención al Voluntario coordinator sees the parent área without the
--      parent (dream_team_equipos_registrables), invites, and resolves the
--      request inside it.
--   e. An admin sees every experiencia; Grupos de Vida never counts as an
--      área without servidores.
--   f. Nobody else: a person without Dream Team authority (even with a
--      revoked grant) and a call without session get zero counts and no rows.
--   g. Unknown tipo (also the internal markers) → 22023 tipo_desconocido.
--   h. Privileges: authenticated executes the two RPCs, anon and public do
--      not; the internal function is not executable by authenticated;
--      SECURITY DEFINER with an empty search_path.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id. Read-only RPCs: no
-- fingerprint needed.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Pe"):
--   1 DIR    dream_team.direct on ZZ Pe DPS
--   2 PT     dream_team.direct on Producción Técnica
--   3 COORD  dream_team.coordinate on Atención al Invitado
--   4 AV     active Coordinador servicio in Atención al Voluntario (+ its coordinate grant)
--   5 ADMIN  system admin
--   6 NADIE  only a revoked dream_team.direct on ZZ Pe DPS
--   Volunteers 10–24 (see the fixture). Accounts: 10, 11, 13–17, 20, 21, 23, 24.
-- Tree: 1 ZZ Pe DPS › 2 Producción Técnica (3 Cámaras, 4 Audio, 5 Video,
-- 6 Inactiva [inactive]), 7 Atención al Invitado (8 Anfitriones, 9 Atención al
-- Voluntario), 10 Bautizos (16 Archivo [inactive]), 11 Operaciones
-- (12 Estacionamiento); 13 ZZ Pe Niños (14 Sala); 15 ZZ Pe GdV (grupos_vida).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pe_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pe_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('a1e70000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c001' WHEN 'us' THEN 'c002' WHEN 'eq' THEN 'c003'
                       WHEN 'ro' THEN 'c004' WHEN 'se' THEN 'c005' WHEN 'sc' THEN 'c006'
                       WHEN 'tu' THEN 'c007' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The rows of dream_team_pendientes(p_tipo) as 'tipo:PERSONA@EQUIPO[:detalle]',
-- sorted; PERSONA without the "ZZ Pe " prefix ('-' for an área), EQUIPO the last
-- segment of the path. The detalle of a solicitud carries ids: checked apart.
-- plpgsql so the suite still loads (and fails case by case) without the RPC.
CREATE OR REPLACE FUNCTION pg_temp.filas(p_tipo text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT p.tipo || ':' || coalesce(replace(p.persona_nombre, 'ZZ Pe ', ''), '-') || '@'
                 || regexp_replace(coalesce(p.equipo_ruta, '-'), '^.* › ', '')
                 || CASE WHEN p.tipo = 'solicitud_cambio_area' OR p.detalle = '{}'::jsonb THEN '' ELSE ':' || p.detalle::text END AS t
            FROM public.dream_team_pendientes(p_tipo) p) q);
END;
$$;

-- The people named in any row, sorted.
CREATE OR REPLACE FUNCTION pg_temp.personas() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT coalesce(string_agg(n, ',' ORDER BY n COLLATE "C"), '')
    FROM (SELECT DISTINCT replace(p.persona_nombre, 'ZZ Pe ', '') AS n
            FROM public.dream_team_pendientes(NULL) p WHERE p.persona_id IS NOT NULL) q);
END;
$$;

-- The summary as one line.
CREATE OR REPLACE FUNCTION pg_temp.resumen() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT 'areas=' || r.areas_sin_servidores || '/' || r.areas_total || ' ced=' || r.sin_cedula
         || ' fecha=' || r.fecha_nacimiento || ' tel=' || r.sin_telefono || ' gec=' || r.genero_estado_civil
         || ' fichas=' || r.fichas_incompletas || ' cuenta=' || r.sin_cuenta || ' venc=' || r.invitaciones_vencidas
         || ' activar=' || r.por_activar || ' turno=' || r.sin_turno || ' sol=' || r.solicitudes
         || ' urg=' || r.urgentes || ' personas=' || r.personas_en_orden || '/' || r.personas_total
         || ' pct=' || coalesce(r.porcentaje::text, 'null')
    FROM public.dream_team_pendientes_resumen() r);
END;
$$;

-- One column set of the rows of a tipo for one person (by fixture number), '|'-joined, sorted.
CREATE OR REPLACE FUNCTION pg_temp.columnas(p_tipo text, p_us int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT coalesce(string_agg(t, ',' ORDER BY t COLLATE "C"), '')
    FROM (SELECT concat_ws('|',
                   coalesce(p.servicio_id = pg_temp.id('se', p_us) OR p.servicio_id = pg_temp.id('se', p_us * 10), false)::text,
                   coalesce(p.servicio_estado, '-'), coalesce(p.servicio_version::text, '-'),
                   coalesce(p.tiene_cuenta::text, '-'), coalesce(p.tiene_correo::text, '-'),
                   coalesce(p.ficha_editable::text, '-'), coalesce(p.invitable::text, '-'),
                   coalesce((p.desde AT TIME ZONE 'UTC')::date::text, '-')) AS t
            FROM public.dream_team_pendientes(p_tipo) p WHERE p.persona_id = pg_temp.id('us', p_us)) q);
END;
$$;

-- ── fixture ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'pe-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 6, 10, 11, 13, 14, 15, 16, 17, 20, 21, 23, 24]) AS n;

-- Complete fichas by default: cédula, phone, birth date, género, estado civil.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, cedula, telefono, fecha_nacimiento, estado_civil, genero)
SELECT pg_temp.id('us', n), CASE WHEN n IN (12, 18, 19, 22) THEN NULL ELSE pg_temp.id('au', n) END,
       'ZZ Pe', CASE WHEN n < 10 THEN 'U' ELSE 'V' END || n,
       CASE WHEN n = 12 THEN NULL ELSE 'pe-' || n || '@example.test' END,
       '98765' || lpad(n::text, 3, '0'), '0414555' || lpad(n::text, 4, '0'), DATE '1990-05-17',
       'Soltero', 'Femenino'
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) AS n;

UPDATE public.usuarios SET cedula = NULL WHERE id = pg_temp.id('us', 11);
UPDATE public.usuarios SET cedula = '   ', telefono = NULL WHERE id = pg_temp.id('us', 12);
UPDATE public.usuarios SET fecha_nacimiento = NULL WHERE id = pg_temp.id('us', 13);
UPDATE public.usuarios SET fecha_nacimiento = current_date + 30 WHERE id = pg_temp.id('us', 14);
UPDATE public.usuarios SET fecha_nacimiento = DATE '1900-01-01' WHERE id = pg_temp.id('us', 15);
UPDATE public.usuarios SET fecha_nacimiento = DATE '1905-06-01', estado_civil = 'No especificado' WHERE id = pg_temp.id('us', 16);
UPDATE public.usuarios SET cedula = NULL WHERE id IN (pg_temp.id('us', 22), pg_temp.id('us', 23));

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 5), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1),  'dps',         NULL,                 'ZZ Pe DPS',              true),
  (pg_temp.id('eq', 2),  'dps',         pg_temp.id('eq', 1),  'Producción Técnica',     true),
  (pg_temp.id('eq', 3),  'dps',         pg_temp.id('eq', 2),  'Cámaras',                true),
  (pg_temp.id('eq', 4),  'dps',         pg_temp.id('eq', 2),  'Audio',                  true),
  (pg_temp.id('eq', 5),  'dps',         pg_temp.id('eq', 2),  'Video',                  true),
  (pg_temp.id('eq', 6),  'dps',         pg_temp.id('eq', 2),  'Inactiva',               false),
  (pg_temp.id('eq', 7),  'dps',         pg_temp.id('eq', 1),  'Atención al Invitado',   true),
  (pg_temp.id('eq', 8),  'dps',         pg_temp.id('eq', 7),  'Anfitriones',            true),
  (pg_temp.id('eq', 9),  'dps',         pg_temp.id('eq', 7),  'Atención al Voluntario', true),
  (pg_temp.id('eq', 10), 'dps',         pg_temp.id('eq', 1),  'Bautizos',               true),
  (pg_temp.id('eq', 11), 'dps',         pg_temp.id('eq', 1),  'Operaciones',            true),
  (pg_temp.id('eq', 12), 'dps',         pg_temp.id('eq', 11), 'Estacionamiento',        true),
  (pg_temp.id('eq', 13), 'ninos',       NULL,                 'ZZ Pe Niños',            true),
  (pg_temp.id('eq', 14), 'ninos',       pg_temp.id('eq', 13), 'Sala',                   true),
  (pg_temp.id('eq', 15), 'grupos_vida', NULL,                 'ZZ Pe GdV',              true),
  (pg_temp.id('eq', 16), 'dps',         pg_temp.id('eq', 10), 'Archivo',                false);

-- Rol n: Voluntario of equipo n; 90 Coordinador of Atención al Voluntario.
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', n), 'Voluntario', 'voluntario', true
  FROM unnest(ARRAY[3, 4, 5, 8, 9, 10, 12, 14]) AS n
UNION ALL
SELECT pg_temp.id('ro', 90), pg_temp.id('eq', 9), 'Coordinador', 'coordinador', true;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source, revoked_at) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test', NULL),
  (pg_temp.id('us', 2), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 2)::text, 'zz-test', NULL),
  (pg_temp.id('us', 3), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 7)::text, 'zz-test', NULL),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 9)::text, 'zz-test', NULL),
  (pg_temp.id('us', 6), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test', now());

-- Servicio n belongs to person n; 210 and 211 are V21's second and third.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual)
SELECT pg_temp.id('se', v.se), pg_temp.id('us', v.us), pg_temp.id('eq', v.eq), pg_temp.id('ro', v.ro),
       v.estado::public.dream_team_estado, now() - interval '30 days',
       CASE WHEN v.estado = 'retirado' THEN now() - interval '1 day' END, 'admin_asignacion'
  FROM (VALUES (10, 10, 3, 3, 'activo'), (11, 11, 3, 3, 'activo'), (12, 12, 3, 3, 'activo'),
               (13, 13, 4, 4, 'activo'), (14, 14, 4, 4, 'activo'), (15, 15, 4, 4, 'activo'),
               (16, 16, 8, 8, 'activo'), (17, 17, 8, 8, 'en_orientacion'), (18, 18, 8, 8, 'activo'),
               (19, 19, 8, 8, 'activo'), (20, 20, 5, 5, 'postulado'), (21, 21, 12, 12, 'activo'),
               (210, 21, 3, 3, 'activo'), (211, 21, 4, 4, 'retirado'), (22, 22, 3, 3, 'retirado'),
               (23, 23, 14, 14, 'activo'), (24, 24, 3, 3, 'activo'), (4, 4, 9, 90, 'activo')) AS v(se, us, eq, ro, estado);

-- V17 entered en_orientacion 10 days ago; V20 (postulado) has no history.
INSERT INTO public.dream_team_estados_historial (servicio_id, estado_anterior, estado_nuevo, motivo, actor_persona_id, fecha) VALUES
  (pg_temp.id('se', 17), 'postulado', 'en_orientacion', 'admin_promocion', pg_temp.id('us', 1), now() - interval '10 days');

-- Every servicio has a shift except V13's, V20's, V21's in Cámaras and the retired ones.
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora)
SELECT pg_temp.id('tu', 1), c.id, 'ZZ Pe Domingo', 0, '09:00' FROM public.campus c LIMIT 1;
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id)
SELECT pg_temp.id('se', n), pg_temp.id('tu', 1)
  FROM unnest(ARRAY[10, 11, 12, 14, 15, 16, 17, 18, 19, 21, 23, 24, 4]) AS n;

-- V18: a cancelled invitation, then one sent 3 days ago (vencida). V19: sent an
-- hour ago. V10 has an account and an old open invitation: never vencida.
INSERT INTO public.invitaciones_cuenta (usuario_id, email, invitado_por, estado, created_at) VALUES
  (pg_temp.id('us', 18), 'pe-18@example.test', pg_temp.id('us', 1), 'cancelada', now() - interval '5 days'),
  (pg_temp.id('us', 18), 'pe-18@example.test', pg_temp.id('us', 1), 'enviada',   now() - interval '3 days'),
  (pg_temp.id('us', 19), 'pe-19@example.test', pg_temp.id('us', 1), 'enviada',   now() - interval '1 hour'),
  (pg_temp.id('us', 10), 'pe-10@example.test', pg_temp.id('us', 1), 'enviada',   now() - interval '10 days');

-- 1: PT asks to move V24 Cámaras → Anfitriones (pending). 2: COORD asks to move
-- V19 Anfitriones → Atención al Voluntario (pending). 3: an approved one.
INSERT INTO public.dream_team_solicitudes_cambio_area
  (id, servicio_id, equipo_origen_id, rol_origen_id, equipo_destino_id, rol_destino_id, motivo, nota, solicitante_id,
   estado, resuelto_por, resuelto_at, created_at) VALUES
  (pg_temp.id('sc', 1), pg_temp.id('se', 24), pg_temp.id('eq', 3), pg_temp.id('ro', 3), pg_temp.id('eq', 8), pg_temp.id('ro', 8),
   'traslado', 'Quiere servir con anfitriones', pg_temp.id('us', 2), 'pendiente', NULL, NULL, now() - interval '2 days'),
  (pg_temp.id('sc', 2), pg_temp.id('se', 19), pg_temp.id('eq', 8), pg_temp.id('ro', 8), pg_temp.id('eq', 9), pg_temp.id('ro', 9),
   'correccion', NULL, pg_temp.id('us', 3), 'pendiente', NULL, NULL, now() - interval '1 day'),
  (pg_temp.id('sc', 3), pg_temp.id('se', 10), pg_temp.id('eq', 3), pg_temp.id('ro', 3), pg_temp.id('eq', 4), pg_temp.id('ro', 4),
   'correccion', NULL, pg_temp.id('us', 2), 'aprobada', pg_temp.id('us', 1), now() - interval '1 day', now() - interval '3 days');

GRANT INSERT, SELECT ON t_pe_failures TO authenticated;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_f);
  END LOOP;
END;
$$;

-- ── a. the DPS director ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('a1: summary of the DPS director',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=2/7 ced=2 fecha=4 tel=1 gec=1 fichas=6 cuenta=3 venc=1 activar=2 turno=3 sol=2 urg=5 personas=3/14 pct=21');
SELECT pg_temp.assert_eq('a2: áreas without active servidores: leaves only (Operaciones, PT, Atención al Invitado and the root group sub-áreas; Inactiva is inactive; Bautizos only has an inactive child)',
  $q$SELECT pg_temp.filas('area_sin_servidores')$q$,
  'area_sin_servidores:-@Bautizos:{"por_activar": 0}, area_sin_servidores:-@Video:{"por_activar": 1}');
SELECT pg_temp.assert_eq('a3: sin cédula (NULL and blank)',
  $q$SELECT pg_temp.filas('sin_cedula')$q$, 'sin_cedula:V11@Cámaras, sin_cedula:V12@Cámaras');
SELECT pg_temp.assert_eq('a4: fecha de nacimiento missing, future, 1900 placeholder, before 1910',
  $q$SELECT pg_temp.filas('fecha_nacimiento')$q$,
  'fecha_nacimiento:V13@Audio:{"motivo": "falta"}, fecha_nacimiento:V14@Audio:{"motivo": "futura"}, '
  || 'fecha_nacimiento:V15@Audio:{"motivo": "marcador_1900"}, fecha_nacimiento:V16@Anfitriones:{"motivo": "anterior_1910"}');
SELECT pg_temp.assert_eq('a5: sin teléfono',
  $q$SELECT pg_temp.filas('sin_telefono')$q$, 'sin_telefono:V12@Cámaras');
SELECT pg_temp.assert_eq('a6: estado civil No especificado',
  $q$SELECT pg_temp.filas('genero_estado_civil')$q$, 'genero_estado_civil:V16@Anfitriones:{"campos": ["estado_civil"]}');
SELECT pg_temp.assert_eq('a7: sin cuenta with the invitation state (latest wins; under 24 h is enviada)',
  $q$SELECT pg_temp.filas('sin_cuenta')$q$,
  'sin_cuenta:V12@Cámaras:{"invitacion": "sin_invitar"}, sin_cuenta:V18@Anfitriones:{"invitacion": "vencida"}, '
  || 'sin_cuenta:V19@Anfitriones:{"invitacion": "enviada"}');
SELECT pg_temp.assert_eq('a8: invitación vencida (V10 has an account: never vencida)',
  $q$SELECT pg_temp.filas('invitacion_vencida')$q$, 'invitacion_vencida:V18@Anfitriones');
SELECT pg_temp.assert_eq('a9: por activar',
  $q$SELECT pg_temp.filas('por_activar')$q$, 'por_activar:V17@Anfitriones, por_activar:V20@Video');
SELECT pg_temp.assert_eq('a10: sin turno per servicio (V21 in Cámaras; retired servicios ignored)',
  $q$SELECT pg_temp.filas('sin_turno')$q$, 'sin_turno:V13@Audio, sin_turno:V20@Video, sin_turno:V21@Cámaras');
SELECT pg_temp.assert_eq('a11: the solicitudes the director can resolve (not the approved one)',
  $q$SELECT pg_temp.filas('solicitud_cambio_area')$q$,
  'solicitud_cambio_area:V19@Anfitriones, solicitud_cambio_area:V24@Cámaras');
SELECT pg_temp.assert_eq('a12: a solicitud carries what Aprobar / Rechazar need',
  $q$SELECT string_agg(concat_ws('|', ((p.detalle->>'solicitud_id')::uuid = pg_temp.id('sc', 1))::text, (p.servicio_id = pg_temp.id('se', 24))::text,
                                 p.servicio_estado, p.servicio_version, p.detalle->>'destino_ruta', p.detalle->>'rol_destino',
                                 p.detalle->>'motivo', p.detalle->>'nota', p.detalle->>'solicitante_nombre',
                                 ((p.desde AT TIME ZONE 'UTC')::date = ((now() - interval '2 days') AT TIME ZONE 'UTC')::date)::text), ',')
       FROM public.dream_team_pendientes('solicitud_cambio_area') p WHERE p.persona_id = pg_temp.id('us', 24)$q$,
  'true|true|activo|1|ZZ Pe DPS › Atención al Invitado › Anfitriones|Voluntario|traslado|Quiere servir con anfitriones|ZZ Pe U2|true');
SELECT pg_temp.assert_eq('a13: the full path of an área row',
  $q$SELECT string_agg(p.equipo_ruta, ',' ORDER BY p.equipo_ruta) FROM public.dream_team_pendientes('area_sin_servidores') p$q$,
  'ZZ Pe DPS › Bautizos,ZZ Pe DPS › Producción Técnica › Video');
SELECT pg_temp.assert_eq('a14: ficha rows: no servicio, has account, editable, invitable n/a',
  $q$SELECT pg_temp.columnas('sin_cedula', 11)$q$, 'false|-|-|true|true|true|-|-');
SELECT pg_temp.assert_eq('a15: sin cuenta without email: editable, invitable',
  $q$SELECT pg_temp.columnas('sin_cuenta', 12)$q$, 'false|-|-|false|false|true|true|-');
SELECT pg_temp.assert_eq('a16: vencida since the latest invitation',
  $q$SELECT pg_temp.columnas('invitacion_vencida', 18)$q$,
  'false|-|-|false|true|true|true|' || ((now() - interval '3 days') AT TIME ZONE 'UTC')::date);
SELECT pg_temp.assert_eq('a17: por activar since entering the estado (history), else since the servicio started',
  $q$SELECT pg_temp.columnas('por_activar', 17) || ' ' || pg_temp.columnas('por_activar', 20)$q$,
  'true|en_orientacion|1|-|-|-|-|' || ((now() - interval '10 days') AT TIME ZONE 'UTC')::date
  || ' true|postulado|1|-|-|-|-|' || ((now() - interval '30 days') AT TIME ZONE 'UTC')::date);
SELECT pg_temp.assert_eq('a18: sin turno names the servicio without shift',
  $q$SELECT pg_temp.columnas('sin_turno', 21)$q$, 'true|activo|1|-|-|-|-|-');
SELECT pg_temp.assert_eq('a19: everybody named is in scope (no V22 retired, no V23 of Niños)',
  $q$SELECT pg_temp.personas()$q$, 'V11,V12,V13,V14,V15,V16,V17,V18,V19,V20,V21,V24');
SELECT pg_temp.assert_eq('a20: no cédula, phone, email or birth year in any row',
  $q$SELECT count(*)::text FROM public.dream_team_pendientes(NULL) p
      WHERE p::text ~ '98765|0414555|example\.test|1905-06|1900-01-01'$q$, '0');
SELECT pg_temp.assert_eq('a21: no argument lists every tipo',
  $q$SELECT string_agg(DISTINCT p.tipo, ',' ORDER BY p.tipo) FROM public.dream_team_pendientes() p$q$,
  'area_sin_servidores,fecha_nacimiento,genero_estado_civil,invitacion_vencida,por_activar,sin_cedula,sin_cuenta,sin_telefono,sin_turno,solicitud_cambio_area');
SELECT pg_temp.assert_eq('a22: rows come ordered by tipo as the screen reads them',
  $q$SELECT string_agg(t, ',' ORDER BY o) FROM (SELECT p.tipo AS t, min(n) AS o
       FROM public.dream_team_pendientes() WITH ORDINALITY AS p(tipo, persona_id, persona_nombre, equipo_id, equipo_ruta, servicio_id,
            servicio_estado, servicio_version, tiene_cuenta, tiene_correo, ficha_editable, invitable, desde, detalle, n)
       GROUP BY p.tipo) q$q$,
  'area_sin_servidores,solicitud_cambio_area,invitacion_vencida,sin_cedula,fecha_nacimiento,sin_telefono,genero_estado_civil,sin_cuenta,por_activar,sin_turno');

-- ── b. the Producción Técnica director ───────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b1: summary of the sub-área director (their own request is not resolvable)',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=1/3 ced=2 fecha=3 tel=1 gec=0 fichas=5 cuenta=1 venc=0 activar=1 turno=3 sol=0 urg=1 personas=2/9 pct=22');
SELECT pg_temp.assert_eq('b2: only their subtree',
  $q$SELECT pg_temp.personas()$q$, 'V11,V12,V13,V14,V15,V20,V21');
SELECT pg_temp.assert_eq('b3: V21 shows by the servicio inside the subtree',
  $q$SELECT pg_temp.filas('sin_turno')$q$, 'sin_turno:V13@Audio, sin_turno:V20@Video, sin_turno:V21@Cámaras');
SELECT pg_temp.assert_eq('b4: áreas of their subtree only',
  $q$SELECT pg_temp.filas('area_sin_servidores')$q$, 'area_sin_servidores:-@Video:{"por_activar": 1}');

-- ── c. a coordinator ─────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c1: summary of the coordinator of Atención al Invitado',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=0/2 ced=0 fecha=1 tel=0 gec=1 fichas=1 cuenta=2 venc=0 activar=1 turno=0 sol=0 urg=0 personas=1/5 pct=20');
SELECT pg_temp.assert_eq('c2: their subtree, as Mi equipo',
  $q$SELECT pg_temp.personas()$q$, 'V16,V17,V18,V19');
SELECT pg_temp.assert_eq('c3: no invitation state without invite authority',
  $q$SELECT pg_temp.filas('sin_cuenta')$q$,
  'sin_cuenta:V18@Anfitriones:{"invitacion": null}, sin_cuenta:V19@Anfitriones:{"invitacion": null}');
SELECT pg_temp.assert_eq('c4: cannot edit nor invite',
  $q$SELECT pg_temp.columnas('sin_cuenta', 18)$q$, 'false|-|-|false|true|false|false|-');

-- ── d. the Atención al Voluntario coordinator ────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('d1: summary of the AV coordinator (parent área without the parent)',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=0/2 ced=0 fecha=1 tel=0 gec=1 fichas=1 cuenta=2 venc=1 activar=1 turno=0 sol=1 urg=2 personas=1/5 pct=20');
SELECT pg_temp.assert_eq('d2: they resolve the request inside their área, not the one from Cámaras',
  $q$SELECT pg_temp.filas('solicitud_cambio_area')$q$, 'solicitud_cambio_area:V19@Anfitriones');
SELECT pg_temp.assert_eq('d3: they edit and invite',
  $q$SELECT pg_temp.columnas('sin_cuenta', 19)$q$, 'false|-|-|false|true|true|true|-');

-- ── e. an admin ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('e1: summary of an admin: every experiencia, Grupos de Vida not an área without servidores',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=2/8 ced=3 fecha=4 tel=1 gec=1 fichas=7 cuenta=3 venc=1 activar=2 turno=3 sol=2 urg=5 personas=3/15 pct=20');
SELECT pg_temp.assert_eq('e2: V23 of Niños is in scope',
  $q$SELECT pg_temp.filas('sin_cedula')$q$, 'sin_cedula:V11@Cámaras, sin_cedula:V12@Cámaras, sin_cedula:V23@Sala');

-- ── f. nobody else ───────────────────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('f1: a revoked grant gives nothing',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=0/0 ced=0 fecha=0 tel=0 gec=0 fichas=0 cuenta=0 venc=0 activar=0 turno=0 sol=0 urg=0 personas=0/0 pct=null');
SELECT pg_temp.assert_eq('f2: and no rows', $q$SELECT pg_temp.filas(NULL)$q$, '');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_eq('f3: no session: zero counts',
  $q$SELECT pg_temp.resumen()$q$,
  'areas=0/0 ced=0 fecha=0 tel=0 gec=0 fichas=0 cuenta=0 venc=0 activar=0 turno=0 sol=0 urg=0 personas=0/0 pct=null');
SELECT pg_temp.assert_eq('f4: no session: no rows', $q$SELECT pg_temp.filas(NULL)$q$, '');

-- ── g. unknown tipo ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('g1: an unknown tipo',
  $q$SELECT * FROM public.dream_team_pendientes('sin_foto')$q$, '22023', 'tipo_desconocido');
SELECT pg_temp.assert_raises('g2: the internal markers are not tipos',
  $q$SELECT * FROM public.dream_team_pendientes('persona')$q$, '22023', 'tipo_desconocido');
SELECT pg_temp.assert_raises('g3: nor is the área marker',
  $q$SELECT * FROM public.dream_team_pendientes('area')$q$, '22023', 'tipo_desconocido');
SELECT pg_temp.assert_raises('g4: authenticated cannot call the internal function',
  $q$SELECT * FROM public.dream_team_pendientes_filas()$q$, '42501');
RESET ROLE;

-- ── h. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('h1: authenticated executes the RPCs, anon and public do not; the internal one is not executable; SECURITY DEFINER, empty search_path',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('public', p.oid, 'EXECUTE')
                        || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ', ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dream_team_pendientes%'$q$,
  'dream_team_pendientes(text)=true|false|false|true, '
  || 'dream_team_pendientes_filas()=false|false|false|true, '
  || 'dream_team_pendientes_resumen()=true|false|false|true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_pe_failures);
END;
$$;
