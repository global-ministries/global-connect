-- Endurecimiento de los dos avisos del analizador de seguridad de Supabase.
--
-- ── 1. El disparador que evita ciclos no fijaba search_path ─────────────
-- `dream_team_equipos_prevent_cycle` no es SECURITY DEFINER —corre con los
-- permisos de quien escribe— y su cuerpo ya califica `public.dream_team_equipos`,
-- así que el riesgo real era bajo. Se fija igual: un disparador que valida la
-- forma del árbol no debería depender del search_path de quien hace el UPDATE.
-- El cuerpo es idéntico al de 20260910140000; lo único que cambia es el `set`.
--
-- ── 2. Los dos gates eran ejecutables por un visitante sin sesión ───────
-- `auth_has_dream_team_capability` y `auth_has_dream_team_capability_in_tree`
-- son SECURITY DEFINER y quedaban con EXECUTE para PUBLIC, que incluye a `anon`.
-- No había fuga: sin sesión `auth.uid()` es NULL y las dos devuelven false, y
-- `anon` no tiene un solo GRANT sobre las tablas de dream_team, así que ni
-- siquiera llega a evaluarse una política. Pero una función definer que lee
-- `usuarios` y `dream_team_capability_grants` no tiene por qué estar al alcance
-- de quien no inició sesión.
--
-- Se revoca a public y anon, y se concede EXPLÍCITO a authenticated y
-- service_role. El grant explícito es imprescindible: al revocarle a PUBLIC,
-- `authenticated` perdería el permiso que heredaba de ahí, y con él lo
-- perderían todas las políticas RLS que llaman a estas funciones.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Nadie cambia de alcance: las políticas son las mismas y quien tenía acceso lo
-- conserva. Cero impacto sobre Grupos de Vida.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   grant execute on function public.auth_has_dream_team_capability(text) to public;
--   grant execute on function public.auth_has_dream_team_capability_in_tree(text, uuid) to public;
--   y recrear dream_team_equipos_prevent_cycle sin el `set search_path`.

create or replace function public.dream_team_equipos_prevent_cycle()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_cursor uuid := new.parent_equipo_id;
  v_profundidad int := 0;
begin
  if new.parent_equipo_id is null then
    return new;
  end if;

  if new.parent_equipo_id = new.id then
    raise exception 'dream_team_equipos: un equipo no puede ser su propio padre (%)', new.id
      using errcode = 'check_violation';
  end if;

  while v_cursor is not null loop
    v_profundidad := v_profundidad + 1;

    if v_cursor = new.id then
      raise exception 'dream_team_equipos: ciclo detectado, % no puede colgar de %',
        new.id, new.parent_equipo_id
        using errcode = 'check_violation';
    end if;

    if v_profundidad > 16 then
      raise exception 'dream_team_equipos: profundidad maxima (16) excedida desde %', new.id
        using errcode = 'check_violation';
    end if;

    select e.parent_equipo_id into v_cursor
    from public.dream_team_equipos e
    where e.id = v_cursor;
  end loop;

  return new;
end;
$function$;

revoke all on function public.auth_has_dream_team_capability(text) from public;
revoke all on function public.auth_has_dream_team_capability(text) from anon;
grant execute on function public.auth_has_dream_team_capability(text) to authenticated;
grant execute on function public.auth_has_dream_team_capability(text) to service_role;

revoke all on function public.auth_has_dream_team_capability_in_tree(text, uuid) from public;
revoke all on function public.auth_has_dream_team_capability_in_tree(text, uuid) from anon;
grant execute on function public.auth_has_dream_team_capability_in_tree(text, uuid) to authenticated;
grant execute on function public.auth_has_dream_team_capability_in_tree(text, uuid) to service_role;
