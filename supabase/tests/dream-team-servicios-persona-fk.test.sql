-- T1 (odd/tasks/ninos-voluntarios-waumba.md) — dream_team_servicios.persona_id
-- references usuarios(id), ON DELETE RESTRICT
-- (migration 20261003160000_dream_team_entrenador_y_fk_persona.sql).
--
-- Covers:
--   a. The foreign key exists on persona_id, references public.usuarios(id), is
--      validated, and uses ON DELETE RESTRICT / ON UPDATE NO ACTION.
--   b. No servicio on this database points at a missing usuario (the
--      precondition VALIDATE CONSTRAINT relies on).
--   c. A servicio for an existing usuario still inserts.
--   d. A servicio for a persona_id with no usuarios row is rejected (23503).
--   e. Moving an existing servicio to a persona_id with no usuarios row is
--      rejected (23503).
--   f. Deleting a usuario that has an active servicio is rejected (23503); the
--      usuario and the servicio both remain.
--   g. Deleting a usuario whose only servicio is retirado is rejected too:
--      service history is never deleted silently.
--   h. Deleting a usuario with no servicio still succeeds: the key blocks no
--      unrelated delete.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own d7000000-... namespace. The MCP connection is
-- `postgres`, so every statement here runs as the table owner; no case depends
-- on RLS. The last statement is a SELECT of the failing cases (0 failing cases
-- = all ok), because the MCP tool returns only the last result-producing
-- statement.
--
-- Fixtures:
--   usuario 21  serves in equipo 01 (activo)
--   usuario 23  served in equipo 01 (retirado)
--   usuario 25  no servicio at all
--   d7000000-0000-4000-8000-000000000099 is never inserted into usuarios

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_fk_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_fk_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- The statement must fail with p_sqlstate; its effects roll back with the
-- exception block, so a rejected statement leaves no trace.
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

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, activo) VALUES
  ('d7000000-0000-4000-8000-000000000001', 'ninos', 'ZZ FK Maternal', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('d7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000001', 'voluntario', true),
  ('d7000000-0000-4000-8000-000000000012', 'd7000000-0000-4000-8000-000000000001', 'entrenador', true);

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('d7000000-0000-4000-8000-000000000021', NULL, 'ZZ FK', 'Activo',   NULL, NULL, 'Soltero', 'Otro'),
  ('d7000000-0000-4000-8000-000000000023', NULL, 'ZZ FK', 'Retirado', NULL, NULL, 'Soltero', 'Otro'),
  ('d7000000-0000-4000-8000-000000000025', NULL, 'ZZ FK', 'SinServicio', NULL, NULL, 'Soltero', 'Otro');

-- ── a. the constraint ───────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: persona_id references usuarios(id)',
  $q$SELECT string_agg(pg_get_constraintdef(c.oid), ' | ')
       FROM pg_constraint c
      WHERE c.conrelid = 'public.dream_team_servicios'::regclass
        AND c.contype = 'f'
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                               WHERE attrelid = 'public.dream_team_servicios'::regclass
                                 AND attname = 'persona_id')]$q$,
  'FOREIGN KEY (persona_id) REFERENCES usuarios(id) ON DELETE RESTRICT');

SELECT pg_temp.assert_eq('a: the key is named dream_team_servicios_persona_id_fkey, validated, RESTRICT / NO ACTION',
  $q$SELECT c.convalidated::text || ',' || c.confdeltype::text || ',' || c.confupdtype::text
       FROM pg_constraint c
      WHERE c.conrelid = 'public.dream_team_servicios'::regclass
        AND c.conname = 'dream_team_servicios_persona_id_fkey'$q$,
  'true,r,a');

-- ── b. no orphans ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: no servicio points at a missing usuario',
  $q$SELECT count(*) FROM public.dream_team_servicios s
      WHERE NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = s.persona_id)$q$,
  '0');

-- ── c. existing usuario ─────────────────────────────────────────────

SELECT pg_temp.assert_no_error('c: a servicio for an existing usuario inserts',
  $q$INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
       ('d7000000-0000-4000-8000-000000000041', 'd7000000-0000-4000-8000-000000000021',
        'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000011', 'activo')$q$);

SELECT pg_temp.assert_no_error('c: a retired servicio for an existing usuario inserts',
  $q$INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_fin) VALUES
       ('d7000000-0000-4000-8000-000000000043', 'd7000000-0000-4000-8000-000000000023',
        'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000011', 'retirado', now())$q$);

-- ── d. missing usuario on insert ────────────────────────────────────

SELECT pg_temp.assert_raises('d: a servicio for a persona_id with no usuarios row is rejected',
  $q$INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
       ('d7000000-0000-4000-8000-000000000045', 'd7000000-0000-4000-8000-000000000099',
        'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000012', 'postulado')$q$,
  '23503');

SELECT pg_temp.assert_eq('d: the rejected servicio left no row',
  $q$SELECT count(*) FROM public.dream_team_servicios WHERE id = 'd7000000-0000-4000-8000-000000000045'$q$,
  '0');

-- ── e. missing usuario on update ────────────────────────────────────

SELECT pg_temp.assert_raises('e: moving a servicio to a persona_id with no usuarios row is rejected',
  $q$UPDATE public.dream_team_servicios SET persona_id = 'd7000000-0000-4000-8000-000000000099'
      WHERE id = 'd7000000-0000-4000-8000-000000000041'$q$,
  '23503');

SELECT pg_temp.assert_eq('e: the servicio keeps its persona',
  $q$SELECT persona_id::text FROM public.dream_team_servicios WHERE id = 'd7000000-0000-4000-8000-000000000041'$q$,
  'd7000000-0000-4000-8000-000000000021');

-- ── f. delete a usuario with an active servicio ─────────────────────

SELECT pg_temp.assert_raises('f: deleting a usuario with an active servicio is rejected',
  $q$DELETE FROM public.usuarios WHERE id = 'd7000000-0000-4000-8000-000000000021'$q$,
  '23503');

SELECT pg_temp.assert_eq('f: the usuario and its servicio remain',
  $q$SELECT (SELECT count(*) FROM public.usuarios WHERE id = 'd7000000-0000-4000-8000-000000000021')::text || ',' ||
            (SELECT count(*) FROM public.dream_team_servicios WHERE persona_id = 'd7000000-0000-4000-8000-000000000021')::text$q$,
  '1,1');

-- ── g. delete a usuario whose only servicio is retirado ─────────────

SELECT pg_temp.assert_raises('g: deleting a usuario whose only servicio is retirado is rejected',
  $q$DELETE FROM public.usuarios WHERE id = 'd7000000-0000-4000-8000-000000000023'$q$,
  '23503');

SELECT pg_temp.assert_eq('g: the retired servicio (service history) remains',
  $q$SELECT count(*) FROM public.dream_team_servicios
      WHERE persona_id = 'd7000000-0000-4000-8000-000000000023' AND estado = 'retirado'$q$,
  '1');

-- ── h. delete a usuario with no servicio ────────────────────────────

SELECT pg_temp.assert_no_error('h: deleting a usuario with no servicio succeeds',
  $q$DELETE FROM public.usuarios WHERE id = 'd7000000-0000-4000-8000-000000000025'$q$);

SELECT pg_temp.assert_eq('h: that usuario is gone',
  $q$SELECT count(*) FROM public.usuarios WHERE id = 'd7000000-0000-4000-8000-000000000025'$q$,
  '0');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_fk_failures;

ROLLBACK;
