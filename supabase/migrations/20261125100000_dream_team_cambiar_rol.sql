-- noqa: insert-into
-- Dream Team: change the rol of a servicio inside the same equipo
-- (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S4).
--
-- Why: «Cambiar de área» (20261104100000–20261104120000) lists every equipo
-- but the current one, so nobody could change only the rol (L1, L2).
--
-- What:
--   1. dream_team_servicio_cambiar_rol_validar(servicio, rol) → void: the
--      rules shared by the read and the write. Who (S2): the people who open
--      «Cambiar de área» for that servicio today
--      (dream_team_puede_solicitar_cambio_area on its equipo: director
--      authority, or dream_team.coordinate in the tree). Whoever has no
--      director authority over the equipo (dream_team_autoridad_director)
--      cannot change their own servicio nor assign a rol of nivel 'director'
--      (user decision of 2026-11-25: «Coordinación cambia roles, pero no a
--      dirección ni el suyo»). What (S3): the servicio exists and is not
--      retirado; the rol is active, of the SAME equipo and not the current
--      one; the person has no other non-retired servicio with that rol in the
--      equipo (the uniqueness rule of dream_team_cambiar_area_validar).
--   2. dream_team_servicio_roles_cambiables(servicio) → the active roles of
--      the servicio's equipo plus the current one, with `actual` and
--      `asignable` (what the dialog may pick). Gated as (1) without a rol.
--   3. dream_team_servicio_cambiar_rol(servicio, rol, nota) → jsonb
--      {servicio_id, rol_anterior_id, rol_id, rol_label}: applies at once (no
--      request): only rol_id changes on the servicio (plus version + 1 and
--      updated_at, the optimistic-lock pair every write bumps); equipo,
--      estado, motivo_actual, fecha_inicio, fecha_fin and turnos stay. Like
--      dream_team_cambiar_area_mover for its destination:
--        - one dream_team_estados_historial row (estado → same estado, motivo
--          reasignacion, detalle "Cambio de rol · De <rol> a <rol> · <nota>",
--          signed by the caller, dated now) — the audit of who, when, from
--          and to; no new table;
--        - one pendiente verificación per requisito of the new rol that the
--          servicio does not have yet; the old rol's verificaciones stay;
--        - the grants any nivel could have minted for the old rol are revoked
--          unless another active servicio of the person mints them, and when
--          the estado is activo the new rol's dream_team_grants_de_servicio
--          are written (reactivate or insert, source dream-team-servicio).
--      Talleres grants follow on their own (sync_talleres_grants_on_servicio_change).
--
-- Errors (codes; the API turns them into Spanish): 42501 'sin_autoridad' (no
-- session or no authority), 'rol_direccion', 'propio_servicio'; 22023
-- 'servicio_inexistente', 'servicio_retirado', 'rol_invalido' (not an active
-- rol of the same equipo), 'mismo_rol', 'rol_duplicado'.
--
-- Blast radius: three new functions (two granted to authenticated, one
-- closed helper). Writes dream_team_servicios (rol_id, version, updated_at),
-- _estados_historial, _requisitos_verificacion and _capability_grants of the
-- changed person only. No existing object changes; «Cambiar de área» is
-- untouched (S4).
--
-- Rollback:
--   drop function if exists public.dream_team_servicio_cambiar_rol(uuid, uuid, text);
--   drop function if exists public.dream_team_servicio_roles_cambiables(uuid);
--   drop function if exists public.dream_team_servicio_cambiar_rol_validar(uuid, uuid);
-- Roles already changed stay (with their history rows).

-- ── 1. the rules ─────────────────────────────────────────────────────

-- p_rol NULL checks only who may open the dialog for the servicio.
create or replace function public.dream_team_servicio_cambiar_rol_validar(p_servicio uuid, p_rol uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_s record;
  v_director boolean;
begin
  select u.id into v_actor from public.usuarios u where auth.uid() is not null and u.auth_id = auth.uid();
  if v_actor is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select s.persona_id, s.equipo_id, s.rol_id, s.estado into v_s
    from public.dream_team_servicios s where s.id = p_servicio;
  if not found then
    raise exception 'servicio_inexistente' using errcode = '22023';
  end if;
  if not public.dream_team_puede_solicitar_cambio_area(v_s.equipo_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  v_director := public.dream_team_autoridad_director(v_s.equipo_id);
  if not v_director and v_s.persona_id = v_actor then
    raise exception 'propio_servicio' using errcode = '42501';
  end if;
  if v_s.estado = 'retirado' then
    raise exception 'servicio_retirado' using errcode = '22023';
  end if;
  if p_rol is null then
    return;
  end if;
  if not exists (select 1 from public.dream_team_roles r
                  where r.id = p_rol and r.equipo_id = v_s.equipo_id and r.activo) then
    raise exception 'rol_invalido' using errcode = '22023';
  end if;
  if p_rol = v_s.rol_id then
    raise exception 'mismo_rol' using errcode = '22023';
  end if;
  if not v_director
     and exists (select 1 from public.dream_team_roles r where r.id = p_rol and r.nivel = 'director') then
    raise exception 'rol_direccion' using errcode = '42501';
  end if;
  if exists (select 1 from public.dream_team_servicios o
              where o.persona_id = v_s.persona_id and o.equipo_id = v_s.equipo_id
                and o.rol_id = p_rol and o.estado <> 'retirado' and o.id <> p_servicio) then
    raise exception 'rol_duplicado' using errcode = '22023';
  end if;
end;
$$;

comment on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) is
  'Raises when the caller may not change the servicio to that rol (42501 sin_autoridad / rol_direccion / '
  'propio_servicio, 22023 servicio_inexistente / servicio_retirado / rol_invalido / mismo_rol / '
  'rol_duplicado). NULL rol checks only access. Internal to the cambiar-rol functions.';

revoke all on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dream_team_servicio_cambiar_rol_validar(uuid, uuid) to service_role;

-- ── 2. the read ──────────────────────────────────────────────────────

create or replace function public.dream_team_servicio_roles_cambiables(p_servicio uuid)
returns table (
  id uuid,
  label text,
  nivel text,
  actual boolean,
  asignable boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_s record;
  v_director boolean;
begin
  perform public.dream_team_servicio_cambiar_rol_validar(p_servicio, null);
  select s.persona_id, s.equipo_id, s.rol_id into v_s from public.dream_team_servicios s where s.id = p_servicio;
  v_director := public.dream_team_autoridad_director(v_s.equipo_id);

  return query
  select r.id, r.label, r.nivel,
         r.id = v_s.rol_id,
         r.id <> v_s.rol_id
           and r.activo
           and (v_director or r.nivel <> 'director')
           and not exists (select 1 from public.dream_team_servicios o
                            where o.persona_id = v_s.persona_id and o.equipo_id = v_s.equipo_id
                              and o.rol_id = r.id and o.estado <> 'retirado' and o.id <> p_servicio)
    from public.dream_team_roles r
   where r.equipo_id = v_s.equipo_id and (r.activo or r.id = v_s.rol_id)
   order by r.label, r.id;
end;
$$;

comment on function public.dream_team_servicio_roles_cambiables(uuid) is
  'The roles of the «Cambiar rol» dialog for a servicio: the active roles of its equipo plus the current '
  'one, with actual and asignable. Same access as dream_team_servicio_cambiar_rol.';

revoke all on function public.dream_team_servicio_roles_cambiables(uuid) from public, anon;
grant execute on function public.dream_team_servicio_roles_cambiables(uuid) to authenticated;

-- ── 3. the change ────────────────────────────────────────────────────

create or replace function public.dream_team_servicio_cambiar_rol(p_servicio uuid, p_rol uuid, p_nota text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_s record;
  v_experiencia text;
  v_rol_anterior text;
  v_rol_label text;
  v_nota text := nullif(btrim(p_nota), '');
  v_g record;
  v_n integer;
begin
  select s.id, s.persona_id, s.equipo_id, s.rol_id, s.estado into v_s
    from public.dream_team_servicios s where s.id = p_servicio
     for update;
  perform public.dream_team_servicio_cambiar_rol_validar(p_servicio, p_rol);
  select u.id into v_actor from public.usuarios u where u.auth_id = auth.uid();

  select e.experiencia into v_experiencia from public.dream_team_equipos e where e.id = v_s.equipo_id;
  select r.label into v_rol_anterior from public.dream_team_roles r where r.id = v_s.rol_id;
  select r.label into v_rol_label from public.dream_team_roles r where r.id = p_rol;

  update public.dream_team_servicios s
     set rol_id = p_rol, version = s.version + 1, updated_at = now()
   where s.id = p_servicio;
  insert into public.dream_team_estados_historial
    (servicio_id, estado_anterior, estado_nuevo, motivo, detalle_motivo, actor_persona_id)
  values (p_servicio, v_s.estado, v_s.estado, 'reasignacion',
          concat_ws(' · ', 'Cambio de rol', 'De ' || v_rol_anterior || ' a ' || v_rol_label, v_nota), v_actor);
  insert into public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
  select p_servicio, rq.id, 'pendiente'
    from public.dream_team_requisitos rq
   where rq.rol_id = p_rol
  on conflict (servicio_id, requisito_id) do nothing;

  -- What any nivel could have minted for the old rol (as
  -- dream_team_cambiar_area_mover does for the origin), unless another active
  -- servicio of the person mints it too; the new rol's set is written below.
  update public.dream_team_capability_grants g
     set revoked_at = now()
    from (select k.capability_key, k.experience, k.scope_type, k.scope_id
            from public.dream_team_grants_de_servicio(v_s.equipo_id, v_experiencia, v_s.rol_id, v_rol_anterior) k
          union
          select k.capability_key, k.experience, k.scope_type, k.scope_id
            from unnest(array['Voluntario', 'Lider', 'Coordinador', 'Director']) as n(label)
           cross join lateral public.dream_team_grants_de_servicio(v_s.equipo_id, v_experiencia, null, n.label) k
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
        where o.persona_id = v_s.persona_id and o.estado = 'activo' and o.id <> p_servicio
          and ok.capability_key = k.capability_key and ok.experience = k.experience
          and ok.scope_type = k.scope_type and ok.scope_id is not distinct from k.scope_id);

  if v_s.estado = 'activo' then
    for v_g in
      select * from public.dream_team_grants_de_servicio(v_s.equipo_id, v_experiencia, p_rol, v_rol_label)
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

  return jsonb_build_object('servicio_id', p_servicio, 'rol_anterior_id', v_s.rol_id,
                            'rol_id', p_rol, 'rol_label', v_rol_label);
end;
$$;

comment on function public.dream_team_servicio_cambiar_rol(uuid, uuid, text) is
  'Changes the rol of a servicio inside its equipo at once (S1–S3): only rol_id (and version) change; '
  'history row signed by the caller, verificaciones of the new rol, grants moved. Access: '
  'dream_team_puede_solicitar_cambio_area; without director authority neither one''s own servicio nor a '
  'director-level rol.';

revoke all on function public.dream_team_servicio_cambiar_rol(uuid, uuid, text) from public, anon;
grant execute on function public.dream_team_servicio_cambiar_rol(uuid, uuid, text) to authenticated;
