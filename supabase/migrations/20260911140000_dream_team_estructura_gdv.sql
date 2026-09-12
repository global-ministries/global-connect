-- Paso 1 del pedido del usuario — la rama de Grupos de Vida, con su jerarquía real.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- 20260911120000 proyectó a los líderes como una lista plana colgada del nodo
-- raíz de Grupos de Vida: 110 nombres seguidos bajo "Dirección de Grupos de
-- Vida". La jerarquía real de Grupos de Vida es
-- Dirección → Segmentos → Grupos, y el organigrama tiene que mostrarla.
--
-- ── POR QUÉ NO SE SIEMBRAN COMO NODOS ──────────────────────────────────
-- Serían 5 segmentos y 95 grupos (staging) creados como filas de
-- dream_team_equipos. Los grupos nacen, cierran y cambian de temporada: esa
-- copia quedaría desincronizada en semanas, y es exactamente el segundo estado
-- que la decisión "Grupos de Vida entra por lectura" vino a evitar. Acá los
-- segmentos y los grupos se CALCULAN al leer. Si abren un grupo, aparece solo.
-- Si la temporada cierra, desaparece solo. Nada que rellenar, nada que
-- sincronizar, y Grupos de Vida no recibe una sola escritura.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- 1. `dream_team_estructura_gdv()` devuelve las ramas virtuales de Grupos de
--    Vida, cada una con sus responsables:
--      · una fila 'direccion' para el nodo raíz real (sus directores generales)
--      · una fila 'segmento' por segmento, colgada del nodo raíz
--        (sus directores generales y sus directores de etapa)
--      · una fila 'grupo' por grupo activo de temporada activa, colgada de su
--        segmento (su líder y su colíder)
--    `nodo_id` de un segmento es el id del segmento, y de un grupo el id del
--    grupo: ids reales de Grupos de Vida, no inventados, así que la interfaz
--    puede agrupar sin ambigüedad. No son filas de dream_team_equipos: la
--    interfaz las muestra de sólo lectura.
--
-- 2. `dream_team_lideres_gdv()` cambia de forma: antes devolvía una fila por
--    persona con la cantidad de grupos que lidera; ahora devuelve una fila por
--    persona Y GRUPO, con `equipo_id` = el id del grupo. Así cada líder cuelga
--    del grupo que lidera y no del nodo raíz. Quien lidera dos grupos aparece
--    en los dos, que es lo correcto: son dos lugares donde sirve.
--    Se reemplaza en vez de agregar una segunda función para no dejar dos
--    modelos del mismo hecho. La forma anterior vivió sólo en staging.
--
-- 3. `dream_team_resolver_nombres` se re-crea igual, porque el `drop` del punto
--    2 deja su término apuntando a una función que ya no existe (Postgres no
--    rastrea dependencias dentro del cuerpo de una función SQL: el drop no
--    falla, la consulta rompe después).
--
-- ── QUIÉN LO VE ────────────────────────────────────────────────────────
-- Las dos funciones usan el mismo gate: autoridad sobre el nodo de Grupos de
-- Vida por el árbol, con los términos de Dream Team de la política de lectura
-- de dream_team_servicios (org.manage, director.coordinate, direct, coordinate,
-- lead, metrics.read). Sin términos de talleres y sin ficha propia, igual que
-- 20260911120000. Sin autoridad: cero filas.
--
-- ── QUÉ CUENTA COMO GRUPO VIGENTE ──────────────────────────────────────
-- grupo activo, no eliminado, aprobado, y su temporada activa. Los segmentos se
-- muestran todos: existen aunque hoy no tengan grupos abiertos.
--
-- ── QUÉ CUENTA COMO RESPONSABLE ────────────────────────────────────────
--   dirección → director_general_segmentos (distintos, en todos los segmentos)
--   segmento  → director_general_segmentos de ese segmento + segmento_lideres
--   grupo     → grupo_miembros 'Líder' y 'Colíder' vigentes
-- El rol viaja en la respuesta ('director_general', 'director_etapa', 'lider',
-- 'colider') para que la interfaz lo etiquete, no la base.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Sólo lectura sobre segmentos, grupos, temporadas, grupo_miembros,
-- segmento_lideres, director_general_segmentos y usuarios. Cero escrituras y
-- cero cambios de esquema en Grupos de Vida. No otorga capacidades.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   drop function public.dream_team_estructura_gdv();
--   y restaurar dream_team_lideres_gdv() y dream_team_resolver_nombres()
--   desde 20260911120000.

-- ── ramas virtuales con sus responsables ───────────────────────────────
create or replace function public.dream_team_estructura_gdv()
returns table (nodo_id uuid, parent_id uuid, tipo text, label text, responsables jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with nodo as (
    select e.id, e.label
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id, n.label
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  ),
  grupos_vigentes as (
    select g.id, g.nombre, g.segmento_id
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  )
  -- la dirección: sus directores generales
  select a.id,
         null::uuid,
         'direccion',
         a.label,
         coalesce((
           select jsonb_agg(distinct jsonb_build_object(
                    'persona_id', u.id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', 'director_general'))
           from public.director_general_segmentos dgs
           join public.usuarios u on u.id = dgs.usuario_id
         ), '[]'::jsonb)
  from alcance a

  union all

  -- cada segmento: sus directores generales y sus directores de etapa
  select s.id,
         a.id,
         'segmento',
         s.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', r.usuario_id,
                    'nombre', r.nombre,
                    'rol', r.rol)
                  order by r.rol, r.nombre)
           from (
             select dgs.usuario_id,
                    concat_ws(' ', u.nombre, u.apellido) as nombre,
                    'director_general' as rol
             from public.director_general_segmentos dgs
             join public.usuarios u on u.id = dgs.usuario_id
             where dgs.segmento_id = s.id
             union
             select sl.usuario_id,
                    concat_ws(' ', u.nombre, u.apellido),
                    sl.tipo_lider::text
             from public.segmento_lideres sl
             join public.usuarios u on u.id = sl.usuario_id
             where sl.segmento_id = s.id
           ) r
         ), '[]'::jsonb)
  from public.segmentos s
  cross join alcance a

  union all

  -- cada grupo vigente: su líder y su colíder
  select g.id,
         g.segmento_id,
         'grupo',
         g.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', gm.usuario_id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', case when gm.rol = 'Líder' then 'lider' else 'colider' end)
                  order by gm.rol, u.nombre)
           from public.grupo_miembros gm
           join public.usuarios u on u.id = gm.usuario_id
           where gm.grupo_id = g.id
             and gm.rol in ('Líder', 'Colíder')
             and gm.fecha_salida is null
             and coalesce(gm.estado, 'activo') = 'activo'
         ), '[]'::jsonb)
  from grupos_vigentes g
  cross join alcance a;
$$;

comment on function public.dream_team_estructura_gdv() is
  'Ramas virtuales de Grupos de Vida (dirección, segmentos, grupos vigentes) '
  'con los responsables de cada una. Se calculan al leer: no son filas de '
  'dream_team_equipos y no se siembran. Mismo gate por árbol que '
  'dream_team_lideres_gdv().';

revoke all on function public.dream_team_estructura_gdv() from public;
revoke all on function public.dream_team_estructura_gdv() from anon;
grant execute on function public.dream_team_estructura_gdv() to authenticated;
grant execute on function public.dream_team_estructura_gdv() to service_role;

-- ── líderes, ahora colgados de su grupo ────────────────────────────────
drop function if exists public.dream_team_lideres_gdv();

create function public.dream_team_lideres_gdv()
returns table (persona_id uuid, equipo_id uuid, rol text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with nodo as (
    select e.id
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  )
  select gm.usuario_id,
         gm.grupo_id,
         case when gm.rol = 'Líder' then 'lider' else 'colider' end,
         gm.fecha_asignacion
  from public.grupo_miembros gm
  join public.grupos g on g.id = gm.grupo_id
  join public.temporadas t on t.id = g.temporada_id
  where gm.rol in ('Líder', 'Colíder')
    and gm.fecha_salida is null
    and coalesce(gm.estado, 'activo') = 'activo'
    and g.activo
    and not g.eliminado
    and g.estado_aprobacion = 'aprobado'
    and t.activa
    and exists (select 1 from alcance);
$$;

comment on function public.dream_team_lideres_gdv() is
  'Líderes y colíderes vigentes de Grupos de Vida, uno por persona Y GRUPO: '
  '`equipo_id` es el id del grupo que lideran, una rama virtual de '
  'dream_team_estructura_gdv(). Sólo lectura. Visible para quien tiene '
  'autoridad sobre el nodo de Grupos de Vida por el árbol de Dream Team.';

revoke all on function public.dream_team_lideres_gdv() from public;
revoke all on function public.dream_team_lideres_gdv() from anon;
grant execute on function public.dream_team_lideres_gdv() to authenticated;
grant execute on function public.dream_team_lideres_gdv() to service_role;

-- ── resolver de nombres: el drop anterior dejó su término huérfano ──────
create or replace function public.dream_team_resolver_nombres(p_persona_ids uuid[])
returns table (id uuid, nombre text, apellido text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.apellido
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
          )
      )
      or u.id in (select l.persona_id from public.dream_team_lideres_gdv() l)
    );
$$;
