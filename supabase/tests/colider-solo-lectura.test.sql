-- T5 (odd/tasks/home-por-rol.md, S6) — the Colíder is read-only
-- (20261110120000_colider_solo_lectura.sql).
--
-- Covers:
--   a. A Colíder: es_lider_de_grupo is false for their group,
--      invitacion_cuenta_puede_invitar is false for a groupmate, es_lider_usuario
--      is false for a groupmate (their own photo stays true).
--   b. A Líder still gets true on all three.
--   (Storage uploads are not asserted: staging has no profile-photos policy
--   on storage.objects, so es_lider_usuario gates nothing there today.)
--   c. Reads unchanged for the Colíder: puede_ver_grupo of the group and
--      puede_ver_usuario of a groupmate stay true.
--   d. puede_editar_grupo stays false for the Colíder and true for the Líder.
--   e. Catalog: the three functions keep SECURITY DEFINER, their search_path,
--      anon cannot execute them and authenticated can.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT of
-- the failing cases ('ALL OK' when none). Before the migration the Colíder
-- cases of (a) fail (RED); after it everything passes.
--
-- Identities (usuario n = auth n): 1 LIDER (Líder of G, system role lider);
-- 2 COLIDER (Colíder of G, system role lider); 3 MIEMBRO (Miembro of G, system
-- role miembro); 4 OUTSIDER (no group).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cl_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cl_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9300000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9301' WHEN 'us' THEN '9302' WHEN 'gr' THEN '9303'
                       WHEN 'se' THEN '9304' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('request.jwt.claims',
                    json_build_object('sub', pg_temp.id('au', p_n), 'role', 'authenticated')::text, true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

SELECT pg_temp.fail('setup', 'no active temporada on this database')
 WHERE NOT EXISTS (SELECT 1 FROM public.temporadas WHERE activa);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cl-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cl', 'U' || n, 'cl-' || n || '@example.test', 'No especificado', 'Otro'
  FROM generate_series(1, 4) AS n;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', x.n), rs.id
  FROM (VALUES (1, 'lider'), (2, 'lider'), (3, 'miembro'), (4, 'miembro')) AS x(n, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = x.rol;

INSERT INTO public.segmentos (id, nombre) VALUES (pg_temp.id('se', 1), 'ZZ Cl S1');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo)
VALUES (pg_temp.id('gr', 1), 'ZZ Cl G1', (SELECT id FROM public.temporadas WHERE activa ORDER BY id LIMIT 1),
        pg_temp.id('se', 1), true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 1), 'Líder',   'activo', NULL),
  (pg_temp.id('gr', 1), pg_temp.id('us', 2), 'Colíder', 'activo', NULL),
  (pg_temp.id('gr', 1), pg_temp.id('us', 3), 'Miembro', 'activo', NULL);

GRANT INSERT, SELECT ON t_cl_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a, c, d. the Colíder ─────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('a: a Colíder is not es_lider_de_grupo of their group',
  $q$SELECT public.es_lider_de_grupo(pg_temp.id('us', 2), pg_temp.id('gr', 1))::text$q$, 'false');
SELECT pg_temp.assert_eq('a: a Colíder cannot invite a groupmate to create an account',
  $q$SELECT public.invitacion_cuenta_puede_invitar(pg_temp.id('us', 3))::text$q$, 'false');
SELECT pg_temp.assert_eq('a: es_lider_usuario is false for a Colíder about a groupmate',
  $q$SELECT public.es_lider_usuario(pg_temp.id('us', 3))::text$q$, 'false');
SELECT pg_temp.assert_eq('a: es_lider_usuario stays true for the Colíder''s own photo',
  $q$SELECT public.es_lider_usuario(pg_temp.id('us', 2))::text$q$, 'true');
SELECT pg_temp.assert_eq('c: a Colíder still sees their group (puede_ver_grupo)',
  $q$SELECT public.puede_ver_grupo(pg_temp.id('us', 2), pg_temp.id('gr', 1))::text$q$, 'true');
SELECT pg_temp.assert_eq('c: a Colíder still sees a groupmate (puede_ver_usuario)',
  $q$SELECT public.puede_ver_usuario(pg_temp.id('us', 2), pg_temp.id('us', 3))::text$q$, 'true');
SELECT pg_temp.assert_eq('d: a Colíder cannot edit the group (puede_editar_grupo)',
  $q$SELECT public.puede_editar_grupo(pg_temp.id('au', 2), pg_temp.id('gr', 1))::text$q$, 'false');

-- ── b, d. the Líder ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: a Líder is es_lider_de_grupo of their group',
  $q$SELECT public.es_lider_de_grupo(pg_temp.id('us', 1), pg_temp.id('gr', 1))::text$q$, 'true');
SELECT pg_temp.assert_eq('b: a Líder may invite a groupmate to create an account',
  $q$SELECT public.invitacion_cuenta_puede_invitar(pg_temp.id('us', 3))::text$q$, 'true');
SELECT pg_temp.assert_eq('b: es_lider_usuario is true for a Líder about a groupmate',
  $q$SELECT public.es_lider_usuario(pg_temp.id('us', 3))::text$q$, 'true');
SELECT pg_temp.assert_eq('b: a Líder is not es_lider_usuario of someone outside the group',
  $q$SELECT public.es_lider_usuario(pg_temp.id('us', 4))::text$q$, 'false');
SELECT pg_temp.assert_eq('d: a Líder may edit the group (puede_editar_grupo)',
  $q$SELECT public.puede_editar_grupo(pg_temp.id('au', 1), pg_temp.id('gr', 1))::text$q$, 'true');

-- A Miembro was never a leader and stays so.
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('a: es_lider_usuario is false for a Miembro about the Líder',
  $q$SELECT public.es_lider_usuario(pg_temp.id('us', 1))::text$q$, 'false');
SELECT pg_temp.assert_eq('a: a Miembro cannot invite the Colíder',
  $q$SELECT public.invitacion_cuenta_puede_invitar(pg_temp.id('us', 2))::text$q$, 'false');

RESET ROLE;

-- ── e. catalog ───────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('e: the three functions keep definer and their search_path',
  $q$SELECT string_agg(p.proname || '=' || p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ','), '-')
                       || ':' || p.provolatile::text, ' ' ORDER BY p.proname)
       FROM pg_proc p
      WHERE p.oid IN ('public.es_lider_de_grupo(uuid, uuid)'::regprocedure,
                      'public.es_lider_usuario(uuid)'::regprocedure,
                      'public.invitacion_cuenta_puede_invitar(uuid)'::regprocedure)$q$,
  'es_lider_de_grupo=true:search_path=public:v es_lider_usuario=true:-:v invitacion_cuenta_puede_invitar=true:search_path="":s');
SELECT pg_temp.assert_eq('e: anon cannot execute them and authenticated can',
  $q$SELECT concat_ws('|',
       has_function_privilege('anon', 'public.es_lider_de_grupo(uuid, uuid)', 'EXECUTE'),
       has_function_privilege('anon', 'public.es_lider_usuario(uuid)', 'EXECUTE'),
       has_function_privilege('anon', 'public.invitacion_cuenta_puede_invitar(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.es_lider_de_grupo(uuid, uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.es_lider_usuario(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.invitacion_cuenta_puede_invitar(uuid)', 'EXECUTE'))$q$,
  'f|f|f|t|t|t');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cl_failures;

ROLLBACK;
