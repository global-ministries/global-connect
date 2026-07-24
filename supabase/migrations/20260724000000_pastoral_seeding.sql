-- ══════════════════════════════════════════════════════════════════════════════
-- W14 — DT-084 — M8: Pastoral seeding
--
-- idempotent: only seeds if target tables are empty.
-- DO block pattern (Lesson #5 from W02-W13).
--
-- Contents:
--   1. pastoral_crisis_keyword_catalog — seed 30 keywords (5-7 per category)
--      only if table is currently empty (W09 may have already seeded 32 rows).
--   2. Admin test user seed_admin_pastoral@global.test (for e2e tests).
--   3. e2e Ana test users: lider + asistido personas (no GDV grupo needed in seed).
--
-- ZERO DDL destructivo — only INSERT / ON CONFLICT.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Crisis keyword catalog (idempotent) ────────────────────────────────────

DO $$
DECLARE
  catalog_count integer;
BEGIN
  SELECT COUNT(*) INTO catalog_count FROM pastoral_crisis_keyword_catalog;

  IF catalog_count = 0 THEN
    -- W09 M6 did not run or table is empty; seed the closed catalog (D29).
    -- 30 keywords total: 7+6+6+6+5 across 5 categories.
    INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
      ('duelo',                  'fallecido',          1, true),
      ('duelo',                  'murió',              1, true),
      ('duelo',                  'muerte',              1, true),
      ('duelo',                  'perdido',             1, true),
      ('duelo',                  'deuil',               1, true),
      ('duelo',                  'bereavement',         1, true),
      ('duelo',                  'duelo',               1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
      ('crisis_matrimonial',     'infiel',              1, true),
      ('crisis_matrimonial',     'separación',          1, true),
      ('crisis_matrimonial',     'divorcio',            1, true),
      ('crisis_matrimonial',     'affair',              1, true),
      ('crisis_matrimonial',     'traición',            1, true),
      ('crisis_matrimonial',     'crisis',              1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
      ('ideacion_suicida',       'suicidio',            1, true),
      ('ideacion_suicida',       'quitarme la vida',    1, true),
      ('ideacion_suicida',       'autolesión',          1, true),
      ('ideacion_suicida',       'self-harm',           1, true),
      ('ideacion_suicida',       'no vale la pena',     1, true),
      ('ideacion_suicida',       'mejor no estar',      1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
      ('violencia_intrafamiliar','violencia',           1, true),
      ('violencia_intrafamiliar','golpe',               1, true),
      ('violencia_intrafamiliar','abuso',               1, true),
      ('violencia_intrafamiliar','amenaza',             1, true),
      ('violencia_intrafamiliar','maltrato',            1, true),
      ('violencia_intrafamiliar','agresión',            1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
      ('crisis_de_fe',           'dudar de dios',       1, true),
      ('crisis_de_fe',           'perdí la fe',         1, true),
      ('crisis_de_fe',           'no me importa',       1, true),
      ('crisis_de_fe',           'abandonado por dios', 1, true),
      ('crisis_de_fe',           'crisis de fe',        1, true)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'M8: inserted crisis keywords (table was empty)';
  ELSE
    RAISE NOTICE 'M8: crisis catalog already has % rows — skipping', catalog_count;
  END IF;
END $$;

-- ── 2. Admin test user ─────────────────────────────────────────────────────────

DO $$
DECLARE
  admin_email text := 'seed_admin_pastoral@global.test';
  admin_exists integer;
BEGIN
  SELECT COUNT(*) INTO admin_exists FROM usuarios WHERE email = admin_email;
  IF admin_exists = 0 THEN
    INSERT INTO usuarios (id, nombre, apellido, email, telefono, genero, estado_civil, fecha_registro)
    VALUES (
      gen_random_uuid(),
      'Admin',
      'Pastoral',
      admin_email,
      '+00000000000',
      'Otro'::text,
      'Soltero'::text,
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'M8: created admin user %', admin_email;
  ELSE
    RAISE NOTICE 'M8: admin user already exists — skipping';
  END IF;
END $$;

-- ── 3. e2e Ana test users (idempotent) ────────────────────────────────────────

DO $$
DECLARE
  lider_email   text := 'seed_ana_lider@global.test';
  asistido_email text := 'seed_asistido@global.test';
BEGIN
  -- Ana lider
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE email = lider_email) THEN
    INSERT INTO usuarios (id, nombre, apellido, email, telefono, genero, estado_civil, fecha_registro)
    VALUES (
      gen_random_uuid(),
      'Ana',
      'Lider GDV',
      lider_email,
      '+00000000001',
      'Femenino'::text,
      'Soltero'::text,
      now()
    );
    RAISE NOTICE 'M8: created Ana lider user %', lider_email;
  ELSE
    RAISE NOTICE 'M8: Ana lider user already exists — skipping';
  END IF;

  -- Asistido
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE email = asistido_email) THEN
    INSERT INTO usuarios (id, nombre, apellido, email, telefono, genero, estado_civil, fecha_registro)
    VALUES (
      gen_random_uuid(),
      'Asistido',
      'Pastoral',
      asistido_email,
      '+00000000002',
      'Masculino'::text,
      'Soltero'::text,
      now()
    );
    RAISE NOTICE 'M8: created Asistido user %', asistido_email;
  ELSE
    RAISE NOTICE 'M8: Asistido user already exists — skipping';
  END IF;
END $$;
