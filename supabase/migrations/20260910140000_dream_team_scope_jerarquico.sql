-- Paso 3 — Dream Team: alcance jerárquico por herencia de árbol.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- El gate con alcance que existe hoy compara `scope_id = equipo_id` exacto:
--
--   auth_has_talleres_capability_scoped(...)
--     AND (g.scope_id IS NULL OR g.scope_id = p_equipo_id::text)
--
-- Es plano. Nunca camina `parent_equipo_id`. Con el organigrama ya sembrado eso
-- significa que un Director de DPS no ve nada de Producción Técnica, Cámaras,
-- Media ni Bautizos, salvo que se le otorgue un grant por cada nodo — que es
-- exactamente la explosión de roles que el modelo quiere evitar.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
--   1. `auth_has_dream_team_capability_in_tree(capability, equipo)`: el grant se
--      otorga UNA vez sobre un nodo y alcanza a todos sus descendientes.
--   2. Un disparador que impide ciclos en `parent_equipo_id`.
--
-- ── SEMÁNTICA DEL ALCANCE ──────────────────────────────────────────────
-- La función camina hacia ARRIBA desde el nodo consultado, juntando su cadena de
-- ancestros, y pregunta si el grant apunta a alguno de ellos. Es equivalente a
-- caminar hacia abajo desde el grant, pero cuesta O(profundidad) en vez de
-- O(subárbol), y la profundidad real del organigrama es 4.
--
--   · `scope_id IS NULL`  → alcance GLOBAL. Es el mecanismo por el que la persona
--     a cargo de Dream Team ve a todos los voluntarios de la iglesia: su autoridad
--     transversal NO viaja por el árbol, porque Dream Team es un nodo hermano de
--     DPS y Niños, no su ancestro.
--   · `scope_id = <un ancestro>` → alcance sobre esa rama.
--   · cualquier otra cosa → sin alcance.
--
-- Verificado contra el árbol sembrado en staging, con una consulta de ancestros:
--   grant sobre `DPS`                     → alcanza 10 nodos (toda su rama)
--   grant sobre `Dirección de Experiencia`→ alcanza 18 (DPS, Estudiantes, Niños,
--                                            Dream Team y sus descendientes)
--   grant sobre `Dirección de Conexión`   → alcanza 6 (Grupos de Corto Plazo)
--   grant sobre `Producción Técnica`      → alcanza 3 (Cámaras, Sonido, Teleprompter)
-- Ni Experiencia ni DPS alcanzan jamás Conexión o Grupos de Vida: son ramas
-- paralelas, no descendientes.
--
-- ── POR QUÉ EL TOPE DE PROFUNDIDAD ─────────────────────────────────────
-- `parent_equipo_id` no tenía nada que impidiera un ciclo, y desde el Paso 1 la
-- aplicación puede reparentar nodos con `updateEquipo`. Un ciclo dentro de un
-- CTE recursivo usado por RLS no da un error: cuelga la consulta. El tope de 16
-- es cuatro veces la profundidad real y corta cualquier bucle; el disparador
-- ataca la causa en vez del síntoma.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva. La función se AGREGA: ninguna política existente se modifica en esta
-- migración. Las políticas vivas migran de a una, junto con la interfaz del Paso
-- 4, cuando haya contra qué probarlas. El disparador sólo rechaza escrituras que
-- crearían un ciclo — el árbol sembrado no tiene ninguno, así que no invalida
-- ninguna fila existente. Cero impacto sobre Grupos de Vida.

-- ── 1. Gate jerárquico ─────────────────────────────────────────────────
create or replace function public.auth_has_dream_team_capability_in_tree(
  p_capability_key text,
  p_equipo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with recursive ancestros as (
    select e.id, e.parent_equipo_id, 1 as profundidad
    from public.dream_team_equipos e
    where e.id = p_equipo_id
    union all
    select p.id, p.parent_equipo_id, a.profundidad + 1
    from public.dream_team_equipos p
    join ancestros a on p.id = a.parent_equipo_id
    where a.profundidad < 16
  )
  select exists (
    select 1
    from public.dream_team_capability_grants g
    inner join public.usuarios u on u.id = g.persona_id
    where u.auth_id = auth.uid()
      and g.capability_key = p_capability_key
      and g.revoked_at is null
      and (
        g.scope_id is null
        or g.scope_id in (select id::text from ancestros)
      )
  )
$function$;

comment on function public.auth_has_dream_team_capability_in_tree(text, uuid) is
  'Gate de capability con herencia por arbol: un grant sobre un nodo alcanza a '
  'todos sus descendientes. scope_id NULL significa alcance global. Resuelve la '
  'persona por usuarios.auth_id = auth.uid(). Tope de profundidad 16 para que un '
  'ciclo no cuelgue una consulta de RLS.';

-- ── 2. Prevención de ciclos ────────────────────────────────────────────
create or replace function public.dream_team_equipos_prevent_cycle()
returns trigger
language plpgsql
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

drop trigger if exists trg_dream_team_equipos_prevent_cycle on public.dream_team_equipos;
create trigger trg_dream_team_equipos_prevent_cycle
  before insert or update of parent_equipo_id on public.dream_team_equipos
  for each row execute function public.dream_team_equipos_prevent_cycle();
