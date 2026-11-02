-- odd/tasks/dream-team-directores-invitan.md, T1 — Dream Team area directors
-- invite the people of their area (migration
-- 20261102200000_invitacion_cuenta_directores_area.sql).
--
-- Tree: R > A > A1, and B under R. The director holds dream_team.direct
-- scoped to A; a second director holds the same grant, revoked.
--
-- Covers:
--   S1. The director invites a miembro serving in A1 (subtree) and a
--       lider-role person serving in A (own equipo), and sees their state.
--   S2. A pastor and a director-etapa serving in A1 are refused.
--   S3. A person serving only in B (sibling) or R (parent), a retired
--       servicio in A, and a director with a revoked grant are refused, and
--       the state reads NULL; invitacion_cuenta_sin_cuenta lists only the
--       two allowed fichas.
--   S4 is covered by supabase/tests/invitaciones-cuenta.test.sql (run it too).
--
-- Run against STAGING: the whole script is one transaction that ends in a
-- RAISE EXCEPTION carrying the summary, so nothing is ever kept. To check the
-- migration before it is applied, paste the migration right after BEGIN.

BEGIN;

CREATE TEMP TABLE t_res (caso text, ok boolean, detalle text) ON COMMIT DROP;

CREATE FUNCTION pg_temp.como(p_auth uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.ok(p_caso text, p_ok boolean, p_detalle text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_res VALUES (p_caso, coalesce(p_ok, false), p_detalle);
$$;

-- Runs p_sql and records whether it raised p_mensaje (message text or SQLSTATE).
CREATE FUNCTION pg_temp.falla(p_caso text, p_sql text, p_mensaje text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.ok(p_caso, false, 'no error');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(p_caso, SQLERRM = p_mensaje OR SQLSTATE = p_mensaje, SQLSTATE || ' ' || SQLERRM);
END $$;

-- Runs p_sql and records whether it succeeded.
CREATE FUNCTION pg_temp.pasa(p_caso text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.ok(p_caso, true);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(p_caso, false, SQLSTATE || ' ' || SQLERRM);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
GRANT ALL ON t_res TO PUBLIC;

CREATE TEMP TABLE t_da ON COMMIT DROP AS
SELECT gen_random_uuid() AS dir_auth, gen_random_uuid() AS dir_id,
       gen_random_uuid() AS rev_auth, gen_random_uuid() AS rev_id,
       gen_random_uuid() AS eq_r, gen_random_uuid() AS eq_a,
       gen_random_uuid() AS eq_a1, gen_random_uuid() AS eq_b,
       gen_random_uuid() AS t_sub, gen_random_uuid() AS t_area,
       gen_random_uuid() AS t_hermano, gen_random_uuid() AS t_padre,
       gen_random_uuid() AS t_retirado, gen_random_uuid() AS t_pastor,
       gen_random_uuid() AS t_director;
GRANT SELECT ON t_da TO PUBLIC;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'da-test-' || x || '@example.test'
FROM t_da, unnest(ARRAY[dir_auth, rev_auth]) AS x;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil, email)
SELECT v.id, v.auth_id, 'DA', v.apellido, 'Otro'::public.enum_genero,
       'Soltero'::public.enum_estado_civil, v.email
FROM t_da d, LATERAL (VALUES
  (d.dir_id,     d.dir_auth, 'Director',   NULL),
  (d.rev_id,     d.rev_auth, 'Revocado',   NULL),
  (d.t_sub,      NULL, 'T Sub',      'da-sub@example.test'),
  (d.t_area,     NULL, 'T Area',     'da-area@example.test'),
  (d.t_hermano,  NULL, 'T Hermano',  'da-hermano@example.test'),
  (d.t_padre,    NULL, 'T Padre',    'da-padre@example.test'),
  (d.t_retirado, NULL, 'T Retirado', 'da-retirado@example.test'),
  (d.t_pastor,   NULL, 'T Pastor',   'da-pastor@example.test'),
  (d.t_director, NULL, 'T Director', 'da-director@example.test')
) AS v(id, auth_id, apellido, email);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id, rs.id
FROM t_da d, LATERAL (VALUES
  (d.dir_id, 'miembro'), (d.rev_id, 'miembro'),
  (d.t_sub, 'miembro'), (d.t_area, 'lider'), (d.t_hermano, 'miembro'),
  (d.t_padre, 'miembro'), (d.t_retirado, 'miembro'), (d.t_pastor, 'pastor'),
  (d.t_director, 'director-etapa')
) AS v(usuario_id, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT v.id, 'dps', v.parent, v.label, true
FROM t_da d, LATERAL (VALUES
  (d.eq_r, NULL::uuid, 'DA Raiz'), (d.eq_a, d.eq_r, 'DA Area'),
  (d.eq_a1, d.eq_a, 'DA Subarea'), (d.eq_b, d.eq_r, 'DA Hermana')
) AS v(id, parent, label)
ORDER BY v.parent NULLS FIRST, v.label DESC;

INSERT INTO public.dream_team_roles (equipo_id, label, nivel)
SELECT e, 'voluntario', 'voluntario'
FROM t_da d, unnest(ARRAY[d.eq_r, d.eq_a, d.eq_a1, d.eq_b]) AS e;

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin)
SELECT v.persona, v.equipo, r.id, v.estado::public.dream_team_estado, now(),
       CASE WHEN v.estado = 'retirado' THEN now() END
FROM t_da d, LATERAL (VALUES
  (d.t_sub, d.eq_a1, 'activo'), (d.t_area, d.eq_a, 'activo'),
  (d.t_hermano, d.eq_b, 'activo'), (d.t_padre, d.eq_r, 'activo'),
  (d.t_retirado, d.eq_a, 'retirado'), (d.t_pastor, d.eq_a1, 'activo'),
  (d.t_director, d.eq_a1, 'activo')
) AS v(persona, equipo, estado)
JOIN public.dream_team_roles r ON r.equipo_id = v.equipo;

INSERT INTO public.dream_team_capability_grants
  (persona_id, capability_key, experience, scope_type, scope_id, source, revoked_at)
SELECT v.persona, 'dream_team.direct', 'dream_team', 'equipo', d.eq_a::text,
       'dream-team-servicio', v.revocado
FROM t_da d, LATERAL (VALUES (d.dir_id, NULL::timestamptz), (d.rev_id, now())) AS v(persona, revocado);

SET LOCAL ROLE authenticated;

-- S1. The director invites people serving in A and below.
SELECT pg_temp.como(dir_auth) FROM t_da;
SELECT pg_temp.ok('S1: director sees the state of a miembro in the subarea',
  public.invitacion_cuenta_estado(t_sub) IS NOT NULL) FROM t_da;
SELECT pg_temp.pasa('S1: director invites a miembro in the subarea',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_sub, 'da-sub@example.test')) FROM t_da;
SELECT pg_temp.pasa('S1: director invites a lider in their own equipo',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_area, 'da-area@example.test')) FROM t_da;

-- S2. Privileged fichas inside the subtree are refused.
SELECT pg_temp.falla('S2: director refused for a pastor in the subarea',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_pastor, 'da-pastor@example.test'),
  'sin_autoridad') FROM t_da;
SELECT pg_temp.falla('S2: director refused for a director-etapa in the subarea',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_director, 'da-director@example.test'),
  'sin_autoridad') FROM t_da;

-- S3. Outside the subtree, retired or revoked: refused.
SELECT pg_temp.falla('S3: director refused for a miembro in the sibling equipo',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_hermano, 'da-hermano@example.test'),
  'sin_autoridad') FROM t_da;
SELECT pg_temp.falla('S3: director refused for a miembro in the parent equipo',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_padre, 'da-padre@example.test'),
  'sin_autoridad') FROM t_da;
SELECT pg_temp.falla('S3: director refused for a retired servicio',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_retirado, 'da-retirado@example.test'),
  'sin_autoridad') FROM t_da;
SELECT pg_temp.ok('S3: director sees no state outside their authority',
  public.invitacion_cuenta_estado(t_hermano) IS NULL
  AND public.invitacion_cuenta_estado(t_padre) IS NULL
  AND public.invitacion_cuenta_estado(t_retirado) IS NULL
  AND public.invitacion_cuenta_estado(t_pastor) IS NULL) FROM t_da;
SELECT pg_temp.ok('S3: sin_cuenta lists only the allowed fichas',
  ARRAY(SELECT x FROM public.invitacion_cuenta_sin_cuenta(
          ARRAY[t_sub, t_area, t_hermano, t_padre, t_retirado, t_pastor, t_director]) AS x ORDER BY x)
    = ARRAY(SELECT y FROM unnest(ARRAY[t_sub, t_area]) AS y ORDER BY y)) FROM t_da;

SELECT pg_temp.como(rev_auth) FROM t_da;
SELECT pg_temp.falla('S3: a revoked director grant is refused',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', t_sub, 'da-sub@example.test'),
  'sin_autoridad') FROM t_da;

RESET ROLE;

DO $$
DECLARE v_total int; v_fallos text;
BEGIN
  SELECT count(*), string_agg(caso || ' → ' || coalesce(detalle, 'false'), ' | ') FILTER (WHERE NOT ok)
    INTO v_total, v_fallos FROM t_res;
  RAISE EXCEPTION 'RESULT total=% failing=%', v_total, coalesce(v_fallos, 'none');
END $$;

ROLLBACK;
