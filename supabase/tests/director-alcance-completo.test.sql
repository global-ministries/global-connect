-- odd/tasks/director-alcance-completo.md, T2 — an area director reaches
-- everyone in their equipo tree (migration
-- 20261113120000_director_alcance_completo.sql).
--
-- Tree: R > A > A1, and B under R. The director holds dream_team.direct on A.
-- Every target below serves (activo) in A1, all with system role miembro
-- unless said otherwise.
--
-- Covers:
--   S1. t_tlr also holds an experience-scoped serve grant
--       (the_living_room.team.serve, scope_id NULL): reached.
--   S2. t_fuera also serves in B and holds dream_team.lead and
--       dream_team.coordinate on B: reached. t_subdir directs A1 (inside the
--       tree): reached. Still refused: t_par (dream_team.direct on B),
--       t_orgm (dream_team.org.manage on R), t_etapa (system role
--       director-etapa), t_soporte (active support capability).
--   S3. puede_editar_usuario and puede_ver_usuario_ficha are true for the
--       reached people and false for the refused ones; a p_auth_id that is
--       not the caller gets nothing, either way round; a plain user reaches
--       nobody.
--   S4. invitacion_cuenta_puede_invitar and dream_team_puede_editar_ficha
--       follow the same reach.
--
-- Run against STAGING: one transaction that ends in a RAISE EXCEPTION carrying
-- the summary, so nothing is kept. Paste the migration right after BEGIN to
-- check it before it is applied.

BEGIN;

CREATE TEMP TABLE t_res (caso text, ok boolean, detalle text) ON COMMIT DROP;

CREATE FUNCTION pg_temp.como(p_auth uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.ok(p_caso text, p_ok boolean, p_detalle text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO t_res VALUES (p_caso, coalesce(p_ok, false), p_detalle); $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
GRANT ALL ON t_res TO PUBLIC;

CREATE TEMP TABLE t_ac ON COMMIT DROP AS
SELECT gen_random_uuid() AS dir_auth, gen_random_uuid() AS dir_id,
       gen_random_uuid() AS plano_auth, gen_random_uuid() AS plano_id,
       gen_random_uuid() AS eq_r, gen_random_uuid() AS eq_a,
       gen_random_uuid() AS eq_a1, gen_random_uuid() AS eq_b,
       gen_random_uuid() AS t_tlr, gen_random_uuid() AS t_fuera,
       gen_random_uuid() AS t_subdir, gen_random_uuid() AS t_par,
       gen_random_uuid() AS t_orgm, gen_random_uuid() AS t_etapa,
       gen_random_uuid() AS t_soporte;
GRANT SELECT ON t_ac TO PUBLIC;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ac-test-' || x || '@example.test'
FROM t_ac, unnest(ARRAY[dir_auth, plano_auth]) AS x;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil)
SELECT v.id, v.auth_id, 'AC', v.apellido, 'Otro'::public.enum_genero, 'Soltero'::public.enum_estado_civil
FROM t_ac d, LATERAL (VALUES
  (d.dir_id, d.dir_auth, 'Director'), (d.plano_id, d.plano_auth, 'Plano'),
  (d.t_tlr, NULL::uuid, 'T TLR'), (d.t_fuera, NULL, 'T Fuera'), (d.t_subdir, NULL, 'T Subdir'),
  (d.t_par, NULL, 'T Par'), (d.t_orgm, NULL, 'T OrgManage'), (d.t_etapa, NULL, 'T Etapa'),
  (d.t_soporte, NULL, 'T Soporte')
) AS v(id, auth_id, apellido);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id, rs.id
FROM t_ac d, LATERAL (VALUES
  (d.dir_id, 'miembro'), (d.plano_id, 'miembro'), (d.t_tlr, 'miembro'), (d.t_fuera, 'lider'),
  (d.t_subdir, 'miembro'), (d.t_par, 'miembro'), (d.t_orgm, 'miembro'), (d.t_etapa, 'director-etapa'),
  (d.t_soporte, 'miembro')
) AS v(usuario_id, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT v.id, 'dps', v.parent, v.label, true
FROM t_ac d, LATERAL (VALUES
  (d.eq_r, NULL::uuid, 'AC Raiz'), (d.eq_a, d.eq_r, 'AC Area'),
  (d.eq_a1, d.eq_a, 'AC Subarea'), (d.eq_b, d.eq_r, 'AC Hermana')
) AS v(id, parent, label)
ORDER BY v.parent NULLS FIRST, v.label DESC;

INSERT INTO public.dream_team_roles (equipo_id, label, nivel)
SELECT e, 'voluntario', 'voluntario'
FROM t_ac d, unnest(ARRAY[d.eq_r, d.eq_a, d.eq_a1, d.eq_b]) AS e;

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio)
SELECT v.persona, v.equipo, r.id, 'activo'::public.dream_team_estado, now()
FROM t_ac d, LATERAL (VALUES
  (d.t_tlr, d.eq_a1), (d.t_fuera, d.eq_a1), (d.t_fuera, d.eq_b), (d.t_subdir, d.eq_a1),
  (d.t_par, d.eq_a1), (d.t_orgm, d.eq_a1), (d.t_etapa, d.eq_a1), (d.t_soporte, d.eq_a1)
) AS v(persona, equipo)
JOIN public.dream_team_roles r ON r.equipo_id = v.equipo;

INSERT INTO public.dream_team_capability_grants
  (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT v.persona, v.clave, v.exp, v.tipo, v.scope, 'ac-test'
FROM t_ac d, LATERAL (VALUES
  (d.dir_id,    'dream_team.direct',           'dream_team',      'equipo',     d.eq_a::text),
  (d.t_tlr,     'the_living_room.team.serve',  'the_living_room', 'experience', NULL::text),
  (d.t_fuera,   'dream_team.lead',             'dream_team',      'equipo',     d.eq_b::text),
  (d.t_fuera,   'dream_team.coordinate',       'dream_team',      'equipo',     d.eq_b::text),
  (d.t_subdir,  'dream_team.direct',           'dream_team',      'equipo',     d.eq_a1::text),
  (d.t_par,     'dream_team.direct',           'dream_team',      'equipo',     d.eq_b::text),
  (d.t_orgm,    'dream_team.org.manage',       'dream_team',      'equipo',     d.eq_r::text)
) AS v(persona, clave, exp, tipo, scope);

INSERT INTO public.support_user_capabilities (usuario_id, capability)
SELECT t_soporte, 'support.view' FROM t_ac;

SET LOCAL ROLE authenticated;
SELECT pg_temp.como(dir_auth) FROM t_ac;

-- S1 + S2: whom the director reaches.
SELECT pg_temp.ok('S1: reaches a person with an experience-scoped the_living_room serve grant',
  public.dream_team_director_alcanza_persona(t_tlr)) FROM t_ac;
SELECT pg_temp.ok('S2: reaches a person who also leads and coordinates in a sibling equipo',
  public.dream_team_director_alcanza_persona(t_fuera)) FROM t_ac;
SELECT pg_temp.ok('S2: reaches a director of an equipo inside the tree',
  public.dream_team_director_alcanza_persona(t_subdir)) FROM t_ac;
SELECT pg_temp.ok('S2: does not reach a peer director (dream_team.direct outside the tree)',
  NOT public.dream_team_director_alcanza_persona(t_par)) FROM t_ac;
SELECT pg_temp.ok('S2: does not reach an org manager (dream_team.org.manage outside the tree)',
  NOT public.dream_team_director_alcanza_persona(t_orgm)) FROM t_ac;
SELECT pg_temp.ok('S2: does not reach a person with system role director-etapa',
  NOT public.dream_team_director_alcanza_persona(t_etapa)) FROM t_ac;
SELECT pg_temp.ok('S2: does not reach a person with a support capability',
  NOT public.dream_team_director_alcanza_persona(t_soporte)) FROM t_ac;

-- S3: general profile.
SELECT pg_temp.ok('S3: puede_editar_usuario true for the reached people',
  public.puede_editar_usuario(dir_auth, t_tlr)
  AND public.puede_editar_usuario(dir_auth, t_fuera)
  AND public.puede_editar_usuario(dir_auth, t_subdir)) FROM t_ac;
SELECT pg_temp.ok('S3: puede_editar_usuario false for the protected people',
  NOT public.puede_editar_usuario(dir_auth, t_par)
  AND NOT public.puede_editar_usuario(dir_auth, t_orgm)
  AND NOT public.puede_editar_usuario(dir_auth, t_etapa)
  AND NOT public.puede_editar_usuario(dir_auth, t_soporte)) FROM t_ac;
SELECT pg_temp.ok('S3: puede_ver_usuario_ficha true for a reached person',
  public.puede_ver_usuario_ficha(dir_auth, t_tlr)) FROM t_ac;
SELECT pg_temp.ok('S3: the director session gets nothing when p_auth_id is somebody else',
  NOT public.puede_editar_usuario(plano_auth, t_tlr)) FROM t_ac;

-- S4: invitation and ficha follow the same reach.
SELECT pg_temp.ok('S4: invitation allowed for the reached people',
  public.invitacion_cuenta_puede_invitar(t_tlr)
  AND public.invitacion_cuenta_puede_invitar(t_fuera)) FROM t_ac;
SELECT pg_temp.ok('S4: ficha editable for the reached people',
  public.dream_team_puede_editar_ficha(t_tlr)
  AND public.dream_team_puede_editar_ficha(t_fuera)) FROM t_ac;
SELECT pg_temp.ok('S4: invitation and ficha refused for a peer director',
  NOT public.invitacion_cuenta_puede_invitar(t_par)
  AND NOT public.dream_team_puede_editar_ficha(t_par)) FROM t_ac;

-- A plain user reaches nobody, and cannot borrow the director's auth id.
SELECT pg_temp.como(plano_auth) FROM t_ac;
SELECT pg_temp.ok('S3: a plain user reaches nobody',
  NOT public.dream_team_director_alcanza_persona(t_tlr)
  AND NOT public.puede_editar_usuario(plano_auth, t_tlr)) FROM t_ac;
SELECT pg_temp.ok('S3: a plain user passing the director''s auth id gets nothing',
  NOT public.puede_editar_usuario(dir_auth, t_tlr)) FROM t_ac;

RESET ROLE;

DO $$
DECLARE v_total int; v_fallos text;
BEGIN
  SELECT count(*), string_agg(caso || ' → ' || coalesce(detalle, 'false'), ' | ') FILTER (WHERE NOT ok)
    INTO v_total, v_fallos FROM t_res;
  RAISE EXCEPTION 'RESULT total=% failing=%', v_total, coalesce(v_fallos, 'none');
END $$;

ROLLBACK;
