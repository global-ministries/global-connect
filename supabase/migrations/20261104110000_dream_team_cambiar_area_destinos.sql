-- Dream Team: the destinations of the "Cambiar de área" dialog
-- (odd/tasks/dream-team-cambiar-area.md, T2, S3, S5).
--
-- What: dream_team_cambiar_area_destinos(servicio) → every active equipo but
-- the servicio's current one, with its path, experiencia, whether the caller
-- directs it (dream_team_autoridad_director: true → the dialog moves directly
-- with dream_team_cambiar_area, false → it sends a request with
-- dream_team_solicitar_cambio_area) and its active roles. The caller needs
-- director authority over the current equipo, as both RPCs do; a coordinator
-- gets 42501. No personal data.
--
-- Errors: 22023 'El servicio no existe.', 42501 'No hay una persona asociada
-- a la sesión.' / 'No tienes autoridad de director sobre el área actual de
-- este servicio.' (the messages of 20261104100000).
--
-- Blast radius: one new read-only function granted to authenticated. No
-- existing object changes.
--
-- Rollback:
--   drop function if exists public.dream_team_cambiar_area_destinos(uuid);

create or replace function public.dream_team_cambiar_area_destinos(p_servicio uuid)
returns table (
  equipo_id uuid,
  ruta text,
  experiencia text,
  dirige boolean,
  roles jsonb
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_origen uuid;
begin
  if auth.uid() is null
     or not exists (select 1 from public.usuarios u where u.auth_id = auth.uid()) then
    raise exception 'No hay una persona asociada a la sesión.' using errcode = '42501';
  end if;
  select s.equipo_id into v_origen from public.dream_team_servicios s where s.id = p_servicio;
  if not found then
    raise exception 'El servicio no existe.' using errcode = '22023';
  end if;
  if not public.dream_team_autoridad_director(v_origen) then
    raise exception 'No tienes autoridad de director sobre el área actual de este servicio.' using errcode = '42501';
  end if;

  return query
  select e.id,
         public.dream_team_equipo_ruta(e.id),
         e.experiencia::text,
         public.dream_team_autoridad_director(e.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'nivel', r.nivel)
                                    order by r.label, r.id)
                     from public.dream_team_roles r
                    where r.equipo_id = e.id and r.activo), '[]'::jsonb)
    from public.dream_team_equipos e
   where e.activo and e.id <> v_origen
   order by 2;
end;
$$;

comment on function public.dream_team_cambiar_area_destinos(uuid) is
  'Destinations of the cambiar-área dialog for a servicio: every active equipo but its current one, with '
  'path, experiencia, whether the caller directs it (move directly) or not (send a request) and its active '
  'roles. The caller needs director authority over the current equipo.';

revoke all on function public.dream_team_cambiar_area_destinos(uuid) from public, anon;
grant execute on function public.dream_team_cambiar_area_destinos(uuid) to authenticated;
