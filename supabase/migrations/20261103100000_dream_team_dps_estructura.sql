-- noqa: insert-into
-- Dream Team: the DPS tree as the directors validated it, and Global Music as
-- a direction of its own (T1 of odd/tasks/dps-plan.md, S2, S4–S7, S10–S12).
--
-- What:
--   Dirección de Experiencia
--   ├ DPS [dps]
--   │ ├ Producción Técnica
--   │ │ ├ Video                      (new)
--   │ │ │ ├ Mesa de video            (= "Teleprompter", renamed and moved)
--   │ │ │ └ Cámaras                  (moved)
--   │ │ ├ Audio                      (= "Sonido", renamed)
--   │ │ └ Iluminación · Técnicos · Atención al Voluntario   (new)
--   │ ├ Comunicaciones               (= "Redes Sociales", renamed)
--   │ │ └ Redes Sociales             (new)
--   │ ├ Atención al Invitado
--   │ │ └ Anfitriones de bienvenida · Anfitriones de salón · Información y
--   │ │   guía · Brigada de emergencia · Estacionamiento y seguridad ·
--   │ │   Logística · Cena del Señor · Atención al Voluntario   (new)
--   │ └ Producción Creativa · Media · Bautizos · Próximo Paso   (untouched)
--   └ Global Music [global_music]    (= "Banda Musical", moved out of DPS)
--
--   New equipos get the roles coordinador, lider and voluntario. Global Music
--   keeps the roles of Banda Musical (coordinador, lider, voluntario: its
--   musicians serve on the node itself, S10) and gains director.
--
-- Why: the directors' document puts Mesa de video and Cámaras under Video,
-- the technicians under Producción Técnica (S5), Cocina inside Atención al
-- Voluntario (S6, a role of the load, not a node), and takes the band out of
-- DPS as Global Music, a direction at the level of DPS, Estudiantes and Niños
-- (S2). Every rol carries its nivel explicitly
-- (20261015100000_dream_team_nivel_rol.sql).
--
-- "Atención al Voluntario" is spelled like the nodes of Waumba Land, UpStreet
-- and Estudiantes; dream_team_equipos_registrables matches it by normalized
-- label, so its coordinador registers new people into the parent area
-- (Producción Técnica, Atención al Invitado), as in those trees.
--
-- How: the pattern of 20261026130000_dream_team_estudiantes_subareas.sql.
--   - Dirección de Experiencia, DPS, Producción Técnica and Atención al
--     Invitado are resolved by their full path from the root, never by uuid.
--     If any of them does not resolve to exactly one team, the migration
--     raises before writing anything.
--   - A rename or move runs only while the old node is still where the seed
--     put it; when the old and the new node both exist, it raises instead of
--     guessing which one is real.
--   - Idempotent: every insert is guarded by WHERE NOT EXISTS on the keys of
--     dream_team_equipos_parent_label_uniq and dream_team_roles_equipo_label_uniq;
--     a second run changes no row.
--   - Renames and moves keep the id, so servicios, roles, turnos and grants
--     scoped to those equipos keep pointing at them. In production
--     (2026-11-01) none of the renamed or moved nodes has a servicio.
--
-- Blast radius: inside DPS, 3 renames, 2 moves, 13 new equipos with 39 roles;
-- Banda Musical moves under Dirección de Experiencia with experiencia
-- global_music and one more role (director). No servicio, grant, requisito or turno is
-- created or recalculated; a grant minted earlier on Banda Musical (none in
-- production) keeps its dps capability until the servicio changes state.
--
-- Rollback, only while no servicio points at the new rows (the roles of the
-- new equipos go with them, ON DELETE CASCADE):
--   update public.dream_team_equipos set label = 'Banda Musical', experiencia = 'dps',
--          parent_equipo_id = '<DPS id>' where id = '<Global Music id>';
--   delete from public.dream_team_roles where equipo_id = '<Global Music id>' and label = 'director';
--   update public.dream_team_equipos set parent_equipo_id = '<Producción Técnica id>'
--    where parent_equipo_id = '<Video id>';
--   update public.dream_team_equipos set label = 'Teleprompter' where id = '<Mesa de video id>';
--   update public.dream_team_equipos set label = 'Sonido' where id = '<Audio id>';
--   delete from public.dream_team_equipos where parent_equipo_id = '<Comunicaciones id>';
--   update public.dream_team_equipos set label = 'Redes Sociales' where id = '<Comunicaciones id>';
--   delete from public.dream_team_equipos
--    where id in ('<Video id>', '<Iluminación id>', '<Técnicos id>', '<Atención al Voluntario id>')
--       or parent_equipo_id = '<Atención al Invitado id>';

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
