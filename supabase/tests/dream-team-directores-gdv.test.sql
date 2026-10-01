-- T1 (odd/tasks/dream-team-directores-gdv.md) — dream_team_lideres_gdv() also
-- returns the directores de etapa and the directores generales of Grupos de
-- Vida, so Servidores and Mi equipo can show them as people.
--
-- Covers:
--   1. A caller with Dream Team authority on the Grupos de Vida root gets a
--      director_etapa row per segmento_lideres row and a director_general row
--      per director_general_segmentos row (equipo_id = segment id, desde =
--      creado_en).
--   2. The lider / colider rows are exactly the ones the previous definition
--      returned (the previous live text is recreated under a pg_temp name).
--   3. Parity with dream_team_estructura_gdv(), both ways: every director_etapa
--      equipo_id is a 'directores' node, every director_general equipo_id is a
--      'segmento' node, and every 'directores' node has at least one person.
--   4. A married couple of directores de etapa of the same segment share ONE
--      equipo_id; a director without a spouse-director gets their own; a person
--      with two segmento_lideres rows in one segment yields one row.
--   5. A director with no current groups still appears.
--   6. dream_team_resolver_nombres and dream_team_contactos_personas return a
--      person who is ONLY a director (name, phone, tiene_cuenta), and nothing
--      to a caller without authority.
--   7. A caller without any Dream Team authority gets zero rows.
--   8. anon cannot execute; authenticated and service_role can.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own f1000000-... namespace. The MCP connection is
-- `postgres` (BYPASSRLS), so every authorization assertion runs under
-- SET LOCAL ROLE authenticated with request.jwt.claim.sub set to the fixture
-- auth id. The last statement is a SELECT of the failing cases (0 failing
-- cases = all ok), because the MCP tool returns only the last result-producing
-- statement.
--
-- Identities:
--   manager (…11) dream_team.org.manage, scope NULL  -> authority on the GdV root
--   member  (…13) no capability at all               -> no authority
-- Segments: SA (…a1), SB (…a2).
-- People:
--   DG1 (…21) director general of SA and SB, with account and phone
--   DE1 (…23) director de etapa of SA, with account and phone, no spouse
--   C1  (…31), C2 (…32) married, both directores de etapa of SB (one couple)
--   DE2 (…33) director de etapa of SB, married to a non-director (…34)
--   DUP (…35) director de etapa of SB AND a segmento_lideres row typed
--             director_general in the same segment (two rows, one person)

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dir_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_dir_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dir_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs a query that returns one scalar and compares its text form.
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The definition of dream_team_lideres_gdv() live before this change, verbatim,
-- under a temp name. Same SECURITY DEFINER + pinned search_path, so it answers
-- exactly as the old function did for whoever is simulated.
CREATE OR REPLACE FUNCTION pg_temp.lideres_gdv_anterior()
 RETURNS TABLE(persona_id uuid, equipo_id uuid, rol text, desde timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with nodo as (
    select e.id
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  )
  select gm.usuario_id,
         gm.grupo_id,
         case when gm.rol = 'Líder' then 'lider' else 'colider' end,
         gm.fecha_asignacion
  from public.grupo_miembros gm
  join public.grupos g on g.id = gm.grupo_id
  join public.temporadas t on t.id = g.temporada_id
  where gm.rol in ('Líder', 'Colíder')
    and gm.fecha_salida is null
    and coalesce(gm.estado, 'activo') = 'activo'
    and g.activo
    and not g.eliminado
    and g.estado_aprobacion = 'aprobado'
    and t.activa
    and exists (select 1 from alcance);
$function$;

-- Fixtures (as postgres, before any role switch) ----------------------------

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('f1000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'dir-manager@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('f1000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'dir-member@example.test',  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('f1000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'dir-dg1@example.test',     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('f1000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'dir-de1@example.test',     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('f1000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000010', 'ZZ Dir', 'Manager', 'dir-manager@example.test', NULL, 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000013', 'f1000000-0000-4000-8000-000000000012', 'ZZ Dir', 'Member',  'dir-member@example.test',  NULL, 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000020', 'ZZ Dir', 'DG1',     'dir-dg1@example.test',     '0414-555-0001', 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000022', 'ZZ Dir', 'DE1',     'dir-de1@example.test',     '0424-555-0002', 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000031', NULL, 'ZZ Dir', 'Pareja C1', NULL, '04125550003', 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000032', NULL, 'ZZ Dir', 'Pareja C2', NULL, NULL,          'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000033', NULL, 'ZZ Dir', 'DE2',       NULL, '04165550004', 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000034', NULL, 'ZZ Dir', 'Conyuge no director', NULL, NULL, 'Soltero', 'Otro'),
  ('f1000000-0000-4000-8000-000000000035', NULL, 'ZZ Dir', 'DUP',       NULL, NULL,          'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('f1000000-0000-4000-8000-000000000011', 'dream_team.org.manage', 'dream_team', 'experience', NULL);

INSERT INTO public.segmentos (id, nombre) VALUES
  ('f1000000-0000-4000-8000-0000000000a1', 'ZZ Dir SA'),
  ('f1000000-0000-4000-8000-0000000000a2', 'ZZ Dir SB');

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('f1000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-000000000023', 'director_etapa'),
  ('f1000000-0000-4000-8000-0000000000b2', 'f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000031', 'director_etapa'),
  ('f1000000-0000-4000-8000-0000000000b3', 'f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000032', 'director_etapa'),
  ('f1000000-0000-4000-8000-0000000000b4', 'f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000033', 'director_etapa'),
  ('f1000000-0000-4000-8000-0000000000b5', 'f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000035', 'director_etapa'),
  ('f1000000-0000-4000-8000-0000000000b6', 'f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000035', 'director_general');

-- C1 and C2 are married; DE2 is married to a person who is not a director.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('f1000000-0000-4000-8000-000000000032', 'f1000000-0000-4000-8000-000000000031', 'conyuge'),
  ('f1000000-0000-4000-8000-000000000033', 'f1000000-0000-4000-8000-000000000034', 'conyuge');

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id) VALUES
  ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-0000000000a1'),
  ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-0000000000a2');

-- Expectations computed as postgres, before any role switch: the assertions
-- below run as `authenticated`, which must not depend on the RLS of Grupos de
-- Vida tables. The snapshot already includes the fixtures above.
CREATE TEMP TABLE t_dir_expected AS
  SELECT (SELECT count(*) FROM (SELECT DISTINCT sl.usuario_id, sl.segmento_id
                                  FROM public.segmento_lideres sl
                                  JOIN public.usuarios u ON u.id = sl.usuario_id) s) AS n_etapa,
         (SELECT count(*) FROM public.director_general_segmentos dgs
                          JOIN public.usuarios u ON u.id = dgs.usuario_id) AS n_general;
CREATE TEMP TABLE t_dir_dgs AS
  SELECT dgs.usuario_id, dgs.segmento_id, dgs.creado_en FROM public.director_general_segmentos dgs;
GRANT SELECT ON t_dir_expected, t_dir_dgs TO authenticated;

-- No fixture person is a leader of any group: case 5 relies on it.
SELECT pg_temp.assert_eq('fixture: no fixture person belongs to a group as lider or colider',
  $q$SELECT count(*) FROM public.grupo_miembros gm
      WHERE gm.usuario_id::text LIKE 'f1000000-0000-4000-8000-0000000000%'$q$,
  '0');

-- Cases, as the manager (authority on the Grupos de Vida root) ---------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('f1000000-0000-4000-8000-000000000010');

-- 1. Directores de etapa and directores generales appear.
SELECT pg_temp.assert_eq('director de etapa DE1 has one director_etapa row on his own directores node',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.persona_id = 'f1000000-0000-4000-8000-000000000023'
        AND l.rol = 'director_etapa'
        AND l.equipo_id = md5('dream_team.gdv.directores:f1000000-0000-4000-8000-0000000000a1:f1000000-0000-4000-8000-000000000023:')::uuid$q$,
  '1');
SELECT pg_temp.assert_eq('director de etapa row carries no timestamp (segmento_lideres has none)',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_etapa' AND l.persona_id = 'f1000000-0000-4000-8000-000000000023' AND l.desde IS NULL$q$,
  '1');
SELECT pg_temp.assert_eq('director general DG1 has one director_general row per assigned segment',
  $q$SELECT string_agg(l.equipo_id::text, ',' ORDER BY l.equipo_id) FROM public.dream_team_lideres_gdv() l
      WHERE l.persona_id = 'f1000000-0000-4000-8000-000000000021' AND l.rol = 'director_general'$q$,
  'f1000000-0000-4000-8000-0000000000a1,f1000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_eq('director general rows carry the creation timestamp of the assignment',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      JOIN t_dir_dgs dgs
        ON dgs.usuario_id = l.persona_id AND dgs.segmento_id = l.equipo_id
      WHERE l.persona_id = 'f1000000-0000-4000-8000-000000000021'
        AND l.rol = 'director_general'
        AND l.desde = dgs.creado_en$q$,
  '2');
SELECT pg_temp.assert_eq('DG1 has no director_etapa row and DE1 has no director_general row',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE (l.persona_id = 'f1000000-0000-4000-8000-000000000021' AND l.rol <> 'director_general')
         OR (l.persona_id = 'f1000000-0000-4000-8000-000000000023' AND l.rol <> 'director_etapa')$q$,
  '0');
SELECT pg_temp.assert_eq('director_etapa rows are exactly one per (person, segmento_lideres) set of the structure',
  $q$SELECT (
       (SELECT count(*) FROM public.dream_team_lideres_gdv() WHERE rol = 'director_etapa')
       = (SELECT n_etapa FROM t_dir_expected)
     )::text$q$,
  'true');
SELECT pg_temp.assert_eq('director_general rows are exactly one per director_general_segmentos row',
  $q$SELECT (
       (SELECT count(*) FROM public.dream_team_lideres_gdv() WHERE rol = 'director_general')
       = (SELECT n_general FROM t_dir_expected)
     )::text$q$,
  'true');
SELECT pg_temp.assert_eq('the function only ever returns the four known roles',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv()
      WHERE rol NOT IN ('lider', 'colider', 'director_etapa', 'director_general')$q$,
  '0');

-- 2. lider / colider rows are exactly what the previous definition returned.
SELECT pg_temp.assert_eq('fixture: the previous definition returns real leaders on staging',
  $q$SELECT (count(*) > 0)::text FROM pg_temp.lideres_gdv_anterior()$q$,
  'true');
SELECT pg_temp.assert_eq('lider/colider rows: same rows as the previous definition (both directions)',
  $q$SELECT count(*) FROM (
       (SELECT persona_id, equipo_id, rol, desde FROM pg_temp.lideres_gdv_anterior()
        EXCEPT
        SELECT persona_id, equipo_id, rol, desde FROM public.dream_team_lideres_gdv() WHERE rol IN ('lider', 'colider'))
       UNION ALL
       (SELECT persona_id, equipo_id, rol, desde FROM public.dream_team_lideres_gdv() WHERE rol IN ('lider', 'colider')
        EXCEPT
        SELECT persona_id, equipo_id, rol, desde FROM pg_temp.lideres_gdv_anterior())
     ) d$q$,
  '0');
SELECT pg_temp.assert_eq('lider/colider rows: same count and same ordered fingerprint as the previous definition',
  $q$SELECT (
       (SELECT count(*) FROM pg_temp.lideres_gdv_anterior())
         = (SELECT count(*) FROM public.dream_team_lideres_gdv() WHERE rol IN ('lider', 'colider'))
       AND
       (SELECT md5(string_agg(persona_id::text || '|' || equipo_id::text || '|' || rol || '|' || coalesce(desde::text, ''),
                              ',' ORDER BY persona_id, equipo_id, rol, desde))
          FROM pg_temp.lideres_gdv_anterior())
       =
       (SELECT md5(string_agg(persona_id::text || '|' || equipo_id::text || '|' || rol || '|' || coalesce(desde::text, ''),
                              ',' ORDER BY persona_id, equipo_id, rol, desde))
          FROM public.dream_team_lideres_gdv() WHERE rol IN ('lider', 'colider'))
     )::text$q$,
  'true');

-- 3. Parity with dream_team_estructura_gdv(), both ways.
SELECT pg_temp.assert_eq('parity: every director_etapa equipo_id is a directores node of the structure',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_etapa'
        AND NOT EXISTS (SELECT 1 FROM public.dream_team_estructura_gdv() e
                         WHERE e.nodo_id = l.equipo_id AND e.tipo = 'directores')$q$,
  '0');
SELECT pg_temp.assert_eq('parity: every director_general equipo_id is a segmento node of the structure',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_general'
        AND NOT EXISTS (SELECT 1 FROM public.dream_team_estructura_gdv() e
                         WHERE e.nodo_id = l.equipo_id AND e.tipo = 'segmento')$q$,
  '0');
SELECT pg_temp.assert_eq('parity: every directores node of the structure has at least one director_etapa row',
  $q$SELECT count(*) FROM public.dream_team_estructura_gdv() e
      WHERE e.tipo = 'directores'
        AND NOT EXISTS (SELECT 1 FROM public.dream_team_lideres_gdv() l
                         WHERE l.equipo_id = e.nodo_id AND l.rol = 'director_etapa')$q$,
  '0');
SELECT pg_temp.assert_eq('parity: fixtures are present in the structure (guards a vacuous parity)',
  $q$SELECT count(*) FROM public.dream_team_estructura_gdv() e
      WHERE e.tipo = 'directores'
        AND e.nodo_id IN (SELECT l.equipo_id FROM public.dream_team_lideres_gdv() l
                           WHERE l.persona_id IN ('f1000000-0000-4000-8000-000000000023',
                                                  'f1000000-0000-4000-8000-000000000031',
                                                  'f1000000-0000-4000-8000-000000000033'))$q$,
  '3');

-- 4. Couples share one node; a lone director has his own; duplicates collapse.
SELECT pg_temp.assert_eq('couple C1 and C2 share ONE equipo_id, the couple node id',
  $q$SELECT string_agg(DISTINCT l.equipo_id::text, ',') FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_etapa'
        AND l.persona_id IN ('f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000032')$q$,
  md5('dream_team.gdv.directores:f1000000-0000-4000-8000-0000000000a2:f1000000-0000-4000-8000-000000000031:f1000000-0000-4000-8000-000000000032')::uuid::text);
SELECT pg_temp.assert_eq('couple: both spouses appear as two people',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_etapa'
        AND l.persona_id IN ('f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000032')$q$,
  '2');
SELECT pg_temp.assert_eq('DE2 (spouse is not a director) gets his own node, not the couple one',
  $q$SELECT string_agg(l.equipo_id::text, ',') FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_etapa' AND l.persona_id = 'f1000000-0000-4000-8000-000000000033'$q$,
  md5('dream_team.gdv.directores:f1000000-0000-4000-8000-0000000000a2:f1000000-0000-4000-8000-000000000033:')::uuid::text);
SELECT pg_temp.assert_eq('a person with two segmento_lideres rows in one segment yields ONE director_etapa row',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.rol = 'director_etapa' AND l.persona_id = 'f1000000-0000-4000-8000-000000000035'$q$,
  '1');

-- 5. Directors with no current groups still appear (no group fixtures exist,
--    asserted above).
SELECT pg_temp.assert_eq('directors with no current groups still appear',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv() l
      WHERE l.persona_id IN ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000023',
                             'f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000032',
                             'f1000000-0000-4000-8000-000000000033', 'f1000000-0000-4000-8000-000000000035')$q$,
  '7');

-- 6. Helper functions follow automatically for people who are ONLY directors.
SELECT pg_temp.assert_eq('resolver_nombres returns the name of a director general who is only that',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY['f1000000-0000-4000-8000-000000000021']::uuid[])
      WHERE nombre = 'ZZ Dir' AND apellido = 'DG1'$q$,
  '1');
SELECT pg_temp.assert_eq('resolver_nombres returns every director-only fixture person',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[
        'f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000023',
        'f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000032',
        'f1000000-0000-4000-8000-000000000033', 'f1000000-0000-4000-8000-000000000035']::uuid[])$q$,
  '6');
SELECT pg_temp.assert_eq('resolver_nombres does not leak a person who is neither director nor leader',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY['f1000000-0000-4000-8000-000000000034']::uuid[])$q$,
  '0');
SELECT pg_temp.assert_eq('contactos_personas: director general with phone and account',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY['f1000000-0000-4000-8000-000000000021']::uuid[])
      WHERE telefono = '04145550001' AND tiene_cuenta$q$,
  '1');
SELECT pg_temp.assert_eq('contactos_personas: director de etapa with phone and account',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY['f1000000-0000-4000-8000-000000000023']::uuid[])
      WHERE telefono = '04245550002' AND tiene_cuenta$q$,
  '1');
SELECT pg_temp.assert_eq('contactos_personas: director with phone and NO account',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY['f1000000-0000-4000-8000-000000000031']::uuid[])
      WHERE telefono = '04125550003' AND NOT tiene_cuenta$q$,
  '1');
SELECT pg_temp.assert_eq('contactos_personas: director with no phone and no account',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY['f1000000-0000-4000-8000-000000000032']::uuid[])
      WHERE telefono IS NULL AND NOT tiene_cuenta$q$,
  '1');
SELECT pg_temp.assert_eq('contactos_personas does not leak a person who is neither director nor leader',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY['f1000000-0000-4000-8000-000000000034']::uuid[])$q$,
  '0');
SELECT pg_temp.assert_eq('resolver_nombres and contactos_personas agree on every director fixture',
  $q$SELECT count(*) FROM (
       (SELECT id FROM public.dream_team_resolver_nombres(ARRAY[
          'f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000023',
          'f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000032',
          'f1000000-0000-4000-8000-000000000033', 'f1000000-0000-4000-8000-000000000035']::uuid[])
        EXCEPT
        SELECT id FROM public.dream_team_contactos_personas(ARRAY[
          'f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000023',
          'f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000032',
          'f1000000-0000-4000-8000-000000000033', 'f1000000-0000-4000-8000-000000000035']::uuid[]))
     ) d$q$,
  '0');
RESET ROLE;

-- 7. A caller without any Dream Team authority gets nothing -------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('f1000000-0000-4000-8000-000000000012');
SELECT pg_temp.assert_eq('member without capability: zero rows from dream_team_lideres_gdv()',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv()$q$,
  '0');
SELECT pg_temp.assert_eq('member without capability: no name for a director-only person',
  $q$SELECT count(*) FROM public.dream_team_resolver_nombres(ARRAY[
        'f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000023',
        'f1000000-0000-4000-8000-000000000031']::uuid[])$q$,
  '0');
SELECT pg_temp.assert_eq('member without capability: no contact for a director-only person',
  $q$SELECT count(*) FROM public.dream_team_contactos_personas(ARRAY[
        'f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000023',
        'f1000000-0000-4000-8000-000000000031']::uuid[])$q$,
  '0');
-- DE1 is a director de etapa with an account but holds no Dream Team capability.
SELECT pg_temp.as_persona('f1000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_eq('director de etapa DE1 (no capability): zero rows',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv()$q$,
  '0');
SELECT pg_temp.as_persona('f1000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_eq('director general DG1 (no capability): zero rows',
  $q$SELECT count(*) FROM public.dream_team_lideres_gdv()$q$,
  '0');
RESET ROLE;

-- 8. Shape and privileges ---------------------------------------------------

SELECT pg_temp.assert_eq('anon cannot execute dream_team_lideres_gdv',
  $q$SELECT has_function_privilege('anon', 'public.dream_team_lideres_gdv()', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('authenticated can execute dream_team_lideres_gdv',
  $q$SELECT has_function_privilege('authenticated', 'public.dream_team_lideres_gdv()', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('service_role can execute dream_team_lideres_gdv',
  $q$SELECT has_function_privilege('service_role', 'public.dream_team_lideres_gdv()', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('no PUBLIC grant in proacl',
  $q$SELECT (NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                          WHERE p.oid = 'public.dream_team_lideres_gdv()'::regprocedure AND a.grantee = 0))::text$q$,
  'true');
SELECT pg_temp.assert_eq('security definer with pinned search_path',
  $q$SELECT (p.prosecdef AND p.provolatile = 's' AND p.proconfig::text LIKE '%search_path=public%')::text
       FROM pg_proc p WHERE p.oid = 'public.dream_team_lideres_gdv()'::regprocedure$q$,
  'true');
SELECT pg_temp.assert_eq('return columns are unchanged: persona_id, equipo_id, rol, desde',
  $q$SELECT pg_get_function_result('public.dream_team_lideres_gdv()'::regprocedure)$q$,
  'TABLE(persona_id uuid, equipo_id uuid, rol text, desde timestamp with time zone)');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_dir_failures;

ROLLBACK;
