-- T1 (odd/tasks/home-por-rol.md, S4, S5) — the milestone «hizo Próximo
-- Paso» (20261110100000_proximo_paso_hito.sql).
--
-- Covers:
--   a. The area director marks a person who applied to their area
--      (postulado); the person reads their own mark (marcado_por = the
--      director) and hizo_proximo_paso answers true. The director reads the
--      row too; another person does not.
--   b. hizo_proximo_paso is true through a certificate (not revoked) of the
--      taller proximo-paso, with no mark; false for a person whose only
--      certificates are a revoked one of Próximo Paso and one of another
--      taller. personas_con_proximo_paso answers the same, per caller.
--   c. Refused (42501, Spanish message) and nothing changes: an unrelated
--      person, the director for someone outside the area or retirado. An
--      unrelated caller gets NULL from hizo_proximo_paso and no rows.
--   d. The director marks en_orientacion and unmarks; a coordinator of the
--      area marks too; authority over the Próximo Paso node (DPS) marks
--      anyone; an admin marks anyone.
--   e. Unmarking never touches a certificate: the person still did it.
--   f. No direct writes; validation (p_hecho null, unknown person, long
--      nota); anon cannot execute; definer attributes.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none). Before the migration every case
-- that calls the new objects fails (RED).
--
-- Identities (usuario n = auth n): 1 OWNER (postulado in S); 2 DIR
-- (dream_team.direct on N); 3 OUTSIDER (nothing); 4 CERT (activo in S, a
-- Próximo Paso certificate); 5 NOTHING (activo in E, a revoked Próximo Paso
-- certificate and one of another taller); 6 PPDIR (dream_team.direct on the
-- real Próximo Paso node); 7 ORIENT (en_orientacion in S); 8 ADMIN;
-- 9 COORD (dream_team.coordinate on S); 10 RETIRED (retirado in S).
-- Tree: R → N → S; R → E.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pp_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pp_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || coalesce(' ' || p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9200000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9201' WHEN 'us' THEN '9202' WHEN 'eq' THEN '9204'
                       WHEN 'ro' THEN '9205' WHEN 'ta' THEN '9206' WHEN 'ed' THEN '9207'
                       WHEN 'ev' THEN '9208' WHEN 'ce' THEN '9209' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

SELECT pg_temp.fail('setup', 'the taller proximo-paso or its Dream Team node is missing on this database')
 WHERE NOT EXISTS (SELECT 1 FROM public.talleres WHERE slug = 'proximo-paso' AND dream_team_equipo_id IS NOT NULL);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'pp-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 10) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Pp', 'U' || n, 'pp-' || n || '@example.test', 'No especificado', 'Otro'
  FROM generate_series(1, 10) AS n;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 8), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Pp R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Pp N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Pp S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Pp E', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'voluntario', true);

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'postulado', now(), 'admin_asignacion'),
  (pg_temp.id('us', 4), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 5), pg_temp.id('eq', 4), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 7), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'en_orientacion', now(), 'admin_asignacion');
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual) VALUES
  (pg_temp.id('us', 10), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'retirado', now() - interval '1 day', now(), 'admin_asignacion');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 9), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT pg_temp.id('us', 6), 'dream_team.direct', 'dream_team', 'equipo', t.dream_team_equipo_id::text
  FROM public.talleres t WHERE t.slug = 'proximo-paso';

-- Another taller (not Próximo Paso), and one edición of each, as open_edicion
-- writes them.
INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id)
VALUES (pg_temp.id('ta', 1), 'zz-pp-otro-taller', 'ZZ Pp Otro taller', pg_temp.id('eq', 4));

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT pg_temp.id('ev', x.n), 'workshop', 'active', 'ZZ Pp edición ' || x.n, to_char(now(), 'YYYY-MM-DD'),
       'talleres_crecimiento', '{}'::jsonb
  FROM (VALUES (1), (2)) AS x(n);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, tipo, link_type, modalidad_inscripcion, estado, nombre_snapshot,
  sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot, taller_id, fecha_inicio)
SELECT pg_temp.id('ed', x.n), pg_temp.id('ev', x.n), t.tipo, t.vinculo, t.modalidad_default, 'borrador',
       'ZZ Pp edición ' || x.n, 1, 60, t.modalidad_default, t.id, now()
  FROM (VALUES (1, 'proximo-paso'), (2, 'zz-pp-otro-taller')) AS x(n, slug)
  JOIN public.talleres t ON t.slug = x.slug;

-- Certificates without inscripciones (as fase3-certificado-publico.test.sql).
ALTER TABLE public.taller_certificados DROP CONSTRAINT taller_certificados_inscripcion_id_fkey;

INSERT INTO public.taller_certificados
  (id, inscripcion_id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot,
   nombre_participante_snapshot, revocado_at, motivo_revocacion)
VALUES
  (pg_temp.id('ce', 1), gen_random_uuid(), 'zzpphitoaaaaaaab', pg_temp.id('ed', 1), pg_temp.id('us', 4),
   'Próximo Paso', 'ZZ Pp U4', NULL, NULL),
  (pg_temp.id('ce', 2), gen_random_uuid(), 'zzpphitoaaaaaaac', pg_temp.id('ed', 1), pg_temp.id('us', 5),
   'Próximo Paso', 'ZZ Pp U5', now(), 'prueba'),
  (pg_temp.id('ce', 3), gen_random_uuid(), 'zzpphitoaaaaaaad', pg_temp.id('ed', 2), pg_temp.id('us', 5),
   'ZZ Pp Otro taller', 'ZZ Pp U5', NULL, NULL);

GRANT INSERT, SELECT ON t_pp_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a. the area director marks; the person reads their own mark ──────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('a: the area director marks a postulado of their area',
  $q$SELECT concat_ws('|', r->>'hecho', r->>'marcado', r->>'por_certificado')
       FROM public.marcar_proximo_paso(pg_temp.id('us', 1), true, '  Vino en octubre  ') r$q$,
  'true|true|false');
SELECT pg_temp.assert_eq('a: the director reads the row of a person in scope',
  $q$SELECT count(*)::text FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 1)$q$, '1');
SELECT pg_temp.assert_eq('a: the director sees hizo_proximo_paso of a person in scope',
  $q$SELECT public.hizo_proximo_paso(pg_temp.id('us', 1))::text$q$, 'true');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the owner reads their own mark',
  $q$SELECT concat_ws('|', fuente, marcado_por::text = pg_temp.id('us', 2)::text, nota, marcado_en IS NOT NULL)
       FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 1)$q$,
  'marcado|t|Vino en octubre|t');
SELECT pg_temp.assert_eq('a: hizo_proximo_paso is true through the mark',
  $q$SELECT public.hizo_proximo_paso(pg_temp.id('us', 1))::text$q$, 'true');

-- ── b. certificate ───────────────────────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('b: hizo_proximo_paso is true through a Próximo Paso certificate',
  $q$SELECT public.hizo_proximo_paso(pg_temp.id('us', 4))::text$q$, 'true');
SELECT pg_temp.assert_eq('b: a certificate writes no mark',
  $q$SELECT count(*)::text FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 4)$q$, '0');
SELECT pg_temp.assert_eq('a: the owner does not read another person''s mark',
  $q$SELECT count(*)::text FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 1)$q$, '0');

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('b: false with only a revoked Próximo Paso certificate and another taller''s',
  $q$SELECT public.hizo_proximo_paso(pg_temp.id('us', 5))::text$q$, 'false');
SELECT pg_temp.assert_eq('b: personas_con_proximo_paso for oneself (none)',
  $q$SELECT count(*)::text FROM public.personas_con_proximo_paso(ARRAY[pg_temp.id('us', 5)])$q$, '0');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: personas_con_proximo_paso answers the ones the director sees that did it',
  $q$SELECT string_agg(x::text, ',' ORDER BY x)
       FROM public.personas_con_proximo_paso(ARRAY[pg_temp.id('us', 1), pg_temp.id('us', 4),
                                                  pg_temp.id('us', 5), pg_temp.id('us', 7), NULL]) x$q$,
  pg_temp.id('us', 1)::text || ',' || pg_temp.id('us', 4)::text);

-- ── c. refused ───────────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('c: an unrelated person cannot mark',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 5), true)$q$,
  '42501', 'No tienes permiso para marcar Próximo Paso de esta persona.');
SELECT pg_temp.assert_raises('c: an unrelated person cannot unmark',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 1), false)$q$,
  '42501', 'No tienes permiso para marcar Próximo Paso de esta persona.');
SELECT pg_temp.assert_raises('c: nobody marks themself without authority',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 3), true)$q$, '42501');
SELECT pg_temp.assert_eq('c: an unrelated caller gets NULL from hizo_proximo_paso',
  $q$SELECT coalesce(public.hizo_proximo_paso(pg_temp.id('us', 1))::text, 'null')$q$, 'null');
SELECT pg_temp.assert_eq('c: an unrelated caller reads no rows',
  $q$SELECT count(*)::text FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 1)$q$, '0');
SELECT pg_temp.assert_eq('c: an unrelated caller gets no ids in bulk',
  $q$SELECT count(*)::text FROM public.personas_con_proximo_paso(ARRAY[pg_temp.id('us', 1), pg_temp.id('us', 4)])$q$, '0');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: the director cannot mark someone outside the area',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 5), true)$q$, '42501');
SELECT pg_temp.assert_raises('c: the director cannot mark a retirado',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 10), true)$q$, '42501');

-- ── f. no direct writes; validation ─────────────────────────────────

SELECT pg_temp.assert_raises('f: no direct insert',
  $q$INSERT INTO public.personas_proximo_paso (usuario_id) VALUES (pg_temp.id('us', 7))$q$, '42501');
SELECT pg_temp.assert_raises('f: no direct delete',
  $q$DELETE FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 1)$q$, '42501');
SELECT pg_temp.assert_raises('f: p_hecho null is refused',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 7), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('f: a nota over 500 characters is refused',
  $q$SELECT public.marcar_proximo_paso(pg_temp.id('us', 7), true, repeat('a', 501))$q$, '22023');

-- ── d. other markers; e. unmark keeps certificates ───────────────────

SELECT pg_temp.assert_eq('d: the director marks en_orientacion',
  $q$SELECT r->>'hecho' FROM public.marcar_proximo_paso(pg_temp.id('us', 7), true) r$q$, 'true');
SELECT pg_temp.assert_eq('d: the director unmarks',
  $q$SELECT concat_ws('|', r->>'hecho', r->>'marcado') FROM public.marcar_proximo_paso(pg_temp.id('us', 7), false) r$q$,
  'false|false');
SELECT pg_temp.assert_eq('e: unmarking a person with a certificate leaves them done',
  $q$SELECT concat_ws('|', r->>'hecho', r->>'marcado', r->>'por_certificado')
       FROM public.marcar_proximo_paso(pg_temp.id('us', 4), false) r$q$,
  'true|false|true');

SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('d: a coordinator of the area marks',
  $q$SELECT r->>'hecho' FROM public.marcar_proximo_paso(pg_temp.id('us', 7), true) r$q$, 'true');

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('d: authority over the Próximo Paso node marks anyone',
  $q$SELECT r->>'hecho' FROM public.marcar_proximo_paso(pg_temp.id('us', 5), true) r$q$, 'true');
SELECT pg_temp.assert_eq('d: authority over the Próximo Paso node reads the row',
  $q$SELECT count(*)::text FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 5)$q$, '1');
SELECT pg_temp.assert_eq('d: and unmarks',
  $q$SELECT r->>'hecho' FROM public.marcar_proximo_paso(pg_temp.id('us', 5), false) r$q$, 'false');

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('d: an admin marks a person with no servicio',
  $q$SELECT r->>'hecho' FROM public.marcar_proximo_paso(pg_temp.id('us', 3), true) r$q$, 'true');
SELECT pg_temp.assert_raises('f: an unknown person is refused',
  $q$SELECT public.marcar_proximo_paso(gen_random_uuid(), true)$q$, 'P0002');

RESET ROLE;

SELECT pg_temp.assert_eq('c/e: the stored marks are exactly the allowed ones',
  $q$SELECT string_agg(u.apellido || ':' || coalesce(m.nota, '-'), ',' ORDER BY u.apellido)
       FROM public.personas_proximo_paso m JOIN public.usuarios u ON u.id = m.usuario_id
      WHERE u.id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 10) n)$q$,
  'U1:Vino en octubre,U3:-,U7:-');
SELECT pg_temp.assert_eq('c: the refused calls left no mark on 5 or 10 and 1 unchanged',
  $q$SELECT concat_ws('|',
       (SELECT count(*) FROM public.personas_proximo_paso WHERE usuario_id IN (pg_temp.id('us', 5), pg_temp.id('us', 10))),
       (SELECT marcado_por = pg_temp.id('us', 2) FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 1)))$q$,
  '0|t');
SELECT pg_temp.assert_eq('e: no certificate was deleted or revoked',
  $q$SELECT string_agg(id::text || '=' || (revocado_at IS NULL)::text, ',' ORDER BY id)
       FROM public.taller_certificados WHERE id IN (pg_temp.id('ce', 1), pg_temp.id('ce', 2), pg_temp.id('ce', 3))$q$,
  pg_temp.id('ce', 1)::text || '=true,' || pg_temp.id('ce', 2)::text || '=false,' || pg_temp.id('ce', 3)::text || '=true');
SELECT pg_temp.assert_eq('a: the coordinator''s mark records the coordinator',
  $q$SELECT (marcado_por = pg_temp.id('us', 9))::text FROM public.personas_proximo_paso WHERE usuario_id = pg_temp.id('us', 7)$q$,
  'true');

-- ── f. grants and attributes ─────────────────────────────────────────

SELECT pg_temp.assert_eq('f: anon cannot execute the functions',
  $q$SELECT concat_ws('|',
       has_function_privilege('anon', 'public.hizo_proximo_paso(uuid)', 'EXECUTE'),
       has_function_privilege('anon', 'public.personas_con_proximo_paso(uuid[])', 'EXECUTE'),
       has_function_privilege('anon', 'public.marcar_proximo_paso(uuid, boolean, text)', 'EXECUTE'),
       has_function_privilege('anon', 'public.proximo_paso_puede_marcar(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.proximo_paso_hecho(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.proximo_paso_nodo()', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.hizo_proximo_paso(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.marcar_proximo_paso(uuid, boolean, text)', 'EXECUTE'))$q$,
  'f|f|f|f|f|f|t|t');
SELECT pg_temp.assert_eq('f: anon reads nothing and authenticated only selects',
  $q$SELECT concat_ws('|',
       has_table_privilege('anon', 'public.personas_proximo_paso', 'SELECT'),
       has_table_privilege('authenticated', 'public.personas_proximo_paso', 'SELECT'),
       has_table_privilege('authenticated', 'public.personas_proximo_paso', 'INSERT'),
       has_table_privilege('authenticated', 'public.personas_proximo_paso', 'UPDATE'),
       has_table_privilege('authenticated', 'public.personas_proximo_paso', 'DELETE'),
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.personas_proximo_paso'::regclass))$q$,
  'f|t|f|f|f|t');
SELECT pg_temp.assert_eq('f: every function is definer with an empty search_path',
  $q$SELECT string_agg(p.proname || '=' || p.prosecdef || ':' || array_to_string(p.proconfig, ','), ' ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('hizo_proximo_paso', 'personas_con_proximo_paso', 'marcar_proximo_paso')$q$,
  'hizo_proximo_paso=true:search_path="" marcar_proximo_paso=true:search_path="" personas_con_proximo_paso=true:search_path=""');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_pp_failures;

ROLLBACK;
