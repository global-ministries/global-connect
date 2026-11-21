-- Personas: the search without accents and the possible-duplicates check
-- (odd/tasks/dream-team-estructura-correcciones.md, T4, S6a, S6b;
-- 20261121110000_personas_buscar_sin_acentos.sql).
--
-- Covers:
--   s. personas_buscar: accents and case are ignored ("zzdup jose", "ZZDUP
--      JOSÉ"); words in any order ("cordobaxx zzdup"); every word must match
--      (a word nobody has finds nothing); by cédula in any format
--      ("V-30.111.222", "30111222"); by phone digits ("0414-987.65.43",
--      "+58 414 987 6543", "9876543") and a word plus digits ("zzdup
--      987654"); by email; '%' is literal; fewer than 2 characters return
--      nothing; the limit is applied; the columns are only id, nombre,
--      apellido, email.
--   g. Gate: a caller without a Dream Team/Talleres writing grant and a
--      session without a persona get 42501; anon cannot execute.
--   p. personas_posibles_duplicados: by cédula, by teléfono, by the first
--      nombre word and first apellido word (accents and case ignored, any of
--      the person's apellidos); campus, servicios not retirado and
--      tiene_cuenta; no match is empty; a caller who may not register gets
--      42501; anon cannot execute.
--   l. Privileges: authenticated executes both RPCs, anon and PUBLIC do not;
--      the helper is service_role only; all are definer functions with an
--      empty search_path.
--
-- Run against STAGING as postgres inside a transaction that is discarded:
-- the last statement raises 'SUITE_RESULT: ALL OK' (or the failing cases),
-- which rolls everything back. The search helpers only report the suite's
-- own people (ids e5c10000-…), so other rows on staging never interfere.
--
-- Identities (usuario n = auth n): 1 BUSCADOR (dream_team.requirements.manage:
-- may search, may not register),
-- 2 NADIE (no grant, no role), 3 ADMIN (system admin role: may register).
-- People: 10 «ZZDúp José María» «Péñazzq Córdobaxx»; 11 «ZZDup Ana»
-- «Cedulaxx», cédula 30111222; 12 «ZZDup Pedro» «Telefonoxx», teléfono
-- 04149876543; 13 «ZZDup Correo» «Emailxx», email zz.dup.correo@example.test;
-- 14 «ZZDup Luis» «Mendozaqq», with an account (auth 14), principal campus
-- «ZZ Dup Campus», one active and one retired servicio.

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pb_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pb_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('e5c10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c101' WHEN 'us' THEN 'c102' WHEN 'ca' THEN 'c103'
                       WHEN 'eq' THEN 'c104' WHEN 'ro' THEN 'c105' WHEN 'se' THEN 'c106' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
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

-- The suite's people found by personas_buscar(q, limit), as "apellido" joined by ','.
CREATE OR REPLACE FUNCTION pg_temp.buscar(p_q text, p_limit int DEFAULT 20) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(b.apellido, ',' ORDER BY b.apellido), '')
    FROM public.personas_buscar(p_q, p_limit) b
   WHERE b.id::text LIKE 'e5c10000-%';
$$;

-- The suite's possible duplicates, as "apellido|campus|servicios|tiene_cuenta|coincide" joined by ','.
CREATE OR REPLACE FUNCTION pg_temp.duplicados(p_nombre text, p_apellido text, p_cedula text DEFAULT NULL, p_telefono text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws('|', d.apellido, coalesce(d.campus, '-'), d.servicios, d.tiene_cuenta,
                                       array_to_string(d.coincide, '+')), ',' ORDER BY d.apellido), '')
    FROM public.personas_posibles_duplicados(p_nombre, p_apellido, p_cedula, p_telefono) d
   WHERE d.id::text LIKE 'e5c10000-%';
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'zz-pb-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 2, 3, 14]) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Dup', 'Buscador', 'zz-pb-1@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Dup', 'Nadie', 'zz-pb-2@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 3), pg_temp.id('au', 3), 'ZZ Dup', 'Admin', 'zz-pb-3@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 10), 'ZZDúp José María', 'Péñazzq Córdobaxx', 'Soltero', 'Masculino');
INSERT INTO public.usuarios (id, nombre, apellido, cedula, estado_civil, genero)
VALUES (pg_temp.id('us', 11), 'ZZDup Ana', 'Cedulaxx', '30111222', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, telefono, estado_civil, genero)
VALUES (pg_temp.id('us', 12), 'ZZDup Pedro', 'Telefonoxx', '04149876543', 'Soltero', 'Masculino');
INSERT INTO public.usuarios (id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 13), 'ZZDup Correo', 'Emailxx', 'zz.dup.correo@example.test', 'Soltero', 'Otro');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 14), pg_temp.id('au', 14), 'ZZDup Luis', 'Mendozaqq', 'zz-pb-14@example.test', 'Casado', 'Masculino');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
VALUES (pg_temp.id('us', 1), 'dream_team.requirements.manage', 'dream_team', 'experience', NULL, 'zzdup-test');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 3), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Dup Campus', 'ZZDUPPB');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 14), pg_temp.id('ca', 1), true);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 3), pg_temp.id('ca', 1), true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
VALUES (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Dup Equipo', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
VALUES (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'zzdup voluntario', 'lider', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
VALUES (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'zzdup apoyo', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 1), pg_temp.id('us', 14), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
        timestamptz '2020-01-01 12:00+00', 'admin_asignacion');
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual)
VALUES (pg_temp.id('se', 2), pg_temp.id('us', 14), pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'retirado',
        timestamptz '2020-01-01 12:00+00', timestamptz '2021-01-01 12:00+00', 'admin_asignacion');

-- ── s. personas_buscar ───────────────────────────────────────────────

SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('s: accents are ignored ("zzdup jose" finds «ZZDúp José María»)',
  $q$SELECT pg_temp.buscar('zzdup jose')$q$, 'Péñazzq Córdobaxx');
SELECT pg_temp.assert_eq('s: case and accents in the query are ignored ("ZZDUP JOSÉ")',
  $q$SELECT pg_temp.buscar('ZZDUP JOSÉ')$q$, 'Péñazzq Córdobaxx');
SELECT pg_temp.assert_eq('s: accents in the stored apellido are ignored ("penazzq")',
  $q$SELECT pg_temp.buscar('penazzq')$q$, 'Péñazzq Córdobaxx');
SELECT pg_temp.assert_eq('s: words in any order ("cordobaxx zzdup")',
  $q$SELECT pg_temp.buscar('cordobaxx zzdup')$q$, 'Péñazzq Córdobaxx');
SELECT pg_temp.assert_eq('s: every word must match ("zzdup nadiexyz" finds nobody)',
  $q$SELECT pg_temp.buscar('zzdup nadiexyz')$q$, '');
SELECT pg_temp.assert_eq('s: cédula in another format ("V-30.111.222")',
  $q$SELECT pg_temp.buscar('V-30.111.222')$q$, 'Cedulaxx');
SELECT pg_temp.assert_eq('s: cédula digits ("30111222")',
  $q$SELECT pg_temp.buscar('30111222')$q$, 'Cedulaxx');
SELECT pg_temp.assert_eq('s: phone with punctuation ("0414-987.65.43")',
  $q$SELECT pg_temp.buscar('0414-987.65.43')$q$, 'Telefonoxx');
SELECT pg_temp.assert_eq('s: phone with the country code ("+58 414 987 6543")',
  $q$SELECT pg_temp.buscar('+58 414 987 6543')$q$, 'Telefonoxx');
SELECT pg_temp.assert_eq('s: part of the phone digits ("9876543")',
  $q$SELECT pg_temp.buscar('9876543')$q$, 'Telefonoxx');
SELECT pg_temp.assert_eq('s: a word plus phone digits ("zzdup 987654")',
  $q$SELECT pg_temp.buscar('zzdup 987654')$q$, 'Telefonoxx');
SELECT pg_temp.assert_eq('s: email ("dup.correo")',
  $q$SELECT pg_temp.buscar('dup.correo')$q$, 'Emailxx');
SELECT pg_temp.assert_eq('s: "%" is literal ("zzdup%pedro" finds nobody)',
  $q$SELECT pg_temp.buscar('zzdup%pedro')$q$, '');
SELECT pg_temp.assert_eq('s: fewer than 2 characters return nothing',
  $q$SELECT count(*)::text FROM public.personas_buscar(' z ', 20)$q$, '0');
SELECT pg_temp.assert_eq('s: the limit is applied (five suite people match "zzdup", limit 1)',
  $q$SELECT count(*)::text FROM public.personas_buscar('zzdup', 1)$q$, '1');
SELECT pg_temp.assert_eq('s: every suite person whose nombre has "zzdup"',
  $q$SELECT pg_temp.buscar('zzdup')$q$, 'Cedulaxx,Emailxx,Mendozaqq,Péñazzq Córdobaxx,Telefonoxx');
SELECT pg_temp.assert_eq('s: only id, nombre, apellido, email are returned',
  $q$SELECT array_to_string(p.proargnames[3:], ',') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'personas_buscar'$q$,
  'id,nombre,apellido,email');

-- ── g. gate of personas_buscar ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('g: a caller without a writing grant gets 42501',
  $q$SELECT pg_temp.buscar('zzdup jose')$q$, '42501', 'sin_autoridad_para_buscar');
SELECT pg_temp.as_nadie();
SELECT pg_temp.assert_raises('g: a session without a persona gets 42501',
  $q$SELECT pg_temp.buscar('zzdup jose')$q$, '42501', 'sin_autoridad_para_buscar');

-- ── p. personas_posibles_duplicados ──────────────────────────────────

SELECT pg_temp.as_persona(3);

SELECT pg_temp.assert_eq('p: by cédula in another format',
  $q$SELECT pg_temp.duplicados('Otra', 'Persona', 'V-30.111.222', NULL)$q$, 'Cedulaxx|-|0|f|cedula');
SELECT pg_temp.assert_eq('p: by teléfono in another format',
  $q$SELECT pg_temp.duplicados('Otra', 'Persona', NULL, '0414 987 6543')$q$, 'Telefonoxx|-|0|f|telefono');
SELECT pg_temp.assert_eq('p: by first nombre and first apellido, accents and case ignored',
  $q$SELECT pg_temp.duplicados('zzdup', 'PEÑAZZQ')$q$, 'Péñazzq Córdobaxx|-|0|f|nombre');
SELECT pg_temp.assert_eq('p: the typed first apellido may be the person''s second one',
  $q$SELECT pg_temp.duplicados('Zzdúp José', 'Córdobaxx')$q$, 'Péñazzq Córdobaxx|-|0|f|nombre');
SELECT pg_temp.assert_eq('p: campus, servicios not retirado and tiene_cuenta',
  $q$SELECT pg_temp.duplicados('ZZDup Luis', 'Mendozaqq')$q$, 'Mendozaqq|ZZ Dup Campus|1|t|nombre');
SELECT pg_temp.assert_eq('p: several reasons are listed together',
  $q$SELECT pg_temp.duplicados('Zzdup', 'Cedulaxx', '30111222', NULL)$q$, 'Cedulaxx|-|0|f|cedula+nombre');
SELECT pg_temp.assert_eq('p: nobody matches',
  $q$SELECT pg_temp.duplicados('zzdup', 'nadiexyz', '1', '123')$q$, '');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('p: a caller who may search but not register gets 42501',
  $q$SELECT pg_temp.duplicados('zzdup', 'PEÑAZZQ')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('p: a caller with nothing gets 42501',
  $q$SELECT pg_temp.duplicados('zzdup', 'PEÑAZZQ')$q$, '42501', 'sin_autoridad');

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes both RPCs, anon and PUBLIC do not; the helper is internal',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('public', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('service_role', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('personas_buscar', 'personas_buscar_coincidencias', 'personas_posibles_duplicados')$q$,
  'personas_buscar:true:false:false:true,personas_buscar_coincidencias:false:false:false:true,personas_posibles_duplicados:true:false:false:true');
SELECT pg_temp.assert_eq('l: all are definer functions with an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('personas_buscar', 'personas_buscar_coincidencias', 'personas_posibles_duplicados')$q$,
  'personas_buscar:true,personas_buscar_coincidencias:true,personas_posibles_duplicados:true');

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
SELECT pg_temp.assert_raises('l: anon cannot execute personas_buscar',
  $q$SELECT count(*) FROM public.personas_buscar('zzdup jose', 20)$q$, '42501');
SELECT pg_temp.assert_raises('l: anon cannot execute personas_posibles_duplicados',
  $q$SELECT count(*) FROM public.personas_posibles_duplicados('zzdup', 'penazzq', NULL, NULL)$q$, '42501');
RESET ROLE;

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_pb_failures);
END;
$$;
