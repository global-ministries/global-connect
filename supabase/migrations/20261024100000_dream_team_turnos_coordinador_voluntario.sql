-- The Atención al Voluntario coordinator assigns service shifts in their area
-- (odd/tasks/dream-team-turnos-coordinador.md, S1–S3).
--
-- Why: the coordinator already keeps every volunteer's data up to date (they
-- register people and edit fichas through dream_team_equipos_registrables),
-- but only directors could write dream_team_servicio_turnos, so a Sunday
-- roster depended on the director alone (Waumba had 0 assignments).
--
-- What: the insert, update and delete policies of dream_team_servicio_turnos
-- keep every current branch and add one: the servicio is not 'retirado' and
-- its equipo is in dream_team_equipos_registrables() (the coordinator's area
-- subtree; admin, pastor and org.manage everything), the same reach as
-- dream_team_puede_editar_ficha. The select policy, the grants and the
-- trigger that checks campus and served shifts are unchanged.
--
-- Rollback: re-create the three policies without the last OR branch (the
-- bodies in 20261005100000_dream_team_turnos.sql and, for update,
-- 20261008130000_dream_team_turnos_frecuencia.sql).

drop policy if exists dream_team_servicio_turnos_insert on public.dream_team_servicio_turnos;
create policy dream_team_servicio_turnos_insert on public.dream_team_servicio_turnos
  for insert to authenticated
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
          or (s.estado <> 'retirado'
              and s.equipo_id in (select r.equipo_id from public.dream_team_equipos_registrables() r))
        )
    )
  );

drop policy if exists dream_team_servicio_turnos_update on public.dream_team_servicio_turnos;
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
          or (s.estado <> 'retirado'
              and s.equipo_id in (select r.equipo_id from public.dream_team_equipos_registrables() r))
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
          or (s.estado <> 'retirado'
              and s.equipo_id in (select r.equipo_id from public.dream_team_equipos_registrables() r))
        )
    )
  );

drop policy if exists dream_team_servicio_turnos_delete on public.dream_team_servicio_turnos;
create policy dream_team_servicio_turnos_delete on public.dream_team_servicio_turnos
  for delete to authenticated
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
          or (s.estado <> 'retirado'
              and s.equipo_id in (select r.equipo_id from public.dream_team_equipos_registrables() r))
        )
    )
  );
