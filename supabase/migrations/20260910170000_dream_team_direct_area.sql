-- Paso 4.2 (b) — Dream Team: separar al director de ÁREA del jefe GLOBAL.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- `dream_team.director.coordinate` está declarada en el catálogo con
-- `scopeType: 'experience'` (lib/platform/experiences.ts:55). En
-- `lib/platform/dream-team/grants.ts:121`, `scopeIdForGrant()` devuelve
-- `undefined` para ese tipo de alcance, así que el grant nace con
-- `scope_id = NULL`. Y `scope_id IS NULL` es —por diseño nuestro— ALCANCE
-- GLOBAL: es el mecanismo con el que se expresa la autoridad transversal de la
-- persona a cargo de Dream Team.
--
-- Como el rol `director` mapea a esa capacidad
-- (grants.ts:66), asignar a alguien como director de Cámaras le daba autoridad
-- sobre TODA la iglesia, Conexión y Grupos de Vida incluidas.
--
-- No es un defecto introducido ahora: viene del catálogo de Fase 2, cuando Dream
-- Team era una sola cosa plana y "director" significaba el jefe global. El árbol
-- del Paso 2 volvió a separar dos figuras que el organigrama siempre tuvo
-- distintas, y el catálogo tiene que seguirlo.
--
-- `dream_team.lead` y `dream_team.coordinate` NO tienen este problema: están
-- declaradas con `scopeType: 'equipo'`, así que nacen acotadas al nodo.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Suma la capacidad `dream_team.direct` a las políticas y a la verificación de
-- autoridad de la RPC. Del lado de la aplicación, el catálogo la declara con
-- `scopeType: 'equipo'` y el rol `director` pasa a acuñar ésta en vez de la
-- global.
--
--   dream_team.direct              → director de un ÁREA, acotado al nodo.
--   dream_team.director.coordinate → persona a cargo de Dream Team, global,
--                                    otorgada a mano con scope_id NULL.
--
-- Ambas se conservan en las políticas: la global sigue siendo válida y sigue
-- alcanzando todo, que es lo que corresponde.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva: sólo SUMA términos a las políticas existentes; no quita ninguno. Los
-- siete términos `talleres_crecimiento.*` siguen textuales. Hoy nadie tiene
-- `dream_team.direct` (es nueva), así que no habilita a nadie hasta la primera
-- asignación. Cero impacto sobre Grupos de Vida.

-- ── dream_team_equipos ─────────────────────────────────────────────────
drop policy if exists dream_team_equipos_select on public.dream_team_equipos;
create policy dream_team_equipos_select on public.dream_team_equipos
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', id)
    or auth_has_dream_team_capability_in_tree('dream_team.serve', id)
    or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', id)
  );

-- ── dream_team_roles ───────────────────────────────────────────────────
drop policy if exists dream_team_roles_select on public.dream_team_roles;
create policy dream_team_roles_select on public.dream_team_roles
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.serve', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', equipo_id)
  );

-- ── dream_team_servicios ───────────────────────────────────────────────
drop policy if exists dream_team_servicios_select on public.dream_team_servicios;
create policy dream_team_servicios_select on public.dream_team_servicios
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', equipo_id)
    or persona_id = (select u.id from public.usuarios u where u.auth_id = auth.uid())
  );

drop policy if exists dream_team_servicios_insert on public.dream_team_servicios;
create policy dream_team_servicios_insert on public.dream_team_servicios
  for insert to public
  with check (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );

drop policy if exists dream_team_servicios_update on public.dream_team_servicios;
create policy dream_team_servicios_update on public.dream_team_servicios
  for update to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  )
  with check (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );

-- ── RPC de capacidades: sumar dream_team.direct a la autoridad ─────────
-- Idéntica a 20260910150000 salvo por el término nuevo en las dos ramas de
-- verificación. Se reemplaza entera para que el cuerpo quede en un solo lugar.
create or replace function public.dream_team_apply_servicio_grants(
  p_persona_id uuid,
  p_accion     text,
  p_grants     jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor         uuid;
  v_grant         jsonb;
  v_scope_id      text;
  v_es_nodo       boolean;
  v_capability    text;
  v_experience    text;
  v_scope_type    text;
  v_afectados     integer := 0;
  v_actualizados  integer;
begin
  if p_accion not in ('grant', 'revoke') then
    raise exception 'dream_team_apply_servicio_grants: accion invalida (%), se espera grant o revoke', p_accion
      using errcode = '22023';
  end if;

  if p_persona_id is null then
    raise exception 'dream_team_apply_servicio_grants: persona_id es obligatorio'
      using errcode = '22023';
  end if;

  if p_grants is null or jsonb_typeof(p_grants) <> 'array' then
    raise exception 'dream_team_apply_servicio_grants: grants debe ser un arreglo json'
      using errcode = '22023';
  end if;

  select u.id into v_actor
  from public.usuarios u
  where u.auth_id = auth.uid();

  if v_actor is null then
    raise exception 'dream_team_apply_servicio_grants: sin sesion valida'
      using errcode = '42501';
  end if;

  for v_grant in select value from jsonb_array_elements(p_grants) loop
    v_scope_id := nullif(v_grant->>'scope_id', '');

    v_es_nodo := v_scope_id is not null
      and exists (
        select 1 from public.dream_team_equipos e where e.id::text = v_scope_id
      );

    if v_es_nodo then
      if not (
        auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', v_scope_id::uuid)
        or auth_has_dream_team_capability_in_tree('dream_team.direct', v_scope_id::uuid)
        or auth_has_dream_team_capability_in_tree('dream_team.org.manage', v_scope_id::uuid)
      ) then
        raise exception 'dream_team_apply_servicio_grants: sin autoridad sobre el equipo %', v_scope_id
          using errcode = '42501';
      end if;
    else
      -- Un alcance sin nodo (capacidad de experiencia) sólo lo puede otorgar
      -- alguien con autoridad global: la persona a cargo de Dream Team o quien
      -- administra la estructura. Un director de ÁREA no puede acuñar globales.
      if not (
        auth_has_dream_team_capability('dream_team.director.coordinate')
        or auth_has_dream_team_capability('dream_team.org.manage')
      ) then
        raise exception 'dream_team_apply_servicio_grants: se requiere autoridad global para un alcance no jerarquico'
          using errcode = '42501';
      end if;
    end if;
  end loop;

  for v_grant in select value from jsonb_array_elements(p_grants) loop
    v_capability := v_grant->>'capability_key';
    v_experience := v_grant->>'experience';
    v_scope_type := v_grant->>'scope_type';
    v_scope_id   := nullif(v_grant->>'scope_id', '');

    if v_capability is null or v_experience is null or v_scope_type is null then
      raise exception 'dream_team_apply_servicio_grants: capacidad mal formada %', v_grant
        using errcode = '22023';
    end if;

    if p_accion = 'revoke' then
      update public.dream_team_capability_grants g
      set revoked_at = now()
      where g.persona_id     = p_persona_id
        and g.capability_key = v_capability
        and g.experience     = v_experience
        and g.scope_type     = v_scope_type
        and g.scope_id       is not distinct from v_scope_id
        and g.source         = 'dream-team-servicio'
        and g.revoked_at     is null;

      get diagnostics v_actualizados = row_count;
      v_afectados := v_afectados + v_actualizados;

    else
      update public.dream_team_capability_grants g
      set revoked_at = null,
          granted_at = now()
      where g.persona_id     = p_persona_id
        and g.capability_key = v_capability
        and g.experience     = v_experience
        and g.scope_type     = v_scope_type
        and g.scope_id       is not distinct from v_scope_id
        and g.source         = 'dream-team-servicio';

      get diagnostics v_actualizados = row_count;

      if v_actualizados = 0 then
        insert into public.dream_team_capability_grants
          (persona_id, capability_key, experience, scope_type, scope_id, source, granted_at)
        values
          (p_persona_id, v_capability, v_experience, v_scope_type, v_scope_id, 'dream-team-servicio', now());
        v_actualizados := 1;
      end if;

      v_afectados := v_afectados + v_actualizados;
    end if;
  end loop;

  return v_afectados;
end;
$function$;
