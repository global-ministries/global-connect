-- ════════════════════════════════════════════════════════════════════
-- PR45 (restructure PR B) — Global season model: `talleres_temporadas`.
-- Fase 5 GdV-parity restructure. Additive + forward-only + idempotent.
--
-- Mirrors Grupos de Vida:
--   - Temporada global (public.talleres_temporadas) ≈ GdV `temporadas`.
--     A season the Director General opens; it decides WHICH talleres
--     open enrollment via the junction below.
--   - Junction (public.talleres_temporada_talleres) ≈ the "elijo qué
--     talleres abren" control surface — one row per (temporada, taller).
--   - Edición local (public.taller_ediciones) gains a nullable
--     temporada_id FK linking each occurrence to its season.
--
-- Revives the PR29-B shape (removed by PR33) under GdV-parity names,
-- with three corrections baked in from the PR29 postmortem:
--   1. created_by_persona_id has NO FK. auth.uid() returns
--      auth.users.id, not public.usuarios.id — the same systemic issue
--      that broke PR29-B inserts (fixed in PR29-F.1). Free-form audit.
--   2. RLS ships WITH the tables (PR29-B shipped none). House style:
--      GRANT to authenticated + REVOKE from PUBLIC/anon + capability
--      policies (see 20260813000001_talleres_abstract.sql).
--   3. Legacy backfill also populates the junction (PR29-F.1 Bug #A:
--      the FK column alone left the admin UI showing 0 talleres).
--
-- ⚠️ LIVE PRODUCTION — zero data loss. The 4 real ediciones orphaned
-- by PR33 are parked under a 'legacy' temporada without mutating any
-- existing value (temporada_id set only where NULL). No destructive
-- DDL on data tables. Authored + tested on a scratch DB; applying to
-- production is the operator's deploy step.
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) talleres_temporadas (global season)                            ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.talleres_temporadas (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text        NOT NULL
                                              CHECK (length(nombre) BETWEEN 2 AND 120),
  -- Stable, human-readable unique key. 'legacy' is reserved for the
  -- backfill parking season and rejected by the create form.
  slug                  text        NOT NULL UNIQUE
                                              CHECK (slug ~ '^[a-z0-9-]+$'
                                                     AND length(slug) BETWEEN 2 AND 80),
  descripcion           text        CHECK (descripcion IS NULL OR length(descripcion) <= 1000),
  fecha_apertura        timestamptz NOT NULL,
  fecha_cierre          timestamptz NOT NULL CHECK (fecha_cierre > fecha_apertura),
  estado                text        NOT NULL DEFAULT 'borrador'
                                              CHECK (estado IN ('borrador','abierto','cerrado','cancelado')),
  -- Audit: who created this temporada. NOT FK-enforced (see header #1).
  created_by_persona_id uuid,
  version               integer     NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.talleres_temporadas.created_by_persona_id IS
  'Audit field: who created this temporada. NOT FK-enforced because auth.uid() returns auth.users.id (not public.usuarios.id). Same systemic issue as dream_team_capability_grants.persona_id. Restore FK in a future PR with an auth_user_id → persona_id mapping table.';

-- Indexes for the dominant read paths (list by estado, order by apertura)
CREATE INDEX IF NOT EXISTS idx_talleres_temporadas_estado
  ON public.talleres_temporadas(estado);
CREATE INDEX IF NOT EXISTS idx_talleres_temporadas_fecha_apertura
  ON public.talleres_temporadas(fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS idx_talleres_temporadas_fecha_cierre
  ON public.talleres_temporadas(fecha_cierre);
-- Partial index for the "open seasons" picker (open-edicion form).
CREATE INDEX IF NOT EXISTS idx_talleres_temporadas_open
  ON public.talleres_temporadas(estado) WHERE estado = 'abierto';

-- updated_at trigger (mirrors set_talleres_updated_at pattern)
CREATE OR REPLACE FUNCTION public.set_talleres_temporadas_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talleres_temporadas_set_updated_at ON public.talleres_temporadas;
CREATE TRIGGER talleres_temporadas_set_updated_at
  BEFORE UPDATE ON public.talleres_temporadas
  FOR EACH ROW EXECUTE FUNCTION public.set_talleres_temporadas_updated_at();

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) talleres_temporada_talleres (junction — "elijo qué talleres    ║
-- ║    abren"). One row per taller opened within a temporada.         ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.talleres_temporada_talleres (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  temporada_id uuid        NOT NULL REFERENCES public.talleres_temporadas(id) ON DELETE CASCADE,
  taller_id    uuid        NOT NULL REFERENCES public.talleres(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (temporada_id, taller_id)
);

CREATE INDEX IF NOT EXISTS idx_talleres_temporada_talleres_temporada
  ON public.talleres_temporada_talleres(temporada_id);
CREATE INDEX IF NOT EXISTS idx_talleres_temporada_talleres_taller
  ON public.talleres_temporada_talleres(taller_id);

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) taller_ediciones.temporada_id (nullable FK to the season)      ║
-- ╚══════════════════════════════════════════════════════════════════╝

ALTER TABLE public.taller_ediciones
  ADD COLUMN IF NOT EXISTS temporada_id uuid
    REFERENCES public.talleres_temporadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_taller_ediciones_temporada_id
  ON public.taller_ediciones(temporada_id) WHERE temporada_id IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) RLS — capability-gated (house style). Only the Director        ║
-- ║    General writes seasons; coordinadores read (metrics.read).     ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- 4.a) talleres_temporadas
ALTER TABLE public.talleres_temporadas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talleres_temporadas TO authenticated;
REVOKE ALL ON TABLE public.talleres_temporadas FROM PUBLIC, anon;

DROP POLICY IF EXISTS "talleres_temporadas_select" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_select" ON public.talleres_temporadas
  FOR SELECT TO authenticated
  USING (
    public.auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    OR public.auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

DROP POLICY IF EXISTS "talleres_temporadas_insert" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_insert" ON public.talleres_temporadas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

DROP POLICY IF EXISTS "talleres_temporadas_update" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_update" ON public.talleres_temporadas
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

DROP POLICY IF EXISTS "talleres_temporadas_delete" ON public.talleres_temporadas;
CREATE POLICY "talleres_temporadas_delete" ON public.talleres_temporadas
  FOR DELETE TO authenticated
  USING (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- 4.b) talleres_temporada_talleres (same gating — admin control surface)
ALTER TABLE public.talleres_temporada_talleres ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talleres_temporada_talleres TO authenticated;
REVOKE ALL ON TABLE public.talleres_temporada_talleres FROM PUBLIC, anon;

DROP POLICY IF EXISTS "talleres_temporada_talleres_select" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_select" ON public.talleres_temporada_talleres
  FOR SELECT TO authenticated
  USING (
    public.auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    OR public.auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

DROP POLICY IF EXISTS "talleres_temporada_talleres_insert" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_insert" ON public.talleres_temporada_talleres
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

DROP POLICY IF EXISTS "talleres_temporada_talleres_update" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_update" ON public.talleres_temporada_talleres
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

DROP POLICY IF EXISTS "talleres_temporada_talleres_delete" ON public.talleres_temporada_talleres;
CREATE POLICY "talleres_temporada_talleres_delete" ON public.talleres_temporada_talleres
  FOR DELETE TO authenticated
  USING (
    public.auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 5) Idempotent legacy backfill — park orphan ediciones. LIVE PROD. ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Strategy (all idempotent — safe to re-run):
--   1. Create the 'legacy' parking temporada (ON CONFLICT DO NOTHING).
--   2. Point orphan ediciones (temporada_id IS NULL) at it. Never
--      overwrites a row that already has a temporada.
--   3. Backfill the junction from ediciones so the admin UI shows the
--      real talleres under Legacy (PR29-F.1 Bug #A). Only 'active'
--      talleres; ON CONFLICT preserves manual edits.

DO $do$
DECLARE
  v_legacy_id uuid;
  v_ediciones INTEGER;
  v_junction  INTEGER;
BEGIN
  INSERT INTO public.talleres_temporadas (nombre, slug, descripcion, fecha_apertura, fecha_cierre, estado)
  VALUES (
    'Temporada Legacy',
    'legacy',
    'Temporada de parqueo para ediciones creadas antes del modelo de temporadas globales.',
    timestamptz '2025-01-01 00:00:00+00',
    timestamptz '2030-12-31 23:59:59+00',
    'borrador'
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_legacy_id FROM public.talleres_temporadas WHERE slug = 'legacy';

  UPDATE public.taller_ediciones
  SET temporada_id = v_legacy_id
  WHERE temporada_id IS NULL;
  GET DIAGNOSTICS v_ediciones = ROW_COUNT;

  INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
  SELECT DISTINCT te.temporada_id, t.id
  FROM public.taller_ediciones te
  JOIN public.talleres t ON t.id = te.taller_id
  WHERE te.temporada_id IS NOT NULL
    AND t.estado = 'active'
  ON CONFLICT (temporada_id, taller_id) DO NOTHING;
  GET DIAGNOSTICS v_junction = ROW_COUNT;

  RAISE NOTICE 'PR45 backfill: parked % ediciones under legacy, added % junction rows', v_ediciones, v_junction;
END
$do$;
