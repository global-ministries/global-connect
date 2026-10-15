-- noqa: drop-function, alter-drop-column (rollback note only; ninos_checkout gains an optional 5th argument; the 4-argument form is replaced, not overloaded)
-- Niños coverage G3 (odd/tasks/ninos-cobertura.md, decision D1): at
-- check-out the anfitrión picks who picks up from the child's list.
--
-- Why: ninos_checkout stored any free text as the person who picked up,
-- never checked against the authorized people or the parents.
--
-- What (every function runs with an empty search_path):
--   1. ninos_checkins.retiro_otra_persona / retiro_motivo: a pickup by
--      someone outside the list is flagged with its reason (≤ 300 chars).
--   2. ninos_clave_persona(text) — case- and space-insensitive name key.
--   3. ninos_personas_retiro(nino) — who may pick up one child: the active
--      ninos_autorizados_retiro rows and the linked parents, in both stored
--      link forms (child → padre/madre/tutor, parent → hijo), like
--      ninos_correos_visita. Internal: not executable by API roles.
--   4. ninos_retiro_opciones(codigo, turno, fecha) — the pick list at the
--      door: the people who may pick up EVERY child still inside with that
--      code. Same authority as ninos_checkout (every open check-in of the
--      code in a room the caller operates) plus ninos_puede_operar_algun_area.
--   5. ninos_checkout(codigo, turno, fecha, retirado_por, motivo_otra) —
--      redefined from 20261008140000 keeping every guard (session, who is
--      required, the code's room authority). New: without a reason, the name
--      must be on the list of every child released ('retiro_no_autorizado',
--      22023); with a non-blank reason, any name is accepted and the rows
--      are flagged with the reason.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_checkout(text, uuid, date, text, text);
--   re-run the ninos_checkout block and its REVOKE/GRANT of 20261008140000;
--   DROP FUNCTION IF EXISTS public.ninos_retiro_opciones(text, uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_personas_retiro(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_clave_persona(text);
--   ALTER TABLE public.ninos_checkins DROP COLUMN retiro_motivo, DROP COLUMN retiro_otra_persona;

-- ── 1. flag on the visit ─────────────────────────────────────────────

ALTER TABLE public.ninos_checkins
  ADD COLUMN IF NOT EXISTS retiro_otra_persona boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retiro_motivo text CHECK (retiro_motivo IS NULL OR char_length(retiro_motivo) BETWEEN 1 AND 300);

-- ── 2. name key ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_clave_persona(p_nombre text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'));
$$;
REVOKE ALL ON FUNCTION public.ninos_clave_persona(text) FROM PUBLIC, anon, authenticated;

-- ── 3. who may pick up one child ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_personas_retiro(p_nino_id uuid)
RETURNS TABLE (nombre text, telefono text, relacion text, tipo text)
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT btrim(p.nombre::text || ' ' || coalesce(p.apellido::text, '')), p.telefono::text, 'Representante', 'representante'
    FROM (SELECT r.usuario2_id AS padre_id FROM public.relaciones_usuarios r
           WHERE r.usuario1_id = p_nino_id AND r.tipo_relacion::text IN ('padre', 'madre', 'tutor')
          UNION
          SELECT r.usuario1_id FROM public.relaciones_usuarios r
           WHERE r.usuario2_id = p_nino_id AND r.tipo_relacion::text = 'hijo') l
    JOIN public.usuarios p ON p.id = l.padre_id
  UNION ALL
  SELECT btrim(a.nombre), a.telefono, a.relacion, 'autorizado'
    FROM public.ninos_autorizados_retiro a
   WHERE a.nino_id = p_nino_id AND a.activo;
$$;
REVOKE ALL ON FUNCTION public.ninos_personas_retiro(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. the pick list at the door ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_retiro_opciones(p_codigo text, p_turno_id uuid, p_fecha date)
RETURNS TABLE (nombre text, telefono text, relacion text, tipo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH adentro AS (
    SELECT c.nino_id FROM public.ninos_checkins c
     WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
  ), personas AS (
    SELECT a.nino_id, p.*, public.ninos_clave_persona(p.nombre) AS clave
      FROM adentro a CROSS JOIN LATERAL public.ninos_personas_retiro(a.nino_id) p
  )
  SELECT min(p.nombre), min(p.telefono), min(p.relacion),
         -- A parent of one child who is listed as authorized for another stays a parent.
         CASE WHEN bool_or(p.tipo = 'representante') THEN 'representante' ELSE 'autorizado' END
    FROM personas p
   WHERE p.clave <> ''
   GROUP BY p.clave
  HAVING count(DISTINCT p.nino_id) = (SELECT count(DISTINCT a.nino_id) FROM adentro a)
   ORDER BY bool_or(p.tipo = 'representante') DESC, min(p.nombre);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_retiro_opciones(text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_retiro_opciones(text, uuid, date) TO authenticated;

-- ── 5. check-out ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.ninos_checkout(text, uuid, date, text);

-- Checks out every open check-in with that code in the turno, in the rooms
-- the caller may operate. Returns the children released.
CREATE OR REPLACE FUNCTION public.ninos_checkout(
  p_codigo text, p_turno_id uuid, p_fecha date, p_retirado_por text, p_motivo_otra text DEFAULT NULL
)
RETURNS TABLE (nino_id uuid, salon_id uuid, salida_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_motivo text := nullif(btrim(coalesce(p_motivo_otra, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_retirado_por IS NULL OR btrim(p_retirado_por) = '' THEN
    RAISE EXCEPTION 'p_retirado_por is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(p_retirado_por)) > 200 OR char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to check out this code' USING ERRCODE = '42501';
  END IF;

  -- Without a reason, the person must be on the list of every child released.
  IF v_motivo IS NULL AND EXISTS (
    SELECT 1 FROM public.ninos_checkins c
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.ninos_personas_retiro(c.nino_id) p
                       WHERE public.ninos_clave_persona(p.nombre) = public.ninos_clave_persona(p_retirado_por))
  ) THEN
    RAISE EXCEPTION 'retiro_no_autorizado' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.ninos_checkins c
     SET salida_at = now(), salida_por = v_actor, retirado_por_nombre = btrim(p_retirado_por),
         retiro_otra_persona = (v_motivo IS NOT NULL), retiro_motivo = v_motivo
   WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
  RETURNING c.nino_id, c.salon_id, c.salida_at;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkout(text, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkout(text, uuid, date, text, text) TO authenticated;
