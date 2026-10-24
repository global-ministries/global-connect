-- T11 (odd/tasks/uno-a-uno.md) — supervision groups a couple who lead the same
-- thing into one row (migration 20261024180000_uno_a_uno_supervision_parejas.sql).
--
-- Covers:
--   S11.1 MA and MB, married and both Líder of the Matrimonios group GM, are one
--         row. HL (Líder of the Hombres group GH) and HW (his wife, Líder of the
--         Mujeres group GW) lead different things and stay two rows.
--   S11.2 The couple's row names both, counts the dirigidos once and each 1:1
--         once (a Matrimonios 1:1 has both on the leader side).
--   S11.4 `pareja` lists the people of each row; usuario_id is the first.
--
-- Run against STAGING inside BEGIN…ROLLBACK, as in the other uno-a-uno tests;
-- the last statement is a SELECT of the failing cases (0 = all ok).
--
-- Identities (usuario n = auth n, apellido = label):
--   1 HL  Líder of GH, married to 2 HW, Líder of GW
--   3 HM  Miembro of GH        4 WM  Miembro of GW
--   5 MA, 6 MB  married, both Líder of GM
--   7 MX, 8 MY  married, both Miembro of GM
--   9 ADM admin

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_u11_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_u11_labels (id uuid PRIMARY KEY, label text NOT NULL, auth_id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_u11_failures TO authenticated;
GRANT SELECT ON t_u11_labels TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_u11_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d3b10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' WHEN 'sg' THEN '8003'
                       WHEN 'gr' THEN '8005' WHEN 'te' THEN '8006' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM t_u11_labels WHERE label = p_label;
$$;

CREATE OR REPLACE FUNCTION pg_temp.u(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u11_labels WHERE label = p_label;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- `PEOPLE:dirigidos/realizados/agendados` of the fixture rows the session reads,
-- PEOPLE being the labels of `pareja` joined by '+'. plpgsql so the file loads
-- before the migration.
CREATE OR REPLACE FUNCTION pg_temp.filas_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT coalesce(string_agg(x.quienes || ':' || x.dirigidos || '/' || x.realizados || '/' || x.agendados, ', '
                             ORDER BY x.quienes COLLATE "C"), '')
    INTO v
    FROM (SELECT (SELECT string_agg(l.label, '+' ORDER BY l.label COLLATE "C")
                    FROM jsonb_array_elements(s.pareja) e JOIN t_u11_labels l ON l.id = (e ->> 'id')::uuid) AS quienes,
                 s.dirigidos, s.realizados, s.agendados
            FROM public.uno_a_uno_supervision_lideres() s
           WHERE s.usuario_id IN (SELECT id FROM t_u11_labels)) x;
  RETURN v;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Fixtures (as postgres) ----------------------------------------------------

INSERT INTO t_u11_labels (id, label, auth_id)
SELECT pg_temp.id('us', n::int), l, pg_temp.id('au', n::int)
  FROM unnest(ARRAY['HL', 'HW', 'HM', 'WM', 'MA', 'MB', 'MX', 'MY', 'ADM']) WITH ORDINALITY AS t(l, n);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'u11-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 9) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT l.id, pg_temp.id('au', n), 'ZZ U11', l.label, 'u11-' || n || '@example.test', 'Casado', 'Otro'
  FROM generate_series(1, 9) AS n
  JOIN t_u11_labels l ON l.id = pg_temp.id('us', n);

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  (pg_temp.id('us', 1), pg_temp.id('us', 2), 'conyuge'),
  (pg_temp.id('us', 5), pg_temp.id('us', 6), 'conyuge'),
  (pg_temp.id('us', 8), pg_temp.id('us', 7), 'conyuge');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u('ADM'), id FROM public.roles_sistema WHERE nombre_interno = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.segmentos (id, nombre) VALUES
  (pg_temp.id('sg', 1), 'ZZ U11 Hombres'),
  (pg_temp.id('sg', 2), 'ZZ U11 Mujeres'),
  (pg_temp.id('sg', 3), 'ZZ U11 Matrimonios');

INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  (pg_temp.id('te', 1), 'ZZ U11 activa', '2026-01-01', '2026-12-31', true, 'activa');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_aprobacion, eliminado) VALUES
  (pg_temp.id('gr', 1), 'ZZ U11 GH', pg_temp.id('te', 1), pg_temp.id('sg', 1), true, 'aprobado', false),
  (pg_temp.id('gr', 2), 'ZZ U11 GW', pg_temp.id('te', 1), pg_temp.id('sg', 2), true, 'aprobado', false),
  (pg_temp.id('gr', 3), 'ZZ U11 GM', pg_temp.id('te', 1), pg_temp.id('sg', 3), true, 'aprobado', false);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida, estado) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 1), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 3), 'Miembro', NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 2), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 4), 'Miembro', NULL, 'activo'),
  (pg_temp.id('gr', 3), pg_temp.id('us', 5), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 3), pg_temp.id('us', 6), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 3), pg_temp.id('us', 7), 'Miembro', NULL, 'activo'),
  (pg_temp.id('gr', 3), pg_temp.id('us', 8), 'Miembro', NULL, 'activo');

-- One Matrimonios 1:1 done yesterday (both leaders on the leader side) and one
-- scheduled ahead, made by MA.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(pg_temp.a('MA'));
SELECT public.uno_a_uno_registrar_sin_agenda(pg_temp.u('MX'), now() - interval '1 day', 'R');
SELECT public.uno_a_uno_agendar(pg_temp.u('MX'), now() + interval '3 days');

-- ── S11 as admin ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('S11.1/S11.2: the Matrimonios couple is one row with each 1:1 once; HL and HW stay apart',
  $q$SELECT pg_temp.filas_txt()$q$, 'HL:1/0/0, HW:1/0/0, MA+MB:2/1/1');
SELECT pg_temp.assert_eq('S11.4: the couple row is the first of them by name, with both in pareja',
  $q$SELECT string_agg(s.apellido || ':' || jsonb_array_length(s.pareja), ',' ORDER BY s.apellido)
       FROM public.uno_a_uno_supervision_lideres() s
      WHERE s.usuario_id IN (SELECT id FROM t_u11_labels)$q$, 'HL:1,HW:1,MA:2');
SELECT pg_temp.assert_eq('S11.2: the couple row keeps what they lead',
  $q$SELECT array_to_string(s.contextos, '|') FROM public.uno_a_uno_supervision_lideres() s
      WHERE s.usuario_id = pg_temp.u('MA')$q$, 'GDV: ZZ U11 GM');
RESET ROLE;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_u11_failures;

ROLLBACK;
