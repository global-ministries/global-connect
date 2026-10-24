-- T3 (odd/tasks/uno-a-uno.md) — the 1:1 model, the who-leads-whom rule and the
-- scheduling functions (migration 20261015120000_uno_a_uno_modelo.sql).
--
-- Covers:
--   a. mis_dirigidos() per persona: a GDV Líder (and their spouse, also Líder)
--      leads the current Colíderes and Miembros of their current group, never
--      the co-Líder spouse, an ex-member, an inactive member or the members of
--      a non-current group; a Colíder and a Miembro lead nobody; a director de
--      etapa leads the Líderes of their current groups; a director general
--      leads the directores de etapa of the segment (alcance 'segmento') or
--      only the ones marked in dg_directores_etapa (alcance 'directores');
--      Dream Team: a higher level leads a lower level in the same equipo, and
--      the head of an equipo leads the head of each active direct sub-equipo;
--      paused servicios and inactive equipos count for nothing. One row per
--      dirigido with every context, sorted; conyuge_id names the spouse.
--   b. uno_a_uno_dirigidos_de (the internal rule) returns the same as
--      mis_dirigidos() and is not callable by authenticated; no session → none.
--   c. agendar: not a dirigido → 42501; past date → 22023; no session → 42501;
--      a valid one puts both couples on their sides, estado agendado,
--      creado_por = caller.
--   d. Only the leader side acts: the dirigido cannot reprogramar / cancelar /
--      registrar (42501); the leader's spouse can. Unknown id → P0002.
--   e. reprogramar: future date only, only while agendado, and it clears
--      recordatorio_enviado_en.
--   f. registrar: resumen required; a given date cannot be future; sets
--      realizado and realizado_en; registering twice → 22023. The dirigido side
--      reads resumen and nota_privada as null, the leader side reads both.
--   g. cancelar: sets cancelado_en and the motivo; registrar / reprogramar a
--      cancelled one → 22023.
--   h. registrar_sin_agenda: not a dirigido → 42501; future date → 22023;
--      blank resumen → 22023; a valid one is realizado at the given date.
--   i. mis_uno_a_uno date window.
--   j. Privileges: authenticated cannot read or write either table (42501);
--      RLS on with no policies; anon executes no new function; every new
--      function is security definer with search_path pinned and no PUBLIC
--      execute; the internal functions are service_role only.
--   k. The table checks: realizado needs realizado_en, cancelado needs
--      cancelado_en.
--
-- Every case reaches the new objects through EXECUTE inside the assert helpers,
-- so before the migration each case is reported as failing (RED) instead of
-- aborting the file, and after it every case passes (GREEN).
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own d3a10000-... namespace and are built with
-- pg_temp.id(kind, n). The MCP connection is `postgres` (BYPASSRLS), so every
-- caller assertion runs under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id. The last statement is a
-- SELECT of the failing cases (0 failing cases = all ok), because the MCP tool
-- returns only the last result-producing statement.
--
-- Identities (usuario n = auth n, apellido = label):
--   1 LA, 2 LA2   married, both Líder of G1 (current) and LA also Líder of G2
--   3 CO          Colíder of G1
--   4 MI, 5 MI2   married, both Miembro of G1; MI2 also voluntario of PADRE
--   6 EX          left G1 (fecha_salida)
--   7 OT          Miembro of G2 (season not active)
--   8 IN          Miembro of G1 with estado 'inactivo'
--   9 DE1         director de etapa of S (linked to G1 and G2) and of S2
--  10 DE2         director de etapa of S, no groups
--  11 DGS         director general of S and S2, alcance 'segmento'
--  12 DGD         director general of S, alcance 'directores', marks DE2 only
--  13 PC, 14 PV   coordinador / voluntario of PADRE
--  15 CC, 16 CL, 17 CV  coordinador / lider / voluntario of HIJA (child of PADRE)
--  18 NOBODY      no assignment anywhere
--  19 LX          Líder of G2 only
--  20 PX          lider of PADRE, servicio en_pausa
--  21 CX          coordinador of HIJA_INACTIVA (inactive child of PADRE)

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_u1_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_u1_labels (id uuid PRIMARY KEY, label text NOT NULL, auth_id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE t_u1_ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_u1_failures TO authenticated, anon;
GRANT SELECT ON t_u1_labels TO authenticated, anon;
GRANT INSERT, SELECT ON t_u1_ids TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_u1_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
    INSERT INTO t_u1_ids (k, id) VALUES (p_key, v_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected an id, got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.k(p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u1_ids WHERE k = p_key;
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
  SELECT format('d3a10000-0000-4000-%s-%s',
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
  SELECT auth_id FROM t_u1_labels WHERE label = p_label;
$$;

-- The usuario id of a fixture by label.
CREATE OR REPLACE FUNCTION pg_temp.u(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u1_labels WHERE label = p_label;
$$;

-- `LABEL[context|context], …` of what the session reads from mis_dirigidos().
-- plpgsql so the file loads before the migration exists.
CREATE OR REPLACE FUNCTION pg_temp.dirigidos_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  SELECT coalesce(string_agg(coalesce(l.label, d.usuario_id::text) || '[' || array_to_string(d.contextos, '|') || ']',
                             ', ' ORDER BY coalesce(l.label, d.usuario_id::text) COLLATE "C"), '')
    INTO v
    FROM public.mis_dirigidos() d
    LEFT JOIN t_u1_labels l ON l.id = d.usuario_id;
  RETURN v;
END;
$$;

-- Same shape from the internal rule, for one usuario.
CREATE OR REPLACE FUNCTION pg_temp.dirigidos_de_txt(p_usuario uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  SELECT coalesce(string_agg(coalesce(l.label, d.usuario_id::text) || '[' || array_to_string(d.contextos, '|') || ']',
                             ', ' ORDER BY coalesce(l.label, d.usuario_id::text) COLLATE "C"), '')
    INTO v
    FROM public.uno_a_uno_dirigidos_de(p_usuario) d
    LEFT JOIN t_u1_labels l ON l.id = d.usuario_id;
  RETURN v;
END;
$$;

-- `LABEL>SPOUSE_LABEL` of every dirigido the session reads ('-' when none).
CREATE OR REPLACE FUNCTION pg_temp.conyuges_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  SELECT coalesce(string_agg(coalesce(l.label, d.usuario_id::text) || '>' || coalesce(c.label, d.conyuge_id::text, '-'),
                             ', ' ORDER BY coalesce(l.label, d.usuario_id::text) COLLATE "C"), '')
    INTO v
    FROM public.mis_dirigidos() d
    LEFT JOIN t_u1_labels l ON l.id = d.usuario_id
    LEFT JOIN t_u1_labels c ON c.id = d.conyuge_id;
  RETURN v;
END;
$$;

-- The apellidos (= labels) of a jsonb array of {id, nombre, apellido}, joined by '+'.
CREATE OR REPLACE FUNCTION pg_temp.nombres(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e ->> 'apellido', '+' ORDER BY (e ->> 'apellido') COLLATE "C"), '')
    FROM jsonb_array_elements(p) e;
$$;

-- `estado|mi_lado|lideres|dirigidos|resumen|nota|motivo` of one 1:1 as the
-- session reads it from mis_uno_a_uno(); NULL when the session does not see it.
CREATE OR REPLACE FUNCTION pg_temp.uno_txt(p_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  SELECT x.estado || '|' || x.mi_lado || '|' || pg_temp.nombres(x.lideres) || '|' || pg_temp.nombres(x.dirigidos)
         || '|' || coalesce(x.resumen, '-') || '|' || coalesce(x.nota_privada, '-') || '|' || coalesce(x.motivo_cancelacion, '-')
    INTO v
    FROM public.mis_uno_a_uno() x
   WHERE x.id = p_id;
  RETURN v;
END;
$$;

-- One persona at a time: sets the session, then reads mis_dirigidos().
CREATE OR REPLACE FUNCTION pg_temp.dirigidos_de_persona(p_label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_persona(pg_temp.a(p_label));
  RETURN pg_temp.dirigidos_txt();
END;
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Fixtures (as postgres, before any role switch) ----------------------------

INSERT INTO t_u1_labels (id, label, auth_id)
SELECT pg_temp.id('us', n::int), l, pg_temp.id('au', n::int)
  FROM unnest(ARRAY['LA', 'LA2', 'CO', 'MI', 'MI2', 'EX', 'OT', 'IN', 'DE1', 'DE2', 'DGS', 'DGD',
                    'PC', 'PV', 'CC', 'CL', 'CV', 'NOBODY', 'LX', 'PX', 'CX']) WITH ORDINALITY AS t(l, n);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'u1-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 21) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT l.id, pg_temp.id('au', n), 'ZZ U1', l.label, 'u1-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 21) AS n
  JOIN t_u1_labels l ON l.id = pg_temp.id('us', n);

-- Two couples, written in both directions of relaciones_usuarios.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  (pg_temp.id('us', 1), pg_temp.id('us', 2), 'conyuge'),
  (pg_temp.id('us', 5), pg_temp.id('us', 4), 'conyuge');

INSERT INTO public.segmentos (id, nombre) VALUES
  (pg_temp.id('sg', 1), 'ZZ U1 S'),
  (pg_temp.id('sg', 2), 'ZZ U1 S2');

INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  (pg_temp.id('te', 1), 'ZZ U1 activa',   '2026-01-01', '2026-12-31', true,  'activa'),
  (pg_temp.id('te', 2), 'ZZ U1 inactiva', '2027-01-01', '2027-12-31', false, 'planificacion');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_aprobacion, eliminado) VALUES
  (pg_temp.id('gr', 1), 'ZZ U1 G1', pg_temp.id('te', 1), pg_temp.id('sg', 1), true, 'aprobado', false),
  (pg_temp.id('gr', 2), 'ZZ U1 G2', pg_temp.id('te', 2), pg_temp.id('sg', 1), true, 'aprobado', false);

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
  (pg_temp.id('eq', 1), 'dps', NULL,                 'ZZ U1 padre',          true),
  (pg_temp.id('eq', 2), 'dps', pg_temp.id('eq', 1), 'ZZ U1 hija',           true),
  (pg_temp.id('eq', 3), 'dps', pg_temp.id('eq', 1), 'ZZ U1 hija inactiva',  false);

-- Labels that map to another level on purpose: the explicit nivel decides.
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'ZZ U1 jefe padre',  'coordinador'),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'ZZ U1 apoyo padre', 'voluntario'),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 1), 'ZZ U1 guia padre',  'lider'),
  (pg_temp.id('ro', 4), pg_temp.id('eq', 2), 'ZZ U1 jefe hija',   'coordinador'),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 2), 'ZZ U1 guia hija',   'lider'),
  (pg_temp.id('ro', 6), pg_temp.id('eq', 2), 'ZZ U1 apoyo hija',  'voluntario'),
  (pg_temp.id('ro', 7), pg_temp.id('eq', 3), 'ZZ U1 jefe inact',  'coordinador');

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  (pg_temp.id('sv', 1), pg_temp.id('us', 13), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo'),
  (pg_temp.id('sv', 2), pg_temp.id('us', 14), pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'activo'),
  (pg_temp.id('sv', 3), pg_temp.id('us', 5),  pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'activo'),
  (pg_temp.id('sv', 4), pg_temp.id('us', 20), pg_temp.id('eq', 1), pg_temp.id('ro', 3), 'en_pausa'),
  (pg_temp.id('sv', 5), pg_temp.id('us', 15), pg_temp.id('eq', 2), pg_temp.id('ro', 4), 'activo'),
  (pg_temp.id('sv', 6), pg_temp.id('us', 16), pg_temp.id('eq', 2), pg_temp.id('ro', 5), 'activo'),
  (pg_temp.id('sv', 7), pg_temp.id('us', 17), pg_temp.id('eq', 2), pg_temp.id('ro', 6), 'activo'),
  (pg_temp.id('sv', 8), pg_temp.id('us', 21), pg_temp.id('eq', 3), pg_temp.id('ro', 7), 'activo');

-- ── j (catalog, as postgres) ────────────────────────────────────────

SELECT pg_temp.assert_eq('j: both tables exist with RLS on and no policy', $q$
  SELECT string_agg(c.relname || '=' || c.relrowsecurity::text || '/' ||
                    (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::text, ',' ORDER BY c.relname)
    FROM pg_class c
   WHERE c.oid IN ('public.uno_a_uno'::regclass, 'public.uno_a_uno_personas'::regclass)
$q$, 'uno_a_uno=true/0,uno_a_uno_personas=true/0');

SELECT pg_temp.assert_eq('j: anon / authenticated hold no privilege on either table; service_role does', $q$
  SELECT string_agg(t || ':' || r || '=' ||
           (has_table_privilege(r, t, 'SELECT') OR has_table_privilege(r, t, 'INSERT')
            OR has_table_privilege(r, t, 'UPDATE') OR has_table_privilege(r, t, 'DELETE'))::text, ',' ORDER BY t, r)
    FROM unnest(ARRAY['public.uno_a_uno', 'public.uno_a_uno_personas']) t
   CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) r
$q$, 'public.uno_a_uno:anon=false,public.uno_a_uno:authenticated=false,public.uno_a_uno:service_role=true,'
     || 'public.uno_a_uno_personas:anon=false,public.uno_a_uno_personas:authenticated=false,public.uno_a_uno_personas:service_role=true');

-- The new functions: name → who may execute it (anon/authenticated/service_role).
CREATE TEMP TABLE t_u1_funciones (firma text PRIMARY KEY, esperado text NOT NULL) ON COMMIT DROP;
INSERT INTO t_u1_funciones (firma, esperado) VALUES
  ('public.uno_a_uno_dirigidos_de(uuid)', 'false/false/true'),
  ('public.uno_a_uno_crear(uuid,uuid,text,timestamp with time zone,text,text,text)', 'false/false/true'),
  ('public.mis_dirigidos()', 'false/true/true'),
  ('public.uno_a_uno_agendar(uuid,timestamp with time zone,text)', 'false/true/true'),
  ('public.uno_a_uno_registrar_sin_agenda(uuid,timestamp with time zone,text,text,text)', 'false/true/true'),
  ('public.uno_a_uno_registrar(uuid,text,text,timestamp with time zone)', 'false/true/true'),
  ('public.uno_a_uno_reprogramar(uuid,timestamp with time zone)', 'false/true/true'),
  ('public.uno_a_uno_cancelar(uuid,text)', 'false/true/true'),
  ('public.mis_uno_a_uno(timestamp with time zone,timestamp with time zone)', 'false/true/true');

SELECT pg_temp.assert_eq('j: execute privileges of ' || f.firma, format($q$
  SELECT has_function_privilege('anon', %1$L, 'EXECUTE')::text || '/'
      || has_function_privilege('authenticated', %1$L, 'EXECUTE')::text || '/'
      || has_function_privilege('service_role', %1$L, 'EXECUTE')::text
$q$, f.firma), f.esperado)
  FROM t_u1_funciones f;

SELECT pg_temp.assert_eq('j: no PUBLIC execute on ' || f.firma, format($q$
  SELECT count(*)::text
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = %L::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
$q$, f.firma), '0')
  FROM t_u1_funciones f;

SELECT pg_temp.assert_eq('j: security definer with search_path=public: ' || f.firma, format($q$
  SELECT (p.prosecdef AND 'search_path=public' = ANY (p.proconfig))::text
    FROM pg_proc p WHERE p.oid = %L::regprocedure
$q$, f.firma), 'true')
  FROM t_u1_funciones f;

SELECT pg_temp.assert_eq('j: no other uno_a_uno function exists', $q$
  SELECT count(*)::text FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND (p.proname LIKE 'uno\_a\_uno%' OR p.proname IN ('mis_dirigidos', 'mis_uno_a_uno'))
     AND p.oid NOT IN (SELECT firma::regprocedure::oid FROM t_u1_funciones)
$q$, '0');

-- ── k. table checks (as postgres) ───────────────────────────────────

SELECT pg_temp.assert_raises('k: realizado without realizado_en is rejected', $q$
  INSERT INTO public.uno_a_uno (estado, fecha_hora, resumen) VALUES ('realizado', now(), 'x')
$q$, '23514');

SELECT pg_temp.assert_raises('k: cancelado without cancelado_en is rejected', $q$
  INSERT INTO public.uno_a_uno (estado, fecha_hora) VALUES ('cancelado', now())
$q$, '23514');

SELECT pg_temp.assert_raises('k: an unknown estado is rejected', $q$
  INSERT INTO public.uno_a_uno (estado, fecha_hora) VALUES ('pendiente', now())
$q$, '23514');

SELECT pg_temp.assert_raises('k: an unknown lado is rejected', format($q$
  WITH u AS (INSERT INTO public.uno_a_uno (estado, fecha_hora) VALUES ('agendado', now()) RETURNING id)
  INSERT INTO public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado) SELECT u.id, %L, 'mentor' FROM u
$q$, pg_temp.id('us', 18)), '23514');

-- ── b. the internal rule (as postgres) ──────────────────────────────

SELECT pg_temp.assert_eq('b: uno_a_uno_dirigidos_de(LA) as postgres',
  format($q$SELECT pg_temp.dirigidos_de_txt(%L)$q$, pg_temp.id('us', 1)),
  'CO[GDV: ZZ U1 G1], MI[GDV: ZZ U1 G1], MI2[GDV: ZZ U1 G1]');

SELECT pg_temp.assert_eq('b: uno_a_uno_dirigidos_de(NULL) is empty',
  $q$SELECT pg_temp.dirigidos_de_txt(NULL)$q$, '');

-- ── a. mis_dirigidos per persona ────────────────────────────────────

CREATE TEMP TABLE t_u1_esperado (label text PRIMARY KEY, esperado text NOT NULL) ON COMMIT DROP;
GRANT SELECT ON t_u1_esperado TO authenticated;
INSERT INTO t_u1_esperado (label, esperado) VALUES
  ('LA',     'CO[GDV: ZZ U1 G1], MI[GDV: ZZ U1 G1], MI2[GDV: ZZ U1 G1]'),
  ('LA2',    'CO[GDV: ZZ U1 G1], MI[GDV: ZZ U1 G1], MI2[GDV: ZZ U1 G1]'),
  ('CO',     ''),
  ('MI',     ''),
  ('MI2',    ''),
  ('EX',     ''),
  ('OT',     ''),
  ('LX',     ''),
  ('DE1',    'LA[Director de etapa: ZZ U1 S], LA2[Director de etapa: ZZ U1 S]'),
  ('DE2',    ''),
  ('DGS',    'DE1[Director general: ZZ U1 S|Director general: ZZ U1 S2], DE2[Director general: ZZ U1 S]'),
  ('DGD',    'DE2[Director general: ZZ U1 S]'),
  ('PC',     'CC[Dream Team: ZZ U1 hija], MI2[Dream Team: ZZ U1 padre], PV[Dream Team: ZZ U1 padre]'),
  ('PV',     ''),
  ('PX',     ''),
  ('CC',     'CL[Dream Team: ZZ U1 hija], CV[Dream Team: ZZ U1 hija]'),
  ('CL',     'CV[Dream Team: ZZ U1 hija]'),
  ('CV',     ''),
  ('CX',     ''),
  ('NOBODY', '');

SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_eq('a: mis_dirigidos of ' || e.label,
  format($q$SELECT pg_temp.dirigidos_de_persona(%L)$q$, e.label), e.esperado)
  FROM t_u1_esperado e;

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_eq('a: conyuge_id names the spouse of each dirigido',
  $q$SELECT pg_temp.conyuges_txt()$q$, 'CO>-, MI>MI2, MI2>MI');
SELECT pg_temp.assert_eq('a: mis_dirigidos returns nombre and apellido',
  format($q$SELECT nombre || ' ' || apellido FROM public.mis_dirigidos() WHERE usuario_id = %L$q$, pg_temp.u('CO')),
  'ZZ U1 CO');

SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('b: no session → mis_dirigidos is empty', $q$SELECT pg_temp.dirigidos_txt()$q$, '');

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_raises('b: authenticated cannot call uno_a_uno_dirigidos_de',
  format($q$SELECT count(*) FROM public.uno_a_uno_dirigidos_de(%L)$q$, pg_temp.u('LA')), '42501');
SELECT pg_temp.assert_raises('b: authenticated cannot call uno_a_uno_crear',
  format($q$SELECT public.uno_a_uno_crear(%L, %L, 'agendado', now() + interval '1 day', NULL, NULL, NULL)$q$,
         pg_temp.u('LA'), pg_temp.u('MI')), '42501');

-- ── c. agendar ──────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('c: agendar with someone LA does not lead → 42501',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days')$q$, pg_temp.u('EX')), '42501');
SELECT pg_temp.assert_raises('c: agendar with LA''s own spouse → 42501',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days')$q$, pg_temp.u('LA2')), '42501');
SELECT pg_temp.assert_raises('c: agendar in the past → 22023',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() - interval '1 hour')$q$, pg_temp.u('MI')), '22023');
SELECT pg_temp.assert_raises('c: agendar without a date → 22023',
  format($q$SELECT public.uno_a_uno_agendar(%L, NULL)$q$, pg_temp.u('MI')), '22023');

SELECT pg_temp.capture('c: LA agenda with MI', 'u1',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days', 'Casa de LA')$q$, pg_temp.u('MI')));

SELECT pg_temp.assert_eq('c: LA reads it: both couples on their sides',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('u1'))$q$, 'agendado|lider|LA+LA2|MI+MI2|-|-|-');
SELECT pg_temp.assert_eq('c: the people carry id, nombre and apellido',
  $q$SELECT (lideres -> 0 ? 'id' AND lideres -> 0 ? 'nombre' AND lideres -> 0 ? 'apellido')::text
       FROM public.mis_uno_a_uno() WHERE id = pg_temp.k('u1')$q$, 'true');
SELECT pg_temp.assert_eq('c: fecha_hora and lugar are kept',
  $q$SELECT (fecha_hora = now() + interval '2 days')::text || '/' || lugar
       FROM public.mis_uno_a_uno() WHERE id = pg_temp.k('u1')$q$, 'true/Casa de LA');

SELECT pg_temp.as_persona(pg_temp.a('MI2'));
SELECT pg_temp.assert_eq('c: the dirigido''s spouse reads it on the dirigido side',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('u1'))$q$, 'agendado|dirigido|LA+LA2|MI+MI2|-|-|-');

SELECT pg_temp.as_persona(pg_temp.a('CO'));
SELECT pg_temp.assert_eq('c: someone outside the 1:1 does not read it',
  $q$SELECT coalesce(pg_temp.uno_txt(pg_temp.k('u1')), 'none')$q$, 'none');

SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('c: no session → agendar 42501',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days')$q$, pg_temp.u('MI')), '42501');
SELECT pg_temp.assert_eq('c: no session → mis_uno_a_uno is empty',
  $q$SELECT count(*)::text FROM public.mis_uno_a_uno()$q$, '0');

-- A director de etapa agenda with a Líder: the Líder's spouse joins, the
-- director has no spouse.
SELECT pg_temp.as_persona(pg_temp.a('DE1'));
SELECT pg_temp.capture('c: DE1 agenda with LA2', 'de',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '5 days')$q$, pg_temp.u('LA2')));
SELECT pg_temp.assert_eq('c: DE1 reads it with LA and LA2 as dirigidos',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('de'))$q$, 'agendado|lider|DE1|LA+LA2|-|-|-');

-- ── d / e. who acts, reprogramar ────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('MI'));
SELECT pg_temp.assert_raises('d: the dirigido cannot reprogramar → 42501',
  $q$SELECT public.uno_a_uno_reprogramar(pg_temp.k('u1'), now() + interval '3 days')$q$, '42501');
SELECT pg_temp.assert_raises('d: the dirigido cannot cancelar → 42501',
  $q$SELECT public.uno_a_uno_cancelar(pg_temp.k('u1'), 'no puedo')$q$, '42501');
SELECT pg_temp.assert_raises('d: the dirigido cannot registrar → 42501',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('u1'), 'resumen')$q$, '42501');

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_raises('d: an unknown id → P0002',
  format($q$SELECT public.uno_a_uno_reprogramar(%L, now() + interval '3 days')$q$, pg_temp.id('xx', 1)), 'P0002');

-- The reminder of T5 already went out.
RESET ROLE;
SELECT pg_temp.assert_ok('e: fixture: the reminder was sent',
  $q$UPDATE public.uno_a_uno SET recordatorio_enviado_en = now() WHERE id = pg_temp.k('u1')$q$);
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(pg_temp.a('LA2'));
SELECT pg_temp.assert_raises('e: reprogramar to the past → 22023',
  $q$SELECT public.uno_a_uno_reprogramar(pg_temp.k('u1'), now() - interval '1 day')$q$, '22023');
SELECT pg_temp.assert_ok('d: the leader''s spouse can reprogramar',
  $q$SELECT public.uno_a_uno_reprogramar(pg_temp.k('u1'), now() + interval '3 days')$q$);

RESET ROLE;
SELECT pg_temp.assert_eq('e: reprogramar moved the date and cleared the reminder',
  $q$SELECT (fecha_hora = now() + interval '3 days')::text || '/' || coalesce(recordatorio_enviado_en::text, 'null')
       || '/' || estado || '/' || (actualizado_en = now())::text
       FROM public.uno_a_uno WHERE id = pg_temp.k('u1')$q$, 'true/null/agendado/true');
SELECT pg_temp.assert_eq('c: creado_por is the caller who agendó',
  $q$SELECT (creado_por = pg_temp.u('LA'))::text FROM public.uno_a_uno WHERE id = pg_temp.k('u1')$q$, 'true');
SET LOCAL ROLE authenticated;

-- ── f. registrar ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('LA2'));
SELECT pg_temp.assert_raises('f: blank resumen → 22023',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('u1'), '   ')$q$, '22023');
SELECT pg_temp.assert_raises('f: a future date → 22023',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('u1'), 'Hablamos', NULL, now() + interval '1 hour')$q$, '22023');
SELECT pg_temp.assert_ok('d: the leader''s spouse can registrar',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('u1'), 'Hablamos de la familia', 'Orar por el trabajo')$q$);
SELECT pg_temp.assert_raises('f: registering twice → 22023',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('u1'), 'Otra vez')$q$, '22023');
SELECT pg_temp.assert_raises('e: reprogramar a realizado → 22023',
  $q$SELECT public.uno_a_uno_reprogramar(pg_temp.k('u1'), now() + interval '4 days')$q$, '22023');

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.assert_eq('f: the leader side reads resumen and nota',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('u1'))$q$, 'realizado|lider|LA+LA2|MI+MI2|Hablamos de la familia|Orar por el trabajo|-');
SELECT pg_temp.assert_eq('f: registered before the scheduled time → it happened now',
  $q$SELECT (fecha_hora = now())::text || '/' || (realizado_en = now())::text
       FROM public.mis_uno_a_uno() WHERE id = pg_temp.k('u1')$q$, 'true/true');

SELECT pg_temp.as_persona(pg_temp.a('MI'));
SELECT pg_temp.assert_eq('f: the dirigido side reads no resumen and no nota',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('u1'))$q$, 'realizado|dirigido|LA+LA2|MI+MI2|-|-|-');

-- A registrar with an explicit past date keeps it.
SELECT pg_temp.as_persona(pg_temp.a('DE1'));
SELECT pg_temp.assert_ok('f: registrar with a past date',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('de'), 'Revisamos el grupo', NULL, now() - interval '2 hours')$q$);
SELECT pg_temp.assert_eq('f: the given date is kept',
  $q$SELECT estado || '/' || (fecha_hora = now() - interval '2 hours')::text
       FROM public.mis_uno_a_uno() WHERE id = pg_temp.k('de')$q$, 'realizado/true');

-- ── g. cancelar ─────────────────────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.capture('g: LA agenda with CO', 'co',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '7 days')$q$, pg_temp.u('CO')));
SELECT pg_temp.assert_ok('g: LA cancels it',
  $q$SELECT public.uno_a_uno_cancelar(pg_temp.k('co'), 'Viaje')$q$);
SELECT pg_temp.assert_eq('g: cancelled with motivo and cancelado_en',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('co')) || '/' || (cancelado_en = now())::text
       FROM public.mis_uno_a_uno() WHERE id = pg_temp.k('co')$q$, 'cancelado|lider|LA+LA2|CO|-|-|Viaje/true');
SELECT pg_temp.assert_raises('g: registrar a cancelled one → 22023',
  $q$SELECT public.uno_a_uno_registrar(pg_temp.k('co'), 'Hablamos')$q$, '22023');
SELECT pg_temp.assert_raises('g: reprogramar a cancelled one → 22023',
  $q$SELECT public.uno_a_uno_reprogramar(pg_temp.k('co'), now() + interval '8 days')$q$, '22023');
SELECT pg_temp.assert_raises('g: cancelling twice → 22023',
  $q$SELECT public.uno_a_uno_cancelar(pg_temp.k('co'))$q$, '22023');

SELECT pg_temp.as_persona(pg_temp.a('CO'));
-- Since T7 (20261024120000) the dirigido side reads nothing the leader wrote.
SELECT pg_temp.assert_eq('g: the dirigido does not read the motivo',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('co'))$q$, 'cancelado|dirigido|LA+LA2|CO|-|-|-');

-- ── h. registrar_sin_agenda ─────────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('CC'));
SELECT pg_temp.assert_raises('h: not a dirigido → 42501',
  format($q$SELECT public.uno_a_uno_registrar_sin_agenda(%L, now() - interval '1 day', 'Hablamos')$q$, pg_temp.u('PC')), '42501');
SELECT pg_temp.assert_raises('h: a future date → 22023',
  format($q$SELECT public.uno_a_uno_registrar_sin_agenda(%L, now() + interval '1 day', 'Hablamos')$q$, pg_temp.u('CL')), '22023');
SELECT pg_temp.assert_raises('h: blank resumen → 22023',
  format($q$SELECT public.uno_a_uno_registrar_sin_agenda(%L, now() - interval '1 day', ' ')$q$, pg_temp.u('CL')), '22023');
SELECT pg_temp.assert_raises('h: null resumen → 22023',
  format($q$SELECT public.uno_a_uno_registrar_sin_agenda(%L, now() - interval '1 day', NULL)$q$, pg_temp.u('CL')), '22023');
SELECT pg_temp.capture('h: CC registers an unscheduled 1:1 with CL', 'sa',
  format($q$SELECT public.uno_a_uno_registrar_sin_agenda(%L, now() - interval '1 day', 'Café', 'Nota', 'Cafetería')$q$, pg_temp.u('CL')));
SELECT pg_temp.assert_eq('h: it is realizado at the given date with realizado_en',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('sa')) || '/' || (fecha_hora = now() - interval '1 day')::text
         || '/' || (realizado_en = now())::text || '/' || lugar
       FROM public.mis_uno_a_uno() WHERE id = pg_temp.k('sa')$q$, 'realizado|lider|CC|CL|Café|Nota|-/true/true/Cafetería');

SELECT pg_temp.as_persona(pg_temp.a('CL'));
SELECT pg_temp.assert_eq('h: CL reads it on the dirigido side without resumen',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('sa'))$q$, 'realizado|dirigido|CC|CL|-|-|-');

-- ── i. date window ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('LA'));
SELECT pg_temp.capture('i: LA agenda a second one with MI2', 'u2',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '10 days')$q$, pg_temp.u('MI2')));
-- LA leads three (u1 now, co at +7 days, u2 at +10 days) and is a dirigido in
-- one (de, two hours ago, as LA2's spouse).
SELECT pg_temp.assert_eq('i: LA reads four 1:1 in order of fecha_hora, from both sides',
  $q$SELECT string_agg(estado || ':' || mi_lado, ',' ORDER BY ord) FROM public.mis_uno_a_uno() WITH ORDINALITY AS t(id, estado, fecha_hora, lugar, mi_lado, lideres, dirigidos, resumen, nota_privada, motivo_cancelacion, realizado_en, cancelado_en, ord)$q$,
  'realizado:dirigido,realizado:lider,cancelado:lider,agendado:lider');
SELECT pg_temp.assert_eq('i: as a dirigido LA reads no resumen of DE1''s 1:1',
  $q$SELECT pg_temp.uno_txt(pg_temp.k('de'))$q$, 'realizado|dirigido|DE1|LA+LA2|-|-|-');
SELECT pg_temp.assert_eq('i: p_desde keeps the later ones',
  $q$SELECT string_agg(estado, ',' ORDER BY fecha_hora) FROM public.mis_uno_a_uno(now() + interval '1 day')$q$,
  'cancelado,agendado');
SELECT pg_temp.assert_eq('i: p_hasta keeps the earlier ones (exclusive)',
  $q$SELECT string_agg(estado, ',' ORDER BY fecha_hora) FROM public.mis_uno_a_uno(NULL, now() + interval '7 days')$q$,
  'realizado,realizado');
SELECT pg_temp.assert_eq('i: both bounds',
  $q$SELECT string_agg(estado, ',' ORDER BY fecha_hora)
       FROM public.mis_uno_a_uno(now() + interval '1 day', now() + interval '8 days')$q$, 'cancelado');

-- ── j. direct table access as authenticated ─────────────────────────

SELECT pg_temp.assert_raises('j: authenticated cannot select uno_a_uno',
  $q$SELECT count(*) FROM public.uno_a_uno$q$, '42501');
SELECT pg_temp.assert_raises('j: authenticated cannot select uno_a_uno_personas',
  $q$SELECT count(*) FROM public.uno_a_uno_personas$q$, '42501');
SELECT pg_temp.assert_raises('j: authenticated cannot insert into uno_a_uno',
  $q$INSERT INTO public.uno_a_uno (estado, fecha_hora) VALUES ('agendado', now() + interval '1 day')$q$, '42501');
SELECT pg_temp.assert_raises('j: authenticated cannot update uno_a_uno',
  $q$UPDATE public.uno_a_uno SET resumen = 'x' WHERE id = pg_temp.k('u2')$q$, '42501');
SELECT pg_temp.assert_raises('j: authenticated cannot add themself to a 1:1',
  format($q$INSERT INTO public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado) VALUES (pg_temp.k('u2'), %L, 'lider')$q$,
         pg_temp.u('NOBODY')), '42501');

-- ── j. anon ─────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('j: anon cannot call mis_dirigidos',
  $q$SELECT count(*) FROM public.mis_dirigidos()$q$, '42501');
SELECT pg_temp.assert_raises('j: anon cannot call mis_uno_a_uno',
  $q$SELECT count(*) FROM public.mis_uno_a_uno()$q$, '42501');
SELECT pg_temp.assert_raises('j: anon cannot call agendar',
  format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days')$q$, pg_temp.id('us', 4)), '42501');
SELECT pg_temp.assert_raises('j: anon cannot call cancelar',
  $q$SELECT public.uno_a_uno_cancelar(pg_temp.k('u2'))$q$, '42501');
RESET ROLE;

-- Nothing above touched a real row: every persona of every fixture 1:1 is a fixture.
SELECT pg_temp.assert_eq('fixture: 1:1 people are fixtures only', $q$
  SELECT count(*)::text FROM public.uno_a_uno_personas p
   WHERE p.uno_a_uno_id IN (SELECT id FROM t_u1_ids)
     AND p.usuario_id NOT IN (SELECT id FROM t_u1_labels)
$q$, '0');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_u1_failures;

ROLLBACK;
