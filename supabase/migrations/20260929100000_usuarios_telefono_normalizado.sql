-- Dream Team / usuarios — the system normalizes Venezuelan phone numbers.
--
-- The canonical stored format is `04XXXXXXXXX` (11 digits), the one 745 of
-- 1001 staging profiles already had. Every entry point (forms, imports,
-- actions) goes through `usuarios.telefono`, so a BEFORE trigger covers all of
-- them without touching each one.
--
-- Rule (d = digits of the trimmed input; mobile prefixes 412 414 416 422 424
-- 426; landline 2XX):
--   0 + mobile + 7 digits        -> d
--   mobile + 7 digits            -> '0' || d
--   58 + mobile + 7 digits       -> '0' || d without the country code
--   580 + mobile + 7 digits      -> d without the country code
--   0058 + mobile + 7 digits     -> '0' || d without 0058
--   0 + 2XX + 7 digits           -> d
--   58 + 2XX + 7 digits          -> '0' || d without the country code
-- Anything else (foreign numbers, zero filler, incomplete, text) is returned
-- EXACTLY as given. NULL and blank stay as they are. Idempotent.
--
-- The TypeScript mirror is lib/utils/telefono.ts; both share the same table
-- of cases (supabase/tests/usuarios-telefono-normalizado.test.sql and
-- __tests__/lib/utils/telefono.test.ts).

create or replace function public.normalizar_telefono_ve(p text)
returns text
language plpgsql
immutable
as $function$
declare
  v_trim text;
  v_d text;
  v_mov constant text := '(?:412|414|416|422|424|426)';
begin
  if p is null then
    return null;
  end if;
  -- Invisible direction/format marks (a pasted number can carry U+202A/U+202C)
  -- and no-break spaces are noise, not part of the number.
  v_trim := regexp_replace(p, '[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]', '', 'g');
  v_trim := regexp_replace(v_trim, '^[\s\u00A0]+|[\s\u00A0]+$', '', 'g');
  if v_trim = '' then
    return p;
  end if;
  -- Only digits, spaces, hyphens, dots, parentheses and a leading plus.
  if v_trim !~ '^\+?[0-9 \u00A0.()\-]+$' then
    return p;
  end if;
  v_d := regexp_replace(v_trim, '\D', '', 'g');

  if v_d ~ ('^0' || v_mov || '\d{7}$') then
    return v_d;
  elsif v_d ~ ('^' || v_mov || '\d{7}$') then
    return '0' || v_d;
  elsif v_d ~ ('^58' || v_mov || '\d{7}$') then
    return '0' || substr(v_d, 3);
  elsif v_d ~ ('^580' || v_mov || '\d{7}$') then
    return substr(v_d, 3);
  elsif v_d ~ ('^0058' || v_mov || '\d{7}$') then
    return '0' || substr(v_d, 5);
  elsif v_d ~ '^02\d{2}\d{7}$' then
    return v_d;
  elsif v_d ~ '^582\d{2}\d{7}$' then
    return '0' || substr(v_d, 3);
  end if;
  return p;
end;
$function$;

comment on function public.normalizar_telefono_ve(text) is
  'Canonical Venezuelan phone format 04XXXXXXXXX. Unrecognized values are '
  'returned untouched. Mirror: lib/utils/telefono.ts (keep both in sync).';

-- Log of every value the system rewrote, so no original is lost.
create table if not exists public.usuarios_telefono_normalizacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  antes text,
  despues text not null,
  normalizado_en timestamptz not null default now()
);

alter table public.usuarios_telefono_normalizacion enable row level security;
revoke all on public.usuarios_telefono_normalizacion from public;
revoke all on public.usuarios_telefono_normalizacion from anon;
revoke all on public.usuarios_telefono_normalizacion from authenticated;

create or replace function public.usuarios_normalizar_telefono_trg()
returns trigger
language plpgsql
as $function$
begin
  new.telefono := public.normalizar_telefono_ve(new.telefono);
  return new;
end;
$function$;

drop trigger if exists usuarios_normalizar_telefono on public.usuarios;
create trigger usuarios_normalizar_telefono
  before insert or update of telefono on public.usuarios
  for each row execute function public.usuarios_normalizar_telefono_trg();

-- One-off correction of what is already stored: log first, then rewrite only
-- the rows whose value actually changes.
insert into public.usuarios_telefono_normalizacion (usuario_id, antes, despues)
select id, telefono, public.normalizar_telefono_ve(telefono)
from public.usuarios
where public.normalizar_telefono_ve(telefono) is distinct from telefono;

update public.usuarios
set telefono = public.normalizar_telefono_ve(telefono)
where public.normalizar_telefono_ve(telefono) is distinct from telefono;
