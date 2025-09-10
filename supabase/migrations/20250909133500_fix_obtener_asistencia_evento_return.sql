-- Fix: obtener_asistencia_evento debe devolver rol como text (no enum) y respetar el orden de columnas
DROP FUNCTION IF EXISTS public.obtener_asistencia_evento(uuid, uuid);

CREATE OR REPLACE FUNCTION public.obtener_asistencia_evento(
  p_auth_id uuid,
  p_evento_id uuid
)
RETURNS TABLE (
  usuario_id uuid,
  presente boolean,
  motivo_inasistencia text,
  registrado_por_usuario_id uuid,
  fecha_registro timestamptz,
  nombre text,
  apellido text,
  rol text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  with ev as (
    select e.id, e.grupo_id
    from public.eventos_grupo e
    where e.id = p_evento_id
  )
  select
    a.usuario_id,
    a.presente,
    a.motivo_inasistencia,
    a.registrado_por_usuario_id,
    a.fecha_registro,
    u.nombre,
    u.apellido,
    (gm.rol)::text as rol
  from public.asistencia a
  join ev on ev.id = a.evento_grupo_id
  join public.usuarios u on u.id = a.usuario_id
  left join public.grupo_miembros gm on gm.grupo_id = ev.grupo_id and gm.usuario_id = a.usuario_id
  where a.evento_grupo_id = p_evento_id
  order by u.apellido nulls last, u.nombre nulls last;
$$;

REVOKE ALL ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) TO authenticated, service_role, anon;