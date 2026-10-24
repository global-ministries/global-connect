-- A couple leads together only when both hold the role (feature "uno-a-uno",
-- task T10).
--
-- What: the who-leads-whom rule stops adding a leader's spouse. Changed, same
-- signatures (create or replace):
--   uno_a_uno_dirigidos_de, uno_a_uno_relaciones   no lead through a spouse
--   uno_a_uno_ubicaciones                          no place through a spouse
--   uno_a_uno_crear    a spouse joins a 1:1 only when they share the relation
--   mis_dirigidos      conyuge_id only when the spouse is led by the caller too
--
-- Why: the wife of the Líder of a Hombres group showed up as a leader of those
-- men in supervision. User decision 2026-10-24: "la pareja lidera junta en
-- grupos de matrimonio solamente". In Matrimonios both spouses are loaded as
-- Líder, so they keep leading together; elsewhere each person counts by their
-- own role. Never oneself nor one's own spouse as a dirigido (unchanged).
--
-- uno_a_uno_relaciones must keep giving, per lider_id, exactly what
-- uno_a_uno_dirigidos_de gives (case R of uno-a-uno-supervision.test.sql).
--
-- Data safety: functions only; no table or row changes. Production has no
-- 1:1 rows, so no existing 1:1 needs fixing.
--
-- Rollback: re-run uno_a_uno_dirigidos_de and mis_dirigidos from
-- 20261015120000_uno_a_uno_modelo.sql, uno_a_uno_relaciones and uno_a_uno_crear
-- from 20261024120000_uno_a_uno_supervision.sql, and uno_a_uno_ubicaciones from
-- 20261024140000_uno_a_uno_supervision_ubicaciones.sql.

create or replace function public.uno_a_uno_dirigidos_de(p_usuario uuid)
returns table (usuario_id uuid, contextos text[])
language sql
stable security definer
set search_path to 'public'
as $$
  -- Everyone leads by their own role only (T10): a spouse leads nobody for
  -- being married to a leader. A Matrimonios couple still leads together
  -- because both are loaded as Líder.
  with unidad as (
    select p_usuario as id
    where p_usuario is not null
  ),
  grupos_vigentes as (
    select g.id, g.nombre
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  miembros_vigentes as (
    select gm.grupo_id, gm.usuario_id, gm.rol
    from public.grupo_miembros gm
    where gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
  ),
  gdv as (
    select m.usuario_id, 'GDV: ' || g.nombre as contexto
    from miembros_vigentes l
    join unidad u on u.id = l.usuario_id
    join grupos_vigentes g on g.id = l.grupo_id
    join miembros_vigentes m on m.grupo_id = l.grupo_id
    where l.rol = 'Líder'
      and m.rol in ('Colíder', 'Miembro')
  ),
  director_etapa as (
    select m.usuario_id, 'Director de etapa: ' || s.nombre as contexto
    from public.segmento_lideres sl
    join unidad u on u.id = sl.usuario_id
    join public.segmentos s on s.id = sl.segmento_id
    join public.director_etapa_grupos deg on deg.director_etapa_id = sl.id
    join grupos_vigentes g on g.id = deg.grupo_id
    join miembros_vigentes m on m.grupo_id = g.id
    where sl.tipo_lider = 'director_etapa'
      and m.rol = 'Líder'
  ),
  director_general as (
    select sl.usuario_id, 'Director general: ' || s.nombre as contexto
    from public.director_general_segmentos dgs
    join unidad u on u.id = dgs.usuario_id
    join public.segmentos s on s.id = dgs.segmento_id
    join public.segmento_lideres sl
      on sl.segmento_id = dgs.segmento_id
     and sl.tipo_lider = 'director_etapa'
    where dgs.alcance = 'segmento'
       or (dgs.alcance = 'directores'
           and exists (select 1
                       from public.dg_directores_etapa dde
                       where dde.dg_usuario_id = dgs.usuario_id
                         and dde.segmento_lider_id = sl.id))
  ),
  -- Active servicios in active equipos with the rank of their nivel.
  dt_niveles as (
    select sv.persona_id, sv.equipo_id, e.parent_equipo_id, e.label as equipo_label,
           case r.nivel
             when 'director' then 4
             when 'coordinador' then 3
             when 'lider' then 2
             else 1
           end as rango
    from public.dream_team_servicios sv
    join public.dream_team_equipos e on e.id = sv.equipo_id
    join public.dream_team_roles r on r.id = sv.rol_id
    where sv.estado = 'activo'
      and e.activo
  ),
  dt_servicios as (
    select n.*, max(n.rango) over (partition by n.equipo_id) as rango_max
    from dt_niveles n
  ),
  -- The head of an equipo: its servicios with the highest rank.
  dt_cabezas as (
    select s.persona_id, s.equipo_id, s.parent_equipo_id, s.equipo_label, s.rango
    from dt_servicios s
    where s.rango = s.rango_max
  ),
  dt_mismo_equipo as (
    select o.persona_id as usuario_id, 'Dream Team: ' || l.equipo_label as contexto
    from dt_servicios l
    join unidad u on u.id = l.persona_id
    join dt_servicios o on o.equipo_id = l.equipo_id and o.rango < l.rango
    where l.rango >= 2
  ),
  dt_sub_equipos as (
    select hc.persona_id as usuario_id, 'Dream Team: ' || hc.equipo_label as contexto
    from dt_cabezas hp
    join unidad u on u.id = hp.persona_id
    join dt_cabezas hc on hc.parent_equipo_id = hp.equipo_id
    where hp.rango >= 2
  ),
  todos as (
    select usuario_id, contexto from gdv
    union all
    select usuario_id, contexto from director_etapa
    union all
    select usuario_id, contexto from director_general
    union all
    select usuario_id, contexto from dt_mismo_equipo
    union all
    select usuario_id, contexto from dt_sub_equipos
  )
  select t.usuario_id, array_agg(distinct t.contexto order by t.contexto)
  from todos t
  -- Never oneself nor one's own spouse.
  where t.usuario_id <> p_usuario
    and t.usuario_id is distinct from public.talleres_conyuge_unico(p_usuario)
  group by t.usuario_id;
$$;

create or replace function public.uno_a_uno_relaciones()
returns table (lider_id uuid, dirigido_id uuid, contexto text)
language sql
stable security definer
set search_path to 'public'
as $$
  with conyuges as (
    select x.persona, case when count(distinct x.otro) = 1 then (array_agg(x.otro))[1] end as conyuge
    from (select r.usuario1_id as persona, r.usuario2_id as otro
            from public.relaciones_usuarios r
           where r.tipo_relacion = 'conyuge'
          union all
          select r.usuario2_id, r.usuario1_id
            from public.relaciones_usuarios r
           where r.tipo_relacion = 'conyuge') x
    group by x.persona
  ),
  grupos_vigentes as (
    select g.id, g.nombre
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  miembros_vigentes as (
    select gm.grupo_id, gm.usuario_id, gm.rol
    from public.grupo_miembros gm
    where gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
  ),
  gdv as (
    select l.usuario_id as lider_id, m.usuario_id as dirigido_id, 'GDV: ' || g.nombre as contexto
    from miembros_vigentes l
    join grupos_vigentes g on g.id = l.grupo_id
    join miembros_vigentes m on m.grupo_id = l.grupo_id
    where l.rol = 'Líder'
      and m.rol in ('Colíder', 'Miembro')
  ),
  director_etapa as (
    select sl.usuario_id, m.usuario_id, 'Director de etapa: ' || s.nombre
    from public.segmento_lideres sl
    join public.segmentos s on s.id = sl.segmento_id
    join public.director_etapa_grupos deg on deg.director_etapa_id = sl.id
    join grupos_vigentes g on g.id = deg.grupo_id
    join miembros_vigentes m on m.grupo_id = g.id
    where sl.tipo_lider = 'director_etapa'
      and m.rol = 'Líder'
  ),
  director_general as (
    select dgs.usuario_id, sl.usuario_id, 'Director general: ' || s.nombre
    from public.director_general_segmentos dgs
    join public.segmentos s on s.id = dgs.segmento_id
    join public.segmento_lideres sl
      on sl.segmento_id = dgs.segmento_id
     and sl.tipo_lider = 'director_etapa'
    where dgs.alcance = 'segmento'
       or (dgs.alcance = 'directores'
           and exists (select 1
                       from public.dg_directores_etapa dde
                       where dde.dg_usuario_id = dgs.usuario_id
                         and dde.segmento_lider_id = sl.id))
  ),
  dt_niveles as (
    select sv.persona_id, sv.equipo_id, e.parent_equipo_id, e.label as equipo_label,
           case r.nivel
             when 'director' then 4
             when 'coordinador' then 3
             when 'lider' then 2
             else 1
           end as rango
    from public.dream_team_servicios sv
    join public.dream_team_equipos e on e.id = sv.equipo_id
    join public.dream_team_roles r on r.id = sv.rol_id
    where sv.estado = 'activo'
      and e.activo
  ),
  dt_servicios as (
    select n.*, max(n.rango) over (partition by n.equipo_id) as rango_max
    from dt_niveles n
  ),
  dt_cabezas as (
    select s.persona_id, s.equipo_id, s.parent_equipo_id, s.equipo_label, s.rango
    from dt_servicios s
    where s.rango = s.rango_max
  ),
  dt_mismo_equipo as (
    select l.persona_id, o.persona_id, 'Dream Team: ' || l.equipo_label
    from dt_servicios l
    join dt_servicios o on o.equipo_id = l.equipo_id and o.rango < l.rango
    where l.rango >= 2
  ),
  dt_sub_equipos as (
    select hp.persona_id, hc.persona_id, 'Dream Team: ' || hc.equipo_label
    from dt_cabezas hp
    join dt_cabezas hc on hc.parent_equipo_id = hp.equipo_id
    where hp.rango >= 2
  ),
  individuales as (
    select * from gdv
    union all
    select * from director_etapa
    union all
    select * from director_general
    union all
    select * from dt_mismo_equipo
    union all
    select * from dt_sub_equipos
  ),
  -- Everyone leads by their own role only (T10), as in uno_a_uno_dirigidos_de.
  por_unidad as (
    select distinct i.lider_id, i.dirigido_id, i.contexto from individuales i
  )
  select p.lider_id, p.dirigido_id, p.contexto
  from por_unidad p
  left join conyuges c on c.persona = p.lider_id
  where p.dirigido_id <> p.lider_id
    and p.dirigido_id is distinct from c.conyuge;
$$;

create or replace function public.uno_a_uno_ubicaciones()
returns table (
  lider_id uuid,
  direccion_id text,
  direccion text,
  area_id text,
  area text,
  equipo_id text,
  equipo text
)
language sql
stable security definer
set search_path to 'public'
as $$
  with recursive sube as (
    -- From each equipo up to its root: cadena = [equipo, parent, …, root].
    select e.id as equipo_id, e.parent_equipo_id as siguiente, array[e.id] as cadena
    from public.dream_team_equipos e
    union all
    select s.equipo_id, p.parent_equipo_id, s.cadena || p.id
    from sube s
    join public.dream_team_equipos p on p.id = s.siguiente
    where not p.id = any (s.cadena)
  ),
  rutas as (
    select s.equipo_id,
           s.cadena[cardinality(s.cadena)] as raiz_id,
           case when cardinality(s.cadena) >= 2 then s.cadena[cardinality(s.cadena) - 1] end as area_id,
           case when cardinality(s.cadena) >= 3 then s.equipo_id end as hoja_id,
           -- Named by its path below the área: two "Anfitriones" under
           -- different sub-áreas stay apart ("Waumba Land › Anfitriones").
           case when cardinality(s.cadena) >= 3 then
             (select string_agg(x.label, ' › ' order by u.ord desc)
                from unnest(s.cadena[1:cardinality(s.cadena) - 2]) with ordinality as u(id, ord)
                join public.dream_team_equipos x on x.id = u.id)
           end as hoja_label
    from sube s
    where s.siguiente is null
  ),
  direccion_gdv as (
    select coalesce(
             (select jsonb_build_object('id', e.id::text, 'label', e.label)
                from public.dream_team_equipos e
               where e.parent_equipo_id is null and e.experiencia = 'grupos_vida'
               order by e.activo desc, e.label
               limit 1),
             jsonb_build_object('id', 'grupos_vida', 'label', 'Grupos de Vida')) as d
  ),
  -- Two current groups of one segmento can share a name when two temporadas
  -- are active at once; the temporada then tells them apart.
  grupos_vigentes as (
    select g.id,
           case when count(*) over (partition by g.segmento_id, g.nombre) > 1
                then g.nombre || ' (' || t.nombre || ')'
                else g.nombre end as nombre,
           g.segmento_id
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  dream_team as (
    select sv.persona_id as lider_id,
           ra.id::text as direccion_id, ra.label as direccion,
           ar.id::text as area_id, ar.label as area,
           ru.hoja_id::text as equipo_id, ru.hoja_label as equipo
    from public.dream_team_servicios sv
    join public.dream_team_equipos e on e.id = sv.equipo_id
    join public.dream_team_roles r on r.id = sv.rol_id
    join rutas ru on ru.equipo_id = sv.equipo_id
    join public.dream_team_equipos ra on ra.id = ru.raiz_id
    left join public.dream_team_equipos ar on ar.id = ru.area_id
    where sv.estado = 'activo'
      and e.activo
      and r.nivel in ('director', 'coordinador', 'lider')
  ),
  gdv_lider as (
    select gm.usuario_id, (dg.d ->> 'id'), (dg.d ->> 'label'), s.id::text, s.nombre, g.id::text, g.nombre
    from public.grupo_miembros gm
    join grupos_vigentes g on g.id = gm.grupo_id
    join public.segmentos s on s.id = g.segmento_id
    cross join direccion_gdv dg
    where gm.rol = 'Líder'
      and gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
  ),
  gdv_director_etapa as (
    select sl.usuario_id, (dg.d ->> 'id'), (dg.d ->> 'label'), s.id::text, s.nombre, null::text, null::text
    from public.segmento_lideres sl
    join public.segmentos s on s.id = sl.segmento_id
    cross join direccion_gdv dg
    where sl.tipo_lider = 'director_etapa'
  ),
  gdv_director_general as (
    select dgs.usuario_id, (dg.d ->> 'id'), (dg.d ->> 'label'), s.id::text, s.nombre, null::text, null::text
    from public.director_general_segmentos dgs
    join public.segmentos s on s.id = dgs.segmento_id
    cross join direccion_gdv dg
  ),
  propias as (
    select * from dream_team
    union
    select * from gdv_lider
    union
    select * from gdv_director_etapa
    union
    select * from gdv_director_general
  )
  -- Everyone sits by their own role only (T10).
  select * from propias;
$$;

create or replace function public.uno_a_uno_crear(
  p_lider uuid,
  p_dirigido uuid,
  p_estado text,
  p_fecha_hora timestamptz,
  p_lugar text,
  p_resumen text,
  p_nota_privada text,
  p_celebracion text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_lider_conyuge uuid;
  v_dirigido_conyuge uuid;
begin
  if p_dirigido is null
     or not exists (select 1 from public.uno_a_uno_dirigidos_de(p_lider) d where d.usuario_id = p_dirigido) then
    raise exception 'No lideras a esta persona.' using errcode = '42501';
  end if;

  insert into public.uno_a_uno (estado, fecha_hora, lugar, resumen, nota_privada, celebracion, creado_por, realizado_en) -- noqa: insert-into
  values (p_estado, p_fecha_hora, nullif(btrim(p_lugar), ''), p_resumen, nullif(btrim(p_nota_privada), ''),
          nullif(btrim(p_celebracion), ''), p_lider,
          case when p_estado = 'realizado' then now() end)
  returning id into v_id;

  -- A spouse joins only when they share the relationship (T10): the leader's
  -- spouse when they also lead this dirigido, the dirigido's spouse when the
  -- leader also leads them. A Matrimonios couple goes together; in a Hombres
  -- or Mujeres group nobody's spouse is added.
  v_lider_conyuge := public.talleres_conyuge_unico(p_lider);
  if v_lider_conyuge is not null
     and not exists (select 1 from public.uno_a_uno_dirigidos_de(v_lider_conyuge) d where d.usuario_id = p_dirigido) then
    v_lider_conyuge := null;
  end if;
  v_dirigido_conyuge := public.talleres_conyuge_unico(p_dirigido);
  if v_dirigido_conyuge is not null
     and not exists (select 1 from public.uno_a_uno_dirigidos_de(p_lider) d where d.usuario_id = v_dirigido_conyuge) then
    v_dirigido_conyuge := null;
  end if;

  insert into public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado)
  select v_id, x.usuario_id, x.lado
  from (values (p_lider, 'lider'),
               (v_lider_conyuge, 'lider'),
               (p_dirigido, 'dirigido'),
               (v_dirigido_conyuge, 'dirigido')) as x(usuario_id, lado)
  where x.usuario_id is not null
    and (x.lado = 'lider' or x.usuario_id not in (p_lider, coalesce(v_lider_conyuge, p_lider)))
  on conflict (uno_a_uno_id, usuario_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.mis_dirigidos()
returns table (usuario_id uuid, nombre text, apellido text, conyuge_id uuid, contextos text[])
language sql
stable security definer
set search_path to 'public'
as $$
  -- conyuge_id only when the spouse is led by the caller too (T10), so the
  -- screen offers a Matrimonios couple together and a Hombres member alone.
  with d as (
    select * from public.uno_a_uno_dirigidos_de((select public.get_my_internal_id()))
  )
  select d.usuario_id, u.nombre, u.apellido,
         (select c.id
            from (select public.talleres_conyuge_unico(d.usuario_id) as id) c
           where c.id in (select d2.usuario_id from d d2)),
         d.contextos
  from d
  join public.usuarios u on u.id = d.usuario_id
  order by u.nombre, u.apellido, d.usuario_id;
$$;

comment on function public.uno_a_uno_dirigidos_de(uuid) is
  'Who a usuario leads by their own role, one row per person with every context. Internal: the 1:1 functions call it.';
comment on function public.mis_dirigidos() is
  'The people the caller leads, with their spouse when the caller leads them too, and why.';
