-- T1 (odd/tasks/talleres-cierre-de-edicion.md) — closing an edición.
-- Closes the Taller → Edición → Grupo → Clase → Asistencia → Reporte →
-- Certificado cycle: the director closes the edición, the system computes
-- who completed from the attendance and emits the certificates
-- (docs/talleres-de-punta-a-punta.md §12.3).
--
-- Adds:
--   A. talleres.clases_minimas_para_completar (NULL = every class held).
--   B. taller_ediciones.cerrada_en / cerrada_por.
--   B2. A guard so only talleres_cerrar_edicion can write cerrada_en /
--      cerrada_por (transaction-local flag, like talleres.sobre_cupo_
--      autorizado). Reopening is not designed: nobody can clear them.
--   C. talleres_estado_efectivo(taller_ediciones) returns 'cerrado' once
--      cerrada_en is set.
--   D. talleres_cierre_resultados(uuid): the ONE per-inscription
--      computation (internal, never granted to authenticated).
--   E. talleres_previsualizar_cierre(uuid): read-only preview.
--   E2. One certificate per PERSON (user decision 2026-10-02): in a couple
--      inscription the principal and the companero each get their own
--      certificate, which also names the other one. UNIQUE (inscripcion_id)
--      becomes UNIQUE (inscripcion_id, persona_id), plus
--      nombre_pareja_snapshot and three internal helpers (code, firmantes,
--      emit one person's certificate).
--   F. talleres_cerrar_edicion(uuid): the close, in one transaction.
--   G. emit_taller_certificado(uuid, text): same signature and return keys,
--      now also emits the companero's certificate (extra key
--      `certificados`).
--   H. taller_inscripciones_select gains one read branch: the row's
--      companero_id is the caller.
--
-- Dependents of the old UNIQUE (inscripcion_id), checked on STAGING: no
-- foreign key references taller_certificados, no view reads it, its only
-- index is the constraint's own; the one live function with ON CONFLICT
-- (inscripcion_id) is emit_taller_certificado, redefined in G. The new
-- constraint leads with inscripcion_id, so lookups by inscription stay
-- indexed.
--
-- Verified against STAGING before writing this file (read-only queries):
--   * information_schema.columns + pg_constraint of taller_ediciones,
--     taller_inscripciones (taller_id = the EDICIÓN id; grupo_id is the
--     paso 5 "inscripción a grupo" link), taller_grupos, taller_sesiones,
--     taller_asistencias (UNIQUE (sesion_id, inscripcion_id)),
--     taller_reportes, taller_certificados (codigo_verificacion UNIQUE and
--     length 16) and talleres_crecimiento_cohortes (taller_id = edición).
--   * pg_get_functiondef of talleres_estado_efectivo (both overloads),
--     talleres_refrescar_estados and emit_taller_certificado: identical
--     to their latest migration text.
--   * every trigger on the tables written below:
--       - taller_reportes_lock_after_send allows enviado -> cerrado and
--         reabierto -> cerrado (reabierto_por_persona_id preserved); it is
--         NOT touched here.
--       - taller_reportes_capture_correccion inserts a
--         taller_reporte_correcciones row (autor_persona_id NOT NULL =
--         COALESCE(reabierto_por_persona_id, firma_lider_persona_id)) on
--         every estado change, so the report update below only moves rows
--         that have that author.
--       - taller_inscripciones_cupo_gate fires on UPDATE OF estado only;
--         this file never writes taller_inscripciones.estado.
--       - taller_grupos_capture_recursos_snapshot is guarded by
--         pg_trigger_depth() < 1, which is never true inside a trigger, so
--         it never runs (known, out of scope). The group update below sets
--         completed_at itself for that reason.
--   * pgcrypto lives in the `extensions` schema (gen_random_bytes is
--     called schema-qualified).
--
-- talleres_refrescar_estados() is deliberately NOT redefined: it writes
-- talleres_estado_efectivo(te) into estado, and C makes that 'cerrado' for
-- a closed edición, so it can never revert one (and it repairs a closed
-- row whose stored estado drifted). Every caller of
-- talleres_estado_efectivo (policies taller_ediciones_select,
-- talleres_crecimiento_cohortes_select, taller_inscripciones_insert, the
-- cupo/temporada/reprogramar functions, the uuid overload) passes a
-- taller_ediciones row, so it sees cerrada_en with no signature change.

-- ===========================================================================
-- A. talleres: completion rule, configuration column
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN clases_minimas_para_completar integer NULL;

ALTER TABLE public.talleres
  ADD CONSTRAINT talleres_clases_minimas_para_completar_check
    CHECK (clases_minimas_para_completar IS NULL OR clases_minimas_para_completar >= 1);

COMMENT ON COLUMN public.talleres.clases_minimas_para_completar IS
  'Configuracion del taller (cierre de edicion): clases presentes minimas para completar. NULL = todas las clases dictadas. El minimo efectivo nunca supera las clases dictadas del grupo: GREATEST(1, LEAST(coalesce(valor, dictadas), dictadas)).';

-- ===========================================================================
-- B. taller_ediciones: who closed it and when
-- ===========================================================================

ALTER TABLE public.taller_ediciones
  ADD COLUMN cerrada_en timestamptz NULL,
  ADD COLUMN cerrada_por uuid NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.taller_ediciones.cerrada_en IS
  'When talleres_cerrar_edicion closed this edicion (now() inside the RPC). NULL = not closed. Once set, talleres_estado_efectivo returns cerrado regardless of the dates.';
COMMENT ON COLUMN public.taller_ediciones.cerrada_por IS
  'usuarios.id of the caller of talleres_cerrar_edicion. NULL = not closed.';

-- ===========================================================================
-- B2. Only talleres_cerrar_edicion writes cerrada_en / cerrada_por
-- ===========================================================================

-- taller_ediciones_update lets a director UPDATE the row, which would let
-- them set or clear cerrada_en/cerrada_por by hand (a "reopen" with no
-- cascade undone, or a close with no cascade). Same pattern as
-- talleres_inscripciones_cupo_gate + talleres.sobre_cupo_autorizado: a
-- transaction-local flag that only talleres_cerrar_edicion sets, right
-- around its own UPDATE. A client cannot set it: set_config is not
-- reachable through the Data API. An UPDATE that names the columns but
-- leaves their values unchanged (an app sending the whole row) passes.
CREATE OR REPLACE FUNCTION public.talleres_ediciones_cierre_solo_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('talleres.cierre_autorizado', true) IS DISTINCT FROM '1'
     AND (
       (TG_OP = 'INSERT' AND (NEW.cerrada_en IS NOT NULL OR NEW.cerrada_por IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.cerrada_en IS DISTINCT FROM OLD.cerrada_en
                                 OR NEW.cerrada_por IS DISTINCT FROM OLD.cerrada_por))
     ) THEN
    RAISE EXCEPTION 'EDICION_CIERRE_SOLO_POR_RPC' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.talleres_ediciones_cierre_solo_por_rpc() IS
  'Cierre de edicion — BEFORE INSERT OR UPDATE OF cerrada_en, cerrada_por on taller_ediciones: raises P0001 EDICION_CIERRE_SOLO_POR_RPC when either column would be set or changed without the transaction-local flag talleres.cierre_autorizado=1, which only talleres_cerrar_edicion sets (and clears right after its own UPDATE). Reopening is not designed, so nothing may clear them.';

CREATE TRIGGER trg_taller_ediciones_cierre_solo_por_rpc
  BEFORE INSERT OR UPDATE OF cerrada_en, cerrada_por ON public.taller_ediciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_ediciones_cierre_solo_por_rpc();

-- ===========================================================================
-- C. talleres_estado_efectivo(taller_ediciones): a closed edicion is final
-- ===========================================================================

-- Same body as 20260928140000_talleres_paso6_hardening.sql, plus ONE first
-- branch: cerrada_en IS NOT NULL -> 'cerrado'. It goes first because the
-- close is the last human decision on an edicion (certificates are
-- already emitted), so neither its dates nor a later stored estado may
-- move it back.
CREATE OR REPLACE FUNCTION public.talleres_estado_efectivo(p_edicion public.taller_ediciones)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_edicion.cerrada_en IS NOT NULL THEN 'cerrado'
    WHEN p_edicion.estado IN ('borrador', 'cancelado') THEN p_edicion.estado
    WHEN p_edicion.fecha_inicio IS NULL
      OR p_edicion.fecha_fin IS NULL
      OR p_edicion.cierre_inscripcion IS NULL THEN p_edicion.estado
    WHEN public.talleres_hoy() < p_edicion.cierre_inscripcion THEN 'abierto'
    WHEN p_edicion.fecha_inicio <= public.talleres_hoy() AND public.talleres_hoy() <= p_edicion.fecha_fin THEN 'en_curso'
    ELSE 'cerrado'
  END;
$$;

COMMENT ON FUNCTION public.talleres_estado_efectivo(public.taller_ediciones) IS
  'Derives an edicion''s effective estado (docs/talleres-de-punta-a-punta.md §5): cerrado once cerrada_en is set (talleres_cerrar_edicion), else the stored borrador/cancelado, else from its own dates using talleres_hoy(). Pure computation over the passed row, no table access — safe to call on the row being evaluated inside taller_ediciones_select itself.';

-- ===========================================================================
-- D. talleres_cierre_resultados(): the per-inscription computation, once
-- ===========================================================================

-- Only aprobado inscriptions are evaluated. clases_total = classes of the
-- inscription's own grupo that were held (en_curso or cerrada);
-- clases_presente = its presente marks on those classes. An inscription
-- with no grupo has 0/0 and reads as abandono.
--
-- Not SECURITY DEFINER and not granted to authenticated: it is only ever
-- called from inside talleres_previsualizar_cierre/talleres_cerrar_edicion,
-- which already run as the owner after their own capability check. Both
-- read their rows from here, so the preview and the close cannot drift.
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
  'Internal (cierre de edicion): one row per aprobado inscription of the edicion with clases_presente/clases_total (held = en_curso|cerrada classes of its own grupo), the effective minimo and the resultado completado|no_completado|abandono. Shared by talleres_previsualizar_cierre and talleres_cerrar_edicion so both compute the same thing. Not executable by authenticated.';

REVOKE ALL ON FUNCTION public.talleres_cierre_resultados(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_cierre_resultados(uuid) TO postgres, service_role;

-- ===========================================================================
-- E. talleres_previsualizar_cierre(): what closing would do
-- ===========================================================================

-- Read-only. Same authority as talleres_cerrar_edicion (director.write or
-- admin.manage scoped to the taller's node — permisos.editarEdicion in the
-- app). It refuses no estado: on an already closed edicion it recomputes
-- the same rows from the current attendance.
CREATE OR REPLACE FUNCTION public.talleres_previsualizar_cierre(p_edicion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id uuid;
  v_clases_minimas integer;
  v_clases_sin_dictar integer;
  v_reportes_sin_enviar integer;
  v_filas jsonb;
BEGIN
  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  -- Not found and no permission collapse to the same 42501, exactly as
  -- talleres_reprogramar_edicion does.
  IF NOT EXISTS (SELECT 1 FROM public.taller_ediciones WHERE id = p_edicion_id)
     OR NOT (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
     ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  SELECT t.clases_minimas_para_completar
    INTO v_clases_minimas
    FROM public.taller_ediciones e
    LEFT JOIN public.talleres t ON t.id = e.taller_id
   WHERE e.id = p_edicion_id;

  SELECT count(*)::integer
    INTO v_clases_sin_dictar
    FROM public.taller_sesiones s
    JOIN public.taller_grupos g ON g.id = s.grupo_id
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
   WHERE c.taller_id = p_edicion_id
     AND s.estado = 'programada';

  SELECT count(*)::integer
    INTO v_reportes_sin_enviar
    FROM public.taller_reportes r
    JOIN public.taller_grupos g ON g.id = r.grupo_id
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
   WHERE c.taller_id = p_edicion_id
     AND r.estado = 'borrador';

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'inscripcion_id', r.inscripcion_id,
               'persona_nombre', r.persona_nombre,
               'companero_nombre', r.companero_nombre,
               'grupo_nombre', r.grupo_nombre,
               'clases_presente', r.clases_presente,
               'clases_total', r.clases_total,
               'minimo', r.minimo,
               'resultado', r.resultado
             )
             ORDER BY r.grupo_nombre NULLS LAST, r.persona_nombre, r.inscripcion_id
           ),
           '[]'::jsonb
         )
    INTO v_filas
    FROM public.talleres_cierre_resultados(p_edicion_id) r;

  RETURN jsonb_build_object(
    'clases_sin_dictar', v_clases_sin_dictar,
    'reportes_sin_enviar', v_reportes_sin_enviar,
    'clases_minimas', v_clases_minimas,
    'filas', v_filas
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_previsualizar_cierre(uuid) IS
  'Cierre de edicion — read-only preview: {clases_sin_dictar, reportes_sin_enviar, clases_minimas, filas[{inscripcion_id, persona_nombre, companero_nombre, grupo_nombre, clases_presente, clases_total, minimo, resultado}]}. Rows come from talleres_cierre_resultados, the same computation talleres_cerrar_edicion writes. director.write|admin.manage scoped to the taller''s node, else 42501.';

REVOKE ALL ON FUNCTION public.talleres_previsualizar_cierre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_previsualizar_cierre(uuid) TO authenticated, service_role;

-- ===========================================================================
-- E2. Certificates: one per person in a couple
-- ===========================================================================

-- Dropped by name with no IF EXISTS on purpose: it is the default name of
-- the inline `inscripcion_id uuid UNIQUE NOT NULL` in
-- 20260811130000_talleres_tables_certificados_periodos.sql. If it were
-- missing, a silent skip would leave the old constraint in place and the
-- companero's certificate would be swallowed by ON CONFLICT DO NOTHING.
ALTER TABLE public.taller_certificados
  DROP CONSTRAINT taller_certificados_inscripcion_id_key;

ALTER TABLE public.taller_certificados
  ADD CONSTRAINT taller_certificados_inscripcion_persona_key UNIQUE (inscripcion_id, persona_id);

ALTER TABLE public.taller_certificados
  ADD COLUMN nombre_pareja_snapshot text NULL;

COMMENT ON COLUMN public.taller_certificados.nombre_pareja_snapshot IS
  'Name of the OTHER person of a couple inscription, frozen at emission: the companero''s name on the principal''s certificate and the principal''s name on the companero''s. NULL for an individual inscription. Printed on the certificate.';

-- The public verify route reads certificates logged out, through the
-- column-level SELECT granted in 20260811130000 (to anon, authenticated);
-- the new column joins that list.
GRANT SELECT (nombre_pareja_snapshot) ON public.taller_certificados TO anon, authenticated;

-- One 16-symbol verification code from a CSPRNG (pgcrypto lives in the
-- `extensions` schema). c_alfabeto must stay byte-for-byte equal to
-- ALPHABET in lib/platform/talleres/certificates.ts (pinned by
-- __tests__/lib/platform/talleres/schema/cierre-de-edicion.test.ts). It has
-- 32 symbols, so byte % 32 is uniform over it.
CREATE OR REPLACE FUNCTION public.talleres_codigo_certificado()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  c_alfabeto constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  c_largo_codigo constant integer := 16;
  v_bytes bytea := extensions.gen_random_bytes(c_largo_codigo);
  v_codigo text := '';
BEGIN
  FOR k IN 0 .. c_largo_codigo - 1 LOOP
    v_codigo := v_codigo || substr(c_alfabeto, (get_byte(v_bytes, k) % 32) + 1, 1);
  END LOOP;
  RETURN v_codigo;
END;
$function$;

COMMENT ON FUNCTION public.talleres_codigo_certificado() IS
  'Internal (cierre de edicion): a 16-symbol certificate verification code in the app alphabet (lib/platform/talleres/certificates.ts ALPHABET), from extensions.gen_random_bytes. Not executable by authenticated.';

REVOKE ALL ON FUNCTION public.talleres_codigo_certificado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_codigo_certificado() TO postgres, service_role;

-- firmantes objects {persona_id, rol_etiqueta, orden} -> the string[] the
-- public verify route renders. Same expression emit_taller_certificado
-- had inline (20260918220000_talleres_scoped_functions.sql).
CREATE OR REPLACE FUNCTION public.talleres_certificado_firmantes(p_firmantes jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(sig ORDER BY ord), '[]'::jsonb)
    FROM (
      SELECT
        to_jsonb(
          CASE
            WHEN NULLIF(btrim(concat_ws(' ', su.nombre, su.apellido)), '') IS NOT NULL
                 AND COALESCE(f.rol_etiqueta, '') <> ''
              THEN btrim(concat_ws(' ', su.nombre, su.apellido)) || ' (' || f.rol_etiqueta || ')'
            WHEN NULLIF(btrim(concat_ws(' ', su.nombre, su.apellido)), '') IS NOT NULL
              THEN btrim(concat_ws(' ', su.nombre, su.apellido))
            ELSE COALESCE(NULLIF(f.rol_etiqueta, ''), 'Firmante')
          END
        ) AS sig,
        COALESCE(f.orden, 0) AS ord
      FROM jsonb_to_recordset(COALESCE(p_firmantes, '[]'::jsonb))
             AS f(persona_id uuid, rol_etiqueta text, orden integer)
      LEFT JOIN public.usuarios su ON su.id = f.persona_id
    ) s;
$$;

COMMENT ON FUNCTION public.talleres_certificado_firmantes(jsonb) IS
  'Internal (cierre de edicion): taller_ediciones.firmantes objects -> the firmantes_snapshot string[] of a certificate. Shared by emit_taller_certificado and talleres_cerrar_edicion. Not executable by authenticated.';

REVOKE ALL ON FUNCTION public.talleres_certificado_firmantes(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_certificado_firmantes(jsonb) TO postgres, service_role;

-- Emits (or finds) ONE person's certificate for an inscription. p_codigo
-- is tried first when given (the app-generated code of
-- emit_taller_certificado); otherwise, or after a code collision, a code
-- is drawn with talleres_codigo_certificado. ON CONFLICT DO NOTHING has no
-- target on purpose: a clash on (inscripcion_id, persona_id) means the
-- certificate already exists (returned with created=false), a clash on
-- codigo_verificacion means a collision (retried), and neither needs a
-- subtransaction per certificate.
-- Returns {certificado_id, persona_id, codigo_verificacion, created}.
CREATE OR REPLACE FUNCTION public.talleres_emitir_certificado_persona(
  p_inscripcion_id uuid,
  p_edicion_id uuid,
  p_persona_id uuid,
  p_nombre_taller text,
  p_nombre_participante text,
  p_nombre_pareja text,
  p_firmantes_snapshot jsonb,
  p_codigo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  c_intentos_codigo constant integer := 5;
  v_codigo text := p_codigo;
  v_id uuid;
  v_existente record;
BEGIN
  FOR v_intento IN 1 .. c_intentos_codigo LOOP
    IF v_codigo IS NULL THEN
      v_codigo := public.talleres_codigo_certificado();
    END IF;

    INSERT INTO public.taller_certificados (
      inscripcion_id,
      codigo_verificacion,
      taller_id,
      persona_id,
      nombre_taller_snapshot,
      nombre_participante_snapshot,
      nombre_pareja_snapshot,
      firmantes_snapshot
    ) VALUES (
      p_inscripcion_id,
      v_codigo,
      p_edicion_id,
      p_persona_id,
      p_nombre_taller,
      p_nombre_participante,
      p_nombre_pareja,
      p_firmantes_snapshot
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'certificado_id', v_id,
        'persona_id', p_persona_id,
        'codigo_verificacion', v_codigo,
        'created', true
      );
    END IF;

    SELECT c.id, c.codigo_verificacion
      INTO v_existente
      FROM public.taller_certificados c
     WHERE c.inscripcion_id = p_inscripcion_id
       AND c.persona_id = p_persona_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'certificado_id', v_existente.id,
        'persona_id', p_persona_id,
        'codigo_verificacion', v_existente.codigo_verificacion,
        'created', false
      );
    END IF;

    -- The code collided with another certificate: draw a new one.
    v_codigo := NULL;
  END LOOP;

  RAISE EXCEPTION 'CODIGO_CERTIFICADO_NO_DISPONIBLE' USING ERRCODE = 'P0001';
END;
$function$;

COMMENT ON FUNCTION public.talleres_emitir_certificado_persona(uuid, uuid, uuid, text, text, text, jsonb, text) IS
  'Internal (cierre de edicion): emits one person''s certificate for an inscription, or returns the existing one ({certificado_id, persona_id, codigo_verificacion, created}). Tries p_codigo first when given, retries a colliding code up to 5 times, then P0001 CODIGO_CERTIFICADO_NO_DISPONIBLE. Shared by emit_taller_certificado and talleres_cerrar_edicion. Not executable by authenticated.';

REVOKE ALL ON FUNCTION public.talleres_emitir_certificado_persona(uuid, uuid, uuid, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_emitir_certificado_persona(uuid, uuid, uuid, text, text, text, jsonb, text) TO postgres, service_role;

-- ===========================================================================
-- F. talleres_cerrar_edicion(): the close, in cascade
-- ===========================================================================

-- Order inside the one transaction:
--   1. authority, then the edicion row locked FOR UPDATE (a concurrent
--      second close waits here and then sees cerrada_en -> EDICION_YA_
--      CERRADA);
--   2. classes: programada -> cancelada, en_curso -> cerrada;
--   3. unit_estado of every aprobado inscription from
--      talleres_cierre_resultados (other estados are untouched);
--   4. one certificate per person of every completado inscription (the
--      principal, and the companero of a couple), through the same
--      talleres_emitir_certificado_persona emit_taller_certificado uses;
--   5. grupos activo -> completado; cohorte ended_at;
--   6. reportes enviado|reabierto -> cerrado (borrador stays and is
--      counted in reportes_sin_enviar);
--   7. the edicion itself: estado cerrado, cerrada_en, cerrada_por (the
--      only write trg_taller_ediciones_cierre_solo_por_rpc lets through).
CREATE OR REPLACE FUNCTION public.talleres_cerrar_edicion(p_edicion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id uuid;
  v_edicion public.taller_ediciones%ROWTYPE;
  v_persona_id uuid;
  v_taller_nombre text;
  v_firmantes_snapshot jsonb;
  v_completados integer := 0;
  v_no_completados integer := 0;
  v_abandonos integer := 0;
  v_certificados integer := 0;
  v_clases_cerradas integer := 0;
  v_clases_canceladas integer := 0;
  v_grupos_completados integer := 0;
  v_reportes_cerrados integer := 0;
  v_reportes_sin_enviar integer := 0;
  v_inscrito record;
  v_emitido jsonb;
BEGIN
  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_edicion
    FROM public.taller_ediciones
   WHERE id = p_edicion_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  IF v_edicion.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_YA_CERRADA' USING ERRCODE = 'P0001';
  END IF;

  IF v_edicion.estado IN ('borrador', 'cancelado') THEN
    RAISE EXCEPTION 'EDICION_NO_CERRABLE' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Classes. A class still programada was never held: it is cancelled.
  -- One still en_curso was held (attendance was taken): it is closed.
  UPDATE public.taller_sesiones s
     SET estado = 'cancelada'
    FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
   WHERE s.grupo_id = g.id
     AND g.cohorte_id = c.id
     AND c.taller_id = p_edicion_id
     AND s.estado = 'programada';
  GET DIAGNOSTICS v_clases_canceladas = ROW_COUNT;

  UPDATE public.taller_sesiones s
     SET estado = 'cerrada'
    FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
   WHERE s.grupo_id = g.id
     AND g.cohorte_id = c.id
     AND c.taller_id = p_edicion_id
     AND s.estado = 'en_curso';
  GET DIAGNOSTICS v_clases_cerradas = ROW_COUNT;

  -- 3. unit_estado. Held classes are the same before and after step 2
  -- (en_curso and cerrada both count), so these rows equal the preview's.
  WITH resultados AS (
    SELECT r.inscripcion_id, r.resultado
      FROM public.talleres_cierre_resultados(p_edicion_id) r
  ),
  escritas AS (
    UPDATE public.taller_inscripciones i
       SET unit_estado = resultados.resultado
      FROM resultados
     WHERE i.id = resultados.inscripcion_id
    RETURNING resultados.resultado
  )
  SELECT count(*) FILTER (WHERE resultado = 'completado'),
         count(*) FILTER (WHERE resultado = 'no_completado'),
         count(*) FILTER (WHERE resultado = 'abandono')
    INTO v_completados, v_no_completados, v_abandonos
    FROM escritas;

  -- 4. Certificates: one per person, the same rows emit_taller_certificado
  -- writes (both go through talleres_emitir_certificado_persona). A legacy
  -- edicion with no taller falls back to its own name snapshot, so
  -- nombre_taller_snapshot (NOT NULL) never aborts the close. In a couple
  -- both share the inscription's result; each certificate names the other.
  SELECT t.nombre
    INTO v_taller_nombre
    FROM public.talleres t
   WHERE t.id = v_edicion.taller_id;
  v_taller_nombre := COALESCE(v_taller_nombre, v_edicion.nombre_snapshot);

  v_firmantes_snapshot := public.talleres_certificado_firmantes(v_edicion.firmantes);

  FOR v_inscrito IN
    SELECT i.id AS inscripcion_id,
           i.persona_principal_id,
           i.companero_id,
           btrim(concat_ws(' ', up.nombre, up.apellido)) AS principal_nombre,
           CASE
             WHEN i.companero_id IS NULL THEN NULL
             ELSE btrim(concat_ws(' ', uc.nombre, uc.apellido))
           END AS companero_nombre
      FROM public.taller_inscripciones i
      JOIN public.usuarios up ON up.id = i.persona_principal_id
      LEFT JOIN public.usuarios uc ON uc.id = i.companero_id
     WHERE i.taller_id = p_edicion_id
       AND i.estado = 'aprobado'
       AND i.unit_estado = 'completado'
     ORDER BY i.id
  LOOP
    v_emitido := public.talleres_emitir_certificado_persona(
      v_inscrito.inscripcion_id, p_edicion_id, v_inscrito.persona_principal_id,
      v_taller_nombre, v_inscrito.principal_nombre, v_inscrito.companero_nombre,
      v_firmantes_snapshot
    );
    IF (v_emitido ->> 'created')::boolean THEN
      v_certificados := v_certificados + 1;
    END IF;

    IF v_inscrito.companero_id IS NOT NULL THEN
      v_emitido := public.talleres_emitir_certificado_persona(
        v_inscrito.inscripcion_id, p_edicion_id, v_inscrito.companero_id,
        v_taller_nombre, v_inscrito.companero_nombre, v_inscrito.principal_nombre,
        v_firmantes_snapshot
      );
      IF (v_emitido ->> 'created')::boolean THEN
        v_certificados := v_certificados + 1;
      END IF;
    END IF;
  END LOOP;

  -- 5. Grupos and cohorte. completed_at is set here because the
  -- recursos_snapshot trigger that was meant to set it never fires.
  UPDATE public.taller_grupos g
     SET estado = 'completado',
         completed_at = COALESCE(g.completed_at, now())
    FROM public.talleres_crecimiento_cohortes c
   WHERE g.cohorte_id = c.id
     AND c.taller_id = p_edicion_id
     AND g.estado = 'activo';
  GET DIAGNOSTICS v_grupos_completados = ROW_COUNT;

  UPDATE public.talleres_crecimiento_cohortes
     SET ended_at = now()
   WHERE taller_id = p_edicion_id
     AND ended_at IS NULL;

  -- 6. Reportes. Only the transitions taller_reportes_lock_after_send
  -- already allows, and only rows whose correction log row will have an
  -- author (taller_reportes_capture_correccion). borrador stays.
  UPDATE public.taller_reportes r
     SET estado = 'cerrado'
    FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
   WHERE r.grupo_id = g.id
     AND g.cohorte_id = c.id
     AND c.taller_id = p_edicion_id
     AND r.estado IN ('enviado', 'reabierto')
     AND COALESCE(r.reabierto_por_persona_id, r.firma_lider_persona_id) IS NOT NULL;
  GET DIAGNOSTICS v_reportes_cerrados = ROW_COUNT;

  SELECT count(*)::integer
    INTO v_reportes_sin_enviar
    FROM public.taller_reportes r
    JOIN public.taller_grupos g ON g.id = r.grupo_id
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
   WHERE c.taller_id = p_edicion_id
     AND r.estado = 'borrador';

  -- 7. The edicion. The flag lets trg_taller_ediciones_cierre_solo_por_rpc
  -- accept this one write and is cleared right after, so nothing later in
  -- the same transaction inherits it.
  SELECT id INTO v_persona_id FROM public.usuarios WHERE auth_id = auth.uid();

  PERFORM set_config('talleres.cierre_autorizado', '1', true);

  UPDATE public.taller_ediciones
     SET estado = 'cerrado',
         cerrada_en = now(),
         cerrada_por = v_persona_id
   WHERE id = p_edicion_id;

  PERFORM set_config('talleres.cierre_autorizado', '', true);

  RETURN jsonb_build_object(
    'ok', true,
    'completados', v_completados,
    'no_completados', v_no_completados,
    'abandonos', v_abandonos,
    'certificados_emitidos', v_certificados,
    'clases_cerradas', v_clases_cerradas,
    'clases_canceladas', v_clases_canceladas,
    'grupos_completados', v_grupos_completados,
    'reportes_cerrados', v_reportes_cerrados,
    'reportes_sin_enviar', v_reportes_sin_enviar
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_cerrar_edicion(uuid) IS
  'Cierre de edicion — closes an edicion in one transaction: classes programada->cancelada and en_curso->cerrada, unit_estado of every aprobado inscription (talleres_cierre_resultados), one certificate per person of every completado inscription (principal, and companero of a couple; certificados_emitidos counts rows), grupos activo->completado, cohorte ended_at, reportes enviado|reabierto->cerrado, then estado cerrado + cerrada_en + cerrada_por. P0001 EDICION_YA_CERRADA / EDICION_NO_CERRABLE (borrador|cancelado); 42501 without director.write|admin.manage scoped to the taller''s node.';

REVOKE ALL ON FUNCTION public.talleres_cerrar_edicion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_cerrar_edicion(uuid) TO authenticated, service_role;

-- ===========================================================================
-- G. emit_taller_certificado(): one certificate per person
-- ===========================================================================

-- Same signature, same authority checks and same validation as the latest
-- definition (20260918220000_talleres_scoped_functions.sql). Changes:
--   * the principal's row goes through talleres_emitir_certificado_persona
--     with the app-generated p_codigo_verificacion (a code collision now
--     draws a fresh code instead of failing), idempotent on
--     (inscripcion_id, persona_id);
--   * a couple inscription also emits the companero's certificate, with a
--     code generated in SQL;
--   * each certificate stores the other person's name in
--     nombre_pareja_snapshot.
-- Return shape: the five keys lib/platform/talleres/certificates.ts reads
-- ({ok, created, certificado_id, codigo_verificacion, inscripcion_id})
-- still describe the PRINCIPAL's certificate; one key is added,
-- `certificados`: [{certificado_id, persona_id, codigo_verificacion,
-- created}], the principal first, then the companero when there is one.
CREATE OR REPLACE FUNCTION public.emit_taller_certificado(p_inscripcion_id uuid, p_codigo_verificacion text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id            uuid;
  v_cap_ok             boolean;
  v_edicion_id         uuid;
  v_persona_id         uuid;
  v_companero_id       uuid;
  v_unit_estado        text;
  v_taller_nombre      text;
  v_participante       text;
  v_companero          text;
  v_firmantes_raw      jsonb;
  v_firmantes_snapshot jsonb;
  v_principal          jsonb;
  v_pareja             jsonb;
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

  IF p_codigo_verificacion IS NULL OR length(p_codigo_verificacion) <> 16 THEN
    RAISE EXCEPTION 'INVALID_CODIGO: expected a 16-char verification code'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.taller_id,
         i.persona_principal_id,
         i.companero_id,
         i.unit_estado,
         t.nombre,
         btrim(concat_ws(' ', u.nombre, u.apellido)),
         CASE
           WHEN i.companero_id IS NULL THEN NULL
           ELSE btrim(concat_ws(' ', uc.nombre, uc.apellido))
         END,
         e.firmantes
    INTO v_edicion_id,
         v_persona_id,
         v_companero_id,
         v_unit_estado,
         v_taller_nombre,
         v_participante,
         v_companero,
         v_firmantes_raw
    FROM public.taller_inscripciones i
    JOIN public.taller_ediciones e ON e.id = i.taller_id
    JOIN public.talleres t ON t.id = e.taller_id
    JOIN public.usuarios u ON u.id = i.persona_principal_id
    LEFT JOIN public.usuarios uc ON uc.id = i.companero_id
   WHERE i.id = p_inscripcion_id;

  IF v_edicion_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: inscripción % has no resolvable edición/persona', p_inscripcion_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_inscripcion(p_inscripcion_id))
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(p_inscripcion_id))) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this inscripción''s tree'
      USING ERRCODE = '42501';
  END IF;

  IF v_unit_estado IS DISTINCT FROM 'completado' THEN
    RAISE EXCEPTION 'INSCRIPCION_NOT_COMPLETED: unit_estado=%', v_unit_estado
      USING ERRCODE = '22023';
  END IF;

  v_firmantes_snapshot := public.talleres_certificado_firmantes(v_firmantes_raw);

  v_principal := public.talleres_emitir_certificado_persona(
    p_inscripcion_id, v_edicion_id, v_persona_id,
    v_taller_nombre, v_participante, v_companero,
    v_firmantes_snapshot, p_codigo_verificacion
  );

  IF v_companero_id IS NOT NULL THEN
    v_pareja := public.talleres_emitir_certificado_persona(
      p_inscripcion_id, v_edicion_id, v_companero_id,
      v_taller_nombre, v_companero, v_participante,
      v_firmantes_snapshot
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', (v_principal ->> 'created')::boolean,
    'certificado_id', (v_principal ->> 'certificado_id')::uuid,
    'codigo_verificacion', v_principal ->> 'codigo_verificacion',
    'inscripcion_id', p_inscripcion_id,
    'certificados', CASE
                      WHEN v_pareja IS NULL THEN jsonb_build_array(v_principal)
                      ELSE jsonb_build_array(v_principal, v_pareja)
                    END
  );
END;
$function$;

COMMENT ON FUNCTION public.emit_taller_certificado(uuid, text) IS
  'Emits (idempotently) the completion certificate(s) of a completado inscription: the principal''s with the app-generated code and, for a couple, the companero''s with a code generated in SQL; each names the other in nombre_pareja_snapshot. Returns {ok, created, certificado_id, codigo_verificacion, inscripcion_id} for the principal plus certificados[{certificado_id, persona_id, codigo_verificacion, created}]. director.write|admin.manage in the inscription''s tree.';

REVOKE ALL ON FUNCTION public.emit_taller_certificado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emit_taller_certificado(uuid, text) TO authenticated, service_role;

-- ===========================================================================
-- H. taller_inscripciones_select: the companero reads the couple's row
-- ===========================================================================

-- The companero now gets their own certificate, but this policy only let a
-- participant read the row where they are persona_principal_id, so the
-- taller never showed in the companero's "Mi recorrido". Based on the LIVE
-- staging definition (pg_policies.qual), which matches
-- 20260924150000_talleres_lider_identidad.sql term by term; no later
-- migration redefines it. Every existing branch is kept as is; the only
-- addition is the companero_id branch, resolved with the same
-- auth.uid() -> usuarios.auth_id idiom as the principal branch. Read only:
-- no write policy changes. ALTER POLICY keeps its command and roles.
ALTER POLICY taller_inscripciones_select ON public.taller_inscripciones
  USING (
    (persona_principal_id IN (SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid()))
    OR (companero_id IN (SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid()))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR public.talleres_es_miembro_del_grupo(grupo_id)
  );
