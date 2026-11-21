-- T3 (odd/tasks/dream-team-estructura-correcciones.md, S4, S5) — directors and
-- up create, rename, deactivate and move equipos of their branch
-- (20261121100000_dream_team_equipos_gestion.sql).
--
-- Covers:
--   a. «+ Subequipo»: the director of Rama creates under Video (inherits its
--      experiencia) and under Rama itself, but not under Otra nor above Rama
--      (42501, rows unchanged); a coordinator and a director.coordinate holder
--      cannot; an admin and an org.manage holder can anywhere; invalid input
--      (22023): empty or too long name, repeated name, unknown parent; no
--      session (42501).
--   b. «Renombrar» inside the tree (their own node too) but not outside;
--      repeated name refused.
--   c. «Mover a…» within authority (the Video case): Mesa and Cámaras go up
--      one level, keep their servicios, roles and grants and the experiencia;
--      the new path is returned; then Video is deactivated with «Desactivar».
--   d. Across branches the caller needs both: the director of Rama (no
--      destination) and of Otra (no origin) are refused, the director of the
--      root over both moves it.
--   e. Refused moves (nothing changes): root, same parent, cycle (itself and a
--      descendant), unknown equipo, inactive or unknown destination, repeated
--      name at the destination, coordinator and director.coordinate.
--   f. Experiencia: moving Mesa under a talleres_crecimiento root carries it
--      down the subtree but a node of a third experiencia keeps its own; a
--      subtree with a Niños salón cannot change experiencia.
--   g. DPS (needs the DPS root of the database): moving «ZZ Deg Bautizos»
--      out of DPS is refused while a puesto of it has a manual convocado in a
--      plan from today on (a past plan does not block); once removed, the move
--      goes through, the subtree leaves dps_equipos(), its puesto stays on its
--      equipo and its automatic director puesto is deactivated; the DPS root
--      itself is an anchor and cannot move, nor be deactivated (an admin and
--      an org.manage holder get 'equipo_ancla', the row is unchanged);
--      «Activar» on it is allowed (T6).
--   h. Privileges and definer settings of the new functions.
--   i. «Desactivar» outside the tree refused; activo NULL refused.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id; state checks run as the
-- connection role.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Deg"):
--   1 DIR_RAMA  dream_team.direct on Rama
--   2 DIR_OTRA  dream_team.direct on Otra
--   3 DIR_B     dream_team.direct on Raíz B
--   4 COORD     dream_team.coordinate on Raíz A
--   5 DTC       dream_team.director.coordinate, global
--   6 ADMIN     system admin
--   7 ORG       dream_team.org.manage, global
--   8 DIR_A     dream_team.direct on Raíz A
--   Volunteers (no account): 10 V1 in Mesa, 11 V2 in Cámaras, 12 V3 in
--   Bautizos (case g).
-- Tree: 1 Raíz A (dps) › 2 Rama › 3 Video › (4 Mesa › 10 Interno
-- [estudiantes]) and 5 Cámaras; 1 › 6 Otra › 9 Salón (a Niños salón) and
-- 12 Cámaras; 7 Raíz B (talleres_crecimiento) › 8 Sub B. Case g adds 20
-- Bautizos › 21 Sub Bautizos under the real DPS root.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_deg_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_deg_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_deg_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_deg_ctx (k, v) VALUES (p_key, coalesce(v, 'NULL'));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_key, 'unexpected error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT v FROM t_deg_ctx WHERE k = p_key;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('de6a0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c001' WHEN 'us' THEN 'c002' WHEN 'eq' THEN 'c003'
                       WHEN 'ro' THEN 'c004' WHEN 'se' THEN 'c005' WHEN 'pu' THEN 'c006' WHEN 'pl' THEN 'c007' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The RPCs with fixture ids. plpgsql so the suite still loads (and fails case
-- by case) without the migration.
CREATE OR REPLACE FUNCTION pg_temp.crear(p_padre int, p_label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT (j ->> 'label') || '|' || (j ->> 'experiencia') || '|' || pg_temp.lbl((j ->> 'parent_equipo_id')::uuid)
                 || '|' || (j ->> 'activo')
            FROM (SELECT public.dream_team_equipo_crear(pg_temp.id('eq', p_padre), p_label) AS j) q);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.renombrar(p_eq int, p_label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_equipo_renombrar(pg_temp.id('eq', p_eq), p_label) ->> 'label';
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.activo_id(p_eq uuid, p_activo boolean) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_equipo_cambiar_activo(p_eq, p_activo) ->> 'activo';
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.activo(p_eq int, p_activo boolean) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.activo_id(pg_temp.id('eq', p_eq), p_activo);
END;
$$;
-- 'ruta|experiencia_anterior>experiencia|equipos_movidos'.
CREATE OR REPLACE FUNCTION pg_temp.mover_id(p_eq uuid, p_padre uuid) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT (j ->> 'ruta') || '|' || (j ->> 'experiencia_anterior') || '>' || (j ->> 'experiencia') || '|'
                 || (j ->> 'equipos_movidos')
            FROM (SELECT public.dream_team_equipo_mover(p_eq, p_padre) AS j) q);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.mover(p_eq int, p_padre int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.mover_id(pg_temp.id('eq', p_eq), pg_temp.id('eq', p_padre));
END;
$$;

CREATE TEMP TABLE t_deg_labels (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.lbl(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT label FROM t_deg_labels WHERE id = p_id), p_id::text);
$$;

-- An equipo: 'PADRE:experiencia:activo(t/f)'.
CREATE OR REPLACE FUNCTION pg_temp.eq(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(pg_temp.lbl(e.parent_equipo_id), '-') || ':' || e.experiencia || ':'
         || CASE WHEN e.activo THEN 't' ELSE 'f' END
    FROM public.dream_team_equipos e WHERE e.id = pg_temp.id('eq', p_n);
$$;

-- The children of an equipo by label, sorted.
CREATE OR REPLACE FUNCTION pg_temp.hijos(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e.label, ', ' ORDER BY e.label COLLATE "C"), '')
    FROM public.dream_team_equipos e WHERE e.parent_equipo_id = pg_temp.id('eq', p_n);
$$;

-- Fingerprint of every fixture row a call can touch.
CREATE OR REPLACE FUNCTION pg_temp.huella() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT md5(
    coalesce((SELECT string_agg(e.id::text || coalesce(e.parent_equipo_id::text, '') || e.label || e.experiencia
                                || e.activo::text || e.updated_at::text, ',' ORDER BY e.id)
                FROM public.dream_team_equipos e WHERE e.label LIKE 'ZZ Deg%'), '') || '/' ||
    coalesce((SELECT string_agg(s.id::text || s.equipo_id::text || s.rol_id::text || s.estado::text || s.version::text
                                || s.updated_at::text, ',' ORDER BY s.id)
                FROM public.dream_team_servicios s WHERE s.persona_id::text LIKE 'de6a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(g.id::text || coalesce(g.revoked_at::text, ''), ',' ORDER BY g.id)
                FROM public.dream_team_capability_grants g WHERE g.persona_id::text LIKE 'de6a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(pu.id::text || pu.equipo_id::text || pu.activo::text, ',' ORDER BY pu.id)
                FROM public.dps_puestos pu
                JOIN public.dream_team_equipos e ON e.id = coalesce(pu.direccion_equipo_id, pu.equipo_id)
               WHERE e.label LIKE 'ZZ Deg%'), '')));
END;
$$;

-- What a move must keep: servicios, roles and grants of the fixture people.
CREATE OR REPLACE FUNCTION pg_temp.gente() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT md5(
    coalesce((SELECT string_agg(s.id::text || s.equipo_id::text || s.rol_id::text || s.estado::text || s.version::text
                                || coalesce(s.fecha_fin::text, '') || s.updated_at::text, ',' ORDER BY s.id)
                FROM public.dream_team_servicios s WHERE s.persona_id::text LIKE 'de6a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(r.id::text || r.equipo_id::text || r.label || r.activo::text, ',' ORDER BY r.id)
                FROM public.dream_team_roles r WHERE r.id::text LIKE 'de6a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(g.id::text || g.capability_key || coalesce(g.scope_id, '') || coalesce(g.revoked_at::text, ''),
                                ',' ORDER BY g.id)
                FROM public.dream_team_capability_grants g WHERE g.persona_id::text LIKE 'de6a0000-%'), '')));
END;
$$;

-- ── fixture ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'deg-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Deg', 'U' || n, 'deg-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Deg', 'V' || n, 'No especificado', 'Femenino'
  FROM generate_series(10, 12) AS n;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 6), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1),  'dps',                  NULL,                 'ZZ Deg Raíz A',  true),
  (pg_temp.id('eq', 2),  'dps',                  pg_temp.id('eq', 1),  'ZZ Deg Rama',    true),
  (pg_temp.id('eq', 3),  'dps',                  pg_temp.id('eq', 2),  'ZZ Deg Video',   true),
  (pg_temp.id('eq', 4),  'dps',                  pg_temp.id('eq', 3),  'ZZ Deg Mesa',    true),
  (pg_temp.id('eq', 5),  'dps',                  pg_temp.id('eq', 3),  'ZZ Deg Cámaras', true),
  (pg_temp.id('eq', 6),  'dps',                  pg_temp.id('eq', 1),  'ZZ Deg Otra',    true),
  (pg_temp.id('eq', 7),  'talleres_crecimiento', NULL,                 'ZZ Deg Raíz B',  true),
  (pg_temp.id('eq', 8),  'talleres_crecimiento', pg_temp.id('eq', 7),  'ZZ Deg Sub B',   true),
  (pg_temp.id('eq', 9),  'dps',                  pg_temp.id('eq', 6),  'ZZ Deg Salón',   true),
  (pg_temp.id('eq', 10), 'estudiantes',          pg_temp.id('eq', 4),  'ZZ Deg Interno', true),
  (pg_temp.id('eq', 12), 'dps',                  pg_temp.id('eq', 6),  'ZZ Deg Cámaras', true),
  (pg_temp.id('eq', 13), 'dps',                  pg_temp.id('eq', 1),  'ZZ Deg Inactiva', false);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 4), pg_temp.id('eq', 4), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 5), 'Voluntario', 'voluntario', true);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct',              'dream_team', 'equipo',     pg_temp.id('eq', 2)::text, 'zz-test'),
  (pg_temp.id('us', 2), 'dream_team.direct',              'dream_team', 'equipo',     pg_temp.id('eq', 6)::text, 'zz-test'),
  (pg_temp.id('us', 3), 'dream_team.direct',              'dream_team', 'equipo',     pg_temp.id('eq', 7)::text, 'zz-test'),
  (pg_temp.id('us', 4), 'dream_team.coordinate',          'dream_team', 'equipo',     pg_temp.id('eq', 1)::text, 'zz-test'),
  (pg_temp.id('us', 5), 'dream_team.director.coordinate', 'dream_team', 'experience', NULL,                      'zz-test'),
  (pg_temp.id('us', 7), 'dream_team.org.manage',          'dream_team', 'experience', NULL,                      'zz-test'),
  (pg_temp.id('us', 8), 'dream_team.direct',              'dream_team', 'equipo',     pg_temp.id('eq', 1)::text, 'zz-test');

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', v.se), pg_temp.id('us', v.us), pg_temp.id('eq', v.eq), pg_temp.id('ro', v.ro),
       'activo'::public.dream_team_estado, now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (10, 10, 4, 4), (11, 11, 5, 5)) AS v(se, us, eq, ro);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT DISTINCT s.persona_id, k.capability_key, k.experience, k.scope_type, k.scope_id, 'dream-team-servicio'
  FROM public.dream_team_servicios s
  JOIN public.dream_team_equipos e ON e.id = s.equipo_id
  JOIN public.dream_team_roles r ON r.id = s.rol_id
 CROSS JOIN LATERAL public.dream_team_grants_de_servicio(s.equipo_id, e.experiencia, s.rol_id, r.label) k
 WHERE s.estado = 'activo' AND s.persona_id::text LIKE 'de6a0000-%';

-- A Niños salón on Salón: its subtree cannot change experiencia.
INSERT INTO public.ninos_salones (campus_id, equipo_id, area, nombre)
SELECT c.id, pg_temp.id('eq', 9), 'waumba', 'ZZ Deg Salón'
  FROM public.campus c ORDER BY c.id LIMIT 1;

INSERT INTO t_deg_labels (id, label)
SELECT pg_temp.id('eq', n), l FROM (VALUES (1, 'A'), (2, 'RAMA'), (3, 'VIDEO'), (4, 'MESA'), (5, 'CAM'), (6, 'OTRA'),
                                           (7, 'B'), (8, 'SUBB'), (9, 'SALON'), (10, 'INTERNO'), (12, 'CAM2'),
                                           (13, 'INA'), (20, 'BAUT'), (21, 'SUBBAUT')) AS x(n, l);

GRANT INSERT, SELECT ON t_deg_failures, t_deg_ctx TO authenticated;
GRANT SELECT ON t_deg_labels TO authenticated;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_f);
  END LOOP;
END;
$$;

SELECT pg_temp.assert_eq('fixture: a Niños salón hangs from Salón',
  $q$SELECT count(*)::text FROM public.ninos_salones s WHERE s.equipo_id = pg_temp.id('eq', 9)$q$, '1');
INSERT INTO t_deg_ctx (k, v) VALUES ('gente.inicio', pg_temp.gente());

-- ── a. «+ Subequipo» ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a1: the Rama director creates under Video, inheriting its experiencia',
  $q$SELECT pg_temp.crear(3, '  ZZ Deg Nuevo  ')$q$, 'ZZ Deg Nuevo|dps|VIDEO|true');
SELECT pg_temp.assert_eq('a1: and under Rama, the equipo they direct',
  $q$SELECT pg_temp.crear(2, 'ZZ Deg Nuevo en Rama')$q$, 'ZZ Deg Nuevo en Rama|dps|RAMA|true');
RESET ROLE;
SELECT pg_temp.assert_eq('a1: the new equipos are stored under their parents',
  $q$SELECT pg_temp.hijos(3) || ' / ' || pg_temp.hijos(2)$q$,
  'ZZ Deg Cámaras, ZZ Deg Mesa, ZZ Deg Nuevo / ZZ Deg Nuevo en Rama, ZZ Deg Video');

INSERT INTO t_deg_ctx (k, v) VALUES ('a2.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a2: the Rama director cannot create under Otra',
  $q$SELECT pg_temp.crear(6, 'ZZ Deg Intruso')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a2: nor under Raíz A, above their equipo',
  $q$SELECT pg_temp.crear(1, 'ZZ Deg Intruso')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('a2: a coordinator cannot create',
  $q$SELECT pg_temp.crear(2, 'ZZ Deg Intruso')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('a2: a director.coordinate holder cannot create',
  $q$SELECT pg_temp.crear(2, 'ZZ Deg Intruso')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a3: an empty name is refused',
  $q$SELECT pg_temp.crear(3, '   ')$q$, '22023', 'nombre_invalido');
SELECT pg_temp.assert_raises('a3: a name over 120 characters is refused',
  $q$SELECT pg_temp.crear(3, repeat('x', 121))$q$, '22023', 'nombre_invalido');
SELECT pg_temp.assert_raises('a3: a name the parent already has is refused',
  $q$SELECT pg_temp.crear(3, 'ZZ Deg Mesa')$q$, '22023', 'nombre_repetido');
SELECT pg_temp.assert_raises('a3: an unknown parent is refused',
  $q$SELECT pg_temp.crear(99, 'ZZ Deg Intruso')$q$, '22023', 'padre_invalido');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_raises('a3: without a session nobody creates',
  $q$SELECT pg_temp.crear(3, 'ZZ Deg Intruso')$q$, '42501', 'sin_sesion');
RESET ROLE;
SELECT pg_temp.assert_eq('a2-a3: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('a2.antes'));
SELECT pg_temp.assert_eq('a2-a3: no Intruso exists',
  $q$SELECT count(*)::text FROM public.dream_team_equipos e WHERE e.label = 'ZZ Deg Intruso'$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('a4: an admin creates under any equipo',
  $q$SELECT pg_temp.crear(8, 'ZZ Deg Del admin')$q$, 'ZZ Deg Del admin|talleres_crecimiento|SUBB|true');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('a4: an org.manage holder creates under any equipo',
  $q$SELECT pg_temp.crear(6, 'ZZ Deg De org')$q$, 'ZZ Deg De org|dps|OTRA|true');
RESET ROLE;

-- ── b. «Renombrar» ───────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b1: the Rama director renames an equipo of their branch',
  $q$SELECT pg_temp.renombrar(5, ' ZZ Deg Cámaras bis ')$q$, 'ZZ Deg Cámaras bis');
SELECT pg_temp.assert_eq('b1: and back',
  $q$SELECT pg_temp.renombrar(5, 'ZZ Deg Cámaras')$q$, 'ZZ Deg Cámaras');
RESET ROLE;
INSERT INTO t_deg_ctx (k, v) VALUES ('b2.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b2: not outside it',
  $q$SELECT pg_temp.renombrar(6, 'ZZ Deg Otra bis')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b2: nor to a name a sibling has',
  $q$SELECT pg_temp.renombrar(5, 'ZZ Deg Mesa')$q$, '22023', 'nombre_repetido');
SELECT pg_temp.assert_raises('b2: an unknown equipo is refused',
  $q$SELECT pg_temp.renombrar(99, 'ZZ Deg X')$q$, '22023', 'equipo_invalido');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('b2: a director.coordinate holder cannot rename',
  $q$SELECT pg_temp.renombrar(5, 'ZZ Deg X')$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('b2: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('b2.antes'));

-- ── c. move within authority: Mesa and Cámaras out of Video ──────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c1: the Rama director moves Mesa up to Rama; the new path comes back',
  $q$SELECT pg_temp.mover(4, 2)$q$, 'ZZ Deg Raíz A › ZZ Deg Rama › ZZ Deg Mesa|dps>dps|2');
SELECT pg_temp.assert_eq('c1: and Cámaras',
  $q$SELECT pg_temp.mover(5, 2)$q$, 'ZZ Deg Raíz A › ZZ Deg Rama › ZZ Deg Cámaras|dps>dps|1');
RESET ROLE;
SELECT pg_temp.assert_eq('c1: Mesa and Cámaras are siblings of Video, Video is empty',
  $q$SELECT pg_temp.hijos(2) || ' / ' || pg_temp.hijos(3)$q$,
  'ZZ Deg Cámaras, ZZ Deg Mesa, ZZ Deg Nuevo en Rama, ZZ Deg Video / ZZ Deg Nuevo');
SELECT pg_temp.assert_eq('c1: experiencia and the inner node stay as they were',
  $q$SELECT pg_temp.eq(4) || ' ' || pg_temp.eq(5) || ' ' || pg_temp.eq(10)$q$, 'RAMA:dps:t RAMA:dps:t MESA:estudiantes:t');
SELECT pg_temp.assert_eq('c1: servicios, roles and grants are untouched',
  $q$SELECT pg_temp.gente()$q$, pg_temp.ctx('gente.inicio'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c2: then Video is deactivated with «Desactivar»',
  $q$SELECT pg_temp.activo(3, false)$q$, 'false');
RESET ROLE;
SELECT pg_temp.assert_eq('c2: Video is inactive', $q$SELECT pg_temp.eq(3)$q$, 'RAMA:dps:f');

-- ── d. across branches: both authorities ─────────────────────────────

INSERT INTO t_deg_ctx (k, v) VALUES ('d.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d1: the Rama director cannot move Mesa to Otra (no destination)',
  $q$SELECT pg_temp.mover(4, 6)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d1: the Otra director cannot take Mesa (no origin)',
  $q$SELECT pg_temp.mover(4, 6)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d1: the Raíz B director cannot take it across experiencias either',
  $q$SELECT pg_temp.mover(4, 7)$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('d1: the refused moves changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('d.antes'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('d2: the Raíz A director, over both, moves Mesa to Otra',
  $q$SELECT pg_temp.mover(4, 6)$q$, 'ZZ Deg Raíz A › ZZ Deg Otra › ZZ Deg Mesa|dps>dps|2');
RESET ROLE;
SELECT pg_temp.assert_eq('d2: Mesa hangs from Otra', $q$SELECT pg_temp.eq(4)$q$, 'OTRA:dps:t');
SELECT pg_temp.assert_eq('d2: servicios, roles and grants are untouched',
  $q$SELECT pg_temp.gente()$q$, pg_temp.ctx('gente.inicio'));

-- ── e. refused moves ─────────────────────────────────────────────────

INSERT INTO t_deg_ctx (k, v) VALUES ('e.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('e1: a root cannot move',
  $q$SELECT pg_temp.mover(1, 7)$q$, '22023', 'equipo_raiz');
SELECT pg_temp.assert_raises('e1: nor to its current parent',
  $q$SELECT pg_temp.mover(4, 6)$q$, '22023', 'mismo_padre');
SELECT pg_temp.assert_raises('e1: nor under itself',
  $q$SELECT pg_temp.mover(2, 2)$q$, '22023', 'ciclo');
SELECT pg_temp.assert_raises('e1: nor under a descendant',
  $q$SELECT pg_temp.mover(6, 4)$q$, '22023', 'ciclo');
SELECT pg_temp.assert_raises('e1: an unknown equipo is refused',
  $q$SELECT pg_temp.mover(99, 2)$q$, '22023', 'equipo_invalido');
SELECT pg_temp.assert_raises('e1: an inactive destination is refused',
  $q$SELECT pg_temp.mover(4, 13)$q$, '22023', 'destino_invalido');
SELECT pg_temp.assert_raises('e1: an unknown destination is refused',
  $q$SELECT pg_temp.mover(4, 99)$q$, '22023', 'destino_invalido');
SELECT pg_temp.assert_raises('e1: a name the destination already has is refused',
  $q$SELECT pg_temp.mover(5, 6)$q$, '22023', 'nombre_repetido');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('e2: a coordinator cannot move',
  $q$SELECT pg_temp.mover(4, 2)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('e2: a director.coordinate holder cannot move',
  $q$SELECT pg_temp.mover(4, 2)$q$, '42501', 'sin_autoridad');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_raises('e2: without a session nobody moves',
  $q$SELECT pg_temp.mover(4, 2)$q$, '42501', 'sin_sesion');
RESET ROLE;
SELECT pg_temp.assert_eq('e: the refused moves changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('e.antes'));

-- ── f. experiencia ───────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('f1: org.manage moves Mesa under Raíz B (talleres_crecimiento)',
  $q$SELECT pg_temp.mover(4, 7)$q$, 'ZZ Deg Raíz B › ZZ Deg Mesa|dps>talleres_crecimiento|2');
RESET ROLE;
SELECT pg_temp.assert_eq('f1: Mesa takes the new experiencia, the estudiantes node inside keeps its own',
  $q$SELECT pg_temp.eq(4) || ' ' || pg_temp.eq(10)$q$, 'B:talleres_crecimiento:t MESA:estudiantes:t');
SELECT pg_temp.assert_eq('f1: servicios, roles and grants are untouched',
  $q$SELECT pg_temp.gente()$q$, pg_temp.ctx('gente.inicio'));

INSERT INTO t_deg_ctx (k, v) VALUES ('f2.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('f2: Otra (with a Niños salón below) cannot change experiencia',
  $q$SELECT pg_temp.mover(6, 8)$q$, '22023', 'experiencia_con_datos');
RESET ROLE;
SELECT pg_temp.assert_eq('f2: nothing changed', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('f2.antes'));

-- ── i. «Desactivar» outside the tree ─────────────────────────────────

INSERT INTO t_deg_ctx (k, v) VALUES ('i.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('i1: the Rama director cannot deactivate Otra',
  $q$SELECT pg_temp.activo(6, false)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('i1: activo NULL is refused',
  $q$SELECT pg_temp.activo(2, NULL)$q$, '22023', 'activo_invalido');
RESET ROLE;
SELECT pg_temp.assert_eq('i1: nothing changed', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('i.antes'));

-- ── g. DPS ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF public.dps_raiz() IS NULL THEN
    PERFORM pg_temp.fail('g0', 'this database has no DPS root (DPS under Dirección de Experiencia); the DPS cases need one');
    RETURN;
  END IF;
  INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
    (pg_temp.id('eq', 20), 'dps', public.dps_raiz(),    'ZZ Deg Bautizos',     true),
    (pg_temp.id('eq', 21), 'dps', pg_temp.id('eq', 20), 'ZZ Deg Sub Bautizos', true);
  INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
  VALUES (pg_temp.id('ro', 20), pg_temp.id('eq', 20), 'Voluntario', 'voluntario', true);
  INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
  VALUES (pg_temp.id('se', 12), pg_temp.id('us', 12), pg_temp.id('eq', 20), pg_temp.id('ro', 20),
          'activo', now() - interval '30 days', 'admin_asignacion');
  INSERT INTO public.dps_puestos (id, equipo_id, nombre, cantidad, orden)
  VALUES (pg_temp.id('pu', 1), pg_temp.id('eq', 20), 'ZZ Deg Bautizador', 1, 0);
  -- The automatic «Director de ZZ Deg Bautizos» puesto on the DPS root.
  PERFORM public.dps_directores_puestos_sincronizar();
  INSERT INTO public.dps_planes (id, fecha, tipo, titulo, horarios, llegada) VALUES
    (pg_temp.id('pl', 1), public.ninos_hoy() + 40, 'libre', 'ZZ Deg futuro', '["09:00"]'::jsonb, '08:00'),
    (pg_temp.id('pl', 2), public.ninos_hoy() - 40, 'libre', 'ZZ Deg pasado', '["09:00"]'::jsonb, '08:00');
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id)
  SELECT pg_temp.id('pl', n), pg_temp.id('pu', 1), pg_temp.id('se', 12), pg_temp.id('us', 12)
    FROM unnest(ARRAY[1, 2]) AS n;
END;
$$;

SELECT pg_temp.assert_eq('g0: Bautizos and its child are DPS equipos with a director puesto',
  $q$SELECT (SELECT count(*) FROM public.dps_equipos() d WHERE d.equipo_id IN (pg_temp.id('eq', 20), pg_temp.id('eq', 21)))::text
            || '|' || (SELECT count(*) FROM public.dps_puestos pu WHERE pu.direccion_equipo_id = pg_temp.id('eq', 20) AND pu.activo)::text$q$,
  '2|1');

INSERT INTO t_deg_ctx (k, v) VALUES ('g1.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('g1: Bautizos cannot leave DPS while someone is convocado in a coming plan',
  $q$SELECT pg_temp.mover(20, 7)$q$, '22023', 'dps_convocados_pendientes');
RESET ROLE;
SELECT pg_temp.assert_eq('g1: nothing changed (tree, servicios, puestos)', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('g1.antes'));

DELETE FROM public.dps_convocados c WHERE c.plan_id = pg_temp.id('pl', 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('g2: without coming convocados (the past plan does not block) Bautizos moves to Raíz B',
  $q$SELECT pg_temp.mover(20, 7)$q$, 'ZZ Deg Raíz B › ZZ Deg Bautizos|dps>talleres_crecimiento|2');
RESET ROLE;
SELECT pg_temp.assert_eq('g2: the subtree takes the new experiencia',
  $q$SELECT pg_temp.eq(20) || ' ' || pg_temp.eq(21)$q$, 'B:talleres_crecimiento:t BAUT:talleres_crecimiento:t');
SELECT pg_temp.assert_eq('g2: it left dps_equipos()',
  $q$SELECT count(*)::text FROM public.dps_equipos() d WHERE d.equipo_id IN (pg_temp.id('eq', 20), pg_temp.id('eq', 21))$q$, '0');
SELECT pg_temp.assert_eq('g2: its puesto stays on Bautizos with the past convocado; the director puesto is deactivated',
  $q$SELECT (SELECT pg_temp.lbl(pu.equipo_id) || ':' || CASE WHEN pu.activo THEN 't' ELSE 'f' END
               FROM public.dps_puestos pu WHERE pu.id = pg_temp.id('pu', 1))
            || '|' || (SELECT count(*) FROM public.dps_convocados c WHERE c.puesto_id = pg_temp.id('pu', 1))::text
            || '|' || (SELECT count(*) FROM public.dps_puestos pu WHERE pu.direccion_equipo_id = pg_temp.id('eq', 20) AND pu.activo)::text$q$,
  'BAUT:t|1|0');
SELECT pg_temp.assert_eq('g2: the Bautizos servicio is untouched',
  $q$SELECT pg_temp.lbl(s.equipo_id) || ':' || s.estado || ':' || s.version FROM public.dream_team_servicios s WHERE s.id = pg_temp.id('se', 12)$q$,
  'BAUT:activo:1');

-- dps_raiz() is closed to authenticated: read it here, use it below.
INSERT INTO t_deg_ctx (k, v) VALUES ('g3.antes', pg_temp.huella()), ('dps.raiz', public.dps_raiz()::text);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('g3: the DPS root is an anchor and cannot move',
  $q$SELECT pg_temp.mover_id(pg_temp.ctx('dps.raiz')::uuid, pg_temp.id('eq', 7))$q$, '22023', 'equipo_ancla');
RESET ROLE;
SELECT pg_temp.assert_eq('g3: nothing changed', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('g3.antes'));

-- The DPS root row (activo + updated_at) before «Desactivar».
CREATE OR REPLACE FUNCTION pg_temp.fila_dps() RETURNS text LANGUAGE sql AS $$
  SELECT e.activo::text || '|' || e.updated_at::text FROM public.dream_team_equipos e WHERE e.id = pg_temp.ctx('dps.raiz')::uuid;
$$;
INSERT INTO t_deg_ctx (k, v) VALUES ('g4.antes', pg_temp.fila_dps());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('g4: an admin cannot deactivate the DPS root (anchor)',
  $q$SELECT pg_temp.activo_id(pg_temp.ctx('dps.raiz')::uuid, false)$q$, '22023', 'equipo_ancla');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('g4: nor an org.manage holder',
  $q$SELECT pg_temp.activo_id(pg_temp.ctx('dps.raiz')::uuid, false)$q$, '22023', 'equipo_ancla');
SELECT pg_temp.assert_eq('g4: «Activar» on an anchor is allowed',
  $q$SELECT pg_temp.activo_id(pg_temp.ctx('dps.raiz')::uuid, true)$q$, 'true');
RESET ROLE;
SELECT pg_temp.assert_eq('g4: the DPS root row is unchanged', $q$SELECT pg_temp.fila_dps()$q$, pg_temp.ctx('g4.antes'));
SELECT pg_temp.assert_eq('g4: the anchor helper sees the DPS root and not a fixture equipo',
  $q$SELECT public.dream_team_equipo_es_ancla_dps(pg_temp.ctx('dps.raiz')::uuid)::text || '|'
            || public.dream_team_equipo_es_ancla_dps(pg_temp.id('eq', 2))::text$q$, 'true|false');

-- ── h. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('h1: authenticated executes the RPCs and the gate, anon and public do not; SECURITY DEFINER, empty search_path',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('public', p.oid, 'EXECUTE')
                        || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ', ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_gestiona_equipo', 'dream_team_equipo_crear', 'dream_team_equipo_renombrar',
                          'dream_team_equipo_cambiar_activo', 'dream_team_equipo_mover', 'dream_team_equipo_json',
                          'dream_team_equipo_es_ancla_dps')$q$,
  'dream_team_equipo_cambiar_activo(uuid,boolean)=true|false|false|true, '
  || 'dream_team_equipo_crear(uuid,text)=true|false|false|true, '
  || 'dream_team_equipo_es_ancla_dps(uuid)=false|false|false|true, '
  || 'dream_team_equipo_json(uuid)=false|false|false|true, '
  || 'dream_team_equipo_mover(uuid,uuid)=true|false|false|true, '
  || 'dream_team_equipo_renombrar(uuid,text)=true|false|false|true, '
  || 'dream_team_gestiona_equipo(uuid)=true|false|false|true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_deg_failures);
END;
$$;
