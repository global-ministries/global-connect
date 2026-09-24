-- T1 (odd/tasks/talleres-lider-identidad.md) — the líder gets identity.
--
-- WHY
--   The 5 SELECT policies below (taller_grupos, taller_sesiones,
--   taller_reportes, taller_inscripciones, taller_asistencias) only have
--   capability branches (director/coordinator/lead/volunteer/metrics/
--   admin). `lead.read`/`lead.write` exist as capabilities but nobody
--   grants them — the only mechanism that ever tried was
--   trg_sync_talleres_grants_on_grupo_asignacion_change, which is broken
--   two ways: it writes a uuid into a text column (42883 `text = uuid`,
--   crashing every insert on staging where it is attached) and, even
--   fixed, it would scope the grant to the grupo's own id, which is
--   never a dream_team_equipos node the capability-scope walk can find.
--   Verified in production 2026-09-24 (T5 of the paso-4 task): a real
--   líder with an active taller_grupo_asignaciones row and zero
--   capabilities sees that one row and nothing else — the group screen
--   degrades for the exact person it exists for.
--
--   The fix is relational, not another capability: being actively
--   assigned to a grupo (líder or voluntario) is itself the authorization
--   to read that grupo, its sesiones, its inscripciones, its asistencias
--   and its reporte. The auto-grant trigger is abandoned as an approach
--   (the relation already lives in taller_grupo_asignaciones — granting
--   capabilities from it would just duplicate that fact in a second,
--   ancestor-walked table) and is dropped, in both environments, along
--   with its function; it is attached and crashing on staging today and
--   unattached (dead) on production.
--
-- WHAT
--   `talleres_es_miembro_del_grupo(p_grupo_id) → boolean`, STABLE
--   SECURITY DEFINER: true when the caller has an ACTIVE
--   taller_grupo_asignaciones row for that grupo, any rol. Added as an
--   OR branch — the existing capability branches are reproduced verbatim
--   from production `pg_policies`, nothing is rewritten or reordered —
--   to the 5 SELECT policies named above; taller_asistencias resolves the
--   grupo through its sesión. Write policies are untouched (paso 7 owns
--   what a líder can write).
--
--   `talleres_coord_inscripciones_personas` (the name-resolution mirror
--   for taller_inscripciones_select) gets the same OR branch in the same
--   migration — the paso-4 lesson: the mirror changes exactly when the
--   policy it mirrors changes, in one migration, so they can never drift.
--
--   New `talleres_grupo_equipo_personas(p_grupo_id)`: names for a grupo's
--   TEAM (líder/voluntarios), mirroring taller_grupo_asignaciones_select
--   plus the same membership branch, so a líder can resolve names for
--   their own equipo the same way `talleres_coord_inscripciones_personas`
--   already does for inscritos.
--
-- SAFETY
--   Purely additive on the policies and the inscripciones mirror (OR
--   branches only broaden read access for the actively-assigned case;
--   every existing capability branch keeps deciding exactly what it
--   decided before). The new functions default-deny like every other
--   talleres SECURITY DEFINER helper here: REVOKE ALL FROM PUBLIC, anon,
--   GRANT EXECUTE TO authenticated/postgres/service_role only. The
--   trigger + function DROP only removes dead-on-production, broken-on-
--   staging code; no capability grant it ever wrote is touched (staging
--   never got past the 42883 crash to write one).
--
-- ROLLBACK
--   The DROPped trigger/function cannot be un-dropped from this file
--   alone (see 20260810120000_talleres_role_auto_grant.sql for the
--   original source if it is ever needed again). For the rest:
--     ALTER POLICY taller_grupos_select ON public.taller_grupos
--       USING (<original expression, see this migration's own text>);
--     -- …repeat per table, and:
--     CREATE OR REPLACE FUNCTION public.talleres_coord_inscripciones_personas(uuid[]) -- (previous body, see 20260920120000_talleres_coord_personas_scoped.sql)
--     DROP FUNCTION public.talleres_grupo_equipo_personas(uuid);
--     DROP FUNCTION public.talleres_es_miembro_del_grupo(uuid);

-- ── the relation helper ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_es_miembro_del_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM taller_grupo_asignaciones a
    JOIN usuarios u ON u.id = a.persona_id
    WHERE a.grupo_id = p_grupo_id
      AND a.activo = true
      AND u.auth_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.talleres_es_miembro_del_grupo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_es_miembro_del_grupo(uuid) TO authenticated, postgres, service_role;

-- ── the 5 SELECT policies: existing expression, verbatim, plus OR ───

ALTER POLICY taller_grupos_select ON public.taller_grupos
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR public.talleres_es_miembro_del_grupo(id)
  );

ALTER POLICY taller_sesiones_select ON public.taller_sesiones
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(grupo_id))
    OR public.talleres_es_miembro_del_grupo(grupo_id)
  );

ALTER POLICY taller_reportes_select ON public.taller_reportes
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_grupo(grupo_id))
    OR public.talleres_es_miembro_del_grupo(grupo_id)
  );

ALTER POLICY taller_inscripciones_select ON public.taller_inscripciones
  USING (
    (persona_principal_id IN (SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid()))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR public.talleres_es_miembro_del_grupo(grupo_id)
  );

ALTER POLICY taller_asistencias_select ON public.taller_asistencias
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_inscripcion(inscripcion_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_inscripcion(inscripcion_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.talleres_es_miembro_del_grupo((SELECT s.grupo_id FROM taller_sesiones s WHERE s.id = sesion_id))
  );

-- ── the mirror for taller_inscripciones_select ───────────────────────

CREATE OR REPLACE FUNCTION public.talleres_coord_inscripciones_personas(p_inscripcion_ids uuid[])
RETURNS TABLE(inscripcion_id uuid, persona_principal_id uuid, pp_nombre text, pp_apellido text, pp_email text, companero_id uuid, comp_nombre text, comp_apellido text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      OR public.talleres_es_miembro_del_grupo(i.grupo_id)
    );
$function$;

-- ── new: names for the grupo's own equipo (líder/voluntarios) ───────

CREATE OR REPLACE FUNCTION public.talleres_grupo_equipo_personas(p_grupo_id uuid)
RETURNS TABLE(asignacion_id uuid, persona_id uuid, rol text, activo boolean, nombre text, apellido text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    a.id AS asignacion_id,
    a.persona_id,
    a.rol,
    a.activo,
    u.nombre,
    u.apellido
  FROM taller_grupo_asignaciones a
  LEFT JOIN usuarios u ON u.id = a.persona_id
  WHERE a.grupo_id = p_grupo_id
    AND (
      a.persona_id IN (
        SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid()
      )
      OR auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_grupo(a.grupo_id))
      OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(a.grupo_id))
      OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_grupo(a.grupo_id))
      OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_grupo(a.grupo_id))
      OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, talleres_equipo_de_grupo(a.grupo_id))
      OR public.talleres_es_miembro_del_grupo(a.grupo_id)
    );
$function$;

REVOKE ALL ON FUNCTION public.talleres_grupo_equipo_personas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_grupo_equipo_personas(uuid) TO authenticated, postgres, service_role;

-- ── the broken auto-grant trigger and its function are abandoned ────

DROP TRIGGER IF EXISTS trg_sync_talleres_grants_on_grupo_asignacion_change ON public.taller_grupo_asignaciones;
DROP FUNCTION IF EXISTS public.sync_talleres_grants_on_grupo_asignacion_change();
