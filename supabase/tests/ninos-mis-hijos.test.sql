-- M1/M2 (odd/tasks/ninos-mis-hijos.md) — "Mis hijos" in Mi Perfil
-- (20261010140000_ninos_mis_hijos.sql, 20261010141000_ninos_mis_hijos_guardar.sql).
--
-- Covers (read, M1):
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
-- Covers (write, M2):
--   h. A parent saves ficha fields and the pickup list: changed fields
--      returned, room and VIP untouched, one audit row (padre, before/after).
--   i. A tutor saves too.
--   j. A child without ficha: a birth date of 13+ or in the future is
--      refused (edad_fuera_de_rango, no ficha created); a valid save creates it.
--   k. Another family's child, an adult hijo, an unknown id and the conyuge
--      get nino_no_encontrado; no current user gets sin_autoridad.
--   l. Staff-only and unknown keys: campo_no_permitido, nothing written.
--   m. Limits: > 6 pickup people, > 500 characters; 6 and 500 accepted;
--      yes/no fields must be booleans.
--   n. Identity: refused for a child with an own account, editable otherwise;
--      gender Masculino/Femenino only.
--   o. A save without changes writes no audit row.
--   p. Staff ninos_actualizar_nino: same authority and validation, and an
--      audit row with origen 'equipo'; the full history of a child.
--   g. Privileges: authenticated cannot execute the internal helpers nor read
--      the audit table; anon cannot execute any new function.
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

-- The caller saves child p_n; the result is kept under p_k (an error is a failed case).
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_k text, p_n int, p jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_mh_ctx (k, v) VALUES (p_k, public.ninos_mis_hijos_guardar(pg_temp.id('us', p_n), p)::text);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('setup ' || p_k, SQLSTATE || ' ' || SQLERRM);
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
  pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.mi_hijo(int), pg_temp.mis_nombres(),
  pg_temp.guardar(text, int, jsonb) TO authenticated, anon;

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

-- ── h. a parent saves (M2) ───────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('h1', 11, '{"alergias": "ZZ huevo", "autorizados": [
  {"nombre": "ZZ Tía Mh", "telefono": "04120000001", "relacion": "Tía"},
  {"nombre": "ZZ Abuela Mh", "telefono": "04120000002", "relacion": "Abuela"}]}'::jsonb);
SELECT pg_temp.assert_eq('h: the save returns the changed fields',
  $q$SELECT pg_temp.ctx('h1')$q$, '{"campos": ["alergias", "autorizados"]}');
SELECT pg_temp.assert_eq('h: Mis hijos shows the new data',
  $q$SELECT (pg_temp.mi_hijo(11) ->> 'alergias') || '|' ||
            (SELECT string_agg(a ->> 'nombre', ',' ORDER BY a ->> 'nombre') FROM jsonb_array_elements(pg_temp.mi_hijo(11) -> 'autorizados') a)$q$,
  'ZZ huevo|ZZ Abuela Mh,ZZ Tía Mh');

RESET ROLE;
SELECT pg_temp.assert_eq('h: room and VIP untouched, updated_by is the parent',
  $q$SELECT concat_ws('|', (f.salon_preferido_id = pg_temp.id('sa', 1))::text, (f.es_vip_desde IS NOT NULL)::text,
                     (f.updated_by = pg_temp.id('us', 1))::text)
       FROM public.ninos_fichas f WHERE f.usuario_id = pg_temp.id('us', 11)$q$, 'true|true|true');
SELECT pg_temp.assert_eq('h: the old pickup rows are inactive',
  $q$SELECT count(*)::text FROM public.ninos_autorizados_retiro a WHERE a.nino_id = pg_temp.id('us', 11) AND NOT a.activo$q$, '2');
SELECT pg_temp.assert_eq('h: one audit row: padre, actor, fields, pickup list before and after',
  $q$SELECT string_agg(concat_ws('|', c.origen, (c.actor_id = pg_temp.id('us', 1))::text, array_to_string(c.campos, ','),
                                 c.autorizados_antes::text, jsonb_array_length(c.autorizados_despues)), ';')
       FROM public.ninos_fichas_cambios c WHERE c.nino_id = pg_temp.id('us', 11)$q$,
  'padre|true|alergias,autorizados|[{"nombre": "ZZ Abuela Mh", "relacion": "Abuela", "telefono": "04120000002"}]|2');
SET LOCAL ROLE authenticated;

-- ── i. tutor ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('i: the tutor saves too',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"notas": "ZZ nota del tutor"}'::jsonb)::text$q$,
  '{"campos": ["notas"]}');

-- ── j. a child without ficha ─────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('j: a birth date that makes Dos 13 or older is refused',
  format($q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 12), '{"fecha_nacimiento": "%s"}'::jsonb)$q$,
         (public.ninos_hoy() - interval '14 years')::date), '22023', 'edad_fuera_de_rango');
SELECT pg_temp.assert_raises('j: a future birth date is refused',
  format($q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 12), '{"fecha_nacimiento": "%s"}'::jsonb)$q$,
         public.ninos_hoy() + 1), '22023', 'edad_fuera_de_rango');
SELECT pg_temp.assert_eq('j: the refused calls created no ficha',
  $q$SELECT pg_temp.mi_hijo(12) ->> 'tiene_ficha'$q$, 'false');
SELECT pg_temp.guardar('j1', 12, '{"alergias": "ZZ polen", "habitos": "ZZ siesta"}'::jsonb);
SELECT pg_temp.assert_eq('j: a valid save creates the ficha',
  $q$SELECT pg_temp.ctx('j1') || '|' || (pg_temp.mi_hijo(12) ->> 'tiene_ficha') || '|' || (pg_temp.mi_hijo(12) ->> 'alergias')$q$,
  '{"campos": ["alergias", "habitos"]}|true|ZZ polen');

-- ── k. not my child ──────────────────────────────────────────────────

SELECT pg_temp.assert_raises('k: another family''s child is refused',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 14), '{"alergias": "x"}'::jsonb)$q$, '22023', 'nino_no_encontrado');
SELECT pg_temp.assert_raises('k: an adult hijo without ficha is refused',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 13), '{"alergias": "x"}'::jsonb)$q$, '22023', 'nino_no_encontrado');
SELECT pg_temp.assert_raises('k: an unknown id gets the same answer',
  $q$SELECT public.ninos_mis_hijos_guardar(gen_random_uuid(), '{"alergias": "x"}'::jsonb)$q$, '22023', 'nino_no_encontrado');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('k: the other family''s parent cannot save Uno',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"alergias": "x"}'::jsonb)$q$, '22023', 'nino_no_encontrado');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('k: the conyuge cannot save Uno',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"alergias": "x"}'::jsonb)$q$, '22023', 'nino_no_encontrado');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_raises('k: no current user gets sin_autoridad',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{}'::jsonb)$q$, '42501', 'sin_autoridad');

-- ── l. staff-only and unknown keys ───────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('l: the room is staff-only',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"salon_preferido_id": null}'::jsonb)$q$, '42501', 'campo_no_permitido');
SELECT pg_temp.assert_raises('l: VIP is staff-only',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"es_vip_desde": "2026-01-01"}'::jsonb)$q$, '42501', 'campo_no_permitido');
SELECT pg_temp.assert_raises('l: origen is staff-only',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"origen": "padre"}'::jsonb)$q$, '42501', 'campo_no_permitido');
SELECT pg_temp.assert_raises('l: an unknown key is refused even next to allowed ones',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"alergias": "ZZ otra", "telefono": "1"}'::jsonb)$q$,
  '42501', 'campo_no_permitido');
SELECT pg_temp.assert_eq('l: nothing of the refused calls was written',
  $q$SELECT pg_temp.mi_hijo(11) ->> 'alergias'$q$, 'ZZ huevo');

-- ── m. limits ────────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('m: more than 6 pickup people are refused',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), jsonb_build_object('autorizados',
       (SELECT jsonb_agg(jsonb_build_object('nombre', 'ZZ P' || n)) FROM generate_series(1, 7) n)))$q$,
  '22023', 'limite_autorizados');
SELECT pg_temp.assert_raises('m: a text over 500 characters is refused',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), jsonb_build_object('alergias', repeat('x', 501)))$q$,
  '22023', 'texto_muy_largo');
SELECT pg_temp.assert_raises('m: a pickup name over 500 characters is refused',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), jsonb_build_object('autorizados',
       jsonb_build_array(jsonb_build_object('nombre', repeat('x', 501)))))$q$,
  '22023', 'texto_muy_largo');
SELECT pg_temp.assert_eq('m: 6 pickup people and 500 characters are accepted (Cinco, ficha fields only)',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 15), jsonb_build_object('notas', repeat('n', 500),
       'autorizados', (SELECT jsonb_agg(jsonb_build_object('nombre', 'ZZ P' || n)) FROM generate_series(1, 6) n)))::text$q$,
  '{"campos": ["notas", "autorizados"]}');
SELECT pg_temp.assert_raises('m: a yes/no field must be a boolean',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"puede_comer": "si"}'::jsonb)$q$, '22023', 'datos_invalidos');

-- ── n. identity ──────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('n: the identity of a child with an own account is refused',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 15), '{"nombre": "ZZ Otro"}'::jsonb)$q$, '42501', 'campo_no_permitido');
SELECT pg_temp.guardar('n1', 11, jsonb_build_object('nombre', 'ZZ Unito',
  'fecha_nacimiento', (public.ninos_hoy() - interval '6 years')::date));
SELECT pg_temp.assert_eq('n: the identity of a child without an account is editable',
  $q$SELECT pg_temp.ctx('n1') || '|' || (pg_temp.mi_hijo(11) ->> 'nombre') || '|' || (pg_temp.mi_hijo(11) ->> 'edad')$q$,
  '{"campos": ["nombre", "fecha_nacimiento"]}|ZZ Unito|6');
SELECT pg_temp.assert_raises('n: gender is Masculino or Femenino only',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"genero": "Otro"}'::jsonb)$q$, '22023', 'datos_invalidos');

-- ── o. no changes ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('o: a save without changes returns no fields',
  $q$SELECT public.ninos_mis_hijos_guardar(pg_temp.id('us', 11), '{"alergias": "ZZ huevo"}'::jsonb)::text$q$, '{"campos": []}');

-- ── p. the staff path ────────────────────────────────────────────────

SELECT pg_temp.assert_raises('p: a parent is still not staff',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 11), '{"notas": "x"}'::jsonb)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(6);
SELECT public.ninos_actualizar_nino(pg_temp.id('us', 11), '{"notas": "ZZ nota del equipo", "salon_preferido_id": null}'::jsonb);
SELECT pg_temp.assert_raises('p: the staff path keeps its validation (grade 9)',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 11), '{"grado": 9}'::jsonb)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('p: the staff path keeps nino_no_encontrado for a person without ficha',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 13), '{"notas": "x"}'::jsonb)$q$, '22023', 'nino_no_encontrado');

RESET ROLE;
SELECT pg_temp.assert_eq('p: the staff edit wrote the notes and cleared the room',
  $q$SELECT f.notas || ':' || (f.salon_preferido_id IS NULL)::text FROM public.ninos_fichas f WHERE f.usuario_id = pg_temp.id('us', 11)$q$,
  'ZZ nota del equipo:true');
SELECT pg_temp.assert_eq('p: history of Uno (origen:actor:fields:pickup before:after)',
  $q$SELECT string_agg(x, ';' ORDER BY x COLLATE "C") FROM (
       SELECT concat_ws(':', c.origen,
                        CASE c.actor_id WHEN pg_temp.id('us', 1) THEN 'A' WHEN pg_temp.id('us', 2) THEN 'T'
                                        WHEN pg_temp.id('us', 6) THEN 'E' END,
                        array_to_string(c.campos, ','), coalesce(jsonb_array_length(c.autorizados_antes)::text, '-'),
                        coalesce(jsonb_array_length(c.autorizados_despues)::text, '-')) AS x
         FROM public.ninos_fichas_cambios c WHERE c.nino_id = pg_temp.id('us', 11)) h$q$,
  'equipo:E:notas,salon_preferido_id:-:-;padre:A:alergias,autorizados:1:2;padre:A:nombre,fecha_nacimiento:-:-;padre:T:notas:-:-');
SELECT pg_temp.assert_eq('p: history of Dos and Cinco',
  $q$SELECT string_agg(concat_ws(':', c.origen, array_to_string(c.campos, ','), coalesce(jsonb_array_length(c.autorizados_antes)::text, '-'),
                                 coalesce(jsonb_array_length(c.autorizados_despues)::text, '-')), ';' ORDER BY c.nino_id)
       FROM public.ninos_fichas_cambios c WHERE c.nino_id IN (pg_temp.id('us', 12), pg_temp.id('us', 15))$q$,
  'padre:alergias,habitos:-:-;padre:notas,autorizados:0:6');
SET LOCAL ROLE authenticated;

-- ── g. privileges ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_denied('g: authenticated cannot execute ninos_es_mi_hijo',
  $q$SELECT public.ninos_es_mi_hijo(gen_random_uuid())$q$);
SELECT pg_temp.assert_denied('g: authenticated cannot execute ninos_aplicar_ficha',
  $q$SELECT public.ninos_aplicar_ficha(pg_temp.id('us', 11), '{}'::jsonb, 'padre')$q$);
SELECT pg_temp.assert_denied('g: authenticated cannot execute ninos_ficha_estado',
  $q$SELECT public.ninos_ficha_estado(pg_temp.id('us', 11))$q$);
SELECT pg_temp.assert_denied('g: authenticated cannot read ninos_fichas_cambios',
  $q$SELECT count(*) FROM public.ninos_fichas_cambios$q$);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_mis_hijos',
  $q$SELECT public.ninos_mis_hijos()$q$);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_es_mi_hijo',
  $q$SELECT public.ninos_es_mi_hijo(gen_random_uuid())$q$);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_mis_hijos_guardar',
  $q$SELECT public.ninos_mis_hijos_guardar(gen_random_uuid(), '{}'::jsonb)$q$);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_aplicar_ficha',
  $q$SELECT public.ninos_aplicar_ficha(gen_random_uuid(), '{}'::jsonb, 'padre')$q$);
SELECT pg_temp.assert_denied('g: anon cannot execute ninos_ficha_estado',
  $q$SELECT public.ninos_ficha_estado(gen_random_uuid())$q$);

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_mh_failures;

ROLLBACK;
