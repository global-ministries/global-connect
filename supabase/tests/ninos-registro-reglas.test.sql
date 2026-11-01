-- N4a (odd/tasks/ninos-v2.md, S6) — registration rules in the database
-- (20261101300000_ninos_registro_reglas.sql).
--
-- Covers:
--   a. Parent género of the public pre-registration: stored as given
--      ('Masculino' / 'Femenino'), null or missing still valid, any other
--      value refused (datos_invalidos); on confirm it becomes the new adult's
--      género; a null one is set by the desk before confirming.
--   b. ninos_preregistro_crear (4 and 3 arguments): a child of 13 years or a
--      future birth date → fuera_de_rango, nothing stored; 12 years → ok.
--   c. ninos_registrar_familia_mesa and ninos_registrar_familia: same rule,
--      nothing stored (no person, no alta de mesa); 12 years → ok.
--   d. Confirming a pre-registration (public and from an account) with a
--      child out of range → fuera_de_rango; the request stays pendiente.
--   e. PRESERVE ninos_mis_hijos_registrar: already refuses with
--      edad_fuera_de_rango; 12 years → registered.
--   f. PRESERVE permissions: who may execute each RPC; definer flag and
--      search_path of the two redefined functions.
--   g. PRESERVE happy path at the desk: new family, two children, pickup
--      people on each, parent género, alta de mesa.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing is kept. Fixture rows
-- use the f9c30000-0000-4000-9c0x-... namespace and the 'ZZ Rr' prefix. The
-- last statement is a SELECT of the failing cases ('all cases ok' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 3 RANDOM, 5 PADRE with account.
-- Tree: R → W → Anfitriones. Room S1 in W on the Barquisimeto campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_rr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_rr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- The statement fails with p_sqlstate (and the message p_message when given).
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9c30000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9c01' WHEN 'us' THEN '9c02' WHEN 'eq' THEN '9c04'
                       WHEN 'ro' THEN '9c05' WHEN 'sa' THEN '9c06' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('au', p_n), 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_rr_ctx WHERE k = p_k;
$$;

-- A birth date p_anos years (and 20 days) before ninos_hoy() (inlined: service_role
-- calls it too); 12 is the oldest in range.
CREATE OR REPLACE FUNCTION pg_temp.nac(p_anos int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT ((now() AT TIME ZONE 'America/Caracas')::date - make_interval(years => p_anos) - interval '20 days')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.manana() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Caracas')::date + 1;
$$;

-- A child of the payload; p_tag is unique per case, so it can be counted.
CREATE OR REPLACE FUNCTION pg_temp.hijo(p_tag text, p_nac date) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('nombre', 'ZZ Rr ' || p_tag, 'apellido', 'Prueba',
                            'fecha_nacimiento', p_nac, 'genero', 'Femenino');
$$;

-- A family for a new parent: tag, phone, género (jsonb: a string or null) and children.
CREATE OR REPLACE FUNCTION pg_temp.fam(p_tag text, p_tel text, p_genero jsonb, p_hijos jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'padre', jsonb_build_object('nombre', 'ZZ Rr ' || p_tag, 'apellido', 'Prueba', 'telefono', p_tel, 'genero', p_genero),
    'hijos', p_hijos, 'autorizados', '[]'::jsonb);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_rr_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'rr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 3, 5]) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Rr Anfi', 'Prueba', 'rr-1@example.test', NULL, 'Soltero', 'Femenino'),
  (pg_temp.id('us', 3), pg_temp.id('au', 3), 'ZZ Rr Random', 'Prueba', 'rr-3@example.test', NULL, 'Soltero', 'Masculino'),
  (pg_temp.id('us', 5), pg_temp.id('au', 5), 'ZZ Rr Cuenta', 'Prueba', 'rr-5@example.test', '04120003105', 'Casado', 'Femenino');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 5), pg_temp.ctx('campus')::uuid, true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Rr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Rr W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (pg_temp.id('us', 1), pg_temp.id('us', 3), pg_temp.id('us', 5));
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Rr S1', 20, 0, 71, -100);

-- A pending request made from account 5 (as ninos_mis_hijos_registrar leaves it).
INSERT INTO public.ninos_preregistros (campus_id, payload, solicitado_por)
VALUES (pg_temp.ctx('campus')::uuid,
        pg_temp.fam('Cuenta', '04120003105', '"Femenino"', jsonb_build_array(pg_temp.hijo('Pend', pg_temp.nac(4)))),
        pg_temp.id('us', 5));
INSERT INTO t_rr_ctx (k, v)
SELECT 'pre_cuenta', r.id::text FROM public.ninos_preregistros r WHERE r.solicitado_por = pg_temp.id('us', 5);

GRANT INSERT, SELECT, UPDATE ON t_rr_failures, t_rr_ctx TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_user(int), pg_temp.as_nobody(),
  pg_temp.ctx(text), pg_temp.nac(int), pg_temp.manana(), pg_temp.hijo(text, date), pg_temp.fam(text, text, jsonb, jsonb)
  TO authenticated, anon, service_role;

-- ── a. parent género of the pre-registration (service_role) ─────────

SET LOCAL ROLE service_role;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('a: a pre-registration with género Masculino is stored',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Gm', '04120003101', '"Masculino"', jsonb_build_array(pg_temp.hijo('Gm hijo', pg_temp.nac(5)))),
       'zz-rr-gm', NULL) ->> 'estado'$q$, 'ok');
SELECT pg_temp.assert_eq('a: a pre-registration with género null is stored (PRESERVE)',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Gn', '04120003102', 'null', jsonb_build_array(pg_temp.hijo('Gn hijo', pg_temp.nac(5)))),
       'zz-rr-gn', NULL) ->> 'estado'$q$, 'ok');
SELECT pg_temp.assert_eq('a: a pre-registration without género is stored (PRESERVE)',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Gs', '04120003103', 'null', jsonb_build_array(pg_temp.hijo('Gs hijo', pg_temp.nac(5))))
         #- '{padre,genero}',
       'zz-rr-gs', NULL) ->> 'estado'$q$, 'ok');
SELECT pg_temp.assert_raises('a: a género other than Masculino / Femenino is refused',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Go', '04120003104', '"Otro"', jsonb_build_array(pg_temp.hijo('Go hijo', pg_temp.nac(5)))),
       'zz-rr-go', NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('a: a non-text género is refused',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Go', '04120003104', '5', jsonb_build_array(pg_temp.hijo('Go hijo', pg_temp.nac(5)))),
       'zz-rr-g5', NULL)$q$, '22023', 'datos_invalidos');
RESET ROLE;

INSERT INTO t_rr_ctx (k, v)
SELECT 'pre_' || substr(r.ip_hash, 7), r.id::text FROM public.ninos_preregistros r WHERE r.ip_hash IN ('zz-rr-gm', 'zz-rr-gn', 'zz-rr-gs');
INSERT INTO t_rr_ctx (k, v)
SELECT 'payload_' || substr(r.ip_hash, 7), r.payload::text FROM public.ninos_preregistros r WHERE r.ip_hash IN ('zz-rr-gm', 'zz-rr-gn', 'zz-rr-gs');
SELECT pg_temp.assert_eq('a: the stored payload keeps each parent género',
  $q$SELECT string_agg(substr(r.ip_hash, 7) || '=' || coalesce(r.payload -> 'padre' ->> 'genero', '-'), ',' ORDER BY r.ip_hash)
       FROM public.ninos_preregistros r WHERE r.ip_hash IN ('zz-rr-gm', 'zz-rr-gn', 'zz-rr-gs')$q$, 'gm=Masculino,gn=-,gs=-');
SELECT pg_temp.assert_eq('a: nothing stored for a refused género',
  $q$SELECT count(*)::text FROM public.ninos_preregistros r WHERE r.ip_hash IN ('zz-rr-go', 'zz-rr-g5')$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('a: the anfitrión confirms the request with género Masculino',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_gm')::uuid, 'confirmar', pg_temp.ctx('payload_gm')::jsonb) ->> 'estado'$q$,
  'confirmado');
SELECT pg_temp.assert_raises('a: a request with género null needs the desk to choose it (PRESERVE)',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_gn')::uuid, 'confirmar', pg_temp.ctx('payload_gn')::jsonb)$q$,
  '22023', 'datos_invalidos');
SELECT pg_temp.assert_eq('a: the desk sets the género of a null one and confirms (PRESERVE)',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_gn')::uuid, 'confirmar',
       jsonb_set(pg_temp.ctx('payload_gn')::jsonb, '{padre,genero}', '"Femenino"')) ->> 'estado'$q$, 'confirmado');
RESET ROLE;
SELECT pg_temp.assert_eq('a: each new adult carries the confirmed género',
  $q$SELECT string_agg(u.nombre || '=' || u.genero::text, ',' ORDER BY u.nombre) FROM public.usuarios u
      WHERE u.nombre IN ('ZZ Rr Gm', 'ZZ Rr Gn')$q$, 'ZZ Rr Gm=Masculino,ZZ Rr Gn=Femenino');

-- ── b. ninos_preregistro_crear: the Niños age range ─────────────────

SET LOCAL ROLE service_role;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('b: a child of 13 years is refused',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('B13', '04120003106', '"Femenino"', jsonb_build_array(pg_temp.hijo('B13 hijo', pg_temp.nac(13)))),
       'zz-rb-13', NULL)$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('b: a future birth date is refused',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Bfu', '04120003106', '"Femenino"', jsonb_build_array(pg_temp.hijo('Bfu hijo', pg_temp.manana()))),
       'zz-rb-fu', NULL)$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('b: one child out of range refuses the whole request',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Bmx', '04120003106', '"Femenino"', jsonb_build_array(pg_temp.hijo('Bmx uno', pg_temp.nac(5)),
                                                                        pg_temp.hijo('Bmx dos', pg_temp.nac(13)))),
       'zz-rb-mx', NULL)$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('b: the 3-argument form applies the same rule',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Bt3', '04120003106', '"Femenino"', jsonb_build_array(pg_temp.hijo('Bt3 hijo', pg_temp.nac(13)))),
       'zz-rb-t3')$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_eq('b: a child of 12 years is accepted',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('B12', '04120003106', '"Femenino"', jsonb_build_array(pg_temp.hijo('B12 hijo', pg_temp.nac(12)))),
       'zz-rb-12', NULL) ->> 'estado'$q$, 'ok');
-- For d: a public request with a child in range.
SELECT pg_temp.assert_eq('b: setup public request for d',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid,
       pg_temp.fam('Pub', '04120003107', '"Femenino"', jsonb_build_array(pg_temp.hijo('Pub hijo', pg_temp.nac(6)))),
       'zz-rd-pub', NULL) ->> 'estado'$q$, 'ok');
RESET ROLE;
SELECT pg_temp.assert_eq('b: only the accepted request is stored',
  $q$SELECT string_agg(substr(r.ip_hash, 7), ',' ORDER BY r.ip_hash) FROM public.ninos_preregistros r
      WHERE r.ip_hash LIKE 'zz-rb-%'$q$, '12');

INSERT INTO t_rr_ctx (k, v)
SELECT 'pre_pub', r.id::text FROM public.ninos_preregistros r WHERE r.ip_hash = 'zz-rd-pub';
INSERT INTO t_rr_ctx (k, v)
SELECT 'payload_pub', r.payload::text FROM public.ninos_preregistros r WHERE r.ip_hash = 'zz-rd-pub';
INSERT INTO t_rr_ctx (k, v)
SELECT 'payload_cuenta', r.payload::text FROM public.ninos_preregistros r WHERE r.id = pg_temp.ctx('pre_cuenta')::uuid;

-- ── c. registration at the desk ──────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('c: mesa refuses a child of 13 years',
  $q$SELECT public.ninos_registrar_familia_mesa(pg_temp.fam('Mesa13', '04120003111', '"Femenino"',
       jsonb_build_array(pg_temp.hijo('Mesa13 hijo', pg_temp.nac(13)))))$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('c: mesa refuses a future birth date',
  $q$SELECT public.ninos_registrar_familia_mesa(pg_temp.fam('MesaFu', '04120003112', '"Femenino"',
       jsonb_build_array(pg_temp.hijo('MesaFu hijo', pg_temp.manana()))))$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('c: ninos_registrar_familia refuses a child of 13 years for an existing parent',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object('padre', jsonb_build_object('id', pg_temp.id('us', 5)),
       'hijos', jsonb_build_array(pg_temp.hijo('Fam13 hijo', pg_temp.nac(13)))))$q$, '22023', 'fuera_de_rango');
SELECT pg_temp.assert_eq('c: mesa accepts a child of 12 years',
  $q$SELECT public.ninos_registrar_familia_mesa(pg_temp.fam('Mesa12', '04120003113', '"Femenino"',
       jsonb_build_array(pg_temp.hijo('Mesa12 hijo', pg_temp.nac(12))))) ->> 'padre_nuevo'$q$, 'true');
RESET ROLE;
SELECT pg_temp.assert_eq('c: nothing stored for a refused child (no parent, no child)',
  $q$SELECT count(*)::text FROM public.usuarios u
      WHERE u.nombre IN ('ZZ Rr Mesa13', 'ZZ Rr Mesa13 hijo', 'ZZ Rr MesaFu', 'ZZ Rr MesaFu hijo', 'ZZ Rr Fam13 hijo')$q$, '0');
SELECT pg_temp.assert_eq('c: only the accepted family has an alta de mesa',
  $q$SELECT string_agg(u.nombre, ',') FROM public.ninos_altas_mesa a JOIN public.usuarios u ON u.id = a.padre_id
      WHERE u.nombre LIKE 'ZZ Rr Mesa%'$q$, 'ZZ Rr Mesa12');
SELECT pg_temp.assert_eq('c: the child of 12 years has a ficha',
  $q$SELECT count(*)::text FROM public.ninos_fichas f JOIN public.usuarios u ON u.id = f.usuario_id
      WHERE u.nombre = 'ZZ Rr Mesa12 hijo'$q$, '1');

-- ── d. confirming a pre-registration ─────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('d: confirming a public request with a child of 13 years is refused',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_pub')::uuid, 'confirmar',
       jsonb_set(pg_temp.ctx('payload_pub')::jsonb, '{hijos,0,fecha_nacimiento}', to_jsonb(pg_temp.nac(13))))$q$,
  '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('d: confirming a public request with a future birth date is refused',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_pub')::uuid, 'confirmar',
       jsonb_set(pg_temp.ctx('payload_pub')::jsonb, '{hijos,0,fecha_nacimiento}', to_jsonb(pg_temp.manana())))$q$,
  '22023', 'fuera_de_rango');
SELECT pg_temp.assert_raises('d: confirming an account request with a child of 13 years is refused',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_cuenta')::uuid, 'confirmar',
       jsonb_set(pg_temp.ctx('payload_cuenta')::jsonb, '{hijos,0,fecha_nacimiento}', to_jsonb(pg_temp.nac(13))))$q$,
  '22023', 'fuera_de_rango');
RESET ROLE;
SELECT pg_temp.assert_eq('d: both requests stay pendiente and no child is created',
  $q$SELECT string_agg(r.estado::text, ',') || ':' || (SELECT count(*) FROM public.usuarios u
                                                   WHERE u.nombre IN ('ZZ Rr Pub', 'ZZ Rr Pub hijo', 'ZZ Rr Pend'))
       FROM public.ninos_preregistros r
      WHERE r.id IN (pg_temp.ctx('pre_pub')::uuid, pg_temp.ctx('pre_cuenta')::uuid)$q$, 'pendiente,pendiente:0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('d: the account request with its child in range confirms (PRESERVE)',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_cuenta')::uuid, 'confirmar',
       pg_temp.ctx('payload_cuenta')::jsonb) ->> 'estado'$q$, 'confirmado');
SELECT pg_temp.assert_eq('d: the public request with its child in range confirms (PRESERVE)',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_pub')::uuid, 'confirmar',
       pg_temp.ctx('payload_pub')::jsonb) ->> 'padre_nuevo'$q$, 'true');

-- ── e. PRESERVE ninos_mis_hijos_registrar (already applies the range) ─

SELECT pg_temp.as_user(5);
SELECT pg_temp.assert_raises('e: mis hijos refuses a child of 13 years (PRESERVE)',
  $q$SELECT public.ninos_mis_hijos_registrar(jsonb_build_object('campus_id', pg_temp.ctx('campus'),
       'hijos', jsonb_build_array(pg_temp.hijo('Mh13', pg_temp.nac(13)))))$q$, '22023', 'edad_fuera_de_rango');
SELECT pg_temp.assert_raises('e: mis hijos refuses a future birth date (PRESERVE)',
  $q$SELECT public.ninos_mis_hijos_registrar(jsonb_build_object('campus_id', pg_temp.ctx('campus'),
       'hijos', jsonb_build_array(pg_temp.hijo('MhFu', pg_temp.manana()))))$q$, '22023', 'edad_fuera_de_rango');
SELECT pg_temp.assert_eq('e: mis hijos registers a child of 12 years (PRESERVE)',
  $q$SELECT jsonb_array_length(public.ninos_mis_hijos_registrar(jsonb_build_object('campus_id', pg_temp.ctx('campus'),
       'hijos', jsonb_build_array(pg_temp.hijo('Mh12', pg_temp.nac(12))))) -> 'registrados')::text$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('e: nothing stored for the refused children (PRESERVE)',
  $q$SELECT count(*)::text FROM public.usuarios u WHERE u.nombre IN ('ZZ Rr Mh13', 'ZZ Rr MhFu')$q$, '0');

-- ── f. PRESERVE permissions ──────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_preregistro_crear (PRESERVE)',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload_pub')::jsonb, 'zz-rf-a', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_registrar_familia_mesa (PRESERVE)',
  $q$SELECT public.ninos_registrar_familia_mesa(pg_temp.ctx('payload_pub')::jsonb)$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_registrar_familia (PRESERVE)',
  $q$SELECT public.ninos_registrar_familia(pg_temp.ctx('payload_pub')::jsonb)$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_preregistro_resolver (PRESERVE)',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_gm')::uuid, 'descartar')$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_mis_hijos_registrar (PRESERVE)',
  $q$SELECT public.ninos_mis_hijos_registrar('{}'::jsonb)$q$, '42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(3);
SELECT pg_temp.assert_raises('f: authenticated cannot execute ninos_preregistro_crear (PRESERVE)',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload_pub')::jsonb, 'zz-rf-b', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('f: a user who is not an anfitrión gets sin_autoridad from mesa (PRESERVE)',
  $q$SELECT public.ninos_registrar_familia_mesa(pg_temp.fam('Rnd', '04120003121', '"Femenino"',
       jsonb_build_array(pg_temp.hijo('Rnd hijo', pg_temp.nac(5)))))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: and from ninos_registrar_familia (PRESERVE)',
  $q$SELECT public.ninos_registrar_familia(pg_temp.fam('Rnd', '04120003121', '"Femenino"',
       jsonb_build_array(pg_temp.hijo('Rnd hijo', pg_temp.nac(5)))))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: and from ninos_preregistro_resolver (PRESERVE)',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre_gm')::uuid, 'descartar')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('f: no session gets sin_autoridad from mis hijos (PRESERVE)',
  $q$SELECT public.ninos_mis_hijos_registrar(jsonb_build_object('campus_id', pg_temp.ctx('campus'),
       'hijos', jsonb_build_array(pg_temp.hijo('Nadie', pg_temp.nac(5)))))$q$, '42501', 'sin_autoridad');
RESET ROLE;

SELECT pg_temp.assert_eq('f: grants of the redefined functions (PRESERVE)',
  $q$SELECT concat_ws(',',
       has_function_privilege('anon', 'public.ninos_registrar_familia(jsonb)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.ninos_registrar_familia(jsonb)', 'EXECUTE'),
       has_function_privilege('anon', 'public.ninos_preregistro_crear(uuid, jsonb, text, text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.ninos_preregistro_crear(uuid, jsonb, text, text)', 'EXECUTE'),
       has_function_privilege('service_role', 'public.ninos_preregistro_crear(uuid, jsonb, text, text)', 'EXECUTE'))$q$,
  'false,true,false,false,true');
SELECT pg_temp.assert_eq('f: both stay SECURITY DEFINER with an empty search_path (PRESERVE)',
  $q$SELECT string_agg(p.prosecdef::text || '|' || EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                         WHERE c LIKE 'search_path=%' AND replace(substr(c, 13), '"', '') = '')::text, ',' ORDER BY p.oid::regprocedure::text)
       FROM pg_proc p
      WHERE p.oid IN ('public.ninos_registrar_familia(jsonb)'::regprocedure,
                      'public.ninos_preregistro_crear(uuid, jsonb, text, text)'::regprocedure)$q$, 'true|true,true|true');

-- ── g. PRESERVE happy path at the desk ───────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('g: a new family with two children registers (PRESERVE)',
  $q$SELECT r ->> 'padre_nuevo' || ':' || jsonb_array_length(r -> 'hijos')
       FROM public.ninos_registrar_familia_mesa(
              pg_temp.fam('Feliz', '04120003131', '"Femenino"',
                          jsonb_build_array(pg_temp.hijo('Feliz uno', pg_temp.nac(3)), pg_temp.hijo('Feliz dos', pg_temp.nac(8))))
              || '{"autorizados": [{"nombre": "ZZ Rr Abuela", "telefono": "04120003132", "relacion": "Abuela"}]}'::jsonb) AS t(r)$q$,
  'true:2');
RESET ROLE;
SELECT pg_temp.assert_eq('g: parent género, fichas, pickup people and alta de mesa (PRESERVE)',
  $q$SELECT (SELECT u.genero::text FROM public.usuarios u WHERE u.nombre = 'ZZ Rr Feliz') || ':'
         || (SELECT count(*) FROM public.ninos_fichas f JOIN public.usuarios u ON u.id = f.usuario_id
              WHERE u.nombre IN ('ZZ Rr Feliz uno', 'ZZ Rr Feliz dos')) || ':'
         || (SELECT count(*) FROM public.ninos_autorizados_retiro a JOIN public.usuarios u ON u.id = a.nino_id
              WHERE a.nombre = 'ZZ Rr Abuela' AND u.nombre LIKE 'ZZ Rr Feliz %') || ':'
         || (SELECT count(*) FROM public.ninos_altas_mesa a JOIN public.usuarios u ON u.id = a.padre_id
              WHERE u.nombre = 'ZZ Rr Feliz' AND a.registrado_por = pg_temp.id('us', 1))$q$, 'Femenino:2:2:1');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_rr_failures;

ROLLBACK;
