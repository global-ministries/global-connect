-- T1 (odd/tasks/talleres-consolidar-pantallas.md) — permisos por nodo,
-- una llamada por pantalla.
--
-- WHY
--   The consolidated screens (T2+) serve every role from one page and
--   decide what to show with a booleano resuelto en el servidor, nunca
--   re-derivado en el cliente desde un array de roles (docs/talleres-de-
--   punta-a-punta.md §9, "Permisos en la interfaz"). Today the RLS
--   policies already walk the org-chart tree via
--   auth_has_talleres_capability_scoped(key, equipo_id) (T2 of talleres-
--   autoridad-arbol) — this function exposes that SAME decision to the
--   front-end as one JSON blob per node, so the UI can hide a control
--   instead of showing it and letting it 42501.
--
-- WHAT
--   talleres_mis_permisos(p_equipo_id uuid) RETURNS jsonb, STABLE
--   SECURITY DEFINER, SET search_path = 'public'. One boolean per action
--   the UI needs, each computed with
--   auth_has_talleres_capability_scoped(<key>, p_equipo_id) so it follows
--   the exact same tree walk the RLS policies use — no re-implementation,
--   no drift. EXECUTE revoked from PUBLIC/anon, granted to authenticated,
--   postgres, service_role.
--
--   Mapping derived 2026-09-19 by reading staging's live pg_policies and
--   pg_get_functiondef() for create_taller_abstract, open_edicion,
--   talleres_resolver_solicitud_retiro, generate_taller_sesiones and
--   emit_taller_certificado. One line per boolean:
--
--   ver                   — director.read | coordinator.read | lead.read |
--                           volunteer.read | metrics.read | admin.manage.
--                           Source: taller_ediciones_select RLS (the
--                           broadest "can see something at this node" set,
--                           minus its extra "anyone when abierto" branch,
--                           which is a public-inscription carve-out, not
--                           org-chart authority).
--   editar_taller         — director.write only. Source:
--                           talleres_update_director RLS (UPDATE on
--                           `talleres`). NOTE: unlike create_taller_abstract
--                           (which also accepts admin.manage for
--                           creating/linking a NEW taller), the direct
--                           UPDATE policy on the existing `talleres` row
--                           grants no admin.manage today — mirrored
--                           exactly as the live policy stands, not
--                           corrected, per this task's scope (base: sólo
--                           la función nueva).
--   abrir_edicion         — director.write | admin.manage. Source:
--                           open_edicion RPC's scoped check.
--   editar_edicion        — director.write | admin.manage. Source:
--                           taller_ediciones_update RLS. Same capability
--                           set as generate_taller_sesiones and
--                           emit_taller_certificado (both director.write |
--                           admin.manage, no coordinator.write) — later
--                           screens should gate "generar sesiones" /
--                           "emitir certificado" on editar_edicion, not on
--                           gestionar_grupos below (which does grant
--                           coordinator.write).
--   gestionar_grupos      — director.write | coordinator.write |
--                           admin.manage. Source: taller_grupos_insert /
--                           taller_grupos_update RLS (the grupo record
--                           itself — day/hour/leader/cupo).
--   aprobar_inscripciones — coordinator.write | director.write |
--                           admin.manage. Source: taller_inscripciones_
--                           update RLS (approve/reject a pending
--                           inscripción).
--   resolver_retiros      — coordinator.write | director.write |
--                           admin.manage. Source:
--                           talleres_resolver_solicitud_retiro RPC.
--   asignar_equipo        — director.write | coordinator.write |
--                           admin.manage. Source: taller_grupo_
--                           asignaciones_insert / _update RLS (staffing a
--                           grupo with líderes/voluntarios — distinct from
--                           gestionar_grupos, which is the grupo record
--                           itself; both happen to share this capability
--                           set today because both RLS policies grant the
--                           same three keys).
--   ver_reportes          — director.read | coordinator.read | lead.read |
--                           admin.manage. Source: taller_reportes_select
--                           RLS.
--   ver_metricas          — metrics.read only. Source: the metrics.read
--                           capability key, matching TALLERES_NAV_ITEMS'
--                           talleres_direccion_metricas nav item
--                           (lib/platform/talleres/route-access.ts).
--
--   p_equipo_id = NULL semantics — mirrors auth_has_talleres_capability_
--   scoped exactly, because this function calls that same helper with the
--   same argument and adds no special-casing: the helper's ancestros CTE
--   starts with `WHERE e.id = p_equipo_id`, which is never true when
--   p_equipo_id IS NULL (NULL = NULL is NULL, not true in a WHERE
--   clause), so the recursive ancestor set is empty and the only branch
--   that can still be true is `g.scope_id IS NULL` — a truly global
--   grant. Every boolean above is therefore all-false for a NULL node
--   except whatever a global grant for that boolean's capability set
--   already allows.
--
-- SAFETY
--   Purely additive: one new function, no table touched, no existing
--   function redefined. STABLE (no writes possible from this function's
--   body) and SECURITY DEFINER only to read dream_team_capability_grants
--   the same way auth_has_talleres_capability_scoped already does (that
--   helper is itself SECURITY DEFINER for the same reason).
--
-- ROLLBACK
--   DROP FUNCTION public.talleres_mis_permisos(uuid);

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
