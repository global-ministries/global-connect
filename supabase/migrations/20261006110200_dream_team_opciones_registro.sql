-- Dream Team: the equipos and roles the volunteer coordinator may register a
-- new person into, for the "Registrar persona nueva" form (follow-up of
-- 20261006110100_dream_team_registrar_solo_coordinador_voluntario).
--
-- What: public.dream_team_opciones_registro() answers jsonb
--   [{id, etiqueta, roles: [{id, label}]}]
-- for every equipo of dream_team_equipos_registrables() with at least one
-- active rol, ordered by etiqueta. etiqueta is "<parent> › <label>" (or the
-- label of a root node).
--
-- Why a function: the coordinator of Waumba Land › Atención al Voluntario holds
-- dream_team.coordinate on that node only, so dream_team_equipos and
-- dream_team_roles RLS hide the sibling areas they may now register into. The
-- function exposes only the labels and role ids of exactly that set.
--
-- SECURITY DEFINER, actor = auth.uid() (through dream_team_equipos_registrables),
-- no arguments; EXECUTE for authenticated only.
--
-- Rollback: DROP FUNCTION IF EXISTS public.dream_team_opciones_registro();

CREATE OR REPLACE FUNCTION public.dream_team_opciones_registro()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_agg(o.opcion ORDER BY o.etiqueta), '[]'::jsonb)
    FROM (
      SELECT concat_ws(' › ', p.label, e.label) AS etiqueta,
             jsonb_build_object(
               'id', e.id,
               'etiqueta', concat_ws(' › ', p.label, e.label),
               'roles', (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label) ORDER BY r.label)
                           FROM public.dream_team_roles r
                          WHERE r.equipo_id = e.id AND r.activo)) AS opcion
        FROM public.dream_team_equipos_registrables() x
        JOIN public.dream_team_equipos e ON e.id = x.equipo_id
        LEFT JOIN public.dream_team_equipos p ON p.id = e.parent_equipo_id
       WHERE EXISTS (SELECT 1 FROM public.dream_team_roles r WHERE r.equipo_id = e.id AND r.activo)
    ) o;
$function$;

COMMENT ON FUNCTION public.dream_team_opciones_registro() IS
  'The equipos (with their active roles) the actor may register a NEW person into, as jsonb '
  '[{id, etiqueta, roles: [{id, label}]}]. Same set as dream_team_equipos_registrables().';

REVOKE ALL ON FUNCTION public.dream_team_opciones_registro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_opciones_registro() TO authenticated;
