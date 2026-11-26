-- Dream Team: a coordinator does not change the rol of a coordinator nor of a
-- director (odd/tasks/dream-team-cambiar-rol.md, T2, S6).
--
-- Why: 20261125100000 let whoever has dream_team.coordinate in the tree change
-- any rol of the equipo except their own and except assigning a director-level
-- one, so a coordinator could demote another coordinator or the director of
-- their área (L5). User, 2026-11-25 (L6): «si lo bloqueamos un coordinador no
-- puede editar rol ni de si ni de otros coordinadores ni de superiores».
--
-- What: dream_team_servicio_cambiar_rol_validar(servicio, rol) — same
-- signature, grants, SECURITY DEFINER and empty search_path — adds one rule
-- right after propio_servicio: without director authority over the equipo
-- (dream_team_autoridad_director), a servicio whose CURRENT rol has nivel
-- 'coordinador' or 'director' raises 42501 'rol_superior'. It runs before the
-- rol checks, so dream_team_servicio_roles_cambiables (which calls the
-- validator with a NULL rol) refuses to list the roles too, and
-- dream_team_servicio_cambiar_rol refuses whatever the new rol is. Every other
-- rule stays as it was (rol_direccion for assigning a director-level rol, the
-- 22023 checks, the order of propio_servicio). Directors keep full control in
-- their área. The read and the write are not redefined: they already call the
-- validator.
--
-- Blast radius: one function body. No table, grant or other function changes;
-- «Cambiar de área» is untouched (S4).
--
-- Rollback: re-run section 1 of 20261125100000_dream_team_cambiar_rol.sql
-- (the previous body of dream_team_servicio_cambiar_rol_validar). Nothing to
-- undo in data: the rule only refuses.

create or replace function public.dream_team_servicio_cambiar_rol_validar(p_servicio uuid, p_rol uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_s record;
  v_director boolean;
begin
  select u.id into v_actor from public.usuarios u where auth.uid() is not null and u.auth_id = auth.uid();
  if v_actor is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select s.persona_id, s.equipo_id, s.rol_id, s.estado into v_s
    from public.dream_team_servicios s where s.id = p_servicio;
  if not found then
    raise exception 'servicio_inexistente' using errcode = '22023';
  end if;
  if not public.dream_team_puede_solicitar_cambio_area(v_s.equipo_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  v_director := public.dream_team_autoridad_director(v_s.equipo_id);
  if not v_director and v_s.persona_id = v_actor then
    raise exception 'propio_servicio' using errcode = '42501';
  end if;
  if not v_director
     and exists (select 1 from public.dream_team_roles r
                  where r.id = v_s.rol_id and r.nivel in ('coordinador', 'director')) then
    raise exception 'rol_superior' using errcode = '42501';
  end if;
  if v_s.estado = 'retirado' then
    raise exception 'servicio_retirado' using errcode = '22023';
  end if;
  if p_rol is null then
    return;
  end if;
  if not exists (select 1 from public.dream_team_roles r
                  where r.id = p_rol and r.equipo_id = v_s.equipo_id and r.activo) then
    raise exception 'rol_invalido' using errcode = '22023';
  end if;
  if p_rol = v_s.rol_id then
    raise exception 'mismo_rol' using errcode = '22023';
  end if;
  if not v_director
     and exists (select 1 from public.dream_team_roles r where r.id = p_rol and r.nivel = 'director') then
    raise exception 'rol_direccion' using errcode = '42501';
  end if;
  if exists (select 1 from public.dream_team_servicios o
              where o.persona_id = v_s.persona_id and o.equipo_id = v_s.equipo_id
                and o.rol_id = p_rol and o.estado <> 'retirado' and o.id <> p_servicio) then
    raise exception 'rol_duplicado' using errcode = '22023';
  end if;
end;
$$;

comment on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) is
  'Raises when the caller may not change the servicio to that rol (42501 sin_autoridad / rol_direccion / '
  'propio_servicio / rol_superior, 22023 servicio_inexistente / servicio_retirado / rol_invalido / mismo_rol / '
  'rol_duplicado). Without director authority: not one''s own servicio, not a servicio whose current rol is '
  'coordinador or director, not a director-level rol. NULL rol checks only access. Internal to the cambiar-rol '
  'functions.';

revoke all on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) to service_role;
