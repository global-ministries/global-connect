-- M6 (odd/tasks/ninos-mis-hijos.md) — the staff side of "Mis hijos"
-- (20261012150000_ninos_mis_hijos_equipo.sql).
--
-- Covers:
--   a. A request made from an account (R asked for two children that look
--      like O's children X and Z): the anfitrión sees R as the requester and
--      X and Z as the matching people (with O's name, never contact data); R
--      and anon do not.
--   b. Confirming it: X is linked to R instead of being created (existente_id),
--      the second child is created and linked to R, no adult is created even
--      when the staff payload carries other parent data, and the request is
--      confirmed with R as the family parent.
--   c. existente_id must be the person with the child's name key and birth
--      date (nino_no_encontrado), and is refused on a public QR request.
--   d. "Registrado desde casa": both children R registers from home carry
--      desde_casa until their own first check-in; the history stays.
--   e. Pickup-change recipients: R changes X's pickup list; only the service
--      role reads the other parent (O) and the new list, never a parent or
--      anon; nothing for an account that made no change.
--   f. A minor account (G8) sees no children, cannot edit or register; an
--      adult without a birth date keeps Mis hijos.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 PADRE O, 5 REQUESTER R, 6 ANFITRION, 7 TEEN (16).
-- Children: 11 X (O's, ficha), 12 Z (O's, ficha).
-- Tree: R → W → Anfitriones. Room S1 in W on the Barquisimeto campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_me_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_me_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_me_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9b30000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9c01' WHEN 'us' THEN '9c02' WHEN 'eq' THEN '9c04'
                       WHEN 'ro' THEN '9c05' WHEN 'sa' THEN '9c06' WHEN 'pr' THEN '9c07' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_me_ctx WHERE k = p_k;
$$;

-- A birth date p_anos years (and 20 days) ago.
CREATE OR REPLACE FUNCTION pg_temp.nac(p_anos int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (public.ninos_hoy() - make_interval(years => p_anos) - interval '20 days')::date;
$$;

-- A child of the payload; p_extra adds or overrides keys.
CREATE OR REPLACE FUNCTION pg_temp.hijo(p_nombre text, p_anos int, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('nombre', p_nombre, 'apellido', 'ZZ Me', 'fecha_nacimiento', pg_temp.nac(p_anos),
           'genero', 'Femenino') || p_extra;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_me_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'me-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 5, 6]) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Olga', 'ZZ Me2', 'me-1@example.test', '04129990981', 'Casado', 'Femenino'),
  (pg_temp.id('us', 5), pg_temp.id('au', 5), 'ZZ Rita', 'ZZ Me', 'me-5@example.test', '04129990985', 'Soltero', 'Femenino'),
  (pg_temp.id('us', 6), pg_temp.id('au', 6), 'ZZ Anfi', 'ZZ Me', 'me-6@example.test', NULL, 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 11), NULL, 'ZZ Equis', 'ZZ Me', 'No especificado', 'Femenino', pg_temp.nac(5)),
  (pg_temp.id('us', 12), NULL, 'ZZ Zeta', 'ZZ Me', 'No especificado', 'Femenino', pg_temp.nac(7));
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 5), pg_temp.ctx('campus')::uuid, true);
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 11), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 12), pg_temp.id('us', 1), 'padre', true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Me R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Me W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Me S1', 20, 0, 155, 1);

INSERT INTO public.ninos_fichas (usuario_id) VALUES (pg_temp.id('us', 11)), (pg_temp.id('us', 12));

-- A public QR request (no account).
INSERT INTO public.ninos_preregistros (id, campus_id, payload) VALUES
  (pg_temp.id('pr', 1), pg_temp.ctx('campus')::uuid,
   jsonb_build_object('padre', jsonb_build_object('nombre', 'ZZ Qr', 'apellido', 'ZZ Me', 'telefono', '04129990989'),
                      'hijos', jsonb_build_array(pg_temp.hijo('ZZ Qrito', 4)), 'autorizados', '[]'::jsonb));

GRANT INSERT, SELECT, UPDATE ON t_me_failures, t_me_ctx TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.nac(int), pg_temp.hijo(text, int, jsonb) TO authenticated, anon, service_role;

SET LOCAL ROLE authenticated;

-- R asks for two children that look like X and Z: both wait as one request.
SELECT pg_temp.as_persona(5);
INSERT INTO t_me_ctx (k, v)
SELECT 'req', public.ninos_mis_hijos_registrar(jsonb_build_object(
  'campus_id', pg_temp.ctx('campus'),
  'hijos', jsonb_build_array(pg_temp.hijo('ZZ Équis', 5), pg_temp.hijo('zz zeta', 7)),
  'autorizados', '[{"nombre": "ZZ Abuela Me"}]'::jsonb))::text;
RESET ROLE;
INSERT INTO t_me_ctx (k, v)
SELECT 'pre', r.id::text FROM public.ninos_preregistros r WHERE r.solicitado_por = pg_temp.id('us', 5);
SET LOCAL ROLE authenticated;

-- ── a. requester and matches in the pending list ─────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('a: the anfitrión sees R as the requester',
  $q$SELECT e.c -> 'solicitante' ->> 'id' || ':' || (e.c -> 'solicitante' ->> 'nombre')
       FROM jsonb_array_elements(public.ninos_preregistros_cuentas()) e(c) WHERE e.c ->> 'id' = pg_temp.ctx('pre')$q$,
  pg_temp.id('us', 5)::text || ':ZZ Rita');
SELECT pg_temp.assert_eq('a: each child lists the matching person, ficha and parents',
  $q$SELECT string_agg(concat_ws(':', m.x ->> 'indice', (m.x ->> 'id' = pg_temp.id('us', 11 + (m.x ->> 'indice')::int)::text)::text,
                                 m.x ->> 'tiene_ficha', m.x -> 'padres' ->> 0), ',' ORDER BY m.x ->> 'indice')
       FROM jsonb_array_elements(public.ninos_preregistros_cuentas()) e(c), jsonb_array_elements(e.c -> 'coincidencias') m(x)
      WHERE e.c ->> 'id' = pg_temp.ctx('pre')$q$,
  '0:true:true:ZZ Olga ZZ Me2,1:true:true:ZZ Olga ZZ Me2');
SELECT pg_temp.assert_eq('a: no contact data in the matches',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_preregistros_cuentas()) e(c),
            jsonb_array_elements(e.c -> 'coincidencias') m(x)
      WHERE m.x ?| ARRAY['telefono', 'email', 'cedula']$q$, '0');
SELECT pg_temp.assert_eq('a: a QR request is not listed as an account request',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_preregistros_cuentas()) e(c)
      WHERE e.c ->> 'id' = pg_temp.id('pr', 1)::text$q$, '0');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('a: R (no Niños authority) sees nothing',
  $q$SELECT public.ninos_preregistros_cuentas()::text$q$, '[]');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('a: anon cannot execute ninos_preregistros_cuentas',
  $q$SELECT public.ninos_preregistros_cuentas()$q$);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_denied('a: clients cannot execute ninos_preregistro_confirmar_cuenta',
  $q$SELECT public.ninos_preregistro_confirmar_cuenta(pg_temp.id('us', 5), '{}'::jsonb)$q$);

-- ── c. existente_id is bounded ───────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('c: existente_id of a person with another name → nino_no_encontrado',
  format($q$SELECT public.ninos_preregistro_resolver(%L, 'confirmar', %L)$q$, pg_temp.ctx('pre'),
    jsonb_build_object('padre', '{}'::jsonb,
      'hijos', jsonb_build_array(pg_temp.hijo('ZZ Équis', 5, jsonb_build_object('existente_id', pg_temp.id('us', 12)))),
      'autorizados', '[]'::jsonb)),
  '22023', 'nino_no_encontrado');
SELECT pg_temp.assert_raises('c: existente_id on a public QR request → datos_invalidos',
  format($q$SELECT public.ninos_preregistro_resolver(%L, 'confirmar', %L)$q$, pg_temp.id('pr', 1),
    jsonb_build_object('padre', jsonb_build_object('nombre', 'ZZ Qr', 'apellido', 'ZZ Me', 'telefono', '04129990989',
                                                   'genero', 'Femenino'),
      'hijos', jsonb_build_array(pg_temp.hijo('ZZ Qrito', 4, jsonb_build_object('existente_id', pg_temp.id('us', 11)))),
      'autorizados', '[]'::jsonb)),
  '22023', 'datos_invalidos');

-- ── b. confirm: link X, create the second child, never a new adult ───

RESET ROLE;
INSERT INTO t_me_ctx (k, v) SELECT 'adultos', count(*)::text FROM public.usuarios WHERE fecha_nacimiento IS NULL;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('b: confirming returns R as the parent and X as linked',
  format($q$SELECT (r ->> 'padre_id') || ':' || (r ->> 'padre_nuevo') || ':' || (r -> 'vinculados' ->> 0) || ':'
                   || jsonb_array_length(r -> 'hijos')
              FROM public.ninos_preregistro_resolver(%L, 'confirmar', %L) r$q$, pg_temp.ctx('pre'),
    jsonb_build_object(
      -- Copied parent data of the request (the phone exists: R): never used.
      'padre', jsonb_build_object('nombre', 'ZZ Rita', 'apellido', 'ZZ Me', 'telefono', '04129990985', 'genero', 'Femenino'),
      'hijos', jsonb_build_array(pg_temp.hijo('ZZ Équis', 5, jsonb_build_object('existente_id', pg_temp.id('us', 11))),
                                 pg_temp.hijo('zz zeta', 7)),
      'autorizados', '[{"nombre": "ZZ Abuela Me"}]'::jsonb)),
  pg_temp.id('us', 5)::text || ':false:' || pg_temp.id('us', 11)::text || ':1');
RESET ROLE;
SELECT pg_temp.assert_eq('b: no adult was created',
  $q$SELECT count(*)::text FROM public.usuarios WHERE fecha_nacimiento IS NULL$q$, pg_temp.ctx('adultos'));
SELECT pg_temp.assert_eq('b: X is linked to R and still to O',
  $q$SELECT string_agg(r.usuario2_id::text, ',' ORDER BY r.usuario2_id = pg_temp.id('us', 1) DESC)
       FROM public.relaciones_usuarios r WHERE r.usuario1_id = pg_temp.id('us', 11) AND r.tipo_relacion = 'padre'$q$,
  pg_temp.id('us', 1)::text || ',' || pg_temp.id('us', 5)::text);
SELECT pg_temp.assert_eq('b: R now has X and a new Zeta (not O''s Z)',
  $q$SELECT string_agg(CASE WHEN e.h ->> 'id' = pg_temp.id('us', 11)::text THEN 'X'
                            WHEN e.h ->> 'id' = pg_temp.id('us', 12)::text THEN 'Z'
                            ELSE 'nuevo:' || (e.h ->> 'nombre') || ':' || jsonb_array_length(e.h -> 'autorizados') END,
                       ',' ORDER BY e.h ->> 'fecha_nacimiento' DESC)
       FROM jsonb_array_elements(public.ninos_familia_hijos(pg_temp.id('us', 5))) e(h)$q$,
  'X,nuevo:zz zeta:1');
SELECT pg_temp.assert_eq('b: the request is confirmed with R as the family parent',
  $q$SELECT r.estado || ':' || (r.familia_padre_id = pg_temp.id('us', 5)) || ':' || (r.confirmado_por = pg_temp.id('us', 6))
       FROM public.ninos_preregistros r WHERE r.id = pg_temp.ctx('pre')::uuid$q$,
  'confirmado:true:true');

-- ── d. "Registrado desde casa" until the first check-in ──────────────

INSERT INTO t_me_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t
 WHERE t.campus_id = pg_temp.ctx('campus')::uuid AND t.activo ORDER BY t.dia_semana, t.hora LIMIT 1;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
INSERT INTO t_me_ctx (k, v)
SELECT 'casa', public.ninos_mis_hijos_registrar(jsonb_build_object(
  'campus_id', pg_temp.ctx('campus'),
  'hijos', jsonb_build_array(pg_temp.hijo('ZZ Nuevo', 4), pg_temp.hijo('ZZ Otro', 6))))::text;
RESET ROLE;
INSERT INTO t_me_ctx (k, v)
SELECT 'nuevo', e.r ->> 'id' FROM jsonb_array_elements(pg_temp.ctx('casa')::jsonb -> 'registrados') e(r)
 WHERE e.r ->> 'nombre' = 'ZZ Nuevo';
SELECT pg_temp.assert_eq('d: both children registered from home carry the badge',
  $q$SELECT string_agg((e.h ->> 'nombre') || ':' || (e.h ->> 'desde_casa'), ',' ORDER BY e.h ->> 'nombre')
       FROM jsonb_array_elements(public.ninos_familia_hijos(pg_temp.id('us', 5))) e(h)$q$,
  'ZZ Equis:false,ZZ Nuevo:true,ZZ Otro:true,zz zeta:false');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('d: the anfitrión checks ZZ Nuevo in',
  $q$SELECT count(*)::text FROM public.ninos_checkin(ARRAY[pg_temp.ctx('nuevo')::uuid], pg_temp.ctx('turno')::uuid,
                                                      DATE '2099-01-04', ARRAY[pg_temp.id('sa', 1)])$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the first check-in clears the badge of that child only',
  $q$SELECT string_agg((e.h ->> 'nombre') || ':' || (e.h ->> 'desde_casa'), ',' ORDER BY e.h ->> 'nombre')
       FROM jsonb_array_elements(public.ninos_familia_hijos(pg_temp.id('us', 5))) e(h)
      WHERE e.h ->> 'nombre' IN ('ZZ Nuevo', 'ZZ Otro')$q$,
  'ZZ Nuevo:false,ZZ Otro:true');
SELECT pg_temp.assert_eq('d: the from-home history stays',
  $q$SELECT (f.desde_casa_at IS NOT NULL AND f.desde_casa_por = pg_temp.id('us', 5) AND f.desde_casa_confirmado_at IS NOT NULL)::text
       FROM public.ninos_fichas f WHERE f.usuario_id = pg_temp.ctx('nuevo')::uuid$q$, 'true');
SELECT pg_temp.assert_eq('d: clients cannot execute the trigger function',
  $q$SELECT (has_function_privilege('authenticated', 'public.ninos_checkins_confirmar_desde_casa()', 'EXECUTE')
             OR has_function_privilege('anon', 'public.ninos_checkins_confirmar_desde_casa()', 'EXECUTE'))::text$q$, 'false');

-- ── e. pickup-change email recipients (service role only) ────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('e: R changes X''s pickup list from Mis hijos',
  format($q$SELECT public.ninos_mis_hijos_guardar(%L, %L) ->> 'campos'$q$, pg_temp.id('us', 11),
         '{"autorizados": [{"nombre": "ZZ Tía Me", "telefono": "04120000001", "relacion": "Tía"}]}'),
  '["autorizados"]');
SELECT pg_temp.assert_denied('e: a parent cannot read the recipients',
  format($q$SELECT public.ninos_aviso_autorizados(%L, %L)$q$, pg_temp.id('us', 11), pg_temp.id('au', 5)));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_denied('e: anon cannot read the recipients',
  format($q$SELECT public.ninos_aviso_autorizados(%L, %L)$q$, pg_temp.id('us', 11), pg_temp.id('au', 5)));
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_eq('e: the other parent (O) is the only recipient, with the new list',
  format($q$SELECT concat_ws('|', r ->> 'nino_nombre', r ->> 'actor_nombre', r -> 'autorizados' -> 0 ->> 'nombre',
                             r -> 'autorizados' -> 0 ->> 'relacion', ((r -> 'autorizados' -> 0) ? 'telefono')::text,
                             jsonb_array_length(r -> 'destinatarios'), r -> 'destinatarios' -> 0 ->> 'email',
                             (r ->> 'cambio_id' IS NOT NULL)::text)
              FROM public.ninos_aviso_autorizados(%L, %L) r$q$, pg_temp.id('us', 11), pg_temp.id('au', 5)),
  'ZZ Equis|ZZ Rita ZZ Me|ZZ Tía Me|Tía|false|1|me-1@example.test|true');
SELECT pg_temp.assert_eq('e: nothing for an account that made no pickup change',
  format($q$SELECT coalesce(public.ninos_aviso_autorizados(%L, %L)::text, 'NULL')$q$, pg_temp.id('us', 11), pg_temp.id('au', 1)),
  'NULL');
RESET ROLE;

-- ── f. no Mis hijos for an account of a minor (G8) ───────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.id('au', 7), 'authenticated', 'authenticated', 'me-7@example.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 7), pg_temp.id('au', 7), 'ZZ Teen', 'ZZ Me', 'me-7@example.test', 'Soltero', 'Masculino', pg_temp.nac(16));
-- A teen wrongly linked as X's parent.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 11), pg_temp.id('us', 7), 'padre', false);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('f: a minor sees no children', $q$SELECT public.ninos_mis_hijos()::text$q$, '[]');
SELECT pg_temp.assert_raises('f: a minor cannot edit the linked child',
  format($q$SELECT public.ninos_mis_hijos_guardar(%L, '{"alergias": "x"}')$q$, pg_temp.id('us', 11)),
  '22023', 'nino_no_encontrado');
SELECT pg_temp.assert_raises('f: a minor gets no campus list',
  $q$SELECT public.ninos_mis_hijos_campus()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a minor cannot register children',
  format($q$SELECT public.ninos_mis_hijos_registrar(%L)$q$,
         jsonb_build_object('campus_id', pg_temp.ctx('campus'), 'hijos', jsonb_build_array(pg_temp.hijo('ZZ Teenito', 1)))),
  '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('f: an adult without a birth date keeps Mis hijos',
  $q$SELECT (jsonb_array_length(public.ninos_mis_hijos()) > 0)::text$q$, 'true');
SELECT pg_temp.assert_denied('f: clients cannot execute ninos_es_mayor_de_edad',
  format($q$SELECT public.ninos_es_mayor_de_edad(%L)$q$, pg_temp.id('us', 5)));
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_me_failures;

ROLLBACK;
