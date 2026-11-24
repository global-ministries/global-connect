-- T8b (odd/tasks/dream-team-estructura-correcciones.md, S7, L16) — until
-- 2027-01-01 00:00 America/Caracas, moving a volunteer to another área leaves
-- no trace of the origin servicio
-- (20261124100000_dream_team_servicios_sin_historial_2026.sql).
--
-- Covers:
--   a. The director of the root moves V10 Cámaras → Estacionamiento directly
--      (dream_team_cambiar_area): the destination servicio is returned and
--      activo; the origin row, its history and its verificaciones are gone;
--      the Cámaras grants are revoked and the Estacionamiento ones minted.
--   b. The Técnica director requests V11 Cámaras → Estacionamiento and the
--      root director approves it (dream_team_resolver_solicitud_cambio_area):
--      same result, and the request is gone with the origin.
--      a and b compare against now(): from 2027-01-01 (Caracas) they expect
--      the origin retired with its history, as before the migration.
--   c. The helper does nothing for a servicio that is not retirado, an
--      unknown id or NULL.
--   d. The date gate (dream_team_servicio_borrar_si_sin_historial_en): a
--      retired servicio stays at 2027-01-01 00:00 Caracas and later, and is
--      deleted with its history at 2026-12-31 23:59:59 Caracas and at
--      2027-01-01 00:00 UTC (still 2026 in Caracas).
--   e. What keeps it retired before the date: volunteer attendance, a DPS
--      convocatoria of a past plan or of a plan that same Caracas day; a
--      convocatoria only in a future plan does not, and goes with it.
--   f. Privileges: both helpers are internal (service_role only, definer,
--      empty search_path; authenticated gets 42501); the two RPCs are still
--      granted to authenticated and not to anon.
--
-- Run against STAGING; the runner wraps it in a transaction that is
-- discarded. The last statement raises 'SUITE_RESULT: ALL OK' (or the failing
-- cases), which also rolls everything back. RPC calls run under SET LOCAL ROLE
-- authenticated with request.jwt.claim.sub set to the fixture auth id; state
-- checks run as the connection role.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Dsh"):
--   1 DIR  dream_team.direct on ZZ Dsh Raíz
--   2 TEC  dream_team.direct on Técnica
--   Volunteers (no account), servicio n of volunteer n, all in Cámaras:
--   10..18.
-- Tree: 1 ZZ Dsh Raíz › 2 Técnica › 3 Cámaras, and 1 › 5 Operaciones ›
-- 6 Estacionamiento. Cámaras and Estacionamiento have a Voluntario rol;
-- Cámaras a requisito «induccion».

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dsh_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dsh_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE t_dsh_labels (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dsh_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
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
  INSERT INTO t_dsh_ctx (k, v) VALUES (p_key, coalesce(v, 'NULL'));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_key, 'unexpected error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT v FROM t_dsh_ctx WHERE k = p_key;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d5a10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c001' WHEN 'us' THEN 'c002' WHEN 'eq' THEN 'c003'
                       WHEN 'ro' THEN 'c004' WHEN 'se' THEN 'c005' WHEN 'rq' THEN 'c006'
                       WHEN 'ca' THEN 'c007' WHEN 'tu' THEN 'c008' WHEN 'pu' THEN 'c009'
                       WHEN 'pl' THEN 'c00a' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Whether the history is still deleted at this moment (before 2027-01-01 Caracas).
CREATE OR REPLACE FUNCTION pg_temp.sin_rastro() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT now() < (timestamp '2027-01-01 00:00:00' AT TIME ZONE 'America/Caracas');
$$;

-- The RPCs and the helper with fixture ids. plpgsql so the suite still loads
-- (and fails case by case) without the migration.
CREATE OR REPLACE FUNCTION pg_temp.mover(p_se int, p_eq int, p_ro int, p_motivo text, p_nota text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_cambiar_area(pg_temp.id('se', p_se), pg_temp.id('eq', p_eq), pg_temp.id('ro', p_ro), p_motivo, p_nota);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.solicitar(p_se int, p_eq int, p_ro int, p_motivo text, p_nota text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_solicitar_cambio_area(pg_temp.id('se', p_se), pg_temp.id('eq', p_eq), pg_temp.id('ro', p_ro), p_motivo, p_nota);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.resolver(p_key text, p_aprobar boolean, p_respuesta text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_resolver_solicitud_cambio_area(pg_temp.ctx(p_key)::uuid, p_aprobar, p_respuesta);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.borrar_en(p_se int, p_ahora timestamptz)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_servicio_borrar_si_sin_historial_en(pg_temp.id('se', p_se), p_ahora)::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.lbl(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT label FROM t_dsh_labels WHERE id = p_id), p_id::text);
$$;

-- A person's servicios: 'EQ:rol:estado:motivo_actual:version:fin', sorted.
CREATE OR REPLACE FUNCTION pg_temp.servicios(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT pg_temp.lbl(s.equipo_id) || ':' || pg_temp.lbl(s.rol_id) || ':' || s.estado || ':' || s.motivo_actual
                 || ':' || s.version || ':' || CASE WHEN s.fecha_fin IS NULL THEN '-' ELSE 'fin' END AS t
            FROM public.dream_team_servicios s WHERE s.persona_id = pg_temp.id('us', p_us)) q;
$$;

-- The history rows of one servicio id (it may no longer exist): 'anterior>nuevo:motivo', sorted.
CREATE OR REPLACE FUNCTION pg_temp.historial_de(p_se int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(h.estado_anterior || '>' || h.estado_nuevo || ':' || h.motivo, ' | '
                             ORDER BY h.estado_anterior::text COLLATE "C", h.estado_nuevo::text COLLATE "C"), '')
    FROM public.dream_team_estados_historial h WHERE h.servicio_id = pg_temp.id('se', p_se);
$$;

-- A person's history: 'EQ:anterior>nuevo:motivo:actor', sorted.
CREATE OR REPLACE FUNCTION pg_temp.historial(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ' | ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT pg_temp.lbl(s.equipo_id) || ':' || h.estado_anterior || '>' || h.estado_nuevo || ':' || h.motivo
                 || ':' || pg_temp.lbl(h.actor_persona_id) AS t
            FROM public.dream_team_estados_historial h
            JOIN public.dream_team_servicios s ON s.id = h.servicio_id
           WHERE s.persona_id = pg_temp.id('us', p_us)) q;
$$;

-- Verificaciones of one servicio id: how many.
CREATE OR REPLACE FUNCTION pg_temp.verificaciones_de(p_se int) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.dream_team_requisitos_verificacion v WHERE v.servicio_id = pg_temp.id('se', p_se);
$$;

-- A person's grants: 'key@SCOPE' (active) or 'key@SCOPE~' (revoked), sorted.
CREATE OR REPLACE FUNCTION pg_temp.grants(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT g.capability_key || '@' || coalesce(pg_temp.lbl(g.scope_id::uuid), '-')
                 || CASE WHEN g.revoked_at IS NULL THEN '' ELSE '~' END AS t
            FROM public.dream_team_capability_grants g
           WHERE g.persona_id = pg_temp.id('us', p_us) AND g.source = 'dream-team-servicio') q;
$$;

-- Retires servicio n as the PATCH does (row and history row), as the connection role.
CREATE OR REPLACE FUNCTION pg_temp.retirar(p_se int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.dream_team_servicios
     SET estado = 'retirado', fecha_fin = now(), motivo_actual = 'admin_retiro', version = version + 1, updated_at = now()
   WHERE id = pg_temp.id('se', p_se);
  INSERT INTO public.dream_team_estados_historial (servicio_id, estado_anterior, estado_nuevo, motivo, actor_persona_id)
  VALUES (pg_temp.id('se', p_se), 'activo', 'retirado', 'admin_retiro', pg_temp.id('us', 1));
END;
$$;

-- ── fixture ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.id('au', 1), 'authenticated', 'authenticated', 'zz-dsh-1@example.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.id('au', 2), 'authenticated', 'authenticated', 'zz-dsh-2@example.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Dsh', 'Director', 'zz-dsh-1@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Dsh', 'Tecnica', 'zz-dsh-2@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 10), 'ZZ Dsh', 'V10', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 11), 'ZZ Dsh', 'V11', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 12), 'ZZ Dsh', 'V12', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 13), 'ZZ Dsh', 'V13', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 14), 'ZZ Dsh', 'V14', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 15), 'ZZ Dsh', 'V15', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 16), 'ZZ Dsh', 'V16', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 17), 'ZZ Dsh', 'V17', 'No especificado', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 18), 'ZZ Dsh', 'V18', 'No especificado', 'Femenino');

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', NULL,                'ZZ Dsh Raíz',     true),
  (pg_temp.id('eq', 2), 'dps', pg_temp.id('eq', 1), 'Técnica',         true),
  (pg_temp.id('eq', 3), 'dps', pg_temp.id('eq', 2), 'Cámaras',         true),
  (pg_temp.id('eq', 5), 'dps', pg_temp.id('eq', 1), 'Operaciones',     true),
  (pg_temp.id('eq', 6), 'dps', pg_temp.id('eq', 5), 'Estacionamiento', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 3), pg_temp.id('eq', 3), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 6), pg_temp.id('eq', 6), 'Voluntario', 'voluntario', true);

INSERT INTO public.dream_team_requisitos (id, equipo_id, rol_id, codigo, label, tipo, obligatoriedad) VALUES
  (pg_temp.id('rq', 3), pg_temp.id('eq', 3), pg_temp.id('ro', 3), 'induccion', 'Inducción', 'capacitacion', 'requerido');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test'),
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text, 'zz-test');

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', 3), pg_temp.id('ro', 3),
       'activo', now() - interval '30 days', 'admin_asignacion'
  FROM generate_series(10, 18) AS n;

INSERT INTO public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
SELECT pg_temp.id('se', n), pg_temp.id('rq', 3), 'pendiente' FROM generate_series(10, 18) AS n;

INSERT INTO public.dream_team_estados_historial (servicio_id, estado_anterior, estado_nuevo, motivo, actor_persona_id)
SELECT pg_temp.id('se', n), 'activo', 'activo', 'admin_asignacion', pg_temp.id('us', 1) FROM generate_series(10, 18) AS n;

-- The grants of every active servicio, written as dream_team_cargar_voluntarios does.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT DISTINCT s.persona_id, k.capability_key, k.experience, k.scope_type, k.scope_id, 'dream-team-servicio'
  FROM public.dream_team_servicios s
  JOIN public.dream_team_equipos e ON e.id = s.equipo_id
  JOIN public.dream_team_roles r ON r.id = s.rol_id
 CROSS JOIN LATERAL public.dream_team_grants_de_servicio(s.equipo_id, e.experiencia, s.rol_id, r.label) k
 WHERE s.estado = 'activo' AND s.persona_id::text LIKE 'd5a10000-%';

-- e: attendance (campus, turno) and DPS plans around 2026-12-01 Caracas.
INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Dsh Campus', 'ZZDSH1');
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora)
VALUES (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Dsh Domingo', 0, '09:00');
INSERT INTO public.dps_puestos (id, equipo_id, nombre, cantidad, orden)
VALUES (pg_temp.id('pu', 1), pg_temp.id('eq', 3), 'ZZ Dsh Cámara', 3, 0);
INSERT INTO public.dps_planes (id, fecha, tipo, titulo, horarios, llegada) VALUES
  (pg_temp.id('pl', 1), DATE '2026-11-01', 'libre', 'ZZ Dsh pasado',  '["09:00"]'::jsonb, '08:00'),
  (pg_temp.id('pl', 2), DATE '2026-12-01', 'libre', 'ZZ Dsh mismo día', '["09:00"]'::jsonb, '08:00'),
  (pg_temp.id('pl', 3), DATE '2026-12-20', 'libre', 'ZZ Dsh futuro',  '["09:00"]'::jsonb, '08:00');

INSERT INTO t_dsh_labels (id, label)
SELECT pg_temp.id('eq', n), l FROM (VALUES (1, 'RAIZ'), (2, 'TEC'), (3, 'CAM'), (5, 'OPS'), (6, 'EST')) AS x(n, l)
UNION ALL
SELECT pg_temp.id('ro', n), 'vol' FROM (VALUES (3), (6)) AS x(n)
UNION ALL
SELECT pg_temp.id('us', n), l FROM (VALUES (1, 'DIR'), (2, 'TEC_DIR')) AS x(n, l);

GRANT INSERT, SELECT ON t_dsh_failures, t_dsh_ctx TO authenticated, anon;
GRANT SELECT ON t_dsh_labels TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

SELECT pg_temp.assert_eq('fixture: V10 before any move',
  $q$SELECT pg_temp.servicios(10) || ' / ' || pg_temp.grants(10)$q$,
  'CAM:vol:activo:admin_asignacion:1:- / dps.team.serve@CAM, dream_team.serve@CAM');

-- ── a. direct move ───────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('a', $q$SELECT pg_temp.mover(10, 6, 6, 'correccion', 'ZZ Dsh mal cargado')$q$);
RESET ROLE;

SELECT pg_temp.assert_eq('a1: returns the destination servicio, activo in Estacionamiento',
  $q$SELECT pg_temp.lbl(s.equipo_id) || ':' || s.estado || ':' || (s.persona_id = pg_temp.id('us', 10))::text
       FROM public.dream_team_servicios s WHERE s.id = pg_temp.ctx('a')::uuid$q$,
  'EST:activo:true');
SELECT pg_temp.assert_eq('a2: the origin is gone (before 2027), only the destination remains',
  $q$SELECT pg_temp.servicios(10)$q$,
  CASE WHEN pg_temp.sin_rastro() THEN 'EST:vol:activo:reasignacion:1:-'
       ELSE 'CAM:vol:retirado:reasignacion:2:fin, EST:vol:activo:reasignacion:1:-' END);
SELECT pg_temp.assert_eq('a3: no history and no verificación left for the origin',
  $q$SELECT pg_temp.historial_de(10) || ' / ' || pg_temp.verificaciones_de(10)$q$,
  CASE WHEN pg_temp.sin_rastro() THEN ' / 0'
       ELSE 'activo>activo:admin_asignacion | activo>retirado:reasignacion / 1' END);
SELECT pg_temp.assert_eq('a4: the destination keeps its own history row',
  $q$SELECT pg_temp.historial(10)$q$,
  CASE WHEN pg_temp.sin_rastro() THEN 'EST:activo>activo:reasignacion:DIR'
       ELSE 'CAM:activo>activo:admin_asignacion:DIR | CAM:activo>retirado:reasignacion:DIR | EST:activo>activo:reasignacion:DIR' END);
SELECT pg_temp.assert_eq('a5: Cámaras grants revoked, Estacionamiento grants minted',
  $q$SELECT pg_temp.grants(10)$q$, 'dps.team.serve@CAM~, dps.team.serve@EST, dream_team.serve@CAM~, dream_team.serve@EST');

-- ── b. request approved ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('b.sol', $q$SELECT pg_temp.solicitar(11, 6, 6, 'traslado', NULL)$q$);
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('b', $q$SELECT pg_temp.resolver('b.sol', true, 'ZZ Dsh ok')$q$);
RESET ROLE;

SELECT pg_temp.assert_eq('b1: returns the destination servicio, activo in Estacionamiento',
  $q$SELECT pg_temp.lbl(s.equipo_id) || ':' || s.estado || ':' || (s.persona_id = pg_temp.id('us', 11))::text
       FROM public.dream_team_servicios s WHERE s.id = pg_temp.ctx('b')::uuid$q$,
  'EST:activo:true');
SELECT pg_temp.assert_eq('b2: the origin is gone (before 2027), only the destination remains',
  $q$SELECT pg_temp.servicios(11)$q$,
  CASE WHEN pg_temp.sin_rastro() THEN 'EST:vol:activo:reasignacion:1:-'
       ELSE 'CAM:vol:retirado:reasignacion:2:fin, EST:vol:activo:reasignacion:1:-' END);
SELECT pg_temp.assert_eq('b3: no history and no verificación left for the origin',
  $q$SELECT pg_temp.historial_de(11) || ' / ' || pg_temp.verificaciones_de(11)$q$,
  CASE WHEN pg_temp.sin_rastro() THEN ' / 0'
       ELSE 'activo>activo:admin_asignacion | activo>retirado:reasignacion / 1' END);
SELECT pg_temp.assert_eq('b4: the request went with the origin (before 2027)',
  $q$SELECT coalesce((SELECT r.estado FROM public.dream_team_solicitudes_cambio_area r WHERE r.id = pg_temp.ctx('b.sol')::uuid), 'none')$q$,
  CASE WHEN pg_temp.sin_rastro() THEN 'none' ELSE 'aprobada' END);
SELECT pg_temp.assert_eq('b5: grants moved to Estacionamiento',
  $q$SELECT pg_temp.grants(11)$q$, 'dps.team.serve@CAM~, dps.team.serve@EST, dream_team.serve@CAM~, dream_team.serve@EST');

-- ── c. nothing to delete ─────────────────────────────────────────────
-- Each delete runs in its own statement (guardar); its effects are checked after.

SELECT pg_temp.guardar('c1.en', $q$SELECT pg_temp.borrar_en(12, '2026-12-01 12:00:00-04')$q$);
SELECT pg_temp.guardar('c1.ahora', $q$SELECT public.dream_team_servicio_borrar_si_sin_historial(pg_temp.id('se', 12))$q$);
SELECT pg_temp.guardar('c2.id', $q$SELECT pg_temp.borrar_en(999, '2026-12-01 12:00:00-04')$q$);
SELECT pg_temp.guardar('c2.null', $q$SELECT public.dream_team_servicio_borrar_si_sin_historial_en(NULL, '2026-12-01 12:00:00-04')$q$);
SELECT pg_temp.guardar('c2.sin_fecha', $q$SELECT public.dream_team_servicio_borrar_si_sin_historial_en(pg_temp.id('se', 12), NULL)$q$);

SELECT pg_temp.assert_eq('c1: an activo servicio is not deleted (dated and at now())',
  $q$SELECT pg_temp.ctx('c1.en') || ' / ' || pg_temp.ctx('c1.ahora') || ' / ' || pg_temp.servicios(12) || ' / '
            || pg_temp.historial_de(12) || ' / ' || pg_temp.verificaciones_de(12)$q$,
  'false / false / CAM:vol:activo:admin_asignacion:1:- / activo>activo:admin_asignacion / 1');
SELECT pg_temp.assert_eq('c2: an unknown id, a NULL id or a NULL date deletes nothing',
  $q$SELECT pg_temp.ctx('c2.id') || ' / ' || pg_temp.ctx('c2.null') || ' / ' || pg_temp.ctx('c2.sin_fecha')$q$,
  'false / false / false');

-- ── d. the date gate ─────────────────────────────────────────────────

SELECT pg_temp.retirar(13);
SELECT pg_temp.retirar(14);

SELECT pg_temp.guardar('d1.corte', $q$SELECT pg_temp.borrar_en(13, '2027-01-01 00:00:00-04')$q$);
SELECT pg_temp.guardar('d1.despues', $q$SELECT pg_temp.borrar_en(13, '2027-06-15 12:00:00-04')$q$);
SELECT pg_temp.assert_eq('d1: at 2027-01-01 00:00 Caracas and later a retired servicio stays, with its history',
  $q$SELECT pg_temp.ctx('d1.corte') || ' / ' || pg_temp.ctx('d1.despues') || ' / ' || pg_temp.servicios(13) || ' / '
            || pg_temp.historial_de(13) || ' / ' || pg_temp.verificaciones_de(13)$q$,
  'false / false / CAM:vol:retirado:admin_retiro:2:fin / activo>activo:admin_asignacion | activo>retirado:admin_retiro / 1');

SELECT pg_temp.guardar('d2', $q$SELECT pg_temp.borrar_en(13, '2026-12-31 23:59:59-04')$q$);
SELECT pg_temp.assert_eq('d2: at 2026-12-31 23:59:59 Caracas it is deleted with its history and verificaciones',
  $q$SELECT pg_temp.ctx('d2') || ' / ' || pg_temp.servicios(13) || ' / ' || pg_temp.historial_de(13) || ' / '
            || pg_temp.verificaciones_de(13)$q$,
  'true /  /  / 0');

SELECT pg_temp.guardar('d3', $q$SELECT pg_temp.borrar_en(14, '2027-01-01 00:00:00+00')$q$);
SELECT pg_temp.assert_eq('d3: 2027-01-01 00:00 UTC is still 2026 in Caracas: deleted',
  $q$SELECT pg_temp.ctx('d3') || ' / ' || pg_temp.servicios(14) || ' / ' || pg_temp.historial_de(14)$q$,
  'true /  / ');

-- ── e. what keeps it retired ─────────────────────────────────────────

INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado)
VALUES (pg_temp.id('se', 15), pg_temp.id('tu', 1), DATE '2026-11-22', 'presente', true);
INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id) VALUES
  (pg_temp.id('pl', 1), pg_temp.id('pu', 1), pg_temp.id('se', 16), pg_temp.id('us', 16)),
  (pg_temp.id('pl', 3), pg_temp.id('pu', 1), pg_temp.id('se', 17), pg_temp.id('us', 17)),
  (pg_temp.id('pl', 2), pg_temp.id('pu', 1), pg_temp.id('se', 18), pg_temp.id('us', 18));
SELECT pg_temp.retirar(n) FROM generate_series(15, 18) AS n;

SELECT pg_temp.guardar('e1', $q$SELECT pg_temp.borrar_en(15, '2026-12-01 12:00:00-04')$q$);
SELECT pg_temp.guardar('e2', $q$SELECT pg_temp.borrar_en(16, '2026-12-01 12:00:00-04')$q$);
SELECT pg_temp.guardar('e3', $q$SELECT pg_temp.borrar_en(18, '2026-12-01 23:30:00-04')$q$);
SELECT pg_temp.guardar('e4', $q$SELECT pg_temp.borrar_en(17, '2026-12-01 12:00:00-04')$q$);

SELECT pg_temp.assert_eq('e1: volunteer attendance does not keep it (L19): deleted, the attendance with it',
  $q$SELECT pg_temp.ctx('e1') || ' / ' || pg_temp.servicios(15) || ' / ' || pg_temp.historial_de(15) || ' / '
            || (SELECT count(*) FROM public.dream_team_asistencias a WHERE a.servicio_id = pg_temp.id('se', 15))::text$q$,
  'true /  /  / 0');
SELECT pg_temp.assert_eq('e2: a DPS convocatoria of a past plan does not keep it (L18): deleted, the convocatoria with it',
  $q$SELECT pg_temp.ctx('e2') || ' / ' || pg_temp.servicios(16) || ' / '
            || (SELECT count(*) FROM public.dps_convocados c WHERE c.servicio_id = pg_temp.id('se', 16))::text$q$,
  'true /  / 0');
SELECT pg_temp.assert_eq('e3: nor one that same Caracas day',
  $q$SELECT pg_temp.ctx('e3') || ' / ' || pg_temp.servicios(18)$q$,
  'true / ');
SELECT pg_temp.assert_eq('e4: a convocatoria only in a future plan does not: deleted, the convocatoria with it',
  $q$SELECT pg_temp.ctx('e4') || ' / ' || pg_temp.servicios(17) || ' / ' || pg_temp.historial_de(17) || ' / '
            || (SELECT count(*) FROM public.dps_convocados c WHERE c.servicio_id = pg_temp.id('se', 17))::text$q$,
  'true /  /  / 0');

-- ── f. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f1: the helpers are internal: service_role only, definer, empty search_path',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                        || '|' || has_function_privilege('public', p.oid, 'EXECUTE')::text
                        || '|' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
                        || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])::text, ', ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_servicio_borrar_si_sin_historial', 'dream_team_servicio_borrar_si_sin_historial_en')$q$,
  'dream_team_servicio_borrar_si_sin_historial(uuid)=false|false|false|true|true, '
  || 'dream_team_servicio_borrar_si_sin_historial_en(uuid,timestamp with time zone)=false|false|false|true|true');
SELECT pg_temp.assert_eq('f2: the RPCs are still for authenticated only, definer, empty search_path',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                        || '|' || has_function_privilege('public', p.oid, 'EXECUTE')::text
                        || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])::text, ', ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_cambiar_area', 'dream_team_resolver_solicitud_cambio_area')$q$,
  'dream_team_cambiar_area(uuid,uuid,uuid,text,text)=true|false|false|true, '
  || 'dream_team_resolver_solicitud_cambio_area(uuid,boolean,text)=true|false|false|true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('f3: a session cannot call the helper',
  $q$SELECT public.dream_team_servicio_borrar_si_sin_historial(pg_temp.id('se', 12))$q$, '42501');
SELECT pg_temp.assert_raises('f4: a session cannot call the dated helper',
  $q$SELECT public.dream_team_servicio_borrar_si_sin_historial_en(pg_temp.id('se', 12), '2026-12-01 12:00:00-04')$q$, '42501');
RESET ROLE;
SELECT pg_temp.assert_eq('f5: the refused calls left the servicio as it was',
  $q$SELECT pg_temp.servicios(12)$q$, 'CAM:vol:activo:admin_asignacion:1:-');

-- ── g. Grupos de Vida is the only area that keeps its history (L19) ──
RESET ROLE;
SELECT pg_temp.retirar(12);
UPDATE public.dream_team_equipos SET experiencia = 'grupos_vida' WHERE id = pg_temp.id('eq', 3);
SELECT pg_temp.assert_eq('g1: a retirado servicio in Grupos de Vida is never deleted',
  $q$SELECT pg_temp.borrar_en(12, '2026-12-01 12:00:00-04') || ' / ' || pg_temp.servicios(12)$q$,
  'false / CAM:vol:retirado:admin_retiro:2:fin');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dsh_failures);
END;
$$;
