-- T1 (odd/tasks/dream-team-acceso-directores.md) — a director general or a
-- director de etapa of Grupos de Vida, with NO Dream Team capability, reads the
-- part of Grupos de Vida that is theirs through dream_team_lideres_gdv() and
-- dream_team_estructura_gdv(); a capability holder keeps reading everything.
--
-- Covers:
--   a. A director de etapa gets the lider / colider of the current groups they
--      direct, their own director_etapa row, and nothing of another director.
--   b. A married couple of directores de etapa get the same output, even when a
--      group is linked to only one spouse.
--   c. A director general with alcance = 'segmento' gets that segment's groups
--      and directors, nothing of another segment.
--   d. A director general with alcance = 'directores' gets only the groups and
--      directors marked for them in dg_directores_etapa.
--   e. A director general with every segment gets the same lider / colider /
--      director_etapa rows and the same structure as a capability holder.
--   f. A capability holder gets byte-identical output from both functions
--      compared with the previous live definitions (recreated under pg_temp
--      names from their verbatim text).
--   g. A plain leader, a plain member and a user with no assignment rows get
--      zero rows from both functions.
--   h. The structure of a director holds only the nodes on their paths (root,
--      segment, directores node, groups); every equipo_id the people function
--      returns exists as a node; every node but the root has a visible parent;
--      every row is the very row a capability holder gets.
--   i. dream_team_resolver_nombres / dream_team_contactos_personas resolve the
--      people in scope and nobody else.
--   j. Non-current groups (inactive, not approved, deleted, season not active)
--      are excluded for directors too.
--   k. The internal rule function is executable by neither anon nor
--      authenticated; the two public functions keep no anon.
--   l. Several roles at once give the union of their scopes.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own f2000000-... namespace and are built with
-- pg_temp.id(kind, n). The MCP connection is `postgres` (BYPASSRLS), so every
-- authorization assertion runs under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id. The last statement is a
-- SELECT of the failing cases (0 failing cases = all ok), because the MCP tool
-- returns only the last result-producing statement.
--
-- Identities (usuario n = auth n):
--   1 MGR       dream_team.org.manage, scope NULL
--   2 LA1       plain leader of GA1, with phone and account
--   3 MEMBER    plain member of GA1
--   4 NOASSIGN  an account with no assignment row anywhere
--   5 DE_A      director de etapa of SA
--   6 C1, 7 C2  married, both directores de etapa of SB (one couple)
--   8 DE_B      director de etapa of SB, no spouse-director
--   9 DG_SEG    director general of SA, alcance 'segmento'
--  10 DG_DIR    director general of SB, alcance 'directores', marks DE_B only
--  11 DG_ALL    director general of every segment, alcance 'segmento'
--  12 MULTI     director de etapa of SA (no groups) AND director general of SB
-- Groups: GA1, GA2 (DE_A), GA3 (no director) in SA; GB1 (C1 only), GB2 (C2
-- only), GB3 (both), GB4 (DE_B), GB5 (no director) in SB; four non-current
-- groups of DE_A (inactive, pending, deleted, inactive season).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_acc_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_acc_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_acc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Fixture ids: kind picks the 4th uuid group, n the last 12 hex digits.
CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f2000000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' WHEN 'sg' THEN '8003'
                       WHEN 'sl' THEN '8004' WHEN 'gr' THEN '8005' WHEN 'te' THEN '8006' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

-- Fixtures (as postgres, before any role switch) ----------------------------

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'acc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 12) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  (pg_temp.id('us', 1),  pg_temp.id('au', 1),  'ZZ Acc', 'MGR',      'acc-1@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 2),  pg_temp.id('au', 2),  'ZZ Acc', 'LA1',      'acc-2@example.test',  '0414-555-0201', 'Soltero', 'Otro'),
  (pg_temp.id('us', 3),  pg_temp.id('au', 3),  'ZZ Acc', 'MEMBER',   'acc-3@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 4),  pg_temp.id('au', 4),  'ZZ Acc', 'NOASSIGN', 'acc-4@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 5),  pg_temp.id('au', 5),  'ZZ Acc', 'DE_A',     'acc-5@example.test',  '0424-555-0205', 'Soltero', 'Otro'),
  (pg_temp.id('us', 6),  pg_temp.id('au', 6),  'ZZ Acc', 'C1',       'acc-6@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 7),  pg_temp.id('au', 7),  'ZZ Acc', 'C2',       'acc-7@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 8),  pg_temp.id('au', 8),  'ZZ Acc', 'DE_B',     'acc-8@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 9),  pg_temp.id('au', 9),  'ZZ Acc', 'DG_SEG',   'acc-9@example.test',  NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 10), pg_temp.id('au', 10), 'ZZ Acc', 'DG_DIR',   'acc-10@example.test', NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 11), pg_temp.id('au', 11), 'ZZ Acc', 'DG_ALL',   'acc-11@example.test', NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 12), pg_temp.id('au', 12), 'ZZ Acc', 'MULTI',    'acc-12@example.test', NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 13), NULL, 'ZZ Acc', 'LA2', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 14), NULL, 'ZZ Acc', 'LA3', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 15), NULL, 'ZZ Acc', 'LA4', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 16), NULL, 'ZZ Acc', 'LB1', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 17), NULL, 'ZZ Acc', 'LB2', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 18), NULL, 'ZZ Acc', 'LB3', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 19), NULL, 'ZZ Acc', 'LB4', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 20), NULL, 'ZZ Acc', 'LB5', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 21), NULL, 'ZZ Acc', 'LB6', NULL, NULL, 'Soltero', 'Otro'),
  (pg_temp.id('us', 22), NULL, 'ZZ Acc', 'LX',  NULL, NULL, 'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.org.manage', 'dream_team', 'experience', NULL);

INSERT INTO public.segmentos (id, nombre) VALUES
  (pg_temp.id('sg', 1), 'ZZ Acc SA'),
  (pg_temp.id('sg', 2), 'ZZ Acc SB');

INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  (pg_temp.id('te', 1), 'ZZ Acc activa',   '2026-01-01', '2026-12-31', true,  'activa'),
  (pg_temp.id('te', 2), 'ZZ Acc inactiva', '2027-01-01', '2027-12-31', false, 'planificacion');

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  (pg_temp.id('sl', 1), pg_temp.id('sg', 1), pg_temp.id('us', 5),  'director_etapa'),
  (pg_temp.id('sl', 2), pg_temp.id('sg', 2), pg_temp.id('us', 6),  'director_etapa'),
  (pg_temp.id('sl', 3), pg_temp.id('sg', 2), pg_temp.id('us', 7),  'director_etapa'),
  (pg_temp.id('sl', 4), pg_temp.id('sg', 2), pg_temp.id('us', 8),  'director_etapa'),
  (pg_temp.id('sl', 5), pg_temp.id('sg', 1), pg_temp.id('us', 12), 'director_etapa');

-- C1 and C2 are married.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  (pg_temp.id('us', 7), pg_temp.id('us', 6), 'conyuge');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_aprobacion, eliminado) VALUES
  (pg_temp.id('gr', 1),  'ZZ Acc GA1', pg_temp.id('te', 1), pg_temp.id('sg', 1), true,  'aprobado', false),
  (pg_temp.id('gr', 2),  'ZZ Acc GA2', pg_temp.id('te', 1), pg_temp.id('sg', 1), true,  'aprobado', false),
  (pg_temp.id('gr', 3),  'ZZ Acc GA3', pg_temp.id('te', 1), pg_temp.id('sg', 1), true,  'aprobado', false),
  (pg_temp.id('gr', 4),  'ZZ Acc GB1', pg_temp.id('te', 1), pg_temp.id('sg', 2), true,  'aprobado', false),
  (pg_temp.id('gr', 5),  'ZZ Acc GB2', pg_temp.id('te', 1), pg_temp.id('sg', 2), true,  'aprobado', false),
  (pg_temp.id('gr', 6),  'ZZ Acc GB3', pg_temp.id('te', 1), pg_temp.id('sg', 2), true,  'aprobado', false),
  (pg_temp.id('gr', 7),  'ZZ Acc GB4', pg_temp.id('te', 1), pg_temp.id('sg', 2), true,  'aprobado', false),
  (pg_temp.id('gr', 8),  'ZZ Acc GB5', pg_temp.id('te', 1), pg_temp.id('sg', 2), true,  'aprobado', false),
  (pg_temp.id('gr', 9),  'ZZ Acc GA inactivo',  pg_temp.id('te', 1), pg_temp.id('sg', 1), false, 'aprobado',  false),
  (pg_temp.id('gr', 10), 'ZZ Acc GA pendiente', pg_temp.id('te', 1), pg_temp.id('sg', 1), true,  'pendiente', false),
  (pg_temp.id('gr', 11), 'ZZ Acc GA eliminado', pg_temp.id('te', 1), pg_temp.id('sg', 1), true,  'aprobado',  true),
  (pg_temp.id('gr', 12), 'ZZ Acc GA temporada', pg_temp.id('te', 2), pg_temp.id('sg', 1), true,  'aprobado',  false);

-- Who directs what. GB1 is linked to C1 only and GB2 to C2 only: a couple is one
-- director, so both spouses must read both groups. DE_A also directs the four
-- non-current groups (9..12) and MULTI directs nothing.
INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  (pg_temp.id('sl', 1), pg_temp.id('gr', 1)),
  (pg_temp.id('sl', 1), pg_temp.id('gr', 2)),
  (pg_temp.id('sl', 2), pg_temp.id('gr', 4)),
  (pg_temp.id('sl', 3), pg_temp.id('gr', 5)),
  (pg_temp.id('sl', 2), pg_temp.id('gr', 6)),
  (pg_temp.id('sl', 3), pg_temp.id('gr', 6)),
  (pg_temp.id('sl', 4), pg_temp.id('gr', 7)),
  (pg_temp.id('sl', 1), pg_temp.id('gr', 9)),
  (pg_temp.id('sl', 1), pg_temp.id('gr', 10)),
  (pg_temp.id('sl', 1), pg_temp.id('gr', 11)),
  (pg_temp.id('sl', 1), pg_temp.id('gr', 12));

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 2),  'Líder'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 13), 'Colíder'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 3),  'Miembro'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 14), 'Líder'),
  (pg_temp.id('gr', 3), pg_temp.id('us', 15), 'Líder'),
  (pg_temp.id('gr', 4), pg_temp.id('us', 16), 'Líder'),
  (pg_temp.id('gr', 5), pg_temp.id('us', 17), 'Líder'),
  (pg_temp.id('gr', 6), pg_temp.id('us', 18), 'Líder'),
  (pg_temp.id('gr', 6), pg_temp.id('us', 19), 'Colíder'),
  (pg_temp.id('gr', 7), pg_temp.id('us', 20), 'Líder'),
  (pg_temp.id('gr', 8), pg_temp.id('us', 21), 'Líder'),
  (pg_temp.id('gr', 9),  pg_temp.id('us', 22), 'Líder'),
  (pg_temp.id('gr', 10), pg_temp.id('us', 22), 'Líder'),
  (pg_temp.id('gr', 11), pg_temp.id('us', 22), 'Líder'),
  (pg_temp.id('gr', 12), pg_temp.id('us', 22), 'Líder');

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  (pg_temp.id('us', 9),  pg_temp.id('sg', 1), 'segmento'),
  (pg_temp.id('us', 10), pg_temp.id('sg', 2), 'directores'),
  (pg_temp.id('us', 12), pg_temp.id('sg', 2), 'segmento');
INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance)
  SELECT pg_temp.id('us', 11), s.id, 'segmento' FROM public.segmentos s;

-- DG_DIR marks DE_B only; the couple and everyone else are left unmarked.
INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id) VALUES
  (pg_temp.id('us', 10), pg_temp.id('sl', 4));

-- Readable names for every fixture id, and for the real root node. A row that
-- is not a fixture prints as a raw uuid, so a leak of real data fails loudly.
CREATE TEMP TABLE t_acc_labels (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;
INSERT INTO t_acc_labels (id, label) VALUES
  (pg_temp.id('us', 1), 'MGR'),   (pg_temp.id('us', 2), 'LA1'),   (pg_temp.id('us', 3), 'MEMBER'),
  (pg_temp.id('us', 4), 'NOASSIGN'), (pg_temp.id('us', 5), 'DE_A'), (pg_temp.id('us', 6), 'C1'),
  (pg_temp.id('us', 7), 'C2'),    (pg_temp.id('us', 8), 'DE_B'),  (pg_temp.id('us', 9), 'DG_SEG'),
  (pg_temp.id('us', 10), 'DG_DIR'), (pg_temp.id('us', 11), 'DG_ALL'), (pg_temp.id('us', 12), 'MULTI'),
  (pg_temp.id('us', 13), 'LA2'),  (pg_temp.id('us', 14), 'LA3'),  (pg_temp.id('us', 15), 'LA4'),
  (pg_temp.id('us', 16), 'LB1'),  (pg_temp.id('us', 17), 'LB2'),  (pg_temp.id('us', 18), 'LB3'),
  (pg_temp.id('us', 19), 'LB4'),  (pg_temp.id('us', 20), 'LB5'),  (pg_temp.id('us', 21), 'LB6'),
  (pg_temp.id('us', 22), 'LX'),
  (pg_temp.id('sg', 1), 'SA'), (pg_temp.id('sg', 2), 'SB'),
  (pg_temp.id('gr', 1), 'GA1'), (pg_temp.id('gr', 2), 'GA2'), (pg_temp.id('gr', 3), 'GA3'),
  (pg_temp.id('gr', 4), 'GB1'), (pg_temp.id('gr', 5), 'GB2'), (pg_temp.id('gr', 6), 'GB3'),
  (pg_temp.id('gr', 7), 'GB4'), (pg_temp.id('gr', 8), 'GB5'),
  (pg_temp.id('gr', 9), 'GA_INACT'), (pg_temp.id('gr', 10), 'GA_PEND'),
  (pg_temp.id('gr', 11), 'GA_DEL'),  (pg_temp.id('gr', 12), 'GA_SEASON'),
  -- The `directores` node ids: md5 of segment, first spouse, second spouse.
  (md5('dream_team.gdv.directores:' || pg_temp.id('sg', 1)::text || ':' || pg_temp.id('us', 5)::text  || ':')::uuid, 'TEAM_DEA'),
  (md5('dream_team.gdv.directores:' || pg_temp.id('sg', 2)::text || ':' || pg_temp.id('us', 6)::text  || ':' || pg_temp.id('us', 7)::text)::uuid, 'TEAM_C'),
  (md5('dream_team.gdv.directores:' || pg_temp.id('sg', 2)::text || ':' || pg_temp.id('us', 8)::text  || ':')::uuid, 'TEAM_DEB'),
  (md5('dream_team.gdv.directores:' || pg_temp.id('sg', 1)::text || ':' || pg_temp.id('us', 12)::text || ':')::uuid, 'TEAM_MULTI');
INSERT INTO t_acc_labels (id, label)
  SELECT e.id, 'RAIZ'
    FROM public.dream_team_equipos e
   WHERE e.parent_equipo_id IS NULL AND e.experiencia = 'grupos_vida' AND e.activo
   ORDER BY e.created_at
   LIMIT 1;
GRANT SELECT ON t_acc_labels TO authenticated;

-- Sorts a comma separated list so expectations can be written in any order.
CREATE OR REPLACE FUNCTION pg_temp.norm(p text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(trim(x), ', ' ORDER BY trim(x) COLLATE "C"), '')
    FROM unnest(string_to_array(p, ',')) AS x
   WHERE trim(x) <> '';
$$;

-- The people the session reads, as `person@team:rol`, sorted.
CREATE OR REPLACE FUNCTION pg_temp.lideres_txt() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (
      SELECT coalesce(p.label, l.persona_id::text) || '@' || coalesce(e.label, l.equipo_id::text) || ':' || l.rol AS t
        FROM public.dream_team_lideres_gdv() l
        LEFT JOIN t_acc_labels p ON p.id = l.persona_id
        LEFT JOIN t_acc_labels e ON e.id = l.equipo_id
    ) q;
$$;

-- The tree the session reads, as `tipo:node>parent`, sorted.
CREATE OR REPLACE FUNCTION pg_temp.estructura_txt() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (
      SELECT s.tipo || ':' || coalesce(n.label, s.nodo_id::text) || '>' || coalesce(pl.label, s.parent_id::text, '-') AS t
        FROM public.dream_team_estructura_gdv() s
        LEFT JOIN t_acc_labels n  ON n.id  = s.nodo_id
        LEFT JOIN t_acc_labels pl ON pl.id = s.parent_id
    ) q;
$$;

-- Ordered fingerprints of the full output of either implementation. p_fn is the
-- function call text, so the same code fingerprints the live and the previous one.
CREATE OR REPLACE FUNCTION pg_temp.huella_lideres(p_fn text, p_roles text[] DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE format($f$SELECT md5(coalesce(string_agg(persona_id::text || '|' || equipo_id::text || '|' || rol || '|' || coalesce(desde::text, ''),
                                            ',' ORDER BY persona_id, equipo_id, rol, desde), ''))
                       || '/' || count(*)
                    FROM %s WHERE $1 IS NULL OR rol = ANY ($1)$f$, p_fn) INTO v USING p_roles;
  RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.huella_estructura(p_fn text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE format($f$SELECT md5(coalesce(string_agg(nodo_id::text || '|' || coalesce(parent_id::text, '') || '|' || tipo || '|' || coalesce(label, '') || '|' || responsables::text,
                                            ',' ORDER BY nodo_id, tipo), ''))
                       || '/' || count(*)
                    FROM %s$f$, p_fn) INTO v;
  RETURN v;
END;
$$;

-- Rows of the people function whose equipo_id is not a node of the tree, and
-- non-root nodes whose parent is not a node: both must be zero.
CREATE OR REPLACE FUNCTION pg_temp.lideres_sin_nodo() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.dream_team_lideres_gdv() l
   WHERE NOT EXISTS (SELECT 1 FROM public.dream_team_estructura_gdv() e WHERE e.nodo_id = l.equipo_id);
$$;
CREATE OR REPLACE FUNCTION pg_temp.nodos_sin_padre() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.dream_team_estructura_gdv() e
   WHERE e.parent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_estructura_gdv() p WHERE p.nodo_id = e.parent_id);
$$;

-- Full rows read by each persona, to prove a director's rows are a subset of the
-- capability holder's rows.
CREATE TEMP TABLE t_acc_lid (persona text, persona_id uuid, equipo_id uuid, rol text, desde timestamptz) ON COMMIT DROP;
CREATE TEMP TABLE t_acc_est (persona text, nodo_id uuid, parent_id uuid, tipo text, label text, responsables jsonb) ON COMMIT DROP;
CREATE TEMP TABLE t_acc_huellas (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_acc_lid, t_acc_est, t_acc_huellas TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.guardar(p_persona text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_acc_lid SELECT p_persona, persona_id, equipo_id, rol, desde FROM public.dream_team_lideres_gdv();
  INSERT INTO t_acc_est SELECT p_persona, nodo_id, parent_id, tipo, label, responsables FROM public.dream_team_estructura_gdv();
$$;

-- The two functions as they were live before this change, verbatim, under temp
-- names. Same SECURITY DEFINER + pinned search_path, so they answer exactly as
-- the old functions did for whoever is simulated.
-- lideres: 20261001180000_dream_team_directores_gdv.sql
CREATE OR REPLACE FUNCTION pg_temp.lideres_gdv_anterior()
 RETURNS TABLE(persona_id uuid, equipo_id uuid, rol text, desde timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with nodo as (
    select e.id
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  ),
  -- The next four CTEs mirror dream_team_estructura_gdv(): same director set
  -- (no tipo_lider filter), same couple pairing, so the node ids match.
  directores as (
    select sl.segmento_id,
           sl.usuario_id
    from public.segmento_lideres sl
    join public.usuarios u on u.id = sl.usuario_id
  ),
  parejas as (
    select a.segmento_id, a.usuario_id as u1, b.usuario_id as u2
    from directores a
    join directores b
      on b.segmento_id = a.segmento_id
     and b.usuario_id > a.usuario_id
    join public.relaciones_usuarios r
      on r.tipo_relacion = 'conyuge'
     and ((r.usuario1_id = a.usuario_id and r.usuario2_id = b.usuario_id)
       or (r.usuario1_id = b.usuario_id and r.usuario2_id = a.usuario_id))
  ),
  pareja_de as (
    select segmento_id, u1 as usuario_id, u1, u2 from parejas
    union all
    select segmento_id, u2 as usuario_id, u1, u2 from parejas
  ),
  director_con_equipo as (
    select d.segmento_id,
           d.usuario_id,
           coalesce(p.u1, d.usuario_id) as clave_u1,
           p.u2 as clave_u2
    from directores d
    left join pareja_de p
      on p.segmento_id = d.segmento_id
     and p.usuario_id = d.usuario_id
  )
  select gm.usuario_id,
         gm.grupo_id,
         case when gm.rol = 'Líder' then 'lider' else 'colider' end,
         gm.fecha_asignacion
  from public.grupo_miembros gm
  join public.grupos g on g.id = gm.grupo_id
  join public.temporadas t on t.id = g.temporada_id
  where gm.rol in ('Líder', 'Colíder')
    and gm.fecha_salida is null
    and coalesce(gm.estado, 'activo') = 'activo'
    and g.activo
    and not g.eliminado
    and g.estado_aprobacion = 'aprobado'
    and t.activa
    and exists (select 1 from alcance)

  union all

  select distinct
         d.usuario_id,
         md5('dream_team.gdv.directores:' || d.segmento_id::text || ':' || d.clave_u1::text || ':' || coalesce(d.clave_u2::text, ''))::uuid,
         'director_etapa',
         null::timestamptz
  from director_con_equipo d
  where exists (select 1 from alcance)

  union all

  select dgs.usuario_id,
         dgs.segmento_id,
         'director_general',
         dgs.creado_en
  from public.director_general_segmentos dgs
  join public.usuarios u on u.id = dgs.usuario_id
  where exists (select 1 from alcance);
$function$;

-- estructura: 20260912120000_dream_team_estructura_gdv_directores.sql
CREATE OR REPLACE FUNCTION pg_temp.estructura_gdv_anterior()
 RETURNS TABLE(nodo_id uuid, parent_id uuid, tipo text, label text, responsables jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with nodo as (
    select e.id, e.label
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id, n.label
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  ),
  grupos_vigentes as (
    select g.id, g.nombre, g.segmento_id
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  directores as (
    select sl.id as sl_id,
           sl.segmento_id,
           sl.usuario_id,
           concat_ws(' ', u.nombre, u.apellido) as nombre
    from public.segmento_lideres sl
    join public.usuarios u on u.id = sl.usuario_id
  ),
  -- Dos directores del mismo segmento son pareja cuando Grupos de Vida los
  -- tiene registrados como cónyuges. Misma regla que su pantalla de segmento.
  parejas as (
    select a.segmento_id, a.usuario_id as u1, b.usuario_id as u2
    from directores a
    join directores b
      on b.segmento_id = a.segmento_id
     and b.usuario_id > a.usuario_id
    join public.relaciones_usuarios r
      on r.tipo_relacion = 'conyuge'
     and ((r.usuario1_id = a.usuario_id and r.usuario2_id = b.usuario_id)
       or (r.usuario1_id = b.usuario_id and r.usuario2_id = a.usuario_id))
  ),
  pareja_de as (
    select segmento_id, u1 as usuario_id, u1, u2 from parejas
    union all
    select segmento_id, u2 as usuario_id, u1, u2 from parejas
  ),
  -- Cada director, con la clave del equipo al que pertenece: su pareja si la
  -- tiene, o él mismo. La clave lleva el segmento porque la misma persona
  -- puede dirigir en dos segmentos (pasa en staging).
  director_con_equipo as (
    select d.sl_id,
           d.segmento_id,
           d.usuario_id,
           d.nombre,
           coalesce(p.u1, d.usuario_id) as clave_u1,
           p.u2 as clave_u2
    from directores d
    left join pareja_de p
      on p.segmento_id = d.segmento_id
     and p.usuario_id = d.usuario_id
  ),
  equipos_direccion as (
    select segmento_id,
           clave_u1,
           clave_u2,
           md5('dream_team.gdv.directores:' || segmento_id::text || ':' || clave_u1::text || ':' || coalesce(clave_u2::text, ''))::uuid as nodo_id,
           string_agg(nombre, ' y ' order by nombre) as label
    from director_con_equipo
    group by segmento_id, clave_u1, clave_u2
  ),
  asignaciones as (
    select gv.id as grupo_id,
           e.nodo_id as equipo_nodo_id,
           dce.usuario_id,
           dce.nombre
    from grupos_vigentes gv
    join public.director_etapa_grupos deg on deg.grupo_id = gv.id
    join director_con_equipo dce on dce.sl_id = deg.director_etapa_id
    join equipos_direccion e
      on e.segmento_id = dce.segmento_id
     and e.clave_u1 = dce.clave_u1
     and e.clave_u2 is not distinct from dce.clave_u2
  ),
  -- El equipo del que cuelga el grupo: el que aporta más de sus directores.
  equipo_por_grupo as (
    select distinct on (grupo_id) grupo_id, equipo_nodo_id
    from (
      select grupo_id, equipo_nodo_id, count(*) as cuantos, min(nombre) as primer_nombre
      from asignaciones
      group by grupo_id, equipo_nodo_id
    ) conteo
    order by grupo_id, cuantos desc, primer_nombre
  ),
  -- Los directores del grupo que quedaron fuera de ese equipo.
  supervisores_extra as (
    select a.grupo_id,
           jsonb_agg(distinct jsonb_build_object(
             'persona_id', a.usuario_id,
             'nombre', a.nombre,
             'rol', 'director_etapa')) as extra
    from asignaciones a
    join equipo_por_grupo epg on epg.grupo_id = a.grupo_id
    where a.equipo_nodo_id <> epg.equipo_nodo_id
    group by a.grupo_id
  )

  -- La dirección: sus directores generales.
  select a.id,
         null::uuid,
         'direccion',
         a.label,
         coalesce((
           select jsonb_agg(distinct jsonb_build_object(
                    'persona_id', u.id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', 'director_general'))
           from public.director_general_segmentos dgs
           join public.usuarios u on u.id = dgs.usuario_id
         ), '[]'::jsonb)
  from alcance a

  union all

  -- Cada segmento: sólo su director general. Los de etapa son nodos hijos.
  select s.id,
         a.id,
         'segmento',
         s.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', u.id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', 'director_general')
                  order by concat_ws(' ', u.nombre, u.apellido))
           from public.director_general_segmentos dgs
           join public.usuarios u on u.id = dgs.usuario_id
           where dgs.segmento_id = s.id
         ), '[]'::jsonb)
  from public.segmentos s
  cross join alcance a

  union all

  -- Cada equipo de dirección: la pareja, o el director solo. Su etiqueta ya
  -- son los nombres, así que no lleva responsables: repetirlos sería decir
  -- dos veces lo mismo en la misma fila.
  select e.nodo_id,
         e.segmento_id,
         'directores',
         e.label,
         '[]'::jsonb
  from equipos_direccion e
  cross join alcance a

  union all

  -- Cada grupo vigente: su líder y su colíder, más los directores que lo
  -- supervisan desde otro equipo.
  select gv.id,
         coalesce(epg.equipo_nodo_id, gv.segmento_id),
         'grupo',
         gv.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', gm.usuario_id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', case when gm.rol = 'Líder' then 'lider' else 'colider' end)
                  order by gm.rol, u.nombre)
           from public.grupo_miembros gm
           join public.usuarios u on u.id = gm.usuario_id
           where gm.grupo_id = gv.id
             and gm.rol in ('Líder', 'Colíder')
             and gm.fecha_salida is null
             and coalesce(gm.estado, 'activo') = 'activo'
         ), '[]'::jsonb) || coalesce(se.extra, '[]'::jsonb)
  from grupos_vigentes gv
  cross join alcance a
  left join equipo_por_grupo epg on epg.grupo_id = gv.id
  left join supervisores_extra se on se.grupo_id = gv.id;
$function$;

-- Preconditions (as postgres) -----------------------------------------------

SELECT pg_temp.assert_eq('fixture: DE_A is linked to the four non-current groups (j is not vacuous)',
  $q$SELECT count(*) FROM public.director_etapa_grupos
      WHERE director_etapa_id = pg_temp.id('sl', 1)
        AND grupo_id IN (pg_temp.id('gr', 9), pg_temp.id('gr', 10), pg_temp.id('gr', 11), pg_temp.id('gr', 12))$q$,
  '4');
SELECT pg_temp.assert_eq('fixture: the real Grupos de Vida root exists (the tree needs a root)',
  $q$SELECT count(*) FROM t_acc_labels WHERE label = 'RAIZ'$q$,
  '1');

-- Capability holder: the output stays what the previous definitions returned -

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 1));
SELECT pg_temp.guardar('MGR');
INSERT INTO t_acc_huellas (k, v) VALUES
  ('mgr_lid',        pg_temp.huella_lideres('public.dream_team_lideres_gdv()')),
  ('mgr_lid_gente',  pg_temp.huella_lideres('public.dream_team_lideres_gdv()', ARRAY['lider', 'colider', 'director_etapa'])),
  ('mgr_est',        pg_temp.huella_estructura('public.dream_team_estructura_gdv()')),
  ('old_lid',        pg_temp.huella_lideres('pg_temp.lideres_gdv_anterior()')),
  ('old_est',        pg_temp.huella_estructura('pg_temp.estructura_gdv_anterior()'));

-- f. Byte-identical output for a capability holder.
SELECT pg_temp.assert_eq('f: fixture is real, the previous people function returns rows',
  $q$SELECT (split_part(v, '/', 2)::int > 0)::text FROM t_acc_huellas WHERE k = 'old_lid'$q$, 'true');
SELECT pg_temp.assert_eq('f: fixture is real, the previous structure function returns nodes',
  $q$SELECT (split_part(v, '/', 2)::int > 0)::text FROM t_acc_huellas WHERE k = 'old_est'$q$, 'true');
SELECT pg_temp.assert_eq('f: capability holder, dream_team_lideres_gdv() md5 and count equal the previous definition',
  $q$SELECT v FROM t_acc_huellas WHERE k = 'mgr_lid'$q$,
  (SELECT v FROM t_acc_huellas WHERE k = 'old_lid'));
SELECT pg_temp.assert_eq('f: capability holder, dream_team_estructura_gdv() md5 and count equal the previous definition',
  $q$SELECT v FROM t_acc_huellas WHERE k = 'mgr_est'$q$,
  (SELECT v FROM t_acc_huellas WHERE k = 'old_est'));
SELECT pg_temp.assert_eq('f: capability holder, lideres rows differ from the previous definition in neither direction',
  $q$SELECT count(*) FROM (
       (SELECT persona_id, equipo_id, rol, desde FROM pg_temp.lideres_gdv_anterior()
        EXCEPT SELECT persona_id, equipo_id, rol, desde FROM public.dream_team_lideres_gdv())
       UNION ALL
       (SELECT persona_id, equipo_id, rol, desde FROM public.dream_team_lideres_gdv()
        EXCEPT SELECT persona_id, equipo_id, rol, desde FROM pg_temp.lideres_gdv_anterior())
     ) d$q$, '0');
SELECT pg_temp.assert_eq('f: capability holder, structure rows differ from the previous definition in neither direction',
  $q$SELECT count(*) FROM (
       (SELECT nodo_id, parent_id, tipo, label, responsables FROM pg_temp.estructura_gdv_anterior()
        EXCEPT SELECT nodo_id, parent_id, tipo, label, responsables FROM public.dream_team_estructura_gdv())
       UNION ALL
       (SELECT nodo_id, parent_id, tipo, label, responsables FROM public.dream_team_estructura_gdv()
        EXCEPT SELECT nodo_id, parent_id, tipo, label, responsables FROM pg_temp.estructura_gdv_anterior())
     ) d$q$, '0');
SELECT pg_temp.assert_eq('f: capability holder reads the fixtures in full (people)',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l JOIN t_acc_labels n ON n.id = l.equipo_id
      WHERE n.label IN ('GA1', 'GA2', 'GA3', 'GB1', 'GB2', 'GB3', 'GB4', 'GB5')$q$,
  '10');
RESET ROLE;

-- a. Director de etapa DE_A ---------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 5));
SELECT pg_temp.guardar('DE_A');
SELECT pg_temp.assert_eq('a: DE_A reads exactly the lider/colider of his current groups and his own director row',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('DE_A@TEAM_DEA:director_etapa, LA1@GA1:lider, LA2@GA1:colider, LA3@GA2:lider'));
SELECT pg_temp.assert_eq('a/h: DE_A reads only the nodes on his path',
  $q$SELECT pg_temp.estructura_txt()$q$,
  pg_temp.norm('direccion:RAIZ>-, segmento:SA>RAIZ, directores:TEAM_DEA>SA, grupo:GA1>TEAM_DEA, grupo:GA2>TEAM_DEA'));
SELECT pg_temp.assert_eq('h: DE_A, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
SELECT pg_temp.assert_eq('h: DE_A, every node but the root has a visible parent',
  $q$SELECT pg_temp.nodos_sin_padre()$q$, '0');
-- j. Non-current groups, for a director.
SELECT pg_temp.assert_eq('j: DE_A reads nothing of the inactive, pending, deleted or off-season groups',
  $q$SELECT (SELECT count(*) FROM public.dream_team_lideres_gdv() l
              WHERE l.equipo_id IN (pg_temp.id('gr', 9), pg_temp.id('gr', 10), pg_temp.id('gr', 11), pg_temp.id('gr', 12))
                 OR l.persona_id = pg_temp.id('us', 22))
          + (SELECT count(*) FROM public.dream_team_estructura_gdv() e
              WHERE e.nodo_id IN (pg_temp.id('gr', 9), pg_temp.id('gr', 10), pg_temp.id('gr', 11), pg_temp.id('gr', 12)))$q$,
  '0');
-- i. Names and contacts.
SELECT pg_temp.assert_eq('i: DE_A resolves the names of the people in scope',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 5), pg_temp.id('us', 2), pg_temp.id('us', 13), pg_temp.id('us', 14)])$q$,
  '4');
SELECT pg_temp.assert_eq('i: DE_A resolves nobody out of scope (names)',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 15), pg_temp.id('us', 16), pg_temp.id('us', 20), pg_temp.id('us', 6), pg_temp.id('us', 1), pg_temp.id('us', 22)])$q$,
  '0');
SELECT pg_temp.assert_eq('i: DE_A gets the contact of a leader in scope, with phone and account',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 2)])
      WHERE telefono = '04145550201' AND tiene_cuenta$q$,
  '1');
SELECT pg_temp.assert_eq('i: DE_A gets the contacts of the people in scope',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 5), pg_temp.id('us', 2), pg_temp.id('us', 13), pg_temp.id('us', 14)])$q$,
  '4');
SELECT pg_temp.assert_eq('i: DE_A gets no contact of anybody out of scope',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 15), pg_temp.id('us', 16), pg_temp.id('us', 20), pg_temp.id('us', 6), pg_temp.id('us', 1), pg_temp.id('us', 22)])$q$,
  '0');
RESET ROLE;

-- Director de etapa DE_B, a lone director of the other segment -----------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 8));
SELECT pg_temp.guardar('DE_B');
SELECT pg_temp.assert_eq('a: DE_B reads his own group and director row, nothing of the couple',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('DE_B@TEAM_DEB:director_etapa, LB5@GB4:lider'));
SELECT pg_temp.assert_eq('a/h: DE_B reads only the nodes on his path',
  $q$SELECT pg_temp.estructura_txt()$q$,
  pg_temp.norm('direccion:RAIZ>-, segmento:SB>RAIZ, directores:TEAM_DEB>SB, grupo:GB4>TEAM_DEB'));
SELECT pg_temp.assert_eq('h: DE_B, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
SELECT pg_temp.assert_eq('h: DE_B, every node but the root has a visible parent',
  $q$SELECT pg_temp.nodos_sin_padre()$q$, '0');
RESET ROLE;

-- b. A married couple of directores de etapa ----------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 6));
SELECT pg_temp.guardar('C1');
INSERT INTO t_acc_huellas (k, v) VALUES
  ('c1_lid', pg_temp.huella_lideres('public.dream_team_lideres_gdv()')),
  ('c1_est', pg_temp.huella_estructura('public.dream_team_estructura_gdv()'));
SELECT pg_temp.assert_eq('b: C1 reads both spouses, the groups of the couple (even linked to one spouse) and nothing else',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('C1@TEAM_C:director_etapa, C2@TEAM_C:director_etapa, LB1@GB1:lider, LB2@GB2:lider, LB3@GB3:lider, LB4@GB3:colider'));
SELECT pg_temp.assert_eq('b/h: C1 reads only the nodes on the path of the couple',
  $q$SELECT pg_temp.estructura_txt()$q$,
  pg_temp.norm('direccion:RAIZ>-, segmento:SB>RAIZ, directores:TEAM_C>SB, grupo:GB1>TEAM_C, grupo:GB2>TEAM_C, grupo:GB3>TEAM_C'));
SELECT pg_temp.assert_eq('h: C1, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
SELECT pg_temp.assert_eq('h: C1, every node but the root has a visible parent',
  $q$SELECT pg_temp.nodos_sin_padre()$q$, '0');
SELECT pg_temp.assert_eq('i: C1 resolves the names of the couple and their leaders',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 6), pg_temp.id('us', 7), pg_temp.id('us', 16), pg_temp.id('us', 17), pg_temp.id('us', 18), pg_temp.id('us', 19)])$q$,
  '6');
SELECT pg_temp.assert_eq('i: C1 resolves nobody out of scope (names)',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 2), pg_temp.id('us', 5), pg_temp.id('us', 20), pg_temp.id('us', 21), pg_temp.id('us', 13)])$q$,
  '0');
SELECT pg_temp.assert_eq('i: C1 gets no contact of anybody out of scope',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 2), pg_temp.id('us', 5), pg_temp.id('us', 20), pg_temp.id('us', 21), pg_temp.id('us', 13)])$q$,
  '0');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 7));
SELECT pg_temp.guardar('C2');
INSERT INTO t_acc_huellas (k, v) VALUES
  ('c2_lid', pg_temp.huella_lideres('public.dream_team_lideres_gdv()')),
  ('c2_est', pg_temp.huella_estructura('public.dream_team_estructura_gdv()'));
SELECT pg_temp.assert_eq('b: C2 reads exactly what C1 reads (people)',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('C1@TEAM_C:director_etapa, C2@TEAM_C:director_etapa, LB1@GB1:lider, LB2@GB2:lider, LB3@GB3:lider, LB4@GB3:colider'));
SELECT pg_temp.assert_eq('b: C1 and C2 get the same people fingerprint',
  $q$SELECT v FROM t_acc_huellas WHERE k = 'c1_lid'$q$,
  (SELECT v FROM t_acc_huellas WHERE k = 'c2_lid'));
SELECT pg_temp.assert_eq('b: C1 and C2 get the same structure fingerprint',
  $q$SELECT v FROM t_acc_huellas WHERE k = 'c1_est'$q$,
  (SELECT v FROM t_acc_huellas WHERE k = 'c2_est'));
RESET ROLE;

-- c. Director general, alcance 'segmento' ---------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 9));
SELECT pg_temp.guardar('DG_SEG');
SELECT pg_temp.assert_eq('c: DG_SEG reads the groups and directors of his segment, and himself, nothing of SB',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('DG_SEG@SA:director_general, DE_A@TEAM_DEA:director_etapa, MULTI@TEAM_MULTI:director_etapa, LA1@GA1:lider, LA2@GA1:colider, LA3@GA2:lider, LA4@GA3:lider'));
SELECT pg_temp.assert_eq('c/h: DG_SEG reads the tree of his segment only, a group without director hangs from the segment',
  $q$SELECT pg_temp.estructura_txt()$q$,
  pg_temp.norm('direccion:RAIZ>-, segmento:SA>RAIZ, directores:TEAM_DEA>SA, directores:TEAM_MULTI>SA, grupo:GA1>TEAM_DEA, grupo:GA2>TEAM_DEA, grupo:GA3>SA'));
SELECT pg_temp.assert_eq('h: DG_SEG, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
SELECT pg_temp.assert_eq('h: DG_SEG, every node but the root has a visible parent',
  $q$SELECT pg_temp.nodos_sin_padre()$q$, '0');
SELECT pg_temp.assert_eq('j: DG_SEG reads nothing of the non-current groups',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.equipo_id IN (pg_temp.id('gr', 9), pg_temp.id('gr', 10), pg_temp.id('gr', 11), pg_temp.id('gr', 12))$q$,
  '0');
SELECT pg_temp.assert_eq('i: DG_SEG resolves the people of his segment',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 9), pg_temp.id('us', 5), pg_temp.id('us', 12), pg_temp.id('us', 2), pg_temp.id('us', 13), pg_temp.id('us', 14), pg_temp.id('us', 15)])$q$,
  '7');
SELECT pg_temp.assert_eq('i: DG_SEG resolves nobody of another segment (names and contacts)',
  $q$SELECT (SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 16), pg_temp.id('us', 17), pg_temp.id('us', 20), pg_temp.id('us', 6), pg_temp.id('us', 8)]))
          + (SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 16), pg_temp.id('us', 17), pg_temp.id('us', 20), pg_temp.id('us', 6), pg_temp.id('us', 8)]))$q$,
  '0');
RESET ROLE;

-- d. Director general, alcance 'directores' --------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 10));
SELECT pg_temp.guardar('DG_DIR');
SELECT pg_temp.assert_eq('d: DG_DIR reads only the director he marked and that director''s groups, and himself',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('DG_DIR@SB:director_general, DE_B@TEAM_DEB:director_etapa, LB5@GB4:lider'));
SELECT pg_temp.assert_eq('d/h: DG_DIR reads only the nodes of the marked director',
  $q$SELECT pg_temp.estructura_txt()$q$,
  pg_temp.norm('direccion:RAIZ>-, segmento:SB>RAIZ, directores:TEAM_DEB>SB, grupo:GB4>TEAM_DEB'));
SELECT pg_temp.assert_eq('h: DG_DIR, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
SELECT pg_temp.assert_eq('h: DG_DIR, every node but the root has a visible parent',
  $q$SELECT pg_temp.nodos_sin_padre()$q$, '0');
RESET ROLE;

-- e. Director general of every segment ------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 11));
SELECT pg_temp.guardar('DG_ALL');
INSERT INTO t_acc_huellas (k, v) VALUES
  ('all_lid_gente', pg_temp.huella_lideres('public.dream_team_lideres_gdv()', ARRAY['lider', 'colider', 'director_etapa'])),
  ('all_est',       pg_temp.huella_estructura('public.dream_team_estructura_gdv()'));
SELECT pg_temp.assert_eq('e: DG_ALL reads the same lider / colider / director_etapa rows as the capability holder',
  $q$SELECT v FROM t_acc_huellas WHERE k = 'all_lid_gente'$q$,
  (SELECT v FROM t_acc_huellas WHERE k = 'mgr_lid_gente'));
SELECT pg_temp.assert_eq('e: DG_ALL reads the same tree as the capability holder',
  $q$SELECT v FROM t_acc_huellas WHERE k = 'all_est'$q$,
  (SELECT v FROM t_acc_huellas WHERE k = 'mgr_est'));
SELECT pg_temp.assert_eq('e: DG_ALL has real rows to compare (not a vacuous equality)',
  $q$SELECT (split_part(v, '/', 2)::int > 11)::text FROM t_acc_huellas WHERE k = 'all_lid_gente'$q$, 'true');
SELECT pg_temp.assert_eq('h: DG_ALL, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
RESET ROLE;

-- l. Several roles at once give the union ------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 12));
SELECT pg_temp.guardar('MULTI');
SELECT pg_temp.assert_eq('l: MULTI (director de etapa of SA and director general of SB) reads the union',
  $q$SELECT pg_temp.lideres_txt()$q$,
  pg_temp.norm('MULTI@TEAM_MULTI:director_etapa, MULTI@SB:director_general, C1@TEAM_C:director_etapa, C2@TEAM_C:director_etapa, DE_B@TEAM_DEB:director_etapa, LB1@GB1:lider, LB2@GB2:lider, LB3@GB3:lider, LB4@GB3:colider, LB5@GB4:lider, LB6@GB5:lider'));
SELECT pg_temp.assert_eq('l: MULTI reads the union of both trees',
  $q$SELECT pg_temp.estructura_txt()$q$,
  pg_temp.norm('direccion:RAIZ>-, segmento:SA>RAIZ, segmento:SB>RAIZ, directores:TEAM_MULTI>SA, directores:TEAM_C>SB, directores:TEAM_DEB>SB, grupo:GB1>TEAM_C, grupo:GB2>TEAM_C, grupo:GB3>TEAM_C, grupo:GB4>TEAM_DEB, grupo:GB5>SB'));
SELECT pg_temp.assert_eq('h: MULTI, every equipo_id of the people function is a node of the tree',
  $q$SELECT pg_temp.lideres_sin_nodo()$q$, '0');
SELECT pg_temp.assert_eq('h: MULTI, every node but the root has a visible parent',
  $q$SELECT pg_temp.nodos_sin_padre()$q$, '0');
RESET ROLE;

-- g. Nobody else reads anything ------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.id('au', 2));
SELECT pg_temp.assert_eq('g: a plain leader reads no people', $q$SELECT pg_temp.lideres_txt()$q$, '');
SELECT pg_temp.assert_eq('g: a plain leader reads no tree',   $q$SELECT pg_temp.estructura_txt()$q$, '');
SELECT pg_temp.assert_eq('g: a plain leader resolves nobody',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 2), pg_temp.id('us', 13)])$q$, '0');
SELECT pg_temp.as_persona(pg_temp.id('au', 3));
SELECT pg_temp.assert_eq('g: a plain member reads no people', $q$SELECT pg_temp.lideres_txt()$q$, '');
SELECT pg_temp.assert_eq('g: a plain member reads no tree',   $q$SELECT pg_temp.estructura_txt()$q$, '');
SELECT pg_temp.as_persona(pg_temp.id('au', 4));
SELECT pg_temp.assert_eq('g: a user with no assignment rows reads no people', $q$SELECT pg_temp.lideres_txt()$q$, '');
SELECT pg_temp.assert_eq('g: a user with no assignment rows reads no tree',   $q$SELECT pg_temp.estructura_txt()$q$, '');
SELECT pg_temp.assert_eq('g: a user with no assignment rows resolves nobody and gets no contact',
  $q$SELECT (SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 5), pg_temp.id('us', 2)]))
          + (SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 5), pg_temp.id('us', 2)]))$q$, '0');
-- No session at all (auth.uid() is NULL).
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_eq('g: no session reads no people', $q$SELECT pg_temp.lideres_txt()$q$, '');
SELECT pg_temp.assert_eq('g: no session reads no tree',   $q$SELECT pg_temp.estructura_txt()$q$, '');
RESET ROLE;

-- h. Every row a director reads is a row the capability holder reads --------------

SELECT pg_temp.assert_eq('h: the capability holder fixture read people and nodes',
  $q$SELECT ((SELECT count(*) FROM t_acc_lid WHERE persona = 'MGR') > 0
         AND (SELECT count(*) FROM t_acc_est WHERE persona = 'MGR') > 0)::text$q$, 'true');
SELECT pg_temp.assert_eq('h: directors read people rows (not a vacuous subset)',
  $q$SELECT (count(*) > 0)::text FROM t_acc_lid WHERE persona <> 'MGR'$q$, 'true');
SELECT pg_temp.assert_eq('h: every people row a director reads is a row the capability holder reads',
  $q$SELECT count(*) FROM t_acc_lid d
      WHERE d.persona <> 'MGR'
        AND NOT EXISTS (SELECT 1 FROM t_acc_lid m
                         WHERE m.persona = 'MGR' AND m.persona_id = d.persona_id AND m.equipo_id = d.equipo_id
                           AND m.rol = d.rol AND m.desde IS NOT DISTINCT FROM d.desde)$q$, '0');
SELECT pg_temp.assert_eq('h: every node a director reads is the very row the capability holder reads (id, parent, label, responsables)',
  $q$SELECT count(*) FROM t_acc_est d
      WHERE d.persona <> 'MGR'
        AND NOT EXISTS (SELECT 1 FROM t_acc_est m
                         WHERE m.persona = 'MGR' AND m.nodo_id = d.nodo_id
                           AND m.parent_id IS NOT DISTINCT FROM d.parent_id
                           AND m.tipo = d.tipo AND m.label IS NOT DISTINCT FROM d.label
                           AND m.responsables = d.responsables)$q$, '0');
SELECT pg_temp.assert_eq('e: DG_ALL reads one director_general row per segment, his own',
  $q$SELECT (SELECT count(*) FROM t_acc_lid WHERE persona = 'DG_ALL' AND rol = 'director_general')
          || '/' || (SELECT count(*) FROM t_acc_lid WHERE persona = 'DG_ALL' AND rol = 'director_general' AND persona_id <> pg_temp.id('us', 11))$q$,
  (SELECT count(*) FROM public.segmentos) || '/0');

-- k. Privileges -----------------------------------------------------------------------

SELECT pg_temp.assert_eq('k: anon cannot execute the rule function',
  $q$SELECT has_function_privilege('anon', 'public.dream_team_gdv_visibilidad()', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('k: authenticated cannot execute the rule function',
  $q$SELECT has_function_privilege('authenticated', 'public.dream_team_gdv_visibilidad()', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('k: the rule function has no PUBLIC grant',
  $q$SELECT (NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                          WHERE p.oid = 'public.dream_team_gdv_visibilidad()'::regprocedure AND a.grantee = 0))::text$q$, 'true');
SELECT pg_temp.assert_eq('k: the rule function is security definer with a pinned search_path',
  $q$SELECT (p.prosecdef AND p.provolatile = 's' AND p.proconfig::text LIKE '%search_path=public%')::text
       FROM pg_proc p WHERE p.oid = 'public.dream_team_gdv_visibilidad()'::regprocedure$q$, 'true');
SELECT pg_temp.assert_eq('k: anon cannot execute dream_team_lideres_gdv',
  $q$SELECT has_function_privilege('anon', 'public.dream_team_lideres_gdv()', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('k: authenticated can execute dream_team_lideres_gdv',
  $q$SELECT has_function_privilege('authenticated', 'public.dream_team_lideres_gdv()', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('k: service_role can execute dream_team_lideres_gdv',
  $q$SELECT has_function_privilege('service_role', 'public.dream_team_lideres_gdv()', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('k: anon cannot execute dream_team_estructura_gdv',
  $q$SELECT has_function_privilege('anon', 'public.dream_team_estructura_gdv()', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('k: authenticated can execute dream_team_estructura_gdv',
  $q$SELECT has_function_privilege('authenticated', 'public.dream_team_estructura_gdv()', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('k: service_role can execute dream_team_estructura_gdv',
  $q$SELECT has_function_privilege('service_role', 'public.dream_team_estructura_gdv()', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('k: no PUBLIC grant on the two public functions',
  $q$SELECT (NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                          WHERE p.oid IN ('public.dream_team_lideres_gdv()'::regprocedure, 'public.dream_team_estructura_gdv()'::regprocedure)
                            AND a.grantee = 0))::text$q$, 'true');
SELECT pg_temp.assert_eq('k: the two public functions stay security definer, stable, pinned search_path',
  $q$SELECT (bool_and(p.prosecdef AND p.provolatile = 's' AND p.proconfig::text LIKE '%search_path=public%'))::text
       FROM pg_proc p WHERE p.oid IN ('public.dream_team_lideres_gdv()'::regprocedure, 'public.dream_team_estructura_gdv()'::regprocedure)$q$, 'true');
SELECT pg_temp.assert_eq('k: dream_team_lideres_gdv return columns are unchanged',
  $q$SELECT pg_get_function_result('public.dream_team_lideres_gdv()'::regprocedure)$q$,
  'TABLE(persona_id uuid, equipo_id uuid, rol text, desde timestamp with time zone)');
SELECT pg_temp.assert_eq('k: dream_team_estructura_gdv return columns are unchanged',
  $q$SELECT pg_get_function_result('public.dream_team_estructura_gdv()'::regprocedure)$q$,
  'TABLE(nodo_id uuid, parent_id uuid, tipo text, label text, responsables jsonb)');
SELECT pg_temp.assert_eq('k: no capability grant was created for anybody but the fixture holder (decision D1)',
  $q$SELECT count(*) FROM public.dream_team_capability_grants
      WHERE persona_id::text LIKE 'f2000000-0000-4000-8002-%' AND persona_id <> pg_temp.id('us', 1)$q$, '0');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_acc_failures;

ROLLBACK;
