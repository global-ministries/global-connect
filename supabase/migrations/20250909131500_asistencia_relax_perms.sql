-- Simplificar funciones de lectura para evitar retornos nulos por cheques internos.
-- Reforzar control desde la app y RPCs de escritura.

-- obtener_evento_grupo sin cheque interno de permisos
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
begin
  return query
    select eg.id, eg.grupo_id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas
      from public.eventos_grupo eg
     where eg.id = p_evento_id
     limit 1;
end;
$$;

-- obtener_asistencia_evento sin cheque interno de permisos
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
begin
  return query
    select a.usuario_id, a.presente, a.motivo_inasistencia, a.registrado_por_usuario_id, a.fecha_registro,
           u.nombre, u.apellido,
           coalesce((select gm.rol from public.grupo_miembros gm where gm.grupo_id = eg.grupo_id and gm.usuario_id = u.id limit 1), 'Miembro') as rol
      from public.asistencia a
      join public.eventos_grupo eg on eg.id = p_evento_id
      join public.usuarios u on u.id = a.usuario_id
     where a.evento_grupo_id = p_evento_id
     order by u.nombre, u.apellido;
end;
$$;

-- listar_eventos_grupo sin cheque interno de permisos
create or replace function public.listar_eventos_grupo(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  fecha date,
  hora text,
  tema text,
  notas text,
  total integer,
  presentes integer,
  porcentaje integer
)
language plpgsql
security definer
as $$
begin
  return query
    with base as (
      select eg.id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas
        from public.eventos_grupo eg
       where eg.grupo_id = p_grupo_id
       order by eg.fecha desc, eg.id desc
       limit coalesce(p_limit, 50) offset coalesce(p_offset, 0)
    ), agg as (
      select a.evento_grupo_id as id,
             count(*)::int as total,
             count(*) filter (where a.presente) :: int as presentes
        from public.asistencia a
       where a.evento_grupo_id in (select id from base)
       group by a.evento_grupo_id
    )
    select b.id, b.fecha, b.hora, b.tema, b.notas,
           coalesce(ag.total,0) as total,
           coalesce(ag.presentes,0) as presentes,
           case when coalesce(ag.total,0) = 0 then 0 else round((ag.presentes::numeric / ag.total::numeric) * 100)::int end as porcentaje
      from base b
      left join agg ag on ag.id = b.id
      order by b.fecha desc, b.id desc;
end;
$$;

-- Endurecer GRANTs: solo authenticated y service_role
revoke all on function public.obtener_evento_grupo(uuid, uuid) from public;
revoke all on function public.obtener_asistencia_evento(uuid, uuid) from public;
revoke all on function public.listar_eventos_grupo(uuid, uuid, int, int) from public;

grant execute on function public.obtener_evento_grupo(uuid, uuid) to authenticated, service_role;
grant execute on function public.obtener_asistencia_evento(uuid, uuid) to authenticated, service_role;
grant execute on function public.listar_eventos_grupo(uuid, uuid, int, int) to authenticated, service_role;
