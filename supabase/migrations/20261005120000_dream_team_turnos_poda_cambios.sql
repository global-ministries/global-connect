-- T8 follow-up (odd/tasks/ninos-voluntarios-waumba.md, D12) — prune shift
-- assignments when the servicio's node or the person's principal campus
-- changes.
--
-- An assignment in dream_team_servicio_turnos fits only while its shift is
-- active, belongs to the person's principal campus and is served by the
-- servicio's node (dream_team_turnos_del_equipo, with inheritance). Two more
-- events can break that:
--
--   a. dream_team_servicios.equipo_id changes (the servicio moves to another
--      node): the moved servicio is re-checked.
--   b. usuario_campus rows of a person are inserted, updated or deleted: every
--      servicio of that person is re-checked.
--
-- (b) is a deferred constraint trigger. Changing a principal campus takes two
-- statements (the unique index idx_unico_campus_principal allows one
-- principal per person), so judging at commit avoids wiping assignments in
-- the gap with no principal. A person left with no principal campus keeps no
-- assignment, as the validator would reject them.
--
-- Both functions run as definer: the delete must reach assignments the editor
-- cannot see. They are executable by nobody but the trigger machinery.

create or replace function public.dream_team_servicios_podar_turnos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  delete from public.dream_team_servicio_turnos st
   where st.servicio_id = new.id
     and not exists (
       select 1
         from public.usuario_campus uc
        where uc.usuario_id = new.persona_id
          and uc.es_campus_principal
          and exists (
            select 1 from public.dream_team_turnos_del_equipo(new.equipo_id, uc.campus_id) as x
             where x = st.turno_id
          )
     );
  return null;
end;
$$;

revoke all on function public.dream_team_servicios_podar_turnos() from public;
revoke all on function public.dream_team_servicios_podar_turnos() from anon;
revoke all on function public.dream_team_servicios_podar_turnos() from authenticated;

create trigger dream_team_servicios_podar_turnos
  after update of equipo_id on public.dream_team_servicios
  for each row
  when (old.equipo_id is distinct from new.equipo_id)
  execute function public.dream_team_servicios_podar_turnos();

create or replace function public.dream_team_usuario_campus_podar_turnos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_personas uuid[];
begin
  if tg_op = 'INSERT' then
    v_personas := array[new.usuario_id];
  elsif tg_op = 'DELETE' then
    v_personas := array[old.usuario_id];
  else
    v_personas := array[old.usuario_id, new.usuario_id];
  end if;

  delete from public.dream_team_servicio_turnos st
   using public.dream_team_servicios s
   where st.servicio_id = s.id
     and s.persona_id = any(v_personas)
     and not exists (
       select 1
         from public.usuario_campus uc
        where uc.usuario_id = s.persona_id
          and uc.es_campus_principal
          and exists (
            select 1 from public.dream_team_turnos_del_equipo(s.equipo_id, uc.campus_id) as x
             where x = st.turno_id
          )
     );
  return null;
end;
$$;

revoke all on function public.dream_team_usuario_campus_podar_turnos() from public;
revoke all on function public.dream_team_usuario_campus_podar_turnos() from anon;
revoke all on function public.dream_team_usuario_campus_podar_turnos() from authenticated;

create constraint trigger dream_team_usuario_campus_podar
  after insert or update of usuario_id, campus_id, es_campus_principal or delete
  on public.usuario_campus
  deferrable initially deferred
  for each row
  execute function public.dream_team_usuario_campus_podar_turnos();
