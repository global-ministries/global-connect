-- T8c-1 (odd/tasks/dps-asistencia-pco.md, L22, L23) — Global Music inside the
-- DPS plan and the seeded puestos (20261108203000_dps_planificacion_musica_puestos.sql).
--
-- Covers:
--   m1. dps_equipos() returns the Global Music subtree with its own ruta.
--   m2. a child of another experiencia under Global Music stays out.
--   m3. dps_raiz_musica is internal (authenticated cannot execute it).
--   m4. a Global Music servidor sees the plan (dps_puede_ver).
--   m5. a Global Music coordinator passes attendance in Global Music only.
--   m6. a puesto can be created in Global Music by a planner.
--   p1. the seeded puestos exist with their cantidad (29 rows on the real
--       DPS and Global Music tree). The six «Director de …» rows on the DPS
--       root were retired by 20261108204000_dps_directores_automaticos.sql
--       (S8: one director puesto per dirección replaces them), so p1 no
--       longer counts them; dps-planificacion-directores.test.sql a7 checks
--       that none is left active without convocados. Since
--       20261109200000_dps_listas_posicion.sql (S12.1) «Líder de alabanza»
--       and the four instruments live in the Global Music sub-equipos
--       Cantantes, Piano, Bajo, Batería and Guitarra eléctrica (the same
--       rows, moved), so p1 reads them there.
--
-- Run against STAGING inside a transaction that is discarded; the last
-- statement raises SUITE_RESULT with the failures or ALL OK.

BEGIN;
SET LOCAL search_path TO pg_temp, public;
SET LOCAL check_function_bodies = off;
CREATE TEMP TABLE t_dm_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dm_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dm_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;
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
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dm_ctx WHERE k = p_k;
$$;
CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9700000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd971' WHEN 'us' THEN 'd972' WHEN 'eq' THEN 'd973'
                       WHEN 'ro' THEN 'd974' WHEN 'se' THEN 'd975' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

INSERT INTO t_dm_ctx (k, v)
SELECT 'musica', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'Global Music' AND d.experiencia = 'global_music' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;

INSERT INTO t_dm_ctx (k, v) SELECT 'dps', public.dps_raiz()::text;

-- p1 runs before any fixture so it sees only the real tree.
SELECT pg_temp.assert_eq('p1: the 29 seeded puestos below the DPS root and in Global Music exist with their cantidad',
  $q$SELECT count(*) || '|' || sum(p.cantidad)
       FROM public.dps_puestos p JOIN public.dps_equipos() d ON d.equipo_id = p.equipo_id
      WHERE p.activo AND (d.ruta, p.nombre) IN (
        ('DPS › Producción Técnica › Audio', 'Coordinador de audio'), ('DPS › Producción Técnica › Audio', 'FOH'),
        ('DPS › Producción Técnica › Audio', 'Asistente de FOH'), ('DPS › Producción Técnica › Audio', 'Líder de tarima'),
        ('DPS › Producción Técnica › Audio', 'Backstage'),
        ('DPS › Producción Técnica › Iluminación', 'Coordinador de iluminación'), ('DPS › Producción Técnica › Iluminación', 'Operador de luces'),
        ('DPS › Producción Técnica › Iluminación', 'Asistente de iluminación'), ('DPS › Producción Técnica › Iluminación', 'Breakera'),
        ('DPS › Producción Técnica › Video › Cámaras', 'Director de cámaras'), ('DPS › Producción Técnica › Video › Cámaras', 'Cámaras'),
        ('DPS › Producción Técnica › Video › Mesa de video', 'Coordinador de video'), ('DPS › Producción Técnica › Video › Mesa de video', 'Master'),
        ('DPS › Producción Técnica › Video › Mesa de video', 'Generador de caracteres'), ('DPS › Producción Técnica › Video › Mesa de video', 'Teleprompter'),
        ('DPS › Producción Técnica › Técnicos', 'Coordinador técnico'), ('DPS › Producción Técnica › Técnicos', 'Técnicos'),
        ('DPS › Producción Creativa', 'Productor'), ('DPS › Producción Creativa', 'Asistente de producción'),
        ('DPS › Producción Creativa', 'Comunicador de bienvenida'), ('DPS › Producción Creativa', 'Comunicador de mensaje'),
        ('DPS › Producción Creativa', 'Opening'),
        ('Global Music › Cantantes', 'Líder de alabanza'), ('Global Music', 'Líder de banda'), ('Global Music › Piano', 'Piano'),
        ('Global Music › Bajo', 'Bajo'), ('Global Music › Batería', 'Batería'),
        ('Global Music › Guitarra eléctrica', 'Guitarra eléctrica'), ('Global Music', 'Asistente técnico'))$q$,
  '29|35');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dm-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Dm', 'U' || n, 'dm-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9700000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'global_music', pg_temp.ctx('musica')::uuid, 'ZZ Dm Coro',  true),
  (pg_temp.id('eq', 2), 'dps',          pg_temp.ctx('musica')::uuid, 'ZZ Dm Ajeno', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'Voluntario', 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 3), pg_temp.id('us', 3), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo', now() - interval '30 days', 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 4) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 2), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.ctx('musica'), 'zz-test'),
  (pg_temp.id('us', 3), 'dream_team.serve',      'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test');
GRANT INSERT, SELECT, UPDATE ON t_dm_failures, t_dm_ctx TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

SELECT pg_temp.assert_eq('m1: Global Music and its child are DPS planning equipos',
  $q$SELECT string_agg(d.ruta, ',' ORDER BY d.ruta) FROM public.dps_equipos() d
      WHERE d.equipo_id IN (pg_temp.ctx('musica')::uuid, pg_temp.id('eq', 1))$q$, 'Global Music,Global Music › ZZ Dm Coro');
SELECT pg_temp.assert_eq('m2: a child of another experiencia under Global Music stays out',
  $q$SELECT count(*)::text FROM public.dps_equipos() d WHERE d.equipo_id = pg_temp.id('eq', 2)$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('m3: authenticated cannot execute dps_raiz_musica', $q$SELECT public.dps_raiz_musica()$q$, '42501');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('m4: a Global Music servidor sees the plan, does not plan',
  $q$SELECT public.dps_puede_ver() || '|' || public.dps_puede_planificar()$q$, 'true|false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('m5: the Global Music coordinator passes attendance there, not in DPS',
  $q$SELECT public.dps_puede_pasar_asistencia(pg_temp.ctx('musica')::uuid) || '|'
            || public.dps_puede_pasar_asistencia(pg_temp.id('eq', 1)) || '|'
            || public.dps_puede_pasar_asistencia(pg_temp.ctx('dps')::uuid)$q$,
  'true|true|false');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('m6: a planner creates a puesto in a Global Music equipo',
  $q$SELECT (public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'Coro', 6, NULL) IS NOT NULL)::text$q$, 'true');
RESET ROLE;

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dm_failures);
END;
$$;
