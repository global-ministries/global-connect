-- ════════════════════════════════════════════════════════════════════
-- PR29-B — Ediciones globales para Talleres de Crecimiento.
-- Fase 1 (PR29-B en la cadena: design → B → C → D → E).
-- Aditivo: 100% compatible con datos existentes, backfill automático
-- de las ediciones existentes apuntando a una "Edición Legacy".
--
-- Crea:
--   1. public.taller_ediciones_globales (entidad global, "temporada")
--   2. public.taller_edicion_global_participantes (junction 1-N)
--   3. Columna edicion_global_id (nullable FK) en public.taller_ediciones
--
-- Backfill:
--   - Inserta 1 fila "Edición Legacy" (slug='__legacy__') si no existe
--   - Asocia todas las filas de public.taller_ediciones con
--     edicion_global_id IS NULL al legacy id
--   - ON CONFLICT (slug) DO NOTHING → idempotente
--
-- No toca archivos protegidos. Sigue el patrón de Grupos de Vida
-- (temporadas como entidad global, FK desde la local).
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) public.taller_ediciones_globales                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- "Temporada" global que agrupa N ediciones locales. Sigue el
-- patrón de Grupos de Vida (public.temporadas). Estados:
--   borrador → abierto → cerrado (terminal)
--                       → cancelado (terminal)

CREATE TABLE IF NOT EXISTS public.taller_ediciones_globales (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                    text        NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  slug                      text        NOT NULL UNIQUE
                                        CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) BETWEEN 2 AND 80),
  descripcion               text        CHECK (descripcion IS NULL OR length(descripcion) <= 1000),
  fecha_apertura            timestamptz NOT NULL,
  fecha_cierre              timestamptz NOT NULL CHECK (fecha_cierre > fecha_apertura),
  estado                    text        NOT NULL
                                        CHECK (estado IN ('borrador','abierto','cerrado','cancelado')),
  created_by_persona_id     uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  version                   integer     NOT NULL DEFAULT 1
  -- NOTA: el slug '__legacy__' se reserva a nivel de UI (PR29-D
  -- rechaza este valor en el form). NO usamos CHECK constraint aquí
  -- porque el backfill inicial necesita insertar la fila legacy y un
  -- CHECK bloqueante rompería la migration. La unicidad del slug
  -- ya está garantizada por el UNIQUE constraint de arriba.
);

CREATE INDEX IF NOT EXISTS idx_taller_ediciones_globales_estado
  ON public.taller_ediciones_globales(estado);
CREATE INDEX IF NOT EXISTS idx_taller_ediciones_globales_fecha_apertura
  ON public.taller_ediciones_globales(fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS idx_taller_ediciones_globales_fecha_cierre
  ON public.taller_ediciones_globales(fecha_cierre);
-- Partial index: solo globales abiertas (query path caliente para el admin)
CREATE INDEX IF NOT EXISTS idx_taller_ediciones_globales_open
  ON public.taller_ediciones_globales(fecha_cierre)
  WHERE estado = 'abierto';

-- Trigger: setea updated_at antes de cada UPDATE.
-- La función es local al schema public (no contamina global functions).
-- CREATE OR REPLACE para idempotencia.
CREATE OR REPLACE FUNCTION public.fn_set_updated_at_taller_ediciones_globales()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_taller_ediciones_globales
  ON public.taller_ediciones_globales;
CREATE TRIGGER set_updated_at_taller_ediciones_globales
  BEFORE UPDATE ON public.taller_ediciones_globales
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at_taller_ediciones_globales();

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) public.taller_edicion_global_participantes                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Junction 1-N: una edición global puede tener varios talleres y
-- un taller puede participar en varias globales. La participación
-- es independiente de la inscripción de usuarios (los usuarios se
-- inscriben al taller, no a la global — confirmado por usuario
-- 2026-08-16).

CREATE TABLE IF NOT EXISTS public.taller_edicion_global_participantes (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_global_id         uuid        NOT NULL
                                        REFERENCES public.taller_ediciones_globales(id)
                                        ON DELETE CASCADE,
  taller_id                 uuid        NOT NULL
                                        REFERENCES public.talleres(id)
                                        ON DELETE RESTRICT,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE(edicion_global_id, taller_id)
);

CREATE INDEX IF NOT EXISTS idx_teg_participantes_edicion_global
  ON public.taller_edicion_global_participantes(edicion_global_id);
CREATE INDEX IF NOT EXISTS idx_teg_participantes_taller
  ON public.taller_edicion_global_participantes(taller_id);

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) ALTER public.taller_ediciones                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Nullable: ediciones locales sin global siguen funcionando como hoy.
-- ON DELETE SET NULL: si se borra la global, las locales quedan
-- huérfanas (estado válido, admin reasigna via UI).

ALTER TABLE public.taller_ediciones
  ADD COLUMN IF NOT EXISTS edicion_global_id uuid NULL
    REFERENCES public.taller_ediciones_globales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_taller_ediciones_edicion_global
  ON public.taller_ediciones(edicion_global_id)
  WHERE edicion_global_id IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) Backfill — Edición Legacy                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Inserta la fila legacy si no existe, y asocia todas las ediciones
-- locales con edicion_global_id NULL a ella. Idempotente:
--   - ON CONFLICT (slug) DO NOTHING en el INSERT
--   - UPDATE posterior solo afecta filas con edicion_global_id IS NULL
--
-- Envuelto en DO block para resolver el id de la fila legacy de forma
-- determinística (puede haber sido creada en un run previo) y luego
-- apuntar las locales a ese id.

DO $$
DECLARE
  v_legacy_id uuid;
  v_legacy_slug constant text := 'legacy-pre-pr29';
BEGIN
  -- Insertar fila legacy si no existe ya. Slug válido para el CHECK
  -- (^[a-z0-9-]+$) y reservado a nivel de UI en PR29-D — el form de
  -- crear rechazará 'legacy-pre-pr29' con mensaje explícito.
  INSERT INTO public.taller_ediciones_globales (
    nombre, slug, descripcion,
    fecha_apertura, fecha_cierre,
    estado, version
  )
  VALUES (
    'Edición Legacy', v_legacy_slug,
    'Fila técnica creada durante PR29-B para asociar las ediciones existentes previas al modelo global. Slug reservado (no se permite en la UI).',
    '2025-01-01 00:00:00+00'::timestamptz,
    '2030-12-31 23:59:59+00'::timestamptz,
    'borrador', 1
  )
  ON CONFLICT (slug) DO NOTHING;

  -- Resolver el id del legacy (puede ser el recién insertado o uno previo)
  SELECT id INTO v_legacy_id
    FROM public.taller_ediciones_globales
    WHERE slug = v_legacy_slug
    LIMIT 1;

  IF v_legacy_id IS NULL THEN
    RAISE EXCEPTION 'PR29-B backfill: failed to resolve legacy edicion_global_id';
  END IF;

  -- Apuntar todas las ediciones locales huérfanas al legacy
  UPDATE public.taller_ediciones
     SET edicion_global_id = v_legacy_id,
         updated_at = now()
   WHERE edicion_global_id IS NULL;
END $$;