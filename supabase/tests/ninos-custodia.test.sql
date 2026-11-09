-- T2e (odd/tasks/ninos-checkin-pco.md, S9.2 "Solo coordinación/dirección de
-- Niños") — custody restrictions (20261108170000_ninos_custodia.sql).
--
-- Covers:
--   a. Authority to write (ninos_custodia_guardar) and to list the ficha
--      (ninos_custodia_lista): the coordinator of the child's campus yes; the
--      anfitrión, a volunteer, the líder, a parent, a random user and the
--      coordinator of another campus no (sin_autoridad, 42501, with HINT).
--   b. Validation: persona, respaldo, relación and notas lengths, a duplicate
--      active restriction for the same name, an id of another child.
--   c. Read scope (ninos_custodia_de): operators of the child's campus and the
--      líder who sees the child's salón today read the active restrictions;
--      the coordinator of another campus reads nothing; a volunteer, a parent
--      and a random user are refused; inactive restrictions are not listed.
--   d. Pickup: ninos_checkout refuses the restricted name (same key with other
--      case, spacing and accents; also as «otra persona» with a reason, and
--      with the whole code) with custodia_restringida 42501 + HINT; the sibling
--      without a restriction is picked up by that person; ninos_retiro_opciones
--      leaves the person out for the restricted child only; a deactivated
--      restriction no longer blocks; nothing is written on any refusal.
--   e. Grants and exposure: RPCs for authenticated only, the table is not
--      readable directly, and no other function reads the table.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION W, 2 RANDOM, 3 COORD W,
-- 4 VOLUNTARIO W (Maternal), 5 PADRE of K1, 6 COORD U (other campus), 7 LÍDER W.
-- Tree: R → W → {Anfitriones, Maternal}; R → U. Salones S1 (W, Barquisimeto),
-- S2 (U, Cabudare). Family: K1, K2 (mother, grandmother for both); K3 is a
-- child of Cabudare.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cu_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_cu_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cu_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL,
                                                 p_hint text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hint text;
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message)
       OR (p_hint IS NOT NULL AND v_hint IS DISTINCT FROM p_hint) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '')
        || coalesce(' / ' || p_hint, '') || ', got ' || SQLSTATE || ' ' || SQLERRM || coalesce(' / ' || v_hint, ''));
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
  SELECT format('c0570000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c701' WHEN 'us' THEN 'c702' WHEN 'eq' THEN 'c704'
                       WHEN 'ro' THEN 'c705' WHEN 'sa' THEN 'c706' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_cu_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.k(p_n int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('k' || p_n)::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.codigo(p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('codigo ' || p_fecha::text);
$$;

-- ninos_custodia_guardar with the usual arguments; returns the id.
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_id uuid, p_nino uuid, p_persona text, p_respaldo text,
                                           p_relacion text DEFAULT NULL, p_notas text DEFAULT NULL,
                                           p_activa boolean DEFAULT true)
RETURNS uuid LANGUAGE sql AS $$
  SELECT public.ninos_custodia_guardar(p_id, p_nino, p_persona, p_relacion, p_respaldo, p_notas, p_activa);
$$;

-- ninos_checkout on the fixture turno; returns how many children left.
CREATE OR REPLACE FUNCTION pg_temp.retirar(p_fecha date, p_quien text, p_ninos uuid[], p_motivo text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT count(*)::int FROM public.ninos_checkout(pg_temp.codigo(p_fecha), pg_temp.ctx('turno')::uuid, p_fecha,
                                                          p_quien, p_motivo, p_ninos));
END;
$$;

-- The pick list of the code for the marked children: 'name,name'.
CREATE OR REPLACE FUNCTION pg_temp.opciones(p_fecha date, p_ninos uuid[]) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(nombre, ',' ORDER BY nombre)
    FROM public.ninos_retiro_opciones(pg_temp.codigo(p_fecha), pg_temp.ctx('turno')::uuid, p_fecha, p_ninos);
$$;

-- What ninos_custodia_de returns for the children: 'K1:persona|respaldo,…'.
CREATE OR REPLACE FUNCTION pg_temp.de(p_ninos uuid[]) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(
           CASE d.nino_id WHEN pg_temp.k(1) THEN 'K1' WHEN pg_temp.k(2) THEN 'K2' WHEN pg_temp.k(3) THEN 'K3' ELSE '?' END
           || ':' || d.persona_nombre || '|' || d.respaldo, ',' ORDER BY d.nino_id = pg_temp.k(1) DESC, d.persona_nombre), '-')
    FROM public.ninos_custodia_de(p_ninos) d;
$$;

-- Who is still inside on a date (as postgres): 'K1,K2' or '-'.
CREATE OR REPLACE FUNCTION pg_temp.adentro(p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(x.k, ',' ORDER BY x.k), '-')
    FROM (SELECT 'K' || n AS k FROM generate_series(1, 2) n
            JOIN public.ninos_checkins c ON c.nino_id = pg_temp.k(n)
           WHERE c.fecha = p_fecha AND c.turno_id = pg_temp.ctx('turno')::uuid AND c.salida_at IS NULL) x;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_cu_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo AND t.tipo = 'semanal' ORDER BY t.hora LIMIT 1;
INSERT INTO t_cu_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;
-- A campus of its own as "the other campus" (staging may have only one).
INSERT INTO public.campus (id, nombre, codigo) VALUES ('c0570000-0000-4000-c708-000000000002', 'ZZ Cu Campus 2', 'ZZCU2');
INSERT INTO t_cu_ctx (k, v) VALUES ('campus2', 'c0570000-0000-4000-c708-000000000002');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cu-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 7) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cu', 'U' || n, 'cu-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 7) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Cu R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Cu W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 1), 'ZZ Cu U', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 2), 'Maternal', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 5), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 4), pg_temp.id('eq', 5), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 7) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 3), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 6), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text),
  (pg_temp.id('us', 7), 'dream_team.lead', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Cu S1', 20, 1, 1, -100),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus2')::uuid, pg_temp.id('eq', 4), 'upstreet', 'ZZ Cu S2', 20, 1, 1, -99);

GRANT INSERT, SELECT, UPDATE ON t_cu_failures, t_cu_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.k(int), pg_temp.codigo(date),
  pg_temp.guardar(uuid, uuid, text, text, text, text, boolean), pg_temp.retirar(date, text, uuid[], text),
  pg_temp.opciones(date, uuid[]), pg_temp.de(uuid[]), pg_temp.adentro(date)
  TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT public.ninos_registrar_familia(jsonb_build_object(
  'padre', jsonb_build_object('nombre', 'ZZ Cu Mamá', 'apellido', 'Prueba', 'telefono', '0414-555-5701', 'genero', 'Femenino'),
  'hijos', jsonb_build_array(
    jsonb_build_object('nombre', 'ZZ Cu Uno', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1),
    jsonb_build_object('nombre', 'ZZ Cu Dos', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-06-01', 'genero', 'Masculino', 'grado', 1)),
  'autorizados', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Cu Abuela', 'telefono', '04120005701', 'relacion', 'Abuela'))));
RESET ROLE;
INSERT INTO t_cu_ctx (k, v)
SELECT 'k1', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Cu Uno' AND u.apellido = 'Prueba';
INSERT INTO t_cu_ctx (k, v)
SELECT 'k2', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Cu Dos' AND u.apellido = 'Prueba';
-- K3: a child of the other campus.
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 13), 'ZZ Cu Tres', 'Otra', 'No especificado', 'Masculino');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 13), pg_temp.ctx('campus2')::uuid, true);
INSERT INTO t_cu_ctx (k, v) VALUES ('k3', pg_temp.id('us', 13)::text);
-- The parent account of K1 (5).
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
VALUES (pg_temp.k(1), pg_temp.id('us', 5), 'padre');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_cu_ctx (k, v)
SELECT 'codigo ' || f::text, (SELECT min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.k(1), pg_temp.k(2)],
         pg_temp.ctx('turno')::uuid, f, ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)]))
  FROM unnest(ARRAY[DATE '2099-05-02', DATE '2099-05-09', DATE '2099-05-16']) f;
RESET ROLE;
-- Today: K1 inside S1 (the líder's salón).
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por) -- noqa: insert-into
SELECT c.nino_id, c.salon_id, c.turno_id, c.campus_id, public.ninos_hoy(), gen_random_uuid(), '5701', pg_temp.id('us', 1)
  FROM public.ninos_checkins c WHERE c.nino_id = pg_temp.k(1) AND c.fecha = DATE '2099-05-02';

SELECT pg_temp.assert_eq('fixtures: three family codes, three children, the other campus',
  $q$SELECT (SELECT count(*) FROM t_cu_ctx WHERE k LIKE 'codigo %' AND v ~ '^[0-9]{4}$')::text || '/'
            || (SELECT count(*) FROM t_cu_ctx WHERE k IN ('k1', 'k2', 'k3') AND v IS NOT NULL)::text || '/'
            || (pg_temp.ctx('campus2') IS NOT NULL)::text$q$, '3/3/true');

SET LOCAL ROLE authenticated;

-- ── a. authority to write ────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
INSERT INTO t_cu_ctx (k, v)
SELECT 'r abuela', pg_temp.guardar(NULL, pg_temp.k(1), '  ZZ Cu Abuela ', 'Orden judicial del 3/5/2026', 'Abuela',
                                   'No entregar. Mantener al niño en el salón y avisar a coordinación.')::text;
INSERT INTO t_cu_ctx (k, v)
SELECT 'r jose', pg_temp.guardar(NULL, pg_temp.k(1), 'José Pérez', 'Medida de protección del 1/4/2026', 'Papá')::text;
SELECT pg_temp.assert_eq('a: the coordinator of the campus writes two restrictions for K1 (trimmed, active)',
  $q$SELECT string_agg(r.persona_nombre || '|' || coalesce(r.relacion, '-') || '|' || r.activa
                       || '|' || (r.created_by = pg_temp.id('us', 3)) || '|' || (r.updated_by = pg_temp.id('us', 3)), ','
                       ORDER BY r.persona_nombre)
       FROM public.ninos_custodia_lista(pg_temp.k(1)) r$q$,
  'José Pérez|Papá|true|true|true,ZZ Cu Abuela|Abuela|true|true|true');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: the anfitrión cannot write',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad',
  'Solo coordinación o dirección de Niños puede registrar restricciones de custodia.');
SELECT pg_temp.assert_raises('a: the anfitrión cannot deactivate',
  $q$SELECT pg_temp.guardar(pg_temp.ctx('r abuela')::uuid, pg_temp.k(1), 'ZZ Cu Abuela', 'Orden', NULL, NULL, false)$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: the anfitrión cannot list the ficha',
  $q$SELECT count(*) FROM public.ninos_custodia_lista(pg_temp.k(1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('a: a volunteer cannot write',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('a: the parent cannot write',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: the parent cannot list the ficha',
  $q$SELECT count(*) FROM public.ninos_custodia_lista(pg_temp.k(1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('a: a random user cannot write',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('a: the líder cannot write',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('a: the coordinator of another campus cannot write for K1',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: nor edit K1''s restriction',
  $q$SELECT pg_temp.guardar(pg_temp.ctx('r abuela')::uuid, pg_temp.k(1), 'ZZ Cu Abuela', 'Orden', NULL, NULL, false)$q$,
  '42501', 'sin_autoridad');
INSERT INTO t_cu_ctx (k, v)
SELECT 'r k3', pg_temp.guardar(NULL, pg_temp.k(3), 'ZZ Cu Tía', 'Orden judicial del 9/9/2026')::text;
SELECT pg_temp.assert_eq('a: the coordinator of the other campus writes for K3',
  $q$SELECT string_agg(persona_nombre, ',') FROM public.ninos_custodia_lista(pg_temp.k(3))$q$, 'ZZ Cu Tía');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('a: the coordinator of W cannot write for K3 (other campus)',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(3), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: an unknown child is refused',
  $q$SELECT pg_temp.guardar(NULL, gen_random_uuid(), 'ZZ Cu Otro', 'Orden')$q$, '42501', 'sin_autoridad');

-- ── b. validation (as the coordinator) ───────────────────────────────

SELECT pg_temp.assert_raises('b: an empty persona',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), '   ', 'Orden')$q$, '22023', 'persona_invalida',
  'Escribe el nombre de la persona que no puede retirar (hasta 200 caracteres).');
SELECT pg_temp.assert_raises('b: a persona of 201 characters',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), repeat('a', 201), 'Orden')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('b: no respaldo',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', NULL)$q$, '22023', 'respaldo_invalido',
  'Indica el respaldo de la restricción (por ejemplo, la orden judicial), hasta 300 caracteres.');
SELECT pg_temp.assert_raises('b: a respaldo of 301 characters',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', repeat('a', 301))$q$, '22023', 'respaldo_invalido');
SELECT pg_temp.assert_raises('b: a relación of 61 characters',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden', repeat('a', 61))$q$, '22023', 'relacion_invalida',
  'La relación admite hasta 60 caracteres.');
SELECT pg_temp.assert_raises('b: notas of 501 characters',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'ZZ Cu Otro', 'Orden', NULL, repeat('a', 501))$q$, '22023', 'notas_invalidas',
  'El protocolo admite hasta 500 caracteres.');
SELECT pg_temp.assert_raises('b: the same name again (other case and accents) is a duplicate',
  $q$SELECT pg_temp.guardar(NULL, pg_temp.k(1), 'jose  PEREZ', 'Otra orden')$q$, '23505', 'restriccion_duplicada',
  'Esta persona ya tiene una restricción activa para este niño.');
SELECT pg_temp.assert_raises('b: an id of another child',
  $q$SELECT pg_temp.guardar(pg_temp.ctx('r abuela')::uuid, pg_temp.k(2), 'ZZ Cu Abuela', 'Orden')$q$, '22023',
  'restriccion_no_encontrada', 'La restricción no existe para este niño.');
SELECT pg_temp.assert_eq('b: the edit keeps the id',
  $q$SELECT (pg_temp.guardar(pg_temp.ctx('r jose')::uuid, pg_temp.k(1), 'José Pérez', 'Medida de protección del 1/4/2026',
                             ' ', 'Llamar a la mamá.') = pg_temp.ctx('r jose')::uuid)::text$q$, 'true');
SELECT pg_temp.assert_eq('b: the edit updates the text (an empty relación becomes NULL)',
  $q$SELECT coalesce(relacion, '-') || '|' || coalesce(notas, '-') FROM public.ninos_custodia_lista(pg_temp.k(1))
      WHERE id = pg_temp.ctx('r jose')::uuid$q$, '-|Llamar a la mamá.');
SELECT pg_temp.assert_eq('b: nothing written by the refusals: K1 keeps 2, K2 has none',
  $q$SELECT (SELECT count(*) FROM public.ninos_custodia_lista(pg_temp.k(1)))::text || '+'
            || (SELECT count(*) FROM public.ninos_custodia_lista(pg_temp.k(2)))::text$q$, '2+0');

-- ── c. read scope ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: the coordinator reads K1''s active restrictions',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1), pg_temp.k(2), pg_temp.k(3)])$q$,
  'K1:José Pérez|Medida de protección del 1/4/2026,K1:ZZ Cu Abuela|Orden judicial del 3/5/2026');
SELECT pg_temp.assert_eq('c: the notas and relación come along',
  $q$SELECT string_agg(coalesce(relacion, '-') || '|' || coalesce(notas, '-'), ',' ORDER BY persona_nombre)
       FROM public.ninos_custodia_de(ARRAY[pg_temp.k(1)])$q$,
  '-|Llamar a la mamá.,Abuela|No entregar. Mantener al niño en el salón y avisar a coordinación.');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: the anfitrión of the campus reads them (not K3 of the other campus)',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1), pg_temp.k(3)])$q$,
  'K1:José Pérez|Medida de protección del 1/4/2026,K1:ZZ Cu Abuela|Orden judicial del 3/5/2026');
SELECT pg_temp.assert_eq('c: an empty or NULL list reads nothing',
  $q$SELECT pg_temp.de(ARRAY[]::uuid[]) || '|' || pg_temp.de(NULL)$q$, '-|-');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('c: the líder reads K1 (inside their salón today), not K3',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1), pg_temp.k(3)])$q$,
  'K1:José Pérez|Medida de protección del 1/4/2026,K1:ZZ Cu Abuela|Orden judicial del 3/5/2026');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('c: the coordinator of the other campus reads K3 only',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1), pg_temp.k(3)])$q$, 'K3:ZZ Cu Tía|Orden judicial del 9/9/2026');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('c: a volunteer is refused',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1)])$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('c: the parent is refused',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1)])$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: a random user is refused',
  $q$SELECT pg_temp.de(ARRAY[pg_temp.k(1)])$q$, '42501', 'sin_autoridad');

-- ── d. pickup ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: the grandmother cannot take K1',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', 'ZZ Cu Abuela', ARRAY[pg_temp.k(1)])$q$, '42501', 'custodia_restringida',
  'Esta persona tiene una restricción de custodia: no puede retirar a este niño. Llama a coordinación.');
SELECT pg_temp.assert_raises('d: nor written with other case and spacing',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', '  zz cu   ABUELA ', ARRAY[pg_temp.k(1), pg_temp.k(2)])$q$, '42501', 'custodia_restringida');
SELECT pg_temp.assert_raises('d: nor with the whole code (no list)',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', 'ZZ Cu Abuela', NULL)$q$, '42501', 'custodia_restringida');
SELECT pg_temp.assert_raises('d: José Pérez as «otra persona» with a reason',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', 'José Pérez', ARRAY[pg_temp.k(1)], 'La mamá avisó')$q$, '42501', 'custodia_restringida');
SELECT pg_temp.assert_raises('d: nor written without accents and in capitals',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', 'JOSE PEREZ', ARRAY[pg_temp.k(1)], 'La mamá avisó')$q$, '42501', 'custodia_restringida');
SELECT pg_temp.assert_eq('d: the refusals wrote nothing',
  $q$SELECT pg_temp.adentro(DATE '2099-05-02')$q$, 'K1,K2');
SELECT pg_temp.assert_eq('d: the options for K1 leave the grandmother out (the parents stay)',
  $q$SELECT pg_temp.opciones(DATE '2099-05-02', ARRAY[pg_temp.k(1)])$q$, 'ZZ Cu Mamá Prueba,ZZ Cu U5');
SELECT pg_temp.assert_eq('d: the options for both children leave her out too',
  $q$SELECT pg_temp.opciones(DATE '2099-05-02', NULL)$q$, 'ZZ Cu Mamá Prueba');
SELECT pg_temp.assert_eq('d: the options for the sibling K2 keep her',
  $q$SELECT pg_temp.opciones(DATE '2099-05-02', ARRAY[pg_temp.k(2)])$q$, 'ZZ Cu Abuela,ZZ Cu Mamá Prueba');
SELECT pg_temp.assert_eq('d: the grandmother picks up the sibling K2',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', 'ZZ Cu Abuela', ARRAY[pg_temp.k(2)])::text$q$, '1');
SELECT pg_temp.assert_eq('d: José Pérez with a reason picks up the sibling K2 on another day',
  $q$SELECT pg_temp.retirar(DATE '2099-05-09', 'José Pérez', ARRAY[pg_temp.k(2)], 'La mamá avisó')::text$q$, '1');
SELECT pg_temp.assert_eq('d: the mother picks up K1 (no restriction for her)',
  $q$SELECT pg_temp.retirar(DATE '2099-05-02', 'ZZ Cu Mamá Prueba', ARRAY[pg_temp.k(1)])::text$q$, '1');

-- A deactivated restriction no longer blocks.
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d: the coordinator deactivates the grandmother''s restriction (same id)',
  $q$SELECT (pg_temp.guardar(pg_temp.ctx('r abuela')::uuid, pg_temp.k(1), 'ZZ Cu Abuela', 'Orden judicial del 3/5/2026',
                             'Abuela', 'No entregar.', false) = pg_temp.ctx('r abuela')::uuid)::text$q$, 'true');
SELECT pg_temp.assert_eq('d: deactivated: listed in the ficha as inactive, gone from the alerts',
  $q$SELECT (SELECT string_agg(persona_nombre || ':' || activa, ',' ORDER BY persona_nombre) FROM public.ninos_custodia_lista(pg_temp.k(1)))
            || '|' || pg_temp.de(ARRAY[pg_temp.k(1)])$q$,
  'José Pérez:true,ZZ Cu Abuela:false|K1:José Pérez|Medida de protección del 1/4/2026');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: deactivated: the options for K1 list the grandmother again',
  $q$SELECT pg_temp.opciones(DATE '2099-05-09', ARRAY[pg_temp.k(1)])$q$, 'ZZ Cu Abuela,ZZ Cu Mamá Prueba,ZZ Cu U5');
SELECT pg_temp.assert_raises('d: José Pérez is still refused for K1',
  $q$SELECT pg_temp.retirar(DATE '2099-05-09', 'José Pérez', NULL, 'Motivo')$q$, '42501', 'custodia_restringida');
SELECT pg_temp.assert_eq('d: deactivated: the grandmother takes K1 with the whole code',
  $q$SELECT pg_temp.retirar(DATE '2099-05-09', 'ZZ Cu Abuela', NULL)::text$q$, '1');
SELECT pg_temp.assert_raises('d: someone not on the list without a reason is still retiro_no_autorizado',
  $q$SELECT pg_temp.retirar(DATE '2099-05-16', 'ZZ Cu Vecina', NULL)$q$, '22023', 'retiro_no_autorizado');
RESET ROLE;

SELECT pg_temp.assert_eq('d: who picked up each child (the refusals wrote nothing)',
  $q$SELECT string_agg(c.fecha::text || ' ' || u.nombre || ':' || coalesce(c.retirado_por_nombre, 'adentro') || ':' || c.retiro_otra_persona,
                       ',' ORDER BY c.fecha, u.nombre)
       FROM public.ninos_checkins c JOIN public.usuarios u ON u.id = c.nino_id
      WHERE c.fecha BETWEEN DATE '2099-05-01' AND DATE '2099-05-31' AND c.turno_id = pg_temp.ctx('turno')::uuid
        AND c.nino_id IN (pg_temp.k(1), pg_temp.k(2))$q$,
  '2099-05-02 ZZ Cu Dos:ZZ Cu Abuela:false,2099-05-02 ZZ Cu Uno:ZZ Cu Mamá Prueba:false,'
  || '2099-05-09 ZZ Cu Dos:José Pérez:true,2099-05-09 ZZ Cu Uno:ZZ Cu Abuela:false,'
  || '2099-05-16 ZZ Cu Dos:adentro:false,2099-05-16 ZZ Cu Uno:adentro:false');
SELECT pg_temp.assert_eq('b/a: 3 restriction rows in total (the refusals wrote nothing)',
  $q$SELECT count(*)::text FROM public.ninos_custodia_restricciones
      WHERE nino_id IN (pg_temp.k(1), pg_temp.k(2), pg_temp.k(3))$q$, '3');

-- ── e. grants and exposure ───────────────────────────────────────────

SELECT pg_temp.assert_eq('e: the table has RLS on and no privilege for anon / authenticated',
  $q$SELECT c.relrowsecurity::text || '/'
            || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')::text || '/'
            || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')::text
       FROM pg_class c WHERE c.oid = 'public.ninos_custodia_restricciones'::regclass$q$,
  'true/false/false');
SELECT pg_temp.assert_eq('e: authenticated runs the RPCs, anon and PUBLIC do not; the key helper is internal',
  $q$SELECT string_agg(f || ':' || has_function_privilege('authenticated', f, 'EXECUTE') || has_function_privilege('anon', f, 'EXECUTE')
                       || coalesce((SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f::regprocedure), false)::text,
                       ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_custodia_clave(text)',
                         'public.ninos_custodia_de(uuid[])',
                         'public.ninos_custodia_guardar(uuid, uuid, text, text, text, text, boolean)',
                         'public.ninos_custodia_lista(uuid)',
                         'public.ninos_custodia_puede(uuid)']) f$q$,
  'public.ninos_custodia_clave(text):falsefalsefalse,'
  || 'public.ninos_custodia_de(uuid[]):truefalsefalse,'
  || 'public.ninos_custodia_guardar(uuid, uuid, text, text, text, text, boolean):truefalsefalse,'
  || 'public.ninos_custodia_lista(uuid):truefalsefalse,'
  || 'public.ninos_custodia_puede(uuid):falsefalsefalse');
SELECT pg_temp.assert_eq('e: the definers keep an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ';'), ',' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('ninos_custodia_de', 'ninos_custodia_guardar', 'ninos_custodia_lista', 'ninos_custodia_puede',
                          'ninos_checkout', 'ninos_retiro_opciones')$q$,
  'ninos_checkout:true:search_path="",ninos_custodia_de:true:search_path="",ninos_custodia_guardar:true:search_path="",'
  || 'ninos_custodia_lista:true:search_path="",ninos_custodia_puede:true:search_path="",ninos_retiro_opciones:true:search_path=""');
SELECT pg_temp.assert_eq('e: checkout and options keep one signature each',
  $q$SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ' ; ' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('ninos_checkout', 'ninos_retiro_opciones')$q$,
  'ninos_checkout(p_codigo text, p_turno_id uuid, p_fecha date, p_retirado_por text, p_motivo_otra text, p_nino_ids uuid[])'
  || ' ; ninos_retiro_opciones(p_codigo text, p_turno_id uuid, p_fecha date, p_nino_ids uuid[])');
SELECT pg_temp.assert_eq('e: only these functions read the table (no parent-facing RPC)',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname) FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%ninos_custodia_restricciones%'$q$,
  'ninos_checkout,ninos_custodia_de,ninos_custodia_guardar,ninos_custodia_lista,ninos_retiro_opciones');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_denied('e: the coordinator cannot read the table directly',
  $q$SELECT count(*) FROM public.ninos_custodia_restricciones$q$);
SELECT pg_temp.assert_denied('e: nor write it directly',
  $q$INSERT INTO public.ninos_custodia_restricciones (nino_id, persona_nombre, respaldo) VALUES (pg_temp.k(1), 'X', 'Y')$q$);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('e: anon cannot read the table',
  $q$SELECT count(*) FROM public.ninos_custodia_restricciones$q$);
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_custodia_de',
  $q$SELECT * FROM public.ninos_custodia_de(ARRAY[gen_random_uuid()])$q$, '42501');
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_custodia_guardar',
  $q$SELECT public.ninos_custodia_guardar(NULL, gen_random_uuid(), 'x', NULL, 'y', NULL, true)$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cu_failures;

ROLLBACK;
