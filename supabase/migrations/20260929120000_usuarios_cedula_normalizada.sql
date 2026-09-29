-- Usuarios — the system normalizes the cedula.
--
-- The same person ended up with two profiles because the cedula was typed with
-- another format (`22.328.215`, `V-18423291`, ` 7.485477 `) and the sign-up
-- lookup is an exact match. `usuarios.cedula` is text with a UNIQUE constraint,
-- so the canonical form below turns those spellings into one value and the
-- existing UNIQUE rejects a second profile for the same person.
--
-- Rule (k = value without invisible marks, trimmed, uppercased, without
-- spaces, dots and hyphens):
--   V? + 6 to 8 digits   -> the digits (the V is dropped)        22328215
--   E  + 6 to 9 digits   -> E + digits (foreign)                 E81110494
-- Anything else (phones, foreign numbers, zero filler, text) is returned
-- EXACTLY as given. NULL and blank stay as they are. Idempotent.
--
-- The TypeScript mirror is lib/utils/cedula.ts; both share the same table of
-- cases (supabase/tests/usuarios-cedula-normalizada.test.sql and
-- __tests__/lib/utils/cedula.test.ts). Keep the three in sync.

create or replace function public.normalizar_cedula_ve(p text)
returns text
language plpgsql
immutable
as $function$
declare
  v_trim text;
  v_k text;
begin
  if p is null then
    return null;
  end if;
  -- Invisible direction/format marks and no-break spaces are noise.
  v_trim := regexp_replace(p, '[\x200B-\x200F\x202A-\x202E\x2060-\x2069\xFEFF]', '', 'g');
  v_trim := regexp_replace(v_trim, '^[\s\x00A0]+|[\s\x00A0]+$', '', 'g');
  if v_trim = '' then
    return p;
  end if;
  v_k := upper(regexp_replace(v_trim, '[\s\x00A0.\-]', '', 'g'));

  if v_k ~ '^V?\d{6,8}$' then
    return regexp_replace(v_k, '^V', '');
  elsif v_k ~ '^E\d{6,9}$' then
    return v_k;
  end if;
  return p;
end;
$function$;

comment on function public.normalizar_cedula_ve(text) is
  'Canonical cedula: digits (V dropped) or E + digits. Unrecognized values '
  'are returned untouched. Mirror: lib/utils/cedula.ts (keep both in sync).';

-- Log of every value the system rewrote, so no original is lost.
create table if not exists public.usuarios_cedula_normalizacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  antes text,
  despues text not null,
  normalizado_en timestamptz not null default now()
);

alter table public.usuarios_cedula_normalizacion enable row level security;
revoke all on public.usuarios_cedula_normalizacion from public;
revoke all on public.usuarios_cedula_normalizacion from anon;
revoke all on public.usuarios_cedula_normalizacion from authenticated;

create or replace function public.usuarios_normalizar_cedula_trg()
returns trigger
language plpgsql
as $function$
begin
  new.cedula := public.normalizar_cedula_ve(new.cedula);
  return new;
end;
$function$;

drop trigger if exists usuarios_normalizar_cedula on public.usuarios;
create trigger usuarios_normalizar_cedula
  before insert or update of cedula on public.usuarios
  for each row execute function public.usuarios_normalizar_cedula_trg();

-- One-off correction of what is already stored. A row is rewritten only when
-- its value changes AND no other profile holds (or would normalize to) the
-- same canonical value: every member of such a collision group is left
-- untouched (those are the existing duplicate people, a decision for a person,
-- not for a migration), and the UNIQUE constraints are never violated.
create temporary table _cedula_correccion on commit drop as
select id, cedula as antes, public.normalizar_cedula_ve(cedula) as despues
from (
  select id, cedula,
         count(*) over (partition by public.normalizar_cedula_ve(cedula)) as en_grupo
  from public.usuarios
  where cedula is not null
) u
where en_grupo = 1
  and public.normalizar_cedula_ve(cedula) is distinct from cedula;

insert into public.usuarios_cedula_normalizacion (usuario_id, antes, despues)
select id, antes, despues from _cedula_correccion;

update public.usuarios u
set cedula = c.despues
from _cedula_correccion c
where u.id = c.id;
