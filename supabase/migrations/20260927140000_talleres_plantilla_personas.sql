-- (odd/tasks/talleres-configuracion-del-taller.md, post-T7 fix) — the
-- taller screen's plantilla grupos showed "Persona sin nombre" for every
-- facilitador in the real preview (product owner report, 2026-09-27).
--
-- WHY
--   lib/platform/talleres/plantilla.ts embeds
--   `usuarios ( nombre, apellido )` on top of
--   `taller_plantilla_facilitadores` through PostgREST, and
--   lib/platform/talleres/grupo-detalle.ts's loadGruposInstanciados does
--   the same on top of `taller_grupo_asignaciones`. `usuarios` carries its
--   OWN RLS (a Grupos de Vida concept: puede_ver_usuario / es_lider_de_
--   grupo / es_director_de_grupo — entirely unrelated to talleres), which
--   hides another person's name from a talleres director who has every
--   talleres capability but no Grupos de Vida relation to that person —
--   the embed silently degrades to NULL and the UI prints its placeholder
--   for every row.
--
--   This project has hit this exact trap twice before and solved it the
--   same way both times: resolve names through a small SECURITY DEFINER
--   RPC scoped to the caller's actual talleres authority, never through
--   `usuarios`'s own RLS. See talleres_grupo_equipo_personas (T1,
--   20260924150000_talleres_lider_identidad.sql) for
--   loadGrupoAsignaciones, and dream_team_resolver_nombres
--   (20260910180000_dream_team_resolver_nombres.sql) for the analogous
--   Dream Team case. This migration is the third instance, for the
--   plantilla (taller-level) and the instanciado (cohorte-level) shapes.
--
-- WHAT
--   talleres_plantilla_facilitadores_personas(p_taller_id) → TABLE
--   (plantilla_grupo_id, persona_id, rol, nombre, apellido): every
--   taller_plantilla_facilitadores row of that taller's own plantilla
--   grupos, LEFT JOIN usuarios for names. Gate: the EXACT caller-authority
--   predicate of talleres_servidores_del_taller (read back with
--   pg_get_functiondef against staging before writing this file, byte for
--   byte — director/coordinator read-or-write, admin.manage, or being an
--   active servidor of the taller's own tree), raising the same 42501
--   sin_permisos_para_este_taller on failure. Once authorized, the caller
--   sees every facilitador row of the taller — never opens `usuarios`
--   beyond the ids already scoped to this taller's own plantilla.
--
--   talleres_cohorte_equipo_personas(p_cohorte_id) → TABLE (grupo_id,
--   persona_id, rol, activo, nombre, apellido): every
--   taller_grupo_asignaciones row of every taller_grupos row in that
--   cohorte, LEFT JOIN usuarios for names. Gate: the EXACT predicate of
--   talleres_grupo_equipo_personas (own row, active membership in ANY
--   grupo of the cohorte via talleres_es_miembro_del_grupo, or director/
--   coordinator/lead/volunteer read or admin.manage) evaluated ONCE at
--   the cohorte's own node — talleres_equipo_de_cohorte(p_cohorte_id) —
--   instead of once per grupo, because this RPC gates the whole cohorte's
--   team at once rather than filtering row by row. Same 42501
--   sin_permisos_para_este_taller on failure.
--
--   lib/platform/talleres/plantilla.ts's loadPlantillaGrupos and
--   lib/platform/talleres/grupo-detalle.ts's loadGruposInstanciados are
--   updated in the same change (app-side, no migration needed there) to
--   call these RPCs and merge by plantilla_grupo_id/grupo_id instead of
--   embedding usuarios — a persona missing from the RPC result keeps its
--   row with nombre/apellido NULL (the UI already renders a placeholder
--   for that), it is never dropped.
--
-- SAFETY
--   Two new SECURITY DEFINER functions, default-deny like every other
--   talleres RPC of this shape: REVOKE ALL FROM PUBLIC, anon; GRANT
--   EXECUTE TO authenticated, postgres, service_role only. No existing
--   table, column, policy, trigger, or function is touched. Grupos de
--   Vida (grupos, grupo_miembros, segmento_lideres, roles_sistema,
--   usuario_roles, temporadas) is not referenced anywhere in this file.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.talleres_cohorte_equipo_personas(uuid);
--   DROP FUNCTION IF EXISTS public.talleres_plantilla_facilitadores_personas(uuid);

-- ── (1) plantilla-level: mirrors talleres_servidores_del_taller's gate ──

CREATE OR REPLACE FUNCTION public.talleres_plantilla_facilitadores_personas(p_taller_id uuid)
RETURNS TABLE (
  plantilla_grupo_id uuid,
  persona_id          uuid,
  rol                 text,
  nombre              text,
  apellido            text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id   uuid;
  v_actor_id    uuid;
  v_autorizado  boolean;
BEGIN
  SELECT t.dream_team_equipo_id INTO v_equipo_id
  FROM public.talleres t
  WHERE t.id = p_taller_id;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = auth.uid();

  -- Verbatim copy of talleres_servidores_del_taller's v_autorizado
  -- predicate (20260926150000_talleres_plantillas_del_taller.sql),
  -- reconfirmed against staging's live pg_get_functiondef before writing
  -- this file. Keep the two in sync if either ever changes.
  v_autorizado := v_equipo_id IS NOT NULL AND (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
    OR (v_actor_id IS NOT NULL AND public.talleres_es_servidor_activo_del_taller(p_taller_id, v_actor_id))
  );

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    f.plantilla_grupo_id,
    f.persona_id,
    f.rol,
    u.nombre,
    u.apellido
  FROM public.taller_plantilla_facilitadores f
  JOIN public.taller_plantilla_grupos g ON g.id = f.plantilla_grupo_id
  LEFT JOIN public.usuarios u ON u.id = f.persona_id
  WHERE g.taller_id = p_taller_id;
END;
$function$;

COMMENT ON FUNCTION public.talleres_plantilla_facilitadores_personas(uuid) IS
  'Mirrors talleres_servidores_del_taller''s caller-authority predicate '
  '(director/coordinator read-or-write, admin.manage, or an active '
  'servidor of the taller''s own tree) as an RPC-level gate, not a row '
  'policy: resolves nombre/apellido for taller_plantilla_facilitadores '
  'without opening usuarios'' own RLS. Keep this predicate identical to '
  'talleres_servidores_del_taller''s if either changes.';

REVOKE ALL ON FUNCTION public.talleres_plantilla_facilitadores_personas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_plantilla_facilitadores_personas(uuid) TO authenticated, postgres, service_role;

-- ── (2) cohorte-level: mirrors talleres_grupo_equipo_personas' gate ──

CREATE OR REPLACE FUNCTION public.talleres_cohorte_equipo_personas(p_cohorte_id uuid)
RETURNS TABLE (
  grupo_id    uuid,
  persona_id  uuid,
  rol         text,
  activo      boolean,
  nombre      text,
  apellido    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id   uuid;
  v_actor_id    uuid;
  v_autorizado  boolean;
BEGIN
  v_equipo_id := public.talleres_equipo_de_cohorte(p_cohorte_id);

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = auth.uid();

  -- Same capability list as talleres_grupo_equipo_personas' WHERE clause
  -- (20260924150000_talleres_lider_identidad.sql), reconfirmed against
  -- staging's live pg_get_functiondef before writing this file, evaluated
  -- ONCE at the cohorte's own node instead of once per grupo row, plus
  -- the same own-row/active-membership escape hatch (checked across every
  -- grupo of this cohorte, since membership is per grupo, not per
  -- cohorte). Keep the capability list identical if either changes.
  v_autorizado := v_equipo_id IS NOT NULL AND (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', v_equipo_id)
    OR EXISTS (
         SELECT 1
         FROM public.taller_grupo_asignaciones a
         JOIN public.taller_grupos g ON g.id = a.grupo_id
         WHERE g.cohorte_id = p_cohorte_id
           AND (
             (v_actor_id IS NOT NULL AND a.persona_id = v_actor_id)
             OR public.talleres_es_miembro_del_grupo(a.grupo_id)
           )
       )
  );

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.grupo_id,
    a.persona_id,
    a.rol,
    a.activo,
    u.nombre,
    u.apellido
  FROM public.taller_grupo_asignaciones a
  JOIN public.taller_grupos g ON g.id = a.grupo_id
  LEFT JOIN public.usuarios u ON u.id = a.persona_id
  WHERE g.cohorte_id = p_cohorte_id;
END;
$function$;

COMMENT ON FUNCTION public.talleres_cohorte_equipo_personas(uuid) IS
  'Mirrors talleres_grupo_equipo_personas'' predicate (own row, active '
  'membership in any grupo of the cohorte, or director/coordinator/lead/'
  'volunteer read or admin.manage) evaluated once at the cohorte''s own '
  'node via talleres_equipo_de_cohorte, as an RPC-level gate for the '
  'whole cohorte instead of a per-grupo row filter. Keep this predicate '
  'identical to talleres_grupo_equipo_personas'' if either changes.';

REVOKE ALL ON FUNCTION public.talleres_cohorte_equipo_personas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_cohorte_equipo_personas(uuid) TO authenticated, postgres, service_role;
