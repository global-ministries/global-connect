-- Grupos de Vida — the director general's scope and the single rule behind it.
--
-- Until now the relation between a director general and the groups they see was
-- implicit and differed by screen: a segment row in director_general_segmentos
-- meant "the whole segment" in some functions, and "only the directores de etapa
-- listed in dg_directores_etapa, if there are any" in others.
--
-- This migration makes the scope explicit and puts the rule in one place:
--   * director_general_segmentos.alcance says, per segment, whether the person
--     sees the whole segment ('segmento') or only the groups of the directores
--     de etapa marked for them ('directores'). Existing rows become 'segmento'.
--   * gdv_dg_ve_grupo / gdv_dg_grupos_visibles answer "does this director general
--     see this group" (boolean and set forms of the same rule).
--
-- The rule does not check the role (callers already do) and does not filter by
-- active, deleted or season (callers keep their own filters). No data is
-- deleted; dg_directores_etapa rows are kept and simply ignored under 'segmento'.

alter table public.director_general_segmentos
  add column if not exists alcance text not null default 'segmento';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.director_general_segmentos'::regclass
      and conname = 'director_general_segmentos_alcance_check'
  ) then
    alter table public.director_general_segmentos
      add constraint director_general_segmentos_alcance_check
      check (alcance in ('segmento', 'directores'));
  end if;
end
$$;

comment on column public.director_general_segmentos.alcance is
  'What the director general sees in this segment: ''segmento'' = every group of the segment; ''directores'' = only the groups of the directores de etapa of this segment marked for them in dg_directores_etapa.';

-- p_usuario_id is usuarios.id (not the auth id). A group is visible when the
-- person holds the group's segment and either the scope is the whole segment or
-- the group belongs to a marked director de etapa of that same segment.
create or replace function public.gdv_dg_ve_grupo(p_usuario_id uuid, p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.grupos g
    join public.director_general_segmentos dgs
      on dgs.segmento_id = g.segmento_id
     and dgs.usuario_id = p_usuario_id
    where g.id = p_grupo_id
      and (
        dgs.alcance = 'segmento'
        or (
          dgs.alcance = 'directores'
          and exists (
            select 1
            from public.director_etapa_grupos deg
            join public.segmento_lideres sl on sl.id = deg.director_etapa_id
            join public.dg_directores_etapa dde on dde.segmento_lider_id = sl.id
            where deg.grupo_id = g.id
              and sl.tipo_lider = 'director_etapa'
              and sl.segmento_id = g.segmento_id
              and dde.dg_usuario_id = p_usuario_id
          )
        )
      )
  );
$function$;

create or replace function public.gdv_dg_grupos_visibles(p_usuario_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.id
  from public.grupos g
  join public.director_general_segmentos dgs
    on dgs.segmento_id = g.segmento_id
   and dgs.usuario_id = p_usuario_id
  where dgs.alcance = 'segmento'
     or (
       dgs.alcance = 'directores'
       and exists (
         select 1
         from public.director_etapa_grupos deg
         join public.segmento_lideres sl on sl.id = deg.director_etapa_id
         join public.dg_directores_etapa dde on dde.segmento_lider_id = sl.id
         where deg.grupo_id = g.id
           and sl.tipo_lider = 'director_etapa'
           and sl.segmento_id = g.segmento_id
           and dde.dg_usuario_id = p_usuario_id
       )
     );
$function$;

comment on function public.gdv_dg_ve_grupo(uuid, uuid) is
  'The single rule for what a director general sees: true when the person holds the group''s segment and either alcance = ''segmento'' or the group belongs to a director de etapa of that segment marked for them. p_usuario_id is usuarios.id. Does not check the role nor active/deleted/season.';

comment on function public.gdv_dg_grupos_visibles(uuid) is
  'Set form of gdv_dg_ve_grupo: the ids of every group the director general (usuarios.id) sees under the same rule.';

-- Only security definer functions call these helpers.
revoke all on function public.gdv_dg_ve_grupo(uuid, uuid) from public, anon, authenticated;
revoke all on function public.gdv_dg_grupos_visibles(uuid) from public, anon, authenticated;
