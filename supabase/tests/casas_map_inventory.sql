-- Read-only Casas map rollout inventory. Run before enabling UI adoption.
--
-- PR1 deploy verification checklist:
-- 1. Run this inventory after applying the migration and before enabling UI/actions.
-- 2. Confirm the migration created only additive tables/functions/indexes and no data backfill.
-- 3. Run `supabase/tests/casas_map_rpc_contracts.sql` in a non-production/staging database.
--
-- Expected pass criteria:
-- - All metrics return successfully without mutation.
-- - `new_host_home_map_eligible_count` may be lower than `current_legacy_map_count` because manual group addresses are intentionally ignored.
-- - `pending_location_reviews` is observable for rollout planning but pending rows must not make groups map-visible.
--
-- Fix-forward / rollback actions:
-- - If inventory values are unexpected, leave PR1 RPCs unused and pause PR2+ UI adoption.
-- - Fix forward with a new additive migration that replaces affected RPCs or tightens grants.
-- - Avoid destructive rollback on production data; additive objects can remain unused until corrected.

SELECT 'casas_total' AS metric, COUNT(*)::bigint AS value FROM public.casas_anfitrionas
UNION ALL SELECT 'casas_approved_with_coordinates', COUNT(*)::bigint FROM public.casas_anfitrionas ca JOIN public.direcciones d ON d.id = ca.direccion_id WHERE ca.aprobada = true AND ca.activa = true AND d.latitud IS NOT NULL AND d.longitud IS NOT NULL
UNION ALL SELECT 'groups_active_total', COUNT(*)::bigint FROM public.grupos g WHERE g.activo = true AND g.eliminado = false AND g.estado_ciclo = 'activo'
UNION ALL SELECT 'groups_with_host_home', COUNT(*)::bigint FROM public.grupos g WHERE g.activo = true AND g.eliminado = false AND g.estado_ciclo = 'activo' AND g.casa_anfitriona_id IS NOT NULL
UNION ALL SELECT 'groups_with_manual_address', COUNT(*)::bigint FROM public.grupos g WHERE g.activo = true AND g.eliminado = false AND g.estado_ciclo = 'activo' AND g.direccion_anfitrion_id IS NOT NULL
UNION ALL SELECT 'pending_location_reviews', COUNT(*)::bigint FROM public.casa_anfitriona_location_reviews r WHERE r.status = 'pending'
UNION ALL SELECT 'current_legacy_map_count', COUNT(*)::bigint FROM public.v_mapa_grupos_vida v WHERE v.latitud IS NOT NULL AND v.longitud IS NOT NULL
UNION ALL SELECT 'new_host_home_map_eligible_count', COUNT(*)::bigint FROM public.grupos g JOIN public.casas_anfitrionas ca ON ca.id = g.casa_anfitriona_id JOIN public.direcciones d ON d.id = ca.direccion_id WHERE g.activo = true AND g.eliminado = false AND g.estado_ciclo = 'activo' AND ca.aprobada = true AND ca.activa = true AND d.latitud IS NOT NULL AND d.longitud IS NOT NULL;
