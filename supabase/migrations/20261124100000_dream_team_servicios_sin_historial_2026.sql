-- Dream Team: until 2027-01-01 00:00 (America/Caracas), moving a volunteer to
-- another área leaves no trace of the origin servicio
-- (odd/tasks/dream-team-estructura-correcciones.md, S7, T8b; L15, L16).
--
-- What:
--   1. dream_team_servicio_borrar_si_sin_historial_en(servicio, ahora) →
--      boolean: deletes the servicio when, at p_ahora, it is retirado, p_ahora
--      is before 2027-01-01 00:00 Caracas, and nothing that records service
--      actually rendered hangs on it: volunteer attendance
--      (dream_team_asistencias), a frozen Niños or Estudiantes roster
--      (ninos_ / estudiantes_voluntarios_roster_servicios), a group
--      leadership period (estudiantes_grupo_lideres) or a DPS convocatoria of
--      a plan dated that Caracas day or earlier (dps_convocados). Those keep
--      the servicio retirado, as before this migration. Its history,
--      verificaciones, events, turnos, solicitudes de cambio de área, future
--      DPS convocatorias and Niños salón go with it (ON DELETE CASCADE;
--      operating_core_events.responsible_dream_team_servicio_id is SET NULL).
--      Returns whether it deleted. Internal (service_role): the date is a
--      parameter so the suite can try both sides of the cut.
--   2. dream_team_servicio_borrar_si_sin_historial(servicio) → boolean: (1) at
--      now(). Internal (service_role). Called at the END of the RPCs below and,
--      through the admin client, by DELETE («Quitar de este equipo») and PATCH
--      to retirado («Cambiar etapa») of /api/dream-team/servicios/[id]
--      (borrarServicioRetirado), always after the caller retired it and
--      revoked its grants. Never from a trigger on the same row.
--   3. dream_team_cambiar_area (latest: 20261104100000) and
--      dream_team_resolver_solicitud_cambio_area (latest: 20261104120000)
--      redefined with the same bodies, plus one call to (2) on the origin
--      servicio after the move (dream_team_cambiar_area_mover already retired
--      it, revoked its grants and annulled its pending request). Both still
--      return the destination servicio. Approving a request deletes the
--      request with the origin (ON DELETE CASCADE): no trace either.
--
-- Not covered (they keep retiring, by design): estudiantes_promocion_aplicar
-- (the yearly promotion keeps its own record and reads the retired servicio)
-- and personas_fusionar (closes a duplicate servicio during a merge).
--
-- From 2027-01-01 00:00 Caracas (2) deletes nothing: every path retires and
-- keeps the history, as before.
--
-- Blast radius: two new internal functions; two RPCs redefined with the same
-- signatures and grants. Deletes only retired servicios of the move (or of the
-- TS caller) before 2027. No table change.
--
-- Rollback: re-apply dream_team_cambiar_area from
-- 20261104100000_dream_team_cambiar_area.sql and
-- dream_team_resolver_solicitud_cambio_area from
-- 20261104120000_dream_team_cambiar_area_coordinadores.sql (the TS callers
-- need (2) until they are reverted too), then
--   drop function if exists public.dream_team_servicio_borrar_si_sin_historial(uuid);
--   drop function if exists public.dream_team_servicio_borrar_si_sin_historial_en(uuid, timestamptz);
-- Deleted servicios are not restored.

-- ── 1. the delete ────────────────────────────────────────────────────

create or replace function public.dream_team_servicio_borrar_si_sin_historial_en(p_servicio uuid, p_ahora timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_hoy date := (p_ahora at time zone 'America/Caracas')::date;
begin
  if p_servicio is null or p_ahora is null
     or p_ahora >= (timestamp '2027-01-01 00:00:00' at time zone 'America/Caracas') then
    return false;
  end if;

  delete from public.dream_team_servicios s
   where s.id = p_servicio
     and s.estado = 'retirado'
     and not exists (select 1 from public.dream_team_asistencias a where a.servicio_id = s.id)
     and not exists (select 1 from public.ninos_voluntarios_roster_servicios n where n.servicio_id = s.id)
     and not exists (select 1 from public.estudiantes_voluntarios_roster_servicios e where e.servicio_id = s.id)
     and not exists (select 1 from public.estudiantes_grupo_lideres l where l.servicio_id = s.id)
     and not exists (select 1
                       from public.dps_convocados c
                       join public.dps_planes p on p.id = c.plan_id
                      where c.servicio_id = s.id and p.fecha <= v_hoy);
  return found;
end;
$$;

comment on function public.dream_team_servicio_borrar_si_sin_historial_en(uuid, timestamptz) is
  'Deletes a retirado servicio (its history and dependants cascade) when p_ahora is before 2027-01-01 00:00 '
  'America/Caracas and it has no attendance, frozen roster, group leadership or DPS convocatoria up to that '
  'day; returns whether it deleted. Internal; the date is a parameter for tests (S7, T8b).';

revoke all on function public.dream_team_servicio_borrar_si_sin_historial_en(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.dream_team_servicio_borrar_si_sin_historial_en(uuid, timestamptz) to service_role;

create or replace function public.dream_team_servicio_borrar_si_sin_historial(p_servicio uuid)
returns boolean
language sql
volatile
security definer
set search_path to ''
as $$
  select public.dream_team_servicio_borrar_si_sin_historial_en(p_servicio, now())
$$;

comment on function public.dream_team_servicio_borrar_si_sin_historial(uuid) is
  'dream_team_servicio_borrar_si_sin_historial_en at now(): until 2027-01-01 (Caracas) a retired servicio '
  'leaves no trace. Called after a retire by the cambiar-área RPCs and, with the admin client, by '
  '/api/dream-team/servicios/[id] (Quitar, Cambiar etapa). Internal (S7, T8b).';

revoke all on function public.dream_team_servicio_borrar_si_sin_historial(uuid) from public, anon, authenticated;
grant execute on function public.dream_team_servicio_borrar_si_sin_historial(uuid) to service_role;

-- ── 2. the RPCs that retire an origin servicio ──────────────────────

create or replace function public.dream_team_cambiar_area(
  p_servicio uuid,
  p_equipo_destino uuid,
  p_rol_destino uuid,
  p_motivo text,
  p_nota text
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_origen uuid;
  v_id uuid;
begin
  select u.id into v_actor from public.usuarios u where auth.uid() is not null and u.auth_id = auth.uid();
  if v_actor is null then
    raise exception 'No hay una persona asociada a la sesión.' using errcode = '42501';
  end if;
  select s.equipo_id into v_origen from public.dream_team_servicios s where s.id = p_servicio for update;
  if not found then
    raise exception 'El servicio no existe.' using errcode = '22023';
  end if;
  if not public.dream_team_autoridad_director(v_origen) then
    raise exception 'No tienes autoridad de director sobre el área actual de este servicio.' using errcode = '42501';
  end if;
  perform public.dream_team_cambiar_area_validar(p_servicio, p_equipo_destino, p_rol_destino, p_motivo);
  if not public.dream_team_autoridad_director(p_equipo_destino) then
    raise exception 'No tienes autoridad de director sobre el área destino; envía una solicitud para que la apruebe un director de ambas áreas.'
      using errcode = '42501';
  end if;
  v_id := public.dream_team_cambiar_area_mover(p_servicio, p_equipo_destino, p_rol_destino, p_motivo, p_nota, v_actor);
  -- S7, T8b: until 2027-01-01 (Caracas) the retired origin leaves no trace.
  -- Best effort: if anything blocks the delete, the origin stays retirado as before.
  begin
    perform public.dream_team_servicio_borrar_si_sin_historial(p_servicio);
  exception when foreign_key_violation or raise_exception then
    null;
  end;
  return v_id;
end;
$$;

comment on function public.dream_team_cambiar_area(uuid, uuid, uuid, text, text) is
  'Moves a servicio to another equipo and rol (motivo correccion or traslado) in one step; the caller needs '
  'director authority over both. Returns the new servicio (S3, S4). Until 2027-01-01 (Caracas) the retired '
  'origin is then deleted by dream_team_servicio_borrar_si_sin_historial (S7, T8b of '
  'dream-team-estructura-correcciones).';

revoke all on function public.dream_team_cambiar_area(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.dream_team_cambiar_area(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.dream_team_resolver_solicitud_cambio_area(
  p_solicitud uuid,
  p_aprobar boolean,
  p_respuesta text
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_r record;
  v_s record;
  v_id uuid;
begin
  select u.id into v_actor from public.usuarios u where auth.uid() is not null and u.auth_id = auth.uid();
  if v_actor is null then
    raise exception 'No hay una persona asociada a la sesión.' using errcode = '42501';
  end if;
  -- Servicio first, then the request: the same lock order as a direct move.
  select s.equipo_id, s.rol_id, s.estado into v_s
    from public.dream_team_servicios s
   where s.id = (select r.servicio_id from public.dream_team_solicitudes_cambio_area r where r.id = p_solicitud)
     for update;
  select r.* into v_r from public.dream_team_solicitudes_cambio_area r where r.id = p_solicitud for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = '22023';
  end if;
  if not public.dream_team_puede_resolver_cambio_area(v_r.equipo_origen_id, v_r.equipo_destino_id) then
    raise exception 'Solo un director con autoridad sobre ambas áreas o el coordinador de Atención al Voluntario de la dirección puede resolver esta solicitud.'
      using errcode = '42501';
  end if;
  if v_r.solicitante_id = v_actor then
    raise exception 'No puedes resolver una solicitud que enviaste tú.' using errcode = '42501';
  end if;
  if v_r.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue resuelta.' using errcode = '22023';
  end if;
  if p_aprobar is null then
    raise exception 'Indica si apruebas o rechazas la solicitud.' using errcode = '22023';
  end if;

  if not p_aprobar then
    update public.dream_team_solicitudes_cambio_area r
       set estado = 'rechazada', resuelto_por = v_actor, resuelto_at = now(),
           respuesta = nullif(btrim(p_respuesta), ''), updated_at = now()
     where r.id = p_solicitud;
    return null;
  end if;

  if v_s.estado = 'retirado' or v_s.equipo_id <> v_r.equipo_origen_id or v_s.rol_id <> v_r.rol_origen_id then
    raise exception 'El servicio cambió desde que se envió la solicitud (fue retirado o ya no está en esa área); no se puede aprobar.'
      using errcode = '22023';
  end if;

  update public.dream_team_solicitudes_cambio_area r
     set estado = 'aprobada', resuelto_por = v_actor, resuelto_at = now(),
         respuesta = nullif(btrim(p_respuesta), ''), updated_at = now()
   where r.id = p_solicitud;
  v_id := public.dream_team_cambiar_area_mover(v_r.servicio_id, v_r.equipo_destino_id, v_r.rol_destino_id,
                                               v_r.motivo, v_r.nota, v_actor);
  update public.dream_team_solicitudes_cambio_area r set servicio_destino_id = v_id where r.id = p_solicitud;
  -- S7, T8b: until 2027-01-01 (Caracas) the retired origin leaves no trace;
  -- this request goes with it (ON DELETE CASCADE).
  -- Best effort: if anything blocks the delete, the origin stays retirado as before.
  begin
    perform public.dream_team_servicio_borrar_si_sin_historial(v_r.servicio_id);
  exception when foreign_key_violation or raise_exception then
    null;
  end;
  return v_id;
end;
$$;

comment on function public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text) is
  'Approves (moves the servicio, signed by the caller; returns the new servicio) or rejects (returns NULL) '
  'a pending request; the caller needs dream_team_puede_resolver_cambio_area (a director of both áreas or '
  'the Atención al Voluntario coordinator of the dirección) and must not be the requester (S5, S7). Until '
  '2027-01-01 (Caracas) an approval then deletes the retired origin and, with it, the request '
  '(dream_team_servicio_borrar_si_sin_historial; S7, T8b of dream-team-estructura-correcciones).';

revoke all on function public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text) from public, anon;
grant execute on function public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text) to authenticated;
