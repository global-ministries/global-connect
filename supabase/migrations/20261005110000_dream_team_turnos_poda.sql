-- T8 follow-up (odd/tasks/ninos-voluntarios-waumba.md, D12) — prune shift
-- assignments that stop fitting.
--
-- When the shifts a node serves change (rows of dream_team_equipo_turnos are
-- inserted or deleted), every assignment in dream_team_servicio_turnos of a
-- servicio in that node or its descendants is checked against the effective
-- set of the servicio's own node (dream_team_turnos_del_equipo, so a
-- descendant with its own restriction is judged by it). Assignments that no
-- longer fit are deleted. Deactivating a shift deletes its assignments.
--
-- Both trigger functions run as definer: the walk needs the whole tree
-- and the delete must reach assignments the editor cannot see. They are
-- executable by nobody but the trigger machinery.

create or replace function public.dream_team_equipo_turnos_podar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  with recursive subarbol as (
    select distinct c.equipo_id as id from cambiados c
    union
    select e.id
      from public.dream_team_equipos e
      join subarbol s on e.parent_equipo_id = s.id
  )
  delete from public.dream_team_servicio_turnos st
   using public.dream_team_servicios s, public.dream_team_turnos t
   where st.servicio_id = s.id
     and t.id = st.turno_id
     and s.equipo_id in (select id from subarbol)
     and not exists (
       select 1 from public.dream_team_turnos_del_equipo(s.equipo_id, t.campus_id) as x
        where x = st.turno_id
     );
  return null;
end;
$$;

revoke all on function public.dream_team_equipo_turnos_podar() from public;
revoke all on function public.dream_team_equipo_turnos_podar() from anon;
revoke all on function public.dream_team_equipo_turnos_podar() from authenticated;

create trigger dream_team_equipo_turnos_podar_insert
  after insert on public.dream_team_equipo_turnos
  referencing new table as cambiados
  for each statement execute function public.dream_team_equipo_turnos_podar();

create trigger dream_team_equipo_turnos_podar_delete
  after delete on public.dream_team_equipo_turnos
  referencing old table as cambiados
  for each statement execute function public.dream_team_equipo_turnos_podar();

create or replace function public.dream_team_turnos_podar_inactivo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  delete from public.dream_team_servicio_turnos where turno_id = new.id;
  return null;
end;
$$;

revoke all on function public.dream_team_turnos_podar_inactivo() from public;
revoke all on function public.dream_team_turnos_podar_inactivo() from anon;
revoke all on function public.dream_team_turnos_podar_inactivo() from authenticated;

create trigger dream_team_turnos_podar_inactivo
  after update of activo on public.dream_team_turnos
  for each row
  when (old.activo and not new.activo)
  execute function public.dream_team_turnos_podar_inactivo();
