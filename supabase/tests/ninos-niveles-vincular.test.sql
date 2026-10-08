-- N12 (odd/tasks/ninos-checkin.md) — the child's level and linking an
-- existing under-13 child with no ficha and no parent
-- (20261008155000_ninos_niveles_vincular.sql).
--
-- Covers:
--   a. A child K with no ficha and no parent, 8 years old, is found by name
--      (>= 3 chars of first and last name, or full name) and by exact cédula,
--      with name, age and masked cédula only; one token alone finds nothing.
--   b. K is linked to adult A (ninos_vincular_padre) and the ficha can then
--      be completed (ninos_crear_ficha) with a Waumba room as level.
--   c. A 15-year-old T and a person U with unknown birth date are never found
--      and are refused by ninos_vincular_padre.
--   d. Existing refusals: self link and the parent being the child's child.
--   e. Level: registrar_familia stores hijo.salon_preferido_id; actualizar_nino
--      keeps it when the key is absent, clears it with null; an unknown room
--      is refused.
--   f. A random user is denied; g. anon cannot execute the new search.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_nv_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_nv_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_nv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9550000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_nv_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nv_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nv-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión, 2 random user, 3 adult A, 4 child K (8, no ficha, no parent,
-- email set: it must never leak), 5 teen T (15), 6 U (no birth date).
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, telefono, cedula, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'Zqanf', 'Zqnivel', 'nv-1@example.test', 'Soltero', 'Otro', NULL, NULL, NULL),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'Zqrandom', 'Zqnivel', 'nv-2@example.test', 'Soltero', 'Otro', NULL, NULL, NULL),
  (pg_temp.id('us', 3), NULL, 'Zqadulta', 'Zqnivel', NULL, 'Casado', 'Femenino', '04129995501', NULL, '1990-01-01'),
  (pg_temp.id('us', 4), NULL, 'Zqkiara', 'Zqnivel', 'zqkiara@example.test', 'No especificado', 'Femenino', '04129995504', 'V-99995504',
   (public.ninos_hoy() - interval '8 years')::date),
  (pg_temp.id('us', 5), NULL, 'Zqteo', 'Zqnivel', NULL, 'No especificado', 'Masculino', NULL, 'V-99995505',
   (public.ninos_hoy() - interval '15 years')::date),
  (pg_temp.id('us', 6), NULL, 'Zqsinfecha', 'Zqnivel', NULL, 'No especificado', 'Masculino', NULL, 'V-99995506', NULL);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Nv R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Nv W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nv Maternal', 20, 0, 23, 1),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nv Preescolar I', 20, 24, 35, 2);

GRANT INSERT, SELECT, UPDATE ON t_nv_failures, t_nv_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. K is found by name and by exact cédula ────────────────────────

SELECT pg_temp.assert_eq('a: partial first and last name (>= 3 chars) finds K',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_hijos_vincular('zqki ZQNI', pg_temp.id('us', 3))) h
      WHERE h ->> 'id' = pg_temp.id('us', 4)::text$q$, '1');
SELECT pg_temp.assert_eq('a: the full name finds K',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_hijos_vincular('Zqkiara Zqnivel', pg_temp.id('us', 3))) h
      WHERE h ->> 'id' = pg_temp.id('us', 4)::text$q$, '1');
SELECT pg_temp.assert_eq('a: the exact cédula finds K',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_hijos_vincular('99995504', pg_temp.id('us', 3))) h
      WHERE h ->> 'id' = pg_temp.id('us', 4)::text$q$, '1');
SELECT pg_temp.assert_eq('a: one name alone finds nothing',
  $q$SELECT jsonb_array_length(public.ninos_buscar_hijos_vincular('Zqkiara', pg_temp.id('us', 3)))::text$q$, '0');
SELECT pg_temp.assert_eq('a: two characters of the first name find nothing',
  $q$SELECT jsonb_array_length(public.ninos_buscar_hijos_vincular('zq zqnivel', pg_temp.id('us', 3)))::text$q$, '0');
SELECT pg_temp.assert_eq('a: only name, age and masked cédula',
  $q$SELECT (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(h) k) || '|' || (h ->> 'edad_anos') || '|' || (h ->> 'cedula')
       FROM jsonb_array_elements(public.ninos_buscar_hijos_vincular('Zqkiara Zqnivel', pg_temp.id('us', 3))) h
      WHERE h ->> 'id' = pg_temp.id('us', 4)::text$q$, 'apellido,cedula,edad_anos,id,nombre|8|•••5504');
SELECT pg_temp.assert_eq('a: no email or phone in the result',
  $q$SELECT (public.ninos_buscar_hijos_vincular('Zqkiara Zqnivel', pg_temp.id('us', 3))::text ~ '(zqkiara@|04129995504)')::text$q$, 'false');

-- ── c. a teen and an unknown birth date: never found, refused ────────

SELECT pg_temp.assert_eq('c: the 15-year-old is not found by name or cédula',
  $q$SELECT (jsonb_array_length(public.ninos_buscar_hijos_vincular('Zqteo Zqnivel', pg_temp.id('us', 3)))
            + jsonb_array_length(public.ninos_buscar_hijos_vincular('V-99995505', pg_temp.id('us', 3))))::text$q$, '0');
SELECT pg_temp.assert_eq('c: unknown birth date is not found by name or cédula',
  $q$SELECT (jsonb_array_length(public.ninos_buscar_hijos_vincular('Zqsinfecha Zqnivel', pg_temp.id('us', 3)))
            + jsonb_array_length(public.ninos_buscar_hijos_vincular('V-99995506', pg_temp.id('us', 3))))::text$q$, '0');
SELECT pg_temp.assert_raises('c: linking the 15-year-old is refused',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 5)], pg_temp.id('us', 3), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('c: linking an unknown birth date is refused',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 6)], pg_temp.id('us', 3), NULL)$q$, '22023');

-- ── d. existing refusals ─────────────────────────────────────────────

SELECT pg_temp.assert_raises('d: K cannot be linked to herself',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 4), NULL)$q$, '22023');

-- ── b. link K to A, then complete her ficha with a Waumba level ──────

SELECT pg_temp.assert_eq('b: K is linked to A',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 3), NULL) ->> 'vinculados'$q$, '1');
SELECT pg_temp.assert_eq('b: linking again is idempotent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 3), NULL) ->> 'vinculados'$q$, '0');
SELECT pg_temp.assert_eq('b: K is no longer offered to A',
  $q$SELECT jsonb_array_length(public.ninos_buscar_hijos_vincular('Zqkiara Zqnivel', pg_temp.id('us', 3)))::text$q$, '0');
SELECT pg_temp.assert_raises('d: an adult (A) cannot be linked as K''s child',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 3)], pg_temp.id('us', 4), NULL)$q$, '22023');
-- (A write and its read go in separate statements: one statement sees one snapshot.)
SELECT pg_temp.assert_eq('b: the ficha is completed',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 4),
       jsonb_build_object('grado', NULL, 'salon_preferido_id', pg_temp.id('sa', 2)), '[]'::jsonb)::text$q$, '');
SELECT pg_temp.assert_eq('b: with the Waumba room as level',
  $q$SELECT salon_preferido_id::text FROM public.ninos_fichas WHERE usuario_id = pg_temp.id('us', 4)$q$,
  pg_temp.id('sa', 2)::text);

-- ── e. the level on register and edit ────────────────────────────────

SELECT pg_temp.assert_eq('e: registrar_familia with a Waumba level',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
              'padre', jsonb_build_object('id', pg_temp.id('us', 3)),
              'hijos', jsonb_build_array(jsonb_build_object('nombre', 'Zqbebe', 'apellido', 'Zqnivel',
                        'fecha_nacimiento', (public.ninos_hoy() - interval '1 year')::date, 'genero', 'Femenino',
                        'grado', NULL, 'salon_preferido_id', pg_temp.id('sa', 1))),
              'autorizados', '[]'::jsonb)) ->> 'padre_id'$q$, pg_temp.id('us', 3)::text);
-- Read as the owner: the new child is not visible to the anfitrión through usuarios RLS.
RESET ROLE;
SELECT pg_temp.assert_eq('e: registrar_familia stored the Waumba room and no grade',
  $q$SELECT f.salon_preferido_id::text || '|' || coalesce(f.grado::text, 'null')
       FROM public.ninos_fichas f JOIN public.usuarios u ON u.id = f.usuario_id
      WHERE u.nombre = 'Zqbebe' AND u.apellido = 'Zqnivel'$q$,
  pg_temp.id('sa', 1)::text || '|null');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: an edit without the key is saved',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 4), '{"alergias":"Maní"}'::jsonb)::text$q$, '');
SELECT pg_temp.assert_eq('e: and keeps the room',
  $q$SELECT salon_preferido_id::text || '|' || alergias FROM public.ninos_fichas WHERE usuario_id = pg_temp.id('us', 4)$q$,
  pg_temp.id('sa', 2)::text || '|Maní');
SELECT pg_temp.assert_eq('e: an UpStreet level is saved',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 4), '{"grado":2,"salon_preferido_id":null}'::jsonb)::text$q$, '');
SELECT pg_temp.assert_eq('e: it clears the room and stores the grade',
  $q$SELECT coalesce(salon_preferido_id::text, 'null') || '|' || grado FROM public.ninos_fichas WHERE usuario_id = pg_temp.id('us', 4)$q$,
  'null|2');
SELECT pg_temp.assert_raises('e: an unknown room is refused',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 4),
       jsonb_build_object('salon_preferido_id', 'f9550000-0000-4000-9406-0000000000ff'))$q$, '22023');
SELECT pg_temp.assert_raises('e: a malformed room id is refused',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 4), '{"salon_preferido_id":"nope"}'::jsonb)$q$, '22023');

-- ── f. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('f: a random user cannot search',
  $q$SELECT public.ninos_buscar_hijos_vincular('Zqkiara Zqnivel', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('f: a random user cannot link',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 2), NULL)$q$, '42501');

-- ── g. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_buscar_hijos_vincular',
  $q$SELECT public.ninos_buscar_hijos_vincular('Zqkiara Zqnivel', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_vincular_padre',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 3), NULL)$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nv_failures;

ROLLBACK;
