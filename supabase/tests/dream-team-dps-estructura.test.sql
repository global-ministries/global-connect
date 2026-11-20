-- DPS tree and Global Music (odd/tasks/dps-plan.md, T1, S2, S4–S7, S10–S12)
-- (migration 20261103100000_dream_team_dps_estructura.sql).
--
-- Covers, for a Dirección de Experiencia root p_root:
--   b. DPS has exactly the children Atención al Invitado, Bautizos,
--      Comunicaciones, Media, Producción Creativa, Producción Técnica and
--      Próximo Paso: no Banda Musical and no Redes Sociales any more.
--   c. Producción Técnica has exactly Atención al Voluntario, Audio,
--      Iluminación, Técnicos and Video; Video has exactly Cámaras and Mesa de
--      video; Comunicaciones has exactly Redes Sociales; Atención al Invitado
--      has exactly its eight coordinations. No Teleprompter, Sonido, Banda
--      Musical or Global Music anywhere under DPS.
--   d. Every node of the DPS subtree except Próximo Paso is active with
--      experiencia 'dps'; Global Music hangs from the root exactly once,
--      active, with experiencia 'global_music' and no children.
--   e. The 13 new nodes hold exactly coordinador (coordinador), lider (lider)
--      and voluntario (voluntario); the renamed or moved ones (Mesa de video,
--      Cámaras, Audio, Comunicaciones) hold at least those three; Global Music
--      holds at least director, coordinador, lider and voluntario, each with
--      the nivel of its label.
-- Cases:
--   a. b–e on the real tree, which fail until the migration is applied (RED)
--      and pass after it (GREEN).
--   f. Re-running the migration body changes no row of dream_team_equipos or
--      dream_team_roles.
--   g. A first run on a fresh root with the seed shape of production
--      (20260910130000 + 20260911130000) gives b–e, keeps the ids of the
--      renamed and moved nodes, and a second run changes no row.
--   h. Guards: when the old and the new name of a node both exist, or DPS
--      does not resolve, the body raises and writes nothing.
-- f–h check the body itself. The body is a verbatim copy of the migration's
-- DO block, kept in pg_temp.migration_body().
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. The only
-- fixtures are the fresh tree of g and h, under this file's own
-- d1000000-... namespace; the real Dirección de Experiencia steps aside by
-- label only inside the transaction. The MCP connection is `postgres`, so
-- every statement here runs as the table owner; no case depends on RLS. The
-- last statement is a SELECT of the failing cases (0 failing cases = all ok),
-- because the MCP tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dps_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dps_snapshots (phase text, slice text, n bigint, h text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dps_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Verbatim copy of the DO block of
-- supabase/migrations/20261103100000_dream_team_dps_estructura.sql.
CREATE OR REPLACE FUNCTION pg_temp.migration_body()
RETURNS text LANGUAGE sql IMMUTABLE AS $body$
SELECT $mig$
do $$
declare
  v_tecnica_nuevas constant text[] := array['Video', 'Iluminación', 'Técnicos', 'Atención al Voluntario'];
  v_invitado_nuevas constant text[] := array[
    'Anfitriones de bienvenida',
    'Anfitriones de salón',
    'Información y guía',
    'Brigada de emergencia',
    'Estacionamiento y seguridad',
    'Logística',
    'Cena del Señor',
    'Atención al Voluntario'
  ];
  v_matches int;
  v_experiencia uuid;
  v_dps uuid;
  v_tecnica uuid;
  v_invitado uuid;
  v_video uuid;
  v_comunicaciones uuid;
  v_global_music uuid;
  v_nuevas uuid[] := '{}';
begin
  -- ── Resolve the fixed nodes by path ────────────────────────────────────
  select count(*), (array_agg(d.id))[1]
    into v_matches, v_experiencia
  from public.dream_team_equipos d
  where d.parent_equipo_id is null
    and d.label = 'Dirección de Experiencia';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia resolves to % teams, expected exactly 1', v_matches;
  end if;

  select count(*), (array_agg(n.id))[1]
    into v_matches, v_dps
  from public.dream_team_equipos n
  where n.parent_equipo_id = v_experiencia and n.label = 'DPS';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › DPS resolves to % teams, expected exactly 1', v_matches;
  end if;

  select count(*), (array_agg(n.id))[1]
    into v_matches, v_tecnica
  from public.dream_team_equipos n
  where n.parent_equipo_id = v_dps and n.label = 'Producción Técnica';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › DPS › Producción Técnica resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  select count(*), (array_agg(n.id))[1]
    into v_matches, v_invitado
  from public.dream_team_equipos n
  where n.parent_equipo_id = v_dps and n.label = 'Atención al Invitado';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › DPS › Atención al Invitado resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  -- ── Old and new name both present: refuse to guess ─────────────────────
  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id = v_tecnica and e.label = 'Sonido')
     and exists (select 1 from public.dream_team_equipos e
                  where e.parent_equipo_id = v_tecnica and e.label = 'Audio') then
    raise exception 'Producción Técnica has both Sonido and Audio, expected only one';
  end if;

  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id = v_dps and e.label = 'Redes Sociales')
     and exists (select 1 from public.dream_team_equipos e
                  where e.parent_equipo_id = v_dps and e.label = 'Comunicaciones') then
    raise exception 'DPS has both Redes Sociales and Comunicaciones, expected only one';
  end if;

  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id = v_dps and e.label = 'Banda Musical')
     and exists (select 1 from public.dream_team_equipos e
                  where e.parent_equipo_id = v_experiencia and e.label = 'Global Music') then
    raise exception 'DPS has Banda Musical and Dirección de Experiencia has Global Music, expected only one';
  end if;

  -- ── Producción Técnica: new sub-areas ──────────────────────────────────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select 'dps', v_tecnica, v.label, true
  from unnest(v_tecnica_nuevas) as v(label)
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v_tecnica and e.label = v.label
  );

  select e.id
    into v_video
  from public.dream_team_equipos e
  where e.parent_equipo_id = v_tecnica and e.label = 'Video';

  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id = v_tecnica and e.label = 'Teleprompter')
     and exists (select 1 from public.dream_team_equipos e
                  where e.parent_equipo_id = v_video and e.label = 'Mesa de video') then
    raise exception 'Producción Técnica has Teleprompter and Video has Mesa de video, expected only one';
  end if;

  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id = v_tecnica and e.label = 'Cámaras')
     and exists (select 1 from public.dream_team_equipos e
                  where e.parent_equipo_id = v_video and e.label = 'Cámaras') then
    raise exception 'Producción Técnica and Video both have Cámaras, expected only one';
  end if;

  -- ── Renames and moves (the id stays) ───────────────────────────────────
  update public.dream_team_equipos
     set label = 'Mesa de video', parent_equipo_id = v_video, updated_at = now()
   where parent_equipo_id = v_tecnica and label = 'Teleprompter';

  update public.dream_team_equipos
     set parent_equipo_id = v_video, updated_at = now()
   where parent_equipo_id = v_tecnica and label = 'Cámaras';

  update public.dream_team_equipos
     set label = 'Audio', updated_at = now()
   where parent_equipo_id = v_tecnica and label = 'Sonido';

  update public.dream_team_equipos
     set label = 'Comunicaciones', updated_at = now()
   where parent_equipo_id = v_dps and label = 'Redes Sociales';

  update public.dream_team_equipos
     set label = 'Global Music', parent_equipo_id = v_experiencia, updated_at = now()
   where parent_equipo_id = v_dps and label = 'Banda Musical';

  -- ── Nodes of the target tree that did not exist under the old name ─────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select v.experiencia, v.parent_id, v.label, true
  from (values
    ('dps',          v_video,       'Mesa de video'),
    ('dps',          v_video,       'Cámaras'),
    ('dps',          v_tecnica,     'Audio'),
    ('dps',          v_dps,         'Comunicaciones'),
    ('global_music', v_experiencia, 'Global Music')
  ) as v(experiencia, parent_id, label)
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v.parent_id and e.label = v.label
  );

  select e.id
    into v_comunicaciones
  from public.dream_team_equipos e
  where e.parent_equipo_id = v_dps and e.label = 'Comunicaciones';

  select e.id
    into v_global_music
  from public.dream_team_equipos e
  where e.parent_equipo_id = v_experiencia and e.label = 'Global Music';

  -- Global Music and anything under it belong to its own experiencia.
  update public.dream_team_equipos e
     set experiencia = 'global_music', updated_at = now()
   where e.experiencia <> 'global_music'
     and e.id in (
       with recursive s as (
         select v_global_music as id
         union all
         select h.id from public.dream_team_equipos h join s on h.parent_equipo_id = s.id
       )
       select id from s
     );

  -- ── Comunicaciones › Redes Sociales, Atención al Invitado coordinations ─
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select 'dps', v.parent_id, v.label, true
  from (
    select v_comunicaciones as parent_id, 'Redes Sociales'::text as label
    union all
    select v_invitado, x.label from unnest(v_invitado_nuevas) as x(label)
  ) as v
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v.parent_id and e.label = v.label
  );

  -- ── Roles, with an explicit nivel ──────────────────────────────────────
  -- Every node the target tree names under DPS holds coordinador, lider and
  -- voluntario (the renamed and moved ones already do; the guard skips them).
  select array_agg(e.id)
    into v_nuevas
  from public.dream_team_equipos e
  where (e.parent_equipo_id = v_tecnica and e.label in ('Video', 'Iluminación', 'Técnicos', 'Atención al Voluntario', 'Audio'))
     or (e.parent_equipo_id = v_video and e.label in ('Mesa de video', 'Cámaras'))
     or (e.parent_equipo_id = v_dps and e.label = 'Comunicaciones')
     or (e.parent_equipo_id = v_comunicaciones and e.label = 'Redes Sociales')
     or (e.parent_equipo_id = v_invitado and e.label = any (v_invitado_nuevas));

  insert into public.dream_team_roles (equipo_id, label, nivel, activo)
  select r.equipo_id, r.label, r.nivel, true
  from (
    select n.id as equipo_id, v.label, v.nivel
    from unnest(v_nuevas) as n(id)
    cross join (values
      ('coordinador', 'coordinador'),
      ('lider',       'lider'),
      ('voluntario',  'voluntario')
    ) as v(label, nivel)
    union all
    select v_global_music, v.label, v.nivel
    from (values
      ('director',    'director'),
      ('coordinador', 'coordinador'),
      ('lider',       'lider'),
      ('voluntario',  'voluntario')
    ) as v(label, nivel)
  ) as r
  where not exists (
    select 1 from public.dream_team_roles x
    where x.equipo_id = r.equipo_id and x.label = r.label
  );
end
$$;
$mig$
$body$;

-- Runs the body and records a failure if it raises.
CREATE OR REPLACE FUNCTION pg_temp.run_body(p_case text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE pg_temp.migration_body();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'raised ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Runs the body and records a failure unless it raises with a message
-- containing p_message. A raise rolls back everything the body wrote.
CREATE OR REPLACE FUNCTION pg_temp.assert_body_raises(p_case text, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE pg_temp.migration_body();
  PERFORM pg_temp.fail(p_case, 'expected an error containing "' || p_message || '", got none');
EXCEPTION
  WHEN OTHERS THEN
    IF position(p_message IN SQLERRM) = 0 THEN
      PERFORM pg_temp.fail(p_case, 'expected an error containing "' || p_message || '", got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- The root Dirección de Experiencia, resolved exactly as the migration does.
CREATE OR REPLACE FUNCTION pg_temp.experiencia_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT d.id FROM public.dream_team_equipos d
   WHERE d.parent_equipo_id IS NULL AND d.label = 'Dirección de Experiencia';
$$;

CREATE OR REPLACE FUNCTION pg_temp.child_id(p_parent uuid, p_label text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT e.id FROM public.dream_team_equipos e
   WHERE e.parent_equipo_id = p_parent AND e.label = p_label;
$$;

CREATE OR REPLACE FUNCTION pg_temp.subtree(p_root uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  WITH RECURSIVE s AS (
    SELECT e.id FROM public.dream_team_equipos e WHERE e.id = p_root
    UNION ALL
    SELECT e.id FROM public.dream_team_equipos e JOIN s ON e.parent_equipo_id = s.id
  )
  SELECT id FROM s;
$$;

-- The children of one equipo, sorted bytewise, comma-separated.
CREATE OR REPLACE FUNCTION pg_temp.children_of(p_parent uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(e.label, ',' ORDER BY e.label COLLATE "C")
    FROM public.dream_team_equipos e WHERE e.parent_equipo_id = p_parent;
$$;

-- The roles of one equipo as 'label:nivel', sorted, inactive ones marked.
CREATE OR REPLACE FUNCTION pg_temp.roles_of(p_equipo uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(r.label || ':' || r.nivel || CASE WHEN r.activo THEN '' ELSE ' (inactive)' END,
                    ',' ORDER BY r.label COLLATE "C")
    FROM public.dream_team_roles r
   WHERE r.equipo_id = p_equipo;
$$;

-- The labels of p_labels that p_equipo does NOT hold as an active rol with the
-- nivel of the same name ('' when it holds them all).
CREATE OR REPLACE FUNCTION pg_temp.missing_roles(p_equipo uuid, p_labels text[])
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(l.label, ',' ORDER BY l.label COLLATE "C"), '')
    FROM unnest(p_labels) AS l(label)
   WHERE NOT EXISTS (SELECT 1 FROM public.dream_team_roles r
                      WHERE r.equipo_id = p_equipo AND r.label = l.label
                        AND r.nivel = l.label AND r.activo);
$$;

-- Count and a hash of the full rows of equipos and roles.
CREATE OR REPLACE FUNCTION pg_temp.snapshot()
RETURNS TABLE (slice text, n bigint, h text) LANGUAGE sql STABLE AS $$
  SELECT 'equipos', count(*), md5(string_agg(e::text, '|' ORDER BY e.id)) FROM public.dream_team_equipos e
  UNION ALL
  SELECT 'roles', count(*), md5(string_agg(r::text, '|' ORDER BY r.id)) FROM public.dream_team_roles r;
$$;

CREATE OR REPLACE FUNCTION pg_temp.take_snapshot(p_phase text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dps_snapshots (phase, slice, n, h)
  SELECT p_phase, s.slice, s.n, s.h FROM pg_temp.snapshot() s;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_unchanged(p_case text, p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT b.slice, b.n AS n_before, a.n AS n_after, b.h = a.h AS same_rows
      FROM t_dps_snapshots b
      JOIN pg_temp.snapshot() a ON a.slice = b.slice
     WHERE b.phase = p_phase
  LOOP
    IF r.n_before <> r.n_after THEN
      PERFORM pg_temp.fail(p_case, r.slice || ' count went from ' || r.n_before || ' to ' || r.n_after);
    ELSIF NOT r.same_rows THEN
      PERFORM pg_temp.fail(p_case, r.slice || ' rows changed with the same count ' || r.n_after);
    END IF;
  END LOOP;
END;
$$;

-- Cases b–e for the Dirección de Experiencia node p_root.
CREATE OR REPLACE FUNCTION pg_temp.assert_tree(p_prefix text, p_root uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_dps uuid := pg_temp.child_id(p_root, 'DPS');
  v_tecnica uuid := pg_temp.child_id(pg_temp.child_id(p_root, 'DPS'), 'Producción Técnica');
  v_video uuid := pg_temp.child_id(pg_temp.child_id(pg_temp.child_id(p_root, 'DPS'), 'Producción Técnica'), 'Video');
  v_comunicaciones uuid := pg_temp.child_id(pg_temp.child_id(p_root, 'DPS'), 'Comunicaciones');
  v_invitado uuid := pg_temp.child_id(pg_temp.child_id(p_root, 'DPS'), 'Atención al Invitado');
  v_global_music uuid := pg_temp.child_id(p_root, 'Global Music');
  v_tres constant text := 'coordinador:coordinador,lider:lider,voluntario:voluntario';
BEGIN
  PERFORM pg_temp.assert_eq(p_prefix || 'b: DPS children',
    format($q$SELECT pg_temp.children_of(%L)$q$, v_dps),
    'Atención al Invitado,Bautizos,Comunicaciones,Media,Producción Creativa,Producción Técnica,Próximo Paso');

  PERFORM pg_temp.assert_eq(p_prefix || 'c: Producción Técnica children',
    format($q$SELECT pg_temp.children_of(%L)$q$, v_tecnica),
    'Atención al Voluntario,Audio,Iluminación,Técnicos,Video');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: Video children',
    format($q$SELECT pg_temp.children_of(%L)$q$, v_video),
    'Cámaras,Mesa de video');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: Comunicaciones children',
    format($q$SELECT pg_temp.children_of(%L)$q$, v_comunicaciones),
    'Redes Sociales');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: Atención al Invitado children',
    format($q$SELECT pg_temp.children_of(%L)$q$, v_invitado),
    'Anfitriones de bienvenida,Anfitriones de salón,Atención al Voluntario,Brigada de emergencia,'
    || 'Cena del Señor,Estacionamiento y seguridad,Información y guía,Logística');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: no old name and no Global Music left under DPS',
    format($q$SELECT count(*) FROM public.dream_team_equipos e
               WHERE e.id IN (SELECT pg_temp.subtree(%L))
                 AND e.label IN ('Teleprompter', 'Sonido', 'Banda Musical', 'Global Music')$q$, v_dps),
    '0');

  PERFORM pg_temp.assert_eq(p_prefix || 'd: DPS subtree (but Próximo Paso) is active with experiencia dps',
    format($q$SELECT coalesce(string_agg(e.label || '=' || e.experiencia || CASE WHEN e.activo THEN '' ELSE ' (inactive)' END,
                                         ',' ORDER BY e.label COLLATE "C"), '')
                FROM public.dream_team_equipos e
               WHERE e.id IN (SELECT pg_temp.subtree(%L))
                 AND e.id NOT IN (SELECT pg_temp.subtree(pg_temp.child_id(%L, 'Próximo Paso')))
                 AND (e.experiencia <> 'dps' OR NOT e.activo)$q$, v_dps, v_dps),
    '');
  PERFORM pg_temp.assert_eq(p_prefix || 'd: Global Music hangs from the root once, active, global_music, no children',
    format($q$SELECT count(*) || ' ' || string_agg(e.experiencia || CASE WHEN e.activo THEN '' ELSE ' (inactive)' END, ',')
                     || ' ' || coalesce(pg_temp.children_of(%L), '<none>')
                FROM public.dream_team_equipos e
               WHERE e.parent_equipo_id = %L AND e.label = 'Global Music'$q$, v_global_music, p_root),
    '1 global_music <none>');

  PERFORM pg_temp.assert_eq(p_prefix || 'e: the 13 new nodes hold exactly coordinador, lider, voluntario',
    format($q$SELECT coalesce(string_agg(e.label || '=' || coalesce(pg_temp.roles_of(e.id), '<none>'), ' ; '
                                         ORDER BY e.label COLLATE "C"), '')
                FROM public.dream_team_equipos e
               WHERE ((e.parent_equipo_id = %L AND e.label IN ('Video', 'Iluminación', 'Técnicos', 'Atención al Voluntario'))
                   OR (e.parent_equipo_id = %L AND e.label = 'Redes Sociales')
                   OR e.parent_equipo_id = %L)
                 AND pg_temp.roles_of(e.id) IS DISTINCT FROM %L$q$, v_tecnica, v_comunicaciones, v_invitado, v_tres),
    '');
  PERFORM pg_temp.assert_eq(p_prefix || 'e: the 13 new nodes are there',
    format($q$SELECT count(*) FROM public.dream_team_equipos e
               WHERE (e.parent_equipo_id = %L AND e.label IN ('Video', 'Iluminación', 'Técnicos', 'Atención al Voluntario'))
                  OR (e.parent_equipo_id = %L AND e.label = 'Redes Sociales')
                  OR e.parent_equipo_id = %L$q$, v_tecnica, v_comunicaciones, v_invitado),
    '13');
  PERFORM pg_temp.assert_eq(p_prefix || 'e: Mesa de video, Cámaras, Audio and Comunicaciones hold coordinador, lider, voluntario',
    format($q$SELECT 'Mesa de video=' || pg_temp.missing_roles(pg_temp.child_id(%L, 'Mesa de video'), ARRAY['coordinador', 'lider', 'voluntario'])
                  || ' Cámaras=' || pg_temp.missing_roles(pg_temp.child_id(%L, 'Cámaras'), ARRAY['coordinador', 'lider', 'voluntario'])
                  || ' Audio=' || pg_temp.missing_roles(pg_temp.child_id(%L, 'Audio'), ARRAY['coordinador', 'lider', 'voluntario'])
                  || ' Comunicaciones=' || pg_temp.missing_roles(%L, ARRAY['coordinador', 'lider', 'voluntario'])$q$,
           v_video, v_video, v_tecnica, v_comunicaciones),
    'Mesa de video= Cámaras= Audio= Comunicaciones=');
  PERFORM pg_temp.assert_eq(p_prefix || 'e: Global Music holds director, coordinador, lider, voluntario',
    format($q$SELECT pg_temp.missing_roles(%L, ARRAY['director', 'coordinador', 'lider', 'voluntario'])$q$, v_global_music),
    '');
END;
$$;

-- ── a. The real tree after the migration ───────────────────────────────

SELECT pg_temp.assert_eq('a: Dirección de Experiencia resolves to exactly one team',
  $q$SELECT count(*) FROM public.dream_team_equipos d
      WHERE d.parent_equipo_id IS NULL AND d.label = 'Dirección de Experiencia'$q$,
  '1');

SELECT pg_temp.assert_tree('a ', pg_temp.experiencia_id());

-- ── f. Re-running the body changes no row ──────────────────────────────

SELECT pg_temp.take_snapshot('rerun');
SELECT pg_temp.run_body('f: re-running the migration body');
SELECT pg_temp.assert_unchanged('f: re-run is a no-op', 'rerun');

-- ── g. A first run on a fresh root with the production seed shape ──────
-- The real Dirección de Experiencia steps out of the path and a fixture with
-- the shape the seed and 20260911130000 left in production takes its place.

UPDATE public.dream_team_equipos
   SET label = 'ZZ Dirección de Experiencia moved aside by the test'
 WHERE id = pg_temp.experiencia_id();

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'experiencia',          NULL,                                   'Dirección de Experiencia', true),
  ('d1000000-0000-4000-8000-000000000002', 'dps',                  'd1000000-0000-4000-8000-000000000001', 'DPS',                      true),
  ('d1000000-0000-4000-8000-000000000003', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Producción Técnica',       true),
  ('d1000000-0000-4000-8000-000000000004', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Media',                    true),
  ('d1000000-0000-4000-8000-000000000005', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Redes Sociales',           true),
  ('d1000000-0000-4000-8000-000000000006', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Producción Creativa',      true),
  ('d1000000-0000-4000-8000-000000000007', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Atención al Invitado',     true),
  ('d1000000-0000-4000-8000-000000000008', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Bautizos',                 true),
  ('d1000000-0000-4000-8000-000000000009', 'dps',                  'd1000000-0000-4000-8000-000000000002', 'Banda Musical',            true),
  ('d1000000-0000-4000-8000-00000000000a', 'talleres_crecimiento', 'd1000000-0000-4000-8000-000000000002', 'Próximo Paso',             true),
  ('d1000000-0000-4000-8000-00000000000b', 'dps',                  'd1000000-0000-4000-8000-000000000003', 'Cámaras',                  true),
  ('d1000000-0000-4000-8000-00000000000c', 'dps',                  'd1000000-0000-4000-8000-000000000003', 'Sonido',                   true),
  ('d1000000-0000-4000-8000-00000000000d', 'dps',                  'd1000000-0000-4000-8000-000000000003', 'Teleprompter',             true);

INSERT INTO public.dream_team_roles (equipo_id, label, nivel, activo)
SELECT e.id, r.label, r.label, true
  FROM public.dream_team_equipos e
  CROSS JOIN LATERAL unnest(CASE
    WHEN e.id IN ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002')
      THEN ARRAY['director', 'coordinador']
    WHEN e.id = 'd1000000-0000-4000-8000-00000000000a'
      THEN ARRAY['director', 'coordinador', 'lider', 'voluntario']
    ELSE ARRAY['coordinador', 'lider', 'voluntario']
  END) AS r(label)
 WHERE e.id::text LIKE 'd1000000-%';

SELECT pg_temp.assert_eq('g: the path now resolves to the fresh fixture',
  $q$SELECT pg_temp.experiencia_id()::text$q$,
  'd1000000-0000-4000-8000-000000000001');

SELECT pg_temp.run_body('g: first run of the migration body');

SELECT pg_temp.assert_tree('g ', 'd1000000-0000-4000-8000-000000000001');

SELECT pg_temp.assert_eq('g: renamed and moved nodes keep their ids',
  $q$SELECT string_agg(e.id::text || '=' || p.label || '/' || e.label, ' ' ORDER BY e.id)
       FROM public.dream_team_equipos e
       JOIN public.dream_team_equipos p ON p.id = e.parent_equipo_id
      WHERE e.id IN ('d1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000009',
                     'd1000000-0000-4000-8000-00000000000b', 'd1000000-0000-4000-8000-00000000000c',
                     'd1000000-0000-4000-8000-00000000000d')$q$,
  'd1000000-0000-4000-8000-000000000005=DPS/Comunicaciones'
  || ' d1000000-0000-4000-8000-000000000009=Dirección de Experiencia/Global Music'
  || ' d1000000-0000-4000-8000-00000000000b=Video/Cámaras'
  || ' d1000000-0000-4000-8000-00000000000c=Producción Técnica/Audio'
  || ' d1000000-0000-4000-8000-00000000000d=Video/Mesa de video');

SELECT pg_temp.assert_eq('g: Global Music keeps its roles and gains director, nothing else',
  $q$SELECT pg_temp.roles_of('d1000000-0000-4000-8000-000000000009')$q$,
  'coordinador:coordinador,director:director,lider:lider,voluntario:voluntario');

SELECT pg_temp.assert_eq('g: DPS, Media, Producción Creativa, Bautizos and Próximo Paso are untouched',
  $q$SELECT string_agg(e.label || '=' || e.experiencia || '/' || pg_temp.roles_of(e.id), ' ' ORDER BY e.id)
       FROM public.dream_team_equipos e
      WHERE e.id IN ('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004',
                     'd1000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000008',
                     'd1000000-0000-4000-8000-00000000000a')$q$,
  'DPS=dps/coordinador:coordinador,director:director'
  || ' Media=dps/coordinador:coordinador,lider:lider,voluntario:voluntario'
  || ' Producción Creativa=dps/coordinador:coordinador,lider:lider,voluntario:voluntario'
  || ' Bautizos=dps/coordinador:coordinador,lider:lider,voluntario:voluntario'
  || ' Próximo Paso=talleres_crecimiento/coordinador:coordinador,director:director,lider:lider,voluntario:voluntario');

SELECT pg_temp.take_snapshot('second run');
SELECT pg_temp.run_body('g: second run of the migration body');
SELECT pg_temp.assert_unchanged('g: a second run is a no-op', 'second run');

-- ── h. Guards ──────────────────────────────────────────────────────────

SELECT pg_temp.take_snapshot('guards');

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('d1000000-0000-4000-8000-0000000000f1', 'dps', 'd1000000-0000-4000-8000-000000000003', 'Sonido', true);
SELECT pg_temp.take_snapshot('guard sonido');
SELECT pg_temp.assert_body_raises('h: Sonido and Audio both under Producción Técnica', 'both Sonido and Audio');
SELECT pg_temp.assert_unchanged('h: the Sonido/Audio guard writes nothing', 'guard sonido');
DELETE FROM public.dream_team_equipos WHERE id = 'd1000000-0000-4000-8000-0000000000f1';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('d1000000-0000-4000-8000-0000000000f2', 'dps', 'd1000000-0000-4000-8000-000000000002', 'Banda Musical', true);
SELECT pg_temp.take_snapshot('guard banda');
SELECT pg_temp.assert_body_raises('h: Banda Musical under DPS and Global Music under the root', 'Banda Musical');
SELECT pg_temp.assert_unchanged('h: the Banda Musical/Global Music guard writes nothing', 'guard banda');
DELETE FROM public.dream_team_equipos WHERE id = 'd1000000-0000-4000-8000-0000000000f2';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('d1000000-0000-4000-8000-0000000000f3', 'dps', 'd1000000-0000-4000-8000-000000000003', 'Teleprompter', true);
SELECT pg_temp.take_snapshot('guard teleprompter');
SELECT pg_temp.assert_body_raises('h: Teleprompter under Producción Técnica and Mesa de video under Video', 'Teleprompter');
SELECT pg_temp.assert_unchanged('h: the Teleprompter/Mesa de video guard writes nothing', 'guard teleprompter');
DELETE FROM public.dream_team_equipos WHERE id = 'd1000000-0000-4000-8000-0000000000f3';

UPDATE public.dream_team_equipos SET label = 'ZZ DPS moved aside by the test'
 WHERE id = 'd1000000-0000-4000-8000-000000000002';
SELECT pg_temp.take_snapshot('guard dps');
SELECT pg_temp.assert_body_raises('h: DPS does not resolve', 'DPS resolves to 0 teams');
SELECT pg_temp.assert_unchanged('h: the missing-DPS guard writes nothing', 'guard dps');
UPDATE public.dream_team_equipos SET label = 'DPS'
 WHERE id = 'd1000000-0000-4000-8000-000000000002';

SELECT pg_temp.assert_unchanged('h: the guard cases leave the fixture as the second run did', 'guards');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_dps_failures;

ROLLBACK;
