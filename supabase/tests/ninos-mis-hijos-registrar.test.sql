-- M3 (odd/tasks/ninos-mis-hijos.md) — register a child from home
-- (20261012110000_ninos_mis_hijos_registrar.sql).
--
-- Covers:
--   a. Campus for the form: only campus with an active room, my principal
--      campus flagged; no current user → sin_autoridad.
--   b. R (no children yet) registers two children: both usable right away
--      (ficha with the "from home" marker, child → R 'padre' link, chosen
--      campus, pickup people on each), listed by ninos_mis_hijos; no room or
--      VIP set; nothing pending.
--   c. A likely duplicate (same name key and birth date as another family's
--      child, accents and case ignored) is not created: one pending request
--      with solicitado_por = R and the request payload shape; R sees it in
--      ninos_mis_hijos_pendientes, A does not; the anfitrión sees it in the
--      staff pending list.
--   d. The same child again (in my family, in my pending requests, twice in
--      one call) → hijo_ya_registrado; nothing written.
--   e. Keys: a parent, room, VIP or unknown key → campo_no_permitido (the
--      parent is never taken from the payload, so A cannot register for O).
--   f. Limits and validation: > 10 children per call, > 6 pickup people,
--      > 500 characters, 13 or older and a future birth date, missing
--      gender, non-boolean yes/no, unknown campus, empty list.
--   g. Daily cap: 10 children per account in 24 hours, pending included.
--   h. Staff pending list window: account requests stay 30 days, public QR
--      requests only the current week.
--   i. Privileges: anon cannot execute any new function; no current user →
--      sin_autoridad.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 PADRE A, 4 OTRO PADRE O, 5 RANDOM R,
-- 6 ANFITRION, 7 GHOST (auth user without usuarios row).
-- Children: 11 Uno (A's, 5 y, ficha), 14 Cuatro (O's, 6 y, ficha).
-- Tree: R → W → Anfitriones. Room S1 in W on the Barquisimeto campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_mr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_mr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_mr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_denied(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected permission denied, got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE 'permission denied%' THEN
      PERFORM pg_temp.fail(p_case, 'expected permission denied, got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9b20000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9b01' WHEN 'us' THEN '9b02' WHEN 'eq' THEN '9b04'
                       WHEN 'ro' THEN '9b05' WHEN 'sa' THEN '9b06' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_mr_ctx WHERE k = p_k;
$$;

-- A child of the payload: name, birth date (years and days ago), gender and extra keys.
CREATE OR REPLACE FUNCTION pg_temp.hijo(p_nombre text, p_anos int, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('nombre', p_nombre, 'apellido', 'ZZ Mr',
           'fecha_nacimiento', (public.ninos_hoy() - make_interval(years => p_anos) - interval '20 days')::date,
           'genero', 'Femenino') || p_extra;
$$;

-- A payload for the fixture campus with the given children and pickup people.
CREATE OR REPLACE FUNCTION pg_temp.payload(p_hijos jsonb, p_autorizados jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('campus_id', pg_temp.ctx('campus'), 'hijos', p_hijos, 'autorizados', p_autorizados);
$$;

-- The caller registers; the result is kept under p_k (an error is a failed case).
CREATE OR REPLACE FUNCTION pg_temp.registrar(p_k text, p jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_mr_ctx (k, v) VALUES (p_k, public.ninos_mis_hijos_registrar(p)::text);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('setup ' || p_k, SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_mr_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'mr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 4, 5, 6, 7]) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Ana', 'ZZ Mr', 'mr-1@example.test', '04129990971', 'Casado', 'Femenino'),
  (pg_temp.id('us', 4), pg_temp.id('au', 4), 'ZZ Olga', 'ZZ Mr2', 'mr-4@example.test', NULL, 'Soltero', 'Femenino'),
  (pg_temp.id('us', 5), pg_temp.id('au', 5), 'ZZ Rita', 'ZZ Mr', 'mr-5@example.test', '04129990975', 'Soltero', 'Femenino'),
  (pg_temp.id('us', 6), pg_temp.id('au', 6), 'ZZ Anfi', 'ZZ Mr', 'mr-6@example.test', NULL, 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 11), NULL, 'ZZ Uno', 'ZZ Mr', 'No especificado', 'Masculino',
   (public.ninos_hoy() - interval '5 years' - interval '20 days')::date),
  (pg_temp.id('us', 14), NULL, 'ZZ Cuatro', 'ZZ Mr', 'No especificado', 'Femenino',
   (public.ninos_hoy() - interval '6 years' - interval '20 days')::date);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 5), pg_temp.ctx('campus')::uuid, true);

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 11), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 14), pg_temp.id('us', 4), 'padre', true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Mr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Mr W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Mr S1', 20, 0, 71, 1);

INSERT INTO public.ninos_fichas (usuario_id) VALUES (pg_temp.id('us', 11)), (pg_temp.id('us', 14));

GRANT INSERT, SELECT, UPDATE ON t_mr_failures, t_mr_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.hijo(text, int, jsonb), pg_temp.payload(jsonb, jsonb),
  pg_temp.registrar(text, jsonb) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. campus for the form ───────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('a: the fixture campus is listed and flagged as R''s principal',
  $q$SELECT (e.c ->> 'principal') FROM jsonb_array_elements(public.ninos_mis_hijos_campus()) e(c)
      WHERE e.c ->> 'id' = pg_temp.ctx('campus')$q$, 'true');
INSERT INTO t_mr_ctx (k, v) VALUES ('a', public.ninos_mis_hijos_campus()::text);
RESET ROLE;
-- As postgres: the rooms are not readable by a parent.
SELECT pg_temp.assert_eq('a: only campus with an active room',
  $q$SELECT count(*)::text FROM jsonb_array_elements(pg_temp.ctx('a')::jsonb) e(c)
      WHERE NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = (e.c ->> 'id')::uuid AND s.activo)$q$, '0');
SET LOCAL ROLE authenticated;

-- ── b. register two children ─────────────────────────────────────────

SELECT pg_temp.registrar('b', pg_temp.payload(
  jsonb_build_array(pg_temp.hijo('ZZ Beta', 3, '{"alergias": "ZZ maní", "puede_comer": false, "grado": 0}'),
                    pg_temp.hijo('ZZ Gama', 7, '{"genero": "Masculino"}')),
  '[{"nombre": "ZZ Abuela Mr", "telefono": "04120000003", "relacion": "Abuela"}]'));
SELECT pg_temp.assert_eq('b: two registered, none pending',
  $q$SELECT jsonb_array_length(pg_temp.ctx('b')::jsonb -> 'registrados') || ':' || jsonb_array_length(pg_temp.ctx('b')::jsonb -> 'pendientes')$q$,
  '2:0');
SELECT pg_temp.assert_eq('b: ninos_mis_hijos lists both, oldest first',
  $q$SELECT string_agg(e.h ->> 'nombre', ',' ORDER BY e.n) FROM jsonb_array_elements(public.ninos_mis_hijos()) WITH ORDINALITY e(h, n)$q$,
  'ZZ Gama,ZZ Beta');
SELECT pg_temp.assert_eq('b: ficha fields as sent',
  $q$SELECT concat_ws(':', e.h ->> 'alergias', e.h ->> 'puede_comer', e.h ->> 'grado', jsonb_array_length(e.h -> 'autorizados'))
       FROM jsonb_array_elements(public.ninos_mis_hijos()) e(h) WHERE e.h ->> 'nombre' = 'ZZ Beta'$q$,
  'ZZ maní:false:0:1');
RESET ROLE;
SELECT pg_temp.assert_eq('b: marker, link, campus, pickup people; no room or VIP',
  $q$SELECT string_agg(concat_ws(':', f.desde_casa_por = pg_temp.id('us', 5), f.desde_casa_at IS NOT NULL,
                                 f.salon_preferido_id IS NULL AND f.es_vip_desde IS NULL,
                                 (SELECT count(*) FROM public.relaciones_usuarios r
                                   WHERE r.usuario1_id = u.id AND r.usuario2_id = pg_temp.id('us', 5) AND r.tipo_relacion = 'padre'),
                                 (SELECT count(*) FROM public.usuario_campus uc
                                   WHERE uc.usuario_id = u.id AND uc.campus_id = pg_temp.ctx('campus')::uuid),
                                 (SELECT count(*) FROM public.ninos_autorizados_retiro a WHERE a.nino_id = u.id AND a.activo)),
                       ',' ORDER BY u.nombre)
       FROM jsonb_array_elements(pg_temp.ctx('b')::jsonb -> 'registrados') e(h)
       JOIN public.usuarios u ON u.id = (e.h ->> 'id')::uuid
       JOIN public.ninos_fichas f ON f.usuario_id = u.id$q$,
  't:t:t:1:1:1,t:t:t:1:1:1');
SET LOCAL ROLE authenticated;

-- ── c. a likely duplicate waits for the team ─────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.registrar('c', pg_temp.payload(
  jsonb_build_array(pg_temp.hijo('zz cuátro', 6, '{"apellido": "ZZ MR", "notas": "ZZ nota"}'),
                    pg_temp.hijo('ZZ Delta', 2))));
SELECT pg_temp.assert_eq('c: Delta registered, Cuatro pending',
  $q$SELECT (pg_temp.ctx('c')::jsonb -> 'registrados' -> 0 ->> 'nombre') || ':' || (pg_temp.ctx('c')::jsonb -> 'pendientes' -> 0 ->> 'nombre')
            || ':' || jsonb_array_length(pg_temp.ctx('c')::jsonb -> 'pendientes')$q$,
  'ZZ Delta:zz cuátro:1');
SELECT pg_temp.assert_eq('c: R sees the pending request',
  $q$SELECT string_agg(e.h ->> 'nombre', ',') FROM jsonb_array_elements(public.ninos_mis_hijos_pendientes()) e(h)$q$,
  'zz cuátro');
SELECT pg_temp.assert_eq('c: the pending child is not in R''s children',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_mis_hijos()) e(h) WHERE e.h ->> 'nombre' = 'zz cuátro'$q$, '0');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: A does not see R''s request',
  $q$SELECT public.ninos_mis_hijos_pendientes()::text$q$, '[]');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('c: the anfitrión sees it with the request payload shape',
  $q$SELECT concat_ws(':', p.payload -> 'padre' ->> 'nombre', p.payload -> 'padre' ->> 'telefono',
                      p.payload -> 'hijos' -> 0 ->> 'notas', p.payload -> 'hijos' -> 0 ->> 'genero',
                      jsonb_typeof(p.payload -> 'autorizados'))
       FROM public.ninos_preregistros_pendientes() p WHERE p.payload -> 'padre' ->> 'nombre' = 'ZZ Rita'$q$,
  'ZZ Rita:04129990975:ZZ nota:Femenino:array');
RESET ROLE;
SELECT pg_temp.assert_eq('c: one request, solicitado_por R, pendiente',
  $q$SELECT count(*) || ':' || min(r.estado) FROM public.ninos_preregistros r WHERE r.solicitado_por = pg_temp.id('us', 5)$q$,
  '1:pendiente');
SET LOCAL ROLE authenticated;

-- ── d. the same child again ──────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('d: a child already in my family',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('zz beta', 3))))$q$,
  '23505', 'hijo_ya_registrado');
SELECT pg_temp.assert_raises('d: a child already in my pending requests',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Cuatro', 6))))$q$,
  '23505', 'hijo_ya_registrado');
SELECT pg_temp.assert_raises('d: twice in one call (all or nothing)',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Eps', 4), pg_temp.hijo('ZZ Eps', 4))))$q$,
  '23505', 'hijo_ya_registrado');
SELECT pg_temp.assert_eq('d: nothing written by the refused calls',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_mis_hijos()) e(h)$q$, '3');

-- ── e. keys ──────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('e: a parent in the payload (A cannot register for O)',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4)))
                                            || jsonb_build_object('padre', jsonb_build_object('id', pg_temp.id('us', 4))))$q$,
  '42501', 'campo_no_permitido');
SELECT pg_temp.assert_raises('e: a room for a child',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(
       pg_temp.hijo('ZZ Zeta', 4, jsonb_build_object('salon_preferido_id', pg_temp.id('sa', 1))))))$q$,
  '42501', 'campo_no_permitido');
SELECT pg_temp.assert_raises('e: VIP for a child',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4, '{"es_vip_desde": "2026-01-01"}'))))$q$,
  '42501', 'campo_no_permitido');
SELECT pg_temp.assert_raises('e: a link to another adult',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4)))
                                            || '{"otros_padres": []}'::jsonb)$q$,
  '42501', 'campo_no_permitido');

-- ── f. limits and validation ─────────────────────────────────────────

SELECT pg_temp.assert_raises('f: more than 10 children in one call',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(
       (SELECT jsonb_agg(pg_temp.hijo('ZZ Muchos ' || n, 4)) FROM generate_series(1, 11) n)))$q$,
  '22023', 'limite_hijos');
SELECT pg_temp.assert_raises('f: more than 6 pickup people',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4)),
       (SELECT jsonb_agg(jsonb_build_object('nombre', 'ZZ P' || n)) FROM generate_series(1, 7) n)))$q$,
  '22023', 'limite_autorizados');
SELECT pg_temp.assert_raises('f: more than 500 characters',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(
       pg_temp.hijo('ZZ Zeta', 4, jsonb_build_object('alergias', repeat('x', 501))))))$q$,
  '22023', 'texto_muy_largo');
SELECT pg_temp.assert_raises('f: 13 or older',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 13))))$q$,
  '22023', 'edad_fuera_de_rango');
SELECT pg_temp.assert_raises('f: a future birth date',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(
       pg_temp.hijo('ZZ Zeta', 4, jsonb_build_object('fecha_nacimiento', public.ninos_hoy() + 3)))))$q$,
  '22023', 'edad_fuera_de_rango');
SELECT pg_temp.assert_raises('f: missing gender',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4) - 'genero')))$q$,
  '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('f: a yes/no that is not a boolean',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4, '{"cambio_panal": "si"}'))))$q$,
  '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('f: an unknown campus',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4)))
                                            || jsonb_build_object('campus_id', gen_random_uuid()))$q$,
  '22023', 'sin_campus');
SELECT pg_temp.assert_raises('f: an empty list',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload('[]'::jsonb))$q$,
  '22023', 'datos_invalidos');
SELECT pg_temp.assert_eq('f: A wrote nothing',
  $q$SELECT jsonb_array_length(public.ninos_mis_hijos())::text$q$, '1');

-- ── g. daily cap (R already has 3 registered + 1 pending) ────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('g: 4 + 7 > 10 in 24 hours',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(
       (SELECT jsonb_agg(pg_temp.hijo('ZZ Cupo ' || n, 4)) FROM generate_series(1, 7) n)))$q$,
  '22023', 'limite_diario');
SELECT pg_temp.registrar('g', pg_temp.payload(
  (SELECT jsonb_agg(pg_temp.hijo('ZZ Cupo ' || n, 4)) FROM generate_series(1, 6) n)));
SELECT pg_temp.assert_eq('g: up to 10 accepted',
  $q$SELECT jsonb_array_length(pg_temp.ctx('g')::jsonb -> 'registrados')::text$q$, '6');
SELECT pg_temp.assert_raises('g: the 11th is refused',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Once', 4))))$q$,
  '22023', 'limite_diario');

-- ── h. staff pending window ──────────────────────────────────────────

RESET ROLE;
WITH n AS (
  INSERT INTO public.ninos_preregistros (campus_id, payload, solicitado_por, created_at) VALUES
    (pg_temp.ctx('campus')::uuid, '{"padre": {"nombre": "ZZ Vieja cuenta"}, "hijos": []}', pg_temp.id('us', 1), now() - interval '20 days'),
    (pg_temp.ctx('campus')::uuid, '{"padre": {"nombre": "ZZ Muy vieja cuenta"}, "hijos": []}', pg_temp.id('us', 1), now() - interval '40 days'),
    (pg_temp.ctx('campus')::uuid, '{"padre": {"nombre": "ZZ Vieja QR"}, "hijos": []}', NULL, now() - interval '20 days')
  RETURNING id)
SELECT 1;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('h: account requests stay 30 days; QR only this week',
  $q$SELECT coalesce(string_agg(p.payload -> 'padre' ->> 'nombre', ',' ORDER BY p.created_at), '')
       FROM public.ninos_preregistros_pendientes() p WHERE p.payload -> 'padre' ->> 'nombre' LIKE 'ZZ %ieja%'$q$,
  'ZZ Vieja cuenta');

-- ── i. privileges ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('i: no current user cannot register',
  $q$SELECT public.ninos_mis_hijos_registrar(pg_temp.payload(jsonb_build_array(pg_temp.hijo('ZZ Zeta', 4))))$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('i: no current user gets no campus list',
  $q$SELECT public.ninos_mis_hijos_campus()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('i: no current user gets no pending list',
  $q$SELECT public.ninos_mis_hijos_pendientes()$q$, '42501', 'sin_autoridad');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('i: anon cannot execute ninos_mis_hijos_registrar',
  $q$SELECT public.ninos_mis_hijos_registrar('{}'::jsonb)$q$);
SELECT pg_temp.assert_denied('i: anon cannot execute ninos_mis_hijos_campus',
  $q$SELECT public.ninos_mis_hijos_campus()$q$);
SELECT pg_temp.assert_denied('i: anon cannot execute ninos_mis_hijos_pendientes',
  $q$SELECT public.ninos_mis_hijos_pendientes()$q$);

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_mr_failures;

ROLLBACK;
