-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: custody restrictions (odd/tasks/ninos-checkin-pco.md, T2e, S9.2).
--
-- Why: S9.2 "Solo coordinación/dirección de Niños" — a restriction (a person
-- who must NOT pick up a child, with a note of its backing, e.g. a court
-- order) is entered on the child's ficha by coordination only; the parent
-- neither sees nor edits it; it shows as an alert at the desk, the salón and
-- the pickup, and the pickup refuses that person. There was no custody data.
--
-- What (every function runs with an empty search_path):
--   1. ninos_custodia_restricciones: nino_id, persona_nombre (who must not
--      pick up), relacion, respaldo (the backing, ≤300), notas (protocol,
--      ≤500), activa, created/updated by and at. RLS on and no privilege for
--      anon / authenticated: only the RPCs below read or write it. One active
--      restriction per child and person (name key below).
--   2. ninos_custodia_clave(text) (internal, immutable): ninos_clave_persona
--      (trim, collapse spaces, lower case) without accents, so «José Pérez»,
--      «JOSE  PEREZ» and «jose perez» are the same person. Stricter than the
--      pickup-list key on purpose: a custody match errs on refusing.
--   3. ninos_custodia_puede(niño) (internal): coordination/dirección of Niños
--      for that child = admin/pastor, or ninos_puede_configurar on an active
--      Niños area of a campus the child is tied to (ninos_en_alcance:
--      usuario_campus or a check-in, of the child or a parent/child one hop
--      away). Anfitriones, líderes, volunteers and parents cannot.
--   4. ninos_custodia_guardar(id, niño, persona, relación, respaldo, notas,
--      activa) → id: create (id NULL) or edit / deactivate, with (3).
--   5. ninos_custodia_lista(niño): every restriction of the child, active or
--      not, for the ficha; with (3).
--   6. ninos_custodia_de(niños[]): the ACTIVE restrictions of those children
--      for the alerts at the desk, the salón and the pickup. Readable by
--      admin/pastor, by whoever operates Niños for a campus the child is tied
--      to (ninos_campus_operables), and by whoever sees the salón the child is
--      checked into today (ninos_puede_ver_salon: líderes). Anyone who
--      neither operates Niños nor sees a salón (parents, volunteers, random
--      users) is refused. Children out of the caller's scope are left out.
--   7. ninos_checkout: the body of 20261108120000 plus one check — when the
--      pickup person's key (2) matches an active restriction of any child
--      released (also as «otra persona» with a reason, and with the whole
--      code), 42501 custodia_restringida with a Spanish HINT; nothing is
--      written. Signature and grants unchanged.
--   8. ninos_retiro_opciones: the body of 20261108120000 plus one condition —
--      a person with an active restriction for any of the marked children is
--      not offered. Signature and grants unchanged.
--
-- Not exposed to parents: no parent-facing RPC (mis hijos, precheck, QR,
-- avisos) reads the table; the suite checks that only (4)–(8) read it. The
-- label (T3) does not print it.
--
-- Errors: the message is a short code the UI maps (sin_autoridad and
-- custodia_restringida 42501; the rest 22023, or 23505 for a duplicate) and
-- the HINT a Spanish sentence the UI can show as is.
--
-- Rollback:
--   re-run blocks 1 and 2 of 20261108120000 (ninos_checkout,
--   ninos_retiro_opciones) with their REVOKE/GRANT, then
--   DROP FUNCTION IF EXISTS public.ninos_custodia_de(uuid[]);
--   DROP FUNCTION IF EXISTS public.ninos_custodia_lista(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_custodia_guardar(uuid, uuid, text, text, text, text, boolean);
--   DROP FUNCTION IF EXISTS public.ninos_custodia_puede(uuid);
--   DROP TABLE IF EXISTS public.ninos_custodia_restricciones;
--   DROP FUNCTION IF EXISTS public.ninos_custodia_clave(text);

-- ── 1. name key ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_custodia_clave(p_nombre text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT translate(public.ninos_clave_persona(p_nombre),
                   'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                   'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc');
$$;
REVOKE ALL ON FUNCTION public.ninos_custodia_clave(text) FROM PUBLIC, anon, authenticated;

-- ── 2. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_custodia_restricciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  persona_nombre text NOT NULL CHECK (char_length(btrim(persona_nombre)) BETWEEN 1 AND 200),
  relacion text CHECK (relacion IS NULL OR char_length(relacion) BETWEEN 1 AND 60),
  respaldo text NOT NULL CHECK (char_length(btrim(respaldo)) BETWEEN 1 AND 300),
  notas text CHECK (notas IS NULL OR char_length(notas) BETWEEN 1 AND 500),
  activa boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ninos_custodia_restricciones_activa_uq
  ON public.ninos_custodia_restricciones (nino_id, public.ninos_custodia_clave(persona_nombre)) WHERE activa;

ALTER TABLE public.ninos_custodia_restricciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ninos_custodia_restricciones FROM PUBLIC, anon, authenticated;

-- ── 3. authority ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_custodia_puede(p_nino_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_nino_id IS NOT NULL AND auth.uid() IS NOT NULL AND public.ninos_usuario_actual() IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR public.ninos_en_alcance(p_nino_id, coalesce(
         (SELECT array_agg(DISTINCT s.campus_id) FROM public.ninos_salones s
           WHERE s.activo AND public.ninos_puede_configurar(s.equipo_id)), '{}'::uuid[]))
  );
$$;
REVOKE ALL ON FUNCTION public.ninos_custodia_puede(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. create / edit / deactivate ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_custodia_guardar(
  p_id uuid, p_nino_id uuid, p_persona_nombre text, p_relacion text, p_respaldo text, p_notas text,
  p_activa boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor    uuid := public.ninos_usuario_actual();
  v_persona  text := btrim(regexp_replace(coalesce(p_persona_nombre, ''), '\s+', ' ', 'g'));
  v_relacion text := nullif(btrim(coalesce(p_relacion, '')), '');
  v_respaldo text := nullif(btrim(coalesce(p_respaldo, '')), '');
  v_notas    text := nullif(btrim(coalesce(p_notas, '')), '');
  v_activa   boolean := coalesce(p_activa, true);
  v_id       uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.ninos_custodia_puede(p_nino_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo coordinación o dirección de Niños puede registrar restricciones de custodia.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023', HINT = 'El niño no existe.';
  END IF;
  IF p_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ninos_custodia_restricciones r WHERE r.id = p_id AND r.nino_id = p_nino_id FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'restriccion_no_encontrada' USING ERRCODE = '22023',
      HINT = 'La restricción no existe para este niño.';
  END IF;

  IF v_persona = '' OR char_length(v_persona) > 200 THEN
    RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023',
      HINT = 'Escribe el nombre de la persona que no puede retirar (hasta 200 caracteres).';
  END IF;
  IF v_respaldo IS NULL OR char_length(v_respaldo) > 300 THEN
    RAISE EXCEPTION 'respaldo_invalido' USING ERRCODE = '22023',
      HINT = 'Indica el respaldo de la restricción (por ejemplo, la orden judicial), hasta 300 caracteres.';
  END IF;
  IF char_length(v_relacion) > 60 THEN
    RAISE EXCEPTION 'relacion_invalida' USING ERRCODE = '22023', HINT = 'La relación admite hasta 60 caracteres.';
  END IF;
  IF char_length(v_notas) > 500 THEN
    RAISE EXCEPTION 'notas_invalidas' USING ERRCODE = '22023', HINT = 'El protocolo admite hasta 500 caracteres.';
  END IF;
  IF v_activa AND EXISTS (
    SELECT 1 FROM public.ninos_custodia_restricciones r
     WHERE r.nino_id = p_nino_id AND r.activa AND r.id IS DISTINCT FROM p_id
       AND public.ninos_custodia_clave(r.persona_nombre) = public.ninos_custodia_clave(v_persona)
  ) THEN
    RAISE EXCEPTION 'restriccion_duplicada' USING ERRCODE = '23505',
      HINT = 'Esta persona ya tiene una restricción activa para este niño.';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.ninos_custodia_restricciones
             (nino_id, persona_nombre, relacion, respaldo, notas, activa, created_by, updated_by)
      VALUES (p_nino_id, v_persona, v_relacion, v_respaldo, v_notas, v_activa, v_actor, v_actor)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.ninos_custodia_restricciones r
         SET persona_nombre = v_persona, relacion = v_relacion, respaldo = v_respaldo, notas = v_notas,
             activa = v_activa, updated_by = v_actor, updated_at = now()
       WHERE r.id = p_id
      RETURNING r.id INTO v_id;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'restriccion_duplicada' USING ERRCODE = '23505',
        HINT = 'Esta persona ya tiene una restricción activa para este niño.';
  END;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_custodia_guardar(uuid, uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_custodia_guardar(uuid, uuid, text, text, text, text, boolean) TO authenticated;

-- ── 5. the ficha list (coordination) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_custodia_lista(p_nino_id uuid)
RETURNS TABLE (id uuid, persona_nombre text, relacion text, respaldo text, notas text, activa boolean,
               created_by uuid, updated_by uuid, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.ninos_custodia_puede(p_nino_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo coordinación o dirección de Niños puede ver las restricciones de custodia de la ficha.';
  END IF;

  RETURN QUERY
  SELECT r.id, r.persona_nombre, r.relacion, r.respaldo, r.notas, r.activa, r.created_by, r.updated_by, r.updated_at
    FROM public.ninos_custodia_restricciones r
   WHERE r.nino_id = p_nino_id
   ORDER BY r.activa DESC, r.created_at, r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_custodia_lista(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_custodia_lista(uuid) TO authenticated;

-- ── 6. the alerts (desk, salón, pickup) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_custodia_de(p_nino_ids uuid[])
RETURNS TABLE (nino_id uuid, persona_nombre text, relacion text, respaldo text, notas text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_campus uuid[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT (
    public.es_admin_o_pastor(auth.uid())
    OR public.ninos_puede_operar_algun_area()
    OR EXISTS (SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s WHERE s.activo) a
                WHERE public.ninos_puede_ver_salon(a.equipo_id))
  ) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo quien opera Niños puede ver las restricciones de custodia.';
  END IF;
  v_campus := public.ninos_campus_operables();

  RETURN QUERY
  SELECT r.nino_id, r.persona_nombre, r.relacion, r.respaldo, r.notas
    FROM public.ninos_custodia_restricciones r
   WHERE r.activa AND r.nino_id = ANY (p_nino_ids)
     AND (public.ninos_en_alcance(r.nino_id, v_campus)
          OR EXISTS (SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
                      WHERE c.nino_id = r.nino_id AND c.fecha = public.ninos_hoy()
                        AND public.ninos_puede_ver_salon(s.equipo_id)))
   ORDER BY r.nino_id, r.created_at, r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_custodia_de(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_custodia_de(uuid[]) TO authenticated;

-- ── 5. check-out refuses the restricted person ──────────────────────

-- Body of 20261108120000 with one check added before the pickup-list check.
CREATE OR REPLACE FUNCTION public.ninos_checkout(
  p_codigo text, p_turno_id uuid, p_fecha date, p_retirado_por text, p_motivo_otra text DEFAULT NULL,
  p_nino_ids uuid[] DEFAULT NULL
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
  IF p_nino_ids IS NOT NULL AND cardinality(p_nino_ids) = 0 THEN
    RAISE EXCEPTION 'sin_ninos' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to check out this code' USING ERRCODE = '42501';
  END IF;

  -- Every marked child is still inside with this code (rows locked, so a
  -- second door waits and then finds the child already out).
  IF p_nino_ids IS NOT NULL AND (
    SELECT count(*) FROM (
      SELECT c.id FROM public.ninos_checkins c
       WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
         AND c.nino_id = ANY (p_nino_ids)
         FOR UPDATE
    ) l
  ) <> (SELECT count(DISTINCT x) FROM unnest(p_nino_ids) x) OR array_position(p_nino_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'nino_no_esta_adentro' USING ERRCODE = '22023';
  END IF;

  -- T2e (S9.2): a person with an active custody restriction for any child
  -- released never takes them, not even as «otra persona» with a reason.
  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c
      JOIN public.ninos_custodia_restricciones r ON r.nino_id = c.nino_id AND r.activa
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
      AND public.ninos_custodia_clave(r.persona_nombre) = public.ninos_custodia_clave(p_retirado_por)
  ) THEN
    RAISE EXCEPTION 'custodia_restringida' USING ERRCODE = '42501',
      HINT = 'Esta persona tiene una restricción de custodia: no puede retirar a este niño. Llama a coordinación.';
  END IF;

  -- Without a reason, the person must be on the list of every child released.
  IF v_motivo IS NULL AND EXISTS (
    SELECT 1 FROM public.ninos_checkins c
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
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
     AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
  RETURNING c.nino_id, c.salon_id, c.salida_at;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkout(text, uuid, date, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkout(text, uuid, date, text, text, uuid[]) TO authenticated;

-- ── 6. the pick list leaves the restricted person out ───────────────

-- Body of 20261108120000 with one condition added to the final WHERE.
CREATE OR REPLACE FUNCTION public.ninos_retiro_opciones(
  p_codigo text, p_turno_id uuid, p_fecha date, p_nino_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (nombre text, telefono text, relacion text, tipo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NOT NULL AND cardinality(p_nino_ids) = 0 THEN
    RAISE EXCEPTION 'sin_ninos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NOT NULL AND (
    (SELECT count(DISTINCT c.nino_id) FROM public.ninos_checkins c
      WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
        AND c.nino_id = ANY (p_nino_ids))
    <> (SELECT count(DISTINCT x) FROM unnest(p_nino_ids) x) OR array_position(p_nino_ids, NULL) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'nino_no_esta_adentro' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH adentro AS (
    SELECT c.nino_id FROM public.ninos_checkins c
     WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
       AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
  ), personas AS (
    SELECT a.nino_id, p.*, public.ninos_clave_persona(p.nombre) AS clave
      FROM adentro a CROSS JOIN LATERAL public.ninos_personas_retiro(a.nino_id) p
  )
  SELECT min(p.nombre), min(p.telefono), min(p.relacion),
         -- A parent of one child who is listed as authorized for another stays a parent.
         CASE WHEN bool_or(p.tipo = 'representante') THEN 'representante' ELSE 'autorizado' END
    FROM personas p
   WHERE p.clave <> ''
     -- T2e (S9.2): nobody with an active custody restriction for a marked child.
     AND NOT EXISTS (SELECT 1 FROM adentro a2
                       JOIN public.ninos_custodia_restricciones r ON r.nino_id = a2.nino_id AND r.activa
                      WHERE public.ninos_custodia_clave(r.persona_nombre) = public.ninos_custodia_clave(p.nombre))
   GROUP BY p.clave
  HAVING count(DISTINCT p.nino_id) = (SELECT count(DISTINCT a.nino_id) FROM adentro a)
   ORDER BY bool_or(p.tipo = 'representante') DESC, min(p.nombre);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_retiro_opciones(text, uuid, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_retiro_opciones(text, uuid, date, uuid[]) TO authenticated;
