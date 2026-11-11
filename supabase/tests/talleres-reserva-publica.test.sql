-- T5a (odd/tasks/talleres-reserva-publica.md) — RED→GREEN for
-- 20261110130000_talleres_reserva_publica.sql: talleres.publico and
-- genero_requerido, taller_ediciones.lugar, invitaciones_acceso origen
-- taller_publico, the three service-only tables and avisos_persona with
-- its owner-only RLS, mis_avisos() and aviso_marcar_leido(uuid). Run
-- against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture
-- ids live under the cf200000-... namespace, cédulas start with 99820 and
-- emails end in @example.test.
--
-- Fixtures: taller T cf2…10 (individual), edición E cf2…90 (cohorte
--   cf2…c0). U1 a1 → 41 and U2 a2 → 42 (accounts), N 51 (no account).
-- Avisos: A1 cf2…61 (U1, live), A1x cf2…62 (U1, expired), A2 cf2…63 (U2).
--
-- Covered:
--   1. Columns, their defaults and CHECKs (no taller is made publico).
--   2. invitaciones_acceso accepts origen taller_publico and nothing else new.
--   3. reserva_publica_limites, taller_reserva_codigos, taller_avisame_lugar:
--      RLS on, no privilege for anon or authenticated, hash CHECKs, the
--      case-insensitive (edicion, email) unique index.
--   4. avisos_persona: RLS on; authenticated may SELECT and UPDATE only
--      leido_at; anon nothing; the RPCs run as the caller.
--   5. Owner-only: each user sees only their non-expired notices, through
--      the table and mis_avisos(); another user can neither read nor mark
--      them; aviso_marcar_leido is single-shot; no other column changes.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rp_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_rp_cases (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_rp_failures, t_rp_cases TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_rp_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(p_case text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_rp_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_rp_cases VALUES (p_case);
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
    IF v_n IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.run(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_rp_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Runs p_sql (one text value) and compares it with p_expected.
CREATE OR REPLACE FUNCTION pg_temp.expect(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  INSERT INTO t_rp_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    IF v IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_total int;
  v_msg text;
BEGIN
  SELECT count(*) INTO v_total FROM t_rp_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_rp_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s) of %:\n%', v_n, v_total, v_msg;
  END IF;
  RETURN 'all ' || v_total || ' cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('cf200000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ RP Nodo', NULL, true);
INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf200000-0000-4000-8000-000000000010', 'zz-rp-individual', 'ZZ RP Individual', 'cf200000-0000-4000-8000-000000000001', 'individual', NULL, 'cadencia', 7, 0);
INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('cf200000-0000-4000-8000-000000000080', 'workshop', 'active', 'ZZ RP Evento', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb);
INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('cf200000-0000-4000-8000-000000000090', 'cf200000-0000-4000-8000-000000000080', 'cf200000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ RP E', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('cf200000-0000-4000-8000-0000000000a' || n)::uuid, 'authenticated', 'authenticated', 'cf2-u' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, cedula, estado_civil, genero) VALUES
  ('cf200000-0000-4000-8000-000000000041', 'cf200000-0000-4000-8000-0000000000a1', 'ZZRP', 'U1', 'cf2-u1@example.test', '99820001', 'Soltero', 'Femenino'),
  ('cf200000-0000-4000-8000-000000000042', 'cf200000-0000-4000-8000-0000000000a2', 'ZZRP', 'U2', 'cf2-u2@example.test', '99820002', 'Soltero', 'Masculino'),
  ('cf200000-0000-4000-8000-000000000051', NULL, 'ZZRP', 'N', NULL, '99820003', 'Soltero', 'Masculino');

-- ══ 1. Columns ══

SELECT pg_temp.assert_rows('1: talleres.publico boolean NOT NULL DEFAULT false, genero_requerido enum_genero NULL, lugar text NULL',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND ((table_name = 'talleres' AND column_name = 'publico' AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false')
         OR (table_name = 'talleres' AND column_name = 'genero_requerido' AND udt_name = 'enum_genero' AND is_nullable = 'YES' AND column_default IS NULL)
         OR (table_name = 'taller_ediciones' AND column_name = 'lugar' AND data_type = 'text' AND is_nullable = 'YES'))$$, 3);
SELECT pg_temp.assert_rows('1: a new taller is not publico',
  $$SELECT 1 FROM public.talleres WHERE id = 'cf200000-0000-4000-8000-000000000010' AND NOT publico AND genero_requerido IS NULL$$, 1);
SELECT pg_temp.assert_sqlstate('1: genero_requerido refuses Otro',
  $$UPDATE public.talleres SET genero_requerido = 'Otro' WHERE id = 'cf200000-0000-4000-8000-000000000010'$$, '23514');
SELECT pg_temp.expect('1: genero_requerido accepts Femenino',
  $$WITH x AS (UPDATE public.talleres SET genero_requerido = 'Femenino' WHERE id = 'cf200000-0000-4000-8000-000000000010' RETURNING 1)
    SELECT count(*)::text FROM x$$, '1');
SELECT pg_temp.assert_sqlstate('1: lugar refuses an empty text',
  $$UPDATE public.taller_ediciones SET lugar = '' WHERE id = 'cf200000-0000-4000-8000-000000000090'$$, '23514');

-- ══ 2. invitaciones_acceso.origen ══

SELECT pg_temp.expect('2: origen taller_publico is accepted',
  $$WITH x AS (INSERT INTO public.invitaciones_acceso (usuario_id, origen, edicion_id)
     VALUES ('cf200000-0000-4000-8000-000000000051', 'taller_publico', 'cf200000-0000-4000-8000-000000000090') RETURNING 1)
    SELECT count(*)::text FROM x$$, '1');
SELECT pg_temp.assert_sqlstate('2: any other origen is refused',
  $$UPDATE public.invitaciones_acceso SET origen = 'otro' WHERE usuario_id = 'cf200000-0000-4000-8000-000000000051'$$, '23514');

-- ══ 3. Service-only tables ══

SELECT pg_temp.assert_rows('3: the three tables have RLS on and no privilege for anon or authenticated',
  $$SELECT 1 FROM pg_class c
     WHERE c.oid IN (to_regclass('public.reserva_publica_limites'), to_regclass('public.taller_reserva_codigos'),
                     to_regclass('public.taller_avisame_lugar'))
       AND c.relrowsecurity
       AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')$$, 3);
SELECT pg_temp.assert_sqlstate('3: a limit row needs a 64-hex ip_hash',
  $$INSERT INTO public.reserva_publica_limites (ip_hash, accion) VALUES ('1.2.3.4', 'reserva_crear')$$, '23514');
SELECT pg_temp.assert_sqlstate('3: a limit key is a hash, never a raw cédula',
  $$INSERT INTO public.reserva_publica_limites (ip_hash, accion, clave) VALUES (repeat('a', 64), 'reserva_crear', '99820001')$$, '23514');
SELECT pg_temp.assert_sqlstate('3: a code is stored only as a 64-hex hash',
  $$INSERT INTO public.taller_reserva_codigos (usuario_id, edicion_id, codigo_hash, ip_hash)
     VALUES ('cf200000-0000-4000-8000-000000000041', 'cf200000-0000-4000-8000-000000000090', '123456', repeat('a', 64))$$, '23514');
SELECT pg_temp.expect('3: a code row defaults to 10 minutes, 0 attempts, not blocked, no token',
  $$WITH x AS (INSERT INTO public.taller_reserva_codigos (usuario_id, edicion_id, codigo_hash, ip_hash)
     VALUES ('cf200000-0000-4000-8000-000000000041', 'cf200000-0000-4000-8000-000000000090', repeat('c', 64), repeat('a', 64))
     RETURNING expira_en = now() + interval '10 minutes' AND intentos = 0 AND NOT bloqueado AND token_hash IS NULL AS ok)
    SELECT bool_and(ok)::text FROM x$$, 'true');
SELECT pg_temp.run('3: a first avísame row',
  $$INSERT INTO public.taller_avisame_lugar (edicion_id, nombre, email, ip_hash)
    VALUES ('cf200000-0000-4000-8000-000000000090', 'Ana', 'cf2-ana@example.test', repeat('a', 64))$$);
SELECT pg_temp.assert_sqlstate('3: avisame is unique per edición and email in any case',
  $$INSERT INTO public.taller_avisame_lugar (edicion_id, nombre, email, ip_hash)
     VALUES ('cf200000-0000-4000-8000-000000000090', 'Ana', 'CF2-Ana@Example.test', repeat('b', 64))$$, '23505');

-- ══ 4. avisos_persona grants ══

SELECT pg_temp.assert_rows('4: avisos_persona RLS on; authenticated SELECT and UPDATE(leido_at) only; anon nothing',
  $$SELECT 1 FROM pg_class c
     WHERE c.oid = to_regclass('public.avisos_persona') AND c.relrowsecurity
       AND has_table_privilege('authenticated', c.oid, 'SELECT')
       AND NOT has_table_privilege('authenticated', c.oid, 'INSERT,DELETE,TRUNCATE')
       AND NOT has_table_privilege('authenticated', c.oid, 'UPDATE')
       AND has_column_privilege('authenticated', c.oid, 'leido_at', 'UPDATE')
       AND NOT has_column_privilege('authenticated', c.oid, 'titulo', 'UPDATE')
       AND NOT has_column_privilege('authenticated', c.oid, 'persona_id', 'UPDATE')
       AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')$$, 1);
SELECT pg_temp.assert_rows('4: mis_avisos and aviso_marcar_leido run as the caller, for authenticated only',
  $$SELECT 1 FROM pg_proc p
     WHERE p.oid IN (to_regprocedure('public.mis_avisos()'), to_regprocedure('public.aviso_marcar_leido(uuid)'))
       AND NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
       AND has_function_privilege('authenticated', p.oid, 'execute')
       AND NOT has_function_privilege('anon', p.oid, 'execute')$$, 2);

-- ══ 5. Owner-only notices ══

SELECT pg_temp.run('5: three notices',
  $$INSERT INTO public.avisos_persona (id, persona_id, tipo, titulo, cuerpo, expira_at) VALUES
  ('cf200000-0000-4000-8000-000000000061', 'cf200000-0000-4000-8000-000000000041', 'codigo_reserva', 'Tu código', 'Código 123456', now() + interval '10 minutes'),
  ('cf200000-0000-4000-8000-000000000062', 'cf200000-0000-4000-8000-000000000041', 'codigo_reserva', 'Tu código', 'Código 654321', now() - interval '1 second'),
  ('cf200000-0000-4000-8000-000000000063', 'cf200000-0000-4000-8000-000000000042', 'general', 'Hola', NULL, NULL)$$);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf200000-0000-4000-8000-0000000000a2');
SELECT pg_temp.expect('5: U2 sees only their own notice in the table',
  $$SELECT string_agg(id::text, ',') FROM public.avisos_persona WHERE persona_id IN
     ('cf200000-0000-4000-8000-000000000041', 'cf200000-0000-4000-8000-000000000042')$$,
  'cf200000-0000-4000-8000-000000000063');
SELECT pg_temp.expect('5: U2 cannot mark U1''s notice', $$SELECT public.aviso_marcar_leido('cf200000-0000-4000-8000-000000000061')::text$$, 'false');
SELECT pg_temp.expect('5: a direct UPDATE of U1''s notice changes nothing',
  $$WITH x AS (UPDATE public.avisos_persona SET leido_at = now() WHERE id = 'cf200000-0000-4000-8000-000000000061' RETURNING 1)
    SELECT count(*)::text FROM x$$, '0');
SELECT pg_temp.as_persona('cf200000-0000-4000-8000-0000000000a1');
SELECT pg_temp.expect('5: U1 sees only the live notice through mis_avisos()',
  $$SELECT string_agg(id::text, ',') FROM public.mis_avisos()$$, 'cf200000-0000-4000-8000-000000000061');
SELECT pg_temp.expect('5: U1 does not see the expired one in the table either',
  $$SELECT count(*)::text FROM public.avisos_persona WHERE id = 'cf200000-0000-4000-8000-000000000062'$$, '0');
SELECT pg_temp.expect('5: U1 marks their notice read', $$SELECT public.aviso_marcar_leido('cf200000-0000-4000-8000-000000000061')::text$$, 'true');
SELECT pg_temp.expect('5: a second mark returns false', $$SELECT public.aviso_marcar_leido('cf200000-0000-4000-8000-000000000061')::text$$, 'false');
SELECT pg_temp.expect('5: the expired notice cannot be marked', $$SELECT public.aviso_marcar_leido('cf200000-0000-4000-8000-000000000062')::text$$, 'false');
SELECT pg_temp.assert_sqlstate('5: U1 cannot change another column',
  $$UPDATE public.avisos_persona SET titulo = 'x' WHERE id = 'cf200000-0000-4000-8000-000000000061'$$, '42501');
SELECT pg_temp.assert_sqlstate('5: U1 cannot insert a notice',
  $$INSERT INTO public.avisos_persona (persona_id, tipo, titulo) VALUES ('cf200000-0000-4000-8000-000000000041', 'general', 'x')$$, '42501');
RESET ROLE;
SELECT pg_temp.assert_rows('5: only U1''s live notice became read',
  $$SELECT 1 FROM public.avisos_persona WHERE leido_at IS NOT NULL AND id IN
     ('cf200000-0000-4000-8000-000000000061', 'cf200000-0000-4000-8000-000000000062', 'cf200000-0000-4000-8000-000000000063')$$, 1);

RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_sqlstate('5: anon cannot read avisos_persona', $$SELECT count(*) FROM public.avisos_persona$$, '42501');
SELECT pg_temp.assert_sqlstate('5: anon cannot call mis_avisos', $$SELECT count(*) FROM public.mis_avisos()$$, '42501');
RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
