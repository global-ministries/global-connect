-- Dream Team: only the dirección names coordinators (and directors)
-- (odd/tasks/dream-team-cambiar-rol.md, T3, S7).
--
-- Why: after 20261125110000 a coordinator could still promote a voluntario or
-- a líder of their equipo to Coordinador (only a director-level rol was
-- refused). User, 2026-11-26 (L7): «Bloquearlo: solo la dirección nombra
-- coordinadores» — «El coordinador solo puede mover entre voluntario y líder.
-- Para nombrar un coordinador hace falta la directora del área.»
--
-- What (same signatures, grants, SECURITY DEFINER and empty search_path):
--   1. dream_team_servicio_cambiar_rol_validar(servicio, rol): the body of
--      20261125110000 with one condition widened — without director authority
--      over the equipo (dream_team_autoridad_director), a NEW rol of nivel
--      'coordinador' or 'director' raises 42501 'rol_direccion' (it was
--      'director' only). Same code, same place in the order of checks.
--   2. dream_team_servicio_roles_cambiables(servicio): the body of
--      20261125100000 with `asignable` false for coordinador and director
--      roles when the caller has no director authority.
-- Directors keep full control in their área. dream_team_servicio_cambiar_rol
-- is not redefined: it already calls the validator.
--
-- Blast radius: two function bodies. No table, grant or other function
-- changes; «Cambiar de área» is untouched (S4).
--
-- Rollback: re-run 20261125110000_dream_team_cambiar_rol_superior.sql (the
-- validator) and section 2 of 20261125100000_dream_team_cambiar_rol.sql (the
-- read). Nothing to undo in data: the rule only refuses.

-- ── 1. the rules ─────────────────────────────────────────────────────

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
     and exists (select 1 from public.dream_team_roles r
                  where r.id = p_rol and r.nivel in ('coordinador', 'director')) then
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
  'coordinador or director, not a coordinador- or director-level rol. NULL rol checks only access. Internal to '
  'the cambiar-rol functions.';

revoke all on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) to service_role;

-- ── 2. the read ──────────────────────────────────────────────────────

create or replace function public.dream_team_servicio_roles_cambiables(p_servicio uuid)
returns table (
  id uuid,
  label text,
  nivel text,
  actual boolean,
  asignable boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_s record;
  v_director boolean;
begin
  perform public.dream_team_servicio_cambiar_rol_validar(p_servicio, null);
  select s.persona_id, s.equipo_id, s.rol_id into v_s from public.dream_team_servicios s where s.id = p_servicio;
  v_director := public.dream_team_autoridad_director(v_s.equipo_id);

  return query
  select r.id, r.label, r.nivel,
         r.id = v_s.rol_id,
         r.id <> v_s.rol_id
           and r.activo
           and (v_director or r.nivel not in ('coordinador', 'director'))
           and not exists (select 1 from public.dream_team_servicios o
                            where o.persona_id = v_s.persona_id and o.equipo_id = v_s.equipo_id
                              and o.rol_id = r.id and o.estado <> 'retirado' and o.id <> p_servicio)
    from public.dream_team_roles r
   where r.equipo_id = v_s.equipo_id and (r.activo or r.id = v_s.rol_id)
   order by r.label, r.id;
end;
$$;

comment on function public.dream_team_servicio_roles_cambiables(uuid) is
  'The roles of the «Cambiar rol» dialog for a servicio: the active roles of its equipo plus the current '
  'one, with actual and asignable (without director authority, coordinador and director roles are not '
  'asignable). Same access as dream_team_servicio_cambiar_rol.';

revoke all on function public.dream_team_servicio_roles_cambiables(uuid) from public, anon;
grant execute on function public.dream_team_servicio_roles_cambiables(uuid) to authenticated;
