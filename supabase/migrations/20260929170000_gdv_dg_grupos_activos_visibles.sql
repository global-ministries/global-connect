-- Grupos de Vida — the director general's visible groups, active ones only.
--
-- The solicitudes listers need "the active groups this director general sees".
-- They used to fetch every id from gdv_dg_grupos_visibles and then filter them
-- with a long IN list in a GET query string, which can exceed URL limits for a
-- whole segment. This function applies the same rule and the same active filter
-- (grupos.activo = true, nothing more) in a single call. The existing helpers
-- are unchanged.

create or replace function public.gdv_dg_grupos_activos_visibles(p_usuario_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.id
  from public.grupos g
  where g.id in (select public.gdv_dg_grupos_visibles(p_usuario_id))
    and g.activo = true;
$function$;

comment on function public.gdv_dg_grupos_activos_visibles(uuid) is
  'The ids of the active groups (grupos.activo = true) a director general (usuarios.id) sees under the single rule of gdv_dg_grupos_visibles. Does not check the role.';

-- Only security definer functions and the service role call this helper.
revoke all on function public.gdv_dg_grupos_activos_visibles(uuid) from public, anon, authenticated;
