-- noqa: insert-into
-- DPS planning, phase 1a-1: schema and authority (odd/tasks/dps-asistencia-pco.md,
-- T8a; S6, S7.1-S7.3). The RPCs live in 20261108101000_dps_planificacion_rpcs.sql.
--
-- What:
--   1. Tables (RLS on, no policies, no privilege for anon or authenticated;
--      every read and write goes through the definer functions):
--        dps_puestos          puestos per DPS equipo with the cantidad needed
--                             (S7.2); the nombre is unique per equipo among
--                             the active ones, case-insensitive.
--        dps_series           a series of Sundays (nombre, chart token color,
--                             cover path in the dps-series bucket, semanas,
--                             primer_domingo, sinopsis, enlace_recurso).
--        dps_planes           one plan per fecha and tipo (S7.1: domingo, Cena
--                             del Señor, Noche de adoración, especial, libre);
--                             at most one 'domingo' plan per date. Productor,
--                             host and comunicador are each a persona of the
--                             system or a written name, never both (S7.3).
--                             Creative fields live in `campos` (jsonb object).
--        dps_config           the single row: default horarios and llegada for
--                             new plans.
--        dps_planificadores   people who may build the plan besides the admin,
--                             pastors and the DPS directors (S6.2, S6.3).
--        dps_pasan_asistencia per equipo, whether its coordinators may pass
--                             attendance; no row = inherit from the nearest
--                             ancestor with one, and true at the top.
--   2. Storage bucket 'dps-series' (public read for the covers; written only
--      by the server with the service role, so no storage policies). No other
--      migration in this repo creates a bucket; this one does it idempotently.
--   3. Helpers (definer rights, search_path ''):
--        internal (no EXECUTE for PUBLIC, anon or authenticated):
--          dps_raiz()                  the DPS node: label 'DPS' under the root
--                                      'Dirección de Experiencia' (resolved the
--                                      way 20260911130000 does; no fixed id).
--          dps_equipos()               the active experiencia 'dps' subtree of
--                                      dps_raiz(), with depth and path.
--          dps_equipo_valido(equipo)   the equipo is in dps_equipos().
--          dps_asistencia_habilitada(equipo)  the dps_pasan_asistencia rule.
--          dps_horarios_normalizar(jsonb)     validated, sorted, distinct
--                                      'HH:MM' array (1 to 6), or 22023
--                                      'horarios_invalidos'.
--        for authenticated (they only tell the caller about themselves):
--          dps_puede_planificar()      admin/pastor, dream_team.direct or
--                                      dream_team.org.manage on the DPS node
--                                      (or an ancestor, or global), or a row
--                                      in dps_planificadores.
--          dps_puede_pasar_asistencia(equipo)  the equipo is a DPS equipo and
--                                      the caller plans, or holds
--                                      dream_team.coordinate / .direct on it or
--                                      an ancestor and the equipo is enabled.
--          dps_puede_ver()             plans, holds coordinate / direct on some
--                                      DPS equipo, or has an active servicio in
--                                      one.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_puede_ver(), public.dps_puede_pasar_asistencia(uuid),
--     public.dps_puede_planificar(), public.dps_horarios_normalizar(jsonb),
--     public.dps_asistencia_habilitada(uuid), public.dps_equipo_valido(uuid),
--     public.dps_equipos(), public.dps_raiz();
--   DROP TABLE IF EXISTS public.dps_pasan_asistencia, public.dps_planificadores,
--     public.dps_config, public.dps_planes, public.dps_series, public.dps_puestos;
--   DELETE FROM storage.buckets WHERE id = 'dps-series';  -- only when empty

-- ── 1. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dps_puestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id uuid NOT NULL REFERENCES public.dream_team_equipos(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> '' AND char_length(nombre) <= 80),
  cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad BETWEEN 1 AND 50),
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dps_puestos_nombre_activo_uidx
  ON public.dps_puestos (equipo_id, lower(btrim(nombre))) WHERE activo;

CREATE TABLE IF NOT EXISTS public.dps_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (btrim(nombre) <> '' AND char_length(nombre) <= 120),
  color text NOT NULL DEFAULT 'chart-1' CHECK (color IN ('chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5')),
  imagen_path text CHECK (char_length(imagen_path) <= 300),
  semanas integer NOT NULL CHECK (semanas BETWEEN 1 AND 52),
  primer_domingo date NOT NULL CHECK (extract(dow FROM primer_domingo) = 0),
  sinopsis text CHECK (char_length(sinopsis) <= 4000),
  enlace_recurso text CHECK (char_length(enlace_recurso) <= 500),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dps_planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('domingo', 'cena_del_senor', 'noche_adoracion', 'especial', 'libre')),
  titulo text CHECK (btrim(titulo) <> '' AND char_length(titulo) <= 120),
  serie_id uuid REFERENCES public.dps_series(id) ON DELETE SET NULL,
  semana integer CHECK (semana BETWEEN 1 AND 52),
  horarios jsonb NOT NULL CHECK (jsonb_typeof(horarios) = 'array'),
  llegada time NOT NULL,
  productor_persona_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  productor_texto text CHECK (btrim(productor_texto) <> '' AND char_length(productor_texto) <= 120),
  host_persona_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  host_texto text CHECK (btrim(host_texto) <> '' AND char_length(host_texto) <= 120),
  comunicador_persona_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  comunicador_texto text CHECK (btrim(comunicador_texto) <> '' AND char_length(comunicador_texto) <= 120),
  campos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(campos) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  -- S7.3: a persona of the system or a written name, never both.
  CONSTRAINT dps_planes_productor_uno CHECK (num_nonnulls(productor_persona_id, productor_texto) <= 1),
  CONSTRAINT dps_planes_host_uno CHECK (num_nonnulls(host_persona_id, host_texto) <= 1),
  CONSTRAINT dps_planes_comunicador_uno CHECK (num_nonnulls(comunicador_persona_id, comunicador_texto) <= 1),
  CONSTRAINT dps_planes_semana_con_serie CHECK (serie_id IS NOT NULL OR semana IS NULL),
  CONSTRAINT dps_planes_domingo_en_domingo CHECK (tipo <> 'domingo' OR extract(dow FROM fecha) = 0)
);
-- One Sunday plan per date (a series attaches to it); any other tipo is
-- unique per date and titulo.
CREATE UNIQUE INDEX IF NOT EXISTS dps_planes_domingo_uidx
  ON public.dps_planes (fecha) WHERE tipo = 'domingo';
CREATE UNIQUE INDEX IF NOT EXISTS dps_planes_fecha_tipo_titulo_uidx
  ON public.dps_planes (fecha, tipo, lower(coalesce(titulo, '')));
CREATE INDEX IF NOT EXISTS dps_planes_serie_idx ON public.dps_planes (serie_id, semana);

CREATE TABLE IF NOT EXISTS public.dps_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  horarios jsonb NOT NULL DEFAULT '["09:15", "11:15"]'::jsonb CHECK (jsonb_typeof(horarios) = 'array'),
  llegada time NOT NULL DEFAULT '07:00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);
-- The single configuration row (configuration, not seed data).
INSERT INTO public.dps_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dps_planificadores (
  persona_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  agregado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dps_pasan_asistencia (
  equipo_id uuid PRIMARY KEY REFERENCES public.dream_team_equipos(id) ON DELETE CASCADE,
  habilitado boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.dps_puestos IS 'DPS puestos per equipo with the cantidad needed. Only through the dps_* functions.';
COMMENT ON TABLE public.dps_series IS 'DPS series of Sundays; the cover lives in the dps-series bucket. Only through the dps_* functions.';
COMMENT ON TABLE public.dps_planes IS 'DPS plans: one per fecha and tipo, at most one domingo per date. Only through the dps_* functions.';
COMMENT ON TABLE public.dps_config IS 'DPS planning configuration (single row). Only through the dps_* functions.';
COMMENT ON TABLE public.dps_planificadores IS 'People allowed to build the DPS plan besides admin, pastors and DPS directors.';
COMMENT ON TABLE public.dps_pasan_asistencia IS 'Whether the coordinators of a DPS equipo pass attendance; no row inherits, true at the top.';

ALTER TABLE public.dps_puestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_planificadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_pasan_asistencia ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.dps_puestos, public.dps_series, public.dps_planes, public.dps_config,
  public.dps_planificadores, public.dps_pasan_asistencia FROM PUBLIC, anon, authenticated;

-- ── 2. storage bucket ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dps-series', 'dps-series', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── 3. internal helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_raiz()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT d.id
    FROM public.dream_team_equipos d
    JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
   WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
     AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
   ORDER BY d.created_at, d.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.dps_raiz() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_equipos()
RETURNS TABLE (equipo_id uuid, parent_equipo_id uuid, label text, profundidad integer, ruta text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE arbol AS (
    SELECT e.id, e.parent_equipo_id, e.label, 0 AS profundidad, e.label AS ruta
      FROM public.dream_team_equipos e
     WHERE e.id = public.dps_raiz()
    UNION ALL
    SELECT h.id, h.parent_equipo_id, h.label, a.profundidad + 1, a.ruta || ' › ' || h.label
      FROM public.dream_team_equipos h
      JOIN arbol a ON h.parent_equipo_id = a.id
     WHERE h.activo AND h.experiencia = 'dps' AND a.profundidad < 16
  )
  SELECT a.id, a.parent_equipo_id, a.label, a.profundidad, a.ruta FROM arbol a;
$$;
REVOKE ALL ON FUNCTION public.dps_equipos() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_equipo_valido(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_equipo_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.dps_equipos() d WHERE d.equipo_id = p_equipo_id);
$$;
REVOKE ALL ON FUNCTION public.dps_equipo_valido(uuid) FROM PUBLIC, anon, authenticated;

-- The nearest dps_pasan_asistencia row from the equipo up (itself first);
-- true when none.
CREATE OR REPLACE FUNCTION public.dps_asistencia_habilitada(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE ancestros AS (
    SELECT e.id, e.parent_equipo_id, 0 AS profundidad
      FROM public.dream_team_equipos e WHERE e.id = p_equipo_id
    UNION ALL
    SELECT p.id, p.parent_equipo_id, a.profundidad + 1
      FROM public.dream_team_equipos p
      JOIN ancestros a ON p.id = a.parent_equipo_id
     WHERE a.profundidad < 16
  )
  SELECT coalesce((SELECT pa.habilitado
                     FROM ancestros a
                     JOIN public.dps_pasan_asistencia pa ON pa.equipo_id = a.id
                    ORDER BY a.profundidad
                    LIMIT 1), true);
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_habilitada(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_horarios_normalizar(p_horarios jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF p_horarios IS NULL OR jsonb_typeof(p_horarios) <> 'array' THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_horarios) NOT BETWEEN 1 AND 6
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_horarios) h
                 WHERE jsonb_typeof(h) <> 'string' OR NOT (h #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(DISTINCT h #>> '{}' ORDER BY h #>> '{}') INTO v_resultado
    FROM jsonb_array_elements(p_horarios) h;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_horarios_normalizar(jsonb) FROM PUBLIC, anon, authenticated;

-- ── 4. authority for authenticated ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_puede_planificar()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_usuario_actual() IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR EXISTS (SELECT 1 FROM (SELECT public.dps_raiz() AS id) r
                WHERE r.id IS NOT NULL
                  AND (public.auth_has_dream_team_capability_in_tree('dream_team.direct', r.id)
                       OR public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', r.id)))
    OR EXISTS (SELECT 1 FROM public.dps_planificadores p WHERE p.persona_id = public.ninos_usuario_actual())
  );
$$;
REVOKE ALL ON FUNCTION public.dps_puede_planificar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puede_planificar() TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_puede_pasar_asistencia(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.dps_equipo_valido(p_equipo_id) AND (
    public.dps_puede_planificar()
    OR ((public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', p_equipo_id)
         OR public.auth_has_dream_team_capability_in_tree('dream_team.direct', p_equipo_id))
        AND public.dps_asistencia_habilitada(p_equipo_id))
  );
$$;
REVOKE ALL ON FUNCTION public.dps_puede_pasar_asistencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puede_pasar_asistencia(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_puede_ver()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_usuario_actual() IS NOT NULL AND (
    public.dps_puede_planificar()
    OR EXISTS (SELECT 1
                 FROM public.dream_team_servicios s
                 JOIN public.dps_equipos() d ON d.equipo_id = s.equipo_id
                WHERE s.persona_id = public.ninos_usuario_actual() AND s.estado = 'activo')
    OR EXISTS (SELECT 1 FROM public.dps_equipos() d
                WHERE public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', d.equipo_id)
                   OR public.auth_has_dream_team_capability_in_tree('dream_team.direct', d.equipo_id))
  );
$$;
REVOKE ALL ON FUNCTION public.dps_puede_ver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puede_ver() TO authenticated;
