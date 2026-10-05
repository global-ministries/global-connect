-- noqa: insert-into
-- Dream Team: the ten sub-areas of Waumba Land and their roles
-- (T2 of odd/tasks/ninos-voluntarios-waumba.md, decision D1).
--
-- What:
--   Dirección de Experiencia › Dirección de Niños › Waumba Land
--     ├ Anfitriones · Líderes · Maternal · Waumbaland Plus · Producción
--     ├ Recursos · Montaje · Desmontaje · Atención al Voluntario
--     └ Social Media
--   Each sub-area is an active team with experiencia 'ninos' and the roles
--   coordinador, entrenador and voluntario. Waumba Land itself gains
--   entrenador, for the general trainer, and keeps coordinador, lider and
--   voluntario.
--
-- Why: the Waumba Land volunteer sheet groups its people in these ten
-- sections, and a servicio hangs from the operational node where the person
-- serves (seed 20260910130000_dream_team_seed_organigrama.sql). The sub-areas
-- are work teams. Classrooms are physical spaces and are not modeled here.
--
-- How:
--   - Waumba Land is resolved by its full path from the root, never by uuid:
--     the ids differ between staging and production. If the path does not
--     resolve to exactly one team, the migration raises and writes nothing.
--     dream_team_equipos_parent_label_uniq already rules out more than one, so
--     zero means the tree is not the one this seed expects.
--   - Labels follow the organigrama seed: team labels in proper case with
--     accents, role labels in lowercase without accents. The UI renders the
--     visible role name.
--   - Idempotent: every insert is guarded by WHERE NOT EXISTS on the keys of
--     dream_team_equipos_parent_label_uniq and dream_team_roles_equipo_label_uniq.
--   - Additive only: nothing is updated or deleted. A sub-area that already
--     exists with one of these labels keeps its activo flag.
--
-- Blast radius: Waumba Land gains one role and ten children. Upstreet and every
-- other node are untouched. No servicio, grant or requisito is created; the
-- volunteers are loaded by T4.
--
-- Rollback, only while no servicio points at the new rows
-- (dream_team_servicios restricts deletes of equipos and roles). The roles of
-- the sub-areas go with them through ON DELETE CASCADE:
--   delete from public.dream_team_roles
--    where equipo_id = '<Waumba Land id>' and label = 'entrenador';
--   delete from public.dream_team_equipos
--    where parent_equipo_id = '<Waumba Land id>'
--      and label in ('Anfitriones', 'Líderes', 'Maternal', 'Waumbaland Plus',
--                    'Producción', 'Recursos', 'Montaje', 'Desmontaje',
--                    'Atención al Voluntario', 'Social Media');

do $$
declare
  v_subareas constant text[] := array[
    'Anfitriones',
    'Líderes',
    'Maternal',
    'Waumbaland Plus',
    'Producción',
    'Recursos',
    'Montaje',
    'Desmontaje',
    'Atención al Voluntario',
    'Social Media'
  ];
  v_matches int;
  v_waumba uuid;
begin
  select count(*), (array_agg(w.id))[1]
    into v_matches, v_waumba
  from public.dream_team_equipos d
  join public.dream_team_equipos n
    on n.parent_equipo_id = d.id and n.label = 'Dirección de Niños'
  join public.dream_team_equipos w
    on w.parent_equipo_id = n.id and w.label = 'Waumba Land'
  where d.parent_equipo_id is null
    and d.label = 'Dirección de Experiencia';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Niños › Waumba Land resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  -- ── Sub-areas ──────────────────────────────────────────────────────────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select 'ninos', v_waumba, v.label, true
  from unnest(v_subareas) as v(label)
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v_waumba and e.label = v.label
  );

  -- ── Roles of each sub-area ─────────────────────────────────────────────
  insert into public.dream_team_roles (equipo_id, label, activo)
  select e.id, r.label, true
  from public.dream_team_equipos e
  cross join (values ('coordinador'), ('entrenador'), ('voluntario')) as r(label)
  where e.parent_equipo_id = v_waumba
    and e.label = any (v_subareas)
    and not exists (
      select 1 from public.dream_team_roles x
      where x.equipo_id = e.id and x.label = r.label
    );

  -- ── Waumba Land adds entrenador ────────────────────────────────────────
  insert into public.dream_team_roles (equipo_id, label, activo)
  select v_waumba, 'entrenador', true
  where not exists (
    select 1 from public.dream_team_roles x
    where x.equipo_id = v_waumba and x.label = 'entrenador'
  );
end
$$;
