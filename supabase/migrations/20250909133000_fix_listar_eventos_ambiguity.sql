-- Corregir ambigüedad en la columna 'id' en la función listar_eventos_grupo.
-- El error "column reference 'id' is ambiguous" ocurre porque tanto la CTE 'base' como 'agg'
-- tienen una columna 'id', y la cláusula ORDER BY final no especifica cuál usar.

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
    ), agg as (
      select a.evento_grupo_id as id,
             count(*)::int as total,
             count(*) filter (where a.presente) :: int as presentes
        from public.asistencia a
       where a.evento_grupo_id in (select b.id from base b)
       group by a.evento_grupo_id
    )
    select b.id, b.fecha, b.hora, b.tema, b.notas,
           coalesce(ag.total,0) as total,
           coalesce(ag.presentes,0) as presentes,
           case when coalesce(ag.total,0) = 0 then 0 else round((ag.presentes::numeric / ag.total::numeric) * 100)::int end as porcentaje
      from base b
      left join agg ag on ag.id = b.id
      order by b.fecha desc, b.id desc
      limit coalesce(p_limit, 50) offset coalesce(p_offset, 0);
end;
$$;

-- Re-aplicar permisos por si acaso
revoke all on function public.listar_eventos_grupo(uuid, uuid, int, int) from public;
grant execute on function public.listar_eventos_grupo(uuid, uuid, int, int) to authenticated, service_role;
