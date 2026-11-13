-- odd/tasks/rendimiento-sistema.md, T1 (S2) — the once-per-statement scope
-- helpers of migration 20261113120000_rls_dream_team_alcance_una_vez.sql
-- answer exactly what the per-row checks answered, on the real data.
--
-- For every (person, capability) pair with an active grant, and every equipo:
--   auth_has_dream_team_capability_in_tree(K, X)
--     = auth_dream_team_alcance_global([K]) OR X = ANY(auth_dream_team_alcance_equipos([K]))
-- and the same for auth_has_talleres_capability_scoped. A person without a
-- grant of K gets false from both sides by construction (both start from the
-- caller's grants of K), and a key array is the union of its keys (= ANY).
-- For every person who directs or coordinates Atención al Voluntario, and
-- every equipo:
--   dream_team_puede_registrar_persona(X) = X = ANY(dream_team_equipos_registro())
--
-- Read-only: one transaction ending in RAISE EXCEPTION with the summary.
-- Run it after the migration (staging or production); nothing is kept.

BEGIN;

CREATE TEMP TABLE t_diff (caso text, persona uuid, clave text, equipo uuid, viejo boolean, nuevo boolean) ON COMMIT DROP;
CREATE TEMP TABLE t_n (caso text, n bigint) ON COMMIT DROP;

DO $$
DECLARE
  p record;
  v_global boolean;
  v_equipos uuid[];
  v_registro uuid[];
  n_pares bigint := 0;
  n_reg bigint := 0;
BEGIN
  FOR p IN
    SELECT DISTINCT u.id AS persona, u.auth_id, g.capability_key AS clave
      FROM public.dream_team_capability_grants g
      JOIN public.usuarios u ON u.id = g.persona_id
     WHERE g.revoked_at IS NULL
       AND u.auth_id IS NOT NULL
       AND (g.capability_key LIKE 'dream_team.%' OR g.capability_key LIKE 'talleres_crecimiento.%')
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p.auth_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p.auth_id::text, true);
    v_global := public.auth_dream_team_alcance_global(ARRAY[p.clave]);
    v_equipos := public.auth_dream_team_alcance_equipos(ARRAY[p.clave]);
    n_pares := n_pares + 1;

    INSERT INTO t_diff
    SELECT 'in_tree', p.persona, p.clave, e.id, x.viejo, x.nuevo
      FROM public.dream_team_equipos e
      CROSS JOIN LATERAL (SELECT public.auth_has_dream_team_capability_in_tree(p.clave, e.id) AS viejo,
                                 (v_global OR e.id = ANY (v_equipos)) AS nuevo) x
     WHERE x.viejo IS DISTINCT FROM x.nuevo;

    INSERT INTO t_diff
    SELECT 'talleres_scoped', p.persona, p.clave, e.id, x.viejo, x.nuevo
      FROM public.dream_team_equipos e
      CROSS JOIN LATERAL (SELECT public.auth_has_talleres_capability_scoped(p.clave, e.id) AS viejo,
                                 (v_global OR e.id = ANY (v_equipos)) AS nuevo) x
     WHERE x.viejo IS DISTINCT FROM x.nuevo;
  END LOOP;

  FOR p IN
    SELECT DISTINCT u.id AS persona, u.auth_id
      FROM public.usuarios u
     WHERE u.auth_id IS NOT NULL
       AND (EXISTS (SELECT 1 FROM public.dream_team_capability_grants g
                     WHERE g.persona_id = u.id AND g.revoked_at IS NULL
                       AND g.capability_key IN ('dream_team.direct', 'dream_team.org.manage'))
            OR EXISTS (SELECT 1 FROM public.dream_team_servicios s
                         JOIN public.dream_team_roles r ON r.id = s.rol_id
                        WHERE s.persona_id = u.id AND s.estado = 'activo'
                          AND public.dream_team_normalizar_etiqueta(r.label) = 'coordinador'))
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p.auth_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p.auth_id::text, true);
    v_registro := public.dream_team_equipos_registro();
    n_reg := n_reg + 1;

    -- dream_team_equipos_director(): the previous per-equipo body, inline.
    INSERT INTO t_diff
    SELECT 'director', p.persona, 'dream_team.direct', coalesce(v.id, n.equipo_id), v.id IS NOT NULL, n.equipo_id IS NOT NULL
      FROM (SELECT e.id FROM public.dream_team_equipos e
             WHERE e.activo AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', e.id)) v
      FULL JOIN public.dream_team_equipos_director() n ON n.equipo_id = v.id
     WHERE v.id IS NULL OR n.equipo_id IS NULL;

    INSERT INTO t_diff
    SELECT 'registro', p.persona, NULL, e.id, x.viejo, x.nuevo
      FROM public.dream_team_equipos e
      CROSS JOIN LATERAL (SELECT public.dream_team_puede_registrar_persona(e.id) AS viejo,
                                 e.id = ANY (v_registro) AS nuevo) x
     WHERE x.viejo IS DISTINCT FROM x.nuevo;
  END LOOP;

  INSERT INTO t_n VALUES ('pares', n_pares), ('registro', n_reg);
END $$;

DO $$
DECLARE
  v_resumen text;
BEGIN
  SELECT format('pares=%s registro=%s diferencias=%s %s',
                (SELECT n FROM t_n WHERE caso = 'pares'),
                (SELECT n FROM t_n WHERE caso = 'registro'),
                (SELECT count(*) FROM t_diff),
                coalesce((SELECT string_agg(format('[%s %s %s %s viejo=%s nuevo=%s]', caso, persona, clave, equipo, viejo, nuevo), ' ')
                            FROM (SELECT * FROM t_diff LIMIT 10) d), ''))
    INTO v_resumen;
  RAISE EXCEPTION 'RESULTADO %', v_resumen;
END $$;

ROLLBACK;
