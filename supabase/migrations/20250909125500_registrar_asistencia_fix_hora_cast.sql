-- Ajuste: castear p_hora (text) a time al insertar/actualizar eventos_grupo
-- Mantiene la firma actual para no romper clientes.

create or replace function public.registrar_asistencia(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_fecha date,
  p_hora text default null,
  p_tema text default null,
  p_notas text default null,
  p_asistencias jsonb default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_permitido boolean;
  v_evento_id uuid;
  v_row jsonb;
  v_usuario_id uuid;
  v_presente boolean;
  v_motivo text;
begin
  if p_auth_id is null or p_grupo_id is null or p_fecha is null then
    raise exception 'Parámetros requeridos faltan';
  end if;

  select public.puede_editar_grupo(p_auth_id, p_grupo_id) into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No autorizado';
  end if;

  -- Buscar evento existente por fecha para evitar duplicados
  select id into v_evento_id
    from public.eventos_grupo
   where grupo_id = p_grupo_id and fecha = p_fecha
   limit 1;

  if v_evento_id is null then
    insert into public.eventos_grupo(id, grupo_id, fecha, hora, tema, notas)
    values (
      gen_random_uuid(),
      p_grupo_id,
      p_fecha,
      case when p_hora is null or length(p_hora) = 0 then null else (p_hora::time) end,
      p_tema,
      p_notas
    )
    returning id into v_evento_id;
  else
    update public.eventos_grupo
       set hora = coalesce(case when p_hora is null or length(p_hora) = 0 then null else (p_hora::time) end, hora),
           tema = coalesce(p_tema, tema),
           notas = coalesce(p_notas, notas)
     where id = v_evento_id;
  end if;

  -- Registrar asistencias: upsert por (evento_grupo_id, usuario_id)
  if p_asistencias is not null then
    for v_row in select * from jsonb_array_elements(p_asistencias) loop
      v_usuario_id := (v_row->>'usuario_id')::uuid;
      v_presente := coalesce((v_row->>'presente')::boolean, false);
      v_motivo := nullif(v_row->>'motivo_inasistencia', '');

      if v_usuario_id is null then
        continue;
      end if;

      insert into public.asistencia(id, evento_grupo_id, usuario_id, presente, motivo_inasistencia, registrado_por_usuario_id, fecha_registro)
      values (
        gen_random_uuid(),
        v_evento_id,
        v_usuario_id,
        v_presente,
        v_motivo,
        (select u.id from public.usuarios u where u.auth_id = p_auth_id),
        now()
      )
      on conflict (evento_grupo_id, usuario_id) do update
        set presente = excluded.presente,
            motivo_inasistencia = excluded.motivo_inasistencia,
            registrado_por_usuario_id = excluded.registrado_por_usuario_id,
            fecha_registro = excluded.fecha_registro;
    end loop;
  end if;

  return v_evento_id;
end;
$$;

revoke all on function public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb) from public;
grant execute on function public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb) to authenticated, service_role, anon;
