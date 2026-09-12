-- Paso 4.7 — Dream Team: resolver los nombres de la gente que uno dirige.
--
-- ── PROBLEMA, VISTO EN LA PANTALLA REAL ────────────────────────────────
-- Una directora de área abre /admin/dream-team/servidores y ve sus tres
-- servicios correctamente acotados a su rama… con el nombre "Persona no
-- encontrada" en las tres filas. El administrador global, en la misma
-- pantalla, ve los nombres reales.
--
-- La causa son DOS capas de RLS que no coinciden:
--   · `dream_team_servicios` le deja ver el SERVICIO (está en su rama).
--   · `usuarios` tiene su propia RLS por rol heredado — "Los usuarios pueden
--     ver perfiles según su rol", "Solo admin puede ver usuarios" — y le niega
--     el NOMBRE de esas personas, que no son de su grupo de vida.
--
-- Una pantalla que le dice a un director "tenés tres voluntarios pero no puedo
-- decirte quiénes son" no sirve para nada.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Una función SECURITY DEFINER que resuelve nombre y apellido ÚNICAMENTE de
-- las personas sobre las que el llamador ya tiene autoridad probada por el
-- árbol. No abre `usuarios`: para cada id pedido, exige que exista un servicio
-- de esa persona en un nodo que el llamador alcanza.
--
-- ── POR QUÉ NO SE HIZO CON UNA POLÍTICA EN `usuarios` ──────────────────
-- Lo natural sería sumarle a `usuarios` una política que diga "podés ver a
-- quien tenga un servicio que vos podés ver". Pero la política SELECT de
-- `dream_team_servicios` ya consulta `usuarios` para su término de ficha
-- propia, y Postgres aplica RLS también dentro de las subconsultas de una
-- política: las dos tablas quedarían referenciándose y el motor aborta con
-- recursión infinita. Romper ese ciclo exigiría además reescribir la política
-- de servicios, que ya está probada. No vale el riesgo.
--
-- ── EL COSTO QUE SÍ ASUME ──────────────────────────────────────────────
-- La lista de capacidades de abajo repite la que usa el término de árbol de
-- `dream_team_servicios_select`. Es duplicación, y hay que saberlo: si algún
-- día se suma o se quita una capacidad de lectura de servicios, hay que
-- tocarla ACÁ también. Se eligió duplicar una lista corta y estable antes que
-- reescribir una política viva.
--
-- Nótese que NO incluye el término de ficha propia. Esta función responde
-- "¿quién es esta persona que dirijo?", no "¿quién soy yo?"; para lo segundo
-- la aplicación ya tiene la sesión.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva: crea una función nueva, no modifica ninguna política ni tabla.
-- Devuelve exactamente lo mismo que el administrador global ya veía, y nada
-- para quien no dirige a nadie. No toca `usuarios` ni Grupos de Vida.

create or replace function public.dream_team_resolver_nombres(p_persona_ids uuid[])
returns table (id uuid, nombre text, apellido text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id, u.nombre, u.apellido
  from public.usuarios u
  where u.id = any(p_persona_ids)
    and exists (
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
    );
$function$;

comment on function public.dream_team_resolver_nombres(uuid[]) is
  'Resuelve nombre y apellido solo de las personas sobre las que el llamador '
  'tiene autoridad probada por el arbol de Dream Team. Existe porque la RLS de '
  'usuarios es por rol heredado y le niega los nombres a un director de area, '
  'aunque la RLS de servicios si le deje ver los servicios de su rama. La lista '
  'de capacidades duplica la de dream_team_servicios_select: si una cambia, '
  'cambiar la otra.';

revoke all on function public.dream_team_resolver_nombres(uuid[]) from public;
revoke all on function public.dream_team_resolver_nombres(uuid[]) from anon;
grant execute on function public.dream_team_resolver_nombres(uuid[]) to authenticated;
grant execute on function public.dream_team_resolver_nombres(uuid[]) to service_role;
