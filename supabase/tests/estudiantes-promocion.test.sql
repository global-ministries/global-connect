-- Estudiantes C6b2 annual promotion (20261102100000_estudiantes_promocion.sql;
-- S11–S15 of odd/tasks/estudiantes-fase-b.md, L37, L38).
--
-- Covers:
--   v. estudiantes_promocion_vista: groups with leaders, counts and what each
--      becomes (renamed with the year prefix, kept without it, " B" on a
--      clash, the last Inside Out year back to 4to and empty), both options
--      of each 3er año group (new group name, crossing name, servicios with
--      their destination rol and turnos, "Transit sin 1er año"), graduates
--      with their The Living Room destination by sexo, fichas without group,
--      totals, ámbitos, and the blocked state with the next allowed date.
--   a. estudiantes_promocion_aplicar with 3er año · Chicas 'pasa_grupo' and
--      both 3er año groups of Chicos 'pasan_chicos': names (prefix / no
--      prefix / " B" / " C"), años and sub-áreas; new groups without leader
--      receive members and visitors; the crossing group keeps its members
--      (their ámbito follows it); leader periods closed and opened; the
--      Transit servicio retired with motivo reasignacion and an equal one
--      opened in Inside Out with its turnos, verificaciones and grants; a
--      servicio that still leads a Transit group is kept; fichas move up,
--      graduates by anio_final 5 and 6 (and every member of 6to año) leave
--      their group with an egresado ficha; members without ficha get one;
--      The Living Room and inactive groups untouched; the summary; the
--      record with its snapshot; the setting is reset.
--   g. estudiantes_sin_grupo of The Living Room lists the graduates by sexo
--      next to its former members; of Transit / Inside Out it leaves out the
--      crossers and graduates and still lists a person removed from a group;
--      leaders see their moved groups.
--   r. Refusals leave every row unchanged: no session role (nobody, an
--      entrenadora, a Transit-only director, a director of another campus),
--      missing / extra / unknown / bad / non-object decisions, a crossing
--      whose rol is missing in Inside Out (rol_invalido), a campus without
--      scale, a promotion less than 180 days ago (also after applying), and
--      the sub-área / ámbito guards outside a promotion.
--   l. Privileges.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Pr"):
--   1 DIR (dream_team.direct on ZZ Pr Estudiantes; campus 1, also campus 2)
--   2 DIRT (dream_team.direct on ZZ Pr Transit only), 3 ENTR (entrenadora of
--   Transit › Chicas), 4 DIR_OTRO (direct on Estudiantes, campus 2 only),
--   5 NADIE, 7 DIR_TLR (direct on ZZ Pr The Living Room).
--   Leaders: 10 (1er Chicas), 11 (3er Chicas; turnos Domingo 9 and 11, its
--   requisito completado), 18 (leads 1er and 3er Chicas), 12 (3er Chicos),
--   13 (entrenador of "Chicos Unidos"), 14, 15, 16 (Inside Out Chicas 4to,
--   5to, 6to), 17 (Inside Out Chicos 6to).
--   Students 30–52 (no account): see the groups below. Male: 37–40, 46, 47, 49, 52.
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit (6 Chicas, 7 Chicos),
-- 4 Inside Out (8 Chicas, 9 Chicos); 1 › 5 The Living Room (10 Chicas,
-- 11 Chicos). Inside Out › Chicos has no entrenador rol.
-- Scale of campus 1: 1er–3er año Transit, 4to–6to año Inside Out. Campus 2
-- has no scale. Turnos (campus 1): Domingo 9 (Transit and Inside Out),
-- Domingo 11 (Transit only).
-- Groups (campus 1) with fichas (año/final) and members (v = visitante):
--   1 "1er año · Chicas"  (1)  S30 1/6, S31 no ficha
--   2 "2do año · Chicas"  (2)  S32 2/6, S33v 2/6
--   3 "3er año · Chicas"  (3)  S34 3/6, S35 3/5, S36v no ficha
--   4 "1er año · Chicos"  (1)  S37 1/6
--   5 "3er año · Chicos"  (3)  S38 3/6, S39v 3/6
--   6 "Chicos Unidos"     (3)  S40 3/6
--   7 "4to año · Chicas"  (4)  S41 4/6
--   8 "Chicas en Acción"  (5)  S42 5/5, S43 5/6
--   9 "6to año · Chicas"  (6)  S44 6/6, S45 no ficha
--  10 "6to año · Chicos"  (6)  S46 6/6, S47v 6/6
--  11 "ZZ Pr Inactivo"    (2)  inactive
--  12 TLR Chicas "ZZ Pr Zona Norte": S50 (TLR ficha, no año), S51 (left in 2026)
--  13 TLR Chicos "ZZ Pr Zona Sur"
--   No group: S48 2/6, S49 6/6; S52 (no ficha) left group 4 in 2026.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a70000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'gr' THEN 'a008' WHEN 'rq' THEN 'a009'
                       WHEN 'pr' THEN 'a00a' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Decisions for the three 3er año groups (3, 5, 6); NULL leaves one out.
CREATE OR REPLACE FUNCTION pg_temp.dec(p_3 text, p_5 text, p_6 text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(pg_temp.id('gr', 3)::text, p_3, pg_temp.id('gr', 5)::text, p_5,
                                              pg_temp.id('gr', 6)::text, p_6));
$$;

CREATE OR REPLACE FUNCTION pg_temp.aplicar(p_dec jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_promocion_aplicar(pg_temp.id('ca', 1), p_dec);
$$;

-- Applies the promotion and keeps its summary; an error is a failure.
CREATE OR REPLACE FUNCTION pg_temp.aplicar_guardar(p_case text, p_dec jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_pr_ctx (k, v) VALUES ('resumen', pg_temp.aplicar(p_dec)::text);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.resumen() RETURNS jsonb LANGUAGE sql AS $$
  SELECT (SELECT v FROM t_pr_ctx WHERE k = 'resumen')::jsonb;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vista() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_promocion_vista(pg_temp.id('ca', 1));
$$;

-- One group of the preview.
CREATE OR REPLACE FUNCTION pg_temp.vg(p_g int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT g FROM jsonb_array_elements(pg_temp.vista() -> 'grupos') g WHERE g ->> 'grupo_id' = pg_temp.id('gr', p_g)::text;
$$;

-- 'tipo:new name:new año:miembros:visitantes:egresan:queda_vacio' of a preview group.
CREATE OR REPLACE FUNCTION pg_temp.vg_txt(p_g int) RETURNS text LANGUAGE sql AS $$
  SELECT (g ->> 'tipo') || ':' || coalesce(g -> 'despues' ->> 'nombre', '-') || ':' || coalesce(g -> 'despues' ->> 'anio', '-')
         || ':' || (g ->> 'miembros') || ':' || (g ->> 'visitantes') || ':' || (g ->> 'egresan') || ':' || (g ->> 'queda_vacio')
    FROM (SELECT pg_temp.vg(p_g) AS g) x;
$$;

-- Everything a refusal must leave unchanged.
CREATE OR REPLACE FUNCTION pg_temp.huella() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  WITH yo AS (SELECT u.id FROM public.usuarios u WHERE u.nombre = 'ZZ Pr')
  SELECT md5(concat_ws('#',
    (SELECT string_agg(g.id::text || g.nombre || coalesce(g.anio::text, '-') || g.subarea_id || g.ambito_id || g.activo, ',' ORDER BY g.id)
       FROM public.estudiantes_grupos g WHERE g.campus_id = pg_temp.id('ca', 1)),
    (SELECT string_agg(m.id::text || m.grupo_id || m.ambito_id || m.estado || m.activo || coalesce(m.retirado_at::text, '-'), ',' ORDER BY m.id)
       FROM public.estudiantes_grupo_miembros m WHERE m.persona_id IN (SELECT id FROM yo)),
    (SELECT string_agg(f.persona_id::text || coalesce(f.anio_actual::text, '-') || coalesce(f.anio_final::text, '-')
                       || coalesce(f.egresado_at::text, '-'), ',' ORDER BY f.persona_id)
       FROM public.estudiantes_fichas f WHERE f.persona_id IN (SELECT id FROM yo)),
    (SELECT string_agg(gl.id::text || gl.servicio_id || coalesce(gl.hasta::text, '-'), ',' ORDER BY gl.id)
       FROM public.estudiantes_grupo_lideres gl
       JOIN public.estudiantes_grupos g ON g.id = gl.grupo_id WHERE g.campus_id = pg_temp.id('ca', 1)),
    (SELECT string_agg(s.id::text || s.equipo_id || s.estado || s.version || s.motivo_actual, ',' ORDER BY s.id)
       FROM public.dream_team_servicios s WHERE s.persona_id IN (SELECT id FROM yo)),
    (SELECT count(*)::text FROM public.dream_team_servicio_turnos st
       JOIN public.dream_team_servicios s ON s.id = st.servicio_id WHERE s.persona_id IN (SELECT id FROM yo)),
    (SELECT count(*)::text FROM public.dream_team_estados_historial h
       JOIN public.dream_team_servicios s ON s.id = h.servicio_id WHERE s.persona_id IN (SELECT id FROM yo)),
    (SELECT count(*)::text FROM public.dream_team_requisitos_verificacion v
       JOIN public.dream_team_servicios s ON s.id = v.servicio_id WHERE s.persona_id IN (SELECT id FROM yo)),
    (SELECT string_agg(cg.id::text || coalesce(cg.revoked_at::text, '-'), ',' ORDER BY cg.id)
       FROM public.dream_team_capability_grants cg WHERE cg.persona_id IN (SELECT id FROM yo)),
    (SELECT count(*)::text FROM public.estudiantes_promociones p WHERE p.campus_id = pg_temp.id('ca', 1))));
$$;

-- 'T|IO|TLR:sub-área:año:nombre:activo' of a group.
CREATE OR REPLACE FUNCTION pg_temp.grupo(p_g int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT CASE g.ambito_id WHEN pg_temp.id('eq', 3) THEN 'T' WHEN pg_temp.id('eq', 4) THEN 'IO'
                          WHEN pg_temp.id('eq', 5) THEN 'TLR' END
         || ':' || s.label || ':' || coalesce(g.anio::text, '-') || ':' || g.nombre || ':' || g.activo
    FROM public.estudiantes_grupos g JOIN public.dream_team_equipos s ON s.id = g.subarea_id
   WHERE g.id = pg_temp.id('gr', p_g);
$$;

CREATE OR REPLACE FUNCTION pg_temp.grupos(p_gs int[]) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(pg_temp.grupo(x.g), ';' ORDER BY x.n) FROM unnest(p_gs) WITH ORDINALITY AS x(g, n);
$$;

-- Active groups of campus 1 in a sub-área: 'nombre:año:current periods:active members'.
CREATE OR REPLACE FUNCTION pg_temp.subarea(p_eq int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(g.nombre || ':' || g.anio || ':'
                    || (SELECT count(*) FROM public.estudiantes_grupo_lideres gl WHERE gl.grupo_id = g.id AND gl.hasta IS NULL)
                    || ':' || (SELECT count(*) FROM public.estudiantes_grupo_miembros m WHERE m.grupo_id = g.id AND m.activo),
                    ',' ORDER BY g.nombre)
    FROM public.estudiantes_grupos g
   WHERE g.campus_id = pg_temp.id('ca', 1) AND g.subarea_id = pg_temp.id('eq', p_eq) AND g.activo;
$$;

-- Active members of a group (by number, or by name in a sub-área): 'Sn:estado'.
CREATE OR REPLACE FUNCTION pg_temp.miembros(p_grupo uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(string_agg(u.apellido || ':' || m.estado, ',' ORDER BY u.apellido), '')
    FROM public.estudiantes_grupo_miembros m JOIN public.usuarios u ON u.id = m.persona_id
   WHERE m.grupo_id = p_grupo AND m.activo;
$$;

CREATE OR REPLACE FUNCTION pg_temp.grupo_por_nombre(p_eq int, p_nombre text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT g.id FROM public.estudiantes_grupos g
   WHERE g.campus_id = pg_temp.id('ca', 1) AND g.subarea_id = pg_temp.id('eq', p_eq) AND g.nombre = p_nombre AND g.activo;
$$;

-- Every ficha of a ZZ Pr person: 'Sn:año/final' plus 'E' when egresado.
CREATE OR REPLACE FUNCTION pg_temp.fichas() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(u.apellido || ':' || coalesce(f.anio_actual::text, '-') || '/' || coalesce(f.anio_final::text, '-')
                    || CASE WHEN f.egresado_at IS NOT NULL THEN 'E' ELSE '' END, ',' ORDER BY u.apellido)
    FROM public.estudiantes_fichas f JOIN public.usuarios u ON u.id = f.persona_id
   WHERE u.nombre = 'ZZ Pr';
$$;

CREATE OR REPLACE FUNCTION pg_temp.equipo(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT CASE p_id WHEN pg_temp.id('eq', 6) THEN 'T6' WHEN pg_temp.id('eq', 7) THEN 'T7'
                   WHEN pg_temp.id('eq', 8) THEN 'IO8' WHEN pg_temp.id('eq', 9) THEN 'IO9' ELSE '?' END;
$$;

-- Current leaders of a group: 'Un:equipo:rol:estado'.
CREATE OR REPLACE FUNCTION pg_temp.lideres(p_g int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(string_agg(u.apellido || ':' || pg_temp.equipo(s.equipo_id) || ':' || r.label || ':' || s.estado,
                             ',' ORDER BY u.apellido), '')
    FROM public.estudiantes_grupo_lideres gl
    JOIN public.dream_team_servicios s ON s.id = gl.servicio_id
    JOIN public.usuarios u ON u.id = s.persona_id
    JOIN public.dream_team_roles r ON r.id = s.rol_id
   WHERE gl.grupo_id = pg_temp.id('gr', p_g) AND gl.hasta IS NULL;
$$;

-- Periods of a servicio in a group as 'current|closed'.
CREATE OR REPLACE FUNCTION pg_temp.periodos(p_g int, p_se int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FILTER (WHERE gl.hasta IS NULL) || '|' || count(*) FILTER (WHERE gl.hasta IS NOT NULL)
    FROM public.estudiantes_grupo_lideres gl
   WHERE gl.grupo_id = pg_temp.id('gr', p_g) AND gl.servicio_id = pg_temp.id('se', p_se);
$$;

-- Servicios of a person: 'equipo:estado:motivo:version:has fecha_fin'.
CREATE OR REPLACE FUNCTION pg_temp.servicios(p_n int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(pg_temp.equipo(s.equipo_id) || ':' || s.estado || ':' || s.motivo_actual || ':' || s.version
                    || ':' || (s.fecha_fin IS NOT NULL), ',' ORDER BY pg_temp.equipo(s.equipo_id))
    FROM public.dream_team_servicios s WHERE s.persona_id = pg_temp.id('us', p_n);
$$;

-- History rows of a person's servicios: 'equipo:anterior>nuevo:motivo:actor is DIR'.
CREATE OR REPLACE FUNCTION pg_temp.historial(p_n int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(string_agg(pg_temp.equipo(s.equipo_id) || ':' || h.estado_anterior || '>' || h.estado_nuevo || ':'
                             || h.motivo || ':' || (h.actor_persona_id = pg_temp.id('us', 1)),
                             ',' ORDER BY pg_temp.equipo(s.equipo_id), h.fecha), '')
    FROM public.dream_team_estados_historial h JOIN public.dream_team_servicios s ON s.id = h.servicio_id
   WHERE s.persona_id = pg_temp.id('us', p_n);
$$;

-- Turnos of a person's servicios: 'equipo:turno'.
CREATE OR REPLACE FUNCTION pg_temp.turnos(p_n int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(string_agg(pg_temp.equipo(s.equipo_id) || ':' || t.nombre, ',' ORDER BY pg_temp.equipo(s.equipo_id), t.nombre), '')
    FROM public.dream_team_servicio_turnos st
    JOIN public.dream_team_servicios s ON s.id = st.servicio_id
    JOIN public.dream_team_turnos t ON t.id = st.turno_id
   WHERE s.persona_id = pg_temp.id('us', p_n);
$$;

-- Active grants of a person scoped to an equipo.
CREATE OR REPLACE FUNCTION pg_temp.grants(p_n int, p_eq int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::text FROM public.dream_team_capability_grants g
   WHERE g.persona_id = pg_temp.id('us', p_n) AND g.scope_id = pg_temp.id('eq', p_eq)::text AND g.revoked_at IS NULL;
$$;

-- "Sin grupo" of a group: 'apellido:último grupo:año'.
CREATE OR REPLACE FUNCTION pg_temp.sin_grupo(p_g int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(x.apellido || ':' || coalesce(x.ultimo_grupo, '-') || ':' || coalesce(x.anio_etiqueta, '-'),
                                     ',' ORDER BY x.n), '')
            FROM public.estudiantes_sin_grupo(pg_temp.id('gr', p_g))
                 WITH ORDINALITY AS x(persona_id, nombre, apellido, anio_etiqueta, ultimo_grupo, retirado_at, n));
END;
$$;

-- The caller's groups of campus 1: 'nombre:soy_lider'.
CREATE OR REPLACE FUNCTION pg_temp.mis_grupos() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(g.nombre || ':' || g.soy_lider, ',' ORDER BY g.nombre), '')
            FROM public.estudiantes_mis_grupos(true) g
           WHERE g.campus_id = pg_temp.id('ca', 1));
END;
$$;

-- ── fixture ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'pr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18]) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Pr', 'U' || n, 'pr-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18]) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Pr', 'S' || n, 'No especificado',
       (CASE WHEN n IN (37, 38, 39, 40, 46, 47, 49, 52) THEN 'Masculino' ELSE 'Femenino' END)::public.enum_genero
  FROM generate_series(30, 52) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Pr Campus 1', 'ZZPR1'),
  (pg_temp.id('ca', 2), 'ZZ Pr Campus 2', 'ZZPR2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 4 THEN 2 ELSE 1 END), true
  FROM (SELECT unnest(ARRAY[1, 2, 3, 4, 5, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18]) AS n
        UNION ALL SELECT generate_series(30, 52)) AS x
ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 1), pg_temp.id('ca', 2), false)
ON CONFLICT DO NOTHING;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Pr Experiencia'), (2, 1, 'estudiantes', 'ZZ Pr Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Pr Transit'), (4, 2, 'estudiantes', 'ZZ Pr Inside Out'),
               (5, 1, 'the_living_room', 'ZZ Pr The Living Room'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (7, 3, 'estudiantes', 'Grupos de Chicos'),
               (8, 4, 'estudiantes', 'Grupos de Chicas'), (9, 4, 'estudiantes', 'Grupos de Chicos'),
               (10, 5, 'the_living_room', 'Grupos de Chicas'), (11, 5, 'the_living_room', 'Grupos de Chicos'))
       AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 6), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 7), 'lider', 'lider', true),
  (pg_temp.id('ro', 4), pg_temp.id('eq', 7), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 8), 'Líder', 'lider', true),
  (pg_temp.id('ro', 6), pg_temp.id('eq', 8), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 7), pg_temp.id('eq', 9), 'lider', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (3, 6, 2), (10, 6, 1), (11, 6, 1), (18, 6, 1), (12, 7, 3), (13, 7, 4),
               (14, 8, 5), (15, 8, 5), (16, 8, 5), (17, 9, 7)) AS v(n, e, r);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 4), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 7), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 5)::text);
-- The grants the two Transit leaders' servicios minted.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT pg_temp.id('us', n), k.capability_key, k.experience, k.scope_type, k.scope_id, 'dream-team-servicio'
  FROM unnest(ARRAY[11, 18]) AS n,
       public.dream_team_grants_de_servicio(pg_temp.id('eq', 6), 'estudiantes', pg_temp.id('ro', 1), 'lider') k;

INSERT INTO public.dream_team_requisitos (id, equipo_id, rol_id, codigo, label, tipo, obligatoriedad) VALUES
  (pg_temp.id('rq', 1), pg_temp.id('eq', 6), pg_temp.id('ro', 1), 'zz_pr_curso', 'ZZ Pr Curso', 'capacitacion', 'requerido'),
  (pg_temp.id('rq', 2), pg_temp.id('eq', 8), pg_temp.id('ro', 5), 'zz_pr_curso', 'ZZ Pr Curso', 'capacitacion', 'requerido');
INSERT INTO public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado, fecha_verificacion) VALUES
  (pg_temp.id('se', 11), pg_temp.id('rq', 1), 'completado', timestamptz '2025-06-01 12:00+00');

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Pr Domingo 9', 0, '09:00', 1, true),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Pr Domingo 11', 0, '11:00', 2, true);
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
  (pg_temp.id('eq', 3), pg_temp.id('tu', 1)), (pg_temp.id('eq', 3), pg_temp.id('tu', 2)),
  (pg_temp.id('eq', 4), pg_temp.id('tu', 1));
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES
  (pg_temp.id('se', 11), pg_temp.id('tu', 1)), (pg_temp.id('se', 11), pg_temp.id('tu', 2));

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id) VALUES
  (pg_temp.id('ca', 1), 1, '1er año', pg_temp.id('eq', 3)),
  (pg_temp.id('ca', 1), 2, '2do año', pg_temp.id('eq', 3)),
  (pg_temp.id('ca', 1), 3, '3er año', pg_temp.id('eq', 3)),
  (pg_temp.id('ca', 1), 4, '4to año', pg_temp.id('eq', 4)),
  (pg_temp.id('ca', 1), 5, '5to año', pg_temp.id('eq', 4)),
  (pg_temp.id('ca', 1), 6, '6to año', pg_temp.id('eq', 4));

INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, activo)
SELECT pg_temp.id('gr', n), pg_temp.id('ca', 1), pg_temp.id('eq', e), nombre, anio, activo
  FROM (VALUES (1, 6, '1er año · Chicas', 1, true), (2, 6, '2do año · Chicas', 2, true),
               (3, 6, '3er año · Chicas', 3, true), (4, 7, '1er año · Chicos', 1, true),
               (5, 7, '3er año · Chicos', 3, true), (6, 7, 'Chicos Unidos', 3, true),
               (7, 8, '4to año · Chicas', 4, true), (8, 8, 'Chicas en Acción', 5, true),
               (9, 8, '6to año · Chicas', 6, true), (10, 9, '6to año · Chicos', 6, true),
               (11, 6, 'ZZ Pr Inactivo', 2, false),
               (12, 10, 'ZZ Pr Zona Norte', NULL, true), (13, 11, 'ZZ Pr Zona Sur', NULL, true))
       AS v(n, e, nombre, anio, activo);

INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde)
SELECT pg_temp.id('gr', g), pg_temp.id('se', s), timestamptz '2026-01-01 12:00+00'
  FROM (VALUES (1, 10), (1, 18), (3, 11), (3, 18), (5, 12), (6, 13), (7, 14), (8, 15), (9, 16), (10, 17)) AS v(g, s);

INSERT INTO public.estudiantes_fichas (persona_id, campus_id, anio_actual, anio_final)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), a, f
  FROM (VALUES (30, 1, 6), (32, 2, 6), (33, 2, 6), (34, 3, 6), (35, 3, 5), (37, 1, 6), (38, 3, 6), (39, 3, 6),
               (40, 3, 6), (41, 4, 6), (42, 5, 5), (43, 5, 6), (44, 6, 6), (46, 6, 6), (47, 6, 6), (48, 2, 6),
               (49, 6, 6), (50, NULL, NULL)) AS v(n, a, f);

INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, activo, retirado_at)
SELECT pg_temp.id('gr', g), pg_temp.id('us', n), estado, activo, retirado
  FROM (VALUES (1, 30, 'miembro', true, NULL::timestamptz), (1, 31, 'miembro', true, NULL),
               (2, 32, 'miembro', true, NULL), (2, 33, 'visitante', true, NULL),
               (3, 34, 'miembro', true, NULL), (3, 35, 'miembro', true, NULL), (3, 36, 'visitante', true, NULL),
               (4, 37, 'miembro', true, NULL), (5, 38, 'miembro', true, NULL), (5, 39, 'visitante', true, NULL),
               (6, 40, 'miembro', true, NULL), (7, 41, 'miembro', true, NULL),
               (8, 42, 'miembro', true, NULL), (8, 43, 'miembro', true, NULL),
               (9, 44, 'miembro', true, NULL), (9, 45, 'miembro', true, NULL),
               (10, 46, 'miembro', true, NULL), (10, 47, 'visitante', true, NULL),
               (12, 50, 'miembro', true, NULL),
               (12, 51, 'miembro', false, timestamptz '2026-01-01 12:00+00'),
               (4, 52, 'miembro', false, timestamptz '2026-01-01 12:00+00')) AS v(g, n, estado, activo, retirado);

-- A promotion 179 days ago blocks the campus.
INSERT INTO public.estudiantes_promociones (id, campus_id, aplicada_at, aplicada_por)
VALUES (pg_temp.id('pr', 1), pg_temp.id('ca', 1), now() - interval '179 days', pg_temp.id('us', 2));

GRANT INSERT, SELECT ON t_pr_failures, t_pr_ctx TO authenticated;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_f);
  END LOOP;
END;
$$;

SET LOCAL ROLE authenticated;

-- ── r. a promotion less than 180 days ago ────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('v: blocked 179 days after a promotion, with who and the next date',
  $q$SELECT (v ->> 'bloqueado') || '|' || (v -> 'ultima' -> 'por' ->> 'apellido') || '|'
            || ((v -> 'ultima' ->> 'proxima') = (((now() + interval '1 day') AT TIME ZONE 'America/Caracas')::date)::text)
       FROM (SELECT pg_temp.vista() AS v) x$q$, 'true|U2|true');
SELECT pg_temp.assert_raises('r: a promotion 179 days ago refuses another',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasan_chicos'))$q$, '22023', 'promocion_reciente');

RESET ROLE;
DELETE FROM public.estudiantes_promociones WHERE id = pg_temp.id('pr', 1);
INSERT INTO public.estudiantes_promociones (id, campus_id, aplicada_at, aplicada_por)
VALUES (pg_temp.id('pr', 2), pg_temp.id('ca', 1), now() - interval '181 days', pg_temp.id('us', 2));
INSERT INTO t_pr_ctx (k, v) VALUES ('huella', pg_temp.huella());
SET LOCAL ROLE authenticated;

-- ── v. the preview ───────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('v: 181 days later the campus is not blocked; the last promotion is shown',
  $q$SELECT (v ->> 'bloqueado') || '|' || (v -> 'ultima' -> 'por' ->> 'apellido') || '|' || (v -> 'campus' ->> 'nombre')
       FROM (SELECT pg_temp.vista() AS v) x$q$, 'false|U2|ZZ Pr Campus 1');
SELECT pg_temp.assert_eq('v: ámbitos with their first and last year',
  $q$SELECT string_agg((a ->> 'nombre') || ':' || (a ->> 'primer_etiqueta') || '-' || (a ->> 'ultimo_etiqueta'), ',' ORDER BY a ->> 'primer_anio')
       FROM jsonb_array_elements(pg_temp.vista() -> 'ambitos') a$q$,
  'ZZ Pr Transit:1er año-3er año,ZZ Pr Inside Out:4to año-6to año');
SELECT pg_temp.assert_eq('v: totals (grupos|integrantes|visitantes|suben|pasan|egresan|sin grupo|por decidir|vacíos)',
  $q$SELECT (t ->> 'grupos') || '|' || (t ->> 'integrantes') || '|' || (t ->> 'visitantes') || '|' || (t ->> 'suben')
            || '|' || (t ->> 'pasan_inside_out') || '|' || (t ->> 'egresan') || '|' || (t ->> 'sin_grupo')
            || '|' || (t ->> 'por_decidir') || '|' || (t ->> 'quedan_vacios')
       FROM (SELECT pg_temp.vista() -> 'totales' AS t) x$q$, '10|14|4|10|4|6|1|3|2');
SELECT pg_temp.assert_eq('v: only active Transit / Inside Out groups (no inactive, no The Living Room)',
  $q$SELECT jsonb_array_length(v -> 'grupos') || '|'
            || (SELECT count(*) FROM jsonb_array_elements(v -> 'grupos') g
                 WHERE g ->> 'grupo_id' IN (pg_temp.id('gr', 11)::text, pg_temp.id('gr', 12)::text, pg_temp.id('gr', 13)::text))
       FROM (SELECT pg_temp.vista() AS v) x$q$, '10|0');
SELECT pg_temp.assert_eq('v: names with the year prefix move up',
  $q$SELECT pg_temp.vg_txt(1) || ';' || pg_temp.vg_txt(2) || ';' || pg_temp.vg_txt(4) || ';' || pg_temp.vg_txt(7)$q$,
  'sube:2do año · Chicas:2:2:0:0:false;sube:3er año · Chicas:3:1:1:0:false;sube:2do año · Chicos:2:1:0:0:false;'
  || 'sube:5to año · Chicas:5:1:0:0:false');
SELECT pg_temp.assert_eq('v: a name without the prefix keeps it; one member graduates by anio_final 5',
  $q$SELECT pg_temp.vg_txt(8) || '|' || (pg_temp.vg(8) -> 'despues' ->> 'nombre_cambia')$q$,
  'sube:Chicas en Acción:6:2:0:1:false|false');
SELECT pg_temp.assert_eq('v: the last Inside Out year goes back to 4to año, everyone graduates, left empty',
  $q$SELECT pg_temp.vg_txt(9) || ';' || pg_temp.vg_txt(10)$q$,
  'vuelve:4to año · Chicas:4:2:0:2:true;vuelve:4to año · Chicos:4:1:1:1:true');
SELECT pg_temp.assert_eq('v: the 3er año groups are por decidir',
  $q$SELECT pg_temp.vg_txt(3) || ';' || pg_temp.vg_txt(5) || ';' || pg_temp.vg_txt(6)$q$,
  'por_decidir:-:-:2:1:0:false;por_decidir:-:-:1:1:0:false;por_decidir:-:-:1:0:0:false');
SELECT pg_temp.assert_eq('v: leaders of a group',
  $q$SELECT string_agg(l ->> 'apellido', ',' ORDER BY l ->> 'apellido') FROM jsonb_array_elements(pg_temp.vg(1) -> 'lideres') l$q$,
  'U10,U18');
SELECT pg_temp.assert_eq('v: 3er año · Chicas, option (a): back to 1er año; the new 4to año group takes " B"',
  $q$SELECT (o -> 'grupo' ->> 'nombre') || '|' || (o -> 'grupo' ->> 'anio') || '|' || (o -> 'nuevo' ->> 'nombre')
            || '|' || (o -> 'nuevo' ->> 'choca') || '|' || (o -> 'nuevo' ->> 'ambito') || '|' || (o -> 'nuevo' ->> 'anio')
            || '|' || (o ->> 'llegan') || '|' || (o ->> 'llegan_visitantes')
       FROM (SELECT pg_temp.vg(3) -> 'opciones' -> 'pasan_chicos' AS o) x$q$,
  '1er año · Chicas|1|4to año · Chicas B|4to año · Chicas|ZZ Pr Inside Out|4|2|1');
SELECT pg_temp.assert_eq('v: 3er año · Chicas, option (b): " B" in Inside Out, Transit left without 1er año',
  $q$SELECT (o -> 'grupo' ->> 'nombre') || '|' || (o -> 'grupo' ->> 'choca') || '|'
            || ((o -> 'grupo' ->> 'subarea_id') = pg_temp.id('eq', 8)::text) || '|' || (o ->> 'sin_primer_anio')
       FROM (SELECT pg_temp.vg(3) -> 'opciones' -> 'pasa_grupo' AS o) x$q$,
  '4to año · Chicas B|4to año · Chicas|true|true');
SELECT pg_temp.assert_eq('v: option (b) lists each leader with the destination rol and the turnos that carry over',
  $q$SELECT string_agg((s ->> 'apellido') || ':' || (s ->> 'rol') || '>' || coalesce(s ->> 'rol_destino', '-') || ':'
                    || (s ->> 'turnos') || '>' || (s ->> 'turnos_destino'), ',' ORDER BY s ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.vg(3) -> 'opciones' -> 'pasa_grupo' -> 'servicios') s$q$,
  'U11:lider>Líder:2>1,U18:lider>Líder:0>0');
SELECT pg_temp.assert_eq('v: 3er año · Chicos: " B" for both options; another 3er año group, so no warning',
  $q$SELECT (o -> 'pasan_chicos' -> 'nuevo' ->> 'nombre') || '|' || (o -> 'pasan_chicos' -> 'grupo' ->> 'nombre') || '|'
            || (o -> 'pasa_grupo' -> 'grupo' ->> 'nombre') || '|' || (o -> 'pasa_grupo' ->> 'sin_primer_anio')
       FROM (SELECT pg_temp.vg(5) -> 'opciones' AS o) x$q$,
  '4to año · Chicos B|1er año · Chicos|4to año · Chicos B|false');
SELECT pg_temp.assert_eq('v: "Chicos Unidos": the second new group takes " C"; crossing keeps its name; no entrenador rol in Inside Out',
  $q$SELECT (o -> 'pasan_chicos' -> 'nuevo' ->> 'nombre') || '|' || (o -> 'pasan_chicos' -> 'grupo' ->> 'nombre') || '|'
            || (o -> 'pasan_chicos' -> 'grupo' ->> 'anio') || '|' || (o -> 'pasa_grupo' -> 'grupo' ->> 'nombre') || '|'
            || coalesce(o -> 'pasa_grupo' -> 'grupo' ->> 'choca', '-') || '|'
            || (SELECT string_agg((s ->> 'apellido') || ':' || (s ->> 'rol') || '>' || coalesce(s ->> 'rol_destino', '-'), ',')
                  FROM jsonb_array_elements(o -> 'pasa_grupo' -> 'servicios') s)
       FROM (SELECT pg_temp.vg(6) -> 'opciones' AS o) x$q$,
  '4to año · Chicos C|Chicos Unidos|1|Chicos Unidos|-|U13:entrenador>-');
SELECT pg_temp.assert_eq('v: renamed vs kept names in despues',
  $q$SELECT (pg_temp.vg(9) -> 'despues' ->> 'nombre_cambia') || '|' || coalesce(pg_temp.vg(9) -> 'despues' ->> 'choca', '-')$q$,
  'true|-');
SELECT pg_temp.assert_eq('v: members of a 3er año group: ficha +1, without ficha the first Inside Out year',
  $q$SELECT string_agg((i ->> 'apellido') || ':' || coalesce(i ->> 'anio', '-') || ':' || coalesce(i ->> 'anio_nuevo', '-')
                    || ':' || (i ->> 'egresa'), ',' ORDER BY i ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.vg(3) -> 'integrantes') i$q$,
  'S34:3:4:false,S35:3:4:false,S36:-:4:false');
SELECT pg_temp.assert_eq('v: members of 5to año: anio_final 5 graduates, the other moves up',
  $q$SELECT string_agg((i ->> 'apellido') || ':' || coalesce(i ->> 'anio', '-') || ':' || coalesce(i ->> 'anio_nuevo', '-')
                    || ':' || (i ->> 'egresa'), ',' ORDER BY i ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.vg(8) -> 'integrantes') i$q$,
  'S42:5:-:true,S43:5:6:false');
SELECT pg_temp.assert_eq('v: graduates with group, final year and The Living Room sub-área by sexo',
  $q$SELECT string_agg((e ->> 'apellido') || ':' || coalesce(e ->> 'grupo', '-') || ':' || (e ->> 'anio_final') || ':'
                    || coalesce(e -> 'destino' ->> 'subarea', '-'), ',' ORDER BY e ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.vista() -> 'egresados') e$q$,
  'S42:Chicas en Acción:5:Grupos de Chicas,S44:6to año · Chicas:6:Grupos de Chicas,S45:6to año · Chicas:6:Grupos de Chicas,'
  || 'S46:6to año · Chicos:6:Grupos de Chicos,S47:6to año · Chicos:6:Grupos de Chicos,S49:-:6:Grupos de Chicos');
SELECT pg_temp.assert_eq('v: a graduating visitor keeps its estado; the destination is the campus''s The Living Room',
  $q$SELECT (SELECT e ->> 'estado' FROM jsonb_array_elements(v -> 'egresados') e WHERE e ->> 'apellido' = 'S47') || '|'
            || (SELECT (e -> 'destino' ->> 'subarea_id') = pg_temp.id('eq', 10)::text
                       AND (e -> 'destino' ->> 'ambito_id') = pg_temp.id('eq', 5)::text
                  FROM jsonb_array_elements(v -> 'egresados') e WHERE e ->> 'apellido' = 'S42')
       FROM (SELECT pg_temp.vista() AS v) x$q$, 'visitante|true');
SELECT pg_temp.assert_eq('v: fichas without group move up (or graduate)',
  $q$SELECT string_agg((s ->> 'apellido') || ':' || (s ->> 'anio') || ':' || coalesce(s ->> 'anio_nuevo', '-') || ':' || (s ->> 'egresa'),
                    ',' ORDER BY s ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.vista() -> 'sin_grupo') s$q$,
  'S48:2:3:false,S49:6:-:true');

-- ── r. refusals ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('r: a person without role cannot preview', $q$SELECT pg_temp.vista()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('r: a person without role cannot promote',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasan_chicos'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('r: an entrenadora cannot preview', $q$SELECT pg_temp.vista()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('r: an entrenadora cannot promote',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasan_chicos'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('r: a director of Transit only cannot promote (no level on Inside Out)',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasan_chicos'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('r: a director of another campus cannot preview', $q$SELECT pg_temp.vista()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('r: a director of another campus cannot promote',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasan_chicos'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('r: a missing decision',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', NULL))$q$, '22023', 'decision_invalida');
SELECT pg_temp.assert_raises('r: a decision for a group that is not of 3er año',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasan_chicos')
                            || jsonb_build_object(pg_temp.id('gr', 7)::text, 'pasan_chicos'))$q$, '22023', 'decision_invalida');
SELECT pg_temp.assert_raises('r: an unknown id',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', NULL)
                            || jsonb_build_object(pg_temp.id('gr', 99)::text, 'pasan_chicos'))$q$, '22023', 'decision_invalida');
SELECT pg_temp.assert_raises('r: an unknown option',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'otro'))$q$, '22023', 'decision_invalida');
SELECT pg_temp.assert_raises('r: no decisions',
  $q$SELECT pg_temp.aplicar(NULL)$q$, '22023', 'decision_invalida');
SELECT pg_temp.assert_raises('r: decisions that are not an object',
  $q$SELECT pg_temp.aplicar('[]'::jsonb)$q$, '22023', 'decision_invalida');
SELECT pg_temp.assert_raises('r: crossing a group led by an entrenador when Inside Out has no entrenador rol',
  $q$SELECT pg_temp.aplicar(pg_temp.dec('pasa_grupo', 'pasan_chicos', 'pasa_grupo'))$q$, '22023', 'rol_invalido');
SELECT pg_temp.assert_raises('r: a campus without scale (preview)',
  $q$SELECT public.estudiantes_promocion_vista(pg_temp.id('ca', 2))$q$, '22023', 'escala_invalida');
SELECT pg_temp.assert_raises('r: a campus without scale (promote)',
  $q$SELECT public.estudiantes_promocion_aplicar(pg_temp.id('ca', 2), '{}'::jsonb)$q$, '22023', 'escala_invalida');
SELECT pg_temp.assert_eq('r: every refusal left the data unchanged',
  $q$SELECT pg_temp.huella()$q$, (SELECT v FROM t_pr_ctx WHERE k = 'huella'));

-- ── g. The Living Room before ────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('g: before, The Living Room Chicas lists only its former member; Chicos nobody',
  $q$SELECT pg_temp.sin_grupo(12) || ';' || pg_temp.sin_grupo(13)$q$, 'S51:ZZ Pr Zona Norte:-;');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: before, Transit Chicos lists the person removed from a group',
  $q$SELECT pg_temp.sin_grupo(4)$q$, 'S52:1er año · Chicos:-');

-- ── a. applying it ───────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
-- The key of 3er año · Chicas in upper case: ids are compared case-insensitively.
SELECT pg_temp.aplicar_guardar('a: the promotion applies',
  jsonb_build_object(upper(pg_temp.id('gr', 3)::text), 'pasa_grupo')
  || jsonb_build_object(pg_temp.id('gr', 5)::text, 'pasan_chicos', pg_temp.id('gr', 6)::text, 'pasan_chicos'));
SELECT pg_temp.assert_eq('a: summary (grupos|renombrados|egresan|fichas suben|fichas creadas|movidos|retirados|abiertos)',
  $q$SELECT (r ->> 'grupos') || '|' || (r ->> 'renombrados') || '|' || (r ->> 'egresan') || '|' || (r ->> 'fichas_suben')
            || '|' || (r ->> 'fichas_creadas') || '|' || (r ->> 'miembros_movidos') || '|' || (r ->> 'servicios_retirados')
            || '|' || (r ->> 'servicios_abiertos')
       FROM (SELECT pg_temp.resumen() AS r) x$q$, '10|8|6|12|3|3|1|2');
SELECT pg_temp.assert_eq('a: summary of the new groups and the crossing group, and the next date',
  $q$SELECT (SELECT string_agg(right(n ->> 'nombre', 1) || '<' || CASE n ->> 'origen_id' WHEN pg_temp.id('gr', 5)::text THEN '5'
                                                               WHEN pg_temp.id('gr', 6)::text THEN '6' END,
                               ',' ORDER BY n ->> 'nombre')
               FROM jsonb_array_elements(r -> 'grupos_nuevos') n) || '|'
            || (SELECT string_agg((c ->> 'nombre') || '<' || ((c ->> 'grupo_id') = pg_temp.id('gr', 3)::text), ',')
                  FROM jsonb_array_elements(r -> 'pasan_grupo') c) || '|'
            || ((r ->> 'proxima') = (((now() + interval '180 days') AT TIME ZONE 'America/Caracas')::date)::text)
       FROM (SELECT pg_temp.resumen() AS r) x$q$, 'B<5,C<6|4to año · Chicas B<true|true');

RESET ROLE;

SELECT pg_temp.assert_eq('a: names with the year prefix move up one year',
  $q$SELECT pg_temp.grupos(ARRAY[1, 2, 4, 7])$q$,
  'T:Grupos de Chicas:2:2do año · Chicas:true;T:Grupos de Chicas:3:3er año · Chicas:true;'
  || 'T:Grupos de Chicos:2:2do año · Chicos:true;IO:Grupos de Chicas:5:5to año · Chicas:true');
SELECT pg_temp.assert_eq('a: a name without the prefix keeps it',
  $q$SELECT pg_temp.grupos(ARRAY[8])$q$, 'IO:Grupos de Chicas:6:Chicas en Acción:true');
SELECT pg_temp.assert_eq('a: the last Inside Out year goes back to 4to año with its leader, empty',
  $q$SELECT pg_temp.grupos(ARRAY[9, 10]) || '|' || pg_temp.lideres(9) || '|' || pg_temp.lideres(10) || '|'
            || pg_temp.miembros(pg_temp.id('gr', 9)) || '|' || pg_temp.miembros(pg_temp.id('gr', 10))$q$,
  'IO:Grupos de Chicas:4:4to año · Chicas:true;IO:Grupos de Chicos:4:4to año · Chicos:true|U16:IO8:Líder:activo|'
  || 'U17:IO9:lider:activo||');
SELECT pg_temp.assert_eq('a: pasan_chicos: the Transit groups go back to 1er año with their leader, empty',
  $q$SELECT pg_temp.grupos(ARRAY[5, 6]) || '|' || pg_temp.lideres(5) || '|' || pg_temp.lideres(6) || '|'
            || pg_temp.miembros(pg_temp.id('gr', 5)) || '|' || pg_temp.miembros(pg_temp.id('gr', 6))$q$,
  'T:Grupos de Chicos:1:1er año · Chicos:true;T:Grupos de Chicos:1:Chicos Unidos:true|U12:T7:lider:activo|'
  || 'U13:T7:entrenador:activo||');
SELECT pg_temp.assert_eq('a: pasan_chicos: new 4to año groups without leader (" B", " C") next to the ex-6to año group',
  $q$SELECT pg_temp.subarea(9)$q$, '4to año · Chicos:4:1:0,4to año · Chicos B:4:0:2,4to año · Chicos C:4:0:1');
SELECT pg_temp.assert_eq('a: pasan_chicos: members and visitors move to the new groups, keeping their estado',
  $q$SELECT pg_temp.miembros(pg_temp.grupo_por_nombre(9, '4to año · Chicos B')) || '|'
            || pg_temp.miembros(pg_temp.grupo_por_nombre(9, '4to año · Chicos C'))$q$,
  'S38:miembro,S39:visitante|S40:miembro');
SELECT pg_temp.assert_eq('a: pasan_chicos: their Transit memberships end with retirado_at',
  $q$SELECT string_agg(u.apellido, ',' ORDER BY u.apellido)
       FROM public.estudiantes_grupo_miembros m JOIN public.usuarios u ON u.id = m.persona_id
      WHERE m.grupo_id IN (pg_temp.id('gr', 5), pg_temp.id('gr', 6)) AND NOT m.activo AND m.retirado_at IS NOT NULL$q$,
  'S38,S39,S40');
SELECT pg_temp.assert_eq('a: pasa_grupo: the group crosses to Inside Out › Chicas at 4to año as " B"',
  $q$SELECT pg_temp.grupos(ARRAY[3])$q$, 'IO:Grupos de Chicas:4:4to año · Chicas B:true');
SELECT pg_temp.assert_eq('a: pasa_grupo: its members and visitor stay, their ámbito follows the group',
  $q$SELECT pg_temp.miembros(pg_temp.id('gr', 3)) || '|'
            || (SELECT count(*) FROM public.estudiantes_grupo_miembros m
                 WHERE m.grupo_id = pg_temp.id('gr', 3) AND m.activo AND m.ambito_id = pg_temp.id('eq', 4))$q$,
  'S34:miembro,S35:miembro,S36:visitante|3');
SELECT pg_temp.assert_eq('a: Inside Out › Chicas after the promotion',
  $q$SELECT pg_temp.subarea(8)$q$, '4to año · Chicas:4:1:0,4to año · Chicas B:4:2:3,5to año · Chicas:5:1:1,Chicas en Acción:6:1:1');
SELECT pg_temp.assert_eq('a: Transit › Chicas is left without 1er año (only warned); Transit › Chicos has two',
  $q$SELECT pg_temp.subarea(6) || ';' || pg_temp.subarea(7)$q$,
  '2do año · Chicas:2:2:2,3er año · Chicas:3:0:2;1er año · Chicos:1:1:0,2do año · Chicos:2:0:1,Chicos Unidos:1:1:0');
SELECT pg_temp.assert_eq('a: pasa_grupo: each leader period closes (by the director) and a new one opens for the new servicio',
  $q$SELECT pg_temp.periodos(3, 11) || ',' || pg_temp.periodos(3, 18) || ','
            || (SELECT count(*) FROM public.estudiantes_grupo_lideres gl
                 WHERE gl.grupo_id = pg_temp.id('gr', 3) AND gl.hasta IS NOT NULL AND gl.cerrado_por = pg_temp.id('us', 1))
            || ',' || pg_temp.lideres(3)$q$,
  '0|1,0|1,2,U11:IO8:Líder:activo,U18:IO8:Líder:activo');
SELECT pg_temp.assert_eq('a: a servicio that still leads a Transit group keeps leading it',
  $q$SELECT pg_temp.lideres(1) || '|' || pg_temp.periodos(1, 18)$q$, 'U10:T6:lider:activo,U18:T6:lider:activo|1|0');
SELECT pg_temp.assert_eq('a: servicios: the Transit one retired (reasignacion, fecha_fin, version 2) and an equal one in Inside Out',
  $q$SELECT pg_temp.servicios(11) || ';' || pg_temp.servicios(18)$q$,
  'IO8:activo:reasignacion:1:false,T6:retirado:reasignacion:2:true;'
  || 'IO8:activo:reasignacion:1:false,T6:activo:admin_asignacion:1:false');
SELECT pg_temp.assert_eq('a: history rows of the retired and the opened servicios, by the director',
  $q$SELECT pg_temp.historial(11) || ';' || pg_temp.historial(18)$q$,
  'IO8:activo>activo:reasignacion:true,T6:activo>retirado:reasignacion:true;IO8:activo>activo:reasignacion:true');
SELECT pg_temp.assert_eq('a: the turnos Inside Out serves are copied (Domingo 9, not Domingo 11)',
  $q$SELECT pg_temp.turnos(11) || ';' || pg_temp.turnos(18)$q$,
  'IO8:ZZ Pr Domingo 9,T6:ZZ Pr Domingo 11,T6:ZZ Pr Domingo 9;');
SELECT pg_temp.assert_eq('a: verificaciones of the new servicios follow the old ones by codigo',
  $q$SELECT string_agg(u.apellido || ':' || v.estado, ',' ORDER BY u.apellido)
       FROM public.dream_team_requisitos_verificacion v
       JOIN public.dream_team_servicios s ON s.id = v.servicio_id
       JOIN public.usuarios u ON u.id = s.persona_id
      WHERE s.equipo_id = pg_temp.id('eq', 8) AND s.persona_id IN (pg_temp.id('us', 11), pg_temp.id('us', 18))$q$,
  'U11:completado,U18:pendiente');
SELECT pg_temp.assert_eq('a: grants: the retired servicio''s are revoked, the kept one''s stay, the new ones are minted',
  $q$SELECT 'U11:' || pg_temp.grants(11, 6) || '|' || pg_temp.grants(11, 8) || ',U18:' || pg_temp.grants(18, 6) || '|' || pg_temp.grants(18, 8)$q$,
  'U11:0|3,U18:3|3');
SELECT pg_temp.assert_eq('a: fichas move up; anio_final 5 and 6 and every 6to año member graduate; members without ficha get one',
  $q$SELECT pg_temp.fichas()$q$,
  'S30:2/6,S31:2/6,S32:3/6,S33:3/6,S34:4/6,S35:4/5,S36:4/6,S37:2/6,S38:4/6,S39:4/6,S40:4/6,S41:5/6,S42:5/5E,'
  || 'S43:6/6,S44:6/6E,S45:6/6E,S46:6/6E,S47:6/6E,S48:3/6,S49:6/6E,S50:-/-');
SELECT pg_temp.assert_eq('a: graduates leave their group',
  $q$SELECT string_agg(u.apellido, ',' ORDER BY u.apellido)
       FROM public.estudiantes_grupo_miembros m JOIN public.usuarios u ON u.id = m.persona_id
      WHERE m.grupo_id IN (pg_temp.id('gr', 8), pg_temp.id('gr', 9), pg_temp.id('gr', 10))
        AND NOT m.activo AND m.retirado_at IS NOT NULL$q$,
  'S42,S44,S45,S46,S47');
SELECT pg_temp.assert_eq('a: the other groups keep their members',
  $q$SELECT pg_temp.miembros(pg_temp.id('gr', 1)) || '|' || pg_temp.miembros(pg_temp.id('gr', 2)) || '|'
            || pg_temp.miembros(pg_temp.id('gr', 8))$q$,
  'S30:miembro,S31:miembro|S32:miembro,S33:visitante|S43:miembro');
SELECT pg_temp.assert_eq('a: The Living Room and inactive groups are untouched',
  $q$SELECT pg_temp.grupos(ARRAY[11, 12, 13]) || '|' || pg_temp.miembros(pg_temp.id('gr', 12))$q$,
  'T:Grupos de Chicas:2:ZZ Pr Inactivo:false;TLR:Grupos de Chicas:-:ZZ Pr Zona Norte:true;'
  || 'TLR:Grupos de Chicos:-:ZZ Pr Zona Sur:true|S50:miembro');
SELECT pg_temp.assert_eq('a: the record: who, the decisions, the snapshot and what it created',
  $q$SELECT count(*) || '|' || bool_and(true)
            || '|' || (SELECT (p.aplicada_por = pg_temp.id('us', 1)) || '|' || (p.decisiones ->> pg_temp.id('gr', 3)::text)
                              || '|' || jsonb_array_length(p.foto -> 'grupos') || '|' || jsonb_array_length(p.foto -> 'creados' -> 'grupos')
                              || '|' || jsonb_array_length(p.foto -> 'creados' -> 'servicios')
                              || '|' || jsonb_array_length(p.foto -> 'creados' -> 'fichas')
                              || '|' || (p.foto -> 'grupos' @> jsonb_build_array(jsonb_build_object(
                                           'id', pg_temp.id('gr', 3), 'nombre', '3er año · Chicas', 'anio', 3)))
                         FROM public.estudiantes_promociones p
                        WHERE p.campus_id = pg_temp.id('ca', 1) AND p.aplicada_at = now())
       FROM public.estudiantes_promociones p WHERE p.campus_id = pg_temp.id('ca', 1)$q$,
  '2|true|true|pasa_grupo|10|2|2|3|true');
SELECT pg_temp.assert_eq('a: the sub-área setting is off after the promotion',
  $q$SELECT coalesce(current_setting('estudiantes.promocion', true), '')$q$, '');
INSERT INTO t_pr_ctx (k, v) VALUES ('huella_despues', pg_temp.huella());

SET LOCAL ROLE authenticated;

-- ── g. after: The Living Room, leaders, the blocked preview ──────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('g: The Living Room Chicas lists the female graduates (group as it was named) and its former member',
  $q$SELECT pg_temp.sin_grupo(12)$q$,
  'S42:Chicas en Acción:5to año,S44:6to año · Chicas:6to año,S45:6to año · Chicas:6to año,S51:ZZ Pr Zona Norte:-');
SELECT pg_temp.assert_eq('g: The Living Room Chicos lists the male graduates, also the one without group',
  $q$SELECT pg_temp.sin_grupo(13)$q$, 'S46:6to año · Chicos:6to año,S47:6to año · Chicos:6to año,S49:-:6to año');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: Transit Chicos: the pasan_chicos crossers are left out, the removed person still appears',
  $q$SELECT pg_temp.sin_grupo(4) || ';' || pg_temp.sin_grupo(5)$q$, 'S52:2do año · Chicos:-;S52:2do año · Chicos:-');
SELECT pg_temp.assert_eq('g: Inside Out: graduates are left out (Chicas and Chicos)',
  $q$SELECT pg_temp.sin_grupo(7) || ';' || pg_temp.sin_grupo(10)$q$, ';');
SELECT pg_temp.as_persona(11);
SELECT pg_temp.assert_eq('g: the crossing leader leads the group with the new servicio',
  $q$SELECT pg_temp.mis_grupos()$q$, '4to año · Chicas B:true');
SELECT pg_temp.as_persona(18);
SELECT pg_temp.assert_eq('g: the leader of both groups leads both',
  $q$SELECT pg_temp.mis_grupos()$q$, '2do año · Chicas:true,4to año · Chicas B:true');
SELECT pg_temp.as_persona(12);
SELECT pg_temp.assert_eq('g: the pasan_chicos leader keeps the group in 1er año',
  $q$SELECT pg_temp.mis_grupos()$q$, '1er año · Chicos:true');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('v: after applying, the preview is blocked with who and the next date',
  $q$SELECT (v ->> 'bloqueado') || '|' || (v -> 'ultima' -> 'por' ->> 'apellido') || '|'
            || ((v -> 'ultima' ->> 'proxima') = (((now() + interval '180 days') AT TIME ZONE 'America/Caracas')::date)::text)
            || '|' || (v -> 'ultima' -> 'resumen' ->> 'egresan')
       FROM (SELECT pg_temp.vista() AS v) x$q$, 'true|U1|true|6');
SELECT pg_temp.assert_raises('r: a second promotion of the campus is refused',
  $q$SELECT pg_temp.aplicar(jsonb_build_object(pg_temp.id('gr', 2)::text, 'pasan_chicos'))$q$, '22023', 'promocion_reciente');
SELECT pg_temp.assert_eq('r: the refused second promotion changed nothing',
  $q$SELECT pg_temp.huella()$q$, (SELECT v FROM t_pr_ctx WHERE k = 'huella_despues'));

RESET ROLE;

-- ── r. the guards outside a promotion ────────────────────────────────

SELECT pg_temp.assert_raises('r: a group cannot change sub-área outside a promotion',
  $q$UPDATE public.estudiantes_grupos SET subarea_id = pg_temp.id('eq', 9) WHERE id = pg_temp.id('gr', 4)$q$,
  '22023', 'grupo_invalido');
SELECT pg_temp.assert_raises('r: a membership cannot change ámbito outside a promotion',
  $q$UPDATE public.estudiantes_grupo_miembros SET ambito_id = pg_temp.id('eq', 4) WHERE grupo_id = pg_temp.id('gr', 1)$q$,
  '22023', 'miembro_invalido');

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes only the two RPCs, anon none',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            || '|' || count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))
            || '|' || count(*)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'estudiantes\_promocion\_%'$q$,
  'estudiantes_promocion_aplicar,estudiantes_promocion_vista|0|13');
SELECT pg_temp.assert_eq('l: every new or re-created function is SECURITY DEFINER with an empty search_path',
  $q$SELECT coalesce(string_agg(p.proname, ','), '')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.proname LIKE 'estudiantes\_promocion\_%'
             OR p.proname IN ('estudiantes_sin_grupo', 'estudiantes_grupos_validar', 'estudiantes_grupo_miembros_validar'))
        AND NOT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])$q$, '');
SELECT pg_temp.assert_eq('l: the record table has RLS and no privilege for anon or authenticated',
  $q$SELECT c.relrowsecurity || '|' || has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
            || '|' || has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
       FROM pg_class c WHERE c.oid = 'public.estudiantes_promociones'::regclass$q$, 'true|false|false');
SELECT pg_temp.assert_eq('l: estudiantes_sin_grupo keeps its grants',
  $q$SELECT has_function_privilege('authenticated', 'public.estudiantes_sin_grupo(uuid)', 'EXECUTE')
            || '|' || has_function_privilege('anon', 'public.estudiantes_sin_grupo(uuid)', 'EXECUTE')$q$, 'true|false');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_pr_failures);
END;
$$;
