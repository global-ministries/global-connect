-- T7 (odd/tasks/uno-a-uno.md) — 1:1 supervision and celebración
-- (migration 20261024120000_uno_a_uno_supervision.sql).
--
-- Covers:
--   S7.1 uno_a_uno_supervision(): a supervisor sees the 1:1s whose leader side
--        holds someone of their chain (the transitive closure of who-leads-whom
--        from them and their spouse), never the ones they take part in; admin
--        and pastor see every 1:1; someone whose chain leads nobody, a
--        dirigido, nobody and no session see none.
--   S7.2 What supervision shows: lideres, dirigidos, estado, resumen,
--        celebración, motivo; nota_privada is not even a column.
--   S7.3 celebración: stored by registrar and registrar_sin_agenda (blank →
--        null, > 500 → 22023, the table check holds too); mis_uno_a_uno gives it
--        to both sides while resumen stays leader-only; the old call without
--        p_celebracion still works; no overloads are left behind.
--   S7.4 uno_a_uno_supervision_lideres(p_dias): one row per person of the chain
--        (since T11 a couple who lead the same thing, like LA and LA2, is one row)
--        who leads someone with dirigidos / realizados in the window /
--        agendados ahead / último realizado and what they lead; admin gets
--        every leader; nulls first; p_dias outside 1..366 → 22023.
--   S7.5 uno_a_uno_acceso(): lidera / supervisa / participa per persona.
--   R    uno_a_uno_relaciones() (the set-based rule, one pass) gives, for EVERY
--        usuario of the database, exactly what uno_a_uno_dirigidos_de gives.
--   S9   ubicaciones: where each leader sits (dirección > área > equipo), Grupos
--        de Vida under its own dirección; spouses share places; internal only.
--   P    Privileges: the internal functions are service_role only, the public
--        ones authenticated only; all security definer with search_path pinned.
--
-- Same harness as uno-a-uno-modelo.test.sql (helpers and fixtures copied under
-- this file's own d3a70000-... namespace, plus ADM = admin and PAS = pastor).
-- Run against STAGING inside BEGIN…ROLLBACK; the last statement is a SELECT of
-- the failing cases (0 failing cases = all ok). Before the migration every case
-- fails (RED) instead of aborting the file.
--
-- Chains of the fixtures (see the T3 test for who leads whom):
--   DGS → DE1, DE2 → (DE1) LA, LA2 → CO, MI, MI2
--   DE1 → LA, LA2 → CO, MI, MI2          LA → CO, MI, MI2 (nobody of them leads)
--   DGD → DE2 (leads nobody)             PC → PV, MI2, CC → CL → CV
--
-- 1:1s (key: leader → dirigido, estado):
--   a1 LA→MI agendado (+2 d)      r1 LA→CO realizado −1 d, R1/N1/C1
--   r2 DE1→LA realizado −2 d, R2/N2, no celebración
--   a2 CC→CL cancelado, motivo M  r3 PC→CC realizado −40 d, R3
--   r4 LA→CO agendado then registrar, R4 / C4
--   r5 LA→MI realizado −3 h, R5, blank celebración

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_u7_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_u7_labels (id uuid PRIMARY KEY, label text NOT NULL, auth_id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE t_u7_ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_u7_failures TO authenticated, anon;
GRANT SELECT ON t_u7_labels TO authenticated, anon;
GRANT INSERT, SELECT ON t_u7_ids TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_u7_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_ok(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected success, got error ' || SQLSTATE || ' ' || SQLERRM);
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

-- Runs a query that returns one uuid and keeps it under p_key for later cases.
-- A failure leaves the key unset, so the cases that use it fail too.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  EXECUTE p_sql INTO v_id;
  IF v_id IS NULL THEN
    PERFORM pg_temp.fail(p_case, 'expected an id, got NULL');
  ELSE
    INSERT INTO t_u7_ids (k, id) VALUES (p_key, v_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected an id, got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.k(p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u7_ids WHERE k = p_key;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Fixture ids: kind picks the 4th uuid group, n the last 12 hex digits.
CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d3a70000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' WHEN 'sg' THEN '8003'
                       WHEN 'sl' THEN '8004' WHEN 'gr' THEN '8005' WHEN 'te' THEN '8006'
                       WHEN 'eq' THEN '8007' WHEN 'ro' THEN '8008' WHEN 'sv' THEN '8009'
                       WHEN 'xx' THEN '800a' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

-- The auth id of a fixture by label. Read from the temp table, never from
-- public.usuarios: after SET LOCAL ROLE authenticated without a user, RLS on
-- usuarios hides the fixtures.
CREATE OR REPLACE FUNCTION pg_temp.a(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM t_u7_labels WHERE label = p_label;
$$;

-- The usuario id of a fixture by label.
CREATE OR REPLACE FUNCTION pg_temp.u(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u7_labels WHERE label = p_label;
$$;

-- The apellidos (= labels) of a jsonb array of {id, nombre, apellido}, joined by '+'.
CREATE OR REPLACE FUNCTION pg_temp.nombres(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e ->> 'apellido', '+' ORDER BY (e ->> 'apellido') COLLATE "C"), '')
    FROM jsonb_array_elements(p) e;
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Fixtures (as postgres, before any role switch) ----------------------------

INSERT INTO t_u7_labels (id, label, auth_id)
SELECT pg_temp.id('us', n::int), l, pg_temp.id('au', n::int)
  FROM unnest(ARRAY['LA', 'LA2', 'CO', 'MI', 'MI2', 'EX', 'OT', 'IN', 'DE1', 'DE2', 'DGS', 'DGD',
                    'PC', 'PV', 'CC', 'CL', 'CV', 'NOBODY', 'LX', 'PX', 'CX', 'ADM', 'PAS']) WITH ORDINALITY AS t(l, n);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'u7-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 23) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT l.id, pg_temp.id('au', n), 'ZZ U7', l.label, 'u7-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 23) AS n
  JOIN t_u7_labels l ON l.id = pg_temp.id('us', n);

-- Two couples, written in both directions of relaciones_usuarios.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  (pg_temp.id('us', 1), pg_temp.id('us', 2), 'conyuge'),
  (pg_temp.id('us', 5), pg_temp.id('us', 4), 'conyuge');

INSERT INTO public.segmentos (id, nombre) VALUES
  (pg_temp.id('sg', 1), 'ZZ U7 S'),
  (pg_temp.id('sg', 2), 'ZZ U7 S2');

INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  (pg_temp.id('te', 1), 'ZZ U7 activa',   '2026-01-01', '2026-12-31', true,  'activa'),
  (pg_temp.id('te', 2), 'ZZ U7 inactiva', '2027-01-01', '2027-12-31', false, 'planificacion');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_aprobacion, eliminado) VALUES
  (pg_temp.id('gr', 1), 'ZZ U7 G1', pg_temp.id('te', 1), pg_temp.id('sg', 1), true, 'aprobado', false),
  (pg_temp.id('gr', 2), 'ZZ U7 G2', pg_temp.id('te', 2), pg_temp.id('sg', 1), true, 'aprobado', false);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida, estado) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 1),  'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 2),  'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 3),  'Colíder', NULL, 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 4),  'Miembro', NULL, NULL),
  (pg_temp.id('gr', 1), pg_temp.id('us', 5),  'Miembro', NULL, 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 6),  'Miembro', now() - interval '30 days', 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 8),  'Miembro', NULL, 'inactivo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 1),  'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 19), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 7),  'Miembro', NULL, 'activo');

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  (pg_temp.id('sl', 1), pg_temp.id('sg', 1), pg_temp.id('us', 9),  'director_etapa'),
  (pg_temp.id('sl', 2), pg_temp.id('sg', 1), pg_temp.id('us', 10), 'director_etapa'),
  (pg_temp.id('sl', 3), pg_temp.id('sg', 2), pg_temp.id('us', 9),  'director_etapa');

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  (pg_temp.id('sl', 1), pg_temp.id('gr', 1)),
  (pg_temp.id('sl', 1), pg_temp.id('gr', 2));

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  (pg_temp.id('us', 11), pg_temp.id('sg', 1), 'segmento'),
  (pg_temp.id('us', 11), pg_temp.id('sg', 2), 'segmento'),
  (pg_temp.id('us', 12), pg_temp.id('sg', 1), 'directores');

INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id) VALUES
  (pg_temp.id('us', 12), pg_temp.id('sl', 2));

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', NULL,                 'ZZ U7 padre',          true),
  (pg_temp.id('eq', 2), 'dps', pg_temp.id('eq', 1), 'ZZ U7 hija',           true),
  (pg_temp.id('eq', 3), 'dps', pg_temp.id('eq', 1), 'ZZ U7 hija inactiva',  false);

-- Labels that map to another level on purpose: the explicit nivel decides.
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'ZZ U7 jefe padre',  'coordinador'),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'ZZ U7 apoyo padre', 'voluntario'),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 1), 'ZZ U7 guia padre',  'lider'),
  (pg_temp.id('ro', 4), pg_temp.id('eq', 2), 'ZZ U7 jefe hija',   'coordinador'),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 2), 'ZZ U7 guia hija',   'lider'),
  (pg_temp.id('ro', 6), pg_temp.id('eq', 2), 'ZZ U7 apoyo hija',  'voluntario'),
  (pg_temp.id('ro', 7), pg_temp.id('eq', 3), 'ZZ U7 jefe inact',  'coordinador');

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  (pg_temp.id('sv', 1), pg_temp.id('us', 13), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo'),
  (pg_temp.id('sv', 2), pg_temp.id('us', 14), pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'activo'),
  (pg_temp.id('sv', 3), pg_temp.id('us', 5),  pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'activo'),
  (pg_temp.id('sv', 4), pg_temp.id('us', 20), pg_temp.id('eq', 1), pg_temp.id('ro', 3), 'en_pausa'),
  (pg_temp.id('sv', 5), pg_temp.id('us', 15), pg_temp.id('eq', 2), pg_temp.id('ro', 4), 'activo'),
  (pg_temp.id('sv', 6), pg_temp.id('us', 16), pg_temp.id('eq', 2), pg_temp.id('ro', 5), 'activo'),
  (pg_temp.id('sv', 7), pg_temp.id('us', 17), pg_temp.id('eq', 2), pg_temp.id('ro', 6), 'activo'),
  (pg_temp.id('sv', 8), pg_temp.id('us', 21), pg_temp.id('eq', 3), pg_temp.id('ro', 7), 'activo');


-- ADM is admin, PAS is pastor.
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u('ADM'), id FROM public.roles_sistema WHERE nombre_interno = 'admin'
ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u('PAS'), id FROM public.roles_sistema WHERE nombre_interno = 'pastor'
ON CONFLICT DO NOTHING;

-- The real Grupos de Vida dirección (S9), read as postgres.
INSERT INTO t_u7_ids (k, id)
SELECT 'gdv', e.id FROM public.dream_team_equipos e
 WHERE e.parent_equipo_id IS NULL AND e.experiencia = 'grupos_vida'
 ORDER BY e.activo DESC, e.label LIMIT 1;

-- ── T7 helpers (plpgsql, so the file loads before the migration) ────

-- Keys of the fixture 1:1s the session reads from uno_a_uno_supervision().
CREATE OR REPLACE FUNCTION pg_temp.sup_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT coalesce(string_agg(i.k, ',' ORDER BY i.k), '')
    INTO v
    FROM public.uno_a_uno_supervision() s
    JOIN t_u7_ids i ON i.id = s.id;
  RETURN v;
END;
$$;

-- `estado|lideres|dirigidos|resumen|celebracion|motivo` of one 1:1 in supervision.
CREATE OR REPLACE FUNCTION pg_temp.sup_uno_txt(p_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT s.estado || '|' || pg_temp.nombres(s.lideres) || '|' || pg_temp.nombres(s.dirigidos) || '|'
         || coalesce(s.resumen, '-') || '|' || coalesce(s.celebracion, '-') || '|' || coalesce(s.motivo_cancelacion, '-')
    INTO v
    FROM public.uno_a_uno_supervision() s
   WHERE s.id = p_id;
  RETURN v;
END;
$$;

-- `LABEL:dirigidos/realizados/agendados/Y|-` of the fixture leaders the
-- session reads from uno_a_uno_supervision_lideres(p_dias), by label.
CREATE OR REPLACE FUNCTION pg_temp.lideres_txt(p_dias int DEFAULT 30) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT coalesce(string_agg(l.label || ':' || x.dirigidos || '/' || x.realizados || '/' || x.agendados || '/'
                             || CASE WHEN x.ultimo_realizado IS NULL THEN '-' ELSE 'Y' END,
                             ', ' ORDER BY l.label COLLATE "C"), '')
    INTO v
    FROM public.uno_a_uno_supervision_lideres(p_dias) x
    JOIN t_u7_labels l ON l.id = x.usuario_id;
  RETURN v;
END;
$$;

-- `mi_lado|resumen|celebracion` of one 1:1 as the session reads it from mis_uno_a_uno().
CREATE OR REPLACE FUNCTION pg_temp.cel_txt(p_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT x.mi_lado || '|' || coalesce(x.resumen, '-') || '|' || coalesce(x.celebracion, '-')
    INTO v
    FROM public.mis_uno_a_uno() x
   WHERE x.id = p_id;
  RETURN v;
END;
$$;

-- `lidera/supervisa/participa` as t/f.
CREATE OR REPLACE FUNCTION pg_temp.acceso_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  v := public.uno_a_uno_acceso();
  RETURN left(v ->> 'lidera', 1) || '/' || left(v ->> 'supervisa', 1) || '/' || left(v ->> 'participa', 1);
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── R. the set-based rule equals the per-person rule, for every usuario ──

SELECT pg_temp.assert_eq('R: uno_a_uno_relaciones gives what uno_a_uno_dirigidos_de gives, for every usuario', $q$
  WITH rel AS MATERIALIZED (SELECT * FROM public.uno_a_uno_relaciones())
  SELECT count(*)::text
    FROM public.usuarios u
   WHERE (SELECT coalesce(string_agg(d.usuario_id::text || '[' || array_to_string(d.contextos, '|') || ']', ',' ORDER BY d.usuario_id), '')
            FROM public.uno_a_uno_dirigidos_de(u.id) d)
         IS DISTINCT FROM
         (SELECT coalesce(string_agg(x.d::text || '[' || x.c || ']', ',' ORDER BY x.d), '')
            FROM (SELECT r.dirigido_id AS d, array_to_string(array_agg(DISTINCT r.contexto ORDER BY r.contexto), '|') AS c
                    FROM rel r
                   WHERE r.lider_id = u.id
                   GROUP BY r.dirigido_id) x)
$q$, '0');

-- ── P. catalog ──────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('P: one definition per 1:1 function (no overload left behind)', $q$
  SELECT string_agg(p.proname || '=' || n, ',' ORDER BY p.proname)
    FROM (SELECT proname, count(*)::text AS n FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace
             AND proname IN ('uno_a_uno_crear', 'uno_a_uno_registrar', 'uno_a_uno_registrar_sin_agenda', 'mis_uno_a_uno',
                             'uno_a_uno_relaciones', 'uno_a_uno_supervisados_de', 'uno_a_uno_supervision',
                             'uno_a_uno_supervision_lideres', 'uno_a_uno_acceso')
           GROUP BY proname) p
$q$, 'mis_uno_a_uno=1,uno_a_uno_acceso=1,uno_a_uno_crear=1,uno_a_uno_registrar=1,uno_a_uno_registrar_sin_agenda=1,uno_a_uno_relaciones=1,uno_a_uno_supervisados_de=1,uno_a_uno_supervision=1,uno_a_uno_supervision_lideres=1');

SELECT pg_temp.assert_eq('P: who executes each new or changed function', $q$
  SELECT string_agg(p.proname || ':' ||
           has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
           has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '/' ||
           has_function_privilege('service_role', p.oid, 'EXECUTE')::text || '/' ||
           p.prosecdef::text || '/' ||
           coalesce(array_to_string(p.proconfig, ';'), '-'), ',' ORDER BY p.proname)
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('uno_a_uno_crear', 'uno_a_uno_registrar', 'uno_a_uno_registrar_sin_agenda', 'mis_uno_a_uno',
                       'uno_a_uno_relaciones', 'uno_a_uno_supervisados_de', 'uno_a_uno_supervision',
                       'uno_a_uno_supervision_lideres', 'uno_a_uno_acceso')
$q$, 'mis_uno_a_uno:false/true/true/true/search_path=public,'
  || 'uno_a_uno_acceso:false/true/true/true/search_path=public,'
  || 'uno_a_uno_crear:false/false/true/true/search_path=public,'
  || 'uno_a_uno_registrar:false/true/true/true/search_path=public,'
  || 'uno_a_uno_registrar_sin_agenda:false/true/true/true/search_path=public,'
  || 'uno_a_uno_relaciones:false/false/true/true/search_path=public,'
  || 'uno_a_uno_supervisados_de:false/false/true/true/search_path=public,'
  || 'uno_a_uno_supervision:false/true/true/true/search_path=public,'
  || 'uno_a_uno_supervision_lideres:false/true/true/true/search_path=public');

SELECT pg_temp.assert_eq('S7.2: supervision has no nota_privada column', $q$
  SELECT (pg_get_function_result('public.uno_a_uno_supervision(timestamptz, timestamptz)'::regprocedure) LIKE '%nota%')::text
$q$, 'false');

SELECT pg_temp.assert_raises('S7.3: the table refuses a celebración over 500 characters', $q$
  INSERT INTO public.uno_a_uno (estado, fecha_hora, celebracion) VALUES ('agendado', now() + interval '1 day', repeat('x', 501))
$q$, '23514');

-- ── Fixture 1:1s, made through the public functions ────────────────

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.capture('fixture a1', 'a1', format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days', 'Café')$q$, pg_temp.u('MI')));
SELECT pg_temp.capture('fixture r1', 'r1', format($q$
  SELECT public.uno_a_uno_registrar_sin_agenda(p_dirigido_id => %L, p_fecha_hora => now() - interval '1 day',
           p_resumen => 'R1', p_nota_privada => 'N1', p_celebracion => '  C1 ')$q$, pg_temp.u('CO')));
SELECT pg_temp.capture('fixture r4 (agendar)', 'r4', format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '5 days')$q$, pg_temp.u('CO')));
SELECT pg_temp.assert_ok('S7.3: registrar stores the celebración', $q$
  SELECT public.uno_a_uno_registrar(p_id => pg_temp.k('r4'), p_resumen => 'R4', p_celebracion => 'C4')$q$);
SELECT pg_temp.capture('fixture r5', 'r5', format($q$
  SELECT public.uno_a_uno_registrar_sin_agenda(p_dirigido_id => %L, p_fecha_hora => now() - interval '3 hours',
           p_resumen => 'R5', p_celebracion => '   ')$q$, pg_temp.u('MI')));
SELECT pg_temp.assert_raises('S7.3: registrar_sin_agenda refuses a celebración over 500 characters', format($q$
  SELECT public.uno_a_uno_registrar_sin_agenda(p_dirigido_id => %L, p_fecha_hora => now() - interval '1 hour',
           p_resumen => 'R', p_celebracion => repeat('x', 501))$q$, pg_temp.u('MI')), '22023');
SELECT pg_temp.assert_raises('S7.3: registrar refuses a celebración over 500 characters', $q$
  SELECT public.uno_a_uno_registrar(p_id => pg_temp.k('a1'), p_resumen => 'R', p_celebracion => repeat('x', 501))$q$, '22023');

SELECT pg_temp.as_persona(pg_temp.a('DE1'));
SELECT pg_temp.capture('fixture r2 (old call, no celebración)', 'r2', format($q$
  SELECT public.uno_a_uno_registrar_sin_agenda(p_dirigido_id => %L, p_fecha_hora => now() - interval '2 days',
           p_resumen => 'R2', p_nota_privada => 'N2')$q$, pg_temp.u('LA')));

SELECT pg_temp.as_persona(pg_temp.a('CC'));
SELECT pg_temp.capture('fixture a2', 'a2', format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '3 days')$q$, pg_temp.u('CL')));
SELECT pg_temp.assert_ok('fixture a2 cancelled', $q$SELECT public.uno_a_uno_cancelar(pg_temp.k('a2'), 'M')$q$);

SELECT pg_temp.as_persona(pg_temp.a('PC'));
SELECT pg_temp.capture('fixture r3', 'r3', format($q$
  SELECT public.uno_a_uno_registrar_sin_agenda(%L, now() - interval '40 days', 'R3')$q$, pg_temp.u('CC')));

-- ── S7.3 celebración in mis_uno_a_uno ───────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_eq('S7.3: the leader reads resumen and the trimmed celebración', $q$SELECT pg_temp.cel_txt(pg_temp.k('r1'))$q$, 'lider|R1|C1');
SELECT pg_temp.assert_eq('S7.3: registrar stored C4', $q$SELECT pg_temp.cel_txt(pg_temp.k('r4'))$q$, 'lider|R4|C4');
SELECT pg_temp.assert_eq('S7.3: a blank celebración is stored as none', $q$SELECT pg_temp.cel_txt(pg_temp.k('r5'))$q$, 'lider|R5|-');
SELECT pg_temp.as_persona(pg_temp.a('CO'));
SELECT pg_temp.assert_eq('S7.3: the dirigido reads neither the resumen nor the celebración', $q$SELECT pg_temp.cel_txt(pg_temp.k('r1'))$q$, 'dirigido|-|-');
SELECT pg_temp.as_persona(pg_temp.a('CL'));
SELECT pg_temp.assert_eq('S7.3: the dirigido does not read the motivo de cancelación', $q$
  SELECT x.estado || '|' || coalesce(x.motivo_cancelacion, '-') FROM public.mis_uno_a_uno() x WHERE x.id = pg_temp.k('a2')$q$, 'cancelado|-');
SELECT pg_temp.as_persona(pg_temp.a('CC'));
SELECT pg_temp.assert_eq('S7.3: the leader reads the motivo de cancelación', $q$
  SELECT x.estado || '|' || coalesce(x.motivo_cancelacion, '-') FROM public.mis_uno_a_uno() x WHERE x.id = pg_temp.k('a2')$q$, 'cancelado|M');

-- ── S7.1 who sees what in supervision ───────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('DGS'));
SELECT pg_temp.assert_eq('S7.1: a director general sees the whole chain below', $q$SELECT pg_temp.sup_txt()$q$, 'a1,r1,r2,r4,r5');
SELECT pg_temp.as_persona(pg_temp.a('DE1'));
SELECT pg_temp.assert_eq('S7.1: a director de etapa sees their líderes, not the 1:1 they lead', $q$SELECT pg_temp.sup_txt()$q$, 'a1,r1,r4,r5');
SELECT pg_temp.as_persona(pg_temp.a('LA2'));
SELECT pg_temp.assert_eq('S7.1: the spouse of a leader takes part, so sees nothing in supervision', $q$SELECT pg_temp.sup_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_eq('S7.1: a líder whose people lead nobody sees nothing', $q$SELECT pg_temp.sup_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('DGD'));
SELECT pg_temp.assert_eq('S7.1: alcance directores without 1:1 below sees nothing', $q$SELECT pg_temp.sup_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('PC'));
SELECT pg_temp.assert_eq('S7.1: a Dream Team coordinador sees the sub-equipo, not their own', $q$SELECT pg_temp.sup_txt()$q$, 'a2');
SELECT pg_temp.as_persona(pg_temp.a('MI'));
SELECT pg_temp.assert_eq('S7.1: a dirigido sees nothing', $q$SELECT pg_temp.sup_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('NOBODY'));
SELECT pg_temp.assert_eq('S7.1: nobody sees nothing', $q$SELECT pg_temp.sup_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('S7.1: admin sees every 1:1', $q$SELECT pg_temp.sup_txt()$q$, 'a1,a2,r1,r2,r3,r4,r5');
SELECT pg_temp.assert_eq('S7.1: the window filters on fecha_hora', $q$
  SELECT coalesce(string_agg(i.k, ',' ORDER BY i.k), '')
    FROM public.uno_a_uno_supervision(now() - interval '30 days', now() + interval '1 day') s JOIN t_u7_ids i ON i.id = s.id$q$, 'r1,r2,r4,r5');
SELECT pg_temp.as_persona(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('S7.1: pastor sees every 1:1', $q$SELECT pg_temp.sup_txt()$q$, 'a1,a2,r1,r2,r3,r4,r5');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('S7.1: no session sees nothing', $q$SELECT pg_temp.sup_txt()$q$, '');

-- ── S7.2 what supervision shows ─────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('DGS'));
SELECT pg_temp.assert_eq('S7.2: realizado with celebración', $q$SELECT pg_temp.sup_uno_txt(pg_temp.k('r1'))$q$, 'realizado|LA+LA2|CO|R1|C1|-');
SELECT pg_temp.assert_eq('S7.2: realizado without celebración', $q$SELECT pg_temp.sup_uno_txt(pg_temp.k('r2'))$q$, 'realizado|DE1|LA+LA2|R2|-|-');
SELECT pg_temp.assert_eq('S7.2: agendado', $q$SELECT pg_temp.sup_uno_txt(pg_temp.k('a1'))$q$, 'agendado|LA+LA2|MI+MI2|-|-|-');
SELECT pg_temp.as_persona(pg_temp.a('PC'));
SELECT pg_temp.assert_eq('S7.2: cancelado with motivo', $q$SELECT pg_temp.sup_uno_txt(pg_temp.k('a2'))$q$, 'cancelado|CC|CL|-|-|M');

-- ── S7.4 leaders of the chain ───────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('DGS'));
SELECT pg_temp.assert_eq('S7.4: director general — the leaders below with their numbers', $q$SELECT pg_temp.lideres_txt()$q$,
  'DE1:2/1/0/Y, LA:3/3/1/Y');
SELECT pg_temp.assert_eq('S7.4: what each one leads', $q$
  SELECT string_agg(l.label || '=' || array_to_string(x.contextos, '|'), ', ' ORDER BY l.label COLLATE "C")
    FROM public.uno_a_uno_supervision_lideres() x JOIN t_u7_labels l ON l.id = x.usuario_id$q$,
  'DE1=Director de etapa: ZZ U7 S, LA=GDV: ZZ U7 G1');
SELECT pg_temp.as_persona(pg_temp.a('DE1'));
SELECT pg_temp.assert_eq('S7.4: director de etapa', $q$SELECT pg_temp.lideres_txt()$q$, 'LA:3/3/1/Y');
SELECT pg_temp.as_persona(pg_temp.a('PC'));
SELECT pg_temp.assert_eq('S7.4: Dream Team coordinador', $q$SELECT pg_temp.lideres_txt()$q$, 'CC:2/0/0/-, CL:1/0/0/-');
SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_eq('S7.4: nobody below leads', $q$SELECT pg_temp.lideres_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('MI'));
SELECT pg_temp.assert_eq('S7.4: a dirigido gets nothing', $q$SELECT pg_temp.lideres_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('S7.4: admin gets every leader', $q$SELECT pg_temp.lideres_txt()$q$,
  'CC:2/0/0/-, CL:1/0/0/-, DE1:2/1/0/Y, DGD:1/0/0/-, DGS:2/0/0/-, LA:3/3/1/Y, PC:3/0/0/Y');
SELECT pg_temp.assert_eq('S7.4: the window is p_dias', $q$SELECT pg_temp.lideres_txt(60)$q$,
  'CC:2/0/0/-, CL:1/0/0/-, DE1:2/1/0/Y, DGD:1/0/0/-, DGS:2/0/0/-, LA:3/3/1/Y, PC:3/1/0/Y');
SELECT pg_temp.assert_eq('S7.4: nobody-in-a-while first (último realizado nulls first)', $q$
  WITH x AS (SELECT l.label, x.ultimo_realizado, o.n
               FROM public.uno_a_uno_supervision_lideres() WITH ORDINALITY AS x(usuario_id, nombre, apellido, contextos, dirigidos, realizados, agendados, ultimo_realizado, n)
               JOIN t_u7_labels l ON l.id = x.usuario_id
               CROSS JOIN LATERAL (SELECT x.n) o)
  SELECT ((SELECT max(n) FROM x WHERE ultimo_realizado IS NULL) < (SELECT min(n) FROM x WHERE ultimo_realizado IS NOT NULL))::text$q$, 'true');
SELECT pg_temp.assert_raises('S7.4: p_dias 0 is refused', $q$SELECT count(*) FROM public.uno_a_uno_supervision_lideres(0)$q$, '22023');
SELECT pg_temp.assert_raises('S7.4: p_dias 367 is refused', $q$SELECT count(*) FROM public.uno_a_uno_supervision_lideres(367)$q$, '22023');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('S7.4: no session gets nothing', $q$SELECT pg_temp.lideres_txt()$q$, '');

-- ── S7.5 access ─────────────────────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_eq('S7.5: LA leads and takes part', $q$SELECT pg_temp.acceso_txt()$q$, 't/f/t');
SELECT pg_temp.as_persona(pg_temp.a('DE1'));
SELECT pg_temp.assert_eq('S7.5: DE1 leads, supervises and takes part', $q$SELECT pg_temp.acceso_txt()$q$, 't/t/t');
SELECT pg_temp.as_persona(pg_temp.a('DGS'));
SELECT pg_temp.assert_eq('S7.5: DGS leads and supervises', $q$SELECT pg_temp.acceso_txt()$q$, 't/t/f');
SELECT pg_temp.as_persona(pg_temp.a('DGD'));
SELECT pg_temp.assert_eq('S7.5: DGD leads someone who leads nobody', $q$SELECT pg_temp.acceso_txt()$q$, 't/f/f');
SELECT pg_temp.as_persona(pg_temp.a('MI'));
SELECT pg_temp.assert_eq('S7.5: a dirigido only takes part', $q$SELECT pg_temp.acceso_txt()$q$, 'f/f/t');
SELECT pg_temp.as_persona(pg_temp.a('NOBODY'));
SELECT pg_temp.assert_eq('S7.5: nobody', $q$SELECT pg_temp.acceso_txt()$q$, 'f/f/f');
SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('S7.5: admin supervises', $q$SELECT pg_temp.acceso_txt()$q$, 'f/t/f');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('S7.5: no session', $q$SELECT pg_temp.acceso_txt()$q$, 'f/f/f');

-- ── P. the internal functions as authenticated ──────────────────────


-- ── S9 where each leader sits (T9, 20261024140000) ─────────────────
-- `LABEL=dirección>área>equipo|…` of the fixture leaders the session reads,
-- with '-' for a null área or equipo. The Grupos de Vida dirección is the real
-- root equipo with experiencia 'grupos_vida' of the database (kept as 'gdv' by
-- the fixtures, read as postgres: RLS hides equipos from most callers), shown
-- as GDV.

CREATE OR REPLACE FUNCTION pg_temp.ubic_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT coalesce(string_agg(l.label || '=' || (
           SELECT string_agg(CASE WHEN e ->> 'direccion_id' = pg_temp.k('gdv')::text
                                  THEN 'GDV' ELSE e ->> 'direccion' END
                             || '>' || coalesce(e ->> 'area', '-') || '>' || coalesce(e ->> 'equipo', '-'), '|'
                             ORDER BY e ->> 'direccion', e ->> 'area', e ->> 'equipo')
             FROM jsonb_array_elements(x.ubicaciones) e), ', ' ORDER BY l.label COLLATE "C"), '')
    INTO v
    FROM public.uno_a_uno_supervision_lideres() x
    JOIN t_u7_labels l ON l.id = x.usuario_id;
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ubic_txt() TO PUBLIC;

SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('S9.2: every leader sits in the Dream Team tree, Grupos de Vida included', $q$SELECT pg_temp.ubic_txt()$q$,
  'CC=ZZ U7 padre>ZZ U7 hija>-, '
  || 'CL=ZZ U7 padre>ZZ U7 hija>-, '
  || 'DE1=GDV>ZZ U7 S>-|GDV>ZZ U7 S2>-, '
  || 'DGD=GDV>ZZ U7 S>-, '
  || 'DGS=GDV>ZZ U7 S>-|GDV>ZZ U7 S2>-, '
  || 'LA=GDV>ZZ U7 S>ZZ U7 G1, '
  || 'PC=ZZ U7 padre>->-');
SELECT pg_temp.as_persona(pg_temp.a('DGS'));
SELECT pg_temp.assert_eq('S9.3: a supervisor gets the same places for their chain', $q$SELECT pg_temp.ubic_txt()$q$,
  'DE1=GDV>ZZ U7 S>-|GDV>ZZ U7 S2>-, LA=GDV>ZZ U7 S>ZZ U7 G1');
SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_raises('S9.3: authenticated cannot call uno_a_uno_ubicaciones',
  $q$SELECT count(*) FROM public.uno_a_uno_ubicaciones()$q$, '42501');

SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_raises('P: authenticated cannot call uno_a_uno_relaciones',
  $q$SELECT count(*) FROM public.uno_a_uno_relaciones()$q$, '42501');
SELECT pg_temp.assert_raises('P: authenticated cannot call uno_a_uno_supervisados_de',
  format($q$SELECT count(*) FROM public.uno_a_uno_supervisados_de(%L)$q$, pg_temp.u('DGS')), '42501');
RESET ROLE;

-- S9.2: a deep equipo is named by its path below the área (Waumba Land ›
-- Anfitriones and UpStreet › Anfitriones are two equipos). NOBODY serves alone
-- as lider of a 4-level equipo, so they still lead nobody; read as postgres.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 11), 'dps', NULL,                  'ZZ U7 R9', true),
  (pg_temp.id('eq', 12), 'dps', pg_temp.id('eq', 11), 'ZZ U7 A9', true),
  (pg_temp.id('eq', 13), 'dps', pg_temp.id('eq', 12), 'ZZ U7 S9', true),
  (pg_temp.id('eq', 14), 'dps', pg_temp.id('eq', 13), 'ZZ U7 E9', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
  (pg_temp.id('ro', 11), pg_temp.id('eq', 14), 'ZZ U7 guia E9', 'lider');
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  (pg_temp.id('sv', 11), pg_temp.u('NOBODY'), pg_temp.id('eq', 14), pg_temp.id('ro', 11), 'activo');
SELECT pg_temp.assert_eq('S9.2: a deep equipo is named by its path below the área', format($q$
  SELECT string_agg(u.direccion || '>' || coalesce(u.area, '-') || '>' || coalesce(u.equipo, '-'), '|')
    FROM public.uno_a_uno_ubicaciones() u WHERE u.lider_id = %L$q$, pg_temp.u('NOBODY')),
  'ZZ U7 R9>ZZ U7 A9>ZZ U7 S9 › ZZ U7 E9');

-- S9.2: two current groups of one segmento with the same name (two temporadas
-- active at once) are told apart by their temporada.
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  (pg_temp.id('te', 9), 'ZZ U7 T9', '2026-01-01', '2026-12-31', true, 'activa');
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_aprobacion, eliminado) VALUES
  (pg_temp.id('gr', 9), 'ZZ U7 G1', pg_temp.id('te', 9), pg_temp.id('sg', 1), true, 'aprobado', false);
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida, estado) VALUES
  (pg_temp.id('gr', 9), pg_temp.u('LX'), 'Líder', NULL, 'activo');
SELECT pg_temp.assert_eq('S9.2: same-name current groups carry their temporada', format($q$
  SELECT string_agg(u.equipo, '|' ORDER BY u.equipo COLLATE "C") FROM public.uno_a_uno_ubicaciones() u WHERE u.lider_id IN (%L, %L)$q$,
  pg_temp.u('LA'), pg_temp.u('LX')),
  'ZZ U7 G1 (ZZ U7 T9)|ZZ U7 G1 (ZZ U7 activa)');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_u7_failures;

ROLLBACK;
