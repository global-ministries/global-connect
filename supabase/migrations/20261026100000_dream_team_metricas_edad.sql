-- Dream Team — age range of the people the caller reaches (D10 of
-- odd/tasks/ninos-voluntarios-waumba.md; T1 of odd/tasks/ninos-pendientes-2.md).
--
-- Servidores and Mi equipo show how many volunteers of the selected sub-area
-- are under 12, 12–17, 18–25, 26 or older, or have no birth date, and filter
-- the list by it. "Las ve quien ya ve ese subárbol": `usuarios` has its own
-- RLS that hides other people's rows (and their birth date) from a branch
-- director, so this is a definer-rights function with the EXACT authority
-- predicate of dream_team_contactos_personas
-- (20261008110000_dream_team_coordinador_voluntario_lectura.sql): a person is
-- answered only when they serve in a node the caller reaches by tree, are in
-- an equipo the caller registers into, or are a Grupos de Vida leader the
-- caller sees. Whoever gets a person's name and phone gets their age range;
-- nobody new is reachable. If that predicate changes, change it here too.
--
-- Only the range leaves the function, never the birth date. Age is whole
-- years today: 12 is "12_17", 17 is "12_17", 18 is "18_25", 25 is "18_25",
-- 26 is "26_mas"; NULL fecha_nacimiento is "sin_fecha".
--
-- Additive: creates one function, no table or policy is touched.
-- Rollback: DROP FUNCTION IF EXISTS public.dream_team_rangos_edad(uuid[]);

CREATE OR REPLACE FUNCTION public.dream_team_rangos_edad(p_persona_ids uuid[])
RETURNS TABLE(id uuid, rango text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select u.id,
         case
           when u.fecha_nacimiento is null then 'sin_fecha'
           when extract(year from age(current_date, u.fecha_nacimiento)) < 12 then 'menor_12'
           when extract(year from age(current_date, u.fecha_nacimiento)) < 18 then '12_17'
           when extract(year from age(current_date, u.fecha_nacimiento)) < 26 then '18_25'
           else '26_mas'
         end as rango
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

REVOKE ALL ON FUNCTION public.dream_team_rangos_edad(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_rangos_edad(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.dream_team_rangos_edad(uuid[]) IS
  'Age range (menor_12, 12_17, 18_25, 26_mas, sin_fecha) of the given people, only for those the caller '
  'reaches (same predicate as dream_team_contactos_personas). Never returns the birth date (D10).';
