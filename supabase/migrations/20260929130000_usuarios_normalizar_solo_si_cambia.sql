-- Usuarios — normalize cedula and telefono on UPDATE only when the value changes.
--
-- The triggers are BEFORE INSERT OR UPDATE OF <column>, and an UPDATE OF fires
-- whenever the column is in the SET list, even when the value is the same
-- (the app's updateUser always writes it). For the non-canonical member of a
-- duplicate pair (`7.485477 ` next to `7485477`) that meant saving ANY field
-- rewrote its cedula to the canonical value, hit the UNIQUE constraint and the
-- save failed. Now an UPDATE that leaves the value as it was leaves it alone;
-- INSERT always normalizes and a changed value is normalized as before.
--
-- Only the two trigger functions change; the triggers are not recreated and
-- no data is touched.

create or replace function public.usuarios_normalizar_cedula_trg()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' or new.cedula is distinct from old.cedula then
    new.cedula := public.normalizar_cedula_ve(new.cedula);
  end if;
  return new;
end;
$function$;

create or replace function public.usuarios_normalizar_telefono_trg()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' or new.telefono is distinct from old.telefono then
    new.telefono := public.normalizar_telefono_ve(new.telefono);
  end if;
  return new;
end;
$function$;
