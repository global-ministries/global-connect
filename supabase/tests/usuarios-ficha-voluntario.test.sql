-- T3 (odd/tasks/ninos-voluntarios-waumba.md, D5) — the person record fields on
-- usuarios (bautizado, fecha_bautizo, talla_franela, redes_sociales) and the
-- private table persona_datos_importados
-- (migration 20261003162000_usuarios_ficha_voluntario.sql).
--
-- Covers:
--   a. The four columns exist on usuarios with the right types, nullable, with
--      no default and a comment each; no other relation of public gained them
--      (no view changed shape).
--   b. Valid writes: the old insert shape (all four NULL), a baptized person
--      with a past date, a date with bautizado unknown (NULL), not baptized
--      without a date, a baptism today, numeric and letter shirt sizes up to
--      10 chars, social text of exactly 300 chars, and an UPDATE that fills
--      the four fields.
--   c. Invalid writes, each rejected by its own CHECK (23514 + constraint
--      name), on INSERT and on UPDATE: a future baptism date, a date with
--      bautizado = false, a shirt size that is not trimmed, not upper case,
--      empty or longer than 10 chars, and social text longer than 300 chars.
--   d. The existing triggers usuarios_normalizar_cedula and
--      usuarios_normalizar_telefono are still there, enabled, and still
--      normalize cedula / telefono on INSERT and UPDATE when the new columns
--      are written in the same statement; an UPDATE of only the new columns
--      leaves cedula / telefono as stored.
--   e. persona_datos_importados has the columns, defaults, foreign key
--      (ON DELETE CASCADE), unique (persona_id, fuente) and checks it needs:
--      a second row for the same persona and fuente is 23505, an unknown
--      persona is 23503, NULL datos is 23502, non-object datos and a blank
--      fuente are 23514.
--   f. persona_datos_importados is private: RLS enabled, NO policy, no
--      privilege at all for anon, authenticated or PUBLIC, and its comment
--      says so on purpose.
--   g. An authenticated session can neither SELECT, INSERT, UPDATE nor DELETE
--      persona_datos_importados (42501); neither can anon (SELECT, INSERT).
--   h. Deleting a usuario deletes its persona_datos_importados rows (every
--      fuente) and leaves another persona's rows untouched.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own d8000000-... namespace. The MCP connection is
-- `postgres` (BYPASSRLS), so the authorization cases switch to SET LOCAL ROLE
-- authenticated / anon with request.jwt.claim.sub set to the fixture auth id.
-- Every statement that touches an object of the migration runs through an
-- assert helper (EXECUTE), so before the migration the suite reports failing
-- cases instead of aborting. The last statement is a SELECT of the failing
-- cases (0 failing cases = all ok), because the MCP tool returns only the last
-- result-producing statement.
--
-- Fixtures (usuario n; usuario 1 has auth id au 1):
--   1  SESSION   the authenticated account used in g
--   2  EDITABLE  plain person, target of the UPDATE cases
--   3  CASCADE   has two persona_datos_importados rows, deleted in h
--   4  OTHER     has one persona_datos_importados row that must survive h
--   10..23       created (or refused) by the INSERT cases
--   99           never inserted into usuarios

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ficha_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ficha_failures TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ficha_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs a query that returns one scalar and compares its text form.
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_sqlstate || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- A CHECK violation (23514) raised by exactly the named constraint.
CREATE OR REPLACE FUNCTION pg_temp.assert_check(p_case text, p_sql text, p_constraint text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_constraint text;
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected 23514 on ' || p_constraint || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF SQLSTATE IS DISTINCT FROM '23514' OR v_constraint IS DISTINCT FROM p_constraint THEN
      PERFORM pg_temp.fail(p_case, 'expected 23514 on ' || p_constraint || ', got ' || SQLSTATE || ' on '
                                   || coalesce(nullif(v_constraint, ''), '-') || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Fixture ids: kind picks the 4th uuid group, n the last 12 hex digits.
CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d8000000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

-- INSERT of a fixture usuario n with the given extra columns and values (SQL
-- text), so the cases read as one line each.
CREATE OR REPLACE FUNCTION pg_temp.ins(p_n int, p_cols text, p_vals text) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero%s) VALUES (%L, %L, %L, %L, %L%s)',
                CASE WHEN p_cols = '' THEN '' ELSE ', ' || p_cols END,
                pg_temp.id('us', p_n), 'ZZ Ficha', 'P' || p_n, 'Soltero', 'Otro',
                CASE WHEN p_vals = '' THEN '' ELSE ', ' || p_vals END);
$$;

-- Fixtures (as postgres, before any role switch; no column of the migration) -

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.id('au', 1), 'authenticated', 'authenticated', 'fichav-1@example.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Ficha', 'SESSION',  'fichav-1@example.test', NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 2), NULL,                'ZZ Ficha', 'EDITABLE', NULL, '0414-555-0202', 'Soltero', 'Otro'),
  (pg_temp.id('us', 3), NULL,                'ZZ Ficha', 'CASCADE',  NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 4), NULL,                'ZZ Ficha', 'OTHER',    NULL, NULL, 'Soltero', 'Otro');

-- ── a. the four columns ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: the four columns exist with their types, nullable, without default',
  $q$SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-'),
                       ', ' ORDER BY column_name)
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
        AND column_name IN ('bautizado', 'fecha_bautizo', 'talla_franela', 'redes_sociales')$q$,
  'bautizado:boolean:YES:-, fecha_bautizo:date:YES:-, redes_sociales:text:YES:-, talla_franela:text:YES:-');

SELECT pg_temp.assert_eq('a: each of the four columns has a comment',
  $q$SELECT count(*) FROM pg_attribute a
      WHERE a.attrelid = 'public.usuarios'::regclass
        AND a.attname IN ('bautizado', 'fecha_bautizo', 'talla_franela', 'redes_sociales')
        AND coalesce(col_description(a.attrelid, a.attnum), '') <> ''$q$,
  '4');

SELECT pg_temp.assert_eq('a: no other relation of public exposes the new columns (no view changed shape)',
  $q$SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> 'usuarios'
        AND column_name IN ('bautizado', 'fecha_bautizo', 'talla_franela', 'redes_sociales')$q$,
  '0');

-- ── b. valid writes ─────────────────────────────────────────────────

SELECT pg_temp.assert_no_error('b: the old insert shape (the four columns left out) still inserts',
  pg_temp.ins(10, '', ''));
SELECT pg_temp.assert_eq('b: the old insert shape leaves the four columns NULL',
  format($q$SELECT concat_ws(',', coalesce(bautizado::text, 'n'), coalesce(fecha_bautizo::text, 'n'),
                                 coalesce(talla_franela, 'n'), coalesce(redes_sociales, 'n'))
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 10)),
  'n,n,n,n');

SELECT pg_temp.assert_no_error('b: baptized with a past date, a letter size and social text',
  pg_temp.ins(11, 'bautizado, fecha_bautizo, talla_franela, redes_sociales',
                  $v$true, '2010-05-02', 'M', 'IG @ana / FB Ana Pérez'$v$));
SELECT pg_temp.assert_eq('b: the values are stored as written',
  format($q$SELECT concat_ws(',', bautizado::text, fecha_bautizo, talla_franela, redes_sociales)
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 11)),
  'true,2010-05-02,M,IG @ana / FB Ana Pérez');

SELECT pg_temp.assert_no_error('b: a baptism date with bautizado unknown (NULL) is allowed',
  pg_temp.ins(12, 'fecha_bautizo', $v$'2015-01-10'$v$));
SELECT pg_temp.assert_no_error('b: not baptized and no date',
  pg_temp.ins(13, 'bautizado', 'false'));
SELECT pg_temp.assert_no_error('b: a baptism today is not in the future',
  pg_temp.ins(14, 'bautizado, fecha_bautizo', 'true, current_date'));
SELECT pg_temp.assert_no_error('b: a numeric child size (10)',
  pg_temp.ins(15, 'talla_franela', $v$'10'$v$));
SELECT pg_temp.assert_no_error('b: a two-letter size (XL)',
  pg_temp.ins(16, 'talla_franela', $v$'XL'$v$));
SELECT pg_temp.assert_no_error('b: a size of exactly 10 chars',
  pg_temp.ins(17, 'talla_franela', $v$'TALLA 12 N'$v$));
SELECT pg_temp.assert_no_error('b: social text of exactly 300 chars',
  pg_temp.ins(18, 'redes_sociales', $v$repeat('x', 300)$v$));

SELECT pg_temp.assert_no_error('b: an UPDATE fills the four fields',
  format($q$UPDATE public.usuarios
               SET bautizado = true, fecha_bautizo = '2001-12-24', talla_franela = '12', redes_sociales = '@editable'
             WHERE id = %L$q$, pg_temp.id('us', 2)));
SELECT pg_temp.assert_eq('b: the UPDATE stored the four fields',
  format($q$SELECT concat_ws(',', bautizado::text, fecha_bautizo, talla_franela, redes_sociales)
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 2)),
  'true,2001-12-24,12,@editable');

-- ── c. invalid writes ───────────────────────────────────────────────

SELECT pg_temp.assert_check('c: INSERT of a baptism date in the future',
  pg_temp.ins(19, 'bautizado, fecha_bautizo', 'true, current_date + 1'),
  'usuarios_fecha_bautizo_no_futura');
SELECT pg_temp.assert_check('c: UPDATE to a baptism date in the future',
  format($q$UPDATE public.usuarios SET fecha_bautizo = current_date + 30 WHERE id = %L$q$, pg_temp.id('us', 2)),
  'usuarios_fecha_bautizo_no_futura');

SELECT pg_temp.assert_check('c: INSERT of a baptism date with bautizado = false',
  pg_temp.ins(20, 'bautizado, fecha_bautizo', $v$false, '2010-05-02'$v$),
  'usuarios_fecha_bautizo_si_bautizado');
SELECT pg_temp.assert_check('c: UPDATE of bautizado to false while a baptism date is stored',
  format($q$UPDATE public.usuarios SET bautizado = false WHERE id = %L$q$, pg_temp.id('us', 2)),
  'usuarios_fecha_bautizo_si_bautizado');

SELECT pg_temp.assert_check('c: a lower-case size (m)',
  pg_temp.ins(21, 'talla_franela', $v$'m'$v$), 'usuarios_talla_franela_formato');
SELECT pg_temp.assert_check('c: a size with a leading space',
  pg_temp.ins(21, 'talla_franela', $v$' M'$v$), 'usuarios_talla_franela_formato');
SELECT pg_temp.assert_check('c: a size with a trailing space',
  pg_temp.ins(21, 'talla_franela', $v$'10 '$v$), 'usuarios_talla_franela_formato');
SELECT pg_temp.assert_check('c: an empty size (use NULL instead)',
  pg_temp.ins(21, 'talla_franela', $v$''$v$), 'usuarios_talla_franela_formato');
SELECT pg_temp.assert_check('c: a size of 11 chars',
  pg_temp.ins(21, 'talla_franela', $v$'TALLA 12 NI'$v$), 'usuarios_talla_franela_formato');
SELECT pg_temp.assert_check('c: UPDATE to a lower-case size',
  format($q$UPDATE public.usuarios SET talla_franela = 'xl' WHERE id = %L$q$, pg_temp.id('us', 2)),
  'usuarios_talla_franela_formato');

SELECT pg_temp.assert_check('c: social text of 301 chars',
  pg_temp.ins(22, 'redes_sociales', $v$repeat('x', 301)$v$), 'usuarios_redes_sociales_largo');
SELECT pg_temp.assert_check('c: UPDATE to social text of 301 chars',
  format($q$UPDATE public.usuarios SET redes_sociales = repeat('y', 301) WHERE id = %L$q$, pg_temp.id('us', 2)),
  'usuarios_redes_sociales_largo');

SELECT pg_temp.assert_eq('c: the rejected UPDATEs left EDITABLE as it was',
  format($q$SELECT concat_ws(',', bautizado::text, fecha_bautizo, talla_franela, redes_sociales)
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 2)),
  'true,2001-12-24,12,@editable');
SELECT pg_temp.assert_eq('c: no rejected INSERT left a row',
  $q$SELECT count(*) FROM public.usuarios
      WHERE id IN (pg_temp.id('us', 19), pg_temp.id('us', 20), pg_temp.id('us', 21), pg_temp.id('us', 22))$q$,
  '0');

-- ── d. the existing normalization triggers ──────────────────────────

SELECT pg_temp.assert_eq('d: both normalization triggers are still on usuarios and enabled',
  $q$SELECT string_agg(tgname || ':' || tgenabled::text, ', ' ORDER BY tgname)
       FROM pg_trigger
      WHERE tgrelid = 'public.usuarios'::regclass
        AND tgname IN ('usuarios_normalizar_cedula', 'usuarios_normalizar_telefono')$q$,
  'usuarios_normalizar_cedula:O, usuarios_normalizar_telefono:O');

SELECT pg_temp.assert_no_error('d: INSERT with cedula, telefono and the new columns',
  pg_temp.ins(23, 'cedula, telefono, bautizado, talla_franela',
                  $v$'V-99.887.766', '+58 412-5138681', true, 'S'$v$));
SELECT pg_temp.assert_eq('d: the INSERT normalized cedula and telefono',
  format($q$SELECT concat_ws(',', cedula, telefono, bautizado::text, talla_franela)
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 23)),
  '99887766,04125138681,true,S');

SELECT pg_temp.assert_no_error('d: UPDATE of cedula and telefono together with the new columns',
  format($q$UPDATE public.usuarios
               SET cedula = 'v-99.887.767', telefono = '0412-555-0303', talla_franela = 'L', redes_sociales = '@p23'
             WHERE id = %L$q$, pg_temp.id('us', 23)));
SELECT pg_temp.assert_eq('d: the UPDATE normalized cedula and telefono',
  format($q$SELECT concat_ws(',', cedula, telefono, talla_franela, redes_sociales)
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 23)),
  '99887767,04125550303,L,@p23');

SELECT pg_temp.assert_no_error('d: UPDATE of only the new columns',
  format($q$UPDATE public.usuarios SET bautizado = NULL, talla_franela = '8' WHERE id = %L$q$, pg_temp.id('us', 23)));
SELECT pg_temp.assert_eq('d: an UPDATE of only the new columns leaves cedula and telefono as stored',
  format($q$SELECT concat_ws(',', cedula, telefono, coalesce(bautizado::text, 'n'), talla_franela)
              FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 23)),
  '99887767,04125550303,n,8');
SELECT pg_temp.assert_eq('d: EDITABLE kept the telefono the trigger normalized at insert',
  format($q$SELECT telefono FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 2)),
  '04145550202');

-- ── e. persona_datos_importados: shape and integrity ────────────────

SELECT pg_temp.assert_eq('e: the table has its columns, types, nullability and defaults',
  $q$SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-'),
                       ', ' ORDER BY ordinal_position)
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'persona_datos_importados'$q$,
  'id:uuid:NO:gen_random_uuid(), persona_id:uuid:NO:-, fuente:text:NO:-, datos:jsonb:NO:-, '
  || 'importado_at:timestamp with time zone:NO:now()');

SELECT pg_temp.assert_eq('e: id is the primary key',
  $q$SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.persona_datos_importados'::regclass AND contype = 'p'$q$,
  'PRIMARY KEY (id)');
SELECT pg_temp.assert_eq('e: persona_id references usuarios(id) ON DELETE CASCADE',
  $q$SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.persona_datos_importados'::regclass AND contype = 'f'$q$,
  'FOREIGN KEY (persona_id) REFERENCES usuarios(id) ON DELETE CASCADE');
SELECT pg_temp.assert_eq('e: (persona_id, fuente) is unique',
  $q$SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.persona_datos_importados'::regclass AND contype = 'u'$q$,
  'UNIQUE (persona_id, fuente)');

SELECT pg_temp.assert_no_error('e: a privileged insert with the defaults',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'wland-2026-07', '{"dones": "servicio", "mentor": "Mary"}')$q$, pg_temp.id('us', 3)));
SELECT pg_temp.assert_eq('e: id and importado_at were filled by their defaults',
  format($q$SELECT (id IS NOT NULL AND importado_at = now())::text
              FROM public.persona_datos_importados WHERE persona_id = %L AND fuente = 'wland-2026-07'$q$,
         pg_temp.id('us', 3)),
  'true');
SELECT pg_temp.assert_no_error('e: the same persona from another fuente is a second row',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'upstreet-2026-08', '{"antiguedad": "3 años"}')$q$, pg_temp.id('us', 3)));
SELECT pg_temp.assert_no_error('e: another persona, same fuente',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'wland-2026-07', '{"otra_area": "Producción"}')$q$, pg_temp.id('us', 4)));

SELECT pg_temp.assert_raises('e: a second row for the same persona and fuente is rejected',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'wland-2026-07', '{}')$q$, pg_temp.id('us', 3)),
  '23505');
SELECT pg_temp.assert_raises('e: a persona that is not a usuario is rejected',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'wland-2026-07', '{}')$q$, pg_temp.id('us', 99)),
  '23503');
SELECT pg_temp.assert_raises('e: NULL datos is rejected',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'otra-fuente', NULL)$q$, pg_temp.id('us', 4)),
  '23502');
SELECT pg_temp.assert_raises('e: NULL fuente is rejected',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, NULL, '{}')$q$, pg_temp.id('us', 4)),
  '23502');
SELECT pg_temp.assert_check('e: datos that is not a JSON object is rejected',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'otra-fuente', '["a", "b"]')$q$, pg_temp.id('us', 4)),
  'persona_datos_importados_datos_objeto');
SELECT pg_temp.assert_check('e: a blank fuente is rejected',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, '   ', '{}')$q$, pg_temp.id('us', 4)),
  'persona_datos_importados_fuente_no_vacia');

-- ── f. persona_datos_importados is private ──────────────────────────

SELECT pg_temp.assert_eq('f: RLS is enabled',
  $q$SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.persona_datos_importados'::regclass$q$,
  'true');
SELECT pg_temp.assert_eq('f: there is no policy at all (private on purpose)',
  $q$SELECT count(*) FROM pg_policy WHERE polrelid = 'public.persona_datos_importados'::regclass$q$,
  '0');
SELECT pg_temp.assert_eq('f: anon and authenticated hold no table privilege',
  $q$SELECT count(*) FROM unnest(ARRAY['anon', 'authenticated']) AS r(role),
                          unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
      WHERE has_table_privilege(r.role, 'public.persona_datos_importados', p.priv)$q$,
  '0');
SELECT pg_temp.assert_eq('f: anon and authenticated hold no column privilege',
  $q$SELECT count(*) FROM unnest(ARRAY['anon', 'authenticated']) AS r(role),
                          unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS p(priv)
      WHERE has_any_column_privilege(r.role, 'public.persona_datos_importados', p.priv)$q$,
  '0');
SELECT pg_temp.assert_eq('f: there is no PUBLIC grant on the table',
  $q$SELECT count(*) FROM pg_class c, aclexplode(c.relacl) a
      WHERE c.oid = 'public.persona_datos_importados'::regclass AND a.grantee = 0$q$,
  '0');
SELECT pg_temp.assert_eq('f: the table comment says it is private on purpose and must get no policy',
  $q$SELECT (obj_description('public.persona_datos_importados'::regclass, 'pg_class') ILIKE '%private on purpose%'
             AND obj_description('public.persona_datos_importados'::regclass, 'pg_class') ILIKE '%no polic%')::text$q$,
  'true');

-- ── g. an authenticated session and anon can not touch it ───────────

-- The helpers below run as authenticated and as anon. Grant them explicitly:
-- a default ACL (staging has one) can keep new functions, temp ones too, from
-- PUBLIC, and the suite would abort with 42501 at the first helper call.
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(uuid), pg_temp.id(text, int)
  TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 1));

SELECT pg_temp.assert_eq('g: the session is the fixture account (precondition)',
  $q$SELECT (auth.uid() = pg_temp.id('au', 1))::text$q$, 'true');
SELECT pg_temp.assert_raises('g: authenticated can not SELECT persona_datos_importados',
  $q$SELECT count(*) FROM public.persona_datos_importados$q$, '42501');
SELECT pg_temp.assert_raises('g: authenticated can not SELECT its own imported data either',
  format($q$SELECT datos FROM public.persona_datos_importados WHERE persona_id = %L$q$, pg_temp.id('us', 1)),
  '42501');
SELECT pg_temp.assert_raises('g: authenticated can not INSERT into persona_datos_importados',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'wland-2026-07', '{}')$q$, pg_temp.id('us', 1)),
  '42501');
SELECT pg_temp.assert_raises('g: authenticated can not UPDATE persona_datos_importados',
  $q$UPDATE public.persona_datos_importados SET datos = '{}'$q$, '42501');
SELECT pg_temp.assert_raises('g: authenticated can not DELETE from persona_datos_importados',
  $q$DELETE FROM public.persona_datos_importados$q$, '42501');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('g: anon can not SELECT persona_datos_importados',
  $q$SELECT count(*) FROM public.persona_datos_importados$q$, '42501');
SELECT pg_temp.assert_raises('g: anon can not INSERT into persona_datos_importados',
  format($q$INSERT INTO public.persona_datos_importados (persona_id, fuente, datos)
            VALUES (%L, 'wland-2026-07', '{}')$q$, pg_temp.id('us', 1)),
  '42501');
RESET ROLE;

SELECT pg_temp.assert_eq('g: the denied writes left the table as it was',
  $q$SELECT count(*) FROM public.persona_datos_importados
      WHERE persona_id IN (pg_temp.id('us', 1), pg_temp.id('us', 3), pg_temp.id('us', 4))$q$,
  '3');

-- ── h. deleting a usuario cascades ──────────────────────────────────

SELECT pg_temp.assert_eq('h: CASCADE has two imported rows before the delete (precondition)',
  format($q$SELECT count(*) FROM public.persona_datos_importados WHERE persona_id = %L$q$, pg_temp.id('us', 3)),
  '2');
SELECT pg_temp.assert_no_error('h: deleting a usuario with imported data succeeds',
  format($q$DELETE FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 3)));
SELECT pg_temp.assert_eq('h: the usuario is gone',
  format($q$SELECT count(*) FROM public.usuarios WHERE id = %L$q$, pg_temp.id('us', 3)),
  '0');
SELECT pg_temp.assert_eq('h: its imported rows (every fuente) are gone with it',
  format($q$SELECT count(*) FROM public.persona_datos_importados WHERE persona_id = %L$q$, pg_temp.id('us', 3)),
  '0');
SELECT pg_temp.assert_eq('h: another persona''s imported row is untouched',
  format($q$SELECT datos->>'otra_area' FROM public.persona_datos_importados WHERE persona_id = %L$q$, pg_temp.id('us', 4)),
  'Producción');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_ficha_failures;

ROLLBACK;
