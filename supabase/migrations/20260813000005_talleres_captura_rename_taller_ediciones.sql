-- El rename que producción ya tiene y el repositorio nunca escribió.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- `talleres_crecimiento_metadata` se renombró a `taller_ediciones` en
-- producción a mano, con un `ALTER TABLE … RENAME TO` ejecutado directo
-- contra la base. Ninguna migración lo registró. 20260817020000 lo confiesa
-- en su encabezado —"applied directly via ALTER TABLE … RENAME TO, not
-- captured in a migration file"— y ahí quedó.
--
-- La consecuencia es que las migraciones dejaron de poder reconstruir
-- producción. Un `supabase db reset` desde cero llega a 20260813000001 con la
-- tabla llamada todavía `talleres_crecimiento_metadata`, y la migración
-- siguiente que la toca —20260816000001— la busca por su nombre nuevo:
--
--   ERROR:  relation "public.taller_ediciones" does not exist
--
-- El reset muere ahí. Todo lo que venga después —las temporadas, los
-- certificados, las RPC de ediciones globales, las políticas de coordinador—
-- no se aplica. "Funciona en staging" no probaba nada, porque staging también
-- fue renombrada a mano: las dos bases coinciden entre sí y ninguna coincide
-- con el repositorio.
--
-- El rename de producción no fue sólo la tabla. Se verificó contra producción:
-- no queda un solo objeto con el nombre viejo. Se renombraron también sus
-- índices, sus constraints, su disparador, sus cuatro políticas y la función
-- `set_talleres_crecimiento_metadata_updated_at`, que además comparten seis
-- disparadores de otras tablas del dominio.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Renombra la tabla y todo lo que producción renombró con ella, SÓLO cuando el
-- nombre viejo existe y el nuevo no. En producción y en staging eso es falso,
-- así que esta migración no hace nada en ninguna de las dos: existe para que
-- un reset desde cero llegue al mismo lugar donde ya están.
--
-- Los objetos dependientes se recorren desde el catálogo en vez de escribirse
-- a mano, y esto es deliberado. Dos de los constraints que genera Postgres al
-- crear la tabla pasan de 63 caracteres y quedan truncados —
-- `talleres_crecimiento_metadat_duracion_estimada_minutos_sn_check` y
-- `talleres_crecimiento_metadat_modalidad_inscripcion_snapsh_check`, ambos con
-- el nombre de la tabla cortado en la última letra. Escribirlos a mano es
-- escribir un nombre que puede no ser el que Postgres eligió, y un nombre
-- equivocado no falla: el guard simplemente no encuentra nada y el objeto se
-- queda con el nombre viejo, en silencio. Recorrer el catálogo renombra lo que
-- de verdad está ahí. Los 25 objetos esperados son:
--
--   tabla       talleres_crecimiento_metadata → taller_ediciones
--   índices     idx_…_operating_core_event_id, _estado_active,
--               _modalidad_periodo_general, _tipo, _taller_id
--   constraints _pkey, _operating_core_event_id_key/_fkey, _tipo_check,
--               _link_type_check, _modalidad_inscripcion_check,
--               _recurrence_rule_check, _estado_check,
--               _sesiones_snapshot_check, los dos truncados de arriba,
--               _periodo_general_id_fkey, _taller_id_fkey
--   disparador  trg_…_updated_at
--   políticas   _select, _insert, _update, _delete
--   función     set_…_updated_at
--
-- El timestamp es de agosto a propósito, no de hoy: la migración tiene que
-- correr después de 20260813000001 —la última que ejecuta DDL contra el nombre
-- viejo— y antes de 20260816000001 —la primera que ejecuta DDL contra el
-- nombre nuevo. Un timestamp de hoy dejaría el reset roto igual. Contra
-- producción y staging se aplica fuera de orden, como no-op, y por eso el
-- orden del archivo no le importa a ninguna de las dos.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Cero en producción y cero en staging: las dos entran por el `else` y sólo
-- levantan un NOTICE. Nadie cambia de alcance, ninguna política cambia de
-- cuerpo, ningún dato se toca. En un reset desde cero el efecto es que el
-- reset ahora termina.
--
-- Esta migración deja a la vista un hueco que ya existía y nadie veía:
-- 20260812000001 crea `create_taller_with_initial_state` con un cuerpo que
-- inserta en `talleres_crecimiento_metadata`, y ninguna migración posterior lo
-- reemplaza. Producción tiene esa función leyendo `taller_ediciones` —también
-- corregida a mano—. Con el rename capturado, un reset produce la función con
-- el cuerpo viejo apuntando a una tabla que ya no se llama así. Es un segundo
-- rename sin registrar y necesita su propia migración forward-only; no se
-- arregla aquí porque arreglarlo es reescribir el cuerpo de una RPC de
-- inscripción, y eso es una decisión aparte.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   alter table public.taller_ediciones rename to talleres_crecimiento_metadata;
--   alter function public.set_taller_ediciones_updated_at() rename to set_talleres_crecimiento_metadata_updated_at;
--   y devolver los índices, constraints, disparador y políticas a su prefijo
--   anterior. Contra producción o staging el rollback no aplica: ahí esta
--   migración no hizo nada.

-- 1) La tabla.
do $$
begin
  if to_regclass('public.talleres_crecimiento_metadata') is not null
     and to_regclass('public.taller_ediciones') is null then
    alter table public.talleres_crecimiento_metadata rename to taller_ediciones;
    raise notice 'talleres_crecimiento_metadata renombrada a taller_ediciones';
  else
    raise notice 'rename omitido: ya se aplicó (es el caso de producción y staging)';
  end if;
end
$$;

-- 2) Lo que colgaba de ella. Cada recorrido es vacío cuando ya se renombró.
--    Los constraints van primero porque renombrar un constraint renombra
--    también el índice que lo respalda; los índices sueltos van después.
do $$
declare
  v_obj record;
begin
  if to_regclass('public.taller_ediciones') is null then
    raise notice 'taller_ediciones no existe; nada que renombrar';
    return;
  end if;

  for v_obj in
    select conname as vieja,
           replace(
             replace(conname, 'talleres_crecimiento_metadata', 'taller_ediciones'),
             'talleres_crecimiento_metadat', 'taller_ediciones'
           ) as nueva
      from pg_constraint
     where conrelid = to_regclass('public.taller_ediciones')
       and conname like 'talleres_crecimiento_metadat%'
  loop
    execute format(
      'alter table public.taller_ediciones rename constraint %I to %I',
      v_obj.vieja, v_obj.nueva
    );
    raise notice 'constraint % renombrado a %', v_obj.vieja, v_obj.nueva;
  end loop;

  for v_obj in
    select c.relname as vieja,
           replace(
             replace(c.relname, 'talleres_crecimiento_metadata', 'taller_ediciones'),
             'talleres_crecimiento_metadat', 'taller_ediciones'
           ) as nueva
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where i.indrelid = to_regclass('public.taller_ediciones')
       and c.relname like '%talleres_crecimiento_metadat%'
  loop
    execute format('alter index public.%I rename to %I', v_obj.vieja, v_obj.nueva);
    raise notice 'índice % renombrado a %', v_obj.vieja, v_obj.nueva;
  end loop;

  for v_obj in
    select tgname as vieja,
           replace(
             replace(tgname, 'talleres_crecimiento_metadata', 'taller_ediciones'),
             'talleres_crecimiento_metadat', 'taller_ediciones'
           ) as nueva
      from pg_trigger
     where tgrelid = to_regclass('public.taller_ediciones')
       and not tgisinternal
       and tgname like '%talleres_crecimiento_metadat%'
  loop
    execute format(
      'alter trigger %I on public.taller_ediciones rename to %I',
      v_obj.vieja, v_obj.nueva
    );
    raise notice 'disparador % renombrado a %', v_obj.vieja, v_obj.nueva;
  end loop;

  for v_obj in
    select policyname as vieja,
           replace(
             replace(policyname, 'talleres_crecimiento_metadata', 'taller_ediciones'),
             'talleres_crecimiento_metadat', 'taller_ediciones'
           ) as nueva
      from pg_policies
     where schemaname = 'public'
       and tablename = 'taller_ediciones'
       and policyname like 'talleres_crecimiento_metadat%'
  loop
    execute format(
      'alter policy %I on public.taller_ediciones rename to %I',
      v_obj.vieja, v_obj.nueva
    );
    raise notice 'política % renombrada a %', v_obj.vieja, v_obj.nueva;
  end loop;
end
$$;

-- 3) La función de updated_at. No es sólo de esta tabla: seis disparadores del
--    dominio la comparten, y producción los tiene todos apuntando al nombre
--    nuevo. Renombrarla no los toca —un disparador guarda el OID, no el
--    nombre—, así que esto no cambia comportamiento en ninguna de las seis.
do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'set_talleres_crecimiento_metadata_updated_at'
  ) and not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'set_taller_ediciones_updated_at'
  ) then
    alter function public.set_talleres_crecimiento_metadata_updated_at()
      rename to set_taller_ediciones_updated_at;
    raise notice 'set_talleres_crecimiento_metadata_updated_at renombrada a set_taller_ediciones_updated_at';
  else
    raise notice 'rename de la función omitido: ya se aplicó';
  end if;
end
$$;
