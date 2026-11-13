-- odd/tasks/director-alcance-completo.md, T4 / S6 — a coordinator reaches the
-- people of their equipo subtree (migration 20261113200000_coordinador_alcance.sql).
--
-- Tree: R > A > X > X1, and S (sibling of X) under A. The coordinator holds
-- dream_team.coordinate on X (like Gabriel Salas on Producción). Every target
-- serves (activo) in X or X1 with system role miembro unless said otherwise.
--
-- Covers S6:
--   reached: a volunteer of X (dream_team.serve), a líder of X1
--     (dream_team.lead + serve), an experience-scoped serve holder
--     (the_living_room.team.serve, NULL), a person who also serves, leads and
--     coordinates in the sibling S, a coordinator of the child X1, a group
--     leader (dream_team.gdv.lead, scope = a rol id);
--   protected: a co-coordinator of X, the director of A (dream_team.direct on
--     the parent area), a dream_team.direct holder inside X's subtree, the
--     coordinator and the líder of A, a global (NULL) coordinate / lead holder,
--     system role director-etapa, a support capability, an unknown key, a
--     person who only serves in S, a retired servicio;
--   invitacion_cuenta_puede_invitar, dream_team_puede_editar_ficha,
--   dream_team_fichas_editables and puede_editar_usuario follow the reach;
--   a NULL-scope dream_team.coordinate actor reaches nobody; a plain user and
--   service_role get nothing; the director rule still reaches its people and
--   now a gdv.lead holder inside its tree.
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

CREATE TEMP TABLE t_co ON COMMIT DROP AS
SELECT gen_random_uuid() AS co_auth, gen_random_uuid() AS co_id,
       gen_random_uuid() AS nulo_auth, gen_random_uuid() AS nulo_id,
       gen_random_uuid() AS plano_auth, gen_random_uuid() AS plano_id,
       gen_random_uuid() AS dir_auth, gen_random_uuid() AS dir_id,
       gen_random_uuid() AS eq_r, gen_random_uuid() AS eq_a, gen_random_uuid() AS eq_x,
       gen_random_uuid() AS eq_x1, gen_random_uuid() AS eq_s,
       gen_random_uuid() AS t_vol, gen_random_uuid() AS t_lid, gen_random_uuid() AS t_lid_x, gen_random_uuid() AS t_tlr,
       gen_random_uuid() AS t_hermano, gen_random_uuid() AS t_coord_x1, gen_random_uuid() AS t_gdv,
       gen_random_uuid() AS t_cocoord, gen_random_uuid() AS t_dir_dentro,
       gen_random_uuid() AS t_coord_padre, gen_random_uuid() AS t_lead_padre,
       gen_random_uuid() AS t_coord_glob, gen_random_uuid() AS t_lead_glob,
       gen_random_uuid() AS t_etapa, gen_random_uuid() AS t_soporte, gen_random_uuid() AS t_futura,
       gen_random_uuid() AS t_solo_s, gen_random_uuid() AS t_retirado;
GRANT SELECT ON t_co TO PUBLIC;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'co-test-' || x || '@example.test'
FROM t_co, unnest(ARRAY[co_auth, nulo_auth, plano_auth, dir_auth]) AS x;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil)
SELECT v.id, v.auth_id, 'CO', v.apellido, 'Otro'::public.enum_genero, 'Soltero'::public.enum_estado_civil
FROM t_co d, LATERAL (VALUES
  (d.co_id, d.co_auth, 'Coordinador'), (d.nulo_id, d.nulo_auth, 'CoordNulo'),
  (d.plano_id, d.plano_auth, 'Plano'), (d.dir_id, d.dir_auth, 'DirectorA'),
  (d.t_vol, NULL::uuid, 'T Vol'), (d.t_lid, NULL, 'T Lid'), (d.t_lid_x, NULL, 'T LidX'), (d.t_tlr, NULL, 'T TLR'),
  (d.t_hermano, NULL, 'T Hermano'), (d.t_coord_x1, NULL, 'T CoordX1'), (d.t_gdv, NULL, 'T Gdv'),
  (d.t_cocoord, NULL, 'T CoCoord'), (d.t_dir_dentro, NULL, 'T DirDentro'),
  (d.t_coord_padre, NULL, 'T CoordPadre'), (d.t_lead_padre, NULL, 'T LeadPadre'),
  (d.t_coord_glob, NULL, 'T CoordGlob'), (d.t_lead_glob, NULL, 'T LeadGlob'),
  (d.t_etapa, NULL, 'T Etapa'), (d.t_soporte, NULL, 'T Soporte'), (d.t_futura, NULL, 'T Futura'),
  (d.t_solo_s, NULL, 'T SoloS'), (d.t_retirado, NULL, 'T Retirado')
) AS v(id, auth_id, apellido);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id, rs.id
FROM t_co d, LATERAL (VALUES
  (d.co_id, 'miembro'), (d.nulo_id, 'miembro'), (d.plano_id, 'miembro'), (d.dir_id, 'miembro'),
  (d.t_vol, 'miembro'), (d.t_lid, 'lider'), (d.t_lid_x, 'miembro'), (d.t_tlr, 'miembro'), (d.t_hermano, 'lider'),
  (d.t_coord_x1, 'miembro'), (d.t_gdv, 'lider'), (d.t_cocoord, 'miembro'), (d.t_dir_dentro, 'miembro'),
  (d.t_coord_padre, 'miembro'), (d.t_lead_padre, 'miembro'), (d.t_coord_glob, 'miembro'),
  (d.t_lead_glob, 'miembro'), (d.t_etapa, 'director-etapa'), (d.t_soporte, 'miembro'),
  (d.t_futura, 'miembro'), (d.t_solo_s, 'miembro'), (d.t_retirado, 'miembro')
) AS v(usuario_id, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT v.id, 'dps', v.parent, v.label, true
FROM t_co d, LATERAL (VALUES
  (0, d.eq_r, NULL::uuid, 'CO Raiz'), (1, d.eq_a, d.eq_r, 'CO Area'),
  (2, d.eq_x, d.eq_a, 'CO Produccion'), (2, d.eq_s, d.eq_a, 'CO Hermana'),
  (3, d.eq_x1, d.eq_x, 'CO Subproduccion')
) AS v(nivel, id, parent, label)
ORDER BY v.nivel;

INSERT INTO public.dream_team_roles (equipo_id, label, nivel)
SELECT e, 'voluntario', 'voluntario'
FROM t_co d, unnest(ARRAY[d.eq_r, d.eq_a, d.eq_x, d.eq_x1, d.eq_s]) AS e;

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin)
SELECT v.persona, v.equipo, r.id, v.estado::public.dream_team_estado, now() - interval '1 day',
       CASE WHEN v.estado = 'retirado' THEN now() END
FROM t_co d, LATERAL (VALUES
  (d.co_id, d.eq_x, 'activo'), (d.t_vol, d.eq_x, 'activo'), (d.t_lid, d.eq_x1, 'activo'), (d.t_lid_x, d.eq_x, 'activo'),
  (d.t_tlr, d.eq_x1, 'activo'), (d.t_hermano, d.eq_x, 'activo'), (d.t_hermano, d.eq_s, 'activo'),
  (d.t_coord_x1, d.eq_x1, 'activo'), (d.t_gdv, d.eq_x, 'activo'), (d.t_cocoord, d.eq_x, 'activo'),
  (d.dir_id, d.eq_x, 'activo'), (d.t_dir_dentro, d.eq_x1, 'activo'), (d.t_coord_padre, d.eq_x, 'activo'),
  (d.t_lead_padre, d.eq_x, 'activo'), (d.t_coord_glob, d.eq_x, 'activo'), (d.t_lead_glob, d.eq_x, 'activo'),
  (d.t_etapa, d.eq_x, 'activo'), (d.t_soporte, d.eq_x, 'activo'), (d.t_futura, d.eq_x1, 'activo'),
  (d.t_solo_s, d.eq_s, 'activo'), (d.t_retirado, d.eq_x, 'retirado')
) AS v(persona, equipo, estado)
JOIN public.dream_team_roles r ON r.equipo_id = v.equipo;

INSERT INTO public.dream_team_capability_grants
  (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT v.persona, v.clave, v.exp, v.tipo, v.scope, 'co-test'
FROM t_co d, LATERAL (VALUES
  (d.co_id,        'dream_team.coordinate',      'dream_team',      'equipo',     d.eq_x::text),
  (d.co_id,        'dream_team.serve',           'dream_team',      'equipo',     d.eq_x::text),
  (d.nulo_id,      'dream_team.coordinate',      'dream_team',      'equipo',     NULL::text),
  (d.dir_id,       'dream_team.direct',          'dream_team',      'equipo',     d.eq_a::text),
  (d.t_vol,        'dream_team.serve',           'dream_team',      'equipo',     d.eq_x::text),
  (d.t_lid,        'dream_team.lead',            'dream_team',      'equipo',     d.eq_x1::text),
  (d.t_lid_x,      'dream_team.lead',            'dream_team',      'equipo',     d.eq_x::text),
  (d.t_lid_x,      'dream_team.serve',           'dream_team',      'equipo',     d.eq_x::text),
  (d.t_lid_x,      'estudiantes.team.lead',      'estudiantes',     'equipo',     d.eq_x::text),
  (d.t_cocoord,    'estudiantes.team.lead',      'estudiantes',     'equipo',     d.eq_x::text),
  (d.t_lid,        'dream_team.serve',           'dream_team',      'equipo',     d.eq_x1::text),
  (d.t_tlr,        'the_living_room.team.serve', 'the_living_room', 'experience', NULL::text),
  (d.t_hermano,    'dream_team.serve',           'dream_team',      'equipo',     d.eq_s::text),
  (d.t_hermano,    'dream_team.lead',            'dream_team',      'equipo',     d.eq_s::text),
  (d.t_hermano,    'dream_team.coordinate',      'dream_team',      'equipo',     d.eq_s::text),
  (d.t_coord_x1,   'dream_team.coordinate',      'dream_team',      'equipo',     d.eq_x1::text),
  (d.t_gdv,        'dream_team.gdv.lead',        'grupos_vida',     'grupo',      gen_random_uuid()::text),
  (d.t_gdv,        'dream_team.serve',           'dream_team',      'equipo',     d.eq_x::text),
  (d.t_cocoord,    'dream_team.coordinate',      'dream_team',      'equipo',     d.eq_x::text),
  (d.t_dir_dentro, 'dream_team.direct',          'dream_team',      'equipo',     d.eq_x1::text),
  (d.t_coord_padre,'dream_team.coordinate',      'dream_team',      'equipo',     d.eq_a::text),
  (d.t_lead_padre, 'dream_team.lead',            'dream_team',      'equipo',     d.eq_a::text),
  (d.t_coord_glob, 'dream_team.coordinate',      'dream_team',      'equipo',     NULL::text),
  (d.t_lead_glob,  'estudiantes.team.lead',      'estudiantes',     'experience', NULL::text),
  (d.t_futura,     'global_music.team.director', 'global_music',    'equipo',     d.eq_x1::text),
  (d.t_solo_s,     'dream_team.serve',           'dream_team',      'equipo',     d.eq_s::text)
) AS v(persona, clave, exp, tipo, scope);

INSERT INTO public.support_user_capabilities (usuario_id, capability)
SELECT t_soporte, 'support.view' FROM t_co;

SET LOCAL ROLE authenticated;
SELECT pg_temp.como(co_auth) FROM t_co;

-- Whom the coordinator of X reaches.
SELECT pg_temp.ok('S6: reaches a volunteer of X (dream_team.serve)',
  public.dream_team_coordinador_alcanza_persona(t_vol)) FROM t_co;
SELECT pg_temp.ok('S6: reaches a líder of the child X1 (dream_team.lead + serve)',
  public.dream_team_coordinador_alcanza_persona(t_lid)) FROM t_co;
SELECT pg_temp.ok('S6: reaches an experience-scoped serve holder (the_living_room.team.serve NULL)',
  public.dream_team_coordinador_alcanza_persona(t_tlr)) FROM t_co;
SELECT pg_temp.ok('S6: reaches a person who also serves, leads and coordinates in the sibling S',
  public.dream_team_coordinador_alcanza_persona(t_hermano)) FROM t_co;
SELECT pg_temp.ok('S6: reaches the coordinator of the child X1',
  public.dream_team_coordinador_alcanza_persona(t_coord_x1)) FROM t_co;
SELECT pg_temp.ok('S6: reaches a group leader (dream_team.gdv.lead)',
  public.dream_team_coordinador_alcanza_persona(t_gdv)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a co-coordinator of X',
  NOT public.dream_team_coordinador_alcanza_persona(t_cocoord)) FROM t_co;
SELECT pg_temp.ok('S6: reaches a líder of the coordinator''s own equipo (lead on X)',
  public.dream_team_coordinador_alcanza_persona(t_lid_x)
  AND public.invitacion_cuenta_puede_invitar(t_lid_x)
  AND public.puede_editar_usuario(co_auth, t_lid_x)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach the director of the parent area (dream_team.direct on A)',
  NOT public.dream_team_coordinador_alcanza_persona(dir_id)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a dream_team.direct holder inside X''s subtree',
  NOT public.dream_team_coordinador_alcanza_persona(t_dir_dentro)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach the coordinator of the parent equipo A',
  NOT public.dream_team_coordinador_alcanza_persona(t_coord_padre)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach the líder of the parent equipo A',
  NOT public.dream_team_coordinador_alcanza_persona(t_lead_padre)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a global (NULL) dream_team.coordinate holder',
  NOT public.dream_team_coordinador_alcanza_persona(t_coord_glob)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a global (NULL) *.team.lead holder',
  NOT public.dream_team_coordinador_alcanza_persona(t_lead_glob)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a person with system role director-etapa',
  NOT public.dream_team_coordinador_alcanza_persona(t_etapa)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a person with a support capability',
  NOT public.dream_team_coordinador_alcanza_persona(t_soporte)) FROM t_co;
SELECT pg_temp.ok('S6: an unknown key inside the subtree still protects (fail-closed)',
  NOT public.dream_team_coordinador_alcanza_persona(t_futura)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a person who only serves in the sibling S',
  NOT public.dream_team_coordinador_alcanza_persona(t_solo_s)) FROM t_co;
SELECT pg_temp.ok('S6: does not reach a person whose servicio in X is retired',
  NOT public.dream_team_coordinador_alcanza_persona(t_retirado)) FROM t_co;

-- The callers follow the reach.
SELECT pg_temp.ok('S6: invitation allowed for the reached people',
  public.invitacion_cuenta_puede_invitar(t_vol) AND public.invitacion_cuenta_puede_invitar(t_lid)
  AND public.invitacion_cuenta_puede_invitar(t_tlr) AND public.invitacion_cuenta_puede_invitar(t_hermano)
  AND public.invitacion_cuenta_puede_invitar(t_gdv)) FROM t_co;
SELECT pg_temp.ok('S6: ficha editable for the reached people',
  public.dream_team_puede_editar_ficha(t_vol) AND public.dream_team_puede_editar_ficha(t_lid)
  AND public.dream_team_puede_editar_ficha(t_tlr) AND public.dream_team_puede_editar_ficha(t_hermano)
  AND public.dream_team_puede_editar_ficha(t_gdv)) FROM t_co;
SELECT pg_temp.ok('S6: general profile editable for the reached people',
  public.puede_editar_usuario(co_auth, t_vol) AND public.puede_editar_usuario(co_auth, t_lid)
  AND public.puede_editar_usuario(co_auth, t_tlr) AND public.puede_editar_usuario(co_auth, t_hermano)
  AND public.puede_editar_usuario(co_auth, t_gdv)) FROM t_co;
SELECT pg_temp.ok('S6: dream_team_fichas_editables returns exactly the reached people of the batch',
  (SELECT array_agg(x ORDER BY x)
     FROM public.dream_team_fichas_editables(ARRAY[t_vol, t_lid, t_cocoord, dir_id, t_solo_s]) AS f(x))
  = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[t_vol, t_lid]) AS u(x))) FROM t_co;
SELECT pg_temp.ok('S6: invitation, ficha and profile refused for the protected people',
  NOT public.invitacion_cuenta_puede_invitar(t_cocoord) AND NOT public.dream_team_puede_editar_ficha(t_cocoord)
  AND NOT public.puede_editar_usuario(co_auth, t_cocoord)
  AND NOT public.invitacion_cuenta_puede_invitar(dir_id) AND NOT public.dream_team_puede_editar_ficha(dir_id)
  AND NOT public.puede_editar_usuario(co_auth, dir_id)
  AND NOT public.invitacion_cuenta_puede_invitar(t_dir_dentro) AND NOT public.puede_editar_usuario(co_auth, t_dir_dentro)
  AND NOT public.invitacion_cuenta_puede_invitar(t_coord_padre) AND NOT public.puede_editar_usuario(co_auth, t_coord_padre)
  AND NOT public.invitacion_cuenta_puede_invitar(t_coord_glob) AND NOT public.puede_editar_usuario(co_auth, t_coord_glob)
  AND NOT public.invitacion_cuenta_puede_invitar(t_etapa) AND NOT public.dream_team_puede_editar_ficha(t_etapa)
  AND NOT public.invitacion_cuenta_puede_invitar(t_soporte) AND NOT public.puede_editar_usuario(co_auth, t_soporte)
  AND NOT public.invitacion_cuenta_puede_invitar(t_futura) AND NOT public.dream_team_puede_editar_ficha(t_futura)
  AND NOT public.invitacion_cuenta_puede_invitar(t_solo_s) AND NOT public.puede_editar_usuario(co_auth, t_solo_s)) FROM t_co;
SELECT pg_temp.ok('S6: the coordinator session gets nothing when p_auth_id is somebody else',
  NOT public.puede_editar_usuario(plano_auth, t_vol)) FROM t_co;

-- A NULL-scope dream_team.coordinate gives no coordinator reach.
SELECT pg_temp.como(nulo_auth) FROM t_co;
SELECT pg_temp.ok('S6: a NULL-scope dream_team.coordinate actor reaches nobody',
  NOT public.dream_team_coordinador_alcanza_persona(t_vol)
  AND NOT public.dream_team_coordinador_alcanza_persona(t_lid)
  AND NOT public.dream_team_director_alcanza_persona(t_vol)
  AND NOT public.invitacion_cuenta_puede_invitar(t_vol)
  AND NOT public.puede_editar_usuario(nulo_auth, t_vol)) FROM t_co;

-- A plain user reaches nobody, and cannot borrow the coordinator's auth id.
SELECT pg_temp.como(plano_auth) FROM t_co;
SELECT pg_temp.ok('S6: a plain user reaches nobody',
  NOT public.dream_team_coordinador_alcanza_persona(t_vol)
  AND NOT public.invitacion_cuenta_puede_invitar(t_vol)
  AND NOT public.dream_team_puede_editar_ficha(t_vol)
  AND NOT public.puede_editar_usuario(plano_auth, t_vol)) FROM t_co;
SELECT pg_temp.ok('S6: a plain user passing the coordinator''s auth id gets nothing',
  NOT public.puede_editar_usuario(co_auth, t_vol)) FROM t_co;

-- The director rule still reaches its people, now including gdv.lead holders.
SELECT pg_temp.como(dir_auth) FROM t_co;
SELECT pg_temp.ok('S6: the director of A still reaches a volunteer of X',
  public.dream_team_director_alcanza_persona(t_vol)
  AND public.puede_editar_usuario(dir_auth, t_vol)) FROM t_co;
SELECT pg_temp.ok('S6: the director of A reaches a gdv.lead holder inside the tree',
  public.dream_team_director_alcanza_persona(t_gdv)
  AND public.invitacion_cuenta_puede_invitar(t_gdv)) FROM t_co;

RESET ROLE;

-- service_role acting for the coordinator does not get the reach.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT pg_temp.ok('S6: service_role passing the coordinator''s auth id does not get the reach',
  NOT public.puede_editar_usuario(co_auth, t_vol)) FROM t_co;
RESET ROLE;

DO $$
DECLARE v_total int; v_fallos text;
BEGIN
  SELECT count(*), string_agg(caso || ' → ' || coalesce(detalle, 'false'), ' | ') FILTER (WHERE NOT ok)
    INTO v_total, v_fallos FROM t_res;
  RAISE EXCEPTION 'RESULT total=% failing=%', v_total, coalesce(v_fallos, 'none');
END $$;

ROLLBACK;
