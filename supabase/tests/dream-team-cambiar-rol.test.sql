-- T1 (odd/tasks/dream-team-cambiar-rol.md, S1–S4) — «Cambiar rol» changes the
-- rol of a Dream Team servicio inside its own equipo, at once.
--
-- Covers:
--   a. The DPS director changes a Cámaras volunteer Voluntario → Líder: only
--      rol_id changes (version + 1; equipo, estado, motivo_actual,
--      fecha_inicio, fecha_fin and turnos stay), one history row signed by
--      her (estado → same estado, "Cambio de rol · De … a … · nota"), the
--      Líder verificación is added pendiente and the Inducción one stays, the
--      Voluntario grants are revoked and the Líder ones minted; the answer
--      carries the servicio, the old and the new rol.
--   b. The Cámaras coordinator changes another volunteer Voluntario → Líder.
--   c. Guards of the user decision (2026-11-25): the coordinator cannot assign
--      a director-level rol (42501 rol_direccion) nor change their own
--      servicio (42501 propio_servicio); the director can do both (and, in
--      j, changes the coordinator's own servicio, which revokes
--      dream_team.coordinate).
--   d. Who else is refused (42501 sin_autoridad, nothing changes): the Audio
--      coordinator (another área), a person with an account and no grant, a
--      session without a person; anon cannot execute.
--   e. Invalid input (22023, nothing changes): rol of another equipo and an
--      inactive rol (rol_invalido), the current rol (mismo_rol), a retired
--      servicio (servicio_retirado), an unknown servicio
--      (servicio_inexistente), a rol the person already holds in another
--      servicio of the equipo (rol_duplicado).
--   f. An en_orientacion servicio changes rol and mints nothing.
--   g. The dialog read (dream_team_servicio_roles_cambiables): the current rol
--      marked actual, the inactive rol hidden, director-level roles not
--      asignable for a coordinator, a held rol not asignable; refused like (d)
--      and for one's own servicio without director authority.
--   h. Privileges: the two RPCs are SECURITY DEFINER with an empty
--      search_path, executable by authenticated only; the validation helper
--      is closed.
--   i. «Cambiar de área» unchanged (S4): its RPCs keep their signatures and
--      grants, and its destinations still exclude the current equipo.
--   k. T2, S6 (user, 2026-11-25: «un coordinador no puede editar rol ni de si
--      ni de otros coordinadores ni de superiores»): without director
--      authority the coordinator cannot change the rol of a servicio whose
--      current rol is Coordinador or Director, whatever the new rol (42501
--      rol_superior, before rol_invalido / mismo_rol / rol_direccion), nor
--      read its roles list; nothing changes. Their own servicio still answers
--      propio_servicio (c, g). The coordinator still changes a Líder; the
--      director changes a Coordinador and a Director.
--   j. The director demotes the coordinator (last: it ends their authority).
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id; state checks run as the
-- connection role.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Cr"):
--   1 DIR       dream_team.direct on ZZ DPS; activo Voluntario servicio 1 in Cámaras
--   2 COORD     activo Coordinador servicio 2 in Cámaras (dream_team.coordinate
--               on Cámaras, minted from it)
--   3 AUD_COORD dream_team.coordinate on Audio
--   4 NADIE     an account without grants
--   Volunteers (no account), servicios in Cámaras: 10 V10 activo Voluntario
--   (induccion completado, one turno), 11 V11 activo, 12 V12 activo, 13 V13
--   activo, 14 V14 retirado, 15 V15 activo Voluntario and activo Líder (150),
--   16 V16 en_orientacion, 17 V17 activo Coordinador, 18 V18 activo Director.
-- Tree: 1 ZZ DPS › 2 Producción Técnica › 3 Cámaras, 4 Audio. Cámaras roles:
-- 3 Voluntario, 30 Líder (requisito liderazgo), 31 Coordinador, 32 Director,
-- 33 Antiguo (inactive); Audio: 4 Voluntario.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_cr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs a call that returns one value and keeps it under p_key; an error is a failure.
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_cr_ctx (k, v) VALUES (p_key, coalesce(v, 'NULL'));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_key, 'unexpected error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT v FROM t_cr_ctx WHERE k = p_key;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('c4a10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c001' WHEN 'us' THEN 'c002' WHEN 'eq' THEN 'c003'
                       WHEN 'ro' THEN 'c004' WHEN 'se' THEN 'c005' WHEN 'rq' THEN 'c006'
                       WHEN 'ca' THEN 'c007' WHEN 'tu' THEN 'c008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The RPCs with fixture ids. plpgsql so the suite still loads (and fails case
-- by case) without them.
CREATE OR REPLACE FUNCTION pg_temp.cambiar(p_se int, p_ro int, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_servicio_cambiar_rol(pg_temp.id('se', p_se), pg_temp.id('ro', p_ro), p_nota);
END;
$$;

-- Labels of fixture ids; anything else prints as its raw id.
CREATE TEMP TABLE t_cr_labels (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.lbl(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT label FROM t_cr_labels WHERE id = p_id), p_id::text);
$$;

-- The roles of the dialog: 'rol|actual|asignable', in order.
CREATE OR REPLACE FUNCTION pg_temp.roles(p_se int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(pg_temp.lbl(r.id) || '|' || r.actual || '|' || r.asignable, ', ')
            FROM public.dream_team_servicio_roles_cambiables(pg_temp.id('se', p_se)) r);
END;
$$;

-- A servicio: 'EQ:rol:estado:motivo_actual:version:inicio:fin'.
CREATE OR REPLACE FUNCTION pg_temp.servicio(p_se int) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.lbl(s.equipo_id) || ':' || pg_temp.lbl(s.rol_id) || ':' || s.estado || ':' || s.motivo_actual
         || ':' || s.version || ':' || CASE WHEN s.fecha_inicio = now() - interval '30 days' THEN 'inicio' ELSE 'otro' END
         || ':' || CASE WHEN s.fecha_fin IS NULL THEN '-' ELSE 'fin' END
    FROM public.dream_team_servicios s WHERE s.id = pg_temp.id('se', p_se);
$$;

-- A servicio's history: 'anterior>nuevo:motivo:actor:detalle', sorted.
CREATE OR REPLACE FUNCTION pg_temp.historial(p_se int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ' | ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT h.estado_anterior || '>' || h.estado_nuevo || ':' || h.motivo
                 || ':' || pg_temp.lbl(h.actor_persona_id) || ':' || coalesce(h.detalle_motivo, '-') AS t
            FROM public.dream_team_estados_historial h
           WHERE h.servicio_id = pg_temp.id('se', p_se)) q;
$$;

-- A servicio's verificaciones: 'codigo:estado', sorted.
CREATE OR REPLACE FUNCTION pg_temp.verificaciones(p_se int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT rq.codigo || ':' || v.estado AS t
            FROM public.dream_team_requisitos_verificacion v
            JOIN public.dream_team_requisitos rq ON rq.id = v.requisito_id
           WHERE v.servicio_id = pg_temp.id('se', p_se)) q;
$$;

-- A person's grants: 'key@SCOPE' (active) or 'key@SCOPE~' (revoked), sorted.
CREATE OR REPLACE FUNCTION pg_temp.grants(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT g.capability_key || '@' || coalesce(pg_temp.lbl(g.scope_id::uuid), '-')
                 || CASE WHEN g.revoked_at IS NULL THEN '' ELSE '~' END AS t
            FROM public.dream_team_capability_grants g
           WHERE g.persona_id = pg_temp.id('us', p_us) AND g.source = 'dream-team-servicio') q;
$$;

-- Fingerprint of every fixture row a change can touch.
CREATE OR REPLACE FUNCTION pg_temp.huella() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT md5(
    coalesce((SELECT string_agg(s.id::text || s.equipo_id::text || s.rol_id::text || s.estado::text || s.motivo_actual::text
                                || s.version::text || coalesce(s.fecha_fin::text, '') || s.updated_at::text, ',' ORDER BY s.id)
                FROM public.dream_team_servicios s WHERE s.persona_id::text LIKE 'c4a10000-%'), '') || '/' ||
    coalesce((SELECT string_agg(h.id::text || h.estado_nuevo::text, ',' ORDER BY h.id)
                FROM public.dream_team_estados_historial h
                JOIN public.dream_team_servicios s ON s.id = h.servicio_id
               WHERE s.persona_id::text LIKE 'c4a10000-%'), '') || '/' ||
    coalesce((SELECT string_agg(v.id::text || v.estado::text, ',' ORDER BY v.id)
                FROM public.dream_team_requisitos_verificacion v
                JOIN public.dream_team_servicios s ON s.id = v.servicio_id
               WHERE s.persona_id::text LIKE 'c4a10000-%'), '') || '/' ||
    coalesce((SELECT string_agg(g.id::text || coalesce(g.revoked_at::text, '') || g.granted_at::text, ',' ORDER BY g.id)
                FROM public.dream_team_capability_grants g WHERE g.persona_id::text LIKE 'c4a10000-%'), '')));
END;
$$;

-- ── fixture ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cr', 'U' || n, 'cr-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Cr', 'V' || n, 'No especificado', 'Femenino'
  FROM generate_series(10, 18) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', NULL,                'ZZ DPS',             true),
  (pg_temp.id('eq', 2), 'dps', pg_temp.id('eq', 1), 'Producción Técnica', true),
  (pg_temp.id('eq', 3), 'dps', pg_temp.id('eq', 2), 'Cámaras',            true),
  (pg_temp.id('eq', 4), 'dps', pg_temp.id('eq', 2), 'Audio',              true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 3),  pg_temp.id('eq', 3), 'Voluntario',  'voluntario',  true),
  (pg_temp.id('ro', 30), pg_temp.id('eq', 3), 'Líder',       'lider',       true),
  (pg_temp.id('ro', 31), pg_temp.id('eq', 3), 'Coordinador', 'coordinador', true),
  (pg_temp.id('ro', 32), pg_temp.id('eq', 3), 'Director',    'director',    true),
  (pg_temp.id('ro', 33), pg_temp.id('eq', 3), 'Antiguo',     'voluntario',  false),
  (pg_temp.id('ro', 4),  pg_temp.id('eq', 4), 'Voluntario',  'voluntario',  true);

INSERT INTO public.dream_team_requisitos (id, equipo_id, rol_id, codigo, label, tipo, obligatoriedad) VALUES
  (pg_temp.id('rq', 3),  pg_temp.id('eq', 3), pg_temp.id('ro', 3),  'induccion',  'Inducción',  'capacitacion', 'requerido'),
  (pg_temp.id('rq', 30), pg_temp.id('eq', 3), pg_temp.id('ro', 30), 'liderazgo',  'Liderazgo',  'capacitacion', 'requerido');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test'),
  (pg_temp.id('us', 3), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text, 'zz-test');

-- Servicio n belongs to usuario n; 150 is V15's Líder servicio.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual)
SELECT pg_temp.id('se', v.se), pg_temp.id('us', v.us), pg_temp.id('eq', 3), pg_temp.id('ro', v.ro),
       v.estado::public.dream_team_estado, now() - interval '30 days',
       CASE WHEN v.estado = 'retirado' THEN now() - interval '1 day' END, 'admin_asignacion'
  FROM (VALUES (1, 1, 3, 'activo'), (2, 2, 31, 'activo'), (10, 10, 3, 'activo'), (11, 11, 3, 'activo'),
               (12, 12, 3, 'activo'), (13, 13, 3, 'activo'), (14, 14, 3, 'retirado'), (15, 15, 3, 'activo'),
               (150, 15, 30, 'activo'), (16, 16, 3, 'en_orientacion'), (17, 17, 31, 'activo'),
               (18, 18, 32, 'activo')) AS v(se, us, ro, estado);

INSERT INTO public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
SELECT s.id, pg_temp.id('rq', 3), CASE WHEN s.id = pg_temp.id('se', 10) THEN 'completado' ELSE 'pendiente' END::public.dream_team_requisito_estado
  FROM public.dream_team_servicios s WHERE s.rol_id = pg_temp.id('ro', 3) AND s.persona_id::text LIKE 'c4a10000-%';

-- The grants of every active servicio, written as dream_team_cargar_voluntarios does.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT DISTINCT s.persona_id, k.capability_key, k.experience, k.scope_type, k.scope_id, 'dream-team-servicio'
  FROM public.dream_team_servicios s
  JOIN public.dream_team_equipos e ON e.id = s.equipo_id
  JOIN public.dream_team_roles r ON r.id = s.rol_id
 CROSS JOIN LATERAL public.dream_team_grants_de_servicio(s.equipo_id, e.experiencia, s.rol_id, r.label) k
 WHERE s.estado = 'activo' AND s.persona_id::text LIKE 'c4a10000-%';

-- V10 serves one Sunday shift of their principal campus.
INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Cr Campus', 'ZZCR1');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES (pg_temp.id('us', 10), pg_temp.id('ca', 1), true);
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'Domingo 9:00', 0, '09:00', 1, true);
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 10), pg_temp.id('tu', 1));

INSERT INTO t_cr_labels (id, label)
SELECT pg_temp.id('eq', n), l FROM (VALUES (1, 'DPS'), (2, 'PT'), (3, 'CAM'), (4, 'AUD')) AS x(n, l)
UNION ALL
SELECT pg_temp.id('ro', n), l FROM (VALUES (3, 'vol'), (30, 'lider'), (31, 'coord'), (32, 'dir'), (33, 'antiguo'), (4, 'aud-vol')) AS x(n, l)
UNION ALL
SELECT pg_temp.id('us', n), l FROM (VALUES (1, 'DIR'), (2, 'COORD'), (3, 'AUD_COORD'), (4, 'NADIE')) AS x(n, l);

GRANT INSERT, SELECT ON t_cr_failures, t_cr_ctx TO authenticated, anon;
GRANT SELECT ON t_cr_labels TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

SELECT pg_temp.assert_eq('fixture: COORD coordinates Cámaras through their servicio',
  $q$SELECT pg_temp.grants(2)$q$, 'dps.team.lead@CAM, dream_team.coordinate@CAM, dream_team.serve@CAM');
SELECT pg_temp.assert_eq('fixture: V10 serves as Voluntario with one turno',
  $q$SELECT pg_temp.grants(10) || ' / ' || (SELECT count(*) FROM public.dream_team_servicio_turnos t WHERE t.servicio_id = pg_temp.id('se', 10))$q$,
  'dps.team.serve@CAM, dream_team.serve@CAM / 1');

-- ── a. the director changes a volunteer's rol ───────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('a', $q$SELECT pg_temp.cambiar(10, 30, '  Ya lidera el turno  ')$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('a: the answer carries the servicio, the old and the new rol',
  $q$SELECT pg_temp.lbl((j->>'rol_anterior_id')::uuid) || '>' || pg_temp.lbl((j->>'rol_id')::uuid) || ':' || (j->>'rol_label')
            || ':' || ((j->>'servicio_id')::uuid = pg_temp.id('se', 10))
       FROM (SELECT pg_temp.ctx('a')::jsonb AS j) x$q$, 'vol>lider:Líder:true');
SELECT pg_temp.assert_eq('a: only the rol changes (version + 1); equipo, estado, motivo, fechas stay',
  $q$SELECT pg_temp.servicio(10)$q$, 'CAM:lider:activo:admin_asignacion:2:inicio:-');
SELECT pg_temp.assert_eq('a: the turno stays',
  $q$SELECT string_agg(pg_temp.lbl(t.turno_id), ',') || ':' || count(*) FROM public.dream_team_servicio_turnos t
      WHERE t.servicio_id = pg_temp.id('se', 10)$q$, pg_temp.id('tu', 1)::text || ':1');
SELECT pg_temp.assert_eq('a: one history row signed by the director, from → to and the trimmed nota',
  $q$SELECT pg_temp.historial(10)$q$, 'activo>activo:reasignacion:DIR:Cambio de rol · De Voluntario a Líder · Ya lidera el turno');
SELECT pg_temp.assert_eq('a: the history row is dated now',
  $q$SELECT (max(h.fecha) = now())::text FROM public.dream_team_estados_historial h WHERE h.servicio_id = pg_temp.id('se', 10)$q$, 'true');
SELECT pg_temp.assert_eq('a: the Líder requisito is added pendiente; Inducción stays completado',
  $q$SELECT pg_temp.verificaciones(10)$q$, 'induccion:completado, liderazgo:pendiente');
SELECT pg_temp.assert_eq('a: Voluntario grants revoked, Líder grants minted',
  $q$SELECT pg_temp.grants(10)$q$, 'dps.team.lead@CAM, dps.team.serve@CAM~, dream_team.lead@CAM, dream_team.serve@CAM');

-- ── b. the coordinator of the equipo changes another volunteer ──────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('b', $q$SELECT pg_temp.cambiar(11, 30)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('b: the coordinator changed it, without a nota',
  $q$SELECT pg_temp.servicio(11) || ' / ' || pg_temp.historial(11)$q$,
  'CAM:lider:activo:admin_asignacion:2:inicio:- / activo>activo:reasignacion:COORD:Cambio de rol · De Voluntario a Líder');

-- ── c. the guards of the user decision ──────────────────────────────

INSERT INTO t_cr_ctx (k, v) VALUES ('c.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: the coordinator cannot assign a director-level rol',
  $q$SELECT pg_temp.cambiar(12, 32)$q$, '42501', 'rol_direccion');
SELECT pg_temp.assert_raises('c: the coordinator cannot change their own servicio',
  $q$SELECT pg_temp.cambiar(2, 30)$q$, '42501', 'propio_servicio');
RESET ROLE;
SELECT pg_temp.assert_eq('c: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('c.antes'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('c.dir', $q$SELECT pg_temp.cambiar(12, 32)$q$);
SELECT pg_temp.guardar('c.propio', $q$SELECT pg_temp.cambiar(1, 30)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c: the director assigns a director-level rol, mints its grants',
  $q$SELECT pg_temp.servicio(12) || ' / ' || pg_temp.grants(12)$q$,
  'CAM:dir:activo:admin_asignacion:2:inicio:- / dps.team.director@CAM, dps.team.serve@CAM~, dream_team.direct@CAM, dream_team.serve@CAM');
SELECT pg_temp.assert_eq('c: the director changes her own servicio',
  $q$SELECT pg_temp.servicio(1) || ' / ' || pg_temp.historial(1)$q$,
  'CAM:lider:activo:admin_asignacion:2:inicio:- / activo>activo:reasignacion:DIR:Cambio de rol · De Voluntario a Líder');

-- ── d. who else is refused ──────────────────────────────────────────

INSERT INTO t_cr_ctx (k, v) VALUES ('d.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d: the coordinator of another área is refused',
  $q$SELECT pg_temp.cambiar(13, 30)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('d: a person without grants is refused',
  $q$SELECT pg_temp.cambiar(13, 30)$q$, '42501', 'sin_autoridad');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_raises('d: a session without a person is refused',
  $q$SELECT pg_temp.cambiar(13, 30)$q$, '42501', 'sin_autoridad');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises('d: anon cannot execute it',
  format('SELECT public.dream_team_servicio_cambiar_rol(%L::uuid, %L::uuid, NULL)', pg_temp.id('se', 13), pg_temp.id('ro', 30)),
  '42501', 'permission denied for function dream_team_servicio_cambiar_rol');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('d.antes'));

-- ── e. invalid input ────────────────────────────────────────────────

INSERT INTO t_cr_ctx (k, v) VALUES ('e.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('e: a rol of another equipo is refused',
  $q$SELECT pg_temp.cambiar(13, 4)$q$, '22023', 'rol_invalido');
SELECT pg_temp.assert_raises('e: an inactive rol is refused',
  $q$SELECT pg_temp.cambiar(13, 33)$q$, '22023', 'rol_invalido');
SELECT pg_temp.assert_raises('e: an unknown rol is refused',
  $q$SELECT pg_temp.cambiar(13, 99)$q$, '22023', 'rol_invalido');
SELECT pg_temp.assert_raises('e: the current rol is refused',
  $q$SELECT pg_temp.cambiar(13, 3)$q$, '22023', 'mismo_rol');
SELECT pg_temp.assert_raises('e: a retired servicio is refused',
  $q$SELECT pg_temp.cambiar(14, 30)$q$, '22023', 'servicio_retirado');
SELECT pg_temp.assert_raises('e: an unknown servicio is refused',
  $q$SELECT pg_temp.cambiar(99, 30)$q$, '22023', 'servicio_inexistente');
SELECT pg_temp.assert_raises('e: a rol the person already holds in the equipo is refused',
  $q$SELECT pg_temp.cambiar(15, 30)$q$, '22023', 'rol_duplicado');
RESET ROLE;
SELECT pg_temp.assert_eq('e: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('e.antes'));

-- ── f. en_orientacion ───────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('f', $q$SELECT pg_temp.cambiar(16, 30)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('f: en_orientacion keeps its estado, mints nothing, adds the Líder verificación',
  $q$SELECT pg_temp.servicio(16) || ' / ' || pg_temp.grants(16) || ' / ' || pg_temp.verificaciones(16)
            || ' / ' || pg_temp.historial(16)$q$,
  'CAM:lider:en_orientacion:admin_asignacion:2:inicio:- /  / induccion:pendiente, liderazgo:pendiente'
  || ' / en_orientacion>en_orientacion:reasignacion:COORD:Cambio de rol · De Voluntario a Líder');

-- ── g. the dialog read ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('g: the coordinator: current marked, inactive hidden, Director not asignable',
  $q$SELECT pg_temp.roles(13)$q$, 'coord|false|true, dir|false|false, lider|false|true, vol|true|false');
SELECT pg_temp.assert_eq('g: a rol the person holds elsewhere in the equipo is not asignable',
  $q$SELECT pg_temp.roles(15)$q$, 'coord|false|true, dir|false|false, lider|false|false, vol|true|false');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: the director may assign the Director rol',
  $q$SELECT pg_temp.roles(13)$q$, 'coord|false|true, dir|false|true, lider|false|true, vol|true|false');
SELECT pg_temp.assert_raises('g: a retired servicio has no roles to pick',
  $q$SELECT pg_temp.roles(14)$q$, '22023', 'servicio_retirado');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('g: the coordinator does not read their own servicio',
  $q$SELECT pg_temp.roles(2)$q$, '42501', 'propio_servicio');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('g: the coordinator of another área is refused',
  $q$SELECT pg_temp.roles(13)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('g: a person without grants is refused',
  $q$SELECT pg_temp.roles(13)$q$, '42501', 'sin_autoridad');
RESET ROLE;

-- ── h. privileges ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('h: authenticated executes the RPCs, anon and public do not; SECURITY DEFINER, empty search_path',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('public', p.oid, 'EXECUTE')
                        || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ', ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_servicio_cambiar_rol', 'dream_team_servicio_roles_cambiables',
                          'dream_team_servicio_cambiar_rol_validar')$q$,
  'dream_team_servicio_cambiar_rol(uuid,uuid,text)=true|false|false|true, '
  || 'dream_team_servicio_cambiar_rol_validar(uuid,uuid)=false|false|false|true, '
  || 'dream_team_servicio_roles_cambiables(uuid)=true|false|false|true');

-- ── i. «Cambiar de área» unchanged (S4) ─────────────────────────────

SELECT pg_temp.assert_eq('i: the cambiar-área RPCs keep their signatures and grants',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE'), ', ' ORDER BY p.oid::regprocedure::text COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_cambiar_area', 'dream_team_solicitar_cambio_area', 'dream_team_cambiar_area_destinos',
                          'dream_team_resolver_solicitud_cambio_area', 'dream_team_puede_solicitar_cambio_area')$q$,
  'dream_team_cambiar_area(uuid,uuid,uuid,text,text)=true|false, '
  || 'dream_team_cambiar_area_destinos(uuid)=true|false, '
  || 'dream_team_puede_solicitar_cambio_area(uuid)=true|false, '
  || 'dream_team_resolver_solicitud_cambio_area(uuid,boolean,text)=true|false, '
  || 'dream_team_solicitar_cambio_area(uuid,uuid,uuid,text,text)=true|false');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('i: the cambiar-área destinations still exclude the current equipo',
  $q$SELECT count(*) FILTER (WHERE d.equipo_id = pg_temp.id('eq', 3)) || '|' || count(*) FILTER (WHERE d.equipo_id = pg_temp.id('eq', 4))
       FROM public.dream_team_cambiar_area_destinos(pg_temp.id('se', 13)) d$q$, '0|1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('i: the button condition is the same function (coordinator of Cámaras yes, of Audio no)',
  $q$SELECT public.dream_team_puede_solicitar_cambio_area(pg_temp.id('eq', 3)) || '|' || public.dream_team_puede_solicitar_cambio_area(pg_temp.id('eq', 4))$q$,
  'true|false');
RESET ROLE;

-- ── k. T2, S6: coordinators do not change coordinators nor directors ─

INSERT INTO t_cr_ctx (k, v) VALUES ('k.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('k: the coordinator cannot change another coordinator''s rol',
  $q$SELECT pg_temp.cambiar(17, 30)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: the coordinator cannot promote another coordinator to Director either',
  $q$SELECT pg_temp.cambiar(17, 32)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: rol_superior comes before the rol checks (current rol)',
  $q$SELECT pg_temp.cambiar(17, 31)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: the coordinator cannot change a director''s rol',
  $q$SELECT pg_temp.cambiar(18, 31)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: the coordinator cannot demote a director to Voluntario',
  $q$SELECT pg_temp.cambiar(18, 3)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: the coordinator does not read a coordinator''s roles',
  $q$SELECT pg_temp.roles(17)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: the coordinator does not read a director''s roles',
  $q$SELECT pg_temp.roles(18)$q$, '42501', 'rol_superior');
SELECT pg_temp.assert_raises('k: their own servicio still answers propio_servicio',
  $q$SELECT pg_temp.cambiar(2, 3)$q$, '42501', 'propio_servicio');
RESET ROLE;
SELECT pg_temp.assert_eq('k: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('k.antes'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('k.lider', $q$SELECT pg_temp.cambiar(11, 3)$q$);
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('k: the director reads a coordinator''s roles',
  $q$SELECT pg_temp.roles(17)$q$, 'coord|true|false, dir|false|true, lider|false|true, vol|false|true');
SELECT pg_temp.guardar('k.coord', $q$SELECT pg_temp.cambiar(17, 30)$q$);
SELECT pg_temp.guardar('k.dir', $q$SELECT pg_temp.cambiar(18, 31)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('k: the coordinator still changes a Líder (back to Voluntario)',
  $q$SELECT pg_temp.servicio(11) || ' / ' || pg_temp.historial(11)$q$,
  'CAM:vol:activo:admin_asignacion:3:inicio:- / activo>activo:reasignacion:COORD:Cambio de rol · De Líder a Voluntario'
  || ' | activo>activo:reasignacion:COORD:Cambio de rol · De Voluntario a Líder');
SELECT pg_temp.assert_eq('k: the director changes a coordinator''s rol',
  $q$SELECT pg_temp.servicio(17) || ' / ' || pg_temp.historial(17)$q$,
  'CAM:lider:activo:admin_asignacion:2:inicio:- / activo>activo:reasignacion:DIR:Cambio de rol · De Coordinador a Líder');
SELECT pg_temp.assert_eq('k: the director changes a director''s rol',
  $q$SELECT pg_temp.servicio(18) || ' / ' || pg_temp.historial(18)$q$,
  'CAM:coord:activo:admin_asignacion:2:inicio:- / activo>activo:reasignacion:DIR:Cambio de rol · De Director a Coordinador');

-- ── j. the director demotes the coordinator ─────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('j', $q$SELECT pg_temp.cambiar(2, 30)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('j: the director changes the coordinator''s servicio; dream_team.coordinate is revoked',
  $q$SELECT pg_temp.servicio(2) || ' / ' || pg_temp.grants(2)$q$,
  'CAM:lider:activo:admin_asignacion:2:inicio:- / dps.team.lead@CAM, dream_team.coordinate@CAM~, dream_team.lead@CAM, dream_team.serve@CAM');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('j: without dream_team.coordinate they can no longer change roles in Cámaras',
  $q$SELECT pg_temp.cambiar(13, 30)$q$, '42501', 'sin_autoridad');
RESET ROLE;

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_cr_failures);
END;
$$;
