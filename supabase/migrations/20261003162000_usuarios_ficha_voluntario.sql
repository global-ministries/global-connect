-- Person record fields for volunteers (T3 of odd/tasks/ninos-voluntarios-waumba.md,
-- decision D5).
--
-- What:
--   1. Four nullable columns on usuarios: bautizado, fecha_bautizo,
--      talla_franela, redes_sociales, each with its CHECK and a comment.
--   2. A private table, persona_datos_importados, that keeps the raw
--      spreadsheet columns not modelled yet (talleres realizados, dones,
--      lenguaje del amor, mentor, otra área, antigüedad, GDV and leader as
--      text), one row per persona and source spreadsheet.
--
-- Why: the Waumba Land spreadsheet (and later UpStreet and Estudiantes) carries
-- baptism, shirt size and social media for each volunteer, which the person
-- record needs. The rest is kept raw so the import (T4) loses nothing and can
-- be structured later; "talleres realizados" becomes a checklist over the
-- talleres catalogue in another task.
--
-- Checked on staging before writing this (read-only):
--   - No view or materialized view selects usuarios.* (views store their column
--     list at creation, so the seven views that read usuarios keep their
--     shape); no function returns usuarios / SETOF usuarios or takes it as an
--     argument; no function body uses usuarios%ROWTYPE.
--   - usuarios has table-level grants only (no column-level ACL), so the new
--     columns follow the existing grants and RLS policies of the row.
--   - The only triggers on usuarios are usuarios_normalizar_cedula and
--     usuarios_normalizar_telefono (BEFORE INSERT OR UPDATE OF cedula /
--     telefono); they do not touch the new columns.
--   - usuarios has about a thousand rows, so validating the new CHECKs (all
--     rows NULL) holds the ALTER lock for an instant.
--
-- fecha_bautizo <= current_date: a CHECK may use current_date here because the
-- condition is monotonic. A date that is valid once stays valid forever, so a
-- dump/restore or a later re-check never rejects a stored row. The database
-- runs in UTC, ahead of Venezuela, so a baptism dated today locally is never
-- "in the future".
--
-- talla_franela has no fixed list: children wear numeric sizes (8, 10, 12) and
-- adults letter sizes (S, M, XL). The CHECK only demands trimmed, upper-case
-- text of 1 to 10 chars, so the import and the forms must store
-- upper(btrim(value)) and NULL for an empty value.
--
-- persona_datos_importados is private on purpose: RLS is enabled with NO policy
-- and anon / authenticated / PUBLIC hold no privilege (the schema's default
-- privileges would otherwise grant them everything). Only privileged code
-- reads or writes it: the import function of T4 (definer rights, revoked from
-- anon and authenticated) and the service role. The unique index on
-- (persona_id, fuente) also serves the ON DELETE CASCADE lookup.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.persona_datos_importados;
--   ALTER TABLE public.usuarios
--     DROP CONSTRAINT IF EXISTS usuarios_fecha_bautizo_no_futura,
--     DROP CONSTRAINT IF EXISTS usuarios_fecha_bautizo_si_bautizado,
--     DROP CONSTRAINT IF EXISTS usuarios_talla_franela_formato,
--     DROP CONSTRAINT IF EXISTS usuarios_redes_sociales_largo,
--     DROP COLUMN IF EXISTS bautizado,
--     DROP COLUMN IF EXISTS fecha_bautizo,
--     DROP COLUMN IF EXISTS talla_franela,
--     DROP COLUMN IF EXISTS redes_sociales;

-- 1. usuarios: the four columns ---------------------------------------------

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS bautizado boolean,
  ADD COLUMN IF NOT EXISTS fecha_bautizo date,
  ADD COLUMN IF NOT EXISTS talla_franela text,
  ADD COLUMN IF NOT EXISTS redes_sociales text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.usuarios'::regclass
       AND conname = 'usuarios_fecha_bautizo_no_futura'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_fecha_bautizo_no_futura
      CHECK (fecha_bautizo <= current_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.usuarios'::regclass
       AND conname = 'usuarios_fecha_bautizo_si_bautizado'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_fecha_bautizo_si_bautizado
      CHECK (fecha_bautizo IS NULL OR bautizado IS DISTINCT FROM false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.usuarios'::regclass
       AND conname = 'usuarios_talla_franela_formato'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_talla_franela_formato
      CHECK (talla_franela = upper(btrim(talla_franela))
             AND char_length(talla_franela) BETWEEN 1 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.usuarios'::regclass
       AND conname = 'usuarios_redes_sociales_largo'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_redes_sociales_largo
      CHECK (char_length(redes_sociales) <= 300);
  END IF;
END;
$$;

COMMENT ON COLUMN public.usuarios.bautizado IS
  'Whether the person is baptized. NULL = unknown (not asked yet).';
COMMENT ON COLUMN public.usuarios.fecha_bautizo IS
  'Baptism date. Never in the future, and only when bautizado is not false '
  '(true or still unknown).';
COMMENT ON COLUMN public.usuarios.talla_franela IS
  'Shirt size for the serving team: free text, trimmed and upper case, 1 to 10 '
  'chars. No fixed list, because children wear numeric sizes (8, 10, 12) and '
  'adults letter sizes (S, M, XL). Store upper(btrim(value)); NULL when unknown.';
COMMENT ON COLUMN public.usuarios.redes_sociales IS
  'Social media handles or links as the person gave them, up to 300 chars.';

-- 2. persona_datos_importados: raw imported columns, private -----------------

CREATE TABLE IF NOT EXISTS public.persona_datos_importados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  fuente text NOT NULL,
  datos jsonb NOT NULL,
  importado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_datos_importados_persona_id_fkey
    FOREIGN KEY (persona_id) REFERENCES public.usuarios (id) ON DELETE CASCADE,
  CONSTRAINT persona_datos_importados_persona_fuente_key
    UNIQUE (persona_id, fuente),
  CONSTRAINT persona_datos_importados_fuente_no_vacia
    CHECK (btrim(fuente) <> ''),
  CONSTRAINT persona_datos_importados_datos_objeto
    CHECK (jsonb_typeof(datos) = 'object')
);

ALTER TABLE public.persona_datos_importados ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.persona_datos_importados FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.persona_datos_importados IS
  'Raw spreadsheet columns of a person that are not modelled yet (talleres '
  'realizados, dones, lenguaje del amor, mentor, otra área, antigüedad, GDV and '
  'leader as text), one row per persona and source (fuente), kept to be '
  'structured later. PRIVATE ON PURPOSE: RLS is enabled with NO policies and '
  'anon / authenticated hold no privilege, so the Data API can neither read nor '
  'write it. Only privileged import code (a definer-rights function revoked '
  'from anon and authenticated, or the service role) touches it. The missing '
  'policies are not a bug: do not add policies or grants to "fix" them.';
COMMENT ON COLUMN public.persona_datos_importados.persona_id IS
  'The usuario the row belongs to. Deleting the usuario deletes its rows.';
COMMENT ON COLUMN public.persona_datos_importados.fuente IS
  'The source of the data, e.g. the spreadsheet and its date '
  '(wland-2026-07). One row per persona and fuente.';
COMMENT ON COLUMN public.persona_datos_importados.datos IS
  'The unmodelled columns as a JSON object, keyed by spreadsheet column.';
COMMENT ON COLUMN public.persona_datos_importados.importado_at IS
  'When the row was imported.';
