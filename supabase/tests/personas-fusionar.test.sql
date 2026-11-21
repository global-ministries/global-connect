-- Personas: merge two fichas of the same person
-- (odd/tasks/dream-team-estructura-correcciones.md, T5, S6c;
-- 20261121120000_personas_fusionar.sql).
--
-- Covers:
--   r. Refusals, none of which changes a row: a caller who is not admin or
--      pastor (42501 sin_autoridad), a session without a persona, the same id
--      twice (misma_persona), a missing id and a NULL id
--      (persona_no_encontrada), both with an account (ambas_con_cuenta), the
--      account on the one that would be deleted (se_va_tiene_cuenta), a
--      duplicate with rows in an append-only ledger that has a foreign key to
--      usuarios (support_ticket_events.actor_usuario_id: historial_inmutable,
--      on the dry run too); anon cannot execute.
--   d. Dry run (p_simular): answers simulado true with the counts and changes
--      nothing (admin, and a pastor too; an explicit NULL is a dry run too);
--      its counts equal the real run's; the append-only ledger
--      operating_core_participation_eventos (its statement trigger refuses
--      any UPDATE) does not break it and is reported as conservados.
--   m. The real merge, in one call: grupo_miembros (the (grupo_id,
--      usuario_id) collision keeps the survivor's row, the other group
--      moves), asistencia (the (evento_grupo_id, usuario_id) collision keeps
--      the survivor's row), dream_team_servicios (a repeated vigente servicio
--      is closed as retirado and moved, the other moves), usuario_campus (one
--      principal, the survivor's; the other campus moves), usuario_roles (no
--      duplicate), dps_planificadores (moves), usuarios.creado_por (moves),
--      audit_grupo_miembros (no FK: no row keeps the deleted id), the family
--      link between the two is deleted; the duplicate is deleted. The
--      append-only operating_core_participation_eventos row is NOT rewritten:
--      it keeps the deleted id (actor_persona_id and subject_id, conservados
--      1 each, total_conservados 2) and personas_fusiones maps it to QUEDA.
--   f. Empty fields of the survivor are filled (cédula, teléfono,
--      fecha_nacimiento, estado_civil over 'No especificado', the older
--      fecha_registro); non-empty ones are kept (email, bautizado, nombre).
--   a. One personas_fusiones row: actor, both ids, the deleted row, the
--      fields filled, the same counts as the answer and the conserved
--      references (referencias_conservadas).
--   b. personas_fusion_buscar and personas_fusion_resumen: admin only. The
--      resumen counts each ficha's own rows before the merge (SEVA 2/2/2,
--      QUEDA 1/1/1) and QUEDA's merged rows after it (2/2/2): it reads the
--      rows as they are when it runs, so after a failed merge QUEDA still
--      shows 1/1/1.
--   l. Privileges: authenticated executes the three RPCs, anon and PUBLIC do
--      not; definer functions with an empty search_path; personas_fusiones is
--      not readable by authenticated.
--
-- Run against STAGING as postgres inside a transaction that is discarded:
-- the last statement raises 'SUITE_RESULT: ALL OK' (or the failing cases),
-- which rolls everything back. Every row uses the prefix e5c20000.
--
-- Identities (usuario n = auth n): 1 ADMIN, 2 NADIE (no role), 3 PASTOR.
-- People: 10 QUEDA «ZZ Dup Queda» (account; email; bautizado; campus A
-- principal; G1; E1 absent; servicio eq1/rol1; miembro), 11 SEVA «ZZ Dup
-- Seva» (no account; cédula 30999111, teléfono 04140001111, born 1990-05-05,
-- Casado, registered 2020; G1 and G2; E1 present and E2; servicios eq1/rol1
-- and eq1/rol2; campus B principal and A; miembro; DPS planner; created
-- usuario 15; family link with QUEDA; one operating_core_participation_eventos
-- row as subject and actor), 12 and 13 two people with accounts, 15 HIJO
-- (creado_por SEVA).

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pf_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pf_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pf_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs p_sql (one jsonb) and keeps the answer under p_k.
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_case text, p_k text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_pf_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected success, got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT v FROM t_pf_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5c20000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c201' WHEN 'us' THEN 'c202' WHEN 'ca' THEN 'c203'
                       WHEN 'eq' THEN 'c204' WHEN 'ro' THEN 'c205' WHEN 'se' THEN 'c206'
                       WHEN 'sg' THEN 'c207' WHEN 'gr' THEN 'c208' WHEN 'ev' THEN 'c209' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.u(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.id('us', p_n);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nadie() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true);
$$;

-- Everything a merge of the suite's people could touch, as one hash.
CREATE OR REPLACE FUNCTION pg_temp.foto() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT string_agg(concat_ws(':', u.id, u.auth_id, u.nombre, u.apellido, u.cedula, u.telefono, u.email,
                                 u.fecha_nacimiento, u.fecha_registro, u.estado_civil, u.bautizado, u.creado_por),
                       ',' ORDER BY u.id)
       FROM public.usuarios u WHERE u.id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', gm.id, gm.grupo_id, gm.usuario_id), ',' ORDER BY gm.id)
       FROM public.grupo_miembros gm WHERE gm.grupo_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', a.id, a.evento_grupo_id, a.usuario_id, a.presente), ',' ORDER BY a.id)
       FROM public.asistencia a WHERE a.evento_grupo_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', s.id, s.persona_id, s.estado, s.fecha_fin), ',' ORDER BY s.id)
       FROM public.dream_team_servicios s WHERE s.equipo_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', uc.id, uc.usuario_id, uc.campus_id, uc.es_campus_principal), ',' ORDER BY uc.id)
       FROM public.usuario_campus uc WHERE uc.usuario_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', ur.id, ur.usuario_id, ur.rol_id), ',' ORDER BY ur.id)
       FROM public.usuario_roles ur WHERE ur.usuario_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', r.id, r.usuario1_id, r.usuario2_id), ',' ORDER BY r.id)
       FROM public.relaciones_usuarios r WHERE r.usuario1_id::text LIKE 'e5c20000-%' OR r.usuario2_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', d.persona_id, d.agregado_por), ',' ORDER BY d.persona_id)
       FROM public.dps_planificadores d WHERE d.persona_id::text LIKE 'e5c20000-%'),
    (SELECT count(*) FROM public.audit_grupo_miembros ag WHERE ag.usuario_id::text LIKE 'e5c20000-%'),
    (SELECT string_agg(concat_ws(':', ag.usuario_id), ',' ORDER BY ag.id)
       FROM public.audit_grupo_miembros ag WHERE ag.usuario_id::text LIKE 'e5c20000-%'),
    (SELECT count(*) FROM public.personas_fusiones f WHERE f.se_va_id::text LIKE 'e5c20000-%'),
    (SELECT count(*) FROM public.operating_core_participation_eventos e
      WHERE e.subject_id::text LIKE 'e5c20000-%' OR e.actor_persona_id::text LIKE 'e5c20000-%')));
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'zz-pf-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 2, 3, 10, 12, 13]) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.u(1), pg_temp.id('au', 1), 'ZZ Dup', 'Admin', 'zz-pf-1@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.u(2), pg_temp.id('au', 2), 'ZZ Dup', 'Nadie', 'zz-pf-2@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.u(3), pg_temp.id('au', 3), 'ZZ Dup', 'Pastor', 'zz-pf-3@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, bautizado, fecha_registro)
VALUES (pg_temp.u(10), pg_temp.id('au', 10), 'ZZ Dup', 'Queda', 'zz-pf-10@example.test', 'No especificado', 'Femenino',
        true, timestamptz '2026-01-01 12:00+00');
INSERT INTO public.usuarios (id, nombre, apellido, email, cedula, telefono, fecha_nacimiento, estado_civil, genero, bautizado, fecha_registro)
VALUES (pg_temp.u(11), 'ZZ Dup', 'Seva', 'zz-pf-seva@example.test', '30999111', '04140001111', date '1990-05-05', 'Casado', 'Femenino',
        false, timestamptz '2020-01-01 12:00+00');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.u(12), pg_temp.id('au', 12), 'ZZ Dup', 'Cuenta Uno', 'zz-pf-12@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.u(13), pg_temp.id('au', 13), 'ZZ Dup', 'Cuenta Dos', 'zz-pf-13@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, creado_por)
VALUES (pg_temp.u(15), 'ZZ Dup', 'Hijo', 'Soltero', 'Masculino', pg_temp.u(11));

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(3), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'pastor';
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(10), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'miembro';
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(11), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'miembro';

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Dup Campus A', 'ZZDUPPFA');
INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 2), 'ZZ Dup Campus B', 'ZZDUPPFB');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES (pg_temp.u(1), pg_temp.id('ca', 1), true);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES (pg_temp.u(10), pg_temp.id('ca', 1), true);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES (pg_temp.u(11), pg_temp.id('ca', 2), true);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES (pg_temp.u(11), pg_temp.id('ca', 1), false);

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
VALUES (pg_temp.u(10), pg_temp.u(11), 'hermano');

INSERT INTO public.segmentos (id, nombre) VALUES (pg_temp.id('sg', 1), 'ZZ Dup Segmento');
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  (pg_temp.id('gr', 1), 'ZZ Dup G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), pg_temp.id('sg', 1), true),
  (pg_temp.id('gr', 2), 'ZZ Dup G2', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), pg_temp.id('sg', 1), true);
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_asignacion) VALUES
  (pg_temp.id('gr', 1), pg_temp.u(10), 'Miembro', 'activo', current_date - 30),
  (pg_temp.id('gr', 1), pg_temp.u(11), 'Miembro', 'activo', current_date - 300),
  (pg_temp.id('gr', 2), pg_temp.u(11), 'Miembro', 'activo', current_date - 200);
INSERT INTO public.eventos_grupo (id, grupo_id, fecha, no_hubo_reunion) VALUES
  (pg_temp.id('ev', 1), pg_temp.id('gr', 1), current_date - 7, false),
  (pg_temp.id('ev', 2), pg_temp.id('gr', 2), current_date - 14, false);
INSERT INTO public.asistencia (evento_grupo_id, usuario_id, presente) VALUES
  (pg_temp.id('ev', 1), pg_temp.u(10), false),
  (pg_temp.id('ev', 1), pg_temp.u(11), true),
  (pg_temp.id('ev', 2), pg_temp.u(11), true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
VALUES (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Dup Equipo', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
VALUES (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'zzdup voluntario', 'lider', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
VALUES (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'zzdup apoyo', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 1), pg_temp.u(10), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
        timestamptz '2025-01-01 12:00+00', 'admin_asignacion');
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 2), pg_temp.u(11), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
        timestamptz '2021-01-01 12:00+00', 'admin_asignacion');
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 3), pg_temp.u(11), pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'activo',
        timestamptz '2021-01-01 12:00+00', 'admin_asignacion');

INSERT INTO public.dps_planificadores (persona_id, agregado_por) VALUES (pg_temp.u(11), pg_temp.u(1));

-- Append-only ledger (statement trigger enforce_*participation_append_only refuses any UPDATE/DELETE).
INSERT INTO public.operating_core_participation_eventos (kind, subject_id, occurred_at, actor_persona_id, capture_source, experience)
VALUES ('attendance', pg_temp.u(11), timestamptz '2020-06-01 12:00+00', pg_temp.u(11), 'manual', 'zz_pf_suite');

INSERT INTO t_pf_ctx (k, v) VALUES ('foto0', to_jsonb(pg_temp.foto()));

-- ── r. refusals ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('r: a caller who is not admin or pastor gets 42501',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), false)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('r: also on a dry run',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), true)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_nadie();
SELECT pg_temp.assert_raises('r: a session without a persona gets 42501',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), false)$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('r: the same id twice',
  $q$SELECT public.personas_fusionar(pg_temp.u(11), pg_temp.u(11), false)$q$, '22023', 'misma_persona');
SELECT pg_temp.assert_raises('r: a missing id',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(99), false)$q$, '22023', 'persona_no_encontrada');
SELECT pg_temp.assert_raises('r: a missing survivor',
  $q$SELECT public.personas_fusionar(pg_temp.u(99), pg_temp.u(11), false)$q$, '22023', 'persona_no_encontrada');
SELECT pg_temp.assert_raises('r: a NULL id',
  $q$SELECT public.personas_fusionar(NULL, pg_temp.u(11), false)$q$, '22023', 'persona_no_encontrada');
SELECT pg_temp.assert_raises('r: both with an account',
  $q$SELECT public.personas_fusionar(pg_temp.u(12), pg_temp.u(13), false)$q$, '22023', 'ambas_con_cuenta');
SELECT pg_temp.assert_raises('r: the account would be deleted',
  $q$SELECT public.personas_fusionar(pg_temp.u(11), pg_temp.u(10), false)$q$, '22023', 'se_va_tiene_cuenta');
-- support_ticket_events is append-only and its actor_usuario_id is a foreign key to usuarios: the
-- deleted id cannot stay there, so the merge (and its dry run) refuse. The block always raises at the
-- end, so the ticket rows it inserts are rolled back with it.
SELECT pg_temp.assert_raises('r: rows in an append-only ledger with a foreign key refuse the merge and the dry run',
  $q$DO $d$
  DECLARE
    v_ticket uuid := gen_random_uuid();
    v_sim    boolean;
    v_detail text;
    v_r      text := '';
  BEGIN
    INSERT INTO public.support_tickets (id, reporter_usuario_id, category, title, description)
    VALUES (v_ticket, pg_temp.u(1), 'zz', 'ZZ Dup ticket', 'ZZ Dup ticket de prueba');
    INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type)
    VALUES (v_ticket, pg_temp.u(11), 'zz_pf_prueba', 'ticket');
    FOREACH v_sim IN ARRAY ARRAY[true, false] LOOP
      BEGIN
        PERFORM public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), v_sim);
        v_r := v_r || v_sim::text || ':none;';
      EXCEPTION
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
          v_r := v_r || v_sim::text || ':' || SQLSTATE || ' ' || SQLERRM || ' ' || coalesce(v_detail, '') || ';';
      END;
    END LOOP;
    RAISE EXCEPTION 'pf_resultado %', v_r;
  END;
  $d$$q$, 'P0001',
  'pf_resultado true:22023 historial_inmutable support_ticket_events.actor_usuario_id;'
  || 'false:22023 historial_inmutable support_ticket_events.actor_usuario_id;');

-- ── b. the summary before the merge (each ficha's own rows) ─────────

SELECT pg_temp.assert_eq('b: personas_fusion_resumen before the merge counts each ficha''s own rows',
  $q$SELECT string_agg(concat_ws(':', e ->> 'apellido', e ->> 'tiene_cuenta', e ->> 'campus', e ->> 'grupos',
                                 e ->> 'servicios', e ->> 'asistencias', e ->> 'asistencias_dps'), ',' ORDER BY o)
       FROM jsonb_array_elements(public.personas_fusion_resumen(ARRAY[pg_temp.u(11), pg_temp.u(10)])) WITH ORDINALITY AS x(e, o)$q$,
  'Seva:false:ZZ Dup Campus B:2:2:2:0,Queda:true:ZZ Dup Campus A:1:1:1:0');

GRANT INSERT, SELECT, UPDATE ON ALL TABLES IN SCHEMA pg_temp TO anon, authenticated;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;
SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();
SELECT pg_temp.assert_raises('r: anon cannot execute',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), true)$q$, '42501');
RESET ROLE;

SELECT pg_temp.assert_eq('r: no refusal changed a row',
  $q$SELECT (pg_temp.foto() = (pg_temp.ctx('foto0') #>> '{}'))::text$q$, 'true');

-- ── d. dry run ───────────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.guardar('d: a pastor may run the dry run', 'simulacion_pastor',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), true)$q$);
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('d: the admin runs the dry run', 'simulacion',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), true)$q$);

SELECT pg_temp.guardar('d: an explicit NULL p_simular is a dry run', 'simulacion_null',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), NULL)$q$);
SELECT pg_temp.assert_eq('d: NULL p_simular answers simulado true with the same counts',
  $q$SELECT concat_ws('|', pg_temp.ctx('simulacion_null') ->> 'simulado',
                      pg_temp.ctx('simulacion_null') -> 'conteos' = pg_temp.ctx('simulacion') -> 'conteos')$q$,
  'true|t');
SELECT pg_temp.assert_eq('d: the dry run says simulado true',
  $q$SELECT pg_temp.ctx('simulacion') ->> 'simulado'$q$, 'true');
SELECT pg_temp.assert_eq('d: the dry run reports the grupo_miembros counts',
  $q$SELECT (pg_temp.ctx('simulacion') -> 'conteos' -> 'grupo_miembros.usuario_id')::text$q$,
  '{"movidos": 1, "descartados": 1}');
SELECT pg_temp.assert_eq('d: the append-only participation ledger is reported as conservados, not moved',
  $q$SELECT concat_ws(' ', c -> 'operating_core_participation_eventos.actor_persona_id',
                      c -> 'operating_core_participation_eventos.subject_id', s ->> 'total_conservados')
       FROM (SELECT pg_temp.ctx('simulacion') AS s, pg_temp.ctx('simulacion') -> 'conteos' AS c) x$q$,
  '{"movidos": 0, "conservados": 1, "descartados": 0} {"movidos": 0, "conservados": 1, "descartados": 0} 2');
SELECT pg_temp.assert_eq('d: the pastor''s dry run gives the same counts',
  $q$SELECT (pg_temp.ctx('simulacion_pastor') -> 'conteos' = pg_temp.ctx('simulacion') -> 'conteos')::text$q$, 'true');
SELECT pg_temp.assert_eq('d: the dry run changed nothing (no audit row either)',
  $q$SELECT (pg_temp.foto() = (pg_temp.ctx('foto0') #>> '{}'))::text$q$, 'true');

-- ── m. the real merge ────────────────────────────────────────────────

SELECT pg_temp.guardar('m: the admin merges SEVA into QUEDA', 'fusion',
  $q$SELECT public.personas_fusionar(pg_temp.u(10), pg_temp.u(11), false)$q$);

SELECT pg_temp.assert_eq('m: simulado false, both ids',
  $q$SELECT concat_ws('|', pg_temp.ctx('fusion') ->> 'simulado',
                      (pg_temp.ctx('fusion') ->> 'queda_id') = pg_temp.u(10)::text,
                      (pg_temp.ctx('fusion') ->> 'se_va_id') = pg_temp.u(11)::text)$q$,
  'false|t|t');
SELECT pg_temp.assert_eq('m: the dry run counts are the real counts',
  $q$SELECT (pg_temp.ctx('fusion') -> 'conteos' = pg_temp.ctx('simulacion') -> 'conteos'
             AND pg_temp.ctx('fusion') -> 'campos_completados' = pg_temp.ctx('simulacion') -> 'campos_completados')::text$q$,
  'true');
SELECT pg_temp.assert_eq('m: counts per table',
  $q$SELECT concat_ws(' ', c -> 'grupo_miembros.usuario_id', c -> 'asistencia.usuario_id',
                      c -> 'dream_team_servicios.persona_id', c -> 'dps_planificadores.persona_id',
                      c -> 'usuarios.creado_por', c -> 'relaciones_usuarios.entre_ambas')
       FROM (SELECT pg_temp.ctx('fusion') -> 'conteos' AS c) x$q$,
  '{"movidos": 1, "descartados": 1} {"movidos": 1, "descartados": 1} '
  || '{"movidos": 2, "retirados": 1, "descartados": 0} {"movidos": 1, "descartados": 0} '
  || '{"movidos": 1, "descartados": 0} {"movidos": 0, "descartados": 1}');
SELECT pg_temp.assert_eq('m: the duplicate is deleted',
  $q$SELECT count(*)::text FROM public.usuarios WHERE id = pg_temp.u(11)$q$, '0');
SELECT pg_temp.assert_eq('m: grupo_miembros: one row per group for QUEDA',
  $q$SELECT string_agg(g.nombre || ':' || n, ',' ORDER BY g.nombre)
       FROM (SELECT gm.grupo_id, count(*) AS n FROM public.grupo_miembros gm
              WHERE gm.usuario_id = pg_temp.u(10) GROUP BY gm.grupo_id) x
       JOIN public.grupos g ON g.id = x.grupo_id$q$,
  'ZZ Dup G1:1,ZZ Dup G2:1');
SELECT pg_temp.assert_eq('m: grupo_miembros: QUEDA keeps her own G1 row (her fecha_asignacion)',
  $q$SELECT (gm.fecha_asignacion = current_date - 30)::text FROM public.grupo_miembros gm
      WHERE gm.usuario_id = pg_temp.u(10) AND gm.grupo_id = pg_temp.id('gr', 1)$q$, 'true');
SELECT pg_temp.assert_eq('m: asistencia: E1 keeps QUEDA''s own row (absent), E2 moved',
  $q$SELECT string_agg(e.k || ':' || a.presente, ',' ORDER BY e.k)
       FROM public.asistencia a
       JOIN (VALUES (pg_temp.id('ev', 1), 'E1'), (pg_temp.id('ev', 2), 'E2')) AS e(id, k) ON e.id = a.evento_grupo_id
      WHERE a.usuario_id = pg_temp.u(10)$q$,
  'E1:false,E2:true');
SELECT pg_temp.assert_eq('m: dream_team_servicios: the repeated one is retirado with fecha_fin, all are QUEDA''s',
  $q$SELECT string_agg(right(s.id::text, 1) || ':' || s.estado || ':' || (s.fecha_fin IS NOT NULL), ',' ORDER BY s.id)
       FROM public.dream_team_servicios s WHERE s.persona_id = pg_temp.u(10)$q$,
  '1:activo:false,2:retirado:true,3:activo:false');
SELECT pg_temp.assert_eq('m: usuario_campus: campus A principal, campus B kept, one principal',
  $q$SELECT concat_ws('|',
           (SELECT string_agg(DISTINCT c.nombre, ',' ORDER BY c.nombre) FROM public.usuario_campus uc
              JOIN public.campus c ON c.id = uc.campus_id WHERE uc.usuario_id = pg_temp.u(10)),
           (SELECT string_agg(c.nombre, ',') FROM public.usuario_campus uc
              JOIN public.campus c ON c.id = uc.campus_id WHERE uc.usuario_id = pg_temp.u(10) AND uc.es_campus_principal))$q$,
  'ZZ Dup Campus A,ZZ Dup Campus B|ZZ Dup Campus A');
SELECT pg_temp.assert_eq('m: usuario_roles: miembro once',
  $q$SELECT count(*)::text FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = pg_temp.u(10) AND rs.nombre_interno = 'miembro'$q$, '1');
SELECT pg_temp.assert_eq('m: dps_planificadores moved',
  $q$SELECT count(*)::text FROM public.dps_planificadores WHERE persona_id = pg_temp.u(10)$q$, '1');
SELECT pg_temp.assert_eq('m: creado_por moved',
  $q$SELECT (creado_por = pg_temp.u(10))::text FROM public.usuarios WHERE id = pg_temp.u(15)$q$, 'true');
SELECT pg_temp.assert_eq('m: the family link between the two is gone, no self link',
  $q$SELECT count(*)::text FROM public.relaciones_usuarios
      WHERE pg_temp.u(10) IN (usuario1_id, usuario2_id) OR pg_temp.u(11) IN (usuario1_id, usuario2_id)$q$, '0');
SELECT pg_temp.assert_eq('m: the answer reports the conserved append-only rows',
  $q$SELECT concat_ws(' ', c -> 'operating_core_participation_eventos.actor_persona_id',
                      c -> 'operating_core_participation_eventos.subject_id', s ->> 'total_conservados')
       FROM (SELECT pg_temp.ctx('fusion') AS s, pg_temp.ctx('fusion') -> 'conteos' AS c) x$q$,
  '{"movidos": 0, "conservados": 1, "descartados": 0} {"movidos": 0, "conservados": 1, "descartados": 0} 2');
SELECT pg_temp.assert_eq('m: the append-only participation row is not rewritten: it keeps the deleted id',
  $q$SELECT concat_ws(',',
           (SELECT count(*) FROM public.operating_core_participation_eventos
             WHERE subject_id = pg_temp.u(11) AND actor_persona_id = pg_temp.u(11) AND experience = 'zz_pf_suite'),
           (SELECT count(*) FROM public.operating_core_participation_eventos
             WHERE pg_temp.u(10) IN (subject_id, actor_persona_id)))$q$,
  '1,0');
SELECT pg_temp.assert_eq('m: personas_fusiones maps the conserved row''s id to QUEDA',
  $q$SELECT string_agg((f.queda_id = pg_temp.u(10))::text, ',')
       FROM public.operating_core_participation_eventos e
       JOIN public.personas_fusiones f ON f.se_va_id = e.subject_id
      WHERE e.experience = 'zz_pf_suite'$q$,
  'true');
SELECT pg_temp.assert_eq('m: no row keeps the deleted id outside the append-only ledgers (with or without a foreign key)',
  $q$SELECT concat_ws(',',
           (SELECT count(*) FROM public.audit_grupo_miembros WHERE usuario_id = pg_temp.u(11)),
           (SELECT count(*) FROM public.dream_team_capability_grants WHERE persona_id = pg_temp.u(11)),
           (SELECT count(*) FROM public.grupo_miembros WHERE usuario_id = pg_temp.u(11)),
           (SELECT count(*) FROM public.asistencia WHERE usuario_id = pg_temp.u(11)),
           (SELECT count(*) FROM public.usuario_campus WHERE usuario_id = pg_temp.u(11)),
           (SELECT count(*) FROM public.dream_team_servicios WHERE persona_id = pg_temp.u(11)))$q$,
  '0,0,0,0,0,0');

-- ── f. fields ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: empty fields filled, non-empty kept',
  $q$SELECT concat_ws('|', u.nombre, u.apellido, u.cedula, u.telefono, u.email, u.fecha_nacimiento,
                      u.estado_civil, u.bautizado, u.fecha_registro::date, u.auth_id = pg_temp.id('au', 10))
       FROM public.usuarios u WHERE u.id = pg_temp.u(10)$q$,
  'ZZ Dup|Queda|30999111|04140001111|zz-pf-10@example.test|1990-05-05|Casado|t|2020-01-01|t');
SELECT pg_temp.assert_eq('f: the answer lists the fields filled',
  $q$SELECT (pg_temp.ctx('fusion') -> 'campos_completados')::text$q$,
  '["cedula", "telefono", "fecha_nacimiento", "estado_civil", "fecha_registro"]');

-- ── a. audit ─────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: one personas_fusiones row with actor, ids, deleted row, fields and counts',
  $q$SELECT concat_ws('|', count(*), bool_and(f.actor_id = pg_temp.u(1)), bool_and(f.queda_id = pg_temp.u(10)),
                      max(f.se_va_datos ->> 'apellido'), max(f.se_va_datos ->> 'cedula'),
                      bool_and(to_jsonb(f.campos_completados) = pg_temp.ctx('fusion') -> 'campos_completados'),
                      bool_and(f.conteos = pg_temp.ctx('fusion') -> 'conteos'))
       FROM public.personas_fusiones f WHERE f.se_va_id = pg_temp.u(11)$q$,
  '1|t|t|Seva|30999111|t|t');
SELECT pg_temp.assert_eq('a: personas_fusiones lists the conserved references per table.column',
  $q$SELECT (f.referencias_conservadas = jsonb_build_object(
             'operating_core_participation_eventos.actor_persona_id', 1,
             'operating_core_participation_eventos.subject_id', 1))::text
       FROM public.personas_fusiones f WHERE f.se_va_id = pg_temp.u(11)$q$,
  'true');

-- ── b. search and summary for the page ───────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: personas_fusion_buscar finds the suite people with tiene_cuenta',
  $q$SELECT string_agg(b.apellido || ':' || b.tiene_cuenta, ',' ORDER BY b.apellido)
       FROM public.personas_fusion_buscar('dup cuenta zz') b WHERE b.id::text LIKE 'e5c20000-%'$q$,
  'Cuenta Dos:true,Cuenta Uno:true');
SELECT pg_temp.assert_eq('b: personas_fusion_resumen after the merge: QUEDA counts SEVA''s rows, in the given order (no campus is skipped)',
  $q$SELECT string_agg(concat_ws(':', e ->> 'apellido', e ->> 'tiene_cuenta', e ->> 'campus', e ->> 'grupos',
                                 e ->> 'servicios', e ->> 'asistencias', e ->> 'asistencias_dps'), ',' ORDER BY o)
       FROM jsonb_array_elements(public.personas_fusion_resumen(ARRAY[pg_temp.u(12), pg_temp.u(10)])) WITH ORDINALITY AS x(e, o)$q$,
  'Cuenta Uno:true:0:0:0:0,Queda:true:ZZ Dup Campus A:2:2:2:0');
SELECT pg_temp.assert_raises('b: personas_fusion_resumen refuses more than two ids',
  $q$SELECT public.personas_fusion_resumen(ARRAY[pg_temp.u(1), pg_temp.u(2), pg_temp.u(3)])$q$, '22023', 'demasiados_ids');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('b: personas_fusion_buscar refuses who is not admin or pastor',
  $q$SELECT count(*) FROM public.personas_fusion_buscar('zz dup')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: personas_fusion_resumen refuses who is not admin or pastor',
  $q$SELECT public.personas_fusion_resumen(ARRAY[pg_temp.u(10)])$q$, '42501', 'sin_autoridad');

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes the three RPCs, anon and PUBLIC do not',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('public', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('personas_fusion_buscar', 'personas_fusion_resumen', 'personas_fusionar')$q$,
  'personas_fusion_buscar:true:false:false,personas_fusion_resumen:true:false:false,personas_fusionar:true:false:false');
SELECT pg_temp.assert_eq('l: definer functions with an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('personas_fusion_buscar', 'personas_fusion_resumen', 'personas_fusionar')$q$,
  'personas_fusion_buscar:true,personas_fusion_resumen:true,personas_fusionar:true');
SELECT pg_temp.assert_eq('l: personas_fusiones: RLS on, authenticated and anon cannot read it',
  $q$SELECT concat_ws('|', c.relrowsecurity,
                      has_table_privilege('authenticated', 'public.personas_fusiones', 'SELECT'),
                      has_table_privilege('anon', 'public.personas_fusiones', 'SELECT'))
       FROM pg_class c WHERE c.oid = 'public.personas_fusiones'::regclass$q$,
  't|f|f');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_pf_failures);
END;
$$;
