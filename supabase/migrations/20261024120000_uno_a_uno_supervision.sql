-- 1:1 supervision and celebración (feature "uno-a-uno", task T7).
--
-- What:
--   uno_a_uno.celebracion          optional, ≤ 500 characters, written when a
--                                  1:1 is recorded
--   uno_a_uno_relaciones()         internal: the who-leads-whom rule of
--                                  uno_a_uno_dirigidos_de for every usuario at
--                                  once (one pass instead of one call per person)
--   uno_a_uno_supervisados_de(u)   internal: u's chain, the transitive closure
--   uno_a_uno_supervision()        the 1:1s of the caller's chain (admin and
--                                  pastor: every 1:1), without nota_privada
--   uno_a_uno_supervision_lideres(p_dias)  per leader of the chain: dirigidos,
--                                  realizados in the window, agendados ahead,
--                                  último realizado and what they lead
--   uno_a_uno_acceso()             {lidera, supervisa, participa} for the menu
--   uno_a_uno_crear / uno_a_uno_registrar / uno_a_uno_registrar_sin_agenda
--                                  take p_celebracion (default null)
--   mis_uno_a_uno()                adds celebracion, leader side only; and the
--                                  dirigido side stops reading motivo_cancelacion
--
-- Why: admins, pastors and every leader above someone could not see whether
-- the 1:1s happen. Decided 2026-10-24 (odd/tasks/uno-a-uno.md, T7): admin and
-- pastor see all; everyone else sees their chain. The supervisor reads the
-- resumen and the celebración; the nota privada stays with the leader side.
-- The dirigido side sees only the history (estado, fecha, lugar, who), nothing
-- the leader wrote (user decision 2026-10-24): no resumen, nota, celebración
-- nor motivo de cancelación.
--
-- Who is in a chain: whoever the caller (with their spouse) leads, whoever
-- those lead, and so on (WITH RECURSIVE … UNION stops on cycles). A 1:1 is
-- supervised when someone of the chain is on its leader side; the 1:1s the
-- caller takes part in stay in "Mis 1 a 1" and are not repeated here.
--
-- uno_a_uno_relaciones() repeats the rule of uno_a_uno_dirigidos_de (T3) in
-- set form; uno_a_uno_dirigidos_de stays as it is. The test
-- supabase/tests/uno-a-uno-supervision.test.sql (case R) checks that both give
-- the same for every usuario of the database: change both together.
--
-- Data safety: one nullable column added; no row is changed. The three
-- writing functions and mis_uno_a_uno change signature, so the old ones are
-- dropped and recreated in this transaction; callers that do not pass
-- p_celebracion keep working (it defaults to null) and mis_uno_a_uno only adds
-- a column at the end.
--
-- Rollback (run in this order, then re-run the T3 definitions of
-- uno_a_uno_crear, uno_a_uno_registrar, uno_a_uno_registrar_sin_agenda and
-- mis_uno_a_uno from 20261015120000_uno_a_uno_modelo.sql):
--   DROP FUNCTION IF EXISTS public.uno_a_uno_acceso();
--   DROP FUNCTION IF EXISTS public.uno_a_uno_supervision_lideres(integer);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_supervision(timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_supervisados_de(uuid);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_relaciones();
--   DROP FUNCTION IF EXISTS public.mis_uno_a_uno(timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_registrar(uuid, text, text, timestamptz, text);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text, text);
--   ALTER TABLE public.uno_a_uno DROP COLUMN IF EXISTS celebracion;

-- ─── celebración ────────────────────────────────────────────────────

alter table public.uno_a_uno
  add column celebracion text
    constraint uno_a_uno_celebracion_check check (celebracion is null or char_length(celebracion) <= 500);

comment on column public.uno_a_uno.celebracion is
  'Something worth celebrating from the 1:1. The leader side and the chain above read it; the dirigido side does not.';

-- ─── The rule for everyone at once ──────────────────────────────────
-- One row per (lider_id, dirigido_id, contexto). For any usuario X the rows
-- with lider_id = X are exactly uno_a_uno_dirigidos_de(X): X leads with their
-- spouse, and never themself nor that spouse.

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
  -- A couple leads together: X also leads what X's spouse leads (the spouse
  -- as talleres_conyuge_unico(X) sees it, so it is X's view that counts).
  por_unidad as (
    select i.lider_id, i.dirigido_id, i.contexto from individuales i
    union
    select c.persona, i.dirigido_id, i.contexto
    from individuales i
    join conyuges c on c.conyuge = i.lider_id
  )
  select p.lider_id, p.dirigido_id, p.contexto
  from por_unidad p
  left join conyuges c on c.persona = p.lider_id
  where p.dirigido_id <> p.lider_id
    and p.dirigido_id is distinct from c.conyuge;
$$;

comment on function public.uno_a_uno_relaciones() is
  'The rule of uno_a_uno_dirigidos_de for every usuario in one pass. Internal: the supervision functions call it.';

revoke all on function public.uno_a_uno_relaciones() from public, anon, authenticated;
grant execute on function public.uno_a_uno_relaciones() to service_role;

-- ─── A usuario's chain ──────────────────────────────────────────────

create or replace function public.uno_a_uno_supervisados_de(p_usuario uuid)
returns table (usuario_id uuid)
language sql
stable security definer
set search_path to 'public'
as $$
  with recursive rel as materialized (
    select r.lider_id, r.dirigido_id from public.uno_a_uno_relaciones() r
  ),
  unidad as (
    select x.id
    from (values (p_usuario), (public.talleres_conyuge_unico(p_usuario))) as x(id)
    where x.id is not null
  ),
  cadena (usuario_id) as (
    select r.dirigido_id from rel r where r.lider_id = p_usuario
    union
    select r.dirigido_id from cadena c join rel r on r.lider_id = c.usuario_id
  )
  select c.usuario_id from cadena c where c.usuario_id not in (select id from unidad);
$$;

comment on function public.uno_a_uno_supervisados_de(uuid) is
  'Everyone below a usuario (with their spouse) in who-leads-whom, at any depth. Internal.';

revoke all on function public.uno_a_uno_supervisados_de(uuid) from public, anon, authenticated;
grant execute on function public.uno_a_uno_supervisados_de(uuid) to service_role;

-- ─── Internal insert, now with celebración ──────────────────────────

drop function public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text);

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

  v_lider_conyuge := public.talleres_conyuge_unico(p_lider);
  v_dirigido_conyuge := public.talleres_conyuge_unico(p_dirigido);

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

revoke all on function public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text, text) to service_role;

-- ─── registrar sin agenda ───────────────────────────────────────────

drop function public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text);

create or replace function public.uno_a_uno_registrar_sin_agenda(
  p_dirigido_id uuid,
  p_fecha_hora timestamptz,
  p_resumen text,
  p_nota_privada text default null,
  p_lugar text default null,
  p_celebracion text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;
  if p_fecha_hora is null or p_fecha_hora > now() then
    raise exception 'La fecha de un 1 a 1 realizado no puede ser futura.' using errcode = '22023';
  end if;
  if nullif(btrim(p_resumen), '') is null then
    raise exception 'El resumen es obligatorio.' using errcode = '22023';
  end if;
  if char_length(btrim(p_celebracion)) > 500 then
    raise exception 'La celebración no puede superar 500 caracteres.' using errcode = '22023';
  end if;

  return public.uno_a_uno_crear(v_caller, p_dirigido_id, 'realizado', p_fecha_hora, p_lugar,
                                btrim(p_resumen), p_nota_privada, p_celebracion);
end;
$$;

revoke all on function public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text, text) to authenticated, service_role;

-- ─── registrar ──────────────────────────────────────────────────────

drop function public.uno_a_uno_registrar(uuid, text, text, timestamptz);

create or replace function public.uno_a_uno_registrar(
  p_id uuid,
  p_resumen text,
  p_nota_privada text default null,
  p_fecha_hora timestamptz default null,
  p_celebracion text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
  v_estado text;
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select u.estado into v_estado from public.uno_a_uno u where u.id = p_id for update;
  if not found then
    raise exception 'No encontramos este 1 a 1.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.uno_a_uno_personas p
                 where p.uno_a_uno_id = p_id and p.usuario_id = v_caller and p.lado = 'lider') then
    raise exception 'Solo quien lidera este 1 a 1 puede cambiarlo.' using errcode = '42501';
  end if;
  if v_estado <> 'agendado' then
    raise exception 'Este 1 a 1 ya no está agendado.' using errcode = '22023';
  end if;
  if p_fecha_hora > now() then
    raise exception 'La fecha de un 1 a 1 realizado no puede ser futura.' using errcode = '22023';
  end if;
  if nullif(btrim(p_resumen), '') is null then
    raise exception 'El resumen es obligatorio.' using errcode = '22023';
  end if;
  if char_length(btrim(p_celebracion)) > 500 then
    raise exception 'La celebración no puede superar 500 caracteres.' using errcode = '22023';
  end if;

  -- Recorded before its scheduled time: it happened by now.
  update public.uno_a_uno u
     set estado = 'realizado',
         resumen = btrim(p_resumen),
         nota_privada = nullif(btrim(p_nota_privada), ''),
         celebracion = nullif(btrim(p_celebracion), ''),
         fecha_hora = coalesce(p_fecha_hora, least(u.fecha_hora, now())),
         realizado_en = now(),
         actualizado_en = now()
   where u.id = p_id;
end;
$$;

revoke all on function public.uno_a_uno_registrar(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.uno_a_uno_registrar(uuid, text, text, timestamptz, text) to authenticated, service_role;

-- ─── mis_uno_a_uno, now with celebración ────────────────────────────
-- Whatever the leader wrote (resumen, nota_privada, motivo_cancelacion,
-- celebracion) only reaches the leader side; the dirigido side gets the history.

drop function public.mis_uno_a_uno(timestamptz, timestamptz);

create or replace function public.mis_uno_a_uno(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (
  id uuid,
  estado text,
  fecha_hora timestamptz,
  lugar text,
  mi_lado text,
  lideres jsonb,
  dirigidos jsonb,
  resumen text,
  nota_privada text,
  motivo_cancelacion text,
  realizado_en timestamptz,
  cancelado_en timestamptz,
  celebracion text
)
language sql
stable security definer
set search_path to 'public'
as $$
  select o.id,
         o.estado,
         o.fecha_hora,
         o.lugar,
         yo.lado,
         (select coalesce(jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                                    order by us.nombre, us.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas p
            join public.usuarios us on us.id = p.usuario_id
           where p.uno_a_uno_id = o.id and p.lado = 'lider'),
         (select coalesce(jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                                    order by us.nombre, us.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas p
            join public.usuarios us on us.id = p.usuario_id
           where p.uno_a_uno_id = o.id and p.lado = 'dirigido'),
         case when yo.lado = 'lider' then o.resumen end,
         case when yo.lado = 'lider' then o.nota_privada end,
         case when yo.lado = 'lider' then o.motivo_cancelacion end,
         o.realizado_en,
         o.cancelado_en,
         case when yo.lado = 'lider' then o.celebracion end
  from public.uno_a_uno_personas yo
  join public.uno_a_uno o on o.id = yo.uno_a_uno_id
  where yo.usuario_id = (select public.get_my_internal_id())
    and (p_desde is null or o.fecha_hora >= p_desde)
    and (p_hasta is null or o.fecha_hora < p_hasta)
  order by o.fecha_hora, o.id;
$$;

comment on function public.mis_uno_a_uno(timestamptz, timestamptz) is
  'The caller''s 1:1s from either side; what the leader wrote only for the leader side.';

revoke all on function public.mis_uno_a_uno(timestamptz, timestamptz) from public, anon;
grant execute on function public.mis_uno_a_uno(timestamptz, timestamptz) to authenticated, service_role;

-- ─── supervision ────────────────────────────────────────────────────
-- The 1:1s with someone of the caller's chain on the leader side (admin and
-- pastor: all of them), except the ones the caller takes part in, optionally
-- within [p_desde, p_hasta) on fecha_hora. Never nota_privada.

create or replace function public.uno_a_uno_supervision(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (
  id uuid,
  estado text,
  fecha_hora timestamptz,
  lugar text,
  lideres jsonb,
  dirigidos jsonb,
  resumen text,
  celebracion text,
  motivo_cancelacion text,
  realizado_en timestamptz,
  cancelado_en timestamptz
)
language sql
stable security definer
set search_path to 'public'
as $$
  with yo as (
    select public.get_my_internal_id() as id, public.es_admin_o_pastor(auth.uid()) as todo
  ),
  cadena as materialized (
    select s.usuario_id
    from yo
    cross join lateral public.uno_a_uno_supervisados_de(yo.id) s
    where yo.id is not null
      and not yo.todo
  )
  select o.id,
         o.estado,
         o.fecha_hora,
         o.lugar,
         (select coalesce(jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                                    order by us.nombre, us.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas p
            join public.usuarios us on us.id = p.usuario_id
           where p.uno_a_uno_id = o.id and p.lado = 'lider'),
         (select coalesce(jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                                    order by us.nombre, us.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas p
            join public.usuarios us on us.id = p.usuario_id
           where p.uno_a_uno_id = o.id and p.lado = 'dirigido'),
         case when o.estado = 'realizado' then o.resumen end,
         o.celebracion,
         o.motivo_cancelacion,
         o.realizado_en,
         o.cancelado_en
  from public.uno_a_uno o
  cross join yo
  where yo.id is not null
    and (yo.todo
         or exists (select 1
                    from public.uno_a_uno_personas p
                    join cadena c on c.usuario_id = p.usuario_id
                    where p.uno_a_uno_id = o.id and p.lado = 'lider'))
    and not exists (select 1 from public.uno_a_uno_personas p
                    where p.uno_a_uno_id = o.id and p.usuario_id = yo.id)
    and (p_desde is null or o.fecha_hora >= p_desde)
    and (p_hasta is null or o.fecha_hora < p_hasta)
  order by o.fecha_hora desc, o.id;
$$;

comment on function public.uno_a_uno_supervision(timestamptz, timestamptz) is
  'The 1:1s of the caller''s chain (admin and pastor: all), without nota_privada and without the caller''s own.';

revoke all on function public.uno_a_uno_supervision(timestamptz, timestamptz) from public, anon;
grant execute on function public.uno_a_uno_supervision(timestamptz, timestamptz) to authenticated, service_role;

-- ─── supervision per leader ─────────────────────────────────────────
-- One row per person of the chain who leads someone (admin and pastor: every
-- leader but themself): how many people they lead, realizados in the last
-- p_dias days, agendados ahead, the last realizado and what they lead.
-- Whoever has gone longest without a 1:1 comes first.

create or replace function public.uno_a_uno_supervision_lideres(p_dias integer default 30)
returns table (
  usuario_id uuid,
  nombre text,
  apellido text,
  contextos text[],
  dirigidos integer,
  realizados integer,
  agendados integer,
  ultimo_realizado timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_caller uuid := public.get_my_internal_id();
  v_todo boolean;
  v_conyuge uuid;
begin
  if p_dias is null or p_dias < 1 or p_dias > 366 then
    raise exception 'El período debe estar entre 1 y 366 días.' using errcode = '22023';
  end if;
  if v_caller is null then
    return;
  end if;
  v_todo := public.es_admin_o_pastor(auth.uid());
  v_conyuge := public.talleres_conyuge_unico(v_caller);

  return query
  with rel as materialized (
    select r.lider_id, r.dirigido_id, r.contexto from public.uno_a_uno_relaciones() r
  ),
  quienes as (
    select distinct r.lider_id
    from rel r
    where r.lider_id <> v_caller
      and r.lider_id is distinct from v_conyuge
      and (v_todo or r.lider_id in (select s.usuario_id from public.uno_a_uno_supervisados_de(v_caller) s))
  )
  select q.lider_id,
         us.nombre,
         us.apellido,
         ctx.contextos,
         ctx.dirigidos::integer,
         coalesce(st.realizados, 0)::integer,
         coalesce(st.agendados, 0)::integer,
         st.ultimo
  from quienes q
  join public.usuarios us on us.id = q.lider_id
  cross join lateral (
    select array_agg(distinct r.contexto order by r.contexto) as contextos, count(distinct r.dirigido_id) as dirigidos
    from rel r
    where r.lider_id = q.lider_id
  ) ctx
  left join lateral (
    select count(*) filter (where o.estado = 'realizado' and o.fecha_hora >= now() - make_interval(days => p_dias)) as realizados,
           count(*) filter (where o.estado = 'agendado' and o.fecha_hora >= now()) as agendados,
           max(o.fecha_hora) filter (where o.estado = 'realizado') as ultimo
    from public.uno_a_uno_personas p
    join public.uno_a_uno o on o.id = p.uno_a_uno_id
    where p.usuario_id = q.lider_id and p.lado = 'lider'
  ) st on true
  order by st.ultimo asc nulls first, us.nombre, us.apellido, q.lider_id;
end;
$$;

comment on function public.uno_a_uno_supervision_lideres(integer) is
  'Per leader of the caller''s chain (admin and pastor: every leader): dirigidos, realizados in p_dias, agendados, último realizado.';

revoke all on function public.uno_a_uno_supervision_lideres(integer) from public, anon;
grant execute on function public.uno_a_uno_supervision_lideres(integer) to authenticated, service_role;

-- ─── access, for the menu ───────────────────────────────────────────
-- lidera: the caller leads someone. supervisa: admin or pastor, or someone the
-- caller leads leads someone too (then the chain has 1:1s to see). participa:
-- the caller is in some 1:1 (so the person celebrated finds it).

create or replace function public.uno_a_uno_acceso()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  with yo as (select public.get_my_internal_id() as id)
  select jsonb_build_object(
    'lidera', exists (select 1 from yo cross join lateral public.uno_a_uno_dirigidos_de(yo.id) d
                       where yo.id is not null),
    'supervisa', (select yo.id is not null from yo)
                 and (public.es_admin_o_pastor(auth.uid())
                      -- One pass of the rule beats one call per dirigido (22 ms
                      -- against 66 ms for 34 dirigidos on staging); the (auth)
                      -- layout calls this on every page.
                      or exists (select 1
                                 from yo
                                 cross join lateral public.uno_a_uno_dirigidos_de(yo.id) d
                                 join (select distinct r.lider_id from public.uno_a_uno_relaciones() r) l
                                   on l.lider_id = d.usuario_id
                                 where yo.id is not null)),
    'participa', exists (select 1 from public.uno_a_uno_personas p join yo on p.usuario_id = yo.id)
  );
$$;

comment on function public.uno_a_uno_acceso() is
  'Whether the caller leads someone, supervises a chain with 1:1s (or is admin/pastor) and takes part in any 1:1.';

revoke all on function public.uno_a_uno_acceso() from public, anon;
grant execute on function public.uno_a_uno_acceso() to authenticated, service_role;
