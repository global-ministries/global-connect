-- Dream Team — phone and account status of the people the caller reaches.
--
-- The Servidores screen shows each persona's phone (the one on their profile)
-- and whether they have an account. `usuarios` has its own role-based RLS
-- (Grupos de Vida) that hides other people's rows from a branch director, so
-- a direct select cannot serve them. Same problem, same shape of answer as
-- dream_team_resolver_nombres (20260910180000): a SECURITY DEFINER function
-- that answers ONLY for people the caller has tree-proven authority over.
--
-- Authority: a person is returned only when they have a servicio in a node
-- the caller reaches by tree — the capability list below is copied from the
-- live body of dream_team_resolver_nombres. The resolver also returns Grupos
-- de Vida leaders through dream_team_lideres_gdv(); this function does NOT:
-- a phone number is more sensitive than a display name and the spec limits it
-- to people with a servicio in a reachable node. If the capability list of the
-- mirror changes, change it here too.
--
-- `tiene_cuenta` is (auth_id is not null); the auth_id itself is never
-- returned. Additive: creates one function, no table or policy is touched.

create or replace function public.dream_team_contactos_personas(p_persona_ids uuid[])
returns table (id uuid, telefono text, tiene_cuenta boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id, u.telefono, (u.auth_id is not null) as tiene_cuenta
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

comment on function public.dream_team_contactos_personas(uuid[]) is
  'Phone and account status (never auth_id) of the people the caller has '
  'tree-proven authority over. Mirror of dream_team_resolver_nombres: the '
  'capability list is the same, except Grupos de Vida leaders are not '
  'included. If one changes, change the other.';

revoke all on function public.dream_team_contactos_personas(uuid[]) from public;
revoke all on function public.dream_team_contactos_personas(uuid[]) from anon;
grant execute on function public.dream_team_contactos_personas(uuid[]) to authenticated;
grant execute on function public.dream_team_contactos_personas(uuid[]) to service_role;
