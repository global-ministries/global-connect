-- La rama de Grupos de Vida, ordenada por equipo de dirección.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- 20260911140000 colgó los grupos directamente del segmento y puso a TODOS
-- los directores de etapa en la línea de responsables del segmento. En
-- Matrimonios eso son ocho nombres seguidos en una sola línea, y no se puede
-- saber qué grupos supervisa cada quien. Grupos de Vida sí lo sabe: tiene
-- `director_etapa_grupos`, que asigna grupos a cada director de etapa, y su
-- propia pantalla de segmento agrupa a los directores por cónyuge.
--
-- ── QUÉ CAMBIA ─────────────────────────────────────────────────────────
-- Se agrega un nivel entre el segmento y sus grupos: el equipo de dirección.
--
--   Dirección de Grupos de Vida        (sus directores generales)
--   └── Matrimonios                    (su director general, si tiene)
--       ├── Morela Ocampo y Santiago Villegas      ← equipo de dirección
--       │   ├── Cabudare Matrimonios 1  (su líder y su colíder)
--       │   └── …
--       ├── Carlos Alexander Caballero Silva       ← director sin pareja
--       │   └── …
--       └── Barquisimeto Matrimonios 7  ← grupo vigente sin director asignado
--
-- La regla de pareja es LA MISMA que usa Grupos de Vida en
-- app/(auth)/grupos-vida/segmentos/[segmentoId]/page.tsx: dos directores del
-- mismo segmento van juntos cuando `relaciones_usuarios` los registra como
-- cónyuges. Quien no tiene pareja registrada ahí va solo — por eso Ingrid Díaz
-- de Caballero y Carlos Alexander Caballero Silva aparecen separados, igual
-- que en la pantalla de Grupos de Vida: la relación no está cargada. Copiar la
-- regla en vez de inventar otra es lo que mantiene las dos pantallas contando
-- la misma historia.
--
-- El segmento deja de listar a sus directores de etapa: ahora son sus nodos
-- hijos. Conserva sólo a sus directores generales (`director_general_segmentos`),
-- que son uno o ninguno por segmento y supervisan el segmento entero.
--
-- ── LOS DOS CASOS INCÓMODOS, RESUELTOS A LA VISTA ──────────────────────
-- · Un grupo con directores de más de un equipo (5 grupos vigentes en
--   staging): un nodo tiene un solo padre, así que cuelga del equipo que
--   aporta más de sus directores —desempate alfabético— y los demás aparecen
--   como responsables del grupo con rol `director_etapa`. Así no se pierde
--   ninguna supervisión.
-- · Un grupo vigente sin director asignado (27 en staging: 16 en Matrimonios,
--   6 en Hombre +36, 5 en Mujeres +36): cuelga directo del segmento. No se
--   inventa un nodo "sin director": en un organigrama, lo que no tiene
--   supervisor cuelga de la unidad de arriba, y así el hueco queda visible.
--
-- ── QUÉ NO CAMBIA ──────────────────────────────────────────────────────
-- Sólo lectura sobre Grupos de Vida: cero escrituras, cero cambios de esquema,
-- cero políticas. El gate sigue siendo el mismo recorrido del árbol de
-- 20260911120000 (los seis términos de Dream Team sobre el nodo de Grupos de
-- Vida, sin términos de talleres y sin ficha propia). `dream_team_lideres_gdv()`
-- no se toca: los líderes siguen colgando de su grupo, y el grupo es el que
-- cambió de padre. "Grupo vigente" sigue siendo el mismo predicado: activo, no
-- eliminado, aprobado y de temporada activa.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   restaurar dream_team_estructura_gdv() desde 20260911140000.

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
  ),
  directores as (
    select sl.id as sl_id,
           sl.segmento_id,
           sl.usuario_id,
           concat_ws(' ', u.nombre, u.apellido) as nombre
    from public.segmento_lideres sl
    join public.usuarios u on u.id = sl.usuario_id
  ),
  -- Dos directores del mismo segmento son pareja cuando Grupos de Vida los
  -- tiene registrados como cónyuges. Misma regla que su pantalla de segmento.
  parejas as (
    select a.segmento_id, a.usuario_id as u1, b.usuario_id as u2
    from directores a
    join directores b
      on b.segmento_id = a.segmento_id
     and b.usuario_id > a.usuario_id
    join public.relaciones_usuarios r
      on r.tipo_relacion = 'conyuge'
     and ((r.usuario1_id = a.usuario_id and r.usuario2_id = b.usuario_id)
       or (r.usuario1_id = b.usuario_id and r.usuario2_id = a.usuario_id))
  ),
  pareja_de as (
    select segmento_id, u1 as usuario_id, u1, u2 from parejas
    union all
    select segmento_id, u2 as usuario_id, u1, u2 from parejas
  ),
  -- Cada director, con la clave del equipo al que pertenece: su pareja si la
  -- tiene, o él mismo. La clave lleva el segmento porque la misma persona
  -- puede dirigir en dos segmentos (pasa en staging).
  director_con_equipo as (
    select d.sl_id,
           d.segmento_id,
           d.usuario_id,
           d.nombre,
           coalesce(p.u1, d.usuario_id) as clave_u1,
           p.u2 as clave_u2
    from directores d
    left join pareja_de p
      on p.segmento_id = d.segmento_id
     and p.usuario_id = d.usuario_id
  ),
  equipos_direccion as (
    select segmento_id,
           clave_u1,
           clave_u2,
           md5('dream_team.gdv.directores:' || segmento_id::text || ':' || clave_u1::text || ':' || coalesce(clave_u2::text, ''))::uuid as nodo_id,
           string_agg(nombre, ' y ' order by nombre) as label
    from director_con_equipo
    group by segmento_id, clave_u1, clave_u2
  ),
  asignaciones as (
    select gv.id as grupo_id,
           e.nodo_id as equipo_nodo_id,
           dce.usuario_id,
           dce.nombre
    from grupos_vigentes gv
    join public.director_etapa_grupos deg on deg.grupo_id = gv.id
    join director_con_equipo dce on dce.sl_id = deg.director_etapa_id
    join equipos_direccion e
      on e.segmento_id = dce.segmento_id
     and e.clave_u1 = dce.clave_u1
     and e.clave_u2 is not distinct from dce.clave_u2
  ),
  -- El equipo del que cuelga el grupo: el que aporta más de sus directores.
  equipo_por_grupo as (
    select distinct on (grupo_id) grupo_id, equipo_nodo_id
    from (
      select grupo_id, equipo_nodo_id, count(*) as cuantos, min(nombre) as primer_nombre
      from asignaciones
      group by grupo_id, equipo_nodo_id
    ) conteo
    order by grupo_id, cuantos desc, primer_nombre
  ),
  -- Los directores del grupo que quedaron fuera de ese equipo.
  supervisores_extra as (
    select a.grupo_id,
           jsonb_agg(distinct jsonb_build_object(
             'persona_id', a.usuario_id,
             'nombre', a.nombre,
             'rol', 'director_etapa')) as extra
    from asignaciones a
    join equipo_por_grupo epg on epg.grupo_id = a.grupo_id
    where a.equipo_nodo_id <> epg.equipo_nodo_id
    group by a.grupo_id
  )

  -- La dirección: sus directores generales.
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

  -- Cada segmento: sólo su director general. Los de etapa son nodos hijos.
  select s.id,
         a.id,
         'segmento',
         s.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', u.id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', 'director_general')
                  order by concat_ws(' ', u.nombre, u.apellido))
           from public.director_general_segmentos dgs
           join public.usuarios u on u.id = dgs.usuario_id
           where dgs.segmento_id = s.id
         ), '[]'::jsonb)
  from public.segmentos s
  cross join alcance a

  union all

  -- Cada equipo de dirección: la pareja, o el director solo. Su etiqueta ya
  -- son los nombres, así que no lleva responsables: repetirlos sería decir
  -- dos veces lo mismo en la misma fila.
  select e.nodo_id,
         e.segmento_id,
         'directores',
         e.label,
         '[]'::jsonb
  from equipos_direccion e
  cross join alcance a

  union all

  -- Cada grupo vigente: su líder y su colíder, más los directores que lo
  -- supervisan desde otro equipo.
  select gv.id,
         coalesce(epg.equipo_nodo_id, gv.segmento_id),
         'grupo',
         gv.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', gm.usuario_id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', case when gm.rol = 'Líder' then 'lider' else 'colider' end)
                  order by gm.rol, u.nombre)
           from public.grupo_miembros gm
           join public.usuarios u on u.id = gm.usuario_id
           where gm.grupo_id = gv.id
             and gm.rol in ('Líder', 'Colíder')
             and gm.fecha_salida is null
             and coalesce(gm.estado, 'activo') = 'activo'
         ), '[]'::jsonb) || coalesce(se.extra, '[]'::jsonb)
  from grupos_vigentes gv
  cross join alcance a
  left join equipo_por_grupo epg on epg.grupo_id = gv.id
  left join supervisores_extra se on se.grupo_id = gv.id;
$$;

comment on function public.dream_team_estructura_gdv() is
  'Ramas virtuales de Grupos de Vida: dirección, segmentos, equipos de '
  'dirección (parejas de directores de etapa, con la misma regla de cónyuge '
  'que usa Grupos de Vida) y grupos vigentes colgados de su equipo. Sólo '
  'lectura, calculadas al leer. Mismo gate por árbol que dream_team_lideres_gdv().';
