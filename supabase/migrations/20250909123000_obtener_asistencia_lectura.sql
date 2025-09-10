-- Lectura segura de eventos y asistencia

create or replace function public.obtener_evento_grupo(p_auth_id uuid, p_evento_id uuid)
returns table (
  id uuid,
  grupo_id uuid,
  fecha date,
  hora text,
  tema text,
  notas text
)
language plpgsql
security definer
as $$
declare
  v_gid uuid;
  v_permitido boolean;
begin
  select grupo_id into v_gid from public.eventos_grupo where id = p_evento_id;
  if v_gid is null then return; end if;
  select public.puede_editar_grupo(p_auth_id, v_gid) into v_permitido;
  if not coalesce(v_permitido,false) then return; end if;

  return query
    select eg.id, eg.grupo_id, eg.fecha::date, eg.hora, eg.tema, eg.notas
    from public.eventos_grupo eg
    where eg.id = p_evento_id;
end;
$$;

create or replace function public.obtener_asistencia_evento(p_auth_id uuid, p_evento_id uuid)
returns table (
  usuario_id uuid,
  presente boolean,
  motivo_inasistencia text,
  registrado_por_usuario_id uuid,
  fecha_registro timestamptz,
  nombre text,
  apellido text,
  rol text
)
language plpgsql
security definer
as $$
declare
  v_gid uuid;
  v_permitido boolean;
begin
  select grupo_id into v_gid from public.eventos_grupo where id = p_evento_id;
  if v_gid is null then return; end if;
  select public.puede_editar_grupo(p_auth_id, v_gid) into v_permitido;
  if not coalesce(v_permitido,false) then return; end if;

  return query
    select a.usuario_id, a.presente, a.motivo_inasistencia, a.registrado_por_usuario_id, a.fecha_registro,
           u.nombre, u.apellido,
           (select gm.rol from public.grupo_miembros gm where gm.grupo_id = v_gid and gm.usuario_id = u.id limit 1) as rol
      from public.asistencia a
      join public.usuarios u on u.id = a.usuario_id
     where a.evento_grupo_id = p_evento_id
     order by u.nombre, u.apellido;
end;
$$;

revoke all on function public.obtener_evento_grupo(uuid, uuid) from public;
grant execute on function public.obtener_evento_grupo(uuid, uuid) to authenticated, anon, service_role;
revoke all on function public.obtener_asistencia_evento(uuid, uuid) from public;
grant execute on function public.obtener_asistencia_evento(uuid, uuid) to authenticated, anon, service_role;
