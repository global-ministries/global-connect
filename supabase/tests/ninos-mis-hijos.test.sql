-- M1 (odd/tasks/ninos-mis-hijos.md) — "Mis hijos" in Mi Perfil, read side
-- (20261010140000_ninos_mis_hijos.sql).
--
-- Covers:
--   a. Both link directions show the child (child → me as padre, me → child
--      as hijo), a linked child without ficha under 13 too; an adult hijo
--      without ficha is hidden. Ordered by birth date.
--   b. A tutor sees the child.
--   c. Fields of a child: an explicit allowlist (no room, VIP, check-ins),
--      only active pickup people, the other parents' names only (never their
--      contact data), age, puede_editar_identidad false for a child with an
--      own account.
--   d. A 'conyuge' link alone gives nothing; a user without children gets [].
--   e. Another family's child is never listed; ninos_es_mi_hijo agrees.
--   f. No current user → sin_autoridad.
--   g. authenticated cannot execute the internal ninos_es_mi_hijo; anon
--      cannot execute any new function.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 PADRE A, 2 TUTOR T, 3 CONYUGE C,
-- 4 OTRO PADRE O, 5 RANDOM R, 6 ANFITRION.
-- Children: 11 Uno (5 y, ficha, child → A padre, child → T tutor, a conyuge
-- link to C), 12 Dos (4 y, no ficha, A → child hijo), 13 Tres (20 y, no
-- ficha, A → child hijo), 14 Cuatro (O's child), 15 Cinco (11 y, ficha, own
-- account = auth 15, child → A padre).
-- Tree: R → W → Anfitriones. Room S1 in W on the Barquisimeto campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_mh_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_mh_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_mh_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- A privilege error (not a business error raised by the function itself).
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
  SELECT format('f9a10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9a01' WHEN 'us' THEN '9a02' WHEN 'eq' THEN '9a04'
                       WHEN 'ro' THEN '9a05' WHEN 'sa' THEN '9a06' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_mh_ctx WHERE k = p_k;
$$;

-- The caller's child with that usuario number, as ninos_mis_hijos returns it.
CREATE OR REPLACE FUNCTION pg_temp.mi_hijo(p_n int) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT e.h FROM jsonb_array_elements(public.ninos_mis_hijos()) e(h)
           WHERE e.h ->> 'id' = pg_temp.id('us', p_n)::text);
END;
$$;

-- The caller's children names in the order returned.
CREATE OR REPLACE FUNCTION pg_temp.mis_nombres() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(e.h ->> 'nombre', ',' ORDER BY e.n), '')
            FROM jsonb_array_elements(public.ninos_mis_hijos()) WITH ORDINALITY e(h, n));
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_mh_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'mh-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 6, 15]) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Ana', 'ZZ Mh', 'mh-1@example.test', '04129990961', 'Casado', 'Femenino'),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Tito', 'ZZ Mh', 'mh-2@example.test', '04129990962', 'Soltero', 'Masculino'),
  (pg_temp.id('us', 3), pg_temp.id('au', 3), 'ZZ Carlos', 'ZZ Mh', 'mh-3@example.test', '04129990963', 'Casado', 'Masculino'),
  (pg_temp.id('us', 4), pg_temp.id('au', 4), 'ZZ Olga', 'ZZ Mh2', 'mh-4@example.test', NULL, 'Soltero', 'Femenino'),
  (pg_temp.id('us', 5), pg_temp.id('au', 5), 'ZZ Rita', 'ZZ Mh', 'mh-5@example.test', NULL, 'Soltero', 'Femenino'),
  (pg_temp.id('us', 6), pg_temp.id('au', 6), 'ZZ Anfi', 'ZZ Mh', 'mh-6@example.test', NULL, 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 11), NULL, 'ZZ Uno', 'ZZ Mh', NULL, 'No especificado', 'Masculino',
   (public.ninos_hoy() - interval '5 years' - interval '10 days')::date),
  (pg_temp.id('us', 12), NULL, 'ZZ Dos', 'ZZ Mh', NULL, 'No especificado', 'Femenino',
   (public.ninos_hoy() - interval '4 years' - interval '10 days')::date),
  (pg_temp.id('us', 13), NULL, 'ZZ Tres', 'ZZ Mh', NULL, 'Soltero', 'Masculino',
   (public.ninos_hoy() - interval '20 years')::date),
  (pg_temp.id('us', 14), NULL, 'ZZ Cuatro', 'ZZ Mh2', NULL, 'No especificado', 'Masculino',
   (public.ninos_hoy() - interval '6 years')::date),
  (pg_temp.id('us', 15), pg_temp.id('au', 15), 'ZZ Cinco', 'ZZ Mh', 'mh-15@example.test', 'No especificado', 'Femenino',
   (public.ninos_hoy() - interval '11 years' - interval '10 days')::date);

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 11), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 11), pg_temp.id('us', 2), 'tutor', false),
  (pg_temp.id('us', 1), pg_temp.id('us', 12), 'hijo', false),
  (pg_temp.id('us', 1), pg_temp.id('us', 13), 'hijo', false),
  (pg_temp.id('us', 14), pg_temp.id('us', 4), 'padre', true),
  (pg_temp.id('us', 15), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 3), pg_temp.id('us', 1), 'conyuge', true),
  (pg_temp.id('us', 11), pg_temp.id('us', 3), 'conyuge', false);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Mh R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Mh W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Mh S1', 20, 0, 71, 1);

INSERT INTO public.ninos_fichas (usuario_id, alergias, cambio_panal, salon_preferido_id, es_vip_desde) VALUES
  (pg_temp.id('us', 11), 'ZZ maní', false, pg_temp.id('sa', 1), public.ninos_hoy()),
  (pg_temp.id('us', 14), NULL, NULL, NULL, NULL),
  (pg_temp.id('us', 15), NULL, NULL, NULL, NULL);
INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, telefono, relacion, activo) VALUES
  (pg_temp.id('us', 11), 'ZZ Abuela Mh', '04120000002', 'Abuela', true),
  (pg_temp.id('us', 11), 'ZZ Viejo Mh', NULL, NULL, false);

GRANT INSERT, SELECT, UPDATE ON t_mh_failures, t_mh_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.mi_hijo(int), pg_temp.mis_nombres() TO authenticated, anon;

-- ── e (internal helper, as postgres with the parent's claims) ───────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: ninos_es_mi_hijo — A: Uno, Dos and Cinco yes; Tres (adult) and Cuatro (other family) no',
  $q$SELECT string_agg(public.ninos_es_mi_hijo(pg_temp.id('us', n))::text, ',' ORDER BY n)
       FROM unnest(ARRAY[11, 12, 13, 14, 15]) n$q$, 'true,true,false,false,true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('e: ninos_es_mi_hijo — the conyuge C gets nothing',
  $q$SELECT public.ninos_es_mi_hijo(pg_temp.id('us', 11))::text$q$, 'false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('e: ninos_es_mi_hijo — the tutor T yes',
  $q$SELECT public.ninos_es_mi_hijo(pg_temp.id('us', 11))::text$q$, 'true');

SET LOCAL ROLE authenticated;

-- ── a. both directions, without ficha, adult hidden, order ───────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: A sees Cinco, Uno (child → padre) and Dos (padre → hijo, no ficha), oldest first; not Tres (adult)',
  $q$SELECT pg_temp.mis_nombres()$q$, 'ZZ Cinco,ZZ Uno,ZZ Dos');

-- ── b. tutor ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: the tutor T sees Uno',
  $q$SELECT pg_temp.mis_nombres()$q$, 'ZZ Uno');
SELECT pg_temp.assert_eq('b: T sees A as the other parent',
  $q$SELECT (pg_temp.mi_hijo(11) -> 'otros_padres')::text$q$, '[{"nombre": "ZZ Ana", "apellido": "ZZ Mh"}]');

-- ── c. fields ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: exactly the allowed keys (no room, VIP or check-in data)',
  $q$SELECT string_agg(k, ',' ORDER BY k COLLATE "C") FROM jsonb_object_keys(pg_temp.mi_hijo(11)) k$q$,
  'alergias,apellido,autoriza_imagen,autorizados,cambio_panal,edad,escolarizado,fecha_nacimiento,genero,grado,habitos,id,necesidades_especiales,nombre,notas,otros_padres,puede_comer,puede_editar_identidad,tiene_ficha');
SELECT pg_temp.assert_eq('c: Uno: ficha data, age and identity editable',
  $q$SELECT concat_ws('|', h ->> 'tiene_ficha', h ->> 'alergias', h ->> 'cambio_panal', h ->> 'edad', h ->> 'genero',
                     h ->> 'puede_editar_identidad', (h ->> 'fecha_nacimiento' = (public.ninos_hoy() - interval '5 years' - interval '10 days')::date::text)::text)
       FROM pg_temp.mi_hijo(11) h$q$, 'true|ZZ maní|false|5|Masculino|true|true');
SELECT pg_temp.assert_eq('c: only the active pickup people',
  $q$SELECT string_agg((a ->> 'nombre') || ':' || (a ->> 'telefono') || ':' || (a ->> 'relacion'), ',')
       FROM jsonb_array_elements(pg_temp.mi_hijo(11) -> 'autorizados') a$q$, 'ZZ Abuela Mh:04120000002:Abuela');
SELECT pg_temp.assert_eq('c: the other parents are names only: the tutor, never the conyuge or me',
  $q$SELECT (pg_temp.mi_hijo(11) -> 'otros_padres')::text$q$, '[{"nombre": "ZZ Tito", "apellido": "ZZ Mh"}]');
SELECT pg_temp.assert_eq('c: Dos (no ficha) comes with empty ficha fields and no other parents',
  $q$SELECT concat_ws('|', h ->> 'tiene_ficha', coalesce(h ->> 'alergias', 'null'), h -> 'autorizados', h -> 'otros_padres', h ->> 'edad')
       FROM pg_temp.mi_hijo(12) h$q$, 'false|null|[]|[]|4');
SELECT pg_temp.assert_eq('c: Cinco has an own account: identity not editable',
  $q$SELECT pg_temp.mi_hijo(15) ->> 'puede_editar_identidad'$q$, 'false');

-- ── d. conyuge and no children ───────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d: a conyuge link alone gives nothing',
  $q$SELECT public.ninos_mis_hijos()::text$q$, '[]');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('d: a user without children gets []',
  $q$SELECT public.ninos_mis_hijos()::text$q$, '[]');

-- ── e. another family ────────────────────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('e: O sees only their own child',
  $q$SELECT pg_temp.mis_nombres()$q$, 'ZZ Cuatro');

-- ── f. no current user ───────────────────────────────────────────────

SELECT pg_temp.as_persona(99);
SELECT pg_temp.assert_raises('f: an auth user without usuarios row gets sin_autoridad',
  $q$SELECT public.ninos_mis_hijos()$q$, '42501', 'sin_autoridad');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_raises('f: no auth user gets sin_autoridad',
  $q$SELECT public.ninos_mis_hijos()$q$, '42501', 'sin_autoridad');

-- ── g. privileges ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_denied('g: authenticated cannot execute ninos_es_mi_hijo',
  $q$SELECT public.ninos_es_mi_hijo(gen_random_uuid())$q$);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_mis_hijos',
  $q$SELECT public.ninos_mis_hijos()$q$);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_es_mi_hijo',
  $q$SELECT public.ninos_es_mi_hijo(gen_random_uuid())$q$);

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_mh_failures;

ROLLBACK;
