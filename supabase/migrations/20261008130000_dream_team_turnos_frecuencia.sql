-- T10 (odd/tasks/ninos-voluntarios-waumba.md, D13) — service frequency.
--
-- Each shift assignment stores how often the volunteer serves in it:
--   semanal    every week (the default; every existing row stays semanal);
--   quincenal  every other week, counted from an anchor Sunday (fecha_ancla).
-- A volunteer serves on a Sunday when the whole number of weeks between it and
-- the anchor is even: dream_team_turno_sirve_en answers it, and
-- lib/platform/dream-team/frecuencia-turno.ts holds the same rule.
--
-- Changing the frequency of an existing assignment is an UPDATE limited to the
-- two new columns, allowed to whoever may insert or delete the assignment.
--
-- Rollback:
--   drop policy dream_team_servicio_turnos_update on public.dream_team_servicio_turnos;
--   revoke update on public.dream_team_servicio_turnos from authenticated;
--   drop function if exists public.dream_team_turno_sirve_en(text, date, date);
--   alter table public.dream_team_servicio_turnos
--     drop constraint dream_team_servicio_turnos_frecuencia_check,
--     drop column fecha_ancla, drop column frecuencia;

alter table public.dream_team_servicio_turnos
  add column frecuencia text not null default 'semanal',
  add column fecha_ancla date;

alter table public.dream_team_servicio_turnos
  add constraint dream_team_servicio_turnos_frecuencia_check check (
    (frecuencia = 'semanal' and fecha_ancla is null)
    or (frecuencia = 'quincenal' and fecha_ancla is not null and extract(dow from fecha_ancla) = 0)
  );

comment on column public.dream_team_servicio_turnos.frecuencia is
  'semanal (every week) or quincenal (every other week from fecha_ancla) (D13).';
comment on column public.dream_team_servicio_turnos.fecha_ancla is
  'Anchor Sunday of a quincenal assignment; null for semanal (D13).';

-- Pure date arithmetic, no table access: SECURITY INVOKER.
create or replace function public.dream_team_turno_sirve_en(p_frecuencia text, p_fecha_ancla date, p_domingo date)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_frecuencia is distinct from 'quincenal'
      or p_fecha_ancla is null
      or (floor((p_domingo - p_fecha_ancla) / 7.0)::integer % 2) = 0
$$;

comment on function public.dream_team_turno_sirve_en(text, date, date) is
  'Whether an assignment with this frequency serves on that Sunday (even weeks from the anchor) (D13).';

revoke all on function public.dream_team_turno_sirve_en(text, date, date) from public;
revoke all on function public.dream_team_turno_sirve_en(text, date, date) from anon;
grant execute on function public.dream_team_turno_sirve_en(text, date, date) to authenticated;
grant execute on function public.dream_team_turno_sirve_en(text, date, date) to service_role;

create policy dream_team_servicio_turnos_update on public.dream_team_servicio_turnos
  for update to authenticated
  using (
    exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
          or public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
          or public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

-- Only the frequency columns: an assignment never moves to another servicio or
-- shift. Supabase's default privileges gave authenticated a table-wide UPDATE;
-- it is replaced by the column grant.
revoke update on public.dream_team_servicio_turnos from authenticated;
grant update (frecuencia, fecha_ancla) on public.dream_team_servicio_turnos to authenticated;
