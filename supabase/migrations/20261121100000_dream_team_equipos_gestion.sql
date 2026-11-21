-- noqa: insert-into
-- Dream Team: directors create, rename, deactivate and move equipos
-- (odd/tasks/dream-team-estructura-correcciones.md, T3, S4, S5).
--
-- What:
--   1. dream_team_gestiona_equipo(equipo): who may reshape that part of the
--      tree: admin or pastor (es_admin_o_pastor), or dream_team.direct or
--      dream_team.org.manage on the equipo or an ancestor
--      (auth_has_dream_team_capability_in_tree). "Directores hacia arriba"
--      (S4): dream_team.director.coordinate and every coordinator / lead /
--      volunteer capability give none. Unlike dream_team_autoridad_director
--      (20261104100000), it leaves director.coordinate out on purpose.
--   2. dream_team_equipo_crear(padre, label): «+ Subequipo» (S4). The new
--      equipo inherits the parent's experiencia (as the server action did).
--      Needs dream_team_gestiona_equipo(padre).
--   3. dream_team_equipo_renombrar(equipo, label) and
--      dream_team_equipo_cambiar_activo(equipo, activo): «Renombrar» and
--      «Desactivar» / «Activar». Need dream_team_gestiona_equipo(equipo).
--      «Desactivar» refuses the DPS anchors ('equipo_ancla', for everyone,
--      org.manage and admin included): the DPS planning resolves them by
--      label and parent. Reactivating one is allowed (T6).
--   4. dream_team_equipo_mover(equipo, nuevo_padre): «Mover a…» (S5). Needs
--      dream_team_gestiona_equipo over the CURRENT parent and over the new
--      one (authority over origin and destination). Refuses a root, the same
--      parent, a cycle (the new parent is the equipo or below it), an anchor
--      the DPS planning resolves by label and parent (dps_raiz,
--      dps_raiz_musica, dps_equipo_produccion_creativa, dps_equipo_productores,
--      dps_equipo_cantantes; dream_team_equipo_es_ancla_dps, shared with
--      «Desactivar») and a label the destination already has.
--      People, roles, servicios, turnos and grants stay as they are: the
--      equipo keeps its id, so every servicio, rol and equipo-scoped grant
--      goes with it, and the grants (scoped by equipo id and inherited down
--      the tree) follow the new position on their own.
--      Experiencia: when the new parent's experiencia differs from the
--      equipo's, every node of the moved subtree that had the equipo's
--      experiencia takes the new one (a node of a third experiencia inside it,
--      like Próximo Paso under DPS, keeps its own). That change is refused
--      ('experiencia_con_datos') when one of those nodes carries data bound
--      to its experiencia: a taller, a talleres cohort or temporada, an
--      Estudiantes ámbito, year or grupo, or a Niños salón.
--      DPS: the DPS puestos of the moved equipos keep their equipo; inside
--      DPS they simply show under the new path. When equipos LEAVE
--      dps_equipos() (e.g. Bautizos to Dirección de Conexión) and a puesto of
--      theirs has people convocados by hand in a plan from today on, the move
--      is refused ('dps_convocados_pendientes'): take them out of those plans
--      first. Past plans keep their history. Afterwards
--      dps_directores_puestos_sincronizar() runs, so the automatic «Director
--      de …» puestos follow at once (Bautizos' one is deactivated; an equipo
--      that becomes a direct child of DPS gets one).
--      Experience-specific grants already minted (dps.team.*, …) are not
--      rewritten; servicios activated from now on mint the new experiencia's.
--
-- Errors (RAISE '<code>'): 42501 'sin_sesion', 'sin_autoridad'; 22023
-- 'padre_invalido', 'equipo_invalido', 'destino_invalido', 'nombre_invalido',
-- 'nombre_repetido', 'activo_invalido', 'equipo_raiz', 'mismo_padre',
-- 'ciclo', 'equipo_ancla', 'experiencia_con_datos',
-- 'dps_convocados_pendientes'. The app maps each code to a Spanish message.
--
-- The RLS policies of dream_team_equipos (org.manage only) do not change:
-- these functions are the only way a director writes the tree, and they
-- never touch any column but label, activo, parent_equipo_id and experiencia.
--
-- Blast radius: six new functions (four RPCs for authenticated, two closed
-- helpers) plus the gate. No table, policy or existing function changes.
--
-- Rollback:
--   drop function if exists public.dream_team_equipo_mover(uuid, uuid);
--   drop function if exists public.dream_team_equipo_cambiar_activo(uuid, boolean);
--   drop function if exists public.dream_team_equipo_renombrar(uuid, text);
--   drop function if exists public.dream_team_equipo_crear(uuid, text);
--   drop function if exists public.dream_team_equipo_es_ancla_dps(uuid);
--   drop function if exists public.dream_team_equipo_json(uuid);
--   drop function if exists public.dream_team_gestiona_equipo(uuid);
-- Equipos created, renamed or moved stay as ordinary rows.

-- ── 1. the gate ──────────────────────────────────────────────────────

create or replace function public.dream_team_gestiona_equipo(p_equipo_id uuid)
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
          or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', p_equipo_id))
$$;

comment on function public.dream_team_gestiona_equipo(uuid) is
  'Whether the caller may reshape the tree at an equipo: admin or pastor, or dream_team.direct / '
  'dream_team.org.manage on it or an ancestor (directors and up; not director.coordinate nor coordinators).';

revoke all on function public.dream_team_gestiona_equipo(uuid) from public, anon;
grant execute on function public.dream_team_gestiona_equipo(uuid) to authenticated;

-- The equipo as the RPCs return it.
create or replace function public.dream_team_equipo_json(p_equipo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object('id', e.id, 'experiencia', e.experiencia, 'parent_equipo_id', e.parent_equipo_id,
                            'label', e.label, 'activo', e.activo)
    from public.dream_team_equipos e
   where e.id = p_equipo_id
$$;

comment on function public.dream_team_equipo_json(uuid) is
  'An equipo as jsonb (id, experiencia, parent_equipo_id, label, activo). Internal to the dream_team_equipo_* RPCs.';

revoke all on function public.dream_team_equipo_json(uuid) from public, anon, authenticated;
grant execute on function public.dream_team_equipo_json(uuid) to service_role;

-- The DPS anchors: the equipos the DPS planning resolves by label and parent.
-- Neither «Mover a…» nor «Desactivar» may touch them.
create or replace function public.dream_team_equipo_es_ancla_dps(p_equipo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1
                   from unnest(array[public.dps_raiz(), public.dps_raiz_musica(),
                                     public.dps_equipo_produccion_creativa(),
                                     public.dps_equipo_productores(),
                                     public.dps_equipo_cantantes()]) as x
                  where x is not null and x = p_equipo_id)
$$;

comment on function public.dream_team_equipo_es_ancla_dps(uuid) is
  'Whether an equipo is a DPS anchor (dps_raiz, dps_raiz_musica, dps_equipo_produccion_creativa, '
  'dps_equipo_productores, dps_equipo_cantantes). Internal to dream_team_equipo_mover and _cambiar_activo.';

revoke all on function public.dream_team_equipo_es_ancla_dps(uuid) from public, anon, authenticated;
grant execute on function public.dream_team_equipo_es_ancla_dps(uuid) to service_role;

-- ── 2. create ────────────────────────────────────────────────────────

create or replace function public.dream_team_equipo_crear(p_padre uuid, p_label text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_experiencia text;
  v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.usuarios u where u.auth_id = auth.uid()) then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  select e.experiencia into v_experiencia from public.dream_team_equipos e where e.id = p_padre;
  if not found then
    raise exception 'padre_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_gestiona_equipo(p_padre) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if v_label = '' or char_length(v_label) > 120 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.dream_team_equipos e where e.parent_equipo_id = p_padre and e.label = v_label) then
    raise exception 'nombre_repetido' using errcode = '22023';
  end if;

  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  values (v_experiencia, p_padre, v_label, true)
  returning id into v_id;

  return public.dream_team_equipo_json(v_id);
exception
  when unique_violation then
    raise exception 'nombre_repetido' using errcode = '22023';
end;
$$;

comment on function public.dream_team_equipo_crear(uuid, text) is
  '«+ Subequipo» (S4): creates an active equipo under p_padre with its experiencia. The caller needs '
  'dream_team_gestiona_equipo(p_padre). Returns the equipo as jsonb.';

revoke all on function public.dream_team_equipo_crear(uuid, text) from public, anon;
grant execute on function public.dream_team_equipo_crear(uuid, text) to authenticated;

-- ── 3. rename and (de)activate ───────────────────────────────────────

create or replace function public.dream_team_equipo_renombrar(p_equipo uuid, p_label text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_padre uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.usuarios u where u.auth_id = auth.uid()) then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  select e.parent_equipo_id into v_padre from public.dream_team_equipos e where e.id = p_equipo for update;
  if not found then
    raise exception 'equipo_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_gestiona_equipo(p_equipo) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if v_label = '' or char_length(v_label) > 120 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id is not distinct from v_padre and e.label = v_label and e.id <> p_equipo) then
    raise exception 'nombre_repetido' using errcode = '22023';
  end if;

  update public.dream_team_equipos e
     set label = v_label, updated_at = now()
   where e.id = p_equipo and e.label <> v_label;

  return public.dream_team_equipo_json(p_equipo);
exception
  when unique_violation then
    raise exception 'nombre_repetido' using errcode = '22023';
end;
$$;

comment on function public.dream_team_equipo_renombrar(uuid, text) is
  '«Renombrar» (S4): the caller needs dream_team_gestiona_equipo(p_equipo). Returns the equipo as jsonb.';

revoke all on function public.dream_team_equipo_renombrar(uuid, text) from public, anon;
grant execute on function public.dream_team_equipo_renombrar(uuid, text) to authenticated;

create or replace function public.dream_team_equipo_cambiar_activo(p_equipo uuid, p_activo boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.usuarios u where u.auth_id = auth.uid()) then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  perform 1 from public.dream_team_equipos e where e.id = p_equipo for update;
  if not found then
    raise exception 'equipo_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_gestiona_equipo(p_equipo) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_activo is null then
    raise exception 'activo_invalido' using errcode = '22023';
  end if;
  if not p_activo and public.dream_team_equipo_es_ancla_dps(p_equipo) then
    raise exception 'equipo_ancla' using errcode = '22023';
  end if;

  update public.dream_team_equipos e
     set activo = p_activo, updated_at = now()
   where e.id = p_equipo and e.activo <> p_activo;

  return public.dream_team_equipo_json(p_equipo);
end;
$$;

comment on function public.dream_team_equipo_cambiar_activo(uuid, boolean) is
  '«Desactivar» / «Activar» (S4): the caller needs dream_team_gestiona_equipo(p_equipo); a DPS anchor cannot be '
  'deactivated (equipo_ancla). Returns the equipo as jsonb.';

revoke all on function public.dream_team_equipo_cambiar_activo(uuid, boolean) from public, anon;
grant execute on function public.dream_team_equipo_cambiar_activo(uuid, boolean) to authenticated;

-- ── 4. move ──────────────────────────────────────────────────────────

create or replace function public.dream_team_equipo_mover(p_equipo uuid, p_nuevo_padre uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_eq record;
  v_destino record;
  v_subarbol uuid[];
  v_cambian uuid[] := '{}'::uuid[];
  v_dps_antes uuid[];
  v_dps_salen uuid[];
begin
  if auth.uid() is null or not exists (select 1 from public.usuarios u where u.auth_id = auth.uid()) then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  select e.id, e.parent_equipo_id, e.experiencia, e.label into v_eq
    from public.dream_team_equipos e where e.id = p_equipo for update;
  if not found then
    raise exception 'equipo_invalido' using errcode = '22023';
  end if;
  if v_eq.parent_equipo_id is null then
    raise exception 'equipo_raiz' using errcode = '22023';
  end if;
  if not public.dream_team_gestiona_equipo(v_eq.parent_equipo_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select e.id, e.experiencia into v_destino
    from public.dream_team_equipos e where e.id = p_nuevo_padre and e.activo;
  if not found then
    raise exception 'destino_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_gestiona_equipo(p_nuevo_padre) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_nuevo_padre = v_eq.parent_equipo_id then
    raise exception 'mismo_padre' using errcode = '22023';
  end if;

  with recursive sub as (
    select e.id, 0 as profundidad from public.dream_team_equipos e where e.id = p_equipo
    union all
    select h.id, s.profundidad + 1
      from public.dream_team_equipos h
      join sub s on h.parent_equipo_id = s.id
     where s.profundidad < 16
  )
  select array_agg(s.id) into v_subarbol from sub s;

  if p_nuevo_padre = any (v_subarbol) then
    raise exception 'ciclo' using errcode = '22023';
  end if;
  if public.dream_team_equipo_es_ancla_dps(p_equipo) then
    raise exception 'equipo_ancla' using errcode = '22023';
  end if;
  if exists (select 1 from public.dream_team_equipos e
              where e.parent_equipo_id = p_nuevo_padre and e.label = v_eq.label) then
    raise exception 'nombre_repetido' using errcode = '22023';
  end if;

  if v_destino.experiencia <> v_eq.experiencia then
    select coalesce(array_agg(e.id), '{}'::uuid[]) into v_cambian
      from public.dream_team_equipos e
     where e.id = any (v_subarbol) and e.experiencia = v_eq.experiencia;
    if exists (select 1 from public.talleres t where t.dream_team_equipo_id = any (v_cambian))
       or exists (select 1 from public.talleres_crecimiento_cohortes c where c.dream_team_equipo_id = any (v_cambian))
       or exists (select 1 from public.talleres_temporadas t where t.dream_team_equipo_id = any (v_cambian))
       or exists (select 1 from public.estudiantes_escala x where x.ambito_id = any (v_cambian))
       or exists (select 1 from public.estudiantes_grupos g
                   where g.ambito_id = any (v_cambian) or g.subarea_id = any (v_cambian))
       or exists (select 1 from public.ninos_salones s where s.equipo_id = any (v_cambian)) then
      raise exception 'experiencia_con_datos' using errcode = '22023';
    end if;
  end if;

  select coalesce(array_agg(d.equipo_id), '{}'::uuid[]) into v_dps_antes
    from public.dps_equipos() d where d.equipo_id = any (v_subarbol);

  update public.dream_team_equipos e
     set parent_equipo_id = p_nuevo_padre, updated_at = now()
   where e.id = p_equipo;
  update public.dream_team_equipos e
     set experiencia = v_destino.experiencia, updated_at = now()
   where e.id = any (v_cambian);

  -- A later statement: dps_equipos() sees the new tree.
  select coalesce(array_agg(a.id), '{}'::uuid[]) into v_dps_salen
    from unnest(v_dps_antes) as a(id)
   where not exists (select 1 from public.dps_equipos() d where d.equipo_id = a.id);
  if exists (select 1
               from public.dps_convocados c
               join public.dps_puestos pu on pu.id = c.puesto_id
               join public.dps_planes p on p.id = c.plan_id
              where pu.equipo_id = any (v_dps_salen) and pu.activo and not c.automatico
                and p.fecha >= public.ninos_hoy()) then
    raise exception 'dps_convocados_pendientes' using errcode = '22023';
  end if;

  perform public.dps_directores_puestos_sincronizar();

  return public.dream_team_equipo_json(p_equipo)
         || jsonb_build_object('ruta', public.dream_team_equipo_ruta(p_equipo),
                               'experiencia_anterior', v_eq.experiencia,
                               'equipos_movidos', coalesce(array_length(v_subarbol, 1), 0));
end;
$$;

comment on function public.dream_team_equipo_mover(uuid, uuid) is
  '«Mover a…» (S5): hangs p_equipo (and its subtree, people and servicios) from p_nuevo_padre. Needs '
  'dream_team_gestiona_equipo over the current parent and the new one; refuses roots, cycles, DPS anchors and '
  'repeated labels; carries the destination experiencia down the subtree unless experiencia-bound data would '
  'break; refuses leaving DPS with manual convocados from today on; re-syncs the DPS director puestos. Returns '
  'the equipo as jsonb plus ruta, experiencia_anterior and equipos_movidos.';

revoke all on function public.dream_team_equipo_mover(uuid, uuid) from public, anon;
grant execute on function public.dream_team_equipo_mover(uuid, uuid) to authenticated;
