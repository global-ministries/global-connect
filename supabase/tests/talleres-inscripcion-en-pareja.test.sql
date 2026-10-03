-- P1 (odd/tasks/talleres-inscripcion-en-pareja.md) — RED→GREEN for the
-- couple self-enrollment base (migration
-- 20261003160000_talleres_inscripcion_en_pareja.sql): the one-appearance
-- trigger, CHECK companero <> principal, the partial unique index,
-- acciones_limitadas + consumir_limite_accion, talleres_mi_conyuge_registrado,
-- talleres_buscar_pareja_por_cedula, talleres_inscribirme and the
-- staff-only taller_inscripciones_insert policy. Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id lives under this
-- file's own bb000000-... namespace and every fixture cédula starts with
-- 999 (none exists on staging).
--
-- Every reference to an object the migration adds goes through dynamic SQL
-- inside a pg_temp assertion, so the RED run (migration NOT applied)
-- reaches pg_temp.report() and lists every failing case instead of
-- aborting on the first missing object. report() returns 'all N cases ok'
-- or raises with the failing cases.
--
-- Nodes: dirección D (bb…01) > one node per taller (bb…02..05; a taller
--   owns its node exclusively). Every cohorte sits on bb…02, under D.
-- Talleres: T_ind (bb…10, individual), T_null (bb…11, pareja, vinculo
--   NULL), T_mat (bb…12, pareja, matrimonio), T_nov (bb…13, pareja, novios).
-- Ediciones (abierto unless noted; cohorte = bb…c<n> for edición bb…9<n>):
--   E_ind bb…90 (T_ind)        E_borr  bb…94 (T_ind, borrador)
--   E_null bb…91 (T_null)      E_canc  bb…95 (T_ind, cancelado)
--   E_mat bb…92 (T_mat, its own link_type NULL: falls back to
--     talleres.vinculo)
--   E_nov bb…93 (T_nov)        E_curso bb…96 (T_ind, en_curso by dates)
--   E_cupo bb…97 (T_ind, one grupo of capacidad 1, already occupied)
--   E_link bb…98 (T_null, link_type matrimonio: the edición sets it)
--   E_difiere bb…99 (T_mat, link_type novios: the edición wins)
-- Effective vínculo = coalesce(taller_ediciones.link_type,
--   talleres.vinculo); p_pareja.vinculo only when both are NULL.
--
-- Identities (auth → usuario):
--   director    bb…20 → bb…21  director.write/read on D
--   coordinador bb…22 → bb…23  coordinator.write/read on D
--   M1 bb…a1 → bb…41  conyuge relation M1 → S1 (usuario1 = M1)
--   S1 bb…a2 → bb…42  sees M1 through the reverse direction
--   M2 bb…a3 → bb…43  no relation
--   M3 bb…a4 → bb…44  two relations (M3 → X1, X2 → M3)
--   M4 bb…a5 → bb…45  cédula 99900005 (lookups, cédula enrollment)
--   M5 bb…a6 → bb…46  throttle
--   M6 bb…a7 → bb…47  conyuge relation M6 → S6 (S6 already in E_mat)
--   M7 bb…a8 → bb…48  cédula 99900008 (cédula-mode refusals)
--   bb…ff: a session with no ficha.
-- Persons without account: X1 bb…4a, X2 bb…4b, S6 bb…4c;
--   P_adult    bb…51 'María' 'González Pérez' 99900001
--   P_minor    bb…52 99900002, born 10 years ago
--   P_placeh   bb…53 'Pla' 'zeta' 99900003, born 1900-01-01 (placeholder)
--   P_inscrito bb…54 'Ins' 'Crito' 99900004, active companero in E_null
--   P_rechaz   bb…55 'Rech' 'Azado' 99900006, no_aprobado principal in E_null
--   P_ext      bb…56 'Ext' 'Ñuñez' E99900007
--   Q1..Q9     bb…57..5f (staff paths and fixture partners)
--
-- Covered:
--   1. Structure: new columns and CHECKs, partial unique index (old
--      constraint gone), trigger, every new function definer with
--      search_path=public, grants (anon none, authenticated only the three
--      RPCs, service_role all), acciones_limitadas RLS on and no grants to
--      anon/authenticated, columns hold no cédula, policy WITH CHECK is the
--      three staff branches only.
--   2. anon executes nothing (each RPC raises 42501) and reads nothing.
--   3. A session without a ficha gets 42501 SIN_FICHA on the three RPCs.
--   4. talleres_mi_conyuge_registrado: 1 row both directions, 0 rows with
--      0 or 2 relations; only nombre/apellido/foto.
--   5. Lookup: "Nombre I." for an exact (normalized) cédula; neutral
--      encontrada:false for unknown, self, minor, already active; allowed
--      for the 1900-01-01 placeholder and a no_aprobado row; CEDULA_INVALIDA
--      and EDICION_NOT_FOUND consume nothing; each valid lookup consumes one.
--   6. Throttle: 10 per 24 h, the 11th and the cédula enrollment return
--      LIMITE_ALCANZADO, refusals record nothing, backdated rows free the
--      slot, the helper is not callable by authenticated.
--   7. Individual edición: a member's direct INSERT is refused; RPC OK
--      shape and row; YA_INSCRITO; EDICION_NO_ABIERTA; EDICION_NOT_FOUND
--      (unknown, borrador, cancelado); CUPO_LLENO returned; COMPANERO_NO_APLICA;
--      re-enrolling after no_aprobado is allowed; putting the rejected row
--      back to pendiente raises PERSONA_YA_EN_EDICION.
--   8. Pareja input rules: COMPANERO_REQUERIDO, MODO_INVALIDO,
--      VINCULO_REQUERIDO, MODO_NO_APLICA, CEDULA_INVALIDA (no throttle used).
--   9. Registered spouse: PAREJA_NO_CONFIRMADA (0 and 2 relations),
--      PAREJA_NO_DISPONIBLE, OK with the taller's vínculo winning, the
--      reverse direction, YA_INSCRITO for the partner.
--  10. Cédula mode: PAREJA_NO_CONFIRMADA for unknown/self/minor/already
--      active (never PAREJA_NO_DISPONIBLE), throttle rows kept; OK with
--      p_pareja.vinculo when the taller has none; re-enrolling a person
--      whose row is no_aprobado; conyuge_registrado_descartado only when a
--      registered spouse exists and differs.
--  10b. Effective vínculo: an edición link_type with a NULL taller vinculo
--      needs no p_pareja.vinculo (and ignores one); an edición link_type
--      that differs from its taller's wins (conyuge_registrado on a novios
--      edición of a matrimonio taller raises MODO_NO_APLICA).
--  11. Staff: director and coordinador direct INSERT, sobre-cupo RPC (full
--      and not full) still work; PERSONA_YA_EN_EDICION for the reversed
--      couple, a person already companero, a principal already active;
--      CHECK companero <> principal.
--  12. acciones_limitadas is unreadable and unwritable by authenticated.
--
-- The MCP connection is `postgres` (BYPASSRLS) — every authority assertion
-- runs under SET LOCAL ROLE authenticated/anon + jwt claims; data
-- assertions run as postgres.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pr_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pr_result (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_pr_failures, t_pr_cases, t_pr_result TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pr_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Each helper records its case OUTSIDE the inner block, so a caught
-- exception does not roll the count back.
CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_pr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate OR SQLERRM IS DISTINCT FROM p_expected_message THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(p_case text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_pr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_pr_cases VALUES (p_case);
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
    IF v_n IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_pr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_update_rows(p_case text, p_update_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_pr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_update_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s) affected, got ' || v_n);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Runs p_sql (one jsonb value), keeps it under p_key and, when p_expected
-- is given, compares it.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text, p_expected jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  INSERT INTO t_pr_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_pr_result (key, j) VALUES (p_key, v);
    IF p_expected IS NOT NULL AND v IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected::text || ', got ' || coalesce(v::text, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_total int;
  v_msg text;
BEGIN
  SELECT count(*) INTO v_total FROM t_pr_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_pr_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s) of %:\n%', v_n, v_total, v_msg;
  END IF;
  RETURN 'all ' || v_total || ' cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- New functions no longer get EXECUTE for anon/authenticated by default
-- (definer_sin_anon), and the helpers run under those roles.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.f);
  END LOOP;
END
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('bb000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ PAR Direccion', NULL, true),
  ('bb000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ PAR Nodo Individual', 'bb000000-0000-4000-8000-000000000001', true),
  ('bb000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ PAR Nodo Pareja Libre', 'bb000000-0000-4000-8000-000000000001', true),
  ('bb000000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ PAR Nodo Matrimonio', 'bb000000-0000-4000-8000-000000000001', true),
  ('bb000000-0000-4000-8000-000000000005', 'talleres_crecimiento', 'ZZ PAR Nodo Novios', 'bb000000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('bb000000-0000-4000-8000-000000000010', 'zz-par-individual', 'ZZ PAR Individual', 'bb000000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, 0),
  ('bb000000-0000-4000-8000-000000000011', 'zz-par-pareja-libre', 'ZZ PAR Pareja Libre', 'bb000000-0000-4000-8000-000000000003', 'pareja', NULL, 'cadencia', 7, 0),
  ('bb000000-0000-4000-8000-000000000012', 'zz-par-matrimonio', 'ZZ PAR Matrimonio', 'bb000000-0000-4000-8000-000000000004', 'pareja', 'matrimonio', 'cadencia', 7, 0),
  ('bb000000-0000-4000-8000-000000000013', 'zz-par-novios', 'ZZ PAR Novios', 'bb000000-0000-4000-8000-000000000005', 'pareja', 'novios', 'cadencia', 7, 0);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('bb000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'par-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'par-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'par-m1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'par-s1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'par-m2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'par-m3@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a5', 'authenticated', 'authenticated', 'par-m4@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a6', 'authenticated', 'authenticated', 'par-m5@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a7', 'authenticated', 'authenticated', 'par-m6@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4000-8000-0000000000a8', 'authenticated', 'authenticated', 'par-m7@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, cedula, fecha_nacimiento, foto_perfil_url, estado_civil, genero) VALUES
  ('bb000000-0000-4000-8000-000000000021', 'bb000000-0000-4000-8000-000000000020', 'ZZPAR', 'Director', 'par-director@example.test', NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000023', 'bb000000-0000-4000-8000-000000000022', 'ZZPAR', 'Coordinador', 'par-coordinador@example.test', NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000041', 'bb000000-0000-4000-8000-0000000000a1', 'Mario', 'ZZPAR Uno', 'par-m1@example.test', NULL, NULL, 'https://example.test/mario.jpg', 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-000000000042', 'bb000000-0000-4000-8000-0000000000a2', 'Sara', 'ZZPAR Conyuge', 'par-s1@example.test', NULL, NULL, 'https://example.test/sara.jpg', 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-000000000043', 'bb000000-0000-4000-8000-0000000000a3', 'ZZPAR', 'Dos', 'par-m2@example.test', NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000044', 'bb000000-0000-4000-8000-0000000000a4', 'ZZPAR', 'Tres', 'par-m3@example.test', NULL, NULL, NULL, 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-000000000045', 'bb000000-0000-4000-8000-0000000000a5', 'ZZPAR', 'Cuatro', 'par-m4@example.test', '99900005', NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000046', 'bb000000-0000-4000-8000-0000000000a6', 'ZZPAR', 'Cinco', 'par-m5@example.test', NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000047', 'bb000000-0000-4000-8000-0000000000a7', 'ZZPAR', 'Seis', 'par-m6@example.test', NULL, NULL, NULL, 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-000000000048', 'bb000000-0000-4000-8000-0000000000a8', 'ZZPAR', 'Siete', 'par-m7@example.test', '99900008', NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-00000000004a', NULL, 'ZZPAR', 'X1', NULL, NULL, NULL, NULL, 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-00000000004b', NULL, 'ZZPAR', 'X2', NULL, NULL, NULL, NULL, 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-00000000004c', NULL, 'ZZPAR', 'S6', NULL, NULL, NULL, NULL, 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-000000000051', NULL, 'María', 'González Pérez', NULL, '99900001', NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000052', NULL, 'Menor', 'Joven', NULL, '99900002', CURRENT_DATE - interval '10 years', NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000053', NULL, 'Pla', 'zeta', NULL, '99900003', DATE '1900-01-01', NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000054', NULL, 'Ins', 'Crito', NULL, '99900004', NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000055', NULL, 'Rech', 'Azado', NULL, '99900006', NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000056', NULL, 'Ext', 'Ñuñez', NULL, 'E99900007', NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000057', NULL, 'ZZPAR', 'Q1', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000058', NULL, 'ZZPAR', 'Q2', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-000000000059', NULL, 'ZZPAR', 'Q3', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-00000000005a', NULL, 'ZZPAR', 'Q4', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-00000000005b', NULL, 'ZZPAR', 'Q5', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-00000000005c', NULL, 'ZZPAR', 'Q6', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-00000000005d', NULL, 'ZZPAR', 'Q7', NULL, NULL, NULL, NULL, 'Casado', 'Otro'),
  ('bb000000-0000-4000-8000-00000000005e', NULL, 'ZZPAR', 'Q8', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('bb000000-0000-4000-8000-00000000005f', NULL, 'ZZPAR', 'Q9', NULL, NULL, NULL, NULL, 'Casado', 'Otro');

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('bb000000-0000-4000-8000-000000000041', 'bb000000-0000-4000-8000-000000000042', 'conyuge'),
  ('bb000000-0000-4000-8000-000000000044', 'bb000000-0000-4000-8000-00000000004a', 'conyuge'),
  ('bb000000-0000-4000-8000-00000000004b', 'bb000000-0000-4000-8000-000000000044', 'conyuge'),
  ('bb000000-0000-4000-8000-000000000047', 'bb000000-0000-4000-8000-00000000004c', 'conyuge');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('bb000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'bb000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'bb000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'bb000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.read',  'talleres_crecimiento', 'taller', 'bb000000-0000-4000-8000-000000000001');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('bb000000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ PAR Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 9) AS n;

-- abierto: hoy < cierre (in 20 days); en_curso: cierre passed, inside
-- inicio..fin. Margins no time zone can cross.
INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('bb000000-0000-4000-8000-000000000090', 'bb000000-0000-4000-8000-000000000080', 'bb000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ PAR E_ind', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('bb000000-0000-4000-8000-000000000091', 'bb000000-0000-4000-8000-000000000081', 'bb000000-0000-4000-8000-000000000011',
   'pareja', NULL, 'permanente_custom', 'abierto', 'ZZ PAR E_null', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('bb000000-0000-4000-8000-000000000092', 'bb000000-0000-4000-8000-000000000082', 'bb000000-0000-4000-8000-000000000012',
   'pareja', NULL, 'permanente_custom', 'abierto', 'ZZ PAR E_mat', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('bb000000-0000-4000-8000-000000000093', 'bb000000-0000-4000-8000-000000000083', 'bb000000-0000-4000-8000-000000000013',
   'pareja', 'novios', 'permanente_custom', 'abierto', 'ZZ PAR E_nov', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('bb000000-0000-4000-8000-000000000094', 'bb000000-0000-4000-8000-000000000084', 'bb000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'borrador', 'ZZ PAR E_borr', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('bb000000-0000-4000-8000-000000000095', 'bb000000-0000-4000-8000-000000000085', 'bb000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'cancelado', 'ZZ PAR E_canc', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('bb000000-0000-4000-8000-000000000096', 'bb000000-0000-4000-8000-000000000086', 'bb000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'en_curso', 'ZZ PAR E_curso', 4, 60, 'permanente_custom', CURRENT_DATE - 10, CURRENT_DATE - 10, CURRENT_DATE + 30),
  ('bb000000-0000-4000-8000-000000000097', 'bb000000-0000-4000-8000-000000000087', 'bb000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ PAR E_cupo', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  -- link_type set on the edición, talleres.vinculo NULL.
  ('bb000000-0000-4000-8000-000000000098', 'bb000000-0000-4000-8000-000000000088', 'bb000000-0000-4000-8000-000000000011',
   'pareja', 'matrimonio', 'permanente_custom', 'abierto', 'ZZ PAR E_link', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  -- link_type novios on the edición, talleres.vinculo matrimonio.
  ('bb000000-0000-4000-8000-000000000099', 'bb000000-0000-4000-8000-000000000089', 'bb000000-0000-4000-8000-000000000012',
   'pareja', 'novios', 'permanente_custom', 'abierto', 'ZZ PAR E_difiere', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT ('bb000000-0000-4000-8000-0000000000c' || n)::uuid, ('bb000000-0000-4000-8000-00000000009' || n)::uuid,
       'bb000000-0000-4000-8000-000000000002', 'ZZ PAR Cohorte ' || n, (CURRENT_DATE + 30)::timestamptz
  FROM generate_series(0, 9) AS n;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('bb000000-0000-4000-8000-000000000040', 'bb000000-0000-4000-8000-0000000000c7', 'ZZ PAR Grupo Cupo', 1, 'activo');

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado, motivo_no_aprobado) VALUES
  -- E_null: P_inscrito is the active companero of Q7.
  ('bb000000-0000-4000-8000-000000000060', 'bb000000-0000-4000-8000-000000000091', 'bb000000-0000-4000-8000-0000000000c1',
   'bb000000-0000-4000-8000-00000000005d', 'bb000000-0000-4000-8000-000000000054', 'matrimonio', 'pendiente', NULL),
  -- E_null: P_rechazado's rejected row (does not count as active).
  ('bb000000-0000-4000-8000-000000000061', 'bb000000-0000-4000-8000-000000000091', 'bb000000-0000-4000-8000-0000000000c1',
   'bb000000-0000-4000-8000-000000000055', 'bb000000-0000-4000-8000-00000000005e', 'novios', 'no_aprobado', 'ZZ PAR rechazo'),
  -- E_mat: S6 (M6's registered spouse) is already active.
  ('bb000000-0000-4000-8000-000000000062', 'bb000000-0000-4000-8000-000000000092', 'bb000000-0000-4000-8000-0000000000c2',
   'bb000000-0000-4000-8000-00000000004c', 'bb000000-0000-4000-8000-00000000005f', 'matrimonio', 'pendiente', NULL),
  -- E_cupo: its only seat is taken.
  ('bb000000-0000-4000-8000-000000000063', 'bb000000-0000-4000-8000-000000000097', 'bb000000-0000-4000-8000-0000000000c7',
   'bb000000-0000-4000-8000-00000000005c', NULL, NULL, 'pendiente', NULL);

-- ══ 1. Structure ══

SELECT pg_temp.assert_rows('1: pareja_origen text NULL and conyuge_registrado_descartado boolean NOT NULL DEFAULT false exist',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'taller_inscripciones'
       AND ((column_name = 'pareja_origen' AND data_type = 'text' AND is_nullable = 'YES')
         OR (column_name = 'conyuge_registrado_descartado' AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false'))$$, 2);
SELECT pg_temp.assert_sqlstate('1: pareja_origen refuses a value outside conyuge_registrado/cedula',
  $$UPDATE public.taller_inscripciones SET pareja_origen = 'ficha_nueva' WHERE id = 'bb000000-0000-4000-8000-000000000060'$$, '23514');
SELECT pg_temp.assert_rows('1: CHECK taller_inscripciones_companero_distinto exists',
  $$SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.taller_inscripciones'::regclass AND conname = 'taller_inscripciones_companero_distinto'
       AND pg_get_constraintdef(oid) = 'CHECK (((companero_id IS NULL) OR (companero_id <> persona_principal_id)))'$$, 1);
SELECT pg_temp.assert_rows('1: the full UNIQUE (taller_id, cohorte_id, persona_principal_id) is gone, a partial one over active rows replaces it',
  $$SELECT 1
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taller_inscripciones_uniq_taller_cohorte_persona')
       AND EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public' AND indexname = 'taller_inscripciones_uniq_taller_cohorte_persona_activa'
                      AND indexdef LIKE 'CREATE UNIQUE INDEX % (taller_id, cohorte_id, persona_principal_id) WHERE (estado <> ALL (ARRAY[''no_aprobado''::text, ''retirado''::text]))')$$, 1);
SELECT pg_temp.assert_rows('1: the one-appearance trigger fires BEFORE INSERT OR UPDATE OF persona_principal_id, companero_id, taller_id, estado',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.taller_inscripciones'::regclass AND tgname = 'trg_taller_inscripciones_una_aparicion'
       AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF persona_principal_id, companero_id, taller_id, estado ON public.taller_inscripciones FOR EACH ROW EXECUTE FUNCTION talleres_inscripciones_una_aparicion()'$$, 1);

CREATE TEMP TABLE t_pr_fn (sig text, publica boolean) ON COMMIT DROP;
INSERT INTO t_pr_fn VALUES
  ('public.talleres_mi_conyuge_registrado()', true),
  ('public.talleres_buscar_pareja_por_cedula(uuid,text)', true),
  ('public.talleres_inscribirme(uuid,jsonb)', true),
  ('public.talleres_inscripciones_una_aparicion()', false),
  ('public.consumir_limite_accion(uuid,text,integer,interval)', false),
  ('public.talleres_conyuge_unico(uuid)', false),
  ('public.talleres_cedula_pareja_normalizada(text)', false),
  ('public.talleres_persona_activa_en_edicion(uuid,uuid)', false),
  ('public.talleres_pareja_por_cedula(uuid,uuid,text)', false);
GRANT SELECT ON t_pr_fn TO authenticated, anon;

SELECT pg_temp.assert_rows('1: the nine new functions are definers with search_path=public',
  $$SELECT 1 FROM t_pr_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE p.prosecdef AND p.proconfig @> ARRAY['search_path=public']$$, 9);
SELECT pg_temp.assert_rows('1: anon executes none of them and no PUBLIC ACL entry remains',
  $$SELECT 1 FROM t_pr_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE NOT has_function_privilege('anon', p.oid, 'execute')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)$$, 9);
SELECT pg_temp.assert_rows('1: authenticated executes exactly the three RPCs',
  $$SELECT 1 FROM t_pr_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE has_function_privilege('authenticated', p.oid, 'execute') = f.publica$$, 9);
SELECT pg_temp.assert_rows('1: service_role executes all nine',
  $$SELECT 1 FROM t_pr_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE has_function_privilege('service_role', p.oid, 'execute')$$, 9);
SELECT pg_temp.assert_rows('1: talleres_mi_conyuge_registrado returns only nombre, apellido, foto_perfil_url',
  $$SELECT 1 WHERE pg_get_function_result('public.talleres_mi_conyuge_registrado()'::regprocedure)
                 = 'TABLE(nombre text, apellido text, foto_perfil_url text)'$$, 1);
SELECT pg_temp.assert_rows('1: talleres_inscribirme defaults p_pareja to NULL',
  $$SELECT 1 WHERE pg_get_function_arguments('public.talleres_inscribirme(uuid,jsonb)'::regprocedure)
                 = 'p_edicion_id uuid, p_pareja jsonb DEFAULT NULL::jsonb'$$, 1);

SELECT pg_temp.assert_rows('1: acciones_limitadas has RLS on and no privilege for anon or authenticated',
  $$SELECT 1 FROM pg_class c
     WHERE c.oid = 'public.acciones_limitadas'::regclass AND c.relrowsecurity
       AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       AND NOT has_sequence_privilege('authenticated', 'public.acciones_limitadas_id_seq', 'USAGE,SELECT,UPDATE')$$, 1);
SELECT pg_temp.assert_rows('1: acciones_limitadas holds only id, actor_id, accion, created_at (no searched value)',
  $$SELECT 1 WHERE (SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position) FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'acciones_limitadas') = 'id,actor_id,accion,created_at'$$, 1);
SELECT pg_temp.assert_sqlstate('1: accion refuses a value with digits (a cédula can never be stored)',
  $$INSERT INTO public.acciones_limitadas (actor_id, accion) VALUES ('bb000000-0000-4000-8000-000000000045', '99900001')$$, '23514');
SELECT pg_temp.assert_rows('1: acciones_limitadas is indexed on (actor_id, accion, created_at DESC)',
  $$SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'acciones_limitadas'
     AND indexdef LIKE '%(actor_id, accion, created_at DESC)'$$, 1);

SELECT pg_temp.assert_rows('1: taller_inscripciones_insert keeps exactly the three staff branches (self branch removed)',
  $$SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.taller_inscripciones'::regclass AND polname = 'taller_inscripciones_insert'
       AND pg_get_expr(polwithcheck, polrelid) =
         '(auth_has_talleres_capability_scoped(''talleres_crecimiento.coordinator.write''::text, talleres_equipo_de_cohorte(cohorte_id)) OR auth_has_talleres_capability_scoped(''talleres_crecimiento.director.write''::text, talleres_equipo_de_cohorte(cohorte_id)) OR auth_has_talleres_capability_scoped(''talleres_crecimiento.admin.manage''::text, talleres_equipo_de_cohorte(cohorte_id)))'$$, 1);

-- ══ 2. anon ══

RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_sqlstate('2: anon cannot call talleres_mi_conyuge_registrado',
  $$SELECT * FROM public.talleres_mi_conyuge_registrado()$$, '42501');
SELECT pg_temp.assert_sqlstate('2: anon cannot call talleres_buscar_pareja_por_cedula',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900001')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: anon cannot call talleres_inscribirme',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000090')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: anon cannot read acciones_limitadas',
  $$SELECT count(*) FROM public.acciones_limitadas$$, '42501');
RESET ROLE;

-- ══ 3. A session without a ficha ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000ff');
SELECT pg_temp.assert_sqlstate_msg('3: no ficha -> talleres_mi_conyuge_registrado raises 42501 SIN_FICHA',
  $$SELECT * FROM public.talleres_mi_conyuge_registrado()$$, '42501', 'SIN_FICHA');
SELECT pg_temp.assert_sqlstate_msg('3: no ficha -> talleres_buscar_pareja_por_cedula raises 42501 SIN_FICHA',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900001')$$, '42501', 'SIN_FICHA');
SELECT pg_temp.assert_sqlstate_msg('3: no ficha -> talleres_inscribirme raises 42501 SIN_FICHA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000090')$$, '42501', 'SIN_FICHA');

-- ══ 4. talleres_mi_conyuge_registrado ══

SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('4: M1 (relation stored M1 -> S1) sees exactly S1''s name and photo', 'conyuge_m1',
  $$SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.talleres_mi_conyuge_registrado() r$$,
  '[{"nombre":"Sara","apellido":"ZZPAR Conyuge","foto_perfil_url":"https://example.test/sara.jpg"}]'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('4: S1 (the same relation, other direction) sees exactly M1', 'conyuge_s1',
  $$SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.talleres_mi_conyuge_registrado() r$$,
  '[{"nombre":"Mario","apellido":"ZZPAR Uno","foto_perfil_url":"https://example.test/mario.jpg"}]'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.capture('4: M2 (no relation) gets 0 rows', 'conyuge_m2',
  $$SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.talleres_mi_conyuge_registrado() r$$, '[]'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a4');
SELECT pg_temp.capture('4: M3 (two relations, one per direction) gets 0 rows', 'conyuge_m3',
  $$SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.talleres_mi_conyuge_registrado() r$$, '[]'::jsonb);

-- ══ 5. Lookup by cédula (M4, 99900005) ══

SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a5');
SELECT pg_temp.capture('5: an exact cédula typed with V-, dots and dashes shows "Nombre I."', 'buscar_maria',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', 'V-99.900.001')$$,
  '{"ok":true,"encontrada":true,"nombre_mostrado":"María G."}'::jsonb);
SELECT pg_temp.capture('5: a minor reads as not found', 'buscar_menor',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900002')$$,
  '{"ok":true,"encontrada":false}'::jsonb);
SELECT pg_temp.capture('5: the 1900-01-01 signup placeholder is an unknown birth date and is allowed', 'buscar_placeholder',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900003')$$,
  '{"ok":true,"encontrada":true,"nombre_mostrado":"Pla Z."}'::jsonb);
SELECT pg_temp.capture('5: someone already active in the edición reads as not found', 'buscar_inscrito_null',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900004')$$,
  '{"ok":true,"encontrada":false}'::jsonb);
SELECT pg_temp.capture('5: the same person is found for another edición', 'buscar_inscrito_nov',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000093', '99900004')$$,
  '{"ok":true,"encontrada":true,"nombre_mostrado":"Ins C."}'::jsonb);
SELECT pg_temp.capture('5: the caller''s own cédula reads as not found', 'buscar_self',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900005')$$,
  '{"ok":true,"encontrada":false}'::jsonb);
SELECT pg_temp.capture('5: an unknown cédula reads as not found', 'buscar_unknown',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900099')$$,
  '{"ok":true,"encontrada":false}'::jsonb);
SELECT pg_temp.capture('5: a foreign cédula typed in lowercase with separators is found', 'buscar_ext',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', 'e-99.900.007')$$,
  '{"ok":true,"encontrada":true,"nombre_mostrado":"Ext Ñ."}'::jsonb);
SELECT pg_temp.capture('5: a no_aprobado row does not count as being in the edición', 'buscar_rechazado',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '99900006')$$,
  '{"ok":true,"encontrada":true,"nombre_mostrado":"Rech A."}'::jsonb);
SELECT pg_temp.assert_sqlstate_msg('5: letters raise 22023 CEDULA_INVALIDA',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', 'abc')$$, '22023', 'CEDULA_INVALIDA');
SELECT pg_temp.assert_sqlstate_msg('5: too few digits raise 22023 CEDULA_INVALIDA',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', '12345')$$, '22023', 'CEDULA_INVALIDA');
SELECT pg_temp.assert_sqlstate_msg('5: NULL raises 22023 CEDULA_INVALIDA',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000091', NULL)$$, '22023', 'CEDULA_INVALIDA');
SELECT pg_temp.capture('5: unknown edición -> EDICION_NOT_FOUND', 'buscar_ed_unknown',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-0000000000fe', '99900001')$$,
  '{"ok":false,"codigo":"EDICION_NOT_FOUND"}'::jsonb);
SELECT pg_temp.capture('5: borrador edición -> EDICION_NOT_FOUND', 'buscar_ed_borr',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000094', '99900001')$$,
  '{"ok":false,"codigo":"EDICION_NOT_FOUND"}'::jsonb);
SELECT pg_temp.capture('5: cancelado edición -> EDICION_NOT_FOUND', 'buscar_ed_canc',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000095', '99900001')$$,
  '{"ok":false,"codigo":"EDICION_NOT_FOUND"}'::jsonb);
RESET ROLE;
SELECT pg_temp.assert_rows('5: each of the 9 valid lookups consumed one pareja_cedula unit; invalid cédulas and hidden ediciones consumed none',
  $$SELECT 1 FROM public.acciones_limitadas
     WHERE actor_id = 'bb000000-0000-4000-8000-000000000045' AND accion = 'pareja_cedula'$$, 9);
-- Start the enrollment tests of M4 with an empty bucket.
SELECT pg_temp.assert_no_error('5: reset M4''s bucket',
  $$DELETE FROM public.acciones_limitadas WHERE actor_id = 'bb000000-0000-4000-8000-000000000045'$$);

-- ══ 6. Throttle (M5) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a6');
SELECT pg_temp.capture('6: lookup ' || n || ' of 10 is served', 'limite_' || n,
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000093', '99900099')$$,
  '{"ok":true,"encontrada":false}'::jsonb)
  FROM generate_series(1, 10) AS n;
SELECT pg_temp.capture('6: the 11th lookup within 24 h returns LIMITE_ALCANZADO', 'limite_11',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000093', '99900001')$$,
  '{"ok":false,"codigo":"LIMITE_ALCANZADO"}'::jsonb);
SELECT pg_temp.capture('6: the cédula enrollment shares the bucket -> LIMITE_ALCANZADO', 'limite_inscribirme',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"cedula","cedula":"99900001"}'::jsonb)$$,
  '{"ok":false,"codigo":"LIMITE_ALCANZADO"}'::jsonb);
SELECT pg_temp.assert_sqlstate('6: authenticated cannot call consumir_limite_accion',
  $$SELECT public.consumir_limite_accion('bb000000-0000-4000-8000-000000000046', 'pareja_cedula', 100, interval '1 second')$$, '42501');
SELECT pg_temp.assert_sqlstate('6: authenticated cannot call the internal lookup helper',
  $$SELECT public.talleres_pareja_por_cedula('bb000000-0000-4000-8000-000000000093', 'bb000000-0000-4000-8000-000000000046', '99900001')$$, '42501');
RESET ROLE;
SELECT pg_temp.assert_rows('6: exactly 10 units recorded (refusals record nothing)',
  $$SELECT 1 FROM public.acciones_limitadas
     WHERE actor_id = 'bb000000-0000-4000-8000-000000000046' AND accion = 'pareja_cedula'$$, 10);
SELECT pg_temp.assert_sqlstate_msg('6: consumir_limite_accion refuses p_max < 1',
  $$SELECT public.consumir_limite_accion('bb000000-0000-4000-8000-000000000046', 'pareja_cedula', 0, interval '1 day')$$, '22023', 'LIMITE_PARAMETROS_INVALIDOS');
SELECT pg_temp.assert_update_rows('6: backdate M5''s units past the 24 h window',
  $$UPDATE public.acciones_limitadas SET created_at = now() - interval '25 hours'
     WHERE actor_id = 'bb000000-0000-4000-8000-000000000046'$$, 10);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a6');
SELECT pg_temp.capture('6: once the window passed, the lookup is served again', 'limite_despues',
  $$SELECT public.talleres_buscar_pareja_por_cedula('bb000000-0000-4000-8000-000000000093', '99900001')$$,
  '{"ok":true,"encontrada":true,"nombre_mostrado":"María G."}'::jsonb);

-- ══ 7. Individual edición (M2) ══

SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_sqlstate('7: a member''s direct INSERT is refused by RLS',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
    VALUES ('bb000000-0000-4000-8000-000000000090', 'bb000000-0000-4000-8000-0000000000c0', 'bb000000-0000-4000-8000-000000000043', 'pendiente')$$, '42501');
SELECT pg_temp.assert_sqlstate_msg('7: p_pareja on an individual edición raises 22023 COMPANERO_NO_APLICA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000090', '{"modo":"conyuge_registrado"}'::jsonb)$$, '22023', 'COMPANERO_NO_APLICA');
SELECT pg_temp.capture('7: M2 enrolls in the individual edición', 'm2_ind_1',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000090')$$);
SELECT pg_temp.assert_rows('7: OK shape is {ok, inscripcion_id, estado: pendiente, pareja_origen: null}',
  $$SELECT 1 FROM t_pr_result
     WHERE key = 'm2_ind_1'
       AND j - 'inscripcion_id' = '{"ok":true,"estado":"pendiente","pareja_origen":null}'::jsonb
       AND (j ->> 'inscripcion_id') ~ '^[0-9a-f-]{36}$'$$, 1);
SELECT pg_temp.capture('7: a second call returns YA_INSCRITO', 'm2_ind_2',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000090')$$,
  '{"ok":false,"codigo":"YA_INSCRITO"}'::jsonb);
SELECT pg_temp.capture('7: en_curso edición -> EDICION_NO_ABIERTA', 'm2_curso',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000096')$$,
  '{"ok":false,"codigo":"EDICION_NO_ABIERTA"}'::jsonb);
SELECT pg_temp.capture('7: unknown edición -> EDICION_NOT_FOUND', 'm2_unknown',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-0000000000fe')$$,
  '{"ok":false,"codigo":"EDICION_NOT_FOUND"}'::jsonb);
SELECT pg_temp.capture('7: borrador edición -> EDICION_NOT_FOUND', 'm2_borr',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000094')$$,
  '{"ok":false,"codigo":"EDICION_NOT_FOUND"}'::jsonb);
SELECT pg_temp.capture('7: cancelado edición -> EDICION_NOT_FOUND', 'm2_canc',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000095')$$,
  '{"ok":false,"codigo":"EDICION_NOT_FOUND"}'::jsonb);
SELECT pg_temp.capture('7: a full edición returns CUPO_LLENO (JSON null p_pareja reads as individual)', 'm2_cupo',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000097', 'null'::jsonb)$$,
  '{"ok":false,"codigo":"CUPO_LLENO"}'::jsonb);
RESET ROLE;
SELECT pg_temp.assert_rows('7: the row: caller as principal, the edición''s cohorte, pendiente, no partner, sobre_cupo false',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm2_ind_1'
       AND i.taller_id = 'bb000000-0000-4000-8000-000000000090' AND i.cohorte_id = 'bb000000-0000-4000-8000-0000000000c0'
       AND i.persona_principal_id = 'bb000000-0000-4000-8000-000000000043'
       AND i.companero_id IS NULL AND i.link_type IS NULL AND i.estado = 'pendiente'
       AND NOT i.sobre_cupo AND i.sobre_cupo_por IS NULL
       AND i.pareja_origen IS NULL AND NOT i.conyuge_registrado_descartado$$, 1);
SELECT pg_temp.assert_rows('7: CUPO_LLENO left no row for M2 in the full edición',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'bb000000-0000-4000-8000-000000000097' AND persona_principal_id = 'bb000000-0000-4000-8000-000000000043'$$, 0);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_update_rows('7: the coordinador rejects M2''s inscription',
  $$UPDATE public.taller_inscripciones SET estado = 'no_aprobado', motivo_no_aprobado = 'ZZ PAR datos errados'
     WHERE id = (SELECT (j ->> 'inscripcion_id')::uuid FROM t_pr_result WHERE key = 'm2_ind_1')$$, 1);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.capture('7: after no_aprobado, M2 enrolls again (same edición, cohorte and principal)', 'm2_ind_3',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000090')$$);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_sqlstate_msg('7: putting the rejected row back to pendiente raises P0001 PERSONA_YA_EN_EDICION',
  $$UPDATE public.taller_inscripciones SET estado = 'pendiente'
     WHERE id = (SELECT (j ->> 'inscripcion_id')::uuid FROM t_pr_result WHERE key = 'm2_ind_1')$$, 'P0001', 'PERSONA_YA_EN_EDICION');
RESET ROLE;
SELECT pg_temp.assert_rows('7: M2 now has one rejected and one pendiente row in the edición',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'bb000000-0000-4000-8000-000000000090' AND persona_principal_id = 'bb000000-0000-4000-8000-000000000043'
     GROUP BY persona_principal_id
    HAVING count(*) FILTER (WHERE estado = 'no_aprobado') = 1 AND count(*) FILTER (WHERE estado = 'pendiente') = 1
       AND count(*) = 2$$, 1);

-- ══ 8. Pareja input rules ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_sqlstate_msg('8: pareja edición without p_pareja raises 22023 COMPANERO_REQUERIDO',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092')$$, '22023', 'COMPANERO_REQUERIDO');
SELECT pg_temp.assert_sqlstate_msg('8: an unknown modo raises 22023 MODO_INVALIDO',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{"modo":"otro"}'::jsonb)$$, '22023', 'MODO_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('8: an object without modo raises 22023 MODO_INVALIDO',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{}'::jsonb)$$, '22023', 'MODO_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('8: a non-object p_pareja raises 22023 MODO_INVALIDO',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '"cedula"'::jsonb)$$, '22023', 'MODO_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('8: conyuge_registrado on a vínculo-NULL taller with vinculo novios raises 22023 MODO_NO_APLICA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"conyuge_registrado","vinculo":"novios"}'::jsonb)$$, '22023', 'MODO_NO_APLICA');
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_sqlstate_msg('8: conyuge_registrado on a novios taller raises 22023 MODO_NO_APLICA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"conyuge_registrado"}'::jsonb)$$, '22023', 'MODO_NO_APLICA');
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_sqlstate_msg('8: a vínculo-NULL taller without vinculo raises 22023 VINCULO_REQUERIDO',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"cedula","cedula":"99900001"}'::jsonb)$$, '22023', 'VINCULO_REQUERIDO');
SELECT pg_temp.assert_sqlstate_msg('8: a vinculo outside matrimonio/novios also raises 22023 VINCULO_REQUERIDO',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"cedula","cedula":"99900001","vinculo":"amigos"}'::jsonb)$$, '22023', 'VINCULO_REQUERIDO');
SELECT pg_temp.assert_sqlstate_msg('8: a malformed cédula raises 22023 CEDULA_INVALIDA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"cedula","cedula":"abc","vinculo":"novios"}'::jsonb)$$, '22023', 'CEDULA_INVALIDA');
SELECT pg_temp.assert_sqlstate_msg('8: cedula mode without a cédula raises 22023 CEDULA_INVALIDA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"cedula"}'::jsonb)$$, '22023', 'CEDULA_INVALIDA');
RESET ROLE;
SELECT pg_temp.assert_rows('8: input errors consumed no throttle unit',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'bb000000-0000-4000-8000-000000000045'$$, 0);

-- ══ 9. Registered spouse ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.capture('9: no registered spouse -> PAREJA_NO_CONFIRMADA', 'conyuge_none',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{"modo":"conyuge_registrado"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a4');
SELECT pg_temp.capture('9: two registered spouses -> PAREJA_NO_CONFIRMADA', 'conyuge_two',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{"modo":"conyuge_registrado"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a7');
SELECT pg_temp.capture('9: the registered spouse is already active in the edición -> PAREJA_NO_DISPONIBLE', 'conyuge_ocupado',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{"modo":"conyuge_registrado"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_DISPONIBLE"}'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('9: M1 enrolls with the registered spouse (a client vinculo is ignored when the taller has one)', 'm1_mat',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{"modo":"conyuge_registrado","vinculo":"novios"}'::jsonb)$$);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('9: the spouse, already in the couple''s row, gets YA_INSCRITO', 's1_mat',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000092', '{"modo":"conyuge_registrado"}'::jsonb)$$,
  '{"ok":false,"codigo":"YA_INSCRITO"}'::jsonb);
SELECT pg_temp.capture('9: S1 enrolls with the spouse found through the reverse direction (vinculo chosen: matrimonio)', 's1_null',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"conyuge_registrado","vinculo":"matrimonio"}'::jsonb)$$);
RESET ROLE;
SELECT pg_temp.assert_rows('9: M1''s OK shape names pareja_origen conyuge_registrado',
  $$SELECT 1 FROM t_pr_result
     WHERE key = 'm1_mat' AND j - 'inscripcion_id' = '{"ok":true,"estado":"pendiente","pareja_origen":"conyuge_registrado"}'::jsonb$$, 1);
SELECT pg_temp.assert_rows('9: M1''s row: S1 as companero, link_type from talleres.vinculo (matrimonio), not descartado',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm1_mat'
       AND i.taller_id = 'bb000000-0000-4000-8000-000000000092' AND i.cohorte_id = 'bb000000-0000-4000-8000-0000000000c2'
       AND i.persona_principal_id = 'bb000000-0000-4000-8000-000000000041'
       AND i.companero_id = 'bb000000-0000-4000-8000-000000000042'
       AND i.link_type = 'matrimonio' AND i.estado = 'pendiente' AND NOT i.sobre_cupo
       AND i.pareja_origen = 'conyuge_registrado' AND NOT i.conyuge_registrado_descartado$$, 1);
SELECT pg_temp.assert_rows('9: S1''s row on the vínculo-NULL taller: M1 as companero, link_type matrimonio',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 's1_null'
       AND i.taller_id = 'bb000000-0000-4000-8000-000000000091'
       AND i.persona_principal_id = 'bb000000-0000-4000-8000-000000000042'
       AND i.companero_id = 'bb000000-0000-4000-8000-000000000041'
       AND i.link_type = 'matrimonio' AND i.pareja_origen = 'conyuge_registrado'$$, 1);

-- ══ 10. Cédula mode ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a8');
SELECT pg_temp.capture('10: unknown cédula -> PAREJA_NO_CONFIRMADA', 'ced_unknown',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"cedula","cedula":"99900099"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}'::jsonb);
SELECT pg_temp.capture('10: own cédula -> PAREJA_NO_CONFIRMADA', 'ced_self',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"cedula","cedula":"99900008"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}'::jsonb);
SELECT pg_temp.capture('10: a minor -> PAREJA_NO_CONFIRMADA', 'ced_menor',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"cedula","cedula":"99900002"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}'::jsonb);
SELECT pg_temp.capture('10: someone already active -> PAREJA_NO_CONFIRMADA (never PAREJA_NO_DISPONIBLE in cédula mode)', 'ced_ocupado',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"cedula","cedula":"99900004","vinculo":"novios"}'::jsonb)$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}'::jsonb);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a5');
SELECT pg_temp.capture('10: M4 enrolls with a person whose earlier row was rejected, choosing novios', 'm4_null',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000091', '{"modo":"cedula","cedula":"V-99.900.006","vinculo":"novios","conyuge_descartado":true}'::jsonb)$$);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a7');
SELECT pg_temp.capture('10: M6 dismisses the registered spouse and enrolls by cédula', 'm6_nov',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000093', '{"modo":"cedula","cedula":"99900003","conyuge_descartado":true}'::jsonb)$$);
RESET ROLE;
SELECT pg_temp.assert_rows('10: the four refusals each consumed one unit (returned, so the rows committed)',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'bb000000-0000-4000-8000-000000000048' AND accion = 'pareja_cedula'$$, 4);
SELECT pg_temp.assert_rows('10: OK shapes name pareja_origen cedula',
  $$SELECT 1 FROM t_pr_result
     WHERE key IN ('m4_null', 'm6_nov') AND j - 'inscripcion_id' = '{"ok":true,"estado":"pendiente","pareja_origen":"cedula"}'::jsonb$$, 2);
SELECT pg_temp.assert_rows('10: M4''s row: P_rechazado as companero, link_type novios (from p_pareja), not descartado (no registered spouse)',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm4_null'
       AND i.persona_principal_id = 'bb000000-0000-4000-8000-000000000045'
       AND i.companero_id = 'bb000000-0000-4000-8000-000000000055'
       AND i.link_type = 'novios' AND i.pareja_origen = 'cedula' AND NOT i.conyuge_registrado_descartado$$, 1);
SELECT pg_temp.assert_rows('10: P_rechazado''s rejected row is untouched',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'bb000000-0000-4000-8000-000000000061' AND estado = 'no_aprobado'$$, 1);
SELECT pg_temp.assert_rows('10: M6''s row: P_placeholder as companero, link_type novios (from the taller), descartado true',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm6_nov'
       AND i.persona_principal_id = 'bb000000-0000-4000-8000-000000000047'
       AND i.companero_id = 'bb000000-0000-4000-8000-000000000053'
       AND i.link_type = 'novios' AND i.pareja_origen = 'cedula' AND i.conyuge_registrado_descartado$$, 1);
SELECT pg_temp.assert_rows('10: no reply of the RPCs carries an id, a cédula or a full apellido',
  $$SELECT 1 FROM t_pr_result
     WHERE (key LIKE 'buscar_%' OR key LIKE 'ced_%' OR key LIKE 'limite_%' OR key LIKE 'conyuge_%')
       AND (j::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-' OR j::text LIKE '%999000%' OR j::text LIKE '%González%' OR j::text LIKE '%"id"%')$$, 0);

-- ══ 10b. Effective vínculo = coalesce(edición link_type, talleres.vinculo) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('10b: edición link_type matrimonio, taller vinculo NULL: conyuge_registrado needs no vinculo', 'm1_link',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000098', '{"modo":"conyuge_registrado"}'::jsonb)$$);
SELECT pg_temp.assert_sqlstate_msg('10b: edición link_type novios beats taller vinculo matrimonio -> conyuge_registrado raises MODO_NO_APLICA',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000099', '{"modo":"conyuge_registrado"}'::jsonb)$$, '22023', 'MODO_NO_APLICA');
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a8');
SELECT pg_temp.capture('10b: edición link_type matrimonio, taller vinculo NULL: a client vinculo novios is ignored', 'm7_link',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000098', '{"modo":"cedula","cedula":"99900001","vinculo":"novios"}'::jsonb)$$);
SELECT pg_temp.capture('10b: edición link_type novios, taller vinculo matrimonio: cédula mode stores novios', 'm7_difiere',
  $$SELECT public.talleres_inscribirme('bb000000-0000-4000-8000-000000000099', '{"modo":"cedula","cedula":"E99900007"}'::jsonb)$$);
RESET ROLE;
SELECT pg_temp.assert_rows('10b: M1''s row on E_link: S1 as companero, link_type matrimonio',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm1_link' AND i.taller_id = 'bb000000-0000-4000-8000-000000000098'
       AND i.companero_id = 'bb000000-0000-4000-8000-000000000042'
       AND i.link_type = 'matrimonio' AND i.pareja_origen = 'conyuge_registrado'$$, 1);
SELECT pg_temp.assert_rows('10b: M7''s row on E_link: link_type matrimonio (the client novios ignored)',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm7_link' AND i.companero_id = 'bb000000-0000-4000-8000-000000000051'
       AND i.link_type = 'matrimonio' AND i.pareja_origen = 'cedula'$$, 1);
SELECT pg_temp.assert_rows('10b: M7''s row on E_difiere: link_type novios (the edición''s, not the taller''s)',
  $$SELECT 1 FROM t_pr_result r JOIN public.taller_inscripciones i ON i.id = (r.j ->> 'inscripcion_id')::uuid
     WHERE r.key = 'm7_difiere' AND i.companero_id = 'bb000000-0000-4000-8000-000000000056'
       AND i.link_type = 'novios' AND i.pareja_origen = 'cedula'$$, 1);

-- ══ 11. Staff paths ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_no_error('11: the director''s direct INSERT still works',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
    VALUES ('bb000000-0000-4000-8000-000000000090', 'bb000000-0000-4000-8000-0000000000c0', 'bb000000-0000-4000-8000-000000000057', 'pendiente')$$);
SELECT pg_temp.capture('11: talleres_inscribir_sobre_cupo still places a person in a full edición', 'sobre_cupo_lleno',
  $$SELECT public.talleres_inscribir_sobre_cupo('bb000000-0000-4000-8000-000000000097', 'bb000000-0000-4000-8000-000000000059') - 'inscripcion_id'$$,
  '{"cupo":1,"ocupados":2,"sobre_cupo":true}'::jsonb);
SELECT pg_temp.capture('11: talleres_inscribir_sobre_cupo still places a person normally when there is room', 'sobre_cupo_normal',
  $$SELECT public.talleres_inscribir_sobre_cupo('bb000000-0000-4000-8000-000000000090', 'bb000000-0000-4000-8000-00000000005a') - 'inscripcion_id' - 'ocupados'$$,
  '{"cupo":0,"sobre_cupo":false}'::jsonb);
SELECT pg_temp.assert_sqlstate_msg('11: a reversed duplicate couple (S1 principal, M1 companero) raises P0001 PERSONA_YA_EN_EDICION',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado)
    VALUES ('bb000000-0000-4000-8000-000000000092', 'bb000000-0000-4000-8000-0000000000c2',
            'bb000000-0000-4000-8000-000000000042', 'bb000000-0000-4000-8000-000000000041', 'matrimonio', 'pendiente')$$,
  'P0001', 'PERSONA_YA_EN_EDICION');
SELECT pg_temp.assert_sqlstate_msg('11: a person already active as companero cannot be placed again',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado)
    VALUES ('bb000000-0000-4000-8000-000000000091', 'bb000000-0000-4000-8000-0000000000c1',
            'bb000000-0000-4000-8000-00000000005b', 'bb000000-0000-4000-8000-000000000054', 'novios', 'pendiente')$$,
  'P0001', 'PERSONA_YA_EN_EDICION');
SELECT pg_temp.assert_sqlstate_msg('11: a principal already active cannot be placed again (as companero of someone else)',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado)
    VALUES ('bb000000-0000-4000-8000-000000000091', 'bb000000-0000-4000-8000-0000000000c1',
            'bb000000-0000-4000-8000-00000000005b', 'bb000000-0000-4000-8000-00000000005d', 'novios', 'pendiente')$$,
  'P0001', 'PERSONA_YA_EN_EDICION');
SELECT pg_temp.assert_sqlstate('11: companero = principal violates the CHECK (23514)',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado)
    VALUES ('bb000000-0000-4000-8000-000000000093', 'bb000000-0000-4000-8000-0000000000c3',
            'bb000000-0000-4000-8000-00000000005b', 'bb000000-0000-4000-8000-00000000005b', 'novios', 'pendiente')$$, '23514');
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_no_error('11: the coordinador''s direct INSERT still works',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
    VALUES ('bb000000-0000-4000-8000-000000000090', 'bb000000-0000-4000-8000-0000000000c0', 'bb000000-0000-4000-8000-000000000058', 'pendiente')$$);
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_sqlstate('11: a member''s direct couple INSERT is refused by RLS',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado)
    VALUES ('bb000000-0000-4000-8000-000000000093', 'bb000000-0000-4000-8000-0000000000c3',
            'bb000000-0000-4000-8000-000000000041', 'bb000000-0000-4000-8000-00000000005e', 'novios', 'pendiente')$$, '42501');
RESET ROLE;
SELECT pg_temp.assert_rows('11: the staff rows landed (Q1, Q2, Q4 in E_ind; Q3 sobre cupo in E_cupo)',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE (taller_id = 'bb000000-0000-4000-8000-000000000090'
            AND persona_principal_id IN ('bb000000-0000-4000-8000-000000000057', 'bb000000-0000-4000-8000-000000000058', 'bb000000-0000-4000-8000-00000000005a'))
        OR (taller_id = 'bb000000-0000-4000-8000-000000000097' AND persona_principal_id = 'bb000000-0000-4000-8000-000000000059' AND sobre_cupo)$$, 4);

-- ══ 12. acciones_limitadas is closed to authenticated ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bb000000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_sqlstate('12: authenticated cannot read acciones_limitadas',
  $$SELECT count(*) FROM public.acciones_limitadas$$, '42501');
SELECT pg_temp.assert_sqlstate('12: authenticated cannot write acciones_limitadas',
  $$INSERT INTO public.acciones_limitadas (actor_id, accion) VALUES ('bb000000-0000-4000-8000-000000000045', 'pareja_cedula')$$, '42501');
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

-- report() runs as postgres: it reads the temp tables and raises on failure.
SELECT pg_temp.report();

ROLLBACK;
