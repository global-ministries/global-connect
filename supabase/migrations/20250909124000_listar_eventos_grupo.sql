-- Lista eventos de un grupo con KPIs de asistencia
-- Requiere permiso para editar el grupo (líder/roles superiores)

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
declare
  v_permitido boolean;
begin
  if p_auth_id is null or p_grupo_id is null then
    return;
  end if;

  select public.puede_editar_grupo(p_auth_id, p_grupo_id) into v_permitido;
  if not coalesce(v_permitido,false) then
    return;
  end if;

  return query
    with base as (
      select eg.id, eg.fecha::date, eg.hora, eg.tema, eg.notas
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

revoke all on function public.listar_eventos_grupo(uuid, uuid, int, int) from public;
grant execute on function public.listar_eventos_grupo(uuid, uuid, int, int) to authenticated, anon, service_role;
