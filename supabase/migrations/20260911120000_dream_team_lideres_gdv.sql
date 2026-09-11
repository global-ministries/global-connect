-- Paso 5 — Grupos de Vida entra a Dream Team por lectura.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- El pool de servidores sólo lee dream_team_servicios. En producción esa tabla
-- está vacía, pero la iglesia ya tiene personas liderando grupos (medido en
-- staging: 110 personas en grupos activos, 102 líderes y 8 colíderes). Sin
-- esto, Dream Team arranca mostrando cero servidores.
--
-- ── POR QUÉ UNA FUNCIÓN Y NO UNA VISTA ─────────────────────────────────
-- El plan decía "vista". Ninguna de las dos variantes sirve:
--   · Vista común (permisos del dueño): se saltea toda la RLS. Cualquier
--     usuario autenticado vería a todos los líderes de la iglesia.
--   · Vista con security_invoker: aplica la RLS propia de grupo_miembros, que
--     responde a los roles de Grupos de Vida y no al árbol de Dream Team. A un
--     director de Dream Team le devolvería cero líderes, y esas políticas no se
--     pueden cambiar: Grupos de Vida no se toca.
-- Una función SECURITY DEFINER lee Grupos de Vida con los permisos del dueño y
-- aplica ella misma el recorrido del árbol. Es el patrón de
-- dream_team_resolver_nombres. Conserva lo que importaba de la vista: se
-- calcula al leer, no copia datos, no necesita relleno inicial, no puede
-- desincronizarse y se borra sin dejar rastro.
--
-- ── QUÉ DEVUELVE ───────────────────────────────────────────────────────
-- Una fila por persona que hoy lidera o colidera al menos un grupo:
--   · grupo_miembros.rol en ('Líder', 'Colíder'), sin fecha_salida, activo
--   · en un grupo activo, no eliminado y aprobado
-- Quien lidera un grupo y colidera otro figura como 'lider'. Quien lidera
-- varios grupos es una sola fila, con la cantidad en `grupos` (35 personas en
-- staging).
-- Las filas se ubican en el nodo raíz de Grupos de Vida del árbol
-- (experiencia 'grupos_vida', sin padre, activo). Sin ese nodo, no devuelve
-- nada.
--
-- ── QUIÉN LA VE ────────────────────────────────────────────────────────
-- Quien tiene autoridad sobre el nodo de Grupos de Vida por el árbol, con los
-- términos de Dream Team de la política de lectura de dream_team_servicios
-- (org.manage, director.coordinate, direct, coordinate, lead, metrics.read).
-- Dos diferencias deliberadas con esa política:
--   · Sin términos de talleres: dirigir talleres no da acceso a Grupos de Vida.
--   · Sin término de ficha propia: el liderazgo de una persona ya se lo muestra
--     Grupos de Vida, y en Dream Team caería en un nodo que esa persona no ve.
-- La directora de DPS, que además lidera un grupo, no ve a nadie. Ni a sí misma.
-- La lista de capacidades repite la de dream_team_servicios_select y la de
-- dream_team_resolver_nombres: si cambia una, cambiar las tres.
--
-- dream_team_resolver_nombres se amplía para resolver los nombres de estas
-- personas con la misma regla: sólo si esta función se las devuelve a quien
-- pregunta.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Sólo lectura sobre grupos y grupo_miembros. Cero escrituras, cero cambios de
-- esquema o de políticas en Grupos de Vida. No otorga capacidades: aparecer en
-- el pool no da permisos en Dream Team.
--
-- ── ROLLBACK (en este orden) ───────────────────────────────────────────
--   1. Restaurar dream_team_resolver_nombres desde 20260910180000.
--   2. drop function public.dream_team_lideres_gdv();

create or replace function public.dream_team_lideres_gdv()
returns table (persona_id uuid, equipo_id uuid, rol text, grupos integer, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with nodo as (
    select e.id
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  ),
  liderazgo as (
    select gm.usuario_id,
           bool_or(gm.rol = 'Líder') as lidera,
           count(distinct gm.grupo_id)::integer as grupos,
           min(gm.fecha_asignacion) as desde
    from public.grupo_miembros gm
    join public.grupos g on g.id = gm.grupo_id
    where gm.rol in ('Líder', 'Colíder')
      and gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
      and g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
    group by gm.usuario_id
  )
  select l.usuario_id,
         a.id,
         case when l.lidera then 'lider' else 'colider' end,
         l.grupos,
         l.desde
  from liderazgo l
  cross join alcance a;
$$;

comment on function public.dream_team_lideres_gdv() is
  'Líderes y colíderes activos de Grupos de Vida, proyectados como servidores '
  'del nodo raíz de Grupos de Vida. Sólo lectura. Visible para quien tiene '
  'autoridad sobre ese nodo por el árbol de Dream Team.';

revoke all on function public.dream_team_lideres_gdv() from public;
revoke all on function public.dream_team_lideres_gdv() from anon;
grant execute on function public.dream_team_lideres_gdv() to authenticated;
grant execute on function public.dream_team_lideres_gdv() to service_role;

-- Mismo cuerpo que 20260910180000 más un término: los líderes de Grupos de
-- Vida que la función anterior le devuelve a quien pregunta. CREATE OR
-- REPLACE conserva los permisos ya otorgados.
create or replace function public.dream_team_resolver_nombres(p_persona_ids uuid[])
returns table (id uuid, nombre text, apellido text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.apellido
  from public.usuarios u
  where u.id = any(p_persona_ids)
    and (
      exists (
        select 1
        from public.dream_team_servicios s
        where s.persona_id = u.id
          and (
            auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
            or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
            or auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
            or auth_has_dream_team_capability_in_tree('dream_team.coordinate', s.equipo_id)
            or auth_has_dream_team_capability_in_tree('dream_team.lead', s.equipo_id)
            or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', s.equipo_id)
          )
      )
      or u.id in (select l.persona_id from public.dream_team_lideres_gdv() l)
    );
$$;
