-- T1 (odd/tasks/proximo-paso.md, S1) — a régimen=cadencia taller can
-- anchor its ediciones to the first Sunday of each month.
--
-- WHY
--   Próximo Paso "funciona todos los domingos y comienza cada primer
--   domingo del mes". Today talleres_crear_edicion spaces adelantadas
--   ediciones every intervalo_ediciones_dias (28 for Próximo Paso), which
--   drifts off the month: 2026-10-04 → 2026-11-01 → 2026-11-29. Anchored,
--   each adelantada edición starts on the first Sunday of the following
--   month instead: 2026-10-04 → 2026-11-01 → 2026-12-06 → 2027-01-03, one
--   edición per month (a 5th Sunday stays free).
--
-- WHAT
--   1. talleres.ancla_ediciones text NULL, CHECK IN ('primer_domingo_mes').
--      NULL = no anchor (today's behavior, unchanged). Two more CHECKs keep
--      the configuration unambiguous: an anchor only on régimen=cadencia,
--      and never together with intervalo_ediciones_dias (the director
--      picks one or the other: "Primer domingo de cada mes" vs "Cada N
--      días").
--   2. talleres_crear_edicion — CREATE OR REPLACE from its live definition
--      (20260928140000_talleres_paso6_hardening.sql, the latest one; no
--      later migration replaces it). Only the régimen=cadencia branch
--      changes, and only when the taller is anchored:
--        * p_fecha_inicio must itself be a first Sunday, else P0001
--          FECHA_NO_ES_PRIMER_DOMINGO. Decision: refuse instead of rolling
--          forward silently — a holiday shift is made afterwards on that
--          one edición with talleres_reprogramar_edicion, so the series
--          is always computed from the true first Sunday.
--        * edición i starts on the first Sunday of (month of
--          p_fecha_inicio + i months).
--        * intervalo_ediciones_dias is not required (no SIN_INTERVALO).
--      Unanchored tallers take exactly the previous code path.
--   3. Próximo Paso (slug 'proximo-paso'): anchored, cadencia_dias 7,
--      cierre_inscripcion_offset_dias 0, intervalo_ediciones_dias NULL.
--      Created on the existing "Próximo Paso" node under DPS when the
--      taller does not exist yet (see section 3).
--
-- SAFETY
--   Additive column with NULL default; the CHECKs hold for every existing
--   row (all NULL). Same function signature, so CREATE OR REPLACE keeps
--   its OID; grants restated explicitly (REVOKE PUBLIC/anon, EXECUTE to
--   authenticated/postgres/service_role — the same posture as before).
--   The only data change is the one Próximo Paso row, matched by slug
--   (inserted on its existing node when missing).
--   Grupos de Vida is not referenced.
--
-- ROLLBACK
--   Re-run the talleres_crear_edicion block of
--   20260928140000_talleres_paso6_hardening.sql, then
--   UPDATE public.talleres SET ancla_ediciones = NULL,
--     intervalo_ediciones_dias = 28 WHERE slug = 'proximo-paso';
--   ALTER TABLE public.talleres
--     DROP COLUMN IF EXISTS ancla_ediciones;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. talleres.ancla_ediciones
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS ancla_ediciones text NULL;

ALTER TABLE public.talleres
  DROP CONSTRAINT IF EXISTS talleres_ancla_ediciones_check,
  DROP CONSTRAINT IF EXISTS talleres_ancla_ediciones_requiere_cadencia_check,
  DROP CONSTRAINT IF EXISTS talleres_ancla_ediciones_sin_intervalo_check;

ALTER TABLE public.talleres
  ADD CONSTRAINT talleres_ancla_ediciones_check
    CHECK (ancla_ediciones IS NULL OR ancla_ediciones IN ('primer_domingo_mes')),
  ADD CONSTRAINT talleres_ancla_ediciones_requiere_cadencia_check
    CHECK (ancla_ediciones IS NULL OR regimen = 'cadencia'),
  ADD CONSTRAINT talleres_ancla_ediciones_sin_intervalo_check
    CHECK (ancla_ediciones IS NULL OR intervalo_ediciones_dias IS NULL);

COMMENT ON COLUMN public.talleres.ancla_ediciones IS
  'Ancla de las ediciones de un taller regimen=cadencia (odd/tasks/proximo-paso.md S1): primer_domingo_mes = cada edicion empieza el primer domingo de su mes (una por mes). NULL = sin ancla, las ediciones adelantadas se espacian cada intervalo_ediciones_dias.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. talleres_crear_edicion — anchored cadencia branch
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_crear_edicion(
  p_taller_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_adelantar integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller          public.talleres%ROWTYPE;
  v_equipo_id       uuid;
  v_temporada       public.talleres_temporadas%ROWTYPE;
  v_resultado       jsonb;
  v_ediciones       jsonb := '[]'::jsonb;
  v_nombres_usados  text[] := ARRAY[]::text[];
  v_nombre_final    text;
  v_fecha_i         date;
  v_mes_i           date;
  v_anclado         boolean;
  v_i               integer;
BEGIN
  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  v_equipo_id := v_taller.dream_team_equipo_id;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  -- Item 10 (T7 hardening): an explicit NULL used to make 0..NULL an empty
  -- range below, silently creating zero ediciones instead of one.
  p_adelantar := COALESCE(p_adelantar, 0);

  IF v_taller.regimen = 'temporada' THEN
    IF p_temporada_id IS NULL THEN
      RAISE EXCEPTION 'TEMPORADA_REQUERIDA' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_temporada
    FROM public.talleres_temporadas
    WHERE id = p_temporada_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Item 3 (T7 hardening): authority stays on the taller's own node
    -- (unchanged above) — this only checks the temporada is still
    -- available to receive a new edicion.
    IF v_temporada.estado NOT IN ('borrador', 'abierto') THEN
      RAISE EXCEPTION 'TEMPORADA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.taller_ediciones te
       WHERE te.taller_id = p_taller_id
         AND te.temporada_id = p_temporada_id
         AND public.talleres_estado_efectivo(te) <> 'cancelado'
    ) THEN
      RAISE EXCEPTION 'EDICION_YA_EXISTE' USING ERRCODE = 'P0001';
    END IF;

    v_resultado := public.talleres_instanciar_edicion(
      p_taller_id, v_temporada.fecha_apertura::date, p_temporada_id, NULL
    );

    v_ediciones := v_ediciones || jsonb_build_object(
      'edicion_id', v_resultado ->> 'edicion_id',
      'nombre', v_resultado ->> 'nombre',
      'fecha_inicio', v_resultado ->> 'fecha_inicio',
      'fecha_fin', v_resultado ->> 'fecha_fin',
      'cierre_inscripcion', v_resultado ->> 'cierre_inscripcion',
      'grupos_creados', v_resultado -> 'grupos_creados',
      'clases_por_grupo', v_resultado -> 'clases_por_grupo',
      'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
    );

  ELSE -- regimen = 'cadencia'
    -- COALESCE: a NULL anchor must read as false, or NOT v_anclado below
    -- is NULL too and silently skips SIN_INTERVALO for unanchored tallers.
    v_anclado := COALESCE(v_taller.ancla_ediciones = 'primer_domingo_mes', false);

    IF p_temporada_id IS NOT NULL THEN
      RAISE EXCEPTION 'TEMPORADA_NO_PERMITIDA' USING ERRCODE = 'P0001';
    END IF;
    IF p_fecha_inicio IS NULL THEN
      RAISE EXCEPTION 'FECHA_REQUERIDA' USING ERRCODE = 'P0001';
    END IF;
    -- T1 (proximo-paso, S1): an anchored series is computed from a true
    -- first Sunday; a holiday shift is done afterwards on that one edición
    -- through talleres_reprogramar_edicion.
    IF v_anclado AND NOT (
         extract(isodow FROM p_fecha_inicio) = 7
     AND extract(day FROM p_fecha_inicio) <= 7
    ) THEN
      RAISE EXCEPTION 'FECHA_NO_ES_PRIMER_DOMINGO' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar < 0 THEN
      RAISE EXCEPTION 'ADELANTAR_INVALIDO' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar > 6 THEN
      RAISE EXCEPTION 'ADELANTAR_MAXIMO_6' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar > 0 AND NOT v_anclado AND v_taller.intervalo_ediciones_dias IS NULL THEN
      RAISE EXCEPTION 'SIN_INTERVALO' USING ERRCODE = 'P0001';
    END IF;

    FOR v_i IN 0..p_adelantar LOOP
      IF v_anclado THEN
        -- First Sunday of the i-th month after p_fecha_inicio's own month.
        v_mes_i := (date_trunc('month', p_fecha_inicio) + make_interval(months => v_i))::date;
        v_fecha_i := v_mes_i + ((7 - extract(isodow FROM v_mes_i)::integer) % 7);
      ELSE
        v_fecha_i := p_fecha_inicio + (v_i * COALESCE(v_taller.intervalo_ediciones_dias, 0));
      END IF;

      v_resultado := public.talleres_instanciar_edicion(
        p_taller_id, v_fecha_i, NULL, NULL
      );

      v_nombre_final := v_resultado ->> 'nombre';
      -- talleres_instanciar_edicion (item 11) now ALSO checks the taller's
      -- own existing ediciones for a name collision, so by the time this
      -- runs the returned name may already be disambiguated; this
      -- within-call check stays as a second, harmless layer (it simply
      -- never fires when the DB-level check already renamed it).
      IF v_nombre_final = ANY (v_nombres_usados) THEN
        v_nombre_final := v_nombre_final || ' (' || to_char(v_fecha_i, 'DD') || ')';

        UPDATE public.taller_ediciones
           SET nombre_snapshot = v_nombre_final
         WHERE id = (v_resultado ->> 'edicion_id')::uuid;

        UPDATE public.operating_core_events
           SET title = v_nombre_final,
               metadata = jsonb_set(metadata, '{taller_edicion}', to_jsonb(v_nombre_final))
         WHERE id = (v_resultado ->> 'event_id')::uuid;

        UPDATE public.talleres_crecimiento_cohortes
           SET edicion = v_nombre_final
         WHERE id = (v_resultado ->> 'cohorte_id')::uuid;
      END IF;
      v_nombres_usados := v_nombres_usados || v_nombre_final;

      v_ediciones := v_ediciones || jsonb_build_object(
        'edicion_id', v_resultado ->> 'edicion_id',
        'nombre', v_nombre_final,
        'fecha_inicio', v_resultado ->> 'fecha_inicio',
        'fecha_fin', v_resultado ->> 'fecha_fin',
        'cierre_inscripcion', v_resultado ->> 'cierre_inscripcion',
        'grupos_creados', v_resultado -> 'grupos_creados',
        'clases_por_grupo', v_resultado -> 'clases_por_grupo',
        'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ediciones', v_ediciones);
END;
$function$;

COMMENT ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) IS
  'T1 proximo-paso — by temporada (only p_temporada_id, refuses a second non-cancelled edición of this taller in it; P0001 TEMPORADA_NO_DISPONIBLE when the temporada is not borrador/abierto) or by cadencia (only p_fecha_inicio, optional p_adelantar up to 6, explicit NULL = 0). A cadencia taller anchored with ancla_ediciones = primer_domingo_mes requires p_fecha_inicio to be a first Sunday (P0001 FECHA_NO_ES_PRIMER_DOMINGO) and starts each adelantada edición on the first Sunday of the following months, without intervalo_ediciones_dias; unanchored tallers space them every intervalo_ediciones_dias as before.';

REVOKE ALL ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) TO authenticated, postgres, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Próximo Paso: first Sunday of each month, weekly clases
-- ═══════════════════════════════════════════════════════════════════════

-- Neither staging nor production has the taller yet (verified 2026-11-07):
-- only its Dream Team node "Próximo Paso" under "DPS", which already holds
-- the 4 talleres roles. So the taller is created on that node when missing
-- (the same single row create_taller_abstract inserts for an existing
-- equipo), and configured when present. The node is matched by label and
-- parent label, never by id; zero or several matches leave everything as is.

DO $proximo_paso_taller$
DECLARE
  v_equipo_id uuid;
  v_matches   integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.talleres WHERE slug = 'proximo-paso') THEN
    UPDATE public.talleres
       SET regimen = 'cadencia',
           intervalo_ediciones_dias = NULL,
           ancla_ediciones = 'primer_domingo_mes',
           cadencia_dias = 7,
           cierre_inscripcion_offset_dias = 0
     WHERE slug = 'proximo-paso';
    RETURN;
  END IF;

  SELECT count(*), min(e.id::text)::uuid INTO v_matches, v_equipo_id
    FROM public.dream_team_equipos e
    JOIN public.dream_team_equipos p ON p.id = e.parent_equipo_id
   WHERE e.label = 'Próximo Paso'
     AND p.label = 'DPS';

  IF v_matches <> 1 THEN
    RAISE NOTICE 'Próximo Paso node under DPS matched % rows; taller not created', v_matches;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.talleres WHERE dream_team_equipo_id = v_equipo_id) THEN
    RAISE NOTICE 'Próximo Paso node already holds another taller; taller not created';
    RETURN;
  END IF;

  INSERT INTO public.talleres ( -- noqa: insert-into
    slug, nombre, descripcion, dream_team_equipo_id, tipo, regimen,
    ancla_ediciones, intervalo_ediciones_dias, cadencia_dias,
    cierre_inscripcion_offset_dias
  ) VALUES (
    'proximo-paso', 'Próximo Paso',
    'El primer paso en Global: cuatro clases, una por domingo, desde el primer domingo de cada mes.',
    v_equipo_id, 'individual', 'cadencia',
    'primer_domingo_mes', NULL, 7, 0
  );
END;
$proximo_paso_taller$;
