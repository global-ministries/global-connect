-- noqa: insert-into
-- Dream Team: the six sub-areas of Upstreet and their roles
-- (UpStreet load, follow-up of T2/T4 of odd/tasks/ninos-voluntarios-waumba.md,
-- decision D1 applied to UpStreet).
--
-- What:
--   Dirección de Experiencia › Dirección de Niños › Upstreet
--     ├ Anfitriones · Líderes · Producción · Recursos
--     └ Atención al Voluntario · Social Media
--   Each sub-area is an active team with experiencia 'ninos' and the roles
--   coordinador, entrenador and voluntario. Upstreet itself gains entrenador
--   and keeps coordinador, lider and voluntario.
--
-- Why: the UpStreet volunteer sheet groups its people in six coordination
-- sections (Voluntarios, Social Media, Líderes, Recursos, Anfitriones,
-- Producción). The labels reuse the Waumba Land sub-area names
-- (20261003161000_dream_team_waumba_subareas.sql), so "Coordinación de
-- Voluntarios" is Atención al Voluntario, as in Waumba Land.
--
-- How: the same pattern as the Waumba Land seed.
--   - Upstreet is resolved by its full path from the root, never by uuid. If
--     the path does not resolve to exactly one team, the migration raises and
--     writes nothing. The node label in the organigrama seed is 'Upstreet'.
--   - Idempotent: every insert is guarded by WHERE NOT EXISTS on the keys of
--     dream_team_equipos_parent_label_uniq and dream_team_roles_equipo_label_uniq.
--   - Additive only: nothing is updated or deleted.
--
-- Blast radius: Upstreet gains one role and six children. Waumba Land and
-- every other node are untouched. No servicio, grant or requisito is created.
--
-- Rollback, only while no servicio points at the new rows:
--   delete from public.dream_team_roles
--    where equipo_id = '<Upstreet id>' and label = 'entrenador';
--   delete from public.dream_team_equipos
--    where parent_equipo_id = '<Upstreet id>'
--      and label in ('Anfitriones', 'Líderes', 'Producción', 'Recursos',
--                    'Atención al Voluntario', 'Social Media');

do $$
declare
  v_subareas constant text[] := array[
    'Anfitriones',
    'Líderes',
    'Producción',
    'Recursos',
    'Atención al Voluntario',
    'Social Media'
  ];
  v_matches int;
  v_upstreet uuid;
begin
  select count(*), (array_agg(w.id))[1]
    into v_matches, v_upstreet
  from public.dream_team_equipos d
  join public.dream_team_equipos n
    on n.parent_equipo_id = d.id and n.label = 'Dirección de Niños'
  join public.dream_team_equipos w
    on w.parent_equipo_id = n.id and w.label = 'Upstreet'
  where d.parent_equipo_id is null
    and d.label = 'Dirección de Experiencia';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Niños › Upstreet resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  -- ── Sub-areas ──────────────────────────────────────────────────────────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select 'ninos', v_upstreet, v.label, true
  from unnest(v_subareas) as v(label)
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v_upstreet and e.label = v.label
  );

  -- ── Roles of each sub-area ─────────────────────────────────────────────
  insert into public.dream_team_roles (equipo_id, label, activo)
  select e.id, r.label, true
  from public.dream_team_equipos e
  cross join (values ('coordinador'), ('entrenador'), ('voluntario')) as r(label)
  where e.parent_equipo_id = v_upstreet
    and e.label = any (v_subareas)
    and not exists (
      select 1 from public.dream_team_roles x
      where x.equipo_id = e.id and x.label = r.label
    );

  -- ── Upstreet adds entrenador ────────────────────────────────────────
  insert into public.dream_team_roles (equipo_id, label, activo)
  select v_upstreet, 'entrenador', true
  where not exists (
    select 1 from public.dream_team_roles x
    where x.equipo_id = v_upstreet and x.label = 'entrenador'
  );
end
$$;
