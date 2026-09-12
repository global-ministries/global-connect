-- El cron job que no cierra nada y falla todas las noches.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- Producción tiene un job de pg_cron vivo y activo:
--
--   jobname   talleres_period_closer
--   schedule  0 0 * * *
--   active    true
--   command   SELECT COUNT(*)
--               FROM public.talleres_crecimiento_metadata m
--              WHERE m.estado = 'en_curso'
--                AND EXISTS (
--                  SELECT 1 FROM public.taller_periodos_generales p
--                   WHERE p.taller_id = m.id
--                     AND p.fecha_cierre_real < CURRENT_DATE
--                );
--
-- Dos cosas están mal, y la segunda es la que importa.
--
-- La primera: lee `talleres_crecimiento_metadata`, que ya no se llama así
-- desde que se renombró a `taller_ediciones`. El job falla cada medianoche con
-- `relation "public.talleres_crecimiento_metadata" does not exist`.
--
-- La segunda: aun con el nombre corregido no cerraría nada. Es un `COUNT(*)`.
-- Cuenta las ediciones en curso cuyo periodo ya venció, tira el número y
-- termina. No hay `UPDATE`, no hay transición de estado, no hay evento. El
-- job se llama `period_closer` y nunca cerró un periodo: la lógica de cierre
-- no se escribió. Lo único que existe del lado del cierre es
-- `taller_emit_overdue_event`, que emite un evento de aviso y que 20260811140000
-- documenta explícitamente como "NEVER auto-closes — R5 closed decision"; el
-- job ni la llama.
--
-- Así que el job no es un cierre roto que haya que reparar. Es un `SELECT`
-- programado que produce un error nocturno y ninguna otra cosa. Lo que
-- correspondía —decidir cómo y cuándo se cierra un periodo— sigue sin
-- decidirse, y no se decide aquí.
--
-- Del lado del repositorio, el bloque que lo programaba en 20260811140000 no
-- podía ejecutarse: a su llamada a `schedule(...)` le faltaba el paréntesis de
-- cierre, y llamaba a `pg_cron.schedule` cuando pg_cron instala sus funciones
-- en el esquema `cron`. El job que hay en producción se programó a mano. En esa
-- migración el bloque se eliminó, así que un reset desde cero no vuelve a
-- programarlo.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Desprograma `talleres_period_closer` si está. Nada más. No inventa lógica de
-- cierre: no hay un `UPDATE` en este archivo y no debe haberlo, porque escribir
-- aquí lo que nunca se decidió sería peor que el job que se está quitando.
--
-- Doble guard, y los dos hacen falta. Si pg_cron no está instalado, el esquema
-- `cron` no existe y consultar `cron.job` sería un error de relación
-- inexistente: por eso el primer `return` sale antes de que plpgsql planifique
-- esa consulta. Si pg_cron está pero el job no, `cron.unschedule('nombre')`
-- levanta `could not find valid entry for job`. Staging es el primer caso
-- —pg_cron no está instalado— y entra por el primer NOTICE.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Producción deja de correr un `SELECT COUNT(*)` fallido a medianoche. Nada
-- más cambia: ninguna edición cambiaba de estado por ese job, así que quitarlo
-- no deja de cerrar nada que se estuviera cerrando. Staging y un reset desde
-- cero son no-op. `taller_emit_overdue_event` y su índice siguen donde están,
-- disponibles para una programación a nivel de aplicación.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   select cron.schedule('talleres_period_closer', '0 0 * * *', $$select 1$$);
-- Reponer el comando original no tiene sentido: apunta a una tabla que no
-- existe. El rollback honesto de esta migración es no tenerla.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron no está instalado; no hay job que desprogramar';
    return;
  end if;

  if not exists (select 1 from cron.job where jobname = 'talleres_period_closer') then
    raise notice 'el job talleres_period_closer no existe; nada que desprogramar';
    return;
  end if;

  perform cron.unschedule('talleres_period_closer');
  raise notice 'job talleres_period_closer desprogramado';
end
$$;
