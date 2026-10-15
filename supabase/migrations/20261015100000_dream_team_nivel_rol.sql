-- T1 (odd/tasks/uno-a-uno.md) — explicit authority level on Dream Team roles.
--
-- A rol's label is free text per team, and until now the label alone decided its
-- authority (lib/platform/dream-team/grants.ts and its SQL mirror
-- dream_team_grants_de_servicio compare it to fixed sets). New areas name their
-- roles differently, so each rol now carries its level apart from its label:
--   director > coordinador > lider > voluntario.
--
-- dream_team_nivel_desde_label(label) is the level a label maps to, in this order
-- (the same label sets and order as lib/platform/dream-team/nivel-rol.ts, which
-- reuses those of grants.ts; coordinador goes before the lead set because that
-- set also contains it). Labels are compared trimmed, lowercased and without
-- diacritics, like normalizeLabel:
--   director     'director'
--   coordinador  'coordinador'
--   lider        'lider', 'lider de grupo', 'facilitador', 'entrenador'
--   voluntario   anything else: the lowest level, which leads nobody.
--
-- Every existing rol is backfilled with it. The column has no default: a rol
-- inserted without a nivel (the talleres create function, SQL seeds) gets the
-- level of its label from a BEFORE INSERT trigger, and NOT NULL, checked after
-- BEFORE triggers, guarantees none is left empty. An explicit nivel always wins,
-- and renaming a rol never changes its level.
--
-- Additive only: nothing reads nivel yet; permissions, grants, RLS and
-- dream_team_grants_de_servicio still read the label (T6 switches them).
--
-- Rollback:
--   drop trigger dream_team_roles_nivel_desde_label on public.dream_team_roles;
--   drop function if exists public.dream_team_roles_nivel_desde_label();
--   drop function if exists public.dream_team_nivel_desde_label(text);
--   alter table public.dream_team_roles
--     drop constraint dream_team_roles_nivel_check,
--     drop column nivel;

-- ── 1. the classification ────────────────────────────────────────────

-- Pure text mapping, no table access: SECURITY INVOKER.
create or replace function public.dream_team_nivel_desde_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case translate(lower(btrim(p_label)), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')
           when 'director' then 'director'
           when 'coordinador' then 'coordinador'
           when 'lider' then 'lider'
           when 'lider de grupo' then 'lider'
           when 'facilitador' then 'lider'
           when 'entrenador' then 'lider'
           else 'voluntario'
         end
$$;

comment on function public.dream_team_nivel_desde_label(text) is
  'Authority level a Dream Team rol label maps to; unknown labels are voluntario (uno-a-uno T1).';

revoke all on function public.dream_team_nivel_desde_label(text) from public;
revoke all on function public.dream_team_nivel_desde_label(text) from anon;
grant execute on function public.dream_team_nivel_desde_label(text) to authenticated;
grant execute on function public.dream_team_nivel_desde_label(text) to service_role;

-- ── 2. the column and its backfill ───────────────────────────────────

-- Added with a temporary default so the existing rows satisfy NOT NULL; the
-- backfill then sets their real level and the default is dropped.
alter table public.dream_team_roles
  add column nivel text not null default 'voluntario';

alter table public.dream_team_roles
  add constraint dream_team_roles_nivel_check check (nivel in ('director', 'coordinador', 'lider', 'voluntario'));

comment on column public.dream_team_roles.nivel is
  'Authority level of the rol, apart from its label: director > coordinador > lider > voluntario (uno-a-uno T1).';

update public.dream_team_roles
   set nivel = public.dream_team_nivel_desde_label(label)
 where nivel is distinct from public.dream_team_nivel_desde_label(label);

alter table public.dream_team_roles
  alter column nivel drop default;

-- ── 3. a rol inserted without a nivel takes the level of its label ───

create or replace function public.dream_team_roles_nivel_desde_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nivel := public.dream_team_nivel_desde_label(new.label);
  return new;
end;
$$;

revoke all on function public.dream_team_roles_nivel_desde_label() from public;
revoke all on function public.dream_team_roles_nivel_desde_label() from anon;
revoke all on function public.dream_team_roles_nivel_desde_label() from authenticated;

create trigger dream_team_roles_nivel_desde_label
  before insert on public.dream_team_roles
  for each row
  when (new.nivel is null)
  execute function public.dream_team_roles_nivel_desde_label();
