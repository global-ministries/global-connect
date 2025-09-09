-- Relajar políticas de SELECT para evitar dependencias en RLS de otras tablas
-- Motivo: las políticas previas referenciaban public.grupos; si RLS de grupos niega acceso al rol evaluador, el EXISTS se vuelve falso y oculta todos los eventos/asistencias incluso dentro de funciones SECURITY DEFINER.

-- eventos_grupo: permitir SELECT a todos (lectura general); escrituras siguen bloqueadas por otras políticas y solo se hacen vía RPC.
drop policy if exists sel_eventos_grupo on public.eventos_grupo;
create policy sel_eventos_grupo on public.eventos_grupo for select using (true);

-- asistencia: permitir SELECT a todos; escrituras bloqueadas salvo vía RPC.
drop policy if exists sel_asistencia on public.asistencia;
create policy sel_asistencia on public.asistencia for select using (true);
