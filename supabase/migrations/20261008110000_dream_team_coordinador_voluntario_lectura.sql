-- Dream Team: the Atención al Voluntario coordinator READS the volunteers of
-- their whole area (T11 follow-up, approved 2026-10-08).
--
-- Why: a Coordinador servicio mints only dream_team.coordinate and
-- dream_team.serve scoped to the Atención al Voluntario node, so RLS showed
-- them that node only. They register people into, and fix the ficha of
-- (20261006110100, 20261008100000), every equipo of
-- dream_team_equipos_registrables(): the parent area without the parent. To
-- find those people in Mi equipo they need to read the same set.
--
-- What (read only; no INSERT, UPDATE or DELETE policy changes):
--   1. Additive permissive SELECT policies on dream_team_servicios,
--      dream_team_equipos and dream_team_roles for the rows whose equipo is
--      in dream_team_equipos_registrables() (through
--      dream_team_puede_registrar_persona(equipo), which is that set; a NULL
--      equipo never matches). dream_team_servicio_turnos and
--      dream_team_equipo_turnos follow by their own policies (they read
--      through servicios / equipos); dream_team_turnos is readable by all.
--   2. dream_team_resolver_nombres and dream_team_contactos_personas also
--      answer for a person with a servicio in one of those equipos.
--   For admin, pastor and org.manage the set is what they already read.
--
-- Blast radius: three new SELECT policies, two functions re-created with one
-- more OR branch. Writes, grants and the capability model are unchanged.
--
-- Rollback:
--   DROP POLICY IF EXISTS dream_team_servicios_select_coordinador_voluntario ON public.dream_team_servicios;
--   DROP POLICY IF EXISTS dream_team_equipos_select_coordinador_voluntario ON public.dream_team_equipos;
--   DROP POLICY IF EXISTS dream_team_roles_select_coordinador_voluntario ON public.dream_team_roles;
--   then re-create the two functions without the registrables branch.

CREATE POLICY dream_team_servicios_select_coordinador_voluntario
  ON public.dream_team_servicios
  FOR SELECT TO authenticated
  USING (equipo_id IS NOT NULL AND public.dream_team_puede_registrar_persona(equipo_id));

CREATE POLICY dream_team_equipos_select_coordinador_voluntario
  ON public.dream_team_equipos
  FOR SELECT TO authenticated
  USING (id IS NOT NULL AND public.dream_team_puede_registrar_persona(id));

CREATE POLICY dream_team_roles_select_coordinador_voluntario
  ON public.dream_team_roles
  FOR SELECT TO authenticated
  USING (equipo_id IS NOT NULL AND public.dream_team_puede_registrar_persona(equipo_id));

CREATE OR REPLACE FUNCTION public.dream_team_resolver_nombres(p_persona_ids uuid[])
RETURNS TABLE(id uuid, nombre text, apellido text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
            or (s.equipo_id is not null and public.dream_team_puede_registrar_persona(s.equipo_id))
          )
      )
      or u.id in (select l.persona_id from public.dream_team_lideres_gdv() l)
    );
$function$;

CREATE OR REPLACE FUNCTION public.dream_team_contactos_personas(p_persona_ids uuid[])
RETURNS TABLE(id uuid, telefono text, tiene_cuenta boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select u.id, u.telefono, (u.auth_id is not null) as tiene_cuenta
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
            or (s.equipo_id is not null and public.dream_team_puede_registrar_persona(s.equipo_id))
          )
      )
      or u.id in (select l.persona_id from public.dream_team_lideres_gdv() l)
    );
$function$;

-- CREATE OR REPLACE keeps the existing ACL; state it explicitly anyway.
REVOKE ALL ON FUNCTION public.dream_team_resolver_nombres(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_resolver_nombres(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.dream_team_contactos_personas(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_contactos_personas(uuid[]) TO authenticated;
