-- Talleres — `talleres_coord_inscripciones_personas` must mirror the CURRENT
-- `taller_inscripciones_select`, not the pre-paso-3 one.
--
-- Why: `20260823000001_talleres_coord_inscripciones_personas_rpc.sql` was
-- written before paso 3 (`20260919143727_talleres_scoped_policies_core` and
-- siblings) rewrote that policy to walk the org chart. Its inlined mirror
-- still used the UNSCOPED `auth_has_talleres_capability` for director.read,
-- admin.manage, lead.read and volunteer.read, and still carried a
-- `participation.read` term that paso 3 removed outright.
--
-- Left as-is, this SECURITY DEFINER function would be WIDER than the RLS it
-- claims to mirror: a director scoped to one branch of the organigrama could
-- read the participant names of another branch's inscripciones — the exact
-- cross-branch leak paso 3 closed, reopened through a side door. Verified
-- against production on 2026-09-20 by reading `pg_policies` for
-- `taller_inscripciones_select`.
--
-- This redefinition keeps the function's signature, volatility, grants and
-- purpose identical and only replaces the WHERE predicate with a verbatim
-- copy of the live policy: SELF, plus the five capabilities each resolved
-- through `talleres_equipo_de_cohorte(cohorte_id)`.
--
-- Safety: additive / forward-only / idempotent (CREATE OR REPLACE). No data
-- mutation, no RLS change, no policy change, no grant change. STABLE.
-- It only ever NARROWS what the function returns.
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
    -- Mirror of the CURRENT taller_inscripciones_select (paso 3), verbatim.
    AND (
      i.persona_principal_id IN (
        SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid()
      )
      OR auth_has_talleres_capability_scoped(
           'talleres_crecimiento.director.read',
           talleres_equipo_de_cohorte(i.cohorte_id)
         )
      OR auth_has_talleres_capability_scoped(
           'talleres_crecimiento.admin.manage',
           talleres_equipo_de_cohorte(i.cohorte_id)
         )
      OR auth_has_talleres_capability_scoped(
           'talleres_crecimiento.coordinator.read',
           talleres_equipo_de_cohorte(i.cohorte_id)
         )
      OR auth_has_talleres_capability_scoped(
           'talleres_crecimiento.lead.read',
           talleres_equipo_de_cohorte(i.cohorte_id)
         )
      OR auth_has_talleres_capability_scoped(
           'talleres_crecimiento.volunteer.read',
           talleres_equipo_de_cohorte(i.cohorte_id)
         )
    );
$$;

GRANT EXECUTE ON FUNCTION public.talleres_coord_inscripciones_personas(uuid[])
  TO authenticated;
