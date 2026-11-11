-- T8b (odd/tasks/talleres-reserva-publica.md, S17) — recover a missed clase.
--
-- WHY
--   S17 (L6, decision 7): "si el minimo de clases para aprobar debe ser
--   configurable pero tambien hacer excepcion que si falto a una clase la
--   pueda recuperar aparte para no perder el taller". The minimum already
--   exists (talleres.clases_minimas_para_completar, 20261003140000, edited
--   in Configuración). What is missing is the exception: a person marked
--   ausente in a clase can take it apart (another grupo, a meeting with the
--   facilitadora) and it then counts as attended for the certificate
--   (approved artboards 14, 16, 17, 10).
--
-- WHAT
--   A. talleres.permite_recuperar_clases boolean NOT NULL DEFAULT true — the
--      «Recuperar clases aparte» switch. Written like the rest of the
--      taller configuration (direct UPDATE through talleres_update_director).
--   B. taller_recuperaciones: one row per (sesión, persona) recovered:
--      fecha, dada_por (who gave it), nota (<= 300), created_by/created_at.
--      RLS: SELECT mirrors taller_asistencias_select (director.read,
--      coordinator.read, lead.read scoped to the grupo's node, or a member
--      of the grupo); no write policy — the two RPCs below are the only
--      write path, as talleres_registrar_asistencia is for attendance.
--   C. talleres_registrar_recuperacion(p_sesion_id, p_persona_id, p_fecha,
--      p_dada_por, p_nota): authority = the grupo's líder
--      (talleres_rol_en_grupo = 'lider', as in 20260925090000) or
--      director.write / coordinator.write scoped to the grupo's node.
--      Only for a person whose aprobada inscription is in that grupo and who
--      is marked ausente in that sesión, once the sesión is cerrada; refused
--      when the taller does not allow recoveries, when the edición is
--      already closed (its certificates were emitted), for a future fecha
--      or one before the clase. dada_por defaults to the caller.
--   D. talleres_anular_recuperacion(p_id): same authority; deletes the row
--      (the person is ausente again and may be recovered later). Refused
--      once the edición is closed. It does not depend on the switch, so a
--      wrong row can still be removed after the taller turns it off.
--   E. talleres_cierre_resultados: clases_presente now counts the held
--      clases where the inscription is presente OR its principal has a
--      recovery for that sesión. One count per sesión, so a recovery on a
--      presente mark (impossible through C, but cheap to guard) never
--      counts twice. Same signature and columns; talleres_previsualizar_
--      cierre and talleres_cerrar_edicion read from it and are NOT
--      recreated. A recovery only counts while the switch is on: turning
--      it off returns the taller to strict attendance at the next close.
--
-- NOT CHANGED
--   obtener_asistencia_persona (Usuarios ficha) keeps the raw marks: a
--   recovered clase still reads as an absence there (noted in the ODD log).
--   taller_asistencias and its write function are untouched.
--
-- SAFETY
--   Additive column with a constant default (no table rewrite on PG 11+),
--   one new table, three functions. Functions default-deny: REVOKE ALL FROM
--   PUBLIC, anon; the two RPCs are granted to authenticated and
--   service_role; search_path '' with every name qualified.
--
-- ROLLBACK
--   DROP FUNCTION public.talleres_anular_recuperacion(uuid);
--   DROP FUNCTION public.talleres_registrar_recuperacion(uuid, uuid, date, uuid, text);
--   DROP TABLE IF EXISTS public.taller_recuperaciones;
--   ALTER TABLE public.talleres DROP COLUMN permite_recuperar_clases;
--   then recreate talleres_cierre_resultados from
--   20261003140000_talleres_cierre_de_edicion.sql (section D).

-- ===========================================================================
-- A. The switch
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN permite_recuperar_clases boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.talleres.permite_recuperar_clases IS
  'Recuperar clases aparte (S17): when true, the grupo''s líder or the coordinación can register that a person recovered a clase they missed (taller_recuperaciones), and it counts as attended at the cierre. When false, talleres_registrar_recuperacion refuses and existing recoveries stop counting.';

-- ===========================================================================
-- B. The recovery record
-- ===========================================================================

CREATE TABLE public.taller_recuperaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id uuid NOT NULL REFERENCES public.taller_sesiones(id) ON DELETE RESTRICT,
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  dada_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  nota text NULL CONSTRAINT taller_recuperaciones_nota_largo CHECK (nota IS NULL OR char_length(nota) <= 300),
  created_by uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taller_recuperaciones_sesion_persona_unique UNIQUE (sesion_id, persona_id)
);

-- The UNIQUE index leads with sesion_id; these cover the other two FKs that
-- a usuarios delete has to check, and the cierre lookup by persona.
CREATE INDEX idx_taller_recuperaciones_persona ON public.taller_recuperaciones (persona_id, sesion_id);
CREATE INDEX idx_taller_recuperaciones_dada_por ON public.taller_recuperaciones (dada_por);

COMMENT ON TABLE public.taller_recuperaciones IS
  'S17: a clase a person missed (ausente in a cerrada sesión) and recovered apart. persona_id = the inscription''s principal (taller_asistencias.persona_id). Counts as attended in talleres_cierre_resultados while talleres.permite_recuperar_clases is on. Written only by talleres_registrar_recuperacion / talleres_anular_recuperacion.';

ALTER TABLE public.taller_recuperaciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.taller_recuperaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.taller_recuperaciones TO authenticated;
GRANT ALL ON public.taller_recuperaciones TO service_role;

-- Same readers as taller_asistencias_select (20260924150000): the
-- grupo's node read capabilities, or a member of the grupo.
CREATE POLICY taller_recuperaciones_select ON public.taller_recuperaciones
  FOR SELECT TO authenticated
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read',
      public.talleres_equipo_de_grupo((SELECT s.grupo_id FROM public.taller_sesiones s WHERE s.id = sesion_id)))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read',
      public.talleres_equipo_de_grupo((SELECT s.grupo_id FROM public.taller_sesiones s WHERE s.id = sesion_id)))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read',
      public.talleres_equipo_de_grupo((SELECT s.grupo_id FROM public.taller_sesiones s WHERE s.id = sesion_id)))
    OR public.talleres_es_miembro_del_grupo((SELECT s.grupo_id FROM public.taller_sesiones s WHERE s.id = sesion_id))
  );

-- ===========================================================================
-- C. Register a recovery
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_registrar_recuperacion(
  p_sesion_id uuid,
  p_persona_id uuid,
  p_fecha date,
  p_dada_por uuid DEFAULT NULL,
  p_nota text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_sesion record;
  v_equipo_id uuid;
  v_yo uuid;
  v_dada_por uuid;
  v_nota text;
  v_id uuid;
BEGIN
  SELECT s.id, s.grupo_id, s.estado, COALESCE(s.fecha_realizada, s.fecha_programada) AS fecha_clase,
         t.permite_recuperar_clases, e.cerrada_en
    INTO v_sesion
    FROM public.taller_sesiones s
    JOIN public.taller_grupos g ON g.id = s.grupo_id
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones e ON e.id = c.taller_id
    LEFT JOIN public.talleres t ON t.id = e.taller_id
   WHERE s.id = p_sesion_id;

  IF v_sesion.id IS NULL THEN
    RAISE EXCEPTION 'SESION_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;

  -- Authority first, so an outsider learns nothing about the clase.
  -- IS NOT DISTINCT FROM: talleres_rol_en_grupo is NULL for an outsider.
  v_equipo_id := public.talleres_equipo_de_grupo(v_sesion.grupo_id);
  IF NOT (
       public.talleres_rol_en_grupo(v_sesion.grupo_id) IS NOT DISTINCT FROM 'lider'
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
  END IF;

  IF v_sesion.permite_recuperar_clases IS NOT TRUE THEN
    RAISE EXCEPTION 'RECUPERACION_NO_PERMITIDA' USING ERRCODE = 'P0001';
  END IF;
  IF v_sesion.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_YA_CERRADA' USING ERRCODE = 'P0001';
  END IF;
  IF v_sesion.estado IS DISTINCT FROM 'cerrada' THEN
    RAISE EXCEPTION 'CLASE_NO_CERRADA' USING ERRCODE = 'P0001';
  END IF;

  -- The person's aprobada inscription in THIS grupo, marked ausente here.
  IF NOT EXISTS (
    SELECT 1
      FROM public.taller_inscripciones i
      JOIN public.taller_asistencias a ON a.inscripcion_id = i.id AND a.sesion_id = p_sesion_id
     WHERE i.grupo_id = v_sesion.grupo_id
       AND i.estado = 'aprobado'
       AND i.persona_principal_id = p_persona_id
       AND a.estado = 'ausente'
  ) THEN
    RAISE EXCEPTION 'PERSONA_NO_AUSENTE' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'FECHA_RECUPERACION_REQUERIDA' USING ERRCODE = 'P0001';
  END IF;
  IF p_fecha > public.talleres_hoy() THEN
    RAISE EXCEPTION 'FECHA_RECUPERACION_FUTURA' USING ERRCODE = 'P0001';
  END IF;
  IF p_fecha < v_sesion.fecha_clase THEN
    RAISE EXCEPTION 'FECHA_RECUPERACION_ANTES_DE_LA_CLASE' USING ERRCODE = 'P0001';
  END IF;

  v_nota := NULLIF(btrim(COALESCE(p_nota, '')), '');
  IF v_nota IS NOT NULL AND char_length(v_nota) > 300 THEN
    RAISE EXCEPTION 'NOTA_DEMASIADO_LARGA' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id INTO v_yo FROM public.usuarios u WHERE u.auth_id = auth.uid();
  v_dada_por := COALESCE(p_dada_por, v_yo);
  IF v_dada_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_dada_por) THEN
    RAISE EXCEPTION 'DADA_POR_INVALIDA' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.taller_recuperaciones (sesion_id, persona_id, fecha, dada_por, nota, created_by)
  VALUES (p_sesion_id, p_persona_id, p_fecha, v_dada_por, v_nota, v_yo)
  ON CONFLICT ON CONSTRAINT taller_recuperaciones_sesion_persona_unique DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'RECUPERACION_YA_REGISTRADA' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'sesion_id', p_sesion_id,
    'persona_id', p_persona_id,
    'fecha', p_fecha,
    'dada_por', v_dada_por
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_registrar_recuperacion(uuid, uuid, date, uuid, text) IS
  'S17 — registers that a person recovered a clase they missed; it counts as attended at the cierre. Authority: the grupo''s líder or director.write/coordinator.write scoped to the grupo''s node (else 42501 sin_permisos_para_este_grupo). P0001: SESION_NO_ENCONTRADA, RECUPERACION_NO_PERMITIDA (switch off), EDICION_YA_CERRADA, CLASE_NO_CERRADA, PERSONA_NO_AUSENTE (no aprobada inscription in the grupo marked ausente there), FECHA_RECUPERACION_REQUERIDA, FECHA_RECUPERACION_FUTURA, FECHA_RECUPERACION_ANTES_DE_LA_CLASE, NOTA_DEMASIADO_LARGA (> 300), DADA_POR_INVALIDA, RECUPERACION_YA_REGISTRADA. dada_por defaults to the caller. Returns {id, sesion_id, persona_id, fecha, dada_por}.';

REVOKE ALL ON FUNCTION public.talleres_registrar_recuperacion(uuid, uuid, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_registrar_recuperacion(uuid, uuid, date, uuid, text) TO authenticated, service_role;

-- ===========================================================================
-- D. Undo a recovery
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_anular_recuperacion(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rec record;
  v_equipo_id uuid;
BEGIN
  SELECT r.id, s.grupo_id, e.cerrada_en
    INTO v_rec
    FROM public.taller_recuperaciones r
    JOIN public.taller_sesiones s ON s.id = r.sesion_id
    JOIN public.taller_grupos g ON g.id = s.grupo_id
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones e ON e.id = c.taller_id
   WHERE r.id = p_id
     FOR UPDATE OF r;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'RECUPERACION_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;

  v_equipo_id := public.talleres_equipo_de_grupo(v_rec.grupo_id);
  IF NOT (
       public.talleres_rol_en_grupo(v_rec.grupo_id) IS NOT DISTINCT FROM 'lider'
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
  END IF;

  IF v_rec.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_YA_CERRADA' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.taller_recuperaciones WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'anulada', true);
END;
$function$;

COMMENT ON FUNCTION public.talleres_anular_recuperacion(uuid) IS
  'S17 — removes a recovery (the clase reads as ausente again). Same authority as talleres_registrar_recuperacion (else 42501). P0001 RECUPERACION_NO_ENCONTRADA, EDICION_YA_CERRADA. Returns {id, anulada: true}.';

REVOKE ALL ON FUNCTION public.talleres_anular_recuperacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_anular_recuperacion(uuid) TO authenticated, service_role;

-- ===========================================================================
-- E. The cierre counts a recovered clase as attended
-- ===========================================================================

-- Body of 20261003140000 section D; the only change is the `presente`
-- filter: a held sesión counts when the inscription is presente there OR
-- (the taller allows recoveries AND its principal recovered that sesión).
-- Counting sesiones, not marks, keeps it at one per clase.
CREATE OR REPLACE FUNCTION public.talleres_cierre_resultados(p_edicion_id uuid)
RETURNS TABLE (
  inscripcion_id uuid,
  persona_id uuid,
  persona_nombre text,
  companero_nombre text,
  grupo_id uuid,
  grupo_nombre text,
  clases_presente integer,
  clases_total integer,
  minimo integer,
  resultado text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    i.id,
    i.persona_principal_id,
    btrim(concat_ws(' ', up.nombre, up.apellido)),
    CASE
      WHEN i.companero_id IS NULL THEN NULL
      ELSE btrim(concat_ws(' ', uc.nombre, uc.apellido))
    END,
    i.grupo_id,
    g.nombre,
    k.presente,
    k.total,
    m.minimo,
    CASE
      WHEN k.presente = 0 THEN 'abandono'
      WHEN k.total >= 1 AND k.presente >= m.minimo THEN 'completado'
      ELSE 'no_completado'
    END
  FROM public.taller_inscripciones i
  JOIN public.taller_ediciones e ON e.id = i.taller_id
  LEFT JOIN public.talleres t ON t.id = e.taller_id
  JOIN public.usuarios up ON up.id = i.persona_principal_id
  LEFT JOIN public.usuarios uc ON uc.id = i.companero_id
  LEFT JOIN public.taller_grupos g ON g.id = i.grupo_id
  CROSS JOIN LATERAL (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
            FROM public.taller_asistencias a
           WHERE a.sesion_id = s.id
             AND a.inscripcion_id = i.id
             AND a.estado = 'presente'
        )
        OR (
          COALESCE(t.permite_recuperar_clases, true)
          AND EXISTS (
            SELECT 1
              FROM public.taller_recuperaciones r
             WHERE r.sesion_id = s.id
               AND r.persona_id = i.persona_principal_id
          )
        )
      )::integer AS presente
    FROM public.taller_sesiones s
    WHERE s.grupo_id = i.grupo_id
      AND s.estado IN ('en_curso', 'cerrada')
  ) k
  CROSS JOIN LATERAL (
    SELECT GREATEST(1, LEAST(COALESCE(t.clases_minimas_para_completar, k.total), k.total))::integer AS minimo
  ) m
  WHERE i.taller_id = p_edicion_id
    AND i.estado = 'aprobado';
$$;

COMMENT ON FUNCTION public.talleres_cierre_resultados(uuid) IS
  'Internal (cierre de edicion): one row per aprobado inscription of the edicion with clases_presente (held clases attended: presente, or recovered apart in taller_recuperaciones while talleres.permite_recuperar_clases is on; one per clase), clases_total (held = en_curso|cerrada classes of its own grupo), the effective minimo and the resultado completado|no_completado|abandono. Shared by talleres_previsualizar_cierre and talleres_cerrar_edicion so both compute the same thing. Not executable by authenticated.';

REVOKE ALL ON FUNCTION public.talleres_cierre_resultados(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_cierre_resultados(uuid) TO postgres, service_role;
