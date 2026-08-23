-- Talleres — bug #3 fix: coordinador can't see pending inscripciones.
--
-- Root cause: the coordinador loader embedded
-- `persona_principal:usuarios(...)` on `taller_inscripciones`. That embed
-- runs under the CALLER's `usuarios` RLS. A coordinador is RLS-scoped to
-- SEE the inscripcion (via the scoped `coordinator.read` policy term) but
-- is NOT granted a broad read on the participant's `usuarios` row, so the
-- embed resolved to null and the loader dropped the RLS-visible row.
--
-- Fix (app + this RPC): the loader drops the `usuarios` embed and resolves
-- persona names through this SECURITY DEFINER function. The function
-- re-applies the EXACT `taller_inscripciones_select` policy predicate
-- internally (fail-closed) so authorization is identical to the RLS — the
-- SECURITY DEFINER context only lifts the `usuarios` RLS for the name join,
-- it does NOT widen who may see which inscripcion. `auth.uid()` reads the
-- request JWT `sub`, which is unaffected by SECURITY DEFINER (that changes
-- the execution role, not request-scoped settings), so every capability
-- check still evaluates against the real caller.
--
-- Safety: additive / forward-only / idempotent (CREATE OR REPLACE + GRANT).
-- No data mutation, no RLS change on `usuarios`, no policy change. STABLE.
-- Rollback: DROP FUNCTION public.talleres_coord_inscripciones_personas(uuid[]);

CREATE OR REPLACE FUNCTION public.talleres_coord_inscripciones_personas(
  p_inscripcion_ids uuid[]
)
RETURNS TABLE (
  inscripcion_id uuid,
  persona_principal_id uuid,
  pp_nombre text,
  pp_apellido text,
  pp_email text,
  companero_id uuid,
  comp_nombre text,
  comp_apellido text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id                    AS inscripcion_id,
    i.persona_principal_id,
    pp.nombre               AS pp_nombre,
    pp.apellido             AS pp_apellido,
    pp.email                AS pp_email,
    i.companero_id,
    comp.nombre             AS comp_nombre,
    comp.apellido           AS comp_apellido
  FROM taller_inscripciones i
  LEFT JOIN usuarios pp   ON pp.id   = i.persona_principal_id
  LEFT JOIN usuarios comp ON comp.id = i.companero_id
  WHERE i.id = ANY (p_inscripcion_ids)
    -- Mirror of taller_inscripciones_select (verbatim terms, fail-closed).
    AND (
      i.persona_principal_id IN (
        SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid()
      )
      OR auth_has_talleres_capability('talleres_crecimiento.director.read')
      OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
      OR auth_has_talleres_capability_scoped(
           'talleres_crecimiento.coordinator.read',
           talleres_equipo_de_cohorte(i.cohorte_id)
         )
      OR auth_has_talleres_capability('talleres_crecimiento.lead.read')
      OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
      OR auth_has_talleres_capability('talleres_crecimiento.participation.read')
    );
$$;

GRANT EXECUTE ON FUNCTION public.talleres_coord_inscripciones_personas(uuid[])
  TO authenticated;
