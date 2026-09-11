-- Paso 4.1 — Dream Team: persistir las capacidades del ciclo del voluntario.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- La cadena que acuña capacidades cuando un servicio pasa a `activo` está
-- escrita, probada… y desconectada:
--
--   lib/platform/dream-team/servicios.ts:46  transitionWithGrants(...)
--     └ grants.ts:222  applyGrantsForTransition(...)
--         └ grants.ts:142  buildGrantsForServicio(...)
--
-- `rg applyGrantsForTransition --glob '!__tests__'` sólo la encuentra dentro de
-- esos dos archivos. `PATCH /api/dream-team/servicios/[id]` valida la transición
-- con el `transition()` puro y después llama `updateServicio`; nunca invoca
-- `transitionWithGrants` ni escribe en `dream_team_capability_grants`.
--
-- El único camino que sí funciona es el disparador de talleres, y tiene un corte
-- explícito por experiencia:
--
--   IF v_experiencia IS DISTINCT FROM 'talleres_crecimiento' THEN RETURN NEW;
--
-- Es decir: activar a alguien en DPS, Niños o Estudiantes acuña CERO capacidades.
--
-- Además `dream_team_capability_grants` tiene RLS con una única política, de
-- SELECT, así que la aplicación no podría escribir grants ni aunque llamara a la
-- función. Talleres esquiva eso con una RPC SECURITY DEFINER.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Una RPC SECURITY DEFINER que recibe la decisión ya calculada por la capa de
-- aplicación (`GrantsDecision.grants`) y la persiste. La lógica de QUÉ acuñar
-- sigue en TypeScript, donde ya está probada y donde vive el manejo de pausa y
-- restauración; esta función sólo resuelve el CÓMO escribirlo.
--
-- ── AUTORIZACIÓN ───────────────────────────────────────────────────────
-- Es más estricta que el patrón de talleres, a propósito.
-- `assign_talleres_capabilities_for_role` no verifica al llamador; está a salvo
-- sólo porque su ACL excluye a `authenticated` (verificado: `postgres=X |
-- service_role=X`) y porque se invoca desde un disparador.
--
-- Ésta se otorga a `authenticated` para que la ruta la llame con el cliente del
-- usuario, sin clave de servicio, y por eso lleva el control adentro:
--
--   · Resuelve al actor por `usuarios.auth_id = auth.uid()`; sin sesión, rechaza.
--   · Por CADA capacidad a escribir, verifica que el actor tenga autoridad SOBRE
--     ESE ALCANCE. Si el `scope_id` es un nodo del árbol, usa
--     `auth_has_dream_team_capability_in_tree`, así un Director de DPS puede
--     activar gente en Cámaras pero NO en Conexión. Si no lo es, exige autoridad
--     global.
--   · Nunca confía en el `persona_id` recibido para decidir permisos: sólo para
--     decidir a quién se le escribe.
--
-- Esto cierra el círculo con el Paso 3: el mismo recorrido de árbol que gobierna
-- la lectura gobierna quién puede otorgar.
--
-- ── POR QUÉ NULL-SAFE A MANO Y NO ON CONFLICT ──────────────────────────
-- La restricción única de la tabla incluye `scope_id`, que es nullable. En
-- Postgres dos filas con `scope_id` NULL no se consideran duplicadas, así que
-- `ON CONFLICT` no dispararía para las capacidades de alcance global. Se resuelve
-- con UPDATE-primero e INSERT-si-no-existe, comparando con `IS NOT DISTINCT FROM`.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva. Crea una función nueva; no modifica ninguna política, tabla ni
-- disparador existente. Nadie la llama hasta que se cablee el PATCH. El camino
-- de talleres queda intacto y sigue usando su propio disparador. Cero impacto
-- sobre Grupos de Vida.

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

  -- ── Actor ────────────────────────────────────────────────────────────
  select u.id into v_actor
  from public.usuarios u
  where u.auth_id = auth.uid();

  if v_actor is null then
    raise exception 'dream_team_apply_servicio_grants: sin sesion valida'
      using errcode = '42501';
  end if;

  -- ── Autorización por alcance, capacidad por capacidad ────────────────
  for v_grant in select value from jsonb_array_elements(p_grants) loop
    v_scope_id := nullif(v_grant->>'scope_id', '');

    v_es_nodo := v_scope_id is not null
      and exists (
        select 1 from public.dream_team_equipos e where e.id::text = v_scope_id
      );

    if v_es_nodo then
      if not (
        auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', v_scope_id::uuid)
        or auth_has_dream_team_capability_in_tree('dream_team.org.manage', v_scope_id::uuid)
      ) then
        raise exception 'dream_team_apply_servicio_grants: sin autoridad sobre el equipo %', v_scope_id
          using errcode = '42501';
      end if;
    else
      if not (
        auth_has_dream_team_capability('dream_team.director.coordinate')
        or auth_has_dream_team_capability('dream_team.org.manage')
      ) then
        raise exception 'dream_team_apply_servicio_grants: se requiere autoridad global para un alcance no jerarquico'
          using errcode = '42501';
      end if;
    end if;
  end loop;

  -- ── Escritura ────────────────────────────────────────────────────────
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
      -- Reactivar una fila previamente revocada, si existe.
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

comment on function public.dream_team_apply_servicio_grants(uuid, text, jsonb) is
  'Persiste la decision de capacidades calculada por applyGrantsForTransition. '
  'La logica de QUE acunar vive en TypeScript; esta funcion resuelve el COMO. '
  'Verifica autoridad del llamador sobre CADA alcance via '
  'auth_has_dream_team_capability_in_tree, de modo que un director de area solo '
  'puede otorgar dentro de su rama del arbol. source = dream-team-servicio.';

-- La ruta la invoca con el cliente del usuario, no con clave de servicio: el
-- control de autoridad vive adentro de la función.
revoke all on function public.dream_team_apply_servicio_grants(uuid, text, jsonb) from public;
revoke all on function public.dream_team_apply_servicio_grants(uuid, text, jsonb) from anon;
grant execute on function public.dream_team_apply_servicio_grants(uuid, text, jsonb) to authenticated;
grant execute on function public.dream_team_apply_servicio_grants(uuid, text, jsonb) to service_role;
