-- odd/tasks/dream-team-directores-fichas.md, T1 — area directors edit the
-- fichas of their people and register new people into their area (migration
-- 20261105100000_dream_team_directores_fichas_altas.sql).
--
-- Tree: R > A > A1, and B under R. The director holds dream_team.direct on A.
--
-- Covers:
--   S1. The director reads and edits the ficha of a miembro in A1 and of a
--       lider-role person in A; dream_team_fichas_editables lists exactly the
--       people they reach.
--   S2. A miembro of B, a pastor in A1, a person who directs B and a retired
--       servicio in A are refused (sin_autoridad) and their ficha is unchanged.
--   S3. The director may register into A1 (a real registration creates the
--       person and the servicio), not into B or R; dream_team_opciones_registro
--       lists A and A1 only; a plain user may register nowhere.
--   S4. The invitation rule still reaches the same people (A1 yes, B no).
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

CREATE FUNCTION pg_temp.falla(p_caso text, p_sql text, p_mensaje text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.ok(p_caso, false, 'no error');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(p_caso, SQLERRM = p_mensaje OR SQLSTATE = p_mensaje, SQLSTATE || ' ' || SQLERRM);
END $$;

CREATE FUNCTION pg_temp.pasa(p_caso text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.ok(p_caso, true);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(p_caso, false, SQLSTATE || ' ' || SQLERRM);
END $$;

-- Runs p_sql (a boolean query) and records its value, or the error it raised.
CREATE FUNCTION pg_temp.verdad(p_caso text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  EXECUTE p_sql INTO v;
  PERFORM pg_temp.ok(p_caso, v);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(p_caso, false, SQLSTATE || ' ' || SQLERRM);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
GRANT ALL ON t_res TO PUBLIC;

CREATE TEMP TABLE t_df ON COMMIT DROP AS
SELECT gen_random_uuid() AS dir_auth, gen_random_uuid() AS dir_id,
       gen_random_uuid() AS plano_auth, gen_random_uuid() AS plano_id,
       gen_random_uuid() AS eq_r, gen_random_uuid() AS eq_a,
       gen_random_uuid() AS eq_a1, gen_random_uuid() AS eq_b,
       gen_random_uuid() AS t_sub, gen_random_uuid() AS t_area,
       gen_random_uuid() AS t_hermano, gen_random_uuid() AS t_pastor,
       gen_random_uuid() AS t_otra_area, gen_random_uuid() AS t_retirado,
       (SELECT uc.campus_id FROM public.usuario_campus uc LIMIT 1) AS campus_id;
GRANT SELECT ON t_df TO PUBLIC;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'df-test-' || x || '@example.test'
FROM t_df, unnest(ARRAY[dir_auth, plano_auth]) AS x;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil, email, cedula)
SELECT v.id, v.auth_id, 'DF', v.apellido, 'Otro'::public.enum_genero,
       'Soltero'::public.enum_estado_civil, NULL, NULL
FROM t_df d, LATERAL (VALUES
  (d.dir_id, d.dir_auth, 'Director'), (d.plano_id, d.plano_auth, 'Plano'),
  (d.t_sub, NULL::uuid, 'T Sub'), (d.t_area, NULL, 'T Area'), (d.t_hermano, NULL, 'T Hermano'),
  (d.t_pastor, NULL, 'T Pastor'), (d.t_otra_area, NULL, 'T OtraArea'), (d.t_retirado, NULL, 'T Retirado')
) AS v(id, auth_id, apellido);

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT dir_id, campus_id, true FROM t_df;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id, rs.id
FROM t_df d, LATERAL (VALUES
  (d.dir_id, 'miembro'), (d.plano_id, 'miembro'), (d.t_sub, 'miembro'), (d.t_area, 'lider'),
  (d.t_hermano, 'miembro'), (d.t_pastor, 'pastor'), (d.t_otra_area, 'miembro'), (d.t_retirado, 'miembro')
) AS v(usuario_id, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT v.id, 'dps', v.parent, v.label, true
FROM t_df d, LATERAL (VALUES
  (d.eq_r, NULL::uuid, 'DF Raiz'), (d.eq_a, d.eq_r, 'DF Area'),
  (d.eq_a1, d.eq_a, 'DF Subarea'), (d.eq_b, d.eq_r, 'DF Hermana')
) AS v(id, parent, label)
ORDER BY v.parent NULLS FIRST, v.label DESC;

INSERT INTO public.dream_team_roles (equipo_id, label, nivel)
SELECT e, 'voluntario', 'voluntario'
FROM t_df d, unnest(ARRAY[d.eq_r, d.eq_a, d.eq_a1, d.eq_b]) AS e;

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin)
SELECT v.persona, v.equipo, r.id, v.estado::public.dream_team_estado, now(),
       CASE WHEN v.estado = 'retirado' THEN now() END
FROM t_df d, LATERAL (VALUES
  (d.t_sub, d.eq_a1, 'activo'), (d.t_area, d.eq_a, 'activo'), (d.t_hermano, d.eq_b, 'activo'),
  (d.t_pastor, d.eq_a1, 'activo'), (d.t_otra_area, d.eq_a1, 'activo'), (d.t_retirado, d.eq_a, 'retirado')
) AS v(persona, equipo, estado)
JOIN public.dream_team_roles r ON r.equipo_id = v.equipo;

INSERT INTO public.dream_team_capability_grants
  (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT v.persona, 'dream_team.direct', 'dream_team', 'equipo', v.scope, 'dream-team-servicio'
FROM t_df d, LATERAL (VALUES (d.dir_id, d.eq_a::text), (d.t_otra_area, d.eq_b::text)) AS v(persona, scope);

SET LOCAL ROLE authenticated;
SELECT pg_temp.como(dir_auth) FROM t_df;

-- S1. Reached people: read, edit, batch list.
SELECT pg_temp.verdad('S1: director reads the ficha of a miembro in the subarea',
  format('SELECT public.dream_team_ficha_persona(%L) ->> %L = %L', t_sub, 'id', t_sub)) FROM t_df;
SELECT pg_temp.pasa('S1: director edits cedula and phone of a miembro in the subarea',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_sub,
         '{"cedula": "V-31999001", "telefono": "04141234567"}')) FROM t_df;
SELECT pg_temp.pasa('S1: director edits a lider in their own equipo',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_area, '{"fecha_nacimiento": "1990-05-04"}')) FROM t_df;
SELECT pg_temp.verdad('S1: fichas_editables lists exactly the reached people',
  format('SELECT ARRAY(SELECT x FROM public.dream_team_fichas_editables(%L::uuid[]) AS x ORDER BY x) '
         '= ARRAY(SELECT y FROM unnest(%L::uuid[]) AS y ORDER BY y)',
         ARRAY[t_sub, t_area, t_hermano, t_pastor, t_otra_area, t_retirado], ARRAY[t_sub, t_area])) FROM t_df;

-- S2. Out of reach: refused.
SELECT pg_temp.falla('S2: refused for a miembro of the sibling area',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_hermano, '{"cedula": "V-31999002"}'),
  'sin_autoridad') FROM t_df;
SELECT pg_temp.falla('S2: refused for a pastor in the subarea',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_pastor, '{"cedula": "V-31999003"}'),
  'sin_autoridad') FROM t_df;
SELECT pg_temp.falla('S2: refused for someone who directs the sibling area',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_otra_area, '{"cedula": "V-31999004"}'),
  'sin_autoridad') FROM t_df;
SELECT pg_temp.falla('S2: refused for a retired servicio',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_retirado, '{"cedula": "V-31999005"}'),
  'sin_autoridad') FROM t_df;
SELECT pg_temp.falla('S2: refused reading the ficha of a sibling-area miembro',
  format('SELECT public.dream_team_ficha_persona(%L)', t_hermano), 'sin_autoridad') FROM t_df;

-- S3. Registration.
SELECT pg_temp.ok('S3: may register into the subarea, not into the sibling or the parent',
  public.dream_team_puede_registrar_persona(eq_a1)
  AND public.dream_team_puede_registrar_persona(eq_a)
  AND NOT public.dream_team_puede_registrar_persona(eq_b)
  AND NOT public.dream_team_puede_registrar_persona(eq_r)) FROM t_df;
SELECT pg_temp.ok('S3: opciones_registro lists A and A1 only',
  ARRAY(SELECT (o ->> 'id')::uuid FROM jsonb_array_elements(public.dream_team_opciones_registro()) o
         WHERE (o ->> 'id')::uuid IN (eq_r, eq_a, eq_a1, eq_b) ORDER BY 1)
    = ARRAY(SELECT y FROM unnest(ARRAY[eq_a, eq_a1]) AS y ORDER BY y)) FROM t_df;
SELECT pg_temp.verdad('S3: director registers a new person into the subarea',
  format('SELECT public.dream_team_registrar_persona(p_equipo_id => %L, p_rol_id => %L, p_nombre => %L, '
         'p_apellido => %L, p_genero => %L, p_estado_civil => %L, p_cedula => %L) ->> %L = %L',
         eq_a1, (SELECT r.id FROM public.dream_team_roles r WHERE r.equipo_id = eq_a1),
         'DF', 'Nueva Persona', 'Otro', 'Soltero', 'V-31999009', 'resultado', 'creada')) FROM t_df;
SELECT pg_temp.falla('S3: director refused registering into the sibling area',
  format('SELECT public.dream_team_registrar_persona(p_equipo_id => %L, p_rol_id => %L, p_nombre => %L, '
         'p_apellido => %L, p_genero => %L, p_estado_civil => %L, p_cedula => %L)',
         eq_b, (SELECT r.id FROM public.dream_team_roles r WHERE r.equipo_id = eq_b),
         'DF', 'Ajena', 'Otro', 'Soltero', 'V-31999010'),
  'sin_autoridad') FROM t_df;

-- S4. The invitation rule reaches the same people.
SELECT pg_temp.ok('S4: invite rule unchanged (subarea yes, sibling no)',
  public.invitacion_cuenta_puede_invitar(t_sub)
  AND NOT public.invitacion_cuenta_puede_invitar(t_hermano)
  AND NOT public.invitacion_cuenta_puede_invitar(t_pastor)) FROM t_df;

-- S3. A plain user may register nowhere and edits nothing.
SELECT pg_temp.como(plano_auth) FROM t_df;
SELECT pg_temp.ok('S3: plain user may not register',
  NOT public.dream_team_puede_registrar_persona(NULL)) FROM t_df;
SELECT pg_temp.falla('S2: plain user refused editing a ficha',
  format('SELECT public.dream_team_editar_ficha(%L, %L::jsonb)', t_sub, '{"telefono": "04140000000"}'),
  'sin_autoridad') FROM t_df;

RESET ROLE;

SELECT pg_temp.ok('S1: edits persisted (cedula normalized, phone, birth date)',
  (SELECT cedula IS NOT NULL AND telefono IS NOT NULL FROM public.usuarios WHERE id = d.t_sub)
  AND (SELECT fecha_nacimiento = DATE '1990-05-04' FROM public.usuarios WHERE id = d.t_area)) FROM t_df d;
SELECT pg_temp.ok('S2: refused fichas unchanged',
  NOT EXISTS (SELECT 1 FROM public.usuarios u
               WHERE u.id IN (d.t_hermano, d.t_pastor, d.t_otra_area, d.t_retirado) AND u.cedula IS NOT NULL)) FROM t_df d;
SELECT pg_temp.ok('S3: the new person serves in the subarea',
  EXISTS (SELECT 1 FROM public.usuarios u JOIN public.dream_team_servicios s ON s.persona_id = u.id
           WHERE u.apellido = 'Nueva Persona' AND s.equipo_id = d.eq_a1)) FROM t_df d;

DO $$
DECLARE v_total int; v_fallos text;
BEGIN
  SELECT count(*), string_agg(caso || ' → ' || coalesce(detalle, 'false'), ' | ') FILTER (WHERE NOT ok)
    INTO v_total, v_fallos FROM t_res;
  RAISE EXCEPTION 'RESULT total=% failing=%', v_total, coalesce(v_fallos, 'none');
END $$;

ROLLBACK;
