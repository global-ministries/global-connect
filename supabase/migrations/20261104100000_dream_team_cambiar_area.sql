-- noqa: insert-into
-- Dream Team: move a servicio to another área, directly or by request
-- (odd/tasks/dream-team-cambiar-area.md, T1, S3–S5).
--
-- What:
--   1. dream_team_autoridad_director(equipo): director authority over an
--      equipo — admin or pastor (es_admin_o_pastor, as in
--      dream_team_equipos_registrables), or dream_team.direct,
--      dream_team.org.manage or dream_team.director.coordinate inherited
--      through the tree (auth_has_dream_team_capability_in_tree, the
--      capabilities the dream_team_servicios write policies accept). A
--      coordinator (dream_team.coordinate) has none.
--   2. dream_team_cambiar_area(servicio, equipo, rol, motivo, nota) → the new
--      servicio: the caller needs director authority over the origin AND the
--      destination (S4).
--   3. dream_team_solicitudes_cambio_area: requests (pendiente, aprobada,
--      rechazada, anulada), at most one pendiente per servicio. RLS on; the
--      requester and whoever directs both áreas read a row; nobody writes it
--      but the RPCs.
--   4. dream_team_solicitar_cambio_area(...): authority over the origin but
--      not the destination (with both, move directly) → the request id (S5).
--   5. dream_team_resolver_solicitud_cambio_area(solicitud, aprobar,
--      respuesta): a director of both áreas approves (the move of 2, signed
--      by them) or rejects (only the request changes). A servicio that was
--      retired or is no longer in the origin cannot be approved.
--   6. dream_team_solicitudes_cambio_area() → the pending requests the caller
--      can resolve and the caller's own, with names and área paths.
--
-- The move (dream_team_cambiar_area_mover, shared by 2 and 5) follows
-- estudiantes_promocion_retirar / _reasignar (20261102100000) and the app:
--   - the origin gets estado retirado, fecha_fin, motivo_actual reasignacion,
--     version + 1 and a history row (its estado → retirado);
--   - the destination is born in the SAME estado with motivo_actual
--     reasignacion, a history row (estado → estado) and one pendiente
--     verificación per requisito of its rol, as POST /api/dream-team/servicios
--     creates them; turnos are not copied (S3 assumption);
--   - both history rows carry motivo reasignacion, the existing value for a
--     change of área, and the detail "Corrección|Traslado · Hacia|Desde
--     <path> (<rol>) · <nota>", signed by the caller. No enum value is added:
--     correccion / traslado is a sub-kind the detail and the request keep;
--   - the grants every nivel could have minted for the origin (the set
--     buildRevocableGrantsForServicio revokes in grants.ts) are revoked unless
--     another active servicio of the person mints them too; when the estado
--     is activo the destination's dream_team_grants_de_servicio are written
--     as dream_team_cargar_voluntarios does (reactivate or insert, source
--     dream-team-servicio);
--   - a pendiente request of the servicio becomes anulada.
--   Talleres grants follow on their own (sync_talleres_grants_on_servicio_change).
--
-- Errors: 42501 for no session or no authority, 22023 for invalid input (the
-- message says which, in Spanish, for the UI).
--
-- Blast radius: one new table; eight new functions (five granted to
-- authenticated, three closed helpers). Writes dream_team_servicios,
-- _estados_historial, _requisitos_verificacion and _capability_grants of the
-- moved person only. No existing object changes.
--
-- Rollback:
--   drop function if exists public.dream_team_solicitudes_cambio_area();
--   drop function if exists public.dream_team_resolver_solicitud_cambio_area(uuid, boolean, text);
--   drop function if exists public.dream_team_solicitar_cambio_area(uuid, uuid, uuid, text, text);
--   drop function if exists public.dream_team_cambiar_area(uuid, uuid, uuid, text, text);
--   drop function if exists public.dream_team_cambiar_area_mover(uuid, uuid, uuid, text, text, uuid);
--   drop function if exists public.dream_team_cambiar_area_validar(uuid, uuid, uuid, text);
--   drop table if exists public.dream_team_solicitudes_cambio_area;
--   drop function if exists public.dream_team_equipo_ruta(uuid);
--   drop function if exists public.dream_team_autoridad_director(uuid);
-- Moves already made stay (they are ordinary retired / new servicios).

-- ── 1. authority and paths ───────────────────────────────────────────

create or replace function public.dream_team_autoridad_director(p_equipo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.dream_team_equipos e where e.id = p_equipo_id)
     and (public.es_admin_o_pastor(auth.uid())
          or public.auth_has_dream_team_capability_in_tree('dream_team.direct', p_equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', p_equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', p_equipo_id))
$$;

comment on function public.dream_team_autoridad_director(uuid) is
  'Whether the caller has director authority over an equipo: admin or pastor, or dream_team.direct / '
  'org.manage / director.coordinate on it or an ancestor. Gate of the cambiar-área RPCs and of the '
  'dream_team_solicitudes_cambio_area read policy.';

revoke all on function public.dream_team_autoridad_director(uuid) from public, anon;
grant execute on function public.dream_team_autoridad_director(uuid) to authenticated;

-- "Root › … › Equipo", for history details and the UI.
create or replace function public.dream_team_equipo_ruta(p_equipo_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  with recursive cadena as (
    select e.id, e.parent_equipo_id, e.label, 0 as profundidad
      from public.dream_team_equipos e
     where e.id = p_equipo_id
    union all
    select p.id, p.parent_equipo_id, p.label, c.profundidad + 1
      from public.dream_team_equipos p
      join cadena c on p.id = c.parent_equipo_id
     where c.profundidad < 16
  )
  select string_agg(c.label, ' › ' order by c.profundidad desc) from cadena c
$$;

comment on function public.dream_team_equipo_ruta(uuid) is
  'The labels from the root to an equipo, joined by " › ". Internal to the cambiar-área functions.';

revoke all on function public.dream_team_equipo_ruta(uuid) from public, anon, authenticated;
grant execute on function public.dream_team_equipo_ruta(uuid) to service_role;

-- ── 2. the requests ──────────────────────────────────────────────────

create table if not exists public.dream_team_solicitudes_cambio_area (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.dream_team_servicios(id) on delete cascade,
  equipo_origen_id uuid not null references public.dream_team_equipos(id),
  rol_origen_id uuid not null references public.dream_team_roles(id),
  equipo_destino_id uuid not null references public.dream_team_equipos(id),
  rol_destino_id uuid not null references public.dream_team_roles(id),
  motivo text not null check (motivo in ('correccion', 'traslado')),
  nota text,
  solicitante_id uuid not null references public.usuarios(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'anulada')),
  resuelto_por uuid references public.usuarios(id),
  resuelto_at timestamptz,
  respuesta text,
  servicio_destino_id uuid references public.dream_team_servicios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dream_team_solicitudes_cambio_area_resuelta check ((estado = 'pendiente') = (resuelto_at is null)),
  constraint dream_team_solicitudes_cambio_area_destino check (servicio_destino_id is null or estado = 'aprobada')
);

comment on table public.dream_team_solicitudes_cambio_area is
  'Requests to move a Dream Team servicio to an área outside the requester''s authority (S5). Written only '
  'by dream_team_solicitar_cambio_area, dream_team_resolver_solicitud_cambio_area and a direct move.';

create unique index if not exists dream_team_solicitudes_cambio_area_una_pendiente
  on public.dream_team_solicitudes_cambio_area (servicio_id) where estado = 'pendiente';
create index if not exists dream_team_solicitudes_cambio_area_solicitante
  on public.dream_team_solicitudes_cambio_area (solicitante_id, created_at desc);

alter table public.dream_team_solicitudes_cambio_area enable row level security;
revoke all on table public.dream_team_solicitudes_cambio_area from anon, authenticated;
grant select on table public.dream_team_solicitudes_cambio_area to authenticated;

drop policy if exists dream_team_solicitudes_cambio_area_select on public.dream_team_solicitudes_cambio_area;
create policy dream_team_solicitudes_cambio_area_select on public.dream_team_solicitudes_cambio_area
  for select to authenticated
  using (
    solicitante_id = (select u.id from public.usuarios u where u.auth_id = auth.uid())
    or (public.dream_team_autoridad_director(equipo_origen_id)
        and public.dream_team_autoridad_director(equipo_destino_id))
  );

-- ── 3. the move ──────────────────────────────────────────────────────

-- The input rules shared by a direct move, a request and an approval.
create or replace function public.dream_team_cambiar_area_validar(
  p_servicio_id uuid,
  p_equipo_destino_id uuid,
  p_rol_destino_id uuid,
  p_motivo text
)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_s record;
begin
  if p_motivo is null or p_motivo not in ('correccion', 'traslado') then
    raise exception 'El motivo debe ser correccion o traslado.' using errcode = '22023';
  end if;
  select s.persona_id, s.equipo_id, s.estado into v_s
    from public.dream_team_servicios s where s.id = p_servicio_id;
  if not found then
    raise exception 'El servicio no existe.' using errcode = '22023';
  end if;
  if v_s.estado = 'retirado' then
    raise exception 'El servicio está retirado y no se puede mover.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.dream_team_equipos e where e.id = p_equipo_destino_id and e.activo) then
    raise exception 'El área destino no existe o está inactiva.' using errcode = '22023';
  end if;
  if p_equipo_destino_id = v_s.equipo_id then
    raise exception 'El área destino debe ser distinta del área actual.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.dream_team_roles r
                  where r.id = p_rol_destino_id and r.equipo_id = p_equipo_destino_id and r.activo) then
    raise exception 'El rol no existe, está inactivo o no pertenece al área destino.' using errcode = '22023';
  end if;
  if exists (select 1 from public.dream_team_servicios o
              where o.persona_id = v_s.persona_id and o.equipo_id = p_equipo_destino_id
                and o.rol_id = p_rol_destino_id and o.estado <> 'retirado') then
    raise exception 'La persona ya tiene un servicio en el área destino con ese rol.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.dream_team_cambiar_area_validar(uuid, uuid, uuid, text) is
  'Raises 22023 when a servicio cannot move to that equipo and rol. Internal to the cambiar-área functions.';

revoke all on function public.dream_team_cambiar_area_validar(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dream_team_cambiar_area_validar(uuid, uuid, uuid, text) to service_role;

-- Retires the servicio and opens the same one in the destination; returns its
-- id. Authority is the caller's job.
create or replace function public.dream_team_cambiar_area_mover(
  p_servicio_id uuid,
  p_equipo_destino_id uuid,
  p_rol_destino_id uuid,
  p_motivo text,
  p_nota text,
  p_actor_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_s record;
  v_nota text := nullif(btrim(p_nota), '');
  v_motivo text := case p_motivo when 'correccion' then 'Corrección' else 'Traslado' end;
  v_origen text;
  v_destino text;
  v_experiencia_origen text;
  v_experiencia text;
  v_rol_label text;
  v_id uuid;
  v_g record;
  v_n integer;
begin
  select s.id, s.persona_id, s.equipo_id, s.rol_id, s.estado into v_s
    from public.dream_team_servicios s where s.id = p_servicio_id
     for update;
  perform public.dream_team_cambiar_area_validar(p_servicio_id, p_equipo_destino_id, p_rol_destino_id, p_motivo);

  select public.dream_team_equipo_ruta(v_s.equipo_id) || ' (' || r.label || ')', e.experiencia
    into v_origen, v_experiencia_origen
    from public.dream_team_roles r, public.dream_team_equipos e
   where r.id = v_s.rol_id and e.id = v_s.equipo_id;
  select public.dream_team_equipo_ruta(p_equipo_destino_id) || ' (' || r.label || ')', r.label, e.experiencia
    into v_destino, v_rol_label, v_experiencia
    from public.dream_team_roles r, public.dream_team_equipos e
   where r.id = p_rol_destino_id and e.id = p_equipo_destino_id;

  update public.dream_team_servicios s
     set estado = 'retirado', fecha_fin = now(), motivo_actual = 'reasignacion', version = s.version + 1,
         updated_at = now()
   where s.id = p_servicio_id;
  insert into public.dream_team_estados_historial
    (servicio_id, estado_anterior, estado_nuevo, motivo, detalle_motivo, actor_persona_id)
  values (p_servicio_id, v_s.estado, 'retirado', 'reasignacion',
          concat_ws(' · ', v_motivo, 'Hacia ' || v_destino, v_nota), p_actor_id);

  insert into public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
  values (v_s.persona_id, p_equipo_destino_id, p_rol_destino_id, v_s.estado, now(), 'reasignacion')
  returning id into v_id;
  insert into public.dream_team_estados_historial
    (servicio_id, estado_anterior, estado_nuevo, motivo, detalle_motivo, actor_persona_id)
  values (v_id, v_s.estado, v_s.estado, 'reasignacion',
          concat_ws(' · ', v_motivo, 'Desde ' || v_origen, v_nota), p_actor_id);
  insert into public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
  select v_id, rq.id, 'pendiente'
    from public.dream_team_requisitos rq
   where rq.rol_id = p_rol_destino_id;

  -- What any nivel could have minted for the origin: the rol's own set plus,
  -- for each nivel, the set of its label (a NULL rol id makes
  -- dream_team_grants_de_servicio fall back to the label's nivel; grupo-scoped
  -- keys hang on the rol id and come from the rol's own set only).
  update public.dream_team_capability_grants g
     set revoked_at = now()
    from (select k.capability_key, k.experience, k.scope_type, k.scope_id
            from public.dream_team_grants_de_servicio(
                   v_s.equipo_id, v_experiencia_origen, v_s.rol_id,
                   (select r.label from public.dream_team_roles r where r.id = v_s.rol_id)) k
          union
          select k.capability_key, k.experience, k.scope_type, k.scope_id
            from unnest(array['Voluntario', 'Lider', 'Coordinador', 'Director']) as n(label)
           cross join lateral public.dream_team_grants_de_servicio(v_s.equipo_id, v_experiencia_origen, null, n.label) k
           where k.scope_type <> 'grupo') k
   where g.persona_id = v_s.persona_id
     and g.capability_key = k.capability_key
     and g.experience = k.experience
     and g.scope_type = k.scope_type
     and g.scope_id is not distinct from k.scope_id
     and g.source = 'dream-team-servicio'
     and g.revoked_at is null
     and not exists (
       select 1
         from public.dream_team_servicios o
         join public.dream_team_equipos oe on oe.id = o.equipo_id
         join public.dream_team_roles orr on orr.id = o.rol_id
        cross join lateral public.dream_team_grants_de_servicio(o.equipo_id, oe.experiencia, o.rol_id, orr.label) ok
        where o.persona_id = v_s.persona_id and o.estado = 'activo' and o.id <> p_servicio_id
          and ok.capability_key = k.capability_key and ok.experience = k.experience
          and ok.scope_type = k.scope_type and ok.scope_id is not distinct from k.scope_id);

  if v_s.estado = 'activo' then
    for v_g in
      select * from public.dream_team_grants_de_servicio(p_equipo_destino_id, v_experiencia, p_rol_destino_id, v_rol_label)
    loop
      update public.dream_team_capability_grants g
         set revoked_at = null, granted_at = now()
       where g.persona_id = v_s.persona_id
         and g.capability_key = v_g.capability_key
         and g.experience = v_g.experience
         and g.scope_type = v_g.scope_type
         and g.scope_id is not distinct from v_g.scope_id
         and g.source = 'dream-team-servicio';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        insert into public.dream_team_capability_grants
          (persona_id, capability_key, experience, scope_type, scope_id, source, granted_at)
        values (v_s.persona_id, v_g.capability_key, v_g.experience, v_g.scope_type, v_g.scope_id,
                'dream-team-servicio', now());
      end if;
    end loop;
  end if;

  update public.dream_team_solicitudes_cambio_area r
     set estado = 'anulada', resuelto_por = p_actor_id, resuelto_at = now(),
         respuesta = 'El servicio cambió de área.', updated_at = now()
   where r.servicio_id = p_servicio_id and r.estado = 'pendiente';

  return v_id;
end;
$$;

comment on function public.dream_team_cambiar_area_mover(uuid, uuid, uuid, text, text, uuid) is
  'Retires a servicio and opens the same one (same estado) in another equipo and rol: history, '
  'verificaciones, grants moved, pending request anulada. Internal to dream_team_cambiar_area and '
  'dream_team_resolver_solicitud_cambio_area, which check authority.';

revoke all on function public.dream_team_cambiar_area_mover(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.dream_team_cambiar_area_mover(uuid, uuid, uuid, text, text, uuid) to service_role;

-- ── 4. the RPCs ──────────────────────────────────────────────────────

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
  return public.dream_team_cambiar_area_mover(p_servicio, p_equipo_destino, p_rol_destino, p_motivo, p_nota, v_actor);
end;
$$;

comment on function public.dream_team_cambiar_area(uuid, uuid, uuid, text, text) is
  'Moves a servicio to another equipo and rol (motivo correccion or traslado) in one step; the caller needs '
  'director authority over both. Returns the new servicio (S3, S4).';

revoke all on function public.dream_team_cambiar_area(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.dream_team_cambiar_area(uuid, uuid, uuid, text, text) to authenticated;

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
  if not public.dream_team_autoridad_director(v_s.equipo_id) then
    raise exception 'No tienes autoridad de director sobre el área actual de este servicio.' using errcode = '42501';
  end if;
  perform public.dream_team_cambiar_area_validar(p_servicio, p_equipo_destino, p_rol_destino, p_motivo);
  if public.dream_team_autoridad_director(p_equipo_destino) then
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
  'Asks a director of both áreas to move a servicio to an equipo outside the caller''s authority; the caller '
  'needs director authority over the origin only. Returns the request (S5).';

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
  if not (public.dream_team_autoridad_director(v_r.equipo_origen_id)
          and public.dream_team_autoridad_director(v_r.equipo_destino_id)) then
    raise exception 'Solo un director con autoridad sobre ambas áreas puede resolver esta solicitud.' using errcode = '42501';
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
  'a pending request; the caller needs director authority over both áreas (S5).';

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
             and public.dream_team_autoridad_director(r.equipo_origen_id)
             and public.dream_team_autoridad_director(r.equipo_destino_id) as puede_resolver,
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
  'Cambio-de-área requests for the UI: the pending ones the caller can resolve (puede_resolver) and the '
  'caller''s own in any estado (es_mia), with names, área paths and dates.';

revoke all on function public.dream_team_solicitudes_cambio_area() from public, anon;
grant execute on function public.dream_team_solicitudes_cambio_area() to authenticated;
