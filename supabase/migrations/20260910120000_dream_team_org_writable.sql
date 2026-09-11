-- Paso 1 — Dream Team: abrir la escritura de la estructura organizativa
--                       y reparar el gate de capability del dominio.
--
-- ── PROBLEMA A · La estructura es de solo lectura ──────────────────────
-- `dream_team_equipos` y `dream_team_roles` tienen RLS habilitado con UNA sola
-- política, de SELECT (20260822000001_talleres_dream_team_core_rls.sql). No hay
-- INSERT ni UPDATE, y el repositorio de aplicación no expone createEquipo ni
-- createRol. El árbol organizativo sólo se puede sembrar por migración a mano.
-- Ese candado es la razón de fondo por la que Talleres tuvo que inventar
-- `taller_grupo_asignaciones` en lugar de colgarse del árbol de Dream Team.
--
-- ── PROBLEMA B · El gate del dominio está muerto ───────────────────────
-- `auth_has_dream_team_capability(text)` compara `persona_id = auth.uid()`.
-- `persona_id` referencia `usuarios.id`; `auth.uid()` devuelve el id de auth,
-- que vive en `usuarios.auth_id`. Son columnas distintas. Verificado contra
-- producción: de los 131 usuarios con login, en CERO casos `id = auth_id`.
-- La función devuelve `false` para todo el mundo, siempre, y toda política que
-- dependa de ella queda en negación total. Es el mismo defecto de comparación
-- cruzada que ya se corrigió para talleres en
-- 20260822000002_talleres_fix_assign_capabilities_uuid_text.sql.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
--   1. Repara `auth_has_dream_team_capability` con el join correcto.
--   2. Ensancha las políticas SELECT de equipos y roles (aditivo: cada término
--      previo se conserva textualmente) para que un director de un área que no
--      es talleres pueda leer su rama del árbol.
--   3. Agrega INSERT / UPDATE sobre equipos y roles, gateados por la capability
--      nueva `dream_team.org.manage`.
--   4. Agrega los tres índices únicos que faltaban, incluido el que hoy permite
--      asignar dos veces la misma persona al mismo rol del mismo equipo.
--
-- ── POR QUÉ NO HAY DELETE ──────────────────────────────────────────────
-- Un nodo del árbol se desactiva con `activo = false`, nunca se borra:
-- `dream_team_servicios.equipo_id` y `rol_id` son FK ON DELETE RESTRICT, y
-- borrar historial de servicio no es reversible.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva, forward-only, idempotente.
--   · Reparar el gate: en producción NINGUNA política lo referencia todavía, así
--     que la reparación es literalmente un no-op ahí. En staging lo referencian
--     10 políticas sobre requisitos / requisitos_verificacion / estados_historial
--     / participation_eventos, hoy todas en negación total; al repararlo empiezan
--     a comportarse como fueron diseñadas. Ninguna capability `dream_team.*`
--     está otorgada en producción, y en staging hay exactamente un grant de
--     `dream_team.serve`.
--   · Escritura del árbol: nadie tiene `dream_team.org.manage` todavía, así que
--     las políticas nuevas no habilitan a nadie hasta otorgarla explícitamente.
--   · Cero impacto sobre Grupos de Vida: no se toca `roles_sistema`,
--     `usuario_roles`, `grupos`, `grupo_miembros` ni `segmento_lideres`.

-- ── 1. Reparar el gate de capability del dominio Dream Team ────────────
create or replace function public.auth_has_dream_team_capability(p_capability_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.dream_team_capability_grants g
    inner join public.usuarios u on u.id = g.persona_id
    where u.auth_id = auth.uid()
      and g.capability_key = p_capability_key
      and g.revoked_at is null
  )
$function$;

comment on function public.auth_has_dream_team_capability(text) is
  'Gate plano de capability para el dominio Dream Team. Resuelve la persona por '
  'usuarios.auth_id = auth.uid(); comparar persona_id contra auth.uid() '
  'directamente es el defecto que esta migracion corrige. Sin predicado de '
  'scope: la variante jerarquica llega en el Paso 3.';

-- ── 2. SELECT ensanchado: equipos ──────────────────────────────────────
-- Los siete términos talleres_crecimiento.* se conservan sin cambios; sólo se
-- suman los términos del dominio Dream Team.
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
    -- Dream Team (nuevo): el árbol es referencia compartida de todas las áreas.
    or auth_has_dream_team_capability('dream_team.org.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
    or auth_has_dream_team_capability('dream_team.coordinate')
    or auth_has_dream_team_capability('dream_team.lead')
    or auth_has_dream_team_capability('dream_team.serve')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

-- ── 2b. SELECT ensanchado: roles ───────────────────────────────────────
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
    -- Dream Team (nuevo).
    or auth_has_dream_team_capability('dream_team.org.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
    or auth_has_dream_team_capability('dream_team.coordinate')
    or auth_has_dream_team_capability('dream_team.lead')
    or auth_has_dream_team_capability('dream_team.serve')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

-- ── 3. Escritura de la estructura: sólo dream_team.org.manage ──────────
drop policy if exists dream_team_equipos_insert on public.dream_team_equipos;
create policy dream_team_equipos_insert on public.dream_team_equipos
  for insert to public
  with check (auth_has_dream_team_capability('dream_team.org.manage'));

drop policy if exists dream_team_equipos_update on public.dream_team_equipos;
create policy dream_team_equipos_update on public.dream_team_equipos
  for update to public
  using (auth_has_dream_team_capability('dream_team.org.manage'))
  with check (auth_has_dream_team_capability('dream_team.org.manage'));

drop policy if exists dream_team_roles_insert on public.dream_team_roles;
create policy dream_team_roles_insert on public.dream_team_roles
  for insert to public
  with check (auth_has_dream_team_capability('dream_team.org.manage'));

drop policy if exists dream_team_roles_update on public.dream_team_roles;
create policy dream_team_roles_update on public.dream_team_roles
  for update to public
  using (auth_has_dream_team_capability('dream_team.org.manage'))
  with check (auth_has_dream_team_capability('dream_team.org.manage'));

-- ── 4. Integridad que faltaba ──────────────────────────────────────────
-- Un nodo no puede tener dos hijos con la misma etiqueta. NULLS NOT DISTINCT
-- (PG15+; producción corre 15.8 y staging 17.6) hace que las raíces
-- (parent_equipo_id IS NULL) también se dedupliquen entre sí, que es justo lo
-- que queremos para las Direcciones de Línea 1.
create unique index if not exists dream_team_equipos_parent_label_uniq
  on public.dream_team_equipos (parent_equipo_id, label)
  nulls not distinct;

-- Un equipo no puede tener dos roles con la misma etiqueta.
create unique index if not exists dream_team_roles_equipo_label_uniq
  on public.dream_team_roles (equipo_id, label);

-- Una persona no puede ocupar dos veces el mismo rol del mismo equipo mientras
-- el servicio siga vigente. Se excluye 'retirado' a propósito: alguien que se
-- retiró puede volver a postularse al mismo puesto más adelante.
create unique index if not exists dream_team_servicios_persona_equipo_rol_vigente_uniq
  on public.dream_team_servicios (persona_id, equipo_id, rol_id)
  where estado <> 'retirado'::dream_team_estado;
