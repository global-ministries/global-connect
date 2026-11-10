-- T5a (odd/tasks/talleres-reserva-publica.md) — RED→GREEN for
-- 20261110140000_talleres_reserva_publica_rpc.sql: the public catalog, the
-- identify/code/resend steps, talleres_reserva_crear, avísame and the
-- taller_publico invitation. Run against STAGING inside BEGIN…ROLLBACK
-- AFTER 20261110120000 and 20261110130000 — nothing here is kept; fixture
-- ids live under the cf300000-... namespace, cédulas start with 99830 and
-- emails end in @example.test. Calls run as postgres (the service_role
-- path); grants are checked with has_function_privilege and role switches.
--
-- Talleres (publico unless noted): T_pub cf3…10 (individual), T_muj cf3…11
--   (individual, genero_requerido Femenino), T_par cf3…12 (pareja,
--   matrimonio), T_priv cf3…13 (individual, publico false).
-- Ediciones: E_pub 90 (T_pub, lugar Sede Norte), E_muj 91, E_par 92,
--   E_priv 93, E_cerr 94 (T_pub, cierre passed), E_lleno 95 (T_pub, one
--   grupo of capacidad 1 taken by F); cohorte cf3…c<n> for cf3…9<n>.
-- Persons: X1 41 (account a1, 'Ana María', Femenino, email), X2 42
--   (Masculino, no email), X3 43 (Masculino, email), X4 44 (Femenino, no
--   email), MN 45 (minor), X5 47 ('Luis', email), U2 46 (account a2), F 59.
-- h(text) = SHA-256 hex: every ip, code and token hash below.
--
-- Covered (one block per rule): 1 grants; 2 catalog; 3 identify (cerrada,
--   invalid cédula, nuevo, sin_correo, codigo + owner-only in-app notice,
--   ip and cédula limits, a new code blocks the old one); 4 verify
--   (wrong, ok, single use, vencido, 5 attempts block); 5 resend (spacing,
--   3 max, old code dead); 6 crear (token single use and expiry, ya
--   inscrito, por_verificar, ficha nueva + taller_publico invitation,
--   neutral refusals, genero_requerido, cerrada, cupo lleno, pareja
--   modes, ip limit, existing fichas unchanged, always pendiente/publico);
--   7 avísame dedupe.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_rr_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_rr (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON t_rr_failures, t_rr_cases, t_rr TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_rr_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(p_case text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_rr_cases VALUES (p_case);
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
  INSERT INTO t_rr_cases VALUES (p_case);
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
  INSERT INTO t_rr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Runs p_sql (one jsonb value), keeps it under p_key and, when p_expected
-- is given, compares it.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text, p_expected jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  INSERT INTO t_rr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_rr (key, j) VALUES (p_key, v) ON CONFLICT (key) DO UPDATE SET j = EXCLUDED.j;
    IF p_expected IS NOT NULL AND v IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected::text || ', got ' || coalesce(v::text, 'NULL'));
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
  SELECT count(*) INTO v_total FROM t_rr_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_rr_failures;
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
  ('cf300000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ RP3 Nodo', NULL, true),
  ('cf300000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ RP3 Nodo Muj', 'cf300000-0000-4000-8000-000000000001', true),
  ('cf300000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ RP3 Nodo Par', 'cf300000-0000-4000-8000-000000000001', true),
  ('cf300000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ RP3 Nodo Priv', 'cf300000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf300000-0000-4000-8000-000000000010', 'zz-rp3-pub', 'ZZ RP3 Publico', 'cf300000-0000-4000-8000-000000000001', 'individual', NULL, 'cadencia', 7, 0),
  ('cf300000-0000-4000-8000-000000000011', 'zz-rp3-muj', 'ZZ RP3 Mujer', 'cf300000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, 0),
  ('cf300000-0000-4000-8000-000000000012', 'zz-rp3-par', 'ZZ RP3 Parejas', 'cf300000-0000-4000-8000-000000000003', 'pareja', 'matrimonio', 'cadencia', 7, 0),
  ('cf300000-0000-4000-8000-000000000013', 'zz-rp3-priv', 'ZZ RP3 Privado', 'cf300000-0000-4000-8000-000000000004', 'individual', NULL, 'cadencia', 7, 0);

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('cf300000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ RP3 Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 5) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
)
SELECT ('cf300000-0000-4000-8000-00000000009' || x.n)::uuid, ('cf300000-0000-4000-8000-00000000008' || x.n)::uuid, x.taller::uuid,
       x.tipo, x.link, 'permanente_custom', 'abierto', 'ZZ RP3 E' || x.n, 6, 90, 'permanente_custom',
       CURRENT_DATE + 30, CURRENT_DATE + x.cierre, CURRENT_DATE + 60
  FROM (VALUES
    (0, 'cf300000-0000-4000-8000-000000000010', 'individual', NULL, 20),
    (1, 'cf300000-0000-4000-8000-000000000011', 'individual', NULL, 20),
    (2, 'cf300000-0000-4000-8000-000000000012', 'pareja', 'matrimonio', 20),
    (3, 'cf300000-0000-4000-8000-000000000013', 'individual', NULL, 20),
    (4, 'cf300000-0000-4000-8000-000000000010', 'individual', NULL, -1),
    (5, 'cf300000-0000-4000-8000-000000000010', 'individual', NULL, 20)
  ) AS x(n, taller, tipo, link, cierre);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT ('cf300000-0000-4000-8000-0000000000c' || n)::uuid, ('cf300000-0000-4000-8000-00000000009' || n)::uuid,
       'cf300000-0000-4000-8000-000000000001', 'ZZ RP3 Cohorte ' || n, (CURRENT_DATE + 30)::timestamptz
  FROM generate_series(0, 5) AS n;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('cf300000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'cf3-x1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('cf300000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'cf3-u2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, cedula, fecha_nacimiento, estado_civil, genero) VALUES
  ('cf300000-0000-4000-8000-000000000041', 'cf300000-0000-4000-8000-0000000000a1', 'Ana María', 'ZZRP3 Uno', 'cf3-x1@example.test', '0414-0000001', '99830001', DATE '1985-03-04', 'Soltero', 'Femenino'),
  ('cf300000-0000-4000-8000-000000000042', NULL, 'Pedro', 'ZZRP3 Dos', NULL, NULL, '99830002', DATE '1980-01-01', 'Casado', 'Masculino'),
  ('cf300000-0000-4000-8000-000000000043', NULL, 'Juan', 'ZZRP3 Tres', 'cf3-x3@example.test', NULL, '99830003', DATE '1982-01-01', 'Casado', 'Masculino'),
  ('cf300000-0000-4000-8000-000000000044', NULL, 'Rosa', 'ZZRP3 Cuatro', NULL, NULL, '99830004', DATE '1983-01-01', 'Casado', 'Femenino'),
  ('cf300000-0000-4000-8000-000000000045', NULL, 'Nino', 'ZZRP3 Menor', 'cf3-mn@example.test', NULL, '99830005', CURRENT_DATE - 3650, 'Soltero', 'Masculino'),
  ('cf300000-0000-4000-8000-000000000046', 'cf300000-0000-4000-8000-0000000000a2', 'Otra', 'ZZRP3 U2', 'cf3-u2@example.test', NULL, NULL, NULL, 'Soltero', 'Femenino'),
  ('cf300000-0000-4000-8000-000000000047', NULL, 'Luis', 'ZZRP3 Cinco', 'cf3-x5@example.test', NULL, '99830007', DATE '1990-01-01', 'Soltero', 'Masculino'),
  ('cf300000-0000-4000-8000-000000000059', NULL, 'ZZRP3', 'F', NULL, NULL, NULL, NULL, 'Soltero', 'Otro');

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('cf300000-0000-4000-8000-000000000060', 'cf300000-0000-4000-8000-0000000000c5', 'ZZ RP3 Grupo Lleno', 1, 'activo');
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
  ('cf300000-0000-4000-8000-000000000061', 'cf300000-0000-4000-8000-000000000095', 'cf300000-0000-4000-8000-0000000000c5',
   'cf300000-0000-4000-8000-000000000059', 'pendiente');

SELECT pg_temp.run('0: mark the public talleres, genero_requerido and lugar',
  $$UPDATE public.talleres SET publico = true WHERE id IN ('cf300000-0000-4000-8000-000000000010',
      'cf300000-0000-4000-8000-000000000011', 'cf300000-0000-4000-8000-000000000012');
    UPDATE public.talleres SET genero_requerido = 'Femenino' WHERE id = 'cf300000-0000-4000-8000-000000000011';
    UPDATE public.taller_ediciones SET lugar = 'Sede Norte' WHERE id = 'cf300000-0000-4000-8000-000000000090'$$);

-- Fichas before any reservation (compared at the end).
CREATE TEMP TABLE t_rr_ficha ON COMMIT DROP AS
SELECT u.id, row_to_json(u)::text AS fila FROM public.usuarios u
 WHERE u.id IN ('cf300000-0000-4000-8000-000000000041', 'cf300000-0000-4000-8000-000000000042',
                'cf300000-0000-4000-8000-000000000043', 'cf300000-0000-4000-8000-000000000044');

-- ══ 1. Grants ══

CREATE TEMP TABLE t_rr_fn (sig text) ON COMMIT DROP;
INSERT INTO t_rr_fn VALUES
  ('public.reserva_publica_consumir(text,text,text,integer,interval,integer,interval,integer,interval)'),
  ('public.talleres_reserva_edicion_publica(uuid)'), ('public.talleres_reserva_email_mascara(text)'),
  ('public.talleres_reserva_ficha(jsonb,boolean)'), ('public.talleres_reserva_ficha_crear(jsonb,text)'),
  ('public.talleres_reserva_es_menor(uuid)'), ('public.talleres_reserva_avisos_retirar(uuid)'),
  ('public.talleres_reserva_codigo_envio(uuid,text)'), ('public.talleres_publico_taller_json(uuid)'),
  ('public.talleres_publico_catalogo()'), ('public.talleres_publico_taller(text)'),
  ('public.talleres_reserva_identificar(uuid,text,text,text,text)'),
  ('public.talleres_reserva_codigo_verificar(uuid,text,text,text)'),
  ('public.talleres_reserva_codigo_reenviar(uuid,text,text,text)'),
  ('public.talleres_reserva_crear(uuid,jsonb,text)'), ('public.talleres_avisame_lugar_agregar(uuid,text,text,text)');
GRANT SELECT ON t_rr_fn TO authenticated, anon;

SELECT pg_temp.assert_rows('1: all 16 exist with search_path=""; only service_role executes them, no PUBLIC entry',
  $$SELECT 1 FROM t_rr_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE p.proconfig @> ARRAY['search_path=""']
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND NOT has_function_privilege('authenticated', p.oid, 'execute')
       AND has_function_privilege('service_role', p.oid, 'execute')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)$$, 16);
SELECT pg_temp.assert_rows('1: all but the email mask are definers',
  $$SELECT 1 FROM t_rr_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig) WHERE p.prosecdef$$, 15);
SET LOCAL ROLE anon;
SELECT pg_temp.assert_sqlstate('1: anon cannot call talleres_reserva_crear',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090', '{}', repeat('a', 64))$$, '42501');
SELECT pg_temp.assert_sqlstate('1: anon cannot call the catalog',
  $$SELECT public.talleres_publico_catalogo()$$, '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf300000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_sqlstate('1: authenticated cannot call talleres_reserva_identificar',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830001', repeat('a', 64), repeat('b', 64))$$, '42501');
RESET ROLE;

-- ══ 2. Catalog ══

SELECT pg_temp.assert_rows('2: the catalog lists the three public talleres, not the private one',
  $$SELECT 1 FROM jsonb_array_elements(public.talleres_publico_catalogo()) e WHERE e ->> 'slug' LIKE 'zz-rp3-%'$$, 3);
SELECT pg_temp.capture('2: a private taller by slug is NULL', 'priv',
  $$SELECT coalesce(public.talleres_publico_taller('zz-rp3-priv'), '"null"'::jsonb)$$, '"null"');
SELECT pg_temp.capture('2: T_pub lists only its abierto ediciones (not the closed one)', 'pub_ids',
  $$SELECT jsonb_agg(e ->> 'id' ORDER BY e ->> 'id') FROM jsonb_array_elements(public.talleres_publico_taller('zz-rp3-pub') -> 'ediciones') e$$,
  '["cf300000-0000-4000-8000-000000000090", "cf300000-0000-4000-8000-000000000095"]');
SELECT pg_temp.capture('2: the open edición: lugar, clases, no cupo limit, not full, no leaders yet', 'pub_e',
  $$SELECT e - 'id' - 'fecha_inicio' - 'fecha_fin' - 'cierre_inscripcion'
      FROM jsonb_array_elements(public.talleres_publico_taller('zz-rp3-pub') -> 'ediciones') e
     WHERE e ->> 'id' = 'cf300000-0000-4000-8000-000000000090'$$,
  '{"lugar":"Sede Norte","clases":6,"hora":null,"cupo":null,"lugares_libres":null,"lleno":false,"facilitadores":[]}');
SELECT pg_temp.capture('2: the full edición reads lleno with 0 places', 'lleno_e',
  $$SELECT jsonb_build_object('cupo', e -> 'cupo', 'lugares_libres', e -> 'lugares_libres', 'lleno', e -> 'lleno')
      FROM jsonb_array_elements(public.talleres_publico_taller('zz-rp3-pub') -> 'ediciones') e
     WHERE e ->> 'id' = 'cf300000-0000-4000-8000-000000000095'$$,
  '{"cupo":1,"lugares_libres":0,"lleno":true}');
SELECT pg_temp.capture('2: the taller shows tipo, vinculo and genero_requerido', 'muj_t',
  $$SELECT public.talleres_publico_taller('zz-rp3-muj') - 'ediciones' - 'descripcion' - 'duracion_minutos'$$,
  '{"slug":"zz-rp3-muj","nombre":"ZZ RP3 Mujer","tipo":"individual","vinculo":null,"genero_requerido":"Femenino"}');

-- ══ 3. Identify ══

SELECT pg_temp.capture('3: a private taller''s edición is cerrada', 'id_priv',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000093', '99830001', pg_temp.h('ip-1'), pg_temp.h('c'))$$,
  '{"estado":"cerrada"}');
SELECT pg_temp.capture('3: a closed edición is cerrada', 'id_cerr',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000094', '99830001', pg_temp.h('ip-1'), pg_temp.h('c'))$$,
  '{"estado":"cerrada"}');
SELECT pg_temp.capture('3: an invalid cédula is invalido', 'id_bad',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', 'abc', pg_temp.h('ip-1'), pg_temp.h('c'))$$,
  '{"estado":"invalido","campo":"cedula"}');
SELECT pg_temp.assert_rows('3: refusals before the lookup consumed no unit',
  $$SELECT 1 FROM public.reserva_publica_limites WHERE ip_hash = pg_temp.h('ip-1')$$, 0);
SELECT pg_temp.assert_sqlstate('3: a malformed code hash raises datos_invalidos',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830001', pg_temp.h('ip-1'), '123456')$$, '22023');
SELECT pg_temp.capture('3: an unknown cédula is nuevo', 'id_nuevo',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830099', pg_temp.h('ip-2'), pg_temp.h('c'))$$,
  '{"estado":"nuevo"}');
SELECT pg_temp.capture('3: a person without email is sin_correo', 'id_x2',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', 'V-99830002', pg_temp.h('ip-3'), pg_temp.h('c'))$$,
  '{"estado":"sin_correo"}');
SELECT pg_temp.capture('3: a person with email gets a code', 'id_x1',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830001', pg_temp.h('ip-4'),
     pg_temp.h('c-x1-pub'), 'Tu código es 111111')$$);
SELECT pg_temp.assert_rows('3: the reply carries only the masked email and the sender data',
  $$SELECT 1 FROM t_rr WHERE key = 'id_x1' AND j ? 'codigo_id'
     AND j - 'codigo_id' = '{"estado":"codigo","email_mascara":"c***@e***.test","envio":{"email":"cf3-x1@example.test","nombre":"Ana"}}'::jsonb$$, 1);
SELECT pg_temp.assert_rows('3: the code row holds the hash, 10 minutes, no token',
  $$SELECT 1 FROM public.taller_reserva_codigos c JOIN t_rr r ON r.key = 'id_x1' AND c.id = (r.j ->> 'codigo_id')::uuid
     WHERE c.usuario_id = 'cf300000-0000-4000-8000-000000000041' AND c.codigo_hash = pg_temp.h('c-x1-pub')
       AND c.expira_en = now() + interval '10 minutes' AND c.token_hash IS NULL$$, 1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf300000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_rows('3: X1 reads the code notice in the app',
  $$SELECT 1 FROM public.mis_avisos() a WHERE a.tipo = 'codigo_reserva' AND a.cuerpo = 'Tu código es 111111'
     AND a.expira_at = now() + interval '10 minutes'$$, 1);
SELECT pg_temp.as_persona('cf300000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_rows('3: another user sees none of X1''s notices',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf300000-0000-4000-8000-000000000041'
    UNION ALL SELECT 1 FROM public.mis_avisos()$$, 0);
RESET ROLE;

SELECT pg_temp.assert_rows('3: 10 lookups from one ip in 10 minutes are served',
  $$SELECT 1 FROM generate_series(100, 109) AS n,
     LATERAL (SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830' || n,
                pg_temp.h('ip-lim'), pg_temp.h('c')) AS r) x
     WHERE x.r = '{"estado":"nuevo"}'$$, 10);
SELECT pg_temp.capture('3: the 11th from that ip is limite', 'id_lim_ip',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830110', pg_temp.h('ip-lim'), pg_temp.h('c'))$$,
  '{"estado":"limite"}');
SELECT pg_temp.assert_rows('3: 5 lookups of one cédula in an hour are served (from 5 ips)',
  $$SELECT 1 FROM generate_series(1, 5) AS n,
     LATERAL (SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830098',
                pg_temp.h('ip-ced-' || n), pg_temp.h('c')) AS r) x
     WHERE x.r = '{"estado":"nuevo"}'$$, 5);
SELECT pg_temp.capture('3: the 6th lookup of that cédula is limite', 'id_lim_ced',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830098', pg_temp.h('ip-ced-6'), pg_temp.h('c'))$$,
  '{"estado":"limite"}');
SELECT pg_temp.assert_rows('3: limit rows never hold the raw cédula',
  $$SELECT 1 FROM public.reserva_publica_limites WHERE clave IN ('99830098', '99830001')$$, 0);

-- X3 on E_muj twice: the second code blocks the first.
SELECT pg_temp.capture('3: X3 first code on E_muj', 'id_x3_old',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000091', '99830003', pg_temp.h('ip-5'), pg_temp.h('c-x3-old')) -> 'estado'$$, '"codigo"');
SELECT pg_temp.capture('3: X3 second code on E_muj', 'id_x3_muj',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000091', '99830003', pg_temp.h('ip-5'), pg_temp.h('c-x3-muj'))$$);
SELECT pg_temp.capture('3: the earlier code is now bloqueado', 'ver_x3_old',
  $$SELECT public.talleres_reserva_codigo_verificar(
     (SELECT c.id FROM public.taller_reserva_codigos c WHERE c.codigo_hash = pg_temp.h('c-x3-old')),
     pg_temp.h('c-x3-old'), pg_temp.h('t-x3-old'), pg_temp.h('ip-v'))$$,
  '{"estado":"bloqueado"}');

-- ══ 4. Verify ══

SELECT pg_temp.capture('4: a wrong code counts down', 'ver_x1_bad',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1'),
     pg_temp.h('nope'), pg_temp.h('t-x1-pub'), pg_temp.h('ip-v'))$$,
  '{"estado":"invalido","intentos_restantes":4}');
SELECT pg_temp.capture('4: the right code returns the first name only', 'ver_x1',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1'),
     pg_temp.h('c-x1-pub'), pg_temp.h('t-x1-pub'), pg_temp.h('ip-v'))$$,
  '{"estado":"ok","nombre":"Ana"}');
SELECT pg_temp.assert_rows('4: the token is stored for 30 minutes and the code used',
  $$SELECT 1 FROM public.taller_reserva_codigos c JOIN t_rr r ON r.key = 'id_x1' AND c.id = (r.j ->> 'codigo_id')::uuid
     WHERE c.usado_en IS NOT NULL AND c.token_hash = pg_temp.h('t-x1-pub') AND c.token_expira_en = now() + interval '30 minutes'
       AND c.token_usado_en IS NULL AND c.intentos = 1$$, 1);
SELECT pg_temp.capture('4: the code is single use', 'ver_x1_twice',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1'),
     pg_temp.h('c-x1-pub'), pg_temp.h('t-x1-again'), pg_temp.h('ip-v'))$$,
  '{"estado":"invalido"}');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf300000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_rows('4: the code notice is gone once used',
  $$SELECT 1 FROM public.mis_avisos() a WHERE a.tipo = 'codigo_reserva'$$, 0);
RESET ROLE;
SELECT pg_temp.assert_rows('4: and its text was dropped',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf300000-0000-4000-8000-000000000041' AND cuerpo IS NOT NULL$$, 0);

SELECT pg_temp.capture('4: X1 code on E_muj', 'id_x1_muj',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000091', '99830001', pg_temp.h('ip-6'), pg_temp.h('c-x1-muj'))$$);
SELECT pg_temp.run('4: expire X1''s E_muj code',
  $$UPDATE public.taller_reserva_codigos SET expira_en = now() - interval '1 second' WHERE codigo_hash = pg_temp.h('c-x1-muj')$$);
SELECT pg_temp.capture('4: an expired code is vencido', 'ver_vencido',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1_muj'),
     pg_temp.h('c-x1-muj'), pg_temp.h('t-x1-muj'), pg_temp.h('ip-v'))$$,
  '{"estado":"vencido"}');

SELECT pg_temp.capture('4: X1 code on E_par', 'id_x1_par',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000092', '99830001', pg_temp.h('ip-7'), pg_temp.h('c-x1-par'))$$);
SELECT pg_temp.assert_rows('4: four wrong attempts are invalido',
  $$SELECT 1 FROM generate_series(1, 4) AS n,
     LATERAL (SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1_par'),
                pg_temp.h('nope-' || n), pg_temp.h('t-x1-par'), pg_temp.h('ip-v2')) AS r) x
     WHERE x.r ->> 'estado' = 'invalido'$$, 4);
SELECT pg_temp.capture('4: the 5th wrong attempt blocks', 'ver_block',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1_par'),
     pg_temp.h('nope'), pg_temp.h('t-x1-par'), pg_temp.h('ip-v2'))$$,
  '{"estado":"bloqueado"}');
SELECT pg_temp.capture('4: then even the right code is bloqueado', 'ver_block_ok',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x1_par'),
     pg_temp.h('c-x1-par'), pg_temp.h('t-x1-par'), pg_temp.h('ip-v2'))$$,
  '{"estado":"bloqueado"}');

-- ══ 5. Resend (X5 on E_pub) ══

SELECT pg_temp.capture('5: X5 gets a code', 'id_x5',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830007', pg_temp.h('ip-8'), pg_temp.h('c-x5-1'))$$);
SELECT pg_temp.capture('5: a resend within 60 s waits', 're_espera',
  $$SELECT public.talleres_reserva_codigo_reenviar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-2'), pg_temp.h('ip-8'))$$,
  '{"estado":"espera","segundos":60}');
SELECT pg_temp.run('5: 61 s pass',
  $$UPDATE public.taller_reserva_codigos SET ultimo_envio_en = now() - interval '61 seconds' WHERE usuario_id = 'cf300000-0000-4000-8000-000000000047'$$);
SELECT pg_temp.capture('5: after 60 s a new code is issued', 're_1',
  $$SELECT public.talleres_reserva_codigo_reenviar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-2'), pg_temp.h('ip-8')) - 'codigo_id'$$,
  '{"estado":"codigo","email_mascara":"c***@e***.test","envio":{"email":"cf3-x5@example.test","nombre":"Luis"}}');
SELECT pg_temp.capture('5: the replaced code no longer works', 'ver_x5_old',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-1'), pg_temp.h('t-x5'), pg_temp.h('ip-8'))$$,
  '{"estado":"invalido","intentos_restantes":4}');
SELECT pg_temp.run('5: 61 s pass',
  $$UPDATE public.taller_reserva_codigos SET ultimo_envio_en = now() - interval '61 seconds' WHERE usuario_id = 'cf300000-0000-4000-8000-000000000047'$$);
SELECT pg_temp.capture('5: second resend', 're_2',
  $$SELECT public.talleres_reserva_codigo_reenviar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-3'), pg_temp.h('ip-8')) -> 'estado'$$, '"codigo"');
SELECT pg_temp.run('5: 61 s pass',
  $$UPDATE public.taller_reserva_codigos SET ultimo_envio_en = now() - interval '61 seconds' WHERE usuario_id = 'cf300000-0000-4000-8000-000000000047'$$);
SELECT pg_temp.capture('5: third resend', 're_3',
  $$SELECT public.talleres_reserva_codigo_reenviar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-4'), pg_temp.h('ip-8')) -> 'estado'$$, '"codigo"');
SELECT pg_temp.run('5: 61 s pass',
  $$UPDATE public.taller_reserva_codigos SET ultimo_envio_en = now() - interval '61 seconds' WHERE usuario_id = 'cf300000-0000-4000-8000-000000000047'$$);
SELECT pg_temp.capture('5: a fourth resend is limite', 're_4',
  $$SELECT public.talleres_reserva_codigo_reenviar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-5'), pg_temp.h('ip-8'))$$, '{"estado":"limite"}');
SELECT pg_temp.capture('5: the last code verifies', 'ver_x5',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x5'),
     pg_temp.h('c-x5-4'), pg_temp.h('t-x5'), pg_temp.h('ip-8'))$$, '{"estado":"ok","nombre":"Luis"}');

-- ══ 6. talleres_reserva_crear ══

SELECT pg_temp.capture('6: a verified token reserves', 'cr_x1',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     jsonb_build_object('token', pg_temp.h('t-x1-pub')), pg_temp.h('ip-c1'))$$);
SELECT pg_temp.assert_rows('6: reply {ok, inscripcion_id, invitacion_id null, por_verificar false}',
  $$SELECT 1 FROM t_rr WHERE key = 'cr_x1' AND j ? 'inscripcion_id'
     AND j - 'inscripcion_id' = '{"estado":"ok","invitacion_id":null,"por_verificar":false}'::jsonb$$, 1);
SELECT pg_temp.capture('6: the token is single use', 'cr_x1_twice',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     jsonb_build_object('token', pg_temp.h('t-x1-pub')), pg_temp.h('ip-c2'))$$, '{"estado":"invalido"}');
SELECT pg_temp.run('6: X1 verifies again on E_pub',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000090', '99830001', pg_temp.h('ip-9'), pg_temp.h('c-x1-pub2'));
    SELECT public.talleres_reserva_codigo_verificar((SELECT c.id FROM public.taller_reserva_codigos c WHERE c.codigo_hash = pg_temp.h('c-x1-pub2')),
      pg_temp.h('c-x1-pub2'), pg_temp.h('t-x1-pub2'), pg_temp.h('ip-9'))$$);
SELECT pg_temp.capture('6: a verified person already enrolled reads ya_inscrito', 'cr_ya',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     jsonb_build_object('token', pg_temp.h('t-x1-pub2')), pg_temp.h('ip-c3'))$$, '{"estado":"ya_inscrito"}');
SELECT pg_temp.run('6: X5''s token expires',
  $$UPDATE public.taller_reserva_codigos SET token_expira_en = now() - interval '1 second' WHERE token_hash = pg_temp.h('t-x5')$$);
SELECT pg_temp.capture('6: an expired token is invalido', 'cr_x5',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     jsonb_build_object('token', pg_temp.h('t-x5')), pg_temp.h('ip-c4'))$$, '{"estado":"invalido"}');

SELECT pg_temp.capture('6: por_verificar reserves an email-less person', 'cr_x2',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     '{"por_verificar":{"cedula":"99830002"}}', pg_temp.h('ip-c5')) - 'inscripcion_id'$$,
  '{"estado":"ok","invitacion_id":null,"por_verificar":true}');
SELECT pg_temp.capture('6: por_verificar also reserves a person with email who cannot read it (S3 fallback)', 'cr_x3_pv',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     '{"por_verificar":{"cedula":"99830003"}}', pg_temp.h('ip-c6')) - 'inscripcion_id'$$,
  '{"estado":"ok","invitacion_id":null,"por_verificar":true}');
SELECT pg_temp.capture('6: por_verificar of a Masculino on a Femenino taller reads neutral', 'cr_x2_muj',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000091',
     '{"por_verificar":{"cedula":"99830002"}}', pg_temp.h('ip-c7'))$$, '{"estado":"invalido"}');
SELECT pg_temp.run('6: X3 verifies on E_muj',
  $$SELECT public.talleres_reserva_codigo_verificar((SELECT (j ->> 'codigo_id')::uuid FROM t_rr WHERE key = 'id_x3_muj'),
      pg_temp.h('c-x3-muj'), pg_temp.h('t-x3-muj'), pg_temp.h('ip-10'))$$);
SELECT pg_temp.capture('6: a verified Masculino on a Femenino taller reads genero_no_aplica', 'cr_x3_muj',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000091',
     jsonb_build_object('token', pg_temp.h('t-x3-muj')), pg_temp.h('ip-c8'))$$, '{"estado":"genero_no_aplica"}');
SELECT pg_temp.capture('6: a new Masculino ficha on a Femenino taller reads genero_no_aplica', 'cr_new_muj',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000091',
     '{"ficha_nueva":{"cedula":"99830024","nombre":"Leo","apellido":"Paz","fecha_nacimiento":"1990-01-01","telefono":"0414-1234567","email":"cf3-leo@example.test","genero":"Masculino"}}',
     pg_temp.h('ip-c9'))$$, '{"estado":"genero_no_aplica"}');

SELECT pg_temp.capture('6: a new person reserves and gets an invitation', 'cr_new',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     '{"ficha_nueva":{"cedula":"V-99830020","nombre":" Nora ","apellido":"Lugo","fecha_nacimiento":"1991-02-03","telefono":"+58 414 1234567","email":"CF3-New@Example.test","genero":"Femenino"}}',
     pg_temp.h('ip-c10'))$$);
SELECT pg_temp.assert_rows('6: reply ok with an invitacion_id, not por_verificar',
  $$SELECT 1 FROM t_rr WHERE key = 'cr_new' AND j ->> 'estado' = 'ok' AND j ->> 'invitacion_id' IS NOT NULL
     AND j -> 'por_verificar' = 'false'$$, 1);
SELECT pg_temp.assert_rows('6: the new ficha: normalized cédula, lower email, telefono normalized by usuarios_normalizar_telefono, no account, no role',
  $$SELECT 1 FROM public.usuarios u WHERE u.cedula = '99830020' AND u.email = 'cf3-new@example.test' AND u.nombre = 'Nora'
     AND u.telefono = '04141234567' AND u.auth_id IS NULL AND u.genero = 'Femenino' AND u.estado_civil = 'No especificado'
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur WHERE ur.usuario_id = u.id)$$, 1);
SELECT pg_temp.assert_rows('6: one en_espera taller_publico invitation for the new ficha and inscription',
  $$SELECT 1 FROM public.invitaciones_acceso ia JOIN t_rr r ON r.key = 'cr_new'
     WHERE ia.id = (r.j ->> 'invitacion_id')::uuid AND ia.origen = 'taller_publico' AND ia.estado = 'en_espera'
       AND ia.creado_por IS NULL AND ia.inscripcion_id = (r.j ->> 'inscripcion_id')::uuid
       AND ia.usuario_id = (SELECT id FROM public.usuarios WHERE cedula = '99830020')$$, 1);
SELECT pg_temp.assert_rows('6: the invitation is ready to send at once (taller al_aprobar, inscription pendiente)',
  $$SELECT 1 FROM public.invitacion_acceso_pendientes_de_envio() p JOIN t_rr r ON r.key = 'cr_new'
     WHERE p.invitacion_id = (r.j ->> 'invitacion_id')::uuid$$, 1);
SELECT pg_temp.capture('6: invitacion_acceso_preparar_envio works for it', 'cr_new_prep',
  $$SELECT public.invitacion_acceso_preparar_envio((SELECT (j ->> 'invitacion_id')::uuid FROM t_rr WHERE key = 'cr_new'),
     pg_temp.h('inv-token'), now() + interval '7 days')$$,
  '{"ok":true,"email":"cf3-new@example.test","nombre_invitado":"Nora","nombre_invitante":null,"taller_nombre":"ZZ RP3 Publico"}');

SELECT pg_temp.capture('6: a new ficha with an existing cédula reads neutral', 'cr_n_ced',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     '{"ficha_nueva":{"cedula":"99830004","nombre":"Eva","apellido":"Paz","fecha_nacimiento":"1990-01-01","telefono":"0414-1234567","email":"cf3-eva@example.test","genero":"Femenino"}}',
     pg_temp.h('ip-c11'))$$, '{"estado":"invalido"}');
SELECT pg_temp.capture('6: a new ficha with an existing email (any case) reads neutral', 'cr_n_mail',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     '{"ficha_nueva":{"cedula":"99830021","nombre":"Eva","apellido":"Paz","fecha_nacimiento":"1990-01-01","telefono":"0414-1234567","email":"CF3-X1@Example.test","genero":"Femenino"}}',
     pg_temp.h('ip-c12'))$$, '{"estado":"invalido"}');
SELECT pg_temp.capture('6: a minor reads neutral', 'cr_n_minor',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     jsonb_build_object('ficha_nueva', jsonb_build_object('cedula', '99830022', 'nombre', 'Eva', 'apellido', 'Paz',
       'fecha_nacimiento', to_char(CURRENT_DATE - interval '10 years', 'YYYY-MM-DD'), 'telefono', '0414-1234567',
       'email', 'cf3-eva2@example.test', 'genero', 'Femenino')), pg_temp.h('ip-c13'))$$, '{"estado":"invalido"}');
SELECT pg_temp.assert_rows('6: none of the neutral refusals created a ficha',
  $$SELECT 1 FROM public.usuarios WHERE cedula IN ('99830021', '99830022') OR email IN ('cf3-eva@example.test', 'cf3-eva2@example.test')$$, 0);
SELECT pg_temp.capture('6: a malformed field names the field', 'cr_n_campo',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
     '{"ficha_nueva":{"cedula":"99830025","nombre":"Eva","apellido":"Paz","fecha_nacimiento":"1990-01-01","telefono":"0414-1234567","email":"x","genero":"Femenino"}}',
     pg_temp.h('ip-c14'))$$, '{"estado":"invalido","campo":"email"}');
SELECT pg_temp.capture('6: a private taller is cerrada', 'cr_priv',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000093', '{"por_verificar":{"cedula":"99830002"}}', pg_temp.h('ip-c15'))$$,
  '{"estado":"cerrada"}');
SELECT pg_temp.capture('6: a closed edición is cerrada', 'cr_cerr',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000094', '{"por_verificar":{"cedula":"99830002"}}', pg_temp.h('ip-c15'))$$,
  '{"estado":"cerrada"}');
SELECT pg_temp.capture('6: a full edición is cupo_lleno', 'cr_lleno',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000095',
     '{"ficha_nueva":{"cedula":"99830023","nombre":"Eva","apellido":"Paz","fecha_nacimiento":"1990-01-01","telefono":"0414-1234567","email":"cf3-eva3@example.test","genero":"Femenino"}}',
     pg_temp.h('ip-c16'))$$, '{"estado":"cupo_lleno"}');
SELECT pg_temp.assert_rows('6: cupo_lleno left no ficha behind',
  $$SELECT 1 FROM public.usuarios WHERE cedula = '99830023'$$, 0);

-- Parejas (E_par, matrimonio).
SELECT pg_temp.capture('6: a pareja edición needs the partner', 'cr_p_sin',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000092',
     '{"ficha_nueva":{"cedula":"99830030","nombre":"Hugo","apellido":"Rey","fecha_nacimiento":"1980-01-01","telefono":"0414-1234567","email":"cf3-p30@example.test","genero":"Masculino"}}',
     pg_temp.h('ip-p1'))$$, '{"estado":"invalido","campo":"pareja"}');
SELECT pg_temp.capture('6: new principal + new partner', 'cr_p_nuevos',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000092',
     '{"ficha_nueva":{"cedula":"99830030","nombre":"Hugo","apellido":"Rey","fecha_nacimiento":"1980-01-01","telefono":"0414-1234567","email":"cf3-p30@example.test","genero":"Masculino"},
       "pareja":{"ficha_nueva":{"cedula":"99830031","nombre":"Iris","apellido":"Rey","fecha_nacimiento":"1981-01-01","genero":"Femenino"}}}',
     pg_temp.h('ip-p2'))$$);
SELECT pg_temp.assert_rows('6: the couple row: matrimonio, ficha_nueva partner, both fichas Casado',
  $$SELECT 1 FROM public.taller_inscripciones i JOIN t_rr r ON r.key = 'cr_p_nuevos' AND i.id = (r.j ->> 'inscripcion_id')::uuid
     JOIN public.usuarios p ON p.id = i.persona_principal_id JOIN public.usuarios c ON c.id = i.companero_id
     WHERE p.cedula = '99830030' AND c.cedula = '99830031' AND c.email IS NULL AND i.link_type = 'matrimonio'
       AND i.pareja_origen = 'ficha_nueva' AND NOT i.por_verificar AND p.estado_civil = 'Casado' AND c.estado_civil = 'Casado'$$, 1);
SELECT pg_temp.assert_rows('6: only the principal got an invitation; the new partner none',
  $$SELECT 1 FROM public.invitaciones_acceso ia JOIN public.usuarios u ON u.id = ia.usuario_id
     WHERE u.cedula IN ('99830030', '99830031')$$, 1);
SELECT pg_temp.capture('6: an existing partner needs their own token', 'cr_p_token_malo',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000092',
     jsonb_build_object('ficha_nueva', '{"cedula":"99830040","nombre":"Saul","apellido":"Rey","fecha_nacimiento":"1980-01-01","telefono":"0414-1234567","email":"cf3-p40@example.test","genero":"Masculino"}'::jsonb,
       'pareja', jsonb_build_object('token', pg_temp.h('bogus'))), pg_temp.h('ip-p3'))$$, '{"estado":"invalido"}');
SELECT pg_temp.assert_rows('6: and the principal''s new ficha was rolled back',
  $$SELECT 1 FROM public.usuarios WHERE cedula = '99830040'$$, 0);
SELECT pg_temp.run('6: X3 verifies on E_par',
  $$SELECT public.talleres_reserva_identificar('cf300000-0000-4000-8000-000000000092', '99830003', pg_temp.h('ip-11'), pg_temp.h('c-x3-par'));
    SELECT public.talleres_reserva_codigo_verificar((SELECT c.id FROM public.taller_reserva_codigos c WHERE c.codigo_hash = pg_temp.h('c-x3-par')),
      pg_temp.h('c-x3-par'), pg_temp.h('t-x3-par'), pg_temp.h('ip-11'))$$);
SELECT pg_temp.capture('6: por_verificar principal + verified partner', 'cr_p_x2x3',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000092',
     jsonb_build_object('por_verificar', '{"cedula":"99830002"}'::jsonb, 'pareja', jsonb_build_object('token', pg_temp.h('t-x3-par'))),
     pg_temp.h('ip-p4')) - 'inscripcion_id'$$, '{"estado":"ok","invitacion_id":null,"por_verificar":true}');
SELECT pg_temp.assert_rows('6: X3 is the companero and their token is used up',
  $$SELECT 1 FROM public.taller_inscripciones i JOIN public.taller_reserva_codigos c ON c.token_hash = pg_temp.h('t-x3-par')
     WHERE i.taller_id = 'cf300000-0000-4000-8000-000000000092' AND i.persona_principal_id = 'cf300000-0000-4000-8000-000000000042'
       AND i.companero_id = 'cf300000-0000-4000-8000-000000000043' AND i.pareja_origen = 'cedula' AND c.token_usado_en IS NOT NULL$$, 1);
SELECT pg_temp.capture('6: new principal + existing partner pending confirmation', 'cr_p_pend',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000092',
     '{"ficha_nueva":{"cedula":"99830050","nombre":"Raul","apellido":"Mar","fecha_nacimiento":"1980-01-01","telefono":"0414-1234567","email":"cf3-p50@example.test","genero":"Masculino"},
       "pareja":{"pendiente_cedula":"99830004"}}',
     pg_temp.h('ip-p5')) - 'inscripcion_id' - 'invitacion_id'$$, '{"estado":"ok","por_verificar":true}');
SELECT pg_temp.assert_rows('6: X4 is the companero, por_verificar, and got an in-app notice',
  $$SELECT 1 FROM public.taller_inscripciones i JOIN public.avisos_persona a
       ON a.persona_id = i.companero_id AND a.tipo = 'taller_pareja_por_confirmar' AND (a.datos ->> 'inscripcion_id')::uuid = i.id
     WHERE i.companero_id = 'cf300000-0000-4000-8000-000000000044' AND i.por_verificar
       AND a.cuerpo = 'Raul te inscribió como su pareja. Si no es correcto, avísale a la iglesia.'$$, 1);
SELECT pg_temp.capture('6: a minor cannot be the pending partner', 'cr_p_menor',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000092',
     '{"ficha_nueva":{"cedula":"99830060","nombre":"Tito","apellido":"Mar","fecha_nacimiento":"1980-01-01","telefono":"0414-1234567","email":"cf3-p60@example.test","genero":"Masculino"},
       "pareja":{"pendiente_cedula":"99830005"}}',
     pg_temp.h('ip-p6'))$$, '{"estado":"invalido"}');

SELECT pg_temp.assert_rows('6: 5 attempts from one ip in an hour are processed',
  $$SELECT 1 FROM generate_series(70, 74) AS n,
     LATERAL (SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090',
       jsonb_build_object('ficha_nueva', jsonb_build_object('cedula', '998300' || n, 'nombre', 'Eva', 'apellido', 'Paz',
         'fecha_nacimiento', to_char(CURRENT_DATE - interval '10 years', 'YYYY-MM-DD'), 'telefono', '0414-1234567',
         'email', 'cf3-lim' || n || '@example.test', 'genero', 'Femenino')), pg_temp.h('ip-cl')) AS r) x
     WHERE x.r = '{"estado":"invalido"}'$$, 5);
SELECT pg_temp.capture('6: the 6th from that ip is limite', 'cr_lim',
  $$SELECT public.talleres_reserva_crear('cf300000-0000-4000-8000-000000000090', '{"por_verificar":{"cedula":"99830004"}}', pg_temp.h('ip-cl'))$$,
  '{"estado":"limite"}');

SELECT pg_temp.assert_rows('6: existing fichas are unchanged by every path',
  $$SELECT 1 FROM t_rr_ficha f JOIN public.usuarios u ON u.id = f.id WHERE row_to_json(u)::text = f.fila$$, 4);
SELECT pg_temp.assert_rows('6: every public row is pendiente with origen publico (4 on E_pub, 3 on E_par, none on E_muj)',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id IN ('cf300000-0000-4000-8000-000000000090', 'cf300000-0000-4000-8000-000000000091', 'cf300000-0000-4000-8000-000000000092')
       AND estado = 'pendiente' AND origen = 'publico'$$, 7);
SELECT pg_temp.assert_rows('6: and no other row was written there',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id IN ('cf300000-0000-4000-8000-000000000090', 'cf300000-0000-4000-8000-000000000091', 'cf300000-0000-4000-8000-000000000092')
       AND (estado <> 'pendiente' OR origen <> 'publico')$$, 0);

-- ══ 7. Avísame ══

SELECT pg_temp.capture('7: avísame on a full edición', 'av_1',
  $$SELECT public.talleres_avisame_lugar_agregar('cf300000-0000-4000-8000-000000000095', ' Ana ', 'cf3-av@example.test', pg_temp.h('ip-a'))$$,
  '{"estado":"ok"}');
SELECT pg_temp.capture('7: the same email in another case is ok too', 'av_2',
  $$SELECT public.talleres_avisame_lugar_agregar('cf300000-0000-4000-8000-000000000095', 'Ana R', 'CF3-AV@example.test', pg_temp.h('ip-a'))$$,
  '{"estado":"ok"}');
SELECT pg_temp.assert_rows('7: one row, first name kept, lower email',
  $$SELECT 1 FROM public.taller_avisame_lugar WHERE edicion_id = 'cf300000-0000-4000-8000-000000000095'
     AND nombre = 'Ana' AND email = 'cf3-av@example.test'$$, 1);
SELECT pg_temp.capture('7: an invalid email names the field', 'av_bad',
  $$SELECT public.talleres_avisame_lugar_agregar('cf300000-0000-4000-8000-000000000095', 'Ana', 'nope', pg_temp.h('ip-a'))$$,
  '{"estado":"invalido","campo":"email"}');
SELECT pg_temp.capture('7: a private taller is cerrada', 'av_priv',
  $$SELECT public.talleres_avisame_lugar_agregar('cf300000-0000-4000-8000-000000000093', 'Ana', 'cf3-av@example.test', pg_temp.h('ip-a'))$$,
  '{"estado":"cerrada"}');

RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

SELECT pg_temp.report();

ROLLBACK;
