-- T1 (odd/tasks/talleres-asistencia-lider.md) — the líder runs the class.
--
-- WHY
--   Up to 20260924150000 a líder could READ their grupo (relation
--   branches on the SELECT policies) but could not DO anything:
--   taller_sesiones/taller_reportes write policies are capability-only
--   (coordinator/director/lead/admin), nobody grants those capabilities
--   to a líder, and there was no function that let a líder take
--   attendance, close a class or send the report. The class workflow
--   (pasar lista → cerrar clase → enviar reporte) had no database path
--   for the one person who owns it. `lead.write` exists as a capability
--   but no mechanism ever grants it (see 20260924150000 for why the
--   auto-grant trigger was abandoned), so the fix stays relational:
--   being the líder of the grupo IS the authorization, same doctrine as
--   the SELECT branches.
--
-- WHAT
--   Columns: taller_sesiones.tema (text NULL), taller_asistencias.motivo
--   (text NULL) + CHECK taller_asistencias_motivo_solo_ausente
--   (motivo IS NULL OR estado = 'ausente') — mirrors Grupos de Vida,
--   where motivo_inasistencia is optional and only meaningful for an
--   ausente mark.
--
--   Helper `talleres_rol_en_grupo(p_grupo_id) → text`, STABLE SECURITY
--   DEFINER: the caller's active taller_grupo_asignaciones.rol for that
--   grupo, or NULL when not assigned. NULL-safe by contract: callers
--   must compare with `IS DISTINCT FROM` / `IS NULL` (a bare
--   `<> 'lider'` on NULL yields NULL and would silently authorize).
--
--   `talleres_registrar_asistencia(p_sesion_id, p_marcas jsonb)` — one
--   batch call: resolves the sesión, authorizes (active rol on the
--   grupo OR the same scoped capabilities the write policies accept),
--   rejects a cerrada class, then upserts one row per mark on
--   UNIQUE (sesion_id, inscripcion_id). First send stamps
--   fecha_realizada = current_date and programada → en_curso. Returns
--   {presentes, ausentes, total} counted over the session's full set.
--   This is the ONLY write path for taller_asistencias now (its
--   INSERT/UPDATE/DELETE policies are untouched, still false/false for
--   UPDATE/DELETE): the append-only trigger that used to force
--   corrections-as-new-rows — and blocked every legitimate estado
--   change with "corrections must reference the prior row" — is DROPped
--   (approved) so an upsert can correct a mark in place; motivo/state
--   history stays meaningful through updated_at + the motivo column
--   itself.
--
--   `talleres_cerrar_clase(p_sesion_id)` — líder-only (+ capability)
--   close; idempotent; returns {sesion_id, estado}.
--
--   `talleres_enviar_reporte(p_grupo_id, p_observaciones)` — líder-only
--   (+ capability); first blocks on any open class (P0001
--   CLASES_ABIERTAS), then takes the latest borrador|reabierto|enviado
--   reporte (P0001 REPORTE_NO_ENCONTRADO when none — creation stays a
--   direct INSERT through taller_reportes_insert, exactly what the app
--   route already assumes), flips it to enviado setting
--   firma_lider_persona_id/Fecha and observaciones (COALESCE keeps the
--   old text when p_observaciones is NULL/blank). Re-sending an already
--   enviado reporte is caught by taller_reportes_lock_after_send Rule 1
--   (check_violation) — reused, not duplicated. Rule 5 (borrador →
--   enviado requires firma) is satisfied because we set it in the same
--   UPDATE.
--
--   Policy relation write branches (capability expressions reproduced
--   VERBATIM from pg_policies, only an OR appended; ALTER POLICY comes
--   after the functions because the expression must resolve):
--     taller_sesiones_update  USING  += talleres_rol_en_grupo = 'lider'
--                                      (WITH CHECK stays true)
--     taller_reportes_insert  CHECK  += same
--     taller_reportes_update  USING/CHECK += same
--   taller_asistencias_* and taller_sesiones_insert are deliberately
--   NOT touched — the functions are the write path, the policies keep
--   deciding direct-table access.
--
-- SAFETY
--   Additive columns (nullable, no defaults rewritten); one CHECK that
--   can only reject motivo-on-presente going forward; DROP only the
--   trigger + function approved by the parent task; policy changes only
--   broaden UPDATE for the group's own líder (every existing capability
--   branch keeps deciding exactly what it decided before). Functions
--   default-deny: REVOKE ALL FROM PUBLIC, anon;
--   GRANT EXECUTE TO authenticated, postgres, service_role only.
--
-- ROLLBACK
--   Remove the columns added above (tema on taller_sesiones, motivo on
--   taller_asistencias) — dropping them takes the CHECK with it;
--   recreate the trigger + function from
--   20260811100000_talleres_tables_sesiones_asistencia.sql; drop the 4
--   functions; re-issue the three ALTER POLICYs with the expressions
--   this file quotes verbatim minus the relación branch.

-- ── columns ─────────────────────────────────────────────────────────

ALTER TABLE public.taller_sesiones ADD COLUMN IF NOT EXISTS tema text;

ALTER TABLE public.taller_asistencias ADD COLUMN IF NOT EXISTS motivo text;

ALTER TABLE public.taller_asistencias
  ADD CONSTRAINT taller_asistencias_motivo_solo_ausente
  CHECK (motivo IS NULL OR estado = 'ausente');

-- ── the append-only trigger that blocked the upsert correction path ─

DROP TRIGGER IF EXISTS trg_taller_asistencias_immutable_update ON public.taller_asistencias;
DROP FUNCTION IF EXISTS public.taller_asistencias_immutable_update();

-- ── the relation helper ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_rol_en_grupo(p_grupo_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT a.rol
  FROM taller_grupo_asignaciones a
  JOIN usuarios u ON u.id = a.persona_id
  WHERE a.grupo_id = p_grupo_id
    AND a.activo = true
    AND u.auth_id = auth.uid()
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.talleres_rol_en_grupo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_rol_en_grupo(uuid) TO authenticated, postgres, service_role;

-- ── attendance: one batch call, upsert on (sesion_id, inscripcion_id) ─

CREATE OR REPLACE FUNCTION public.talleres_registrar_asistencia(
  p_sesion_id uuid,
  p_marcas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_id uuid;
  v_sesion_estado text;
  v_rol text;
  v_tiene_capacidad boolean;
  v_marca jsonb;
  v_inscripcion_id uuid;
  v_estado text;
  v_motivo text;
  v_ins record;
  v_presentes int;
  v_ausentes int;
  v_total int;
BEGIN
  SELECT s.grupo_id, s.estado
    INTO v_grupo_id, v_sesion_estado
  FROM taller_sesiones s
  WHERE s.id = p_sesion_id;

  IF v_grupo_id IS NULL THEN
    RAISE EXCEPTION 'SESION_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;

  -- auth first: an out-of-group caller gets his own 42501 even when the
  -- class is closed (IS DISTINCT FROM — a bare <> would leak NULL and
  -- skip this branch).
  v_rol := public.talleres_rol_en_grupo(v_grupo_id);
  v_tiene_capacidad :=
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write',    public.talleres_equipo_de_grupo(v_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(v_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write',        public.talleres_equipo_de_grupo(v_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage',      public.talleres_equipo_de_grupo(v_grupo_id));

  IF v_rol IS NULL AND NOT v_tiene_capacidad THEN
    RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
  END IF;

  IF v_sesion_estado = 'cerrada' THEN
    RAISE EXCEPTION 'CLASE_CERRADA' USING ERRCODE = 'P0001';
  END IF;

  IF p_marcas IS NULL
     OR jsonb_typeof(p_marcas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_marcas) = 0 THEN
    RAISE EXCEPTION 'MARCAS_INVALIDAS' USING ERRCODE = 'P0001';
  END IF;

  FOR v_marca IN SELECT * FROM jsonb_array_elements(p_marcas)
  LOOP
    IF jsonb_typeof(v_marca) IS DISTINCT FROM 'object'
       OR v_marca->>'inscripcion_id' IS NULL THEN
      RAISE EXCEPTION 'MARCAS_INVALIDAS' USING ERRCODE = 'P0001';
    END IF;

    v_inscripcion_id := (v_marca->>'inscripcion_id')::uuid;
    v_estado := v_marca->>'estado';
    v_motivo := NULLIF(btrim(COALESCE(v_marca->>'motivo', '')), '');

    IF v_estado IS NULL OR v_estado NOT IN ('presente', 'ausente') THEN
      RAISE EXCEPTION 'MARCAS_INVALIDAS' USING ERRCODE = 'P0001';
    END IF;
    IF v_estado = 'presente' THEN
      v_motivo := NULL; -- CHECK: motivo only meaningful for ausente
    END IF;

    SELECT i.id, i.grupo_id, i.estado, i.persona_principal_id
      INTO v_ins
    FROM taller_inscripciones i
    WHERE i.id = v_inscripcion_id;

    IF v_ins.id IS NULL THEN
      RAISE EXCEPTION 'INSCRIPCION_NO_ENCONTRADA' USING ERRCODE = 'P0001';
    END IF;
    IF v_ins.grupo_id IS DISTINCT FROM v_grupo_id THEN
      RAISE EXCEPTION 'INSCRIPCION_NO_EN_GRUPO' USING ERRCODE = 'P0001';
    END IF;
    IF v_ins.estado IS DISTINCT FROM 'aprobado' THEN
      RAISE EXCEPTION 'INSCRIPCION_NO_APROBADA' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO taller_asistencias (sesion_id, inscripcion_id, persona_id, estado, motivo)
    VALUES (p_sesion_id, v_inscripcion_id, v_ins.persona_principal_id, v_estado, v_motivo)
    ON CONFLICT (sesion_id, inscripcion_id)
    DO UPDATE SET estado = EXCLUDED.estado,
                  motivo = EXCLUDED.motivo,
                  updated_at = now();
  END LOOP;

  -- first send stamps the session; later sends leave it alone
  UPDATE taller_sesiones s
     SET fecha_realizada = COALESCE(s.fecha_realizada, current_date),
         estado = CASE
           WHEN s.fecha_realizada IS NULL AND s.estado = 'programada' THEN 'en_curso'
           ELSE s.estado
         END
   WHERE s.id = p_sesion_id;

  SELECT count(*) FILTER (WHERE a.estado = 'presente'),
         count(*) FILTER (WHERE a.estado = 'ausente'),
         count(*)
    INTO v_presentes, v_ausentes, v_total
  FROM taller_asistencias a
  WHERE a.sesion_id = p_sesion_id;

  RETURN jsonb_build_object(
    'presentes', v_presentes,
    'ausentes', v_ausentes,
    'total', v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_registrar_asistencia(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_registrar_asistencia(uuid, jsonb) TO authenticated, postgres, service_role;

-- ── close the class ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_cerrar_clase(p_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_id uuid;
  v_rol text;
  v_tiene_capacidad boolean;
BEGIN
  SELECT s.grupo_id INTO v_grupo_id
  FROM taller_sesiones s
  WHERE s.id = p_sesion_id;

  IF v_grupo_id IS NULL THEN
    RAISE EXCEPTION 'SESION_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;

  v_rol := public.talleres_rol_en_grupo(v_grupo_id);
  v_tiene_capacidad :=
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write',    public.talleres_equipo_de_grupo(v_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(v_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write',        public.talleres_equipo_de_grupo(v_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage',      public.talleres_equipo_de_grupo(v_grupo_id));

  -- No relationship with the group at all: generic message.
  IF v_rol IS NULL AND NOT v_tiene_capacidad THEN
    RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
  END IF;
  -- Assigned but not the líder, and no capability: his own message.
  IF v_rol IS DISTINCT FROM 'lider' AND NOT v_tiene_capacidad THEN
    RAISE EXCEPTION 'solo_el_lider_puede_cerrar_la_clase' USING ERRCODE = '42501';
  END IF;

  UPDATE taller_sesiones s
     SET estado = 'cerrada'
   WHERE s.id = p_sesion_id;

  RETURN jsonb_build_object('sesion_id', p_sesion_id, 'estado', 'cerrada');
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_cerrar_clase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_cerrar_clase(uuid) TO authenticated, postgres, service_role;

-- ── send the report ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talleres_enviar_reporte(
  p_grupo_id uuid,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rol text;
  v_tiene_capacidad boolean;
  v_abiertas int;
  v_reporte record;
  v_persona_id uuid;
  v_observaciones text;
BEGIN
  v_rol := public.talleres_rol_en_grupo(p_grupo_id);
  v_tiene_capacidad :=
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write',    public.talleres_equipo_de_grupo(p_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(p_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write',        public.talleres_equipo_de_grupo(p_grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage',      public.talleres_equipo_de_grupo(p_grupo_id));

  -- No relationship with the group at all: generic message.
  IF v_rol IS NULL AND NOT v_tiene_capacidad THEN
    RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
  END IF;
  -- Assigned but not the líder, and no capability: his own message.
  IF v_rol IS DISTINCT FROM 'lider' AND NOT v_tiene_capacidad THEN
    RAISE EXCEPTION 'solo_el_lider_puede_enviar_el_reporte' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_abiertas
  FROM taller_sesiones s
  WHERE s.grupo_id = p_grupo_id
    AND s.estado NOT IN ('cerrada', 'cancelada');

  IF v_abiertas > 0 THEN
    RAISE EXCEPTION 'CLASES_ABIERTAS' USING ERRCODE = 'P0001';
  END IF;

  -- latest active reporte; creation itself stays a direct INSERT
  -- through taller_reportes_insert (what the app route already does)
  SELECT r.id, r.estado INTO v_reporte
  FROM taller_reportes r
  WHERE r.grupo_id = p_grupo_id
    AND r.estado IN ('borrador', 'reabierto', 'enviado')
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_reporte.id IS NULL THEN
    RAISE EXCEPTION 'REPORTE_NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id INTO v_persona_id
  FROM usuarios u
  WHERE u.auth_id = auth.uid();

  v_observaciones := NULLIF(btrim(COALESCE(p_observaciones, '')), '');

  -- already 'enviado' → taller_reportes_lock_after_send Rule 1 raises
  -- check_violation on the transition to itself; Rule 5 (borrador →
  -- enviado needs firma) is satisfied right below, in the same UPDATE.
  UPDATE taller_reportes r
     SET estado = 'enviado',
         firma_lider_persona_id = v_persona_id,
         firma_lider_fecha = now(),
         observaciones_generales = COALESCE(v_observaciones, r.observaciones_generales),
         version = r.version + 1
   WHERE r.id = v_reporte.id;

  RETURN jsonb_build_object('reporte_id', v_reporte.id, 'estado', 'enviado');
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_enviar_reporte(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_enviar_reporte(uuid, text) TO authenticated, postgres, service_role;

-- ── the relation write branches: verbatim capability expression + OR ─
-- (must come after the functions — ALTER POLICY parses the expression)

ALTER POLICY taller_sesiones_update ON public.taller_sesiones
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(grupo_id))
    OR public.talleres_rol_en_grupo(grupo_id) = 'lider'
  );

ALTER POLICY taller_reportes_insert ON public.taller_reportes
  WITH CHECK (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR public.talleres_rol_en_grupo(grupo_id) = 'lider'
  );

ALTER POLICY taller_reportes_update ON public.taller_reportes
  USING (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR public.talleres_rol_en_grupo(grupo_id) = 'lider'
  )
  WITH CHECK (
    auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write'::text, talleres_equipo_de_grupo(grupo_id))
    OR public.talleres_rol_en_grupo(grupo_id) = 'lider'
  );
