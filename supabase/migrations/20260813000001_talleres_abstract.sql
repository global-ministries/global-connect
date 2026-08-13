-- ════════════════════════════════════════════════════════════════════
-- PR23.1 — Talleres M5.5: `talleres` (abstract) catalog.
-- Fase 5.5 (operating). Additive only, no destructive DDL (I-6).
--
-- The new `talleres` table is the abstract workshop definition —
-- "Matrimonio sobre la Roca" — distinct from
-- `talleres_crecimiento_metadata` (a.k.a. PR23.2: `taller_ediciones`)
-- which represents a specific *occurrence* of that taller, e.g.
-- "Matrimonio sobre la Roca — Otoño 2026". One taller can have many
-- ediciones; each edicion is a row in `talleres_crecimiento_metadata`.
--
-- This migration adds the new table, its RLS policies, and a data
-- migration that backfills the existing `talleres_crecimiento_metadata`
-- rows into `talleres` (idempotent — IF NOT EXISTS guard).
--
-- The `talleres_crecimiento_metadata` table is NOT renamed in this PR
-- — that happens in PR23.2 once the rest of the FK chain is updated.
-- This PR only adds the abstract catalog. The form at
-- /admin/talleres/abstracto/nuevo is added; the legacy form at
-- /admin/talleres/nuevo is preserved (PR21.1) until PR23.2 lands.
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) talleres (abstract catalog)                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.talleres (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable, human-readable unique key. Used by the open_edicion RPC
  -- (PR23.2) to attach an edicion to its abstract taller.
  slug                  text        UNIQUE NOT NULL
                                              CHECK (slug ~ '^[a-z0-9-]+$'
                                                     AND length(slug) BETWEEN 2 AND 80),
  nombre                text        NOT NULL
                                              CHECK (length(nombre) BETWEEN 2 AND 200),
  descripcion           text        CHECK (descripcion IS NULL OR length(descripcion) <= 2000),
  -- Default modality for ediciones of this taller. Per-edicion
  -- override lives in `talleres_crecimiento_metadata.modalidad_inscripcion`.
  modalidad_default     text        NOT NULL DEFAULT 'periodo_general'
                                              CHECK (modalidad_default IN ('periodo_general','permanente_custom')),
  -- 'active' talleres are browsable by participants; 'archived' is
  -- admin-only and not exposed in the explorar UI.
  estado                text        NOT NULL DEFAULT 'active'
                                              CHECK (estado IN ('active', 'archived')),
  -- Audit: who created this taller (resolved via usuarios.auth_id).
  created_by_persona_id uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  version               integer     NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the dominant read paths
CREATE INDEX IF NOT EXISTS idx_talleres_estado ON public.talleres(estado);
CREATE INDEX IF NOT EXISTS idx_talleres_modalidad_default
  ON public.talleres(modalidad_default) WHERE modalidad_default = 'periodo_general';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_talleres_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talleres_set_updated_at ON public.talleres;
CREATE TRIGGER talleres_set_updated_at
  BEFORE UPDATE ON public.talleres
  FOR EACH ROW EXECUTE FUNCTION public.set_talleres_updated_at();

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) Data migration: backfill from talleres_crecimiento_metadata     ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Idempotent: only inserts if the slug is not already present in
-- public.talleres. The slug is derived from the first 80 chars of
-- the existing taller's edicion field (e.g. 'otoño-2026' becomes
-- 'otono-2026' via a safe regex/normalize).
INSERT INTO public.talleres (slug, nombre, modalidad_default, estado, created_at, version)
SELECT
  -- Slug: lowercase, replace non-alphanumeric with '-', trim leading/trailing '-'
  -- Cap at 80 chars. The slug must be unique; we add a collision suffix
  -- (-2, -3, ...) if a duplicate arises from different raw values.
  lower(regexp_replace(regexp_replace(left(tcm.nombre_snapshot, 80), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g')),
  tcm.nombre_snapshot,
  tcm.modalidad_inscripcion,
  'active',
  tcm.created_at,
  1
FROM public.talleres_crecimiento_metadata tcm
WHERE NOT EXISTS (
  SELECT 1 FROM public.talleres t
  WHERE lower(regexp_replace(regexp_replace(left(tcm.nombre_snapshot, 80), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g')) = t.slug
);

-- Add the new taller_id column to talleres_crecimiento_metadata
-- (nullable for now, populated by PR23.2's data migration when
-- ediciones are backfilled to point at their abstract parent).
ALTER TABLE public.talleres_crecimiento_metadata
  ADD COLUMN IF NOT EXISTS taller_id uuid REFERENCES public.talleres(id) ON DELETE RESTRICT;

-- Backfill taller_id on existing ediciones: each edicion is linked
-- to the taller whose nombre matches its nombre_snapshot. This is a
-- best-effort guess — for talleres with the same name but multiple
-- editions, the FIRST taller wins. Idempotent.
UPDATE public.talleres_crecimiento_metadata tcm
SET taller_id = t.id
FROM public.talleres t
WHERE tcm.taller_id IS NULL
  AND t.slug = lower(regexp_replace(regexp_replace(left(tcm.nombre_snapshot, 80), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));

-- Index for the taller_id join (used by PR23.2 RPCs and queries)
CREATE INDEX IF NOT EXISTS idx_talleres_crecimiento_metadata_taller_id
  ON public.talleres_crecimiento_metadata(taller_id)
  WHERE taller_id IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) RLS policies for public.talleres                             ║
-- ╚══════════════════════════════════════════════════════════════════╝

ALTER TABLE public.talleres ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talleres TO authenticated;
REVOKE ALL ON TABLE public.talleres FROM PUBLIC, anon;

DROP POLICY IF EXISTS "talleres_select_all" ON public.talleres;
CREATE POLICY "talleres_select_all" ON public.talleres
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "talleres_insert_director" ON public.talleres;
CREATE POLICY "talleres_insert_director" ON public.talleres
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_talleres_capability('talleres_crecimiento.director.write'));

DROP POLICY IF EXISTS "talleres_update_director" ON public.talleres;
CREATE POLICY "talleres_update_director" ON public.talleres
  FOR UPDATE TO authenticated
  USING (public.auth_has_talleres_capability('talleres_crecimiento.director.write'))
  WITH CHECK (public.auth_has_talleres_capability('talleres_crecimiento.director.write'));

DROP POLICY IF EXISTS "talleres_delete_director" ON public.talleres;
CREATE POLICY "talleres_delete_director" ON public.talleres
  FOR DELETE TO authenticated
  USING (public.auth_has_talleres_capability('talleres_crecimiento.director.write'));

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) RPC: create_taller_abstract                                   ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.create_taller_abstract(
  p_nombre            text,
  p_descripcion       text,
  p_modalidad_default text,
  p_slug              text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_taller       talleres%ROWTYPE;
  v_normalized   text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'NOMBRE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF length(trim(p_nombre)) > 200 THEN
    RAISE EXCEPTION 'NOMBRE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_descripcion IS NOT NULL AND length(p_descripcion) > 2000 THEN
    RAISE EXCEPTION 'DESCRIPCION_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_default NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_default USING ERRCODE = '22023';
  END IF;

  -- Slug: if not provided, derive from nombre. Normalize: lowercase,
  -- replace non-alphanumeric with '-', collapse multiple '-'.
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    v_normalized := lower(regexp_replace(regexp_replace(trim(p_nombre), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));
    v_normalized := trim(BOTH '-' FROM v_normalized);
    v_normalized := left(v_normalized, 80);
    IF length(v_normalized) < 2 THEN
      RAISE EXCEPTION 'SLUG_TOO_SHORT' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_normalized := trim(p_slug);
    IF v_normalized !~ '^[a-z0-9-]+$' OR length(v_normalized) < 2 OR length(v_normalized) > 80 THEN
      RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Insert (UNIQUE constraint on slug; if duplicate, return existing).
  INSERT INTO public.talleres (slug, nombre, descripcion, modalidad_default, estado)
  VALUES (v_normalized, trim(p_nombre), NULLIF(trim(p_descripcion), ''), p_modalidad_default, 'active')
  ON CONFLICT (slug) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion
  RETURNING * INTO v_taller;

  RETURN jsonb_build_object(
    'taller_id', v_taller.id,
    'slug', v_taller.slug,
    'nombre', v_taller.nombre,
    'modalidad_default', v_taller.modalidad_default,
    'estado', v_taller.estado,
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.create_taller_abstract(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_taller_abstract(text, text, text, text) TO authenticated;
