-- T2 (odd/tasks/talleres-consolidar-pantallas.md) — talleres_mis_permisos'
-- editar_taller must also accept admin.manage, tree-scoped.
--
-- WHY
--   20260919130000_talleres_catalogo_admin_manage.sql added the
--   tree-scoped admin.manage branch to talleres_insert_director,
--   talleres_update_director and talleres_delete_director — the DB now
--   lets an admin.manage holder rename/delete a taller in their scope.
--   But talleres_mis_permisos (20260919120000) was never updated to
--   match: its editar_taller boolean still resolved director.write
--   only. That migration's own header even documented the OLD
--   asymmetry as a deliberate, in-scope-at-the-time decision ("NOTE:
--   unlike create_taller_abstract ... the direct UPDATE policy on the
--   existing talleres row grants no admin.manage today — mirrored
--   exactly as the live policy stands, not corrected, per this task's
--   scope"). That note is now STALE: the live policy changed underneath
--   it. Net effect before this fix: the UI would HIDE "editar taller"
--   from an admin.manage holder the database now allows — the exact
--   inverse of the bug talleres-consolidar-pantallas set out to remove,
--   and a violation of "the screen and the database read from the same
--   source" (docs/talleres-de-punta-a-punta.md §9, "Permisos en la
--   interfaz").
--
-- WHAT
--   CREATE OR REPLACE the function, changing ONLY the editar_taller
--   clause to OR in
--   auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage',
--   p_equipo_id) — the same tree-scoped shape every other admin.manage-
--   eligible boolean in this function already uses (abrir_edicion,
--   editar_edicion, gestionar_grupos, etc.). Every other boolean's body
--   is byte-identical to 20260919120000's — see the commit's own diff
--   for proof.
--
-- SAFETY
--   Purely additive to one boolean's OR-list: no table touched, no
--   other function redefined, no signature change. STABLE SECURITY
--   DEFINER, REVOKE/GRANT unchanged (re-applied identically, since
--   CREATE OR REPLACE preserves existing grants — restated here anyway
--   for auditability).
--
-- ROLLBACK
--   Re-run 20260919120000_talleres_mis_permisos.sql's CREATE OR REPLACE
--   FUNCTION body (editar_taller back to director.write only).

CREATE OR REPLACE FUNCTION public.talleres_mis_permisos(p_equipo_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ver', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'editar_taller', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'abrir_edicion', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'editar_edicion', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'gestionar_grupos', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'aprobar_inscripciones', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'resolver_retiros', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'asignar_equipo', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'ver_reportes', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', p_equipo_id)
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
    ),
    'ver_metricas', (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', p_equipo_id)
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.talleres_mis_permisos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_mis_permisos(uuid) TO authenticated, postgres, service_role;
