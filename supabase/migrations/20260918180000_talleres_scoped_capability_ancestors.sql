-- T1 (odd/tasks/talleres-autoridad-arbol.md) — foundations for
-- "la autoridad sigue al árbol".
--
-- WHY
--   Every talleres permission is meant to be granted at one org-chart
--   node and hold for that node and everything under it. Two gaps stood
--   in the way:
--   1. auth_has_talleres_capability_scoped compared the grant's scope_id
--      to the target equipo EXACTLY (no ancestors), so a grant placed on
--      a parent node (e.g. "Dirección de Conexión") never reached the
--      talleres that live on its children. auth_has_dream_team_capability
--      _in_tree already solves this for Dream Team with a recursive
--      ancestor walk; this brings talleres_crecimiento's scoped helper to
--      the same shape.
--   2. Production's 8 real talleres_crecimiento grants store
--      scope_type='taller', scope_id='global' (the literal string) instead
--      of scope_id IS NULL. Every helper (this one included) already
--      treats NULL as "global"; the literal string 'global' matches
--      nothing. Normalizing the data is what actually restores those
--      grants' global reach — no code change can substitute for it,
--      because the fix has to touch the existing rows.
--   There is also no resolver from an edición to its equipo yet, which
--   T2 needs for taller_ediciones' own RLS policies (an edición doesn't
--   carry its equipo directly; it hangs off talleres.dream_team_equipo_id
--   through taller_ediciones.taller_id).
--
-- WHAT
--   1. UPDATE dream_team_capability_grants: scope_id 'global' -> NULL and
--      scope_type -> 'experience', for live talleres_crecimiento.* grants
--      only. Read-only production preview (never applied to production
--      by this migration): 8 rows would match.
--   2. Redefine auth_has_talleres_capability_scoped with a recursive
--      ancestors CTE (mirrors auth_has_dream_team_capability_in_tree,
--      depth < 16). Same signature, STABLE SECURITY DEFINER, same
--      search_path. A NULL p_equipo_id argument now (as before) only
--      matches a NULL-scope (global) grant.
--   3. Add talleres_equipo_de_edicion(edicion_id): edición -> taller ->
--      talleres.dream_team_equipo_id. SECURITY DEFINER, STABLE, same
--      shape as the other talleres_equipo_de_* resolvers.
--
-- NOT DONE (investigated, reported instead of guessed)
--   The task also asked to revoke anon/PUBLIC EXECUTE on these helpers
--   and resolvers. Checking first (as instructed) found two DIFFERENT
--   environments with two different reasons not to, verified via
--   has_table_privilege('anon', <table>, 'SELECT') on taller_ediciones,
--   talleres_crecimiento_cohortes, taller_grupos and taller_inscripciones
--   in both:
--     - PRODUCTION: anon holds NO table-level grant on any of them
--       (has_table_privilege = false on all four checked). An anon query
--       is rejected with "permission denied for relation" before
--       Postgres ever reaches RLS, let alone these functions — anon can
--       never call them today regardless of their EXECUTE grant, so
--       revoking would be a pure no-op there.
--     - STAGING: anon DOES hold ordinary table-level grants on the same
--       four tables (has_table_privilege = true on all four) — this is
--       environment drift from production, not intended design, and
--       out of this migration's scope to fix. Several roles={public} RLS
--       policies that exist only on this branch's staging schema so far
--       (e.g. taller_ediciones_select, talleres_crecimiento_cohortes_
--       select) call auth_has_talleres_capability /
--       auth_has_talleres_capability_scoped as NON-LAST branches of
--       their OR expression. Today an anon query there evaluates every
--       branch to false (auth.uid() is null) and silently returns zero
--       rows. Revoking anon's EXECUTE would turn that into a hard
--       "permission denied for function" error on any anon attempt to
--       query those tables on staging specifically — a behavior change
--       none of the six acceptance criteria call for, and one T4
--       ("nothing that worked keeps working") forbids introducing.
--   Net effect either way: anon already has zero usable access to
--   talleres data in BOTH environments (blocked at the table grant on
--   production, blocked by RLS always evaluating false on staging) —
--   revoking EXECUTE would tighten nothing real anywhere, and on
--   staging would only change a no-access caller's error shape from
--   empty to a hard failure. Left the grants exactly as they are;
--   flagged for a product decision (align staging's table grants with
--   production's, and/or narrow the affected policies to `TO
--   authenticated`, before revoking) rather than guessed.
--
-- SAFETY
--   Additive/redefinition only: no table is dropped, no column is
--   dropped, no other function's behavior changes. The scope_id
--   normalization UPDATE only touches rows already stored as the exact
--   string 'global' for a talleres_crecimiento.* capability_key that is
--   not revoked — on staging that currently matches zero rows (verified
--   read-only before writing this migration). auth_has_talleres_
--   capability_scoped keeps accepting a NULL p_equipo_id exactly as
--   before (matches only global grants).
--
-- ROLLBACK
--   Re-apply the previous auth_has_talleres_capability_scoped body
--   (exact-match, no ancestors) via CREATE OR REPLACE FUNCTION; DROP
--   FUNCTION talleres_equipo_de_edicion(uuid). The scope_id
--   normalization is intentionally not reversible by design (it only
--   turns a lossy sentinel into the canonical NULL); no code depends on
--   the literal string 'global' anywhere in this codebase.

-- (1) Normalize the 'global' string sentinel to the canonical NULL.
UPDATE public.dream_team_capability_grants
SET scope_id = NULL, scope_type = 'experience'
WHERE capability_key LIKE 'talleres_crecimiento.%'
  AND scope_id = 'global'
  AND revoked_at IS NULL;

-- (2) auth_has_talleres_capability_scoped walks ancestors, exactly like
-- auth_has_dream_team_capability_in_tree.
CREATE OR REPLACE FUNCTION public.auth_has_talleres_capability_scoped(p_capability_key text, p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE ancestros AS (
    SELECT e.id, e.parent_equipo_id, 1 AS profundidad
    FROM public.dream_team_equipos e
    WHERE e.id = p_equipo_id
    UNION ALL
    SELECT p.id, p.parent_equipo_id, a.profundidad + 1
    FROM public.dream_team_equipos p
    JOIN ancestros a ON p.id = a.parent_equipo_id
    WHERE a.profundidad < 16
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    INNER JOIN public.usuarios u ON u.id = g.persona_id
    WHERE u.auth_id = auth.uid()
      AND g.capability_key = p_capability_key
      AND g.revoked_at IS NULL
      AND (
        g.scope_id IS NULL
        OR g.scope_id IN (SELECT id::text FROM ancestros)
      )
  )
$function$;

-- (3) Edición -> taller -> equipo resolver, needed by T2's
-- taller_ediciones policies.
CREATE OR REPLACE FUNCTION public.talleres_equipo_de_edicion(p_edicion_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.dream_team_equipo_id
  FROM public.taller_ediciones e
  JOIN public.talleres t ON t.id = e.taller_id
  WHERE e.id = p_edicion_id;
$function$;

GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_edicion(uuid) TO anon, authenticated, postgres, service_role;
