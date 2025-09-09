-- Índices y RLS para asistencia y eventos_grupo

-- Un evento por grupo y fecha
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'uniq_evento_grupo_fecha'
  ) then
    create unique index uniq_evento_grupo_fecha on public.eventos_grupo (grupo_id, fecha);
  end if;
end $$;

-- Una fila de asistencia por (evento, usuario)
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'uniq_asistencia_evento_usuario'
  ) then
    create unique index uniq_asistencia_evento_usuario on public.asistencia (evento_grupo_id, usuario_id);
  end if;
end $$;

-- Activar RLS si no lo está
do $$ begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='eventos_grupo' and rowsecurity) then
    alter table public.eventos_grupo enable row level security;
  end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='asistencia' and rowsecurity) then
    alter table public.asistencia enable row level security;
  end if;
end $$;

-- Políticas conservadoras: escritura solo vía RPC (SECURITY DEFINER) y lectura restringida; se pueden ampliar luego.
-- Lectura de eventos si puede ver el grupo
drop policy if exists sel_eventos_grupo on public.eventos_grupo;
create policy sel_eventos_grupo on public.eventos_grupo for select
  using (
    exists (
      select 1 from public.grupos g
      where g.id = grupo_id
    )
  );

-- Lectura de asistencia asociada a eventos
drop policy if exists sel_asistencia on public.asistencia;
create policy sel_asistencia on public.asistencia for select
  using (
    exists (
      select 1 from public.eventos_grupo eg
      where eg.id = asistencia.evento_grupo_id
    )
  );

-- Bloqueo de insert/update/delete directos (se hará vía registrar_asistencia)
drop policy if exists iud_eventos_grupo on public.eventos_grupo;
create policy iud_eventos_grupo on public.eventos_grupo for all to authenticated using (false) with check (false);

drop policy if exists iud_asistencia on public.asistencia;
create policy iud_asistencia on public.asistencia for all to authenticated using (false) with check (false);
