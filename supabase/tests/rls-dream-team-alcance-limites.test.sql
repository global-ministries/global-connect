-- odd/tasks/rendimiento-sistema.md, T1 (S2) — edge cases of the scope helpers
-- of migration 20261113120000_rls_dream_team_alcance_una_vez.sql that real
-- data may not exercise: the deepest chain the tree allows, a revoked grant, a scope_id
-- that is not an equipo, a NULL equipo and auth.uid() NULL. Uses a synthetic
-- capability key so real grants never interfere.
--
-- Run against STAGING: one transaction ending in RAISE EXCEPTION with the
-- summary (expected: diferencias=0), so nothing is kept.

BEGIN;

DO $$
DECLARE
  v_persona uuid;
  v_auth uuid;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_parent uuid;
  i int;
  v_diff int := 0;
  k text := 'dream_team.__probe_alcance';
BEGIN
  SELECT id, auth_id INTO v_persona, v_auth FROM public.usuarios WHERE auth_id IS NOT NULL LIMIT 1;

  -- A chain of 15 levels, the deepest the tree allows
  -- (dream_team_equipos_prevent_cycle rejects deeper chains): the grant on level 1
  -- reaches all of them.
  FOR i IN 1..15 LOOP
    INSERT INTO public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
    VALUES ('dps', v_parent, 'probe alcance ' || i, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
    v_parent := v_id;
  END LOOP;

  INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
  VALUES (v_persona, k, 'dream_team', 'equipo', v_ids[1]::text),
         (v_persona, k, 'dream_team', 'equipo', 'global'),
         (v_persona, k, 'dream_team', 'equipo', gen_random_uuid()::text);
  INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, revoked_at)
  VALUES (v_persona, k, 'dream_team', 'equipo', v_ids[15]::text, now());

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);

  FOR i IN 1..15 LOOP
    IF public.auth_has_dream_team_capability_in_tree(k, v_ids[i])
       IS DISTINCT FROM (public.auth_dream_team_alcance_global(ARRAY[k])
                         OR v_ids[i] = ANY (public.auth_dream_team_alcance_equipos(ARRAY[k]))) THEN
      v_diff := v_diff + 1;
    END IF;
  END LOOP;

  IF NOT (v_ids[15] = ANY (public.auth_dream_team_alcance_equipos(ARRAY[k]))) THEN
    RAISE EXCEPTION 'RESULTADO tope de profundidad distinto';
  END IF;

  -- NULL equipo: neither grants it without a global grant.
  IF coalesce(public.auth_dream_team_alcance_global(ARRAY[k])
              OR NULL::uuid = ANY (public.auth_dream_team_alcance_equipos(ARRAY[k])), false)
     IS DISTINCT FROM public.auth_has_dream_team_capability_in_tree(k, NULL) THEN
    v_diff := v_diff + 1;
  END IF;

  -- auth.uid() NULL: nothing.
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF public.auth_dream_team_alcance_global(ARRAY[k])
     OR cardinality(public.auth_dream_team_alcance_equipos(ARRAY[k])) > 0 THEN
    v_diff := v_diff + 1;
  END IF;

  RAISE EXCEPTION 'RESULTADO diferencias=%', v_diff;
END $$;

ROLLBACK;
