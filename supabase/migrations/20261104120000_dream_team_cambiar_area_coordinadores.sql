-- noqa: insert-into
-- Dream Team: coordinators request a change of área; the Atención al
-- Voluntario coordinator also resolves (odd/tasks/dream-team-cambiar-area.md,
-- T3, S7).
--
-- What:
--   1. dream_team_puede_solicitar_cambio_area(equipo): director authority
--      (dream_team_autoridad_director) or dream_team.coordinate on the equipo
--      or an ancestor (auth_has_dream_team_capability_in_tree). Where
--      "Cambiar de área" shows and the gate of a request and of the
--      destinations.
--   2. dream_team_puede_resolver_cambio_area(origen, destino): director
--      authority over both (as before) or both inside
--      dream_team_equipos_registrables() — the reach of the Atención al
--      Voluntario coordinator: the subtree of the parent área of their node
--      (it also holds admin, pastor and org.manage, who are directors anyway).
--   3. dream_team_solicitar_cambio_area: gated by (1). A coordinator always
--      requests, even inside their own área; only a caller with director
--      authority over both áreas is still told to move directly.
--   4. dream_team_resolver_solicitud_cambio_area: gated by (2), and nobody
--      resolves their own request. Same lock order (servicio, then request)
--      and the same "servicio changed" guard.
--   5. dream_team_solicitudes_cambio_area() and the table's read policy: what
--      (2) allows; puede_resolver is false on one's own request.
--   6. dream_team_cambiar_area_destinos: gated by (1); `dirige` is still
--      director authority (false for a coordinator → "Enviar solicitud").
--   A direct move (dream_team_cambiar_area) keeps requiring director authority
--   over both áreas: a coordinator still gets 42501.
--
-- Errors (Spanish, for the UI): 42501 'No tienes autoridad de director ni de
-- coordinador sobre el área actual de este servicio.' (request, destinations),
-- 'Solo un director con autoridad sobre ambas áreas o el coordinador de
-- Atención al Voluntario de la dirección puede resolver esta solicitud.' and
-- 'No puedes resolver una solicitud que enviaste tú.' (resolve).
--
-- Blast radius: two new functions granted to authenticated (the read policy
-- calls (2) as the caller); four functions and one policy of 20261104100000 /
-- 20261104110000 redefined with the same signatures. No table or data change.
--
-- Rollback: re-apply the definitions of dream_team_solicitar_cambio_area,
-- dream_team_resolver_solicitud_cambio_area, dream_team_solicitudes_cambio_area
-- and the dream_team_solicitudes_cambio_area_select policy from
-- 20261104100000_dream_team_cambiar_area.sql and dream_team_cambiar_area_destinos
-- from 20261104110000_dream_team_cambiar_area_destinos.sql, then
--   drop function if exists public.dream_team_puede_resolver_cambio_area(uuid, uuid);
--   drop function if exists public.dream_team_puede_solicitar_cambio_area(uuid);
-- Pending requests sent by coordinators stay; directors resolve them as before.

-- ── 1. who requests, who resolves ────────────────────────────────────

create or replace function public.dream_team_puede_solicitar_cambio_area(p_equipo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.dream_team_equipos e where e.id = p_equipo_id)
     and (public.dream_team_autoridad_director(p_equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', p_equipo_id))
$$;

comment on function public.dream_team_puede_solicitar_cambio_area(uuid) is
  'Whether the caller may change the área of a servicio in an equipo: director authority (move or request) '
  'or dream_team.coordinate on it or an ancestor (request only). Where "Cambiar de área" shows; gate of '
  'dream_team_solicitar_cambio_area and dream_team_cambiar_area_destinos.';

revoke all on function public.dream_team_puede_solicitar_cambio_area(uuid) from public, anon;
grant execute on function public.dream_team_puede_solicitar_cambio_area(uuid) to authenticated;

create or replace function public.dream_team_puede_resolver_cambio_area(p_origen uuid, p_destino uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and ((public.dream_team_autoridad_director(p_origen) and public.dream_team_autoridad_director(p_destino))
          or 2 = (select count(distinct r.equipo_id)
                    from public.dream_team_equipos_registrables() r
                   where r.equipo_id in (p_origen, p_destino)))
$$;

comment on function public.dream_team_puede_resolver_cambio_area(uuid, uuid) is
  'Whether the caller may resolve a cambio-de-área request from p_origen to p_destino: director authority '
  'over both, or both inside dream_team_equipos_registrables() (the Atención al Voluntario coordinator of '
  'the dirección). Does not exclude the requester; the RPCs do.';

revoke all on function public.dream_team_puede_resolver_cambio_area(uuid, uuid) from public, anon;
grant execute on function public.dream_team_puede_resolver_cambio_area(uuid, uuid) to authenticated;

drop policy if exists dream_team_solicitudes_cambio_area_select on public.dream_team_solicitudes_cambio_area;
create policy dream_team_solicitudes_cambio_area_select on public.dream_team_solicitudes_cambio_area
  for select to authenticated
  using (
    solicitante_id = (select u.id from public.usuarios u where u.auth_id = auth.uid())
    or public.dream_team_puede_resolver_cambio_area(equipo_origen_id, equipo_destino_id)
  );

-- ── 2. the RPCs ──────────────────────────────────────────────────────

create or replace function public.dream_team_solicitar_cambio_area(
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
  v_s record;
  v_id uuid;
begin
  select u.id into v_actor from public.usuarios u where auth.uid() is not null and u.auth_id = auth.uid();
  if v_actor is null then
    raise exception 'No hay una persona asociada a la sesión.' using errcode = '42501';
  end if;
  select s.equipo_id, s.rol_id into v_s from public.dream_team_servicios s where s.id = p_servicio for update;
  if not found then
    raise exception 'El servicio no existe.' using errcode = '22023';
  end if;
  if not public.dream_team_puede_solicitar_cambio_area(v_s.equipo_id) then
    raise exception 'No tienes autoridad de director ni de coordinador sobre el área actual de este servicio.' using errcode = '42501';
  end if;
  perform public.dream_team_cambiar_area_validar(p_servicio, p_equipo_destino, p_rol_destino, p_motivo);
  if public.dream_team_autoridad_director(v_s.equipo_id) and public.dream_team_autoridad_director(p_equipo_destino) then
    raise exception 'Tienes autoridad sobre ambas áreas; cambia el área directamente, sin solicitud.' using errcode = '22023';
  end if;
  if exists (select 1 from public.dream_team_solicitudes_cambio_area r
              where r.servicio_id = p_servicio and r.estado = 'pendiente') then
    raise exception 'Este servicio ya tiene una solicitud de cambio de área pendiente.' using errcode = '22023';
  end if;

  insert into public.dream_team_solicitudes_cambio_area
    (servicio_id, equipo_origen_id, rol_origen_id, equipo_destino_id, rol_destino_id, motivo, nota, solicitante_id)
  values (p_servicio, v_s.equipo_id, v_s.rol_id, p_equipo_destino, p_rol_destino, p_motivo,
          nullif(btrim(p_nota), ''), v_actor)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.dream_team_solicitar_cambio_area(uuid, uuid, uuid, text, text) is
  'Asks to move a servicio to another equipo and rol; the caller needs director or coordinator authority over '
  'the origin (dream_team_puede_solicitar_cambio_area). A director of both áreas moves directly instead. '
  'Returns the request (S5, S7).';

revoke all on function public.dream_team_solicitar_cambio_area(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.dream_team_solicitar_cambio_area(uuid, uuid, uuid, text, text) to authenticated;

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
  return v_id;
end;
$$;

comment on function public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text) is
  'Approves (moves the servicio, signed by the caller; returns the new servicio) or rejects (returns NULL) '
  'a pending request; the caller needs dream_team_puede_resolver_cambio_area (a director of both áreas or '
  'the Atención al Voluntario coordinator of the dirección) and must not be the requester (S5, S7).';

revoke all on function public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text) from public, anon;
grant execute on function public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text) to authenticated;

create or replace function public.dream_team_solicitudes_cambio_area()
returns table (
  id uuid,
  estado text,
  puede_resolver boolean,
  es_mia boolean,
  servicio_id uuid,
  persona_id uuid,
  persona_nombre text,
  equipo_origen_id uuid,
  origen_ruta text,
  rol_origen text,
  equipo_destino_id uuid,
  destino_ruta text,
  rol_destino_id uuid,
  rol_destino text,
  motivo text,
  nota text,
  solicitante_id uuid,
  solicitante_nombre text,
  respuesta text,
  resuelto_por_nombre text,
  created_at timestamptz,
  resuelto_at timestamptz,
  servicio_destino_id uuid
)
language sql
stable
security definer
set search_path to ''
as $$
  with actor as (
    select u.id from public.usuarios u where auth.uid() is not null and u.auth_id = auth.uid()
  ),
  visibles as (
    select r.*,
           r.estado = 'pendiente'
             and r.solicitante_id <> (select a.id from actor a)
             and public.dream_team_puede_resolver_cambio_area(r.equipo_origen_id, r.equipo_destino_id) as puede_resolver,
           r.solicitante_id = (select a.id from actor a) as es_mia
      from public.dream_team_solicitudes_cambio_area r
     where exists (select 1 from actor)
       and (r.estado = 'pendiente' or r.solicitante_id = (select a.id from actor a))
  )
  select v.id, v.estado, v.puede_resolver, v.es_mia, v.servicio_id, s.persona_id,
         concat_ws(' ', p.nombre, p.apellido),
         v.equipo_origen_id, public.dream_team_equipo_ruta(v.equipo_origen_id), ro.label,
         v.equipo_destino_id, public.dream_team_equipo_ruta(v.equipo_destino_id), v.rol_destino_id, rd.label,
         v.motivo, v.nota, v.solicitante_id, concat_ws(' ', so.nombre, so.apellido), v.respuesta,
         nullif(concat_ws(' ', rp.nombre, rp.apellido), ''),
         v.created_at, v.resuelto_at, v.servicio_destino_id
    from visibles v
    join public.dream_team_servicios s on s.id = v.servicio_id
    join public.usuarios p on p.id = s.persona_id
    join public.dream_team_roles ro on ro.id = v.rol_origen_id
    join public.dream_team_roles rd on rd.id = v.rol_destino_id
    join public.usuarios so on so.id = v.solicitante_id
    left join public.usuarios rp on rp.id = v.resuelto_por
   where v.puede_resolver or v.es_mia
   order by v.estado = 'pendiente' desc, v.created_at desc, v.id
$$;

comment on function public.dream_team_solicitudes_cambio_area() is
  'Cambio-de-área requests for the UI: the pending ones the caller can resolve (puede_resolver: '
  'dream_team_puede_resolver_cambio_area, never their own) and the caller''s own in any estado (es_mia), '
  'with names, área paths and dates.';

revoke all on function public.dream_team_solicitudes_cambio_area() from public, anon;
grant execute on function public.dream_team_solicitudes_cambio_area() to authenticated;

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
  if not public.dream_team_puede_solicitar_cambio_area(v_origen) then
    raise exception 'No tienes autoridad de director ni de coordinador sobre el área actual de este servicio.' using errcode = '42501';
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
  'roles. The caller needs dream_team_puede_solicitar_cambio_area on the current equipo (director or '
  'coordinator).';

revoke all on function public.dream_team_cambiar_area_destinos(uuid) from public, anon;
grant execute on function public.dream_team_cambiar_area_destinos(uuid) to authenticated;
