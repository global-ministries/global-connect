-- T2 — talleres.dream_team_equipo_id contract checks.
--
-- Run against STAGING after applying
-- 20260918150000_talleres_dream_team_equipo_column.sql.
--
-- Two things are checked:
--   1. Staging's own pre-existing talleres (backfilled for real by the
--      migration) resolved to the equipo their cohortes point to.
--   2. The three backfill paths (cohorte match / unique name match /
--      no match) behave correctly against isolated fixtures that
--      exercise edge cases the current ambient data does not: a name
--      collision between two talleres racing for the same equipo, and
--      an ambiguous (non-unique) name match. The fixtures reuse the
--      exact per-row resolution algorithm shipped in the migration
--      (kept byte-for-byte identical below, wrapped in a function only
--      so the test can call it scoped to its own rows).
--
-- BEGIN…ROLLBACK — nothing here is kept, and the migration's real,
-- already-committed backfill of staging's ambient rows is untouched
-- (this script only ever scopes writes to its own fixture ids).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE OR REPLACE FUNCTION pg_temp.assert_uuid_eq(p_case text, p_actual uuid, p_expected uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_null_uuid(p_case text, p_actual uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT NULL THEN
    RAISE EXCEPTION 'assert failed: %, expected NULL, got %', p_case, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_int_eq(p_case text, p_actual bigint, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

-- ── the backfill algorithm under test ───────────────────────────────
-- Byte-for-byte the same per-row resolution as the DO block in
-- 20260918150000_talleres_dream_team_equipo_column.sql, wrapped as a
-- function here only so this test can invoke it scoped to p_scope_ids
-- (NULL scope means "every NULL row", matching the migration exactly).
CREATE OR REPLACE FUNCTION pg_temp.run_backfill(p_scope_ids uuid[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_taller      RECORD;
  v_equipo_id   uuid;
  v_match_count integer;
BEGIN
  FOR v_taller IN
    SELECT id, nombre FROM public.talleres
    WHERE dream_team_equipo_id IS NULL
      AND (p_scope_ids IS NULL OR id = ANY (p_scope_ids))
    ORDER BY id
  LOOP
    v_equipo_id := NULL;

    SELECT count(DISTINCT c.dream_team_equipo_id)
    INTO v_match_count
    FROM public.talleres_crecimiento_cohortes c
    JOIN public.taller_ediciones te ON te.id = c.taller_id
    WHERE te.taller_id = v_taller.id
      AND c.dream_team_equipo_id IS NOT NULL;

    IF v_match_count = 1 THEN
      SELECT DISTINCT c.dream_team_equipo_id
      INTO v_equipo_id
      FROM public.talleres_crecimiento_cohortes c
      JOIN public.taller_ediciones te ON te.id = c.taller_id
      WHERE te.taller_id = v_taller.id
        AND c.dream_team_equipo_id IS NOT NULL;
    END IF;

    IF v_equipo_id IS NULL THEN
      SELECT count(*)
      INTO v_match_count
      FROM public.dream_team_equipos e
      WHERE e.experiencia = 'talleres_crecimiento'
        AND lower(e.label) = lower('Equipo ' || v_taller.nombre)
        AND NOT EXISTS (
          SELECT 1 FROM public.talleres t2 WHERE t2.dream_team_equipo_id = e.id
        );

      IF v_match_count = 1 THEN
        SELECT e.id
        INTO v_equipo_id
        FROM public.dream_team_equipos e
        WHERE e.experiencia = 'talleres_crecimiento'
          AND lower(e.label) = lower('Equipo ' || v_taller.nombre)
          AND NOT EXISTS (
            SELECT 1 FROM public.talleres t2 WHERE t2.dream_team_equipo_id = e.id
          );
      END IF;
    END IF;

    IF v_equipo_id IS NOT NULL THEN
      UPDATE public.talleres SET dream_team_equipo_id = v_equipo_id WHERE id = v_taller.id;
    ELSE
      RAISE NOTICE 'talleres.dream_team_equipo_id left NULL for taller % (%): no unique cohorte equipo or name-matched equipo found', v_taller.id, v_taller.nombre;
    END IF;
  END LOOP;
END;
$$;

-- ── §1: staging's own pre-existing talleres backfilled correctly ───
-- Whatever is currently in `talleres` was linked for real by the
-- already-applied migration. For every one of those rows whose
-- cohortes resolve to exactly one equipo, assert the column points at
-- it — this is the "real talleres end up linked to their current
-- equipo" acceptance check, computed generically (not hardcoded to
-- specific taller names) so it holds regardless of which talleres
-- staging happens to carry right now.
DO $ambient$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT t.id, t.nombre, t.dream_team_equipo_id AS actual,
      (SELECT DISTINCT c.dream_team_equipo_id
       FROM public.talleres_crecimiento_cohortes c
       JOIN public.taller_ediciones te ON te.id = c.taller_id
       WHERE te.taller_id = t.id AND c.dream_team_equipo_id IS NOT NULL) AS via_cohorte,
      (SELECT count(DISTINCT c.dream_team_equipo_id)
       FROM public.talleres_crecimiento_cohortes c
       JOIN public.taller_ediciones te ON te.id = c.taller_id
       WHERE te.taller_id = t.id AND c.dream_team_equipo_id IS NOT NULL) AS via_cohorte_ct
    FROM public.talleres t
  LOOP
    IF v_row.via_cohorte_ct = 1 THEN
      PERFORM pg_temp.assert_uuid_eq(
        format('ambient taller %s (%s) links to its single cohorte equipo', v_row.id, v_row.nombre),
        v_row.actual,
        v_row.via_cohorte
      );
    END IF;
  END LOOP;
END;
$ambient$;

-- ── §2: fixtures for the paths ambient data does not exercise ──────

CREATE TEMP TABLE t2_fixture (key text PRIMARY KEY, id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO t2_fixture (key, id) VALUES
  ('grupos_corto_plazo', 'e524ea89-d3a7-45fc-be00-5a6e7452434e'), -- real, ambient parent node
  ('taller_path1',    'a2000000-0000-4000-8000-000000000001'),
  ('equipo_path1',    'a2000000-0000-4000-8000-000000000002'),
  ('edicion_path1',   'a2000000-0000-4000-8000-000000000003'),
  ('event_path1',     'a2000000-0000-4000-8000-000000000004'),
  ('cohorte_path1',   'a2000000-0000-4000-8000-000000000005'),
  ('taller_path2',    'a2000000-0000-4000-8000-000000000010'),
  ('equipo_path2',    'a2000000-0000-4000-8000-000000000011'),
  ('taller_dup_x',    'a2000000-0000-4000-8000-000000000020'),
  ('taller_dup_y',    'a2000000-0000-4000-8000-000000000021'),
  ('equipo_dup',      'a2000000-0000-4000-8000-000000000022'),
  ('taller_amb',      'a2000000-0000-4000-8000-000000000030'),
  ('equipo_amb1',     'a2000000-0000-4000-8000-000000000031'),
  ('equipo_amb2',     'a2000000-0000-4000-8000-000000000032');

CREATE OR REPLACE FUNCTION pg_temp.fid(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM t2_fixture WHERE key = p_key;
$$;

-- Path (a): a taller with exactly one cohorte, pointing at its own equipo.
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo)
VALUES (pg_temp.fid('equipo_path1'), 'talleres_crecimiento', 'Equipo T2 Fixture Path1', pg_temp.fid('grupos_corto_plazo'), true);

INSERT INTO public.talleres (id, slug, nombre)
VALUES (pg_temp.fid('taller_path1'), 'zz-t2-fixture-path1', 'ZZ T2 Fixture Path1');

INSERT INTO public.operating_core_events (id, kind, title, start_date, visibility_scope)
VALUES (pg_temp.fid('event_path1'), 'workshop', 'ZZ T2 Fixture Path1 Edición', '2026-01-01', 'talleres_crecimiento');

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot
) VALUES (
  pg_temp.fid('edicion_path1'), pg_temp.fid('event_path1'), pg_temp.fid('taller_path1'),
  'individual', 'permanente_custom', 'borrador',
  'ZZ T2 Fixture Path1 Edición', 1, 60, 'permanente_custom'
);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion)
VALUES (pg_temp.fid('cohorte_path1'), pg_temp.fid('edicion_path1'), pg_temp.fid('equipo_path1'), 'Cohorte ZZ T2 Fixture Path1');

-- Path (b): a taller with no cohorte, matched by name (case-insensitively —
-- the equipo's label is upper-cased on purpose).
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo)
VALUES (pg_temp.fid('equipo_path2'), 'talleres_crecimiento', 'EQUIPO ZZ T2 FIXTURE PATH2', pg_temp.fid('grupos_corto_plazo'), true);

INSERT INTO public.talleres (id, slug, nombre)
VALUES (pg_temp.fid('taller_path2'), 'zz-t2-fixture-path2', 'ZZ T2 Fixture Path2');

-- Collision: two talleres whose name both derive the same target label.
-- Only the first one processed (lower id, processed first by the
-- `ORDER BY id` in run_backfill) may claim the equipo; the second must
-- find it already linked and fall through to NULL (path c).
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo)
VALUES (pg_temp.fid('equipo_dup'), 'talleres_crecimiento', 'Equipo ZZ T2 Fixture Dup', pg_temp.fid('grupos_corto_plazo'), true);

INSERT INTO public.talleres (id, slug, nombre) VALUES
  (pg_temp.fid('taller_dup_x'), 'zz-t2-fixture-dup-x', 'ZZ T2 Fixture Dup'),
  (pg_temp.fid('taller_dup_y'), 'zz-t2-fixture-dup-y', 'ZZ T2 Fixture Dup');

-- Ambiguous: two equipos share the same case-insensitive label, so
-- neither is "the unique" match — the taller must stay NULL.
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  (pg_temp.fid('equipo_amb1'), 'talleres_crecimiento', 'Equipo ZZ T2 Fixture Amb', pg_temp.fid('grupos_corto_plazo'), true),
  (pg_temp.fid('equipo_amb2'), 'talleres_crecimiento', 'equipo zz t2 fixture amb', pg_temp.fid('grupos_corto_plazo'), true);

INSERT INTO public.talleres (id, slug, nombre)
VALUES (pg_temp.fid('taller_amb'), 'zz-t2-fixture-amb', 'ZZ T2 Fixture Amb');

-- ── run the backfill, scoped to exactly this test's fixture talleres ─
SELECT pg_temp.run_backfill(ARRAY[
  pg_temp.fid('taller_path1'), pg_temp.fid('taller_path2'),
  pg_temp.fid('taller_dup_x'), pg_temp.fid('taller_dup_y'),
  pg_temp.fid('taller_amb')
]);

SELECT pg_temp.assert_uuid_eq(
  'path (a): cohorte-matched taller links to its cohorte equipo',
  (SELECT dream_team_equipo_id FROM public.talleres WHERE id = pg_temp.fid('taller_path1')),
  pg_temp.fid('equipo_path1')
);

SELECT pg_temp.assert_uuid_eq(
  'path (b): name-matched taller links case-insensitively',
  (SELECT dream_team_equipo_id FROM public.talleres WHERE id = pg_temp.fid('taller_path2')),
  pg_temp.fid('equipo_path2')
);

SELECT pg_temp.assert_int_eq(
  'collision: exactly one of the two same-named talleres claims the equipo',
  (SELECT count(*) FROM public.talleres
   WHERE id IN (pg_temp.fid('taller_dup_x'), pg_temp.fid('taller_dup_y'))
     AND dream_team_equipo_id = pg_temp.fid('equipo_dup')),
  1
);

SELECT pg_temp.assert_uuid_eq(
  'collision: the first-processed (lower id) taller wins the race',
  (SELECT dream_team_equipo_id FROM public.talleres WHERE id = pg_temp.fid('taller_dup_x')),
  pg_temp.fid('equipo_dup')
);

SELECT pg_temp.assert_null_uuid(
  'collision: the second taller stays NULL rather than double-linking',
  (SELECT dream_team_equipo_id FROM public.talleres WHERE id = pg_temp.fid('taller_dup_y'))
);

SELECT pg_temp.assert_null_uuid(
  'ambiguous name match: taller stays NULL when two equipos share the label',
  (SELECT dream_team_equipo_id FROM public.talleres WHERE id = pg_temp.fid('taller_amb'))
);

-- ── §3: no dream_team_equipos row backs two talleres, anywhere ─────
SELECT pg_temp.assert_int_eq(
  'no equipo is linked to more than one taller, across the whole table',
  (SELECT count(*) FROM (
     SELECT dream_team_equipo_id FROM public.talleres
     WHERE dream_team_equipo_id IS NOT NULL
     GROUP BY dream_team_equipo_id
     HAVING count(*) > 1
   ) dupes),
  0
);

-- ── §4: the partial unique index rejects a direct double-link ──────
DO $unique_check$
BEGIN
  UPDATE public.talleres
  SET dream_team_equipo_id = pg_temp.fid('equipo_path1')
  WHERE id = pg_temp.fid('taller_path2');

  RAISE EXCEPTION 'unique index check failed: expected unique_violation but the UPDATE succeeded';
EXCEPTION
  WHEN unique_violation THEN
    NULL; -- expected: talleres_dream_team_equipo_id_uniq blocks the double-link
END;
$unique_check$;

ROLLBACK;
