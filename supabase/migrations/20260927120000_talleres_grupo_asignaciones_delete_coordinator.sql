-- T5 (odd/tasks/talleres-configuracion-del-taller.md) — let a coordinator
-- remove a facilitador the same way they can add or edit one.
--
-- WHY
--   taller_grupo_asignaciones_insert and taller_grupo_asignaciones_update
--   (20260918200000_talleres_scoped_policies_grupos.sql) both authorize
--   director.write OR admin.manage OR coordinator.write, tree-scoped via
--   auth_has_talleres_capability_scoped(key, talleres_equipo_de_grupo(
--   grupo_id)). taller_grupo_asignaciones_delete was left with only
--   director.write OR admin.manage — verified live against staging
--   pg_policies before this migration — so a coordinator who can add or
--   edit a facilitador could not remove one, an inconsistent capability
--   surface. quitarFacilitadorGrupo (app/(auth)/talleres/[taller]/
--   [edicion]/actions.ts, T4) relies entirely on this policy; there is no
--   RPC in front of the delete.
--
-- WHAT
--   Recreate taller_grupo_asignaciones_delete with the EXACT predicate
--   taller_grupo_asignaciones_update already uses. DROP + CREATE (not
--   ALTER POLICY) since only the USING clause changes and this is the
--   plain, readable way to state the new predicate in full.
--
-- Espejos check (Decisiones: "si cambia una política, cambia su función
-- espejo en la misma migración") — rg -n 'taller_grupo_asignaciones'
-- supabase/migrations | rg -i delete found no SECURITY DEFINER function
-- that inlines this DELETE predicate: quitarFacilitadorGrupo deletes
-- straight through the client against this table, RLS is the only wall.
-- No mirror to update.
--
-- Verified live (supabase/tests/talleres-grupo-asignaciones-delete-
-- coordinator.test.sql): PostgreSQL RLS requires a row to pass an
-- applicable SELECT policy IN ADDITION to the DELETE policy for a DELETE
-- to affect it, so coordinator.write alone (no coordinator.read) still
-- deletes 0 rows even with this migration applied. Not a gap to close
-- here — talleres_role_capability_map always grants coordinador BOTH
-- coordinator.write and coordinator.read together via the servicio role
-- auto-grant, so every real coordinator already clears
-- taller_grupo_asignaciones_select too.

DROP POLICY IF EXISTS taller_grupo_asignaciones_delete ON public.taller_grupo_asignaciones;

CREATE POLICY taller_grupo_asignaciones_delete
  ON public.taller_grupo_asignaciones FOR DELETE
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
  );
