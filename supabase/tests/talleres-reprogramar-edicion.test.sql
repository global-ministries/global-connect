-- T7b (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN
-- for talleres_reprogramar_edicion / talleres_reprogramacion_persona
-- (migration 20260928150000_talleres_reprogramar_edicion.sql). Run against
-- STAGING inside BEGIN…ROLLBACK — nothing here is kept; every fixture id
-- lives under this file's own b9000000-... namespace, same helper style as
-- the other paso-6 test files.
--
-- D = talleres_hoy() + 3, captured once into the custom GUC zz_b9.d (so
-- every fixture/assertion below reads the SAME "today-relative" date no
-- matter which role is active) — makes every derived estado deterministic
-- regardless of which day this actually runs.
--
-- Fixtures (all under taller_reprog, D1):
--   ed_a  (b9…80) — 4 clases weekly from D, cierre=D, fin=D+21 — case (a)
--     extend, then reused for (f) both-NULL and (g) member 403.
--   ed_b  (b9…81) — same shape — case (b) move (+7, no cierre), reused for
--     (i) audit columns and the talleres_reprogramacion_persona check.
--   ed_cd (b9…82) — same shape but clase 1 already 'cerrada' — case (c)
--     move refused (EDICION_YA_EMPEZO), then (d) extend-only still works
--     on the SAME fixture (a refused call rolls back inside its own
--     assert_sqlstate_msg subtransaction, so ed_cd is untouched going
--     into (d)).
--   ed_e  (b9…83) — same shape — case (e) cierre (D+30) past fin (D+21).
--   ed_h  (b9…84) — stored estado='cancelado', no cohorte/clases needed
--     (the state check short-circuits before touching dates) — case (h).
--   ed_j  (b9…85) — 2 clases (numero 1 'programada', numero 2 'cancelada'
--     at D+7) — case (j): the cancelada sesión is never moved.
--
-- Mutant (post-GREEN, run as its own separate BEGIN…ROLLBACK, never
-- persisted — see this task's own delegation report): CREATE OR REPLACE
-- talleres_reprogramar_edicion with the `s.numero = 1 AND s.estado =
-- 'cerrada'` EDICION_YA_EMPEZO guard removed -> case (c)'s move against
-- ed_cd no longer raises (RED); ROLLBACK undoes the CREATE OR REPLACE
-- together with the probe call, nothing needs a separate restore step.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

SELECT set_config('zz_b9.d', (public.talleres_hoy() + 3)::text, true);

CREATE TEMP TABLE t_r9_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_r9_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.d() RETURNS date LANGUAGE sql AS $$
  SELECT current_setting('zz_b9.d')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_r9_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate OR SQLERRM IS DISTINCT FROM p_expected_message THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_r9_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b9000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ B9 Direccion D1', NULL, true),
  ('b9000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ B9 D1 Hijo Taller', 'b9000000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('b9000000-0000-4000-8000-000000000010', 'zz-b9-taller-reprog', 'ZZ B9 Taller Reprog', 'b9000000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, 0);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b9000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'b9-director1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b9000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'b9-member@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b9000000-0000-4000-8000-000000000031', 'b9000000-0000-4000-8000-000000000030', 'ZZB9', 'Director1', 'b9-director1@example.test', 'Soltero', 'Otro'),
  ('b9000000-0000-4000-8000-000000000033', 'b9000000-0000-4000-8000-000000000032', 'ZZB9', 'Member', 'b9-member@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b9000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b9000000-0000-4000-8000-000000000001');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('b9000000-0000-4000-8000-000000000070', 'workshop', 'active', 'ZZ B9 Evento A', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b9000000-0000-4000-8000-000000000071', 'workshop', 'active', 'ZZ B9 Evento B', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b9000000-0000-4000-8000-000000000072', 'workshop', 'active', 'ZZ B9 Evento CD', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b9000000-0000-4000-8000-000000000073', 'workshop', 'active', 'ZZ B9 Evento E', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b9000000-0000-4000-8000-000000000074', 'workshop', 'active', 'ZZ B9 Evento H', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b9000000-0000-4000-8000-000000000075', 'workshop', 'active', 'ZZ B9 Evento J', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('b9000000-0000-4000-8000-000000000080', 'b9000000-0000-4000-8000-000000000070', 'b9000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B9 Edicion A', 4, 60, 'permanente_custom',
   pg_temp.d(), pg_temp.d(), pg_temp.d() + 21),
  ('b9000000-0000-4000-8000-000000000081', 'b9000000-0000-4000-8000-000000000071', 'b9000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B9 Edicion B', 4, 60, 'permanente_custom',
   pg_temp.d(), pg_temp.d(), pg_temp.d() + 21),
  ('b9000000-0000-4000-8000-000000000082', 'b9000000-0000-4000-8000-000000000072', 'b9000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B9 Edicion CD', 4, 60, 'permanente_custom',
   pg_temp.d(), pg_temp.d(), pg_temp.d() + 21),
  ('b9000000-0000-4000-8000-000000000083', 'b9000000-0000-4000-8000-000000000073', 'b9000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B9 Edicion E', 4, 60, 'permanente_custom',
   pg_temp.d(), pg_temp.d(), pg_temp.d() + 21),
  ('b9000000-0000-4000-8000-000000000084', 'b9000000-0000-4000-8000-000000000074', 'b9000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'cancelado', 'ZZ B9 Edicion H', 1, 60, 'permanente_custom',
   pg_temp.d(), pg_temp.d(), pg_temp.d() + 21),
  ('b9000000-0000-4000-8000-000000000085', 'b9000000-0000-4000-8000-000000000075', 'b9000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B9 Edicion J', 2, 60, 'permanente_custom',
   pg_temp.d(), pg_temp.d(), pg_temp.d() + 7);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at) VALUES
  ('b9000000-0000-4000-8000-000000000090', 'b9000000-0000-4000-8000-000000000080', 'b9000000-0000-4000-8000-000000000002', 'ZZ B9 Cohorte A', pg_temp.d()::timestamptz),
  ('b9000000-0000-4000-8000-000000000091', 'b9000000-0000-4000-8000-000000000081', 'b9000000-0000-4000-8000-000000000002', 'ZZ B9 Cohorte B', pg_temp.d()::timestamptz),
  ('b9000000-0000-4000-8000-000000000092', 'b9000000-0000-4000-8000-000000000082', 'b9000000-0000-4000-8000-000000000002', 'ZZ B9 Cohorte CD', pg_temp.d()::timestamptz),
  ('b9000000-0000-4000-8000-000000000093', 'b9000000-0000-4000-8000-000000000083', 'b9000000-0000-4000-8000-000000000002', 'ZZ B9 Cohorte E', pg_temp.d()::timestamptz),
  ('b9000000-0000-4000-8000-000000000095', 'b9000000-0000-4000-8000-000000000085', 'b9000000-0000-4000-8000-000000000002', 'ZZ B9 Cohorte J', pg_temp.d()::timestamptz);

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('b9000000-0000-4000-8000-000000000100', 'b9000000-0000-4000-8000-000000000090', 'ZZ B9 Grupo A', 10, 'activo'),
  ('b9000000-0000-4000-8000-000000000101', 'b9000000-0000-4000-8000-000000000091', 'ZZ B9 Grupo B', 10, 'activo'),
  ('b9000000-0000-4000-8000-000000000102', 'b9000000-0000-4000-8000-000000000092', 'ZZ B9 Grupo CD', 10, 'activo'),
  ('b9000000-0000-4000-8000-000000000103', 'b9000000-0000-4000-8000-000000000093', 'ZZ B9 Grupo E', 10, 'activo'),
  ('b9000000-0000-4000-8000-000000000105', 'b9000000-0000-4000-8000-000000000095', 'ZZ B9 Grupo J', 10, 'activo');

-- 4 clases weekly (D, D+7, D+14, D+21) for A/B/CD/E.
INSERT INTO public.taller_sesiones (grupo_id, numero, fecha_programada, estado) VALUES
  ('b9000000-0000-4000-8000-000000000100', 1, pg_temp.d(),      'programada'),
  ('b9000000-0000-4000-8000-000000000100', 2, pg_temp.d() + 7,  'programada'),
  ('b9000000-0000-4000-8000-000000000100', 3, pg_temp.d() + 14, 'programada'),
  ('b9000000-0000-4000-8000-000000000100', 4, pg_temp.d() + 21, 'programada'),
  ('b9000000-0000-4000-8000-000000000101', 1, pg_temp.d(),      'programada'),
  ('b9000000-0000-4000-8000-000000000101', 2, pg_temp.d() + 7,  'programada'),
  ('b9000000-0000-4000-8000-000000000101', 3, pg_temp.d() + 14, 'programada'),
  ('b9000000-0000-4000-8000-000000000101', 4, pg_temp.d() + 21, 'programada'),
  ('b9000000-0000-4000-8000-000000000102', 1, pg_temp.d(),      'programada'),
  ('b9000000-0000-4000-8000-000000000102', 2, pg_temp.d() + 7,  'programada'),
  ('b9000000-0000-4000-8000-000000000102', 3, pg_temp.d() + 14, 'programada'),
  ('b9000000-0000-4000-8000-000000000102', 4, pg_temp.d() + 21, 'programada'),
  ('b9000000-0000-4000-8000-000000000103', 1, pg_temp.d(),      'programada'),
  ('b9000000-0000-4000-8000-000000000103', 2, pg_temp.d() + 7,  'programada'),
  ('b9000000-0000-4000-8000-000000000103', 3, pg_temp.d() + 14, 'programada'),
  ('b9000000-0000-4000-8000-000000000103', 4, pg_temp.d() + 21, 'programada');

-- ed_cd's clase 1 is already cerrada (item c/d fixture).
UPDATE public.taller_sesiones SET estado = 'cerrada'
 WHERE grupo_id = 'b9000000-0000-4000-8000-000000000102' AND numero = 1;

-- ed_j: 2 clases, numero 2 becomes cancelada (item j fixture). Insert as
-- 'programada' (the INSERT trigger requires it), then flip via UPDATE.
INSERT INTO public.taller_sesiones (grupo_id, numero, fecha_programada, estado) VALUES
  ('b9000000-0000-4000-8000-000000000105', 1, pg_temp.d(),     'programada'),
  ('b9000000-0000-4000-8000-000000000105', 2, pg_temp.d() + 7, 'programada');
UPDATE public.taller_sesiones SET estado = 'cancelada'
 WHERE grupo_id = 'b9000000-0000-4000-8000-000000000105' AND numero = 2;

-- ══════════════════════════════════════════════════════════════════════
-- (a) extend only: cierre D -> D+7, clases/fecha_inicio/fecha_fin untouched.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(a) extend cierre to D+7',
  $$SELECT 1 FROM (SELECT public.talleres_reprogramar_edicion(
       'b9000000-0000-4000-8000-000000000080'::uuid, NULL, (pg_temp.d() + 7)) AS r) q
     WHERE (r->>'cierre_inscripcion')::date = pg_temp.d() + 7
       AND (r->>'fecha_inicio')::date = pg_temp.d()
       AND (r->>'fecha_fin')::date = pg_temp.d() + 21
       AND (r->>'clases_movidas')::int = 0$$, 1);
RESET ROLE;

SELECT pg_temp.assert_rows('(a) taller_ediciones row reflects the extended cierre',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'b9000000-0000-4000-8000-000000000080'
       AND cierre_inscripcion = pg_temp.d() + 7
       AND fecha_inicio = pg_temp.d()
       AND fecha_fin = pg_temp.d() + 21$$, 1);

SELECT pg_temp.assert_rows('(a) none of the 4 clases moved',
  $$SELECT count(*) = 4 AS ok FROM public.taller_sesiones
     WHERE grupo_id = 'b9000000-0000-4000-8000-000000000100'
       AND fecha_programada IN (pg_temp.d(), pg_temp.d()+7, pg_temp.d()+14, pg_temp.d()+21)$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- (b) move start to D+7, no cierre override: all 4 clases +7, fin D+28,
-- cierre D+7 (offset 0 preserved), clases_movidas = 4.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(b) move start to D+7',
  $$SELECT 1 FROM (SELECT public.talleres_reprogramar_edicion(
       'b9000000-0000-4000-8000-000000000081'::uuid, (pg_temp.d() + 7), NULL, 'Movimiento de fecha') AS r) q
     WHERE (r->>'fecha_inicio')::date = pg_temp.d() + 7
       AND (r->>'fecha_fin')::date = pg_temp.d() + 28
       AND (r->>'cierre_inscripcion')::date = pg_temp.d() + 7
       AND (r->>'clases_movidas')::int = 4$$, 1);
RESET ROLE;

SELECT pg_temp.assert_rows('(b) all 4 clases shifted +7',
  $$SELECT count(*) = 4 AS ok FROM public.taller_sesiones
     WHERE grupo_id = 'b9000000-0000-4000-8000-000000000101'
       AND fecha_programada IN (pg_temp.d()+7, pg_temp.d()+14, pg_temp.d()+21, pg_temp.d()+28)$$, 1);

SELECT pg_temp.assert_rows('(b) cohorte started_at moved to the new fecha_inicio',
  $$SELECT 1 FROM public.talleres_crecimiento_cohortes
     WHERE id = 'b9000000-0000-4000-8000-000000000091'
       AND started_at = (pg_temp.d() + 7)::timestamptz$$, 1);

-- (i) audit columns set to the director who called it.
SELECT pg_temp.assert_rows('(i) reprogramada_por/en/motivo set to the calling director',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'b9000000-0000-4000-8000-000000000081'
       AND reprogramada_por = 'b9000000-0000-4000-8000-000000000031'
       AND reprogramada_en IS NOT NULL
       AND reprogramacion_motivo = 'Movimiento de fecha'$$, 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(i) talleres_reprogramacion_persona resolves the director''s name',
  $$SELECT 1 FROM public.talleres_reprogramacion_persona('b9000000-0000-4000-8000-000000000081'::uuid)
     WHERE reprogramada_por_nombre = 'ZZB9' AND reprogramada_por_apellido = 'Director1'
       AND reprogramacion_motivo = 'Movimiento de fecha' AND reprogramada_en IS NOT NULL$$, 1);
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- (c) clase 1 already cerrada -> moving the start is refused.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_sqlstate_msg('(c) move refused when clase 1 is cerrada',
  $$SELECT public.talleres_reprogramar_edicion('b9000000-0000-4000-8000-000000000082'::uuid, (pg_temp.d() + 5), NULL)$$,
  'P0001', 'EDICION_YA_EMPEZO');
RESET ROLE;

SELECT pg_temp.assert_rows('(c) fecha_inicio unchanged after the refused move',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'b9000000-0000-4000-8000-000000000082' AND fecha_inicio = pg_temp.d()$$, 1);

SELECT pg_temp.assert_rows('(c) none of the clases moved after the refused move',
  $$SELECT count(*) = 4 AS ok FROM public.taller_sesiones
     WHERE grupo_id = 'b9000000-0000-4000-8000-000000000102'
       AND fecha_programada IN (pg_temp.d(), pg_temp.d()+7, pg_temp.d()+14, pg_temp.d()+21)$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- (d) same edicion (clase 1 still cerrada): extend-only still works.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(d) extend-only works even with clase 1 cerrada',
  $$SELECT 1 FROM (SELECT public.talleres_reprogramar_edicion(
       'b9000000-0000-4000-8000-000000000082'::uuid, NULL, (pg_temp.d() + 2)) AS r) q
     WHERE (r->>'cierre_inscripcion')::date = pg_temp.d() + 2
       AND (r->>'clases_movidas')::int = 0$$, 1);
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- (e) cierre (D+30) after fin (D+21) -> CIERRE_POSTERIOR_AL_FIN.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_sqlstate_msg('(e) cierre past fin is refused',
  $$SELECT public.talleres_reprogramar_edicion('b9000000-0000-4000-8000-000000000083'::uuid, NULL, (pg_temp.d() + 30))$$,
  'P0001', 'CIERRE_POSTERIOR_AL_FIN');
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- (f) both params NULL -> NADA_QUE_CAMBIAR (reuses ed_a, already extended
-- by (a) but still abierto — the state check passes, only the input check
-- fires).
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_sqlstate_msg('(f) both params NULL is refused',
  $$SELECT public.talleres_reprogramar_edicion('b9000000-0000-4000-8000-000000000080'::uuid, NULL, NULL)$$,
  'P0001', 'NADA_QUE_CAMBIAR');
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- (g) a member (no grants) is refused with 42501.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000032');
SELECT pg_temp.assert_sqlstate_msg('(g) member has no permission on this edicion',
  $$SELECT public.talleres_reprogramar_edicion('b9000000-0000-4000-8000-000000000080'::uuid, NULL, (pg_temp.d() + 8))$$,
  '42501', 'sin_permisos_para_esta_edicion');
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- (h) a cancelada (effective) edicion cannot be reprogramada.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_sqlstate_msg('(h) cancelled edicion is refused',
  $$SELECT public.talleres_reprogramar_edicion('b9000000-0000-4000-8000-000000000084'::uuid, (pg_temp.d() + 5), NULL)$$,
  'P0001', 'EDICION_NO_REPROGRAMABLE');
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- (j) a cancelada sesión is never moved (only the 1 'programada' clase is).
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b9000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(j) move start: only the programada clase moves',
  $$SELECT 1 FROM (SELECT public.talleres_reprogramar_edicion(
       'b9000000-0000-4000-8000-000000000085'::uuid, (pg_temp.d() + 3), NULL) AS r) q
     WHERE (r->>'clases_movidas')::int = 1
       AND (r->>'fecha_inicio')::date = pg_temp.d() + 3
       AND (r->>'fecha_fin')::date = pg_temp.d() + 10$$, 1);
RESET ROLE;

SELECT pg_temp.assert_rows('(j) the programada clase (numero 1) moved to D+3',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = 'b9000000-0000-4000-8000-000000000105' AND numero = 1
       AND fecha_programada = pg_temp.d() + 3$$, 1);

SELECT pg_temp.assert_rows('(j) the cancelada clase (numero 2) stayed at D+7',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = 'b9000000-0000-4000-8000-000000000105' AND numero = 2
       AND estado = 'cancelada' AND fecha_programada = pg_temp.d() + 7$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- structural: audit columns exist; both functions are default-deny for
-- anon/PUBLIC.
-- ══════════════════════════════════════════════════════════════════════

SELECT pg_temp.assert_rows('structural: taller_ediciones has the 3 audit columns',
  $$SELECT count(*) = 3 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'taller_ediciones'
       AND column_name IN ('reprogramada_por', 'reprogramada_en', 'reprogramacion_motivo')$$, 1);

SELECT pg_temp.assert_rows('structural: talleres_reprogramar_edicion has no EXECUTE for anon',
  $$SELECT 1 WHERE NOT has_function_privilege('anon', 'public.talleres_reprogramar_edicion(uuid, date, date, text)', 'EXECUTE')$$, 1);

SELECT pg_temp.assert_rows('structural: talleres_reprogramacion_persona has no EXECUTE for anon',
  $$SELECT 1 WHERE NOT has_function_privilege('anon', 'public.talleres_reprogramacion_persona(uuid)', 'EXECUTE')$$, 1);

SELECT pg_temp.report();

ROLLBACK;
