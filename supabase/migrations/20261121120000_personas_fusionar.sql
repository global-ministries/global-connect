-- Personas: merge two fichas of the same person (odd/tasks/dream-team-
-- estructura-correcciones.md, T5, S6c). Replaces the manual procedure used
-- once in production (move every reference, resolve the unique collisions,
-- delete the duplicate) with one audited RPC that admin and pastor run from
-- /admin/personas/fusionar.
--
-- WHAT
--   1. Table personas_fusiones: the audit of every merge (who, when, both
--      ids, the deleted row as it was, the fields filled in the survivor and
--      the counts per table.column). RLS on and no policy: only these
--      functions and service_role read or write it. The ids have no foreign
--      key on purpose: the row outlives both people.
--   2. personas_fusionar(p_queda, p_se_va, p_simular = false) -> jsonb
--      In ONE transaction:
--        a. Refusals (nothing changes): caller not admin/pastor (42501
--           'sin_autoridad'); a NULL id or the same id twice (22023
--           'misma_persona' / 'persona_no_encontrada'); a missing row (22023
--           'persona_no_encontrada'); both with an account (22023
--           'ambas_con_cuenta'); the account on the one that would be
--           deleted (22023 'se_va_tiene_cuenta': the account always stays);
--           a collision only a human can settle (22023 'fusion_conflicto',
--           DETAIL the table: casas_anfitrionas or taller_inscripciones, e2).
--        b. Both rows are locked (FOR UPDATE, in id order).
--        c. Family links between the two are deleted (they would become a
--           link of the person with themself, relaciones_usuarios forbids it).
--        d. usuario_campus: when the survivor already has a principal campus,
--           the duplicate's rows stop being principal (one principal each).
--        e. dream_team_servicios: a servicio of the duplicate that is still
--           vigente in the same equipo and rol as one of the survivor's is
--           closed (estado 'retirado', fecha_fin now) instead of deleted, so
--           its history and requisitos stay; then it is moved like the rest.
--        e2. Collisions no unique index settles (T7, B1), checked before
--           anything moves, so the dry run reports them too:
--           - casas_anfitrionas: when both fichas host or co-host a casa
--             (one person hosts at most one casa,
--             prevent_duplicate_casa_anfitriona_assignees) the merge is
--             refused (22023 'fusion_conflicto', DETAIL 'casas_anfitrionas'):
--             which casa stays is a human choice;
--           - taller_inscripciones (one active appearance per person and
--             edición, talleres_inscripciones_una_aparicion): an active
--             INDIVIDUAL inscription of the duplicate (principal, no
--             companero) in an edición where the survivor is active too is
--             withdrawn like the official retiro does (estado 'retirado',
--             version + 1; counted as retirados of
--             taller_inscripciones.persona_principal_id) and then moved, so
--             its asistencias stay; the survivor's row is kept. When the
--             duplicate's colliding row is a couple's (a third person would
--             lose their seat), or the two fichas are the couple of one
--             inscription, the merge is refused ('fusion_conflicto', DETAIL
--             'taller_inscripciones').
--        f. Every reference is moved to the survivor. The columns are:
--           - every single-column foreign key to usuarios(id), read from
--             pg_constraint at run time (so a table added later is covered);
--           - PLUS the known persona/usuario uuid columns WITHOUT a foreign
--             key (only those that exist and are not already a foreign key):
--               audit_grupo_miembros.usuario_id, audit_grupo_miembros.actor_usuario_id,
--               dream_team_capability_grants.persona_id,
--               dream_team_estados_historial.actor_persona_id,
--               dream_team_participation_eventos.persona_id,
--               dream_team_requisitos_verificacion.verificado_por,
--               operating_core_capacity_overrides.set_by_persona_id,
--               operating_core_form_submissions.submitted_by_persona_id,
--               operating_core_forms.created_by_persona_id,
--               operating_core_public_tokens.persona_id, .captured_by_persona_id,
--                 .consumed_by_persona_id,
--               operating_core_registrations.persona_id, .captured_by_persona_id,
--               operating_core_system_notifications.persona_id,
--               pastoral_crisis_detection_log.actor_persona_id,
--               pastoral_one_on_one.autor_persona_id, .mentor_oficial_persona_id,
--               pastoral_one_on_one_notas.autor_persona_id,
--               pastoral_one_on_one_participantes.persona_id,
--               pastoral_triada.autor_persona_id, .mentor_oficial_persona_id,
--               pastoral_triada_eventos.actor_persona_id,
--               pastoral_triada_miembros.persona_id,
--               planner_pasos.usuario_ids (uuid[]: the id is replaced in the array),
--               taller_certificados.persona_id,
--               taller_eventos.persona_id, .actor_persona_id,
--               taller_grupo_asignaciones.persona_id, .approved_by_director_id,
--               taller_inscripciones.persona_principal_id, .companero_id,
--               taller_reporte_correcciones.autor_persona_id,
--               taller_solicitudes_retiro.solicitante_persona_id,
--               talleres_temporadas.created_by_persona_id;
--             and, in case a base table lacks its key, grupo_miembros.usuario_id,
--             asistencia.usuario_id, asistencia.registrado_por_usuario_id,
--             usuario_campus.usuario_id, usuario_roles.usuario_id,
--             relaciones_usuarios.usuario1_id, .usuario2_id,
--             dream_team_servicios.persona_id.
--           Auth ids (audit_grupo_miembros.actor_auth_id, invitaciones_*.
--           auth_user_id) are not person ids and are left alone: the
--           duplicate never has an account. Generic ids (operating_core_
--           notification_outbox.subject_id, support_ticket_events.target_id)
--           are left alone.
--           APPEND-ONLY LEDGERS ARE NEVER REWRITTEN ("conservados"). A table
--           is append-only when it is in this list or has an enabled UPDATE
--           trigger whose function is named like '%append_only%' or
--           '%prevent%mutation%' (read from pg_trigger at run time; triggers
--           are never disabled):
--             operating_core_participation_eventos (statement trigger
--               enforce_*participation_append_only: it rejects ANY UPDATE or
--               DELETE statement, even one that matches no row, so the merge
--               never runs one against it): actor_persona_id and subject_id
--               keep the deleted id;
--             support_ticket_events (row trigger
--               prevent_support_ticket_event_mutation): actor_usuario_id.
--           Their rows keep pointing to the deleted id; personas_fusiones
--           maps that id to the survivor (se_va_id -> queda_id, indexed both
--           ways) and lists how many rows of each table.column stayed
--           (referencias_conservadas, and "conservados" in the counts), so
--           the history stays traceable. A conserved column that is a
--           foreign key to usuarios (support_ticket_events.actor_usuario_id)
--           cannot keep an id that is deleted: when the duplicate has rows
--           there the merge, and its dry run, are refused (22023
--           'historial_inmutable', DETAIL '<tabla>.<columna>') and nothing
--           changes.
--           Foreign keys go first and the columns without one after, so the
--           log rows that triggers write while moving (audit_grupo_miembros
--           on a grupo_miembros delete or update) are moved too.
--           RULE TRIGGERS (T7, B1). While the references move, and only
--           then, the transaction-local setting app.personas_fusion holds
--           '<se_va_id>><queda_id>' (set_config(..., true), cleared right
--           after the loop). The UPDATE triggers below that would refuse a
--           re-pointed id start with a narrow bypass: they return NEW
--           untouched only when that setting is set AND
--           personas_fusion_solo_reasigna(OLD, NEW) says every column that
--           changed went from se_va_id to queda_id (and something changed).
--           Any other change, inside or outside a merge, runs the full rule
--           as before. Inventory of the UPDATE/DELETE triggers on the tables
--           a merge rewrites (supabase/migrations, latest definitions):
--             bypassed (they refuse or misfire on a re-pointed id):
--               estudiantes_grupo_miembros_validar (persona_id change ->
--                 miembro_invalido);
--               estudiantes_grupos_validar (created_by: re-validates the
--                 subárea, year and hours, may refuse an old grupo);
--               taller_reportes_lock_after_send (any update of an
--                 enviado/cerrado report);
--               talleres_ediciones_cierre_solo_por_rpc (cerrada_por);
--               taller_grupo_asignaciones_exige_servidor_activo and
--                 taller_plantilla_facilitadores_exige_servidor_activo
--                 (a past assignment of someone no longer serving);
--               sync_talleres_grants_on_servicio_change (AFTER, not a
--                 refusal: moving a retirado servicio revoked the
--                 survivor's own role grants; the grants move with
--                 dream_team_capability_grants.persona_id instead).
--             settled before the loop: talleres_inscripciones_una_aparicion
--               (e2, PERSONA_YA_EN_EDICION) and
--               prevent_duplicate_casa_anfitriona_assignees (e2, refusal).
--             harmless (column lists the merge never sets, a timestamp, an
--               audit row, a normalization or a re-check that passes):
--               *_updated_at / *_touch, tr_audit_grupo_miembros,
--               estudiantes_fichas_validar, estudiantes_grupo_lideres_validar,
--               trg_taller_inscripciones_couple_unit, the estado / grupo_id
--               triggers of taller_inscripciones, taller_reportes_capture_
--               correccion (estado only), dps_avisos_no_puede (estado),
--               dream_team_servicios_podar_turnos (equipo_id),
--               talleres_taller_ediciones_valida_direccion_temporada
--               (temporada_id), talleres_sync_modalidad_default_from_regimen
--               (regimen), dream_team_usuario_campus_podar_turnos (prunes
--               turnos outside the principal campus, as on any change),
--               usuarios_normalizar_cedula / _telefono.
--             append-only (never rewritten, see above):
--               operating_core_participation_append_only,
--               support_private.prevent_event_mutation.
--           DELETE triggers on rows dropped in a collision:
--           tr_audit_grupo_miembros (audit row, moved later),
--           sync_talleres_grants_on_servicio_change (revokes the duplicate's
--           own role grants for that taller), dream_team_usuario_campus_
--           podar_turnos; the append-only ledgers are never deleted from.
--           Before moving a column, every UNIQUE index that contains it
--           (partial ones with their predicate; expression indexes are
--           skipped and a collision there fails the whole merge) is checked:
--           a row of the duplicate that would collide with a row of the
--           survivor on the other key columns is deleted (the survivor's row
--           is kept), e.g. grupo_miembros (grupo_id, usuario_id), asistencia
--           (evento_grupo_id, usuario_id), usuario_campus, usuario_roles,
--           dps_planificadores (persona_id). Then the rest is updated.
--        g. The duplicate's usuarios row is deleted.
--        h. Empty fields of the survivor are filled from the duplicate, never
--           overwriting a value: cedula, telefono, email, fecha_nacimiento,
--           bautizado, fecha_bautizo, talla_franela, redes_sociales,
--           foto_perfil_url, direccion_id, familia_id, ocupacion_id,
--           profesion_id, estado_civil (only over 'No especificado');
--           fecha_registro becomes the older of the two. nombre, apellido,
--           genero and auth_id are the survivor's.
--        i. One personas_fusiones row.
--      Answer: {simulado, queda_id, se_va_id, conteos: {"<tabla>.<columna>":
--      {movidos, descartados[, retirados][, conservados]}}, total_movidos,
--      total_descartados, total_conservados, campos_completados}. Only
--      columns with rows appear.
--      p_simular = true runs exactly the same steps inside a subtransaction
--      and rolls it back, so the counts are the real ones and nothing changes
--      (no audit row either); an explicit NULL is a dry run too. A failure of
--      any step aborts the whole merge. The conserved ledgers only get a
--      SELECT count, so their triggers can break neither the dry run nor the
--      merge.
--   3. personas_fusion_buscar(p_q) and personas_fusion_resumen(p_ids) for the
--      page (admin/pastor only, 42501 'sin_autoridad'): the search of
--      personas_buscar_coincidencias (accents, words in any order, cédula,
--      teléfono; at most 20) with tiene_cuenta, and the side-by-side summary
--      of up to two people (cuenta, cédula, teléfono, email, fecha_registro,
--      fecha_nacimiento, campus, grupos activos, servicios vigentes,
--      asistencias de Grupos de Vida, asistencias DPS).
--
-- Gate: admin or pastor (es_admin_o_pastor(auth.uid())). Merging is global
-- (any two people of any campus), so a campus-level dream_team.org.manage is
-- NOT enough, unlike the Dream Team admin screens.
--
-- IRREVERSIBLE. personas_fusiones keeps the deleted row (se_va_datos) and the
-- counts, which is what a manual repair would need.
--
-- Suite: supabase/tests/personas-fusionar.test.sql.
--
-- ROLLBACK (only the objects; a merge already done is not undone)
--   Re-create the seven trigger functions of section 4 from their previous
--   migrations (named next to each one), then:
--   DROP FUNCTION IF EXISTS public.personas_fusion_solo_reasigna(jsonb, jsonb);
--   DROP FUNCTION IF EXISTS public.personas_fusion_resumen(uuid[]);
--   DROP FUNCTION IF EXISTS public.personas_fusion_buscar(text);
--   DROP FUNCTION IF EXISTS public.personas_fusionar(uuid, uuid, boolean);
--   DROP TABLE IF EXISTS public.personas_fusiones;

CREATE TABLE IF NOT EXISTS public.personas_fusiones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fusionado_en       timestamptz NOT NULL DEFAULT now(),
  actor_id           uuid,
  queda_id           uuid NOT NULL,
  se_va_id           uuid NOT NULL,
  se_va_datos        jsonb NOT NULL,
  campos_completados text[] NOT NULL DEFAULT '{}',
  conteos            jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.personas_fusiones IS
  'Audit of personas_fusionar: who merged which duplicate (se_va, deleted; its row in se_va_datos) '
  'into which survivor (queda), the fields filled and the rows moved or discarded per table.column.';

ALTER TABLE public.personas_fusiones
  ADD COLUMN IF NOT EXISTS referencias_conservadas jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.personas_fusiones.referencias_conservadas IS
  'Rows of append-only ledgers that still hold se_va_id (never rewritten), per "<tabla>.<columna>": '
  'read se_va_id there as queda_id.';

CREATE INDEX IF NOT EXISTS personas_fusiones_queda_idx ON public.personas_fusiones (queda_id);
CREATE INDEX IF NOT EXISTS personas_fusiones_se_va_idx ON public.personas_fusiones (se_va_id);

ALTER TABLE public.personas_fusiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personas_fusiones FROM PUBLIC, anon, authenticated;

-- Whether an UPDATE only re-points the duplicate's id to the survivor during
-- personas_fusionar: app.personas_fusion holds '<se_va_id>><queda_id>' (set by
-- the merge, transaction-local) and every column that differs between p_old
-- and p_new went from se_va_id to queda_id, at least one. Read by the bypass
-- at the top of the rule triggers of section 4; false otherwise.
CREATE OR REPLACE FUNCTION public.personas_fusion_solo_reasigna(p_old jsonb, p_new jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_flag    text := coalesce(current_setting('app.personas_fusion', true), '');
  v_se_va   jsonb;
  v_queda   jsonb;
  v_cambian bigint;
  v_ajenos  bigint;
BEGIN
  IF p_old IS NULL OR p_new IS NULL
     OR v_flag !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_se_va := to_jsonb(split_part(v_flag, '>', 1));
  v_queda := to_jsonb(split_part(v_flag, '>', 2));
  SELECT count(*) FILTER (WHERE o.value IS DISTINCT FROM n.value),
         count(*) FILTER (WHERE o.value IS DISTINCT FROM n.value
                            AND NOT (o.value IS NOT DISTINCT FROM v_se_va AND n.value IS NOT DISTINCT FROM v_queda))
    INTO v_cambian, v_ajenos
    FROM jsonb_each(p_old) o
    FULL JOIN jsonb_each(p_new) n ON n.key = o.key;
  RETURN v_cambian > 0 AND v_ajenos = 0;
END;
$$;

COMMENT ON FUNCTION public.personas_fusion_solo_reasigna(jsonb, jsonb) IS
  'True only inside personas_fusionar (app.personas_fusion = ''<se_va>><queda>'') for an UPDATE whose every '
  'changed column went from se_va to queda. The bypass of the rule triggers that a merge re-points. '
  '20261121120000_personas_fusionar.sql.';

-- Called by SECURITY INVOKER trigger functions under the role that writes the row.
GRANT EXECUTE ON FUNCTION public.personas_fusion_solo_reasigna(jsonb, jsonb) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.personas_fusionar(
  p_queda   uuid,
  p_se_va   uuid,
  p_simular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor       uuid;
  v_queda       public.usuarios%ROWTYPE;
  v_se_va       public.usuarios%ROWTYPE;
  v_ref         record;
  v_idx         record;
  v_cond        text;
  v_pred        text;
  v_n           bigint;
  v_movidos     bigint;
  v_descartados bigint;
  v_entre_ambas bigint := 0;
  v_retirados   bigint := 0;
  v_conteos     jsonb := '{}'::jsonb;
  v_campos      text[] := '{}';
  v_total_m     bigint := 0;
  v_total_d     bigint := 0;
  v_total_c     bigint := 0;
  v_conservados jsonb := '{}'::jsonb;
  v_insc_retiradas bigint := 0;
  v_simular     boolean := coalesce(p_simular, true);
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_admin_o_pastor(auth.uid()) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid();

  IF p_queda IS NULL OR p_se_va IS NULL THEN
    RAISE EXCEPTION 'persona_no_encontrada' USING ERRCODE = '22023';
  END IF;
  IF p_queda = p_se_va THEN
    RAISE EXCEPTION 'misma_persona' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.usuarios u WHERE u.id IN (p_queda, p_se_va) ORDER BY u.id FOR UPDATE;
  SELECT * INTO v_queda FROM public.usuarios u WHERE u.id = p_queda;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'persona_no_encontrada' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_se_va FROM public.usuarios u WHERE u.id = p_se_va;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'persona_no_encontrada' USING ERRCODE = '22023';
  END IF;
  IF v_queda.auth_id IS NOT NULL AND v_se_va.auth_id IS NOT NULL THEN
    RAISE EXCEPTION 'ambas_con_cuenta' USING ERRCODE = '22023';
  END IF;
  IF v_se_va.auth_id IS NOT NULL THEN
    RAISE EXCEPTION 'se_va_tiene_cuenta' USING ERRCODE = '22023';
  END IF;

  BEGIN
    -- c. Family links between the two.
    IF to_regclass('public.relaciones_usuarios') IS NOT NULL THEN
      DELETE FROM public.relaciones_usuarios r
       WHERE (r.usuario1_id = p_queda AND r.usuario2_id = p_se_va)
          OR (r.usuario1_id = p_se_va AND r.usuario2_id = p_queda);
      GET DIAGNOSTICS v_entre_ambas = ROW_COUNT;
    END IF;

    -- d. One principal campus.
    IF EXISTS (SELECT 1 FROM public.usuario_campus uc WHERE uc.usuario_id = p_queda AND uc.es_campus_principal) THEN
      UPDATE public.usuario_campus uc
         SET es_campus_principal = false
       WHERE uc.usuario_id = p_se_va AND uc.es_campus_principal;
    END IF;

    -- e. A vigente servicio repeated in the same equipo and rol is closed, not deleted.
    UPDATE public.dream_team_servicios l
       SET estado = 'retirado'::public.dream_team_estado,
           fecha_fin = coalesce(l.fecha_fin, now())
     WHERE l.persona_id = p_se_va
       AND l.estado <> 'retirado'::public.dream_team_estado
       AND EXISTS (SELECT 1 FROM public.dream_team_servicios s
                    WHERE s.persona_id = p_queda
                      AND s.equipo_id = l.equipo_id
                      AND s.rol_id = l.rol_id
                      AND s.estado <> 'retirado'::public.dream_team_estado);
    GET DIAGNOSTICS v_retirados = ROW_COUNT;

    -- e2. Collisions no unique index settles.
    IF EXISTS (SELECT 1 FROM public.casas_anfitrionas ca WHERE p_se_va IN (ca.usuario_id, ca.co_anfitrion_id))
       AND EXISTS (SELECT 1 FROM public.casas_anfitrionas ca WHERE p_queda IN (ca.usuario_id, ca.co_anfitrion_id)) THEN
      RAISE EXCEPTION 'fusion_conflicto' USING ERRCODE = '22023', DETAIL = 'casas_anfitrionas';
    END IF;

    IF EXISTS (SELECT 1 FROM public.taller_inscripciones i
                WHERE (i.persona_principal_id = p_se_va AND i.companero_id = p_queda)
                   OR (i.persona_principal_id = p_queda AND i.companero_id = p_se_va))
       OR EXISTS (SELECT 1 FROM public.taller_inscripciones i
                   WHERE i.estado NOT IN ('no_aprobado', 'retirado')
                     AND (i.persona_principal_id = p_se_va OR i.companero_id = p_se_va)
                     AND NOT (i.persona_principal_id = p_se_va AND i.companero_id IS NULL)
                     AND EXISTS (SELECT 1 FROM public.taller_inscripciones q
                                  WHERE q.taller_id = i.taller_id
                                    AND q.id <> i.id
                                    AND q.estado NOT IN ('no_aprobado', 'retirado')
                                    AND (q.persona_principal_id = p_queda OR q.companero_id = p_queda))) THEN
      RAISE EXCEPTION 'fusion_conflicto' USING ERRCODE = '22023', DETAIL = 'taller_inscripciones';
    END IF;

    -- The duplicate's individual inscription in an edición where the survivor is active: withdrawn, then moved.
    UPDATE public.taller_inscripciones i
       SET estado = 'retirado', version = i.version + 1
     WHERE i.persona_principal_id = p_se_va
       AND i.companero_id IS NULL
       AND i.estado NOT IN ('no_aprobado', 'retirado')
       AND EXISTS (SELECT 1 FROM public.taller_inscripciones q
                    WHERE q.taller_id = i.taller_id
                      AND q.id <> i.id
                      AND q.estado NOT IN ('no_aprobado', 'retirado')
                      AND (q.persona_principal_id = p_queda OR q.companero_id = p_queda));
    GET DIAGNOSTICS v_insc_retiradas = ROW_COUNT;

    -- f. Move every reference. The rule triggers of section 4 let these re-pointing UPDATEs through.
    PERFORM set_config('app.personas_fusion', p_se_va::text || '>' || p_queda::text, true);
    FOR v_ref IN
      WITH fk AS (
        SELECT k.conrelid AS relid, a.attnum, a.attname::text AS columna, false AS es_arreglo, true AS es_fk, 0 AS orden
          FROM pg_catalog.pg_constraint k
          JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
          JOIN pg_catalog.pg_attribute r ON r.attrelid = k.confrelid AND r.attnum = k.confkey[1]
         WHERE k.contype = 'f'
           AND k.confrelid = 'public.usuarios'::regclass
           AND cardinality(k.conkey) = 1
           AND r.attname = 'id'
           AND k.conparentid = 0
      ),
      lista (tabla, columna) AS (
        VALUES
          ('audit_grupo_miembros', 'usuario_id'),
          ('audit_grupo_miembros', 'actor_usuario_id'),
          ('dream_team_capability_grants', 'persona_id'),
          ('dream_team_estados_historial', 'actor_persona_id'),
          ('dream_team_participation_eventos', 'persona_id'),
          ('dream_team_requisitos_verificacion', 'verificado_por'),
          ('operating_core_capacity_overrides', 'set_by_persona_id'),
          ('operating_core_form_submissions', 'submitted_by_persona_id'),
          ('operating_core_forms', 'created_by_persona_id'),
          ('operating_core_participation_eventos', 'actor_persona_id'),
          ('operating_core_participation_eventos', 'subject_id'),
          ('operating_core_public_tokens', 'persona_id'),
          ('operating_core_public_tokens', 'captured_by_persona_id'),
          ('operating_core_public_tokens', 'consumed_by_persona_id'),
          ('operating_core_registrations', 'persona_id'),
          ('operating_core_registrations', 'captured_by_persona_id'),
          ('operating_core_system_notifications', 'persona_id'),
          ('pastoral_crisis_detection_log', 'actor_persona_id'),
          ('pastoral_one_on_one', 'autor_persona_id'),
          ('pastoral_one_on_one', 'mentor_oficial_persona_id'),
          ('pastoral_one_on_one_notas', 'autor_persona_id'),
          ('pastoral_one_on_one_participantes', 'persona_id'),
          ('pastoral_triada', 'autor_persona_id'),
          ('pastoral_triada', 'mentor_oficial_persona_id'),
          ('pastoral_triada_eventos', 'actor_persona_id'),
          ('pastoral_triada_miembros', 'persona_id'),
          ('planner_pasos', 'usuario_ids'),
          ('taller_certificados', 'persona_id'),
          ('taller_eventos', 'persona_id'),
          ('taller_eventos', 'actor_persona_id'),
          ('taller_grupo_asignaciones', 'persona_id'),
          ('taller_grupo_asignaciones', 'approved_by_director_id'),
          ('taller_inscripciones', 'persona_principal_id'),
          ('taller_inscripciones', 'companero_id'),
          ('taller_reporte_correcciones', 'autor_persona_id'),
          ('taller_solicitudes_retiro', 'solicitante_persona_id'),
          ('talleres_temporadas', 'created_by_persona_id'),
          ('grupo_miembros', 'usuario_id'),
          ('asistencia', 'usuario_id'),
          ('asistencia', 'registrado_por_usuario_id'),
          ('usuario_campus', 'usuario_id'),
          ('usuario_roles', 'usuario_id'),
          ('relaciones_usuarios', 'usuario1_id'),
          ('relaciones_usuarios', 'usuario2_id'),
          ('dream_team_servicios', 'persona_id')
      ),
      extra AS (
        SELECT c.oid AS relid, a.attnum, a.attname::text AS columna,
               (a.atttypid = 'uuid[]'::regtype) AS es_arreglo, false AS es_fk, 1 AS orden
          FROM lista l
          JOIN pg_catalog.pg_class c ON c.relname = l.tabla AND c.relkind IN ('r', 'p')
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
          JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = l.columna AND NOT a.attisdropped
         WHERE a.atttypid IN ('uuid'::regtype, 'uuid[]'::regtype)
           AND NOT EXISTS (SELECT 1 FROM fk WHERE fk.relid = c.oid AND fk.attnum = a.attnum)
      ),
      conservadas AS (
        SELECT c.oid AS relid
          FROM (VALUES ('operating_core_participation_eventos'), ('support_ticket_events')) AS v(tabla)
          JOIN pg_catalog.pg_class c ON c.relname = v.tabla
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        UNION
        SELECT t.tgrelid
          FROM pg_catalog.pg_trigger t
          JOIN pg_catalog.pg_proc f ON f.oid = t.tgfoid
         WHERE NOT t.tgisinternal
           AND t.tgenabled <> 'D'
           AND (t.tgtype::integer & 16) <> 0
           AND (f.proname ILIKE '%append\_only%' OR f.proname ILIKE '%prevent%mutation%')
      )
      SELECT x.relid, x.attnum, x.columna, x.es_arreglo, x.es_fk,
             EXISTS (SELECT 1 FROM conservadas k WHERE k.relid = x.relid) AS conservar,
             c.relname::text AS tabla, n.nspname::text AS esquema
        FROM (SELECT * FROM fk UNION ALL SELECT * FROM extra) x
        JOIN pg_catalog.pg_class c ON c.oid = x.relid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT (n.nspname = 'public' AND c.relname = 'personas_fusiones')
       ORDER BY x.orden, n.nspname, c.relname, x.columna
    LOOP
      v_movidos := 0;
      v_descartados := 0;

      IF v_ref.conservar THEN
        -- Append-only ledger: only counted, never updated or deleted.
        IF v_ref.es_arreglo THEN
          EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I @> ARRAY[$1]::uuid[]',
                         v_ref.esquema, v_ref.tabla, v_ref.columna)
            INTO v_n USING p_se_va;
        ELSE
          EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', v_ref.esquema, v_ref.tabla, v_ref.columna)
            INTO v_n USING p_se_va;
        END IF;
        IF v_n > 0 THEN
          IF v_ref.es_fk THEN
            RAISE EXCEPTION 'historial_inmutable' USING ERRCODE = '22023',
              DETAIL = v_ref.tabla || '.' || v_ref.columna;
          END IF;
          v_conservados := v_conservados || jsonb_build_object(v_ref.tabla || '.' || v_ref.columna, v_n);
          v_conteos := v_conteos || jsonb_build_object(
            v_ref.tabla || '.' || v_ref.columna,
            jsonb_build_object('movidos', 0, 'descartados', 0, 'conservados', v_n));
          v_total_c := v_total_c + v_n;
        END IF;
        CONTINUE;
      END IF;

      IF v_ref.es_arreglo THEN
        EXECUTE format('UPDATE %I.%I SET %I = array_replace(%I, $2, $1) WHERE %I @> ARRAY[$2]::uuid[]',
                       v_ref.esquema, v_ref.tabla, v_ref.columna, v_ref.columna, v_ref.columna)
          USING p_queda, p_se_va;
        GET DIAGNOSTICS v_movidos = ROW_COUNT;
      ELSE
        -- Collisions on every UNIQUE index that holds the column: keep the survivor's row.
        FOR v_idx IN
          SELECT i.indexrelid,
                 (i.indkey::int2[])[0:i.indnkeyatts - 1] AS claves,
                 pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicado
            FROM pg_catalog.pg_index i
           WHERE i.indrelid = v_ref.relid
             AND i.indisunique
             AND i.indexprs IS NULL
             AND v_ref.attnum = ANY ((i.indkey::int2[])[0:i.indnkeyatts - 1])
        LOOP
          SELECT string_agg(format('s.%1$I = l.%1$I', a.attname), ' AND ')
            INTO v_cond
            FROM unnest(v_idx.claves) AS k(attnum)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = v_ref.relid AND a.attnum = k.attnum
           WHERE k.attnum <> v_ref.attnum;
          v_pred := CASE WHEN v_idx.predicado IS NULL THEN '' ELSE ' AND (' || v_idx.predicado || ')' END;
          EXECUTE format(
            'DELETE FROM %1$I.%2$I WHERE ctid IN ('
            || 'SELECT l.fila FROM (SELECT ctid AS fila, * FROM %1$I.%2$I WHERE %3$I = $2%4$s) l '
            || 'JOIN (SELECT * FROM %1$I.%2$I WHERE %3$I = $1%4$s) s ON %5$s)',
            v_ref.esquema, v_ref.tabla, v_ref.columna, v_pred, coalesce(v_cond, 'true'))
            USING p_queda, p_se_va;
          GET DIAGNOSTICS v_n = ROW_COUNT;
          v_descartados := v_descartados + v_n;
        END LOOP;

        EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2',
                       v_ref.esquema, v_ref.tabla, v_ref.columna, v_ref.columna)
          USING p_queda, p_se_va;
        GET DIAGNOSTICS v_movidos = ROW_COUNT;
      END IF;

      IF v_movidos + v_descartados > 0 THEN
        v_conteos := v_conteos || jsonb_build_object(
          v_ref.tabla || '.' || v_ref.columna,
          jsonb_build_object('movidos', v_movidos, 'descartados', v_descartados));
        v_total_m := v_total_m + v_movidos;
        v_total_d := v_total_d + v_descartados;
      END IF;
    END LOOP;
    PERFORM set_config('app.personas_fusion', '', true);

    IF v_insc_retiradas > 0 THEN
      v_conteos := jsonb_set(
        v_conteos, '{taller_inscripciones.persona_principal_id}',
        coalesce(v_conteos -> 'taller_inscripciones.persona_principal_id', '{"movidos": 0, "descartados": 0}'::jsonb)
          || jsonb_build_object('retirados', v_insc_retiradas));
    END IF;
    IF v_retirados > 0 THEN
      v_conteos := jsonb_set(
        v_conteos, '{dream_team_servicios.persona_id}',
        coalesce(v_conteos -> 'dream_team_servicios.persona_id', '{"movidos": 0, "descartados": 0}'::jsonb)
          || jsonb_build_object('retirados', v_retirados));
    END IF;
    IF v_entre_ambas > 0 THEN
      v_conteos := v_conteos || jsonb_build_object(
        'relaciones_usuarios.entre_ambas', jsonb_build_object('movidos', 0, 'descartados', v_entre_ambas));
      v_total_d := v_total_d + v_entre_ambas;
    END IF;

    -- g. The duplicate goes.
    DELETE FROM public.usuarios u WHERE u.id = p_se_va;

    -- h. Fill the survivor's empty fields, never overwriting.
    IF nullif(btrim(coalesce(v_queda.cedula, '')), '') IS NULL AND nullif(btrim(coalesce(v_se_va.cedula, '')), '') IS NOT NULL THEN
      v_queda.cedula := v_se_va.cedula; v_campos := v_campos || 'cedula'::text;
    END IF;
    IF nullif(btrim(coalesce(v_queda.telefono, '')), '') IS NULL AND nullif(btrim(coalesce(v_se_va.telefono, '')), '') IS NOT NULL THEN
      v_queda.telefono := v_se_va.telefono; v_campos := v_campos || 'telefono'::text;
    END IF;
    IF nullif(btrim(coalesce(v_queda.email, '')), '') IS NULL AND nullif(btrim(coalesce(v_se_va.email, '')), '') IS NOT NULL THEN
      v_queda.email := v_se_va.email; v_campos := v_campos || 'email'::text;
    END IF;
    IF v_queda.fecha_nacimiento IS NULL AND v_se_va.fecha_nacimiento IS NOT NULL THEN
      v_queda.fecha_nacimiento := v_se_va.fecha_nacimiento; v_campos := v_campos || 'fecha_nacimiento'::text;
    END IF;
    IF v_queda.bautizado IS NULL AND v_se_va.bautizado IS NOT NULL THEN
      v_queda.bautizado := v_se_va.bautizado; v_campos := v_campos || 'bautizado'::text;
    END IF;
    IF v_queda.fecha_bautizo IS NULL AND v_se_va.fecha_bautizo IS NOT NULL THEN
      v_queda.fecha_bautizo := v_se_va.fecha_bautizo; v_campos := v_campos || 'fecha_bautizo'::text;
    END IF;
    IF nullif(btrim(coalesce(v_queda.talla_franela, '')), '') IS NULL AND nullif(btrim(coalesce(v_se_va.talla_franela, '')), '') IS NOT NULL THEN
      v_queda.talla_franela := v_se_va.talla_franela; v_campos := v_campos || 'talla_franela'::text;
    END IF;
    IF nullif(btrim(coalesce(v_queda.redes_sociales, '')), '') IS NULL AND nullif(btrim(coalesce(v_se_va.redes_sociales, '')), '') IS NOT NULL THEN
      v_queda.redes_sociales := v_se_va.redes_sociales; v_campos := v_campos || 'redes_sociales'::text;
    END IF;
    IF nullif(btrim(coalesce(v_queda.foto_perfil_url, '')), '') IS NULL AND nullif(btrim(coalesce(v_se_va.foto_perfil_url, '')), '') IS NOT NULL THEN
      v_queda.foto_perfil_url := v_se_va.foto_perfil_url; v_campos := v_campos || 'foto_perfil_url'::text;
    END IF;
    IF v_queda.direccion_id IS NULL AND v_se_va.direccion_id IS NOT NULL THEN
      v_queda.direccion_id := v_se_va.direccion_id; v_campos := v_campos || 'direccion_id'::text;
    END IF;
    IF v_queda.familia_id IS NULL AND v_se_va.familia_id IS NOT NULL THEN
      v_queda.familia_id := v_se_va.familia_id; v_campos := v_campos || 'familia_id'::text;
    END IF;
    IF v_queda.ocupacion_id IS NULL AND v_se_va.ocupacion_id IS NOT NULL THEN
      v_queda.ocupacion_id := v_se_va.ocupacion_id; v_campos := v_campos || 'ocupacion_id'::text;
    END IF;
    IF v_queda.profesion_id IS NULL AND v_se_va.profesion_id IS NOT NULL THEN
      v_queda.profesion_id := v_se_va.profesion_id; v_campos := v_campos || 'profesion_id'::text;
    END IF;
    IF v_queda.estado_civil::text = 'No especificado' AND v_se_va.estado_civil::text <> 'No especificado' THEN
      v_queda.estado_civil := v_se_va.estado_civil; v_campos := v_campos || 'estado_civil'::text;
    END IF;
    IF v_se_va.fecha_registro < v_queda.fecha_registro THEN
      v_queda.fecha_registro := v_se_va.fecha_registro; v_campos := v_campos || 'fecha_registro'::text;
    END IF;

    IF cardinality(v_campos) > 0 THEN
      UPDATE public.usuarios u
         SET cedula = v_queda.cedula,
             telefono = v_queda.telefono,
             email = v_queda.email,
             fecha_nacimiento = v_queda.fecha_nacimiento,
             bautizado = v_queda.bautizado,
             fecha_bautizo = v_queda.fecha_bautizo,
             talla_franela = v_queda.talla_franela,
             redes_sociales = v_queda.redes_sociales,
             foto_perfil_url = v_queda.foto_perfil_url,
             direccion_id = v_queda.direccion_id,
             familia_id = v_queda.familia_id,
             ocupacion_id = v_queda.ocupacion_id,
             profesion_id = v_queda.profesion_id,
             estado_civil = v_queda.estado_civil,
             fecha_registro = v_queda.fecha_registro
       WHERE u.id = p_queda;
    END IF;

    IF v_simular THEN
      RAISE EXCEPTION 'personas_fusionar_simulacion' USING ERRCODE = 'GCF01';
    END IF;

    -- i. Audit.
    INSERT INTO public.personas_fusiones -- noqa: insert-into
      (actor_id, queda_id, se_va_id, se_va_datos, campos_completados, conteos, referencias_conservadas)
    VALUES (v_actor, p_queda, p_se_va, to_jsonb(v_se_va), v_campos, v_conteos, v_conservados);
  EXCEPTION
    WHEN SQLSTATE 'GCF01' THEN
      NULL; -- dry run: every change above is rolled back, the counts stay.
  END;

  RETURN jsonb_build_object(
    'simulado', v_simular,
    'queda_id', p_queda,
    'se_va_id', p_se_va,
    'conteos', v_conteos,
    'total_movidos', v_total_m,
    'total_descartados', v_total_d,
    'total_conservados', v_total_c,
    'campos_completados', to_jsonb(v_campos));
END;
$$;

COMMENT ON FUNCTION public.personas_fusionar(uuid, uuid, boolean) IS
  'Merges the duplicate (p_se_va, deleted) into the survivor (p_queda, keeps the account): moves every '
  'foreign key to usuarios and the known persona columns without one, resolves unique collisions keeping '
  'the survivor''s row, fills empty fields, audits in personas_fusiones. Append-only ledgers '
  '(operating_core_participation_eventos, support_ticket_events, or an UPDATE trigger named *append_only* / '
  '*prevent*mutation*) are never rewritten: their rows keep the deleted id, reported as conservados and mapped '
  'in personas_fusiones. Rule triggers let the re-pointing UPDATEs through (app.personas_fusion, '
  'personas_fusion_solo_reasigna); a duplicate individual taller inscription is withdrawn; two hosts of casas or a '
  'couple collision refuse with fusion_conflicto (DETAIL the table). p_simular: same counts, no change. '
  'Admin/pastor only. 20261121120000_personas_fusionar.sql.';

REVOKE ALL ON FUNCTION public.personas_fusionar(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_fusionar(uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.personas_fusion_buscar(p_q text)
RETURNS TABLE (id uuid, nombre text, apellido text, email text, tiene_cuenta boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_admin_o_pastor(auth.uid()) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.nombre::text, u.apellido::text, u.email::text, (u.auth_id IS NOT NULL)
    FROM public.personas_buscar_coincidencias(p_q, 20) c
    JOIN public.usuarios u ON u.id = c.id
   ORDER BY u.apellido, u.nombre, u.id;
END;
$$;

COMMENT ON FUNCTION public.personas_fusion_buscar(text) IS
  'The search of /admin/personas/fusionar (personas_buscar_coincidencias, at most 20) with tiene_cuenta. '
  'Admin/pastor only.';

REVOKE ALL ON FUNCTION public.personas_fusion_buscar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_fusion_buscar(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.personas_fusion_resumen(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_admin_o_pastor(auth.uid()) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) > 2 THEN
    RAISE EXCEPTION 'demasiados_ids' USING ERRCODE = '22023';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', u.id,
             'nombre', u.nombre,
             'apellido', u.apellido,
             'tiene_cuenta', u.auth_id IS NOT NULL,
             'cedula', u.cedula,
             'telefono', u.telefono,
             'email', u.email,
             'fecha_registro', u.fecha_registro,
             'fecha_nacimiento', u.fecha_nacimiento,
             'campus', (SELECT c.nombre
                          FROM public.usuario_campus uc
                          JOIN public.campus c ON c.id = uc.campus_id
                         WHERE uc.usuario_id = u.id
                         ORDER BY uc.es_campus_principal DESC, c.nombre
                         LIMIT 1),
             'grupos', (SELECT count(*) FROM public.grupo_miembros gm
                         WHERE gm.usuario_id = u.id AND gm.fecha_salida IS NULL),
             'servicios', (SELECT count(*) FROM public.dream_team_servicios s
                            WHERE s.persona_id = u.id AND s.estado <> 'retirado'::public.dream_team_estado),
             'asistencias', (SELECT count(*) FROM public.asistencia a WHERE a.usuario_id = u.id),
             'asistencias_dps', (SELECT count(*) FROM public.dps_asistencias d WHERE d.persona_id = u.id)
           ) ORDER BY array_position(p_ids, u.id))
      FROM public.usuarios u
     WHERE u.id = ANY (p_ids)
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.personas_fusion_resumen(uuid[]) IS
  'Side-by-side summary of up to two people for /admin/personas/fusionar: cuenta, cédula, teléfono, email, '
  'fechas, campus, grupos activos, servicios vigentes, asistencias (Grupos de Vida and DPS). Admin/pastor only.';

REVOKE ALL ON FUNCTION public.personas_fusion_resumen(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_fusion_resumen(uuid[]) TO authenticated, service_role;

-- ── 4. Rule triggers: the merge's bypass (T7, B1) ────────────────────
--
-- Each function below is its latest definition (the migration named above
-- it), byte for byte, plus the same block at the very top: inside
-- personas_fusionar, an UPDATE whose only change is the duplicate's id
-- becoming the survivor's returns NEW untouched (personas_fusion_solo_reasigna).
-- Outside a merge app.personas_fusion is empty and nothing else is read, so
-- every other write keeps the full rule. The triggers themselves do not change.

-- From 20261102100000_estudiantes_promocion.sql.
create or replace function public.estudiantes_grupo_miembros_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  if tg_op = 'UPDATE' and coalesce(current_setting('app.personas_fusion', true), '') <> '' then
    if public.personas_fusion_solo_reasigna(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
  end if;
  if tg_op = 'UPDATE'
     and (new.grupo_id is distinct from old.grupo_id or new.persona_id is distinct from old.persona_id
          or (new.ambito_id is distinct from old.ambito_id
              and coalesce(current_setting('estudiantes.promocion', true), '') <> 'on')) then
    raise exception 'miembro_invalido' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    select g.ambito_id into new.ambito_id from public.estudiantes_grupos g where g.id = new.grupo_id;
  end if;
  return new;
end;
$$;

revoke all on function public.estudiantes_grupo_miembros_validar() from public, anon;

-- From 20261102100000_estudiantes_promocion.sql.
create or replace function public.estudiantes_grupos_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ambito uuid;
  v_experiencia text;
begin
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  if tg_op = 'UPDATE' and coalesce(current_setting('app.personas_fusion', true), '') <> '' then
    if public.personas_fusion_solo_reasigna(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
  end if;
  if tg_op = 'UPDATE'
     and (new.campus_id is distinct from old.campus_id
          or (new.subarea_id is distinct from old.subarea_id
              and coalesce(current_setting('estudiantes.promocion', true), '') <> 'on')) then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;

  select a.id, a.experiencia into v_ambito, v_experiencia
    from public.dream_team_equipos s
    join public.dream_team_equipos a on a.id = s.parent_equipo_id
   where s.id = new.subarea_id
     and public.estudiantes_es_subarea_grupos(s.label)
     and a.experiencia in ('estudiantes', 'the_living_room')
     and (tg_op = 'UPDATE' or (s.activo and a.activo));
  if v_ambito is null then
    raise exception 'subarea_invalida' using errcode = '22023';
  end if;

  new.ambito_id := v_ambito;
  new.nombre := btrim(new.nombre);
  new.zona := nullif(btrim(coalesce(new.zona, '')), '');
  if (v_experiencia = 'estudiantes') <> (new.anio is not null) then
    raise exception 'anio_invalido' using errcode = '22023';
  end if;
  -- Transit / Inside Out meet in the turno; an hour needs its day.
  if (v_experiencia = 'estudiantes' and (new.dia_semana is not null or new.hora is not null))
     or (new.hora is not null and new.dia_semana is null) then
    raise exception 'horario_invalido' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.estudiantes_grupos_validar() from public, anon;

-- From 20260811110000_talleres_tables_reportes_eventos.sql.
CREATE OR REPLACE FUNCTION public.taller_reportes_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.personas_fusion', true), '') <> '' THEN
    IF public.personas_fusion_solo_reasigna(to_jsonb(OLD), to_jsonb(NEW)) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Rule 0: 'cerrado' is TERMINAL. No state transition out of it
  -- is permitted. The design state.ts marks `cerrado` as terminal;
  -- corrections after close are not allowed at all (the audit trail
  -- is sealed).
  IF OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'taller_reportes lock: cerrado is terminal (no transitions out, got %)', NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 1: 'enviado' is locked except for the reopened/closed
  -- transition.
  IF OLD.estado = 'enviado'
     AND NEW.estado NOT IN ('reabierto', 'cerrado') THEN
    RAISE EXCEPTION 'taller_reportes locked: enviado can only transition to reabierto or cerrado (got %)', NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 2: reabierto requires non-empty reabierto_motivo.
  IF NEW.estado = 'reabierto'
     AND (NEW.reabierto_motivo IS NULL OR length(trim(NEW.reabierto_motivo)) = 0) THEN
    RAISE EXCEPTION 'taller_reportes: reabierto requires reabierto_motivo NOT NULL with non-empty content'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 3: reabierto requires reabierto_por_persona_id (audit).
  IF NEW.estado = 'reabierto'
     AND NEW.reabierto_por_persona_id IS NULL THEN
    RAISE EXCEPTION 'taller_reportes: reabierto requires reabierto_por_persona_id NOT NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 4: closing a reabierto report requires the reopener
  -- identity preserved (the reopener is the only one who can close).
  IF NEW.estado = 'cerrado'
     AND OLD.estado = 'reabierto'
     AND NEW.reabierto_por_persona_id IS NULL THEN
    RAISE EXCEPTION 'taller_reportes: closing a reabierto report requires reabierto_por_persona_id preserved'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 5: signature fields required at envio.
  IF OLD.estado = 'borrador'
     AND NEW.estado = 'enviado'
     AND (NEW.firma_lider_persona_id IS NULL OR NEW.firma_lider_fecha IS NULL) THEN
    RAISE EXCEPTION 'taller_reportes: borrador -> enviado requires firma_lider_persona_id AND firma_lider_fecha NOT NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

-- From 20261003140000_talleres_cierre_de_edicion.sql.
CREATE OR REPLACE FUNCTION public.talleres_ediciones_cierre_solo_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.personas_fusion', true), '') <> '' THEN
    IF public.personas_fusion_solo_reasigna(to_jsonb(OLD), to_jsonb(NEW)) THEN
      RETURN NEW;
    END IF;
  END IF;
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

-- From 20260926150000_talleres_plantillas_del_taller.sql.
CREATE OR REPLACE FUNCTION public.taller_grupo_asignaciones_exige_servidor_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo_id uuid;
  v_taller_id uuid;
BEGIN
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.personas_fusion', true), '') <> '' THEN
    IF public.personas_fusion_solo_reasigna(to_jsonb(OLD), to_jsonb(NEW)) THEN
      RETURN NEW;
    END IF;
  END IF;

  v_equipo_id := public.talleres_equipo_de_grupo(NEW.grupo_id);

  SELECT t.id INTO v_taller_id
  FROM public.talleres t
  WHERE t.dream_team_equipo_id = v_equipo_id;

  IF v_taller_id IS NULL OR NOT public.talleres_es_servidor_activo_del_taller(v_taller_id, NEW.persona_id) THEN
    RAISE EXCEPTION 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.taller_grupo_asignaciones_exige_servidor_activo() FROM PUBLIC, anon;

-- From 20260926150000_talleres_plantillas_del_taller.sql.
CREATE OR REPLACE FUNCTION public.taller_plantilla_facilitadores_exige_servidor_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller_id uuid;
BEGIN
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.personas_fusion', true), '') <> '' THEN
    IF public.personas_fusion_solo_reasigna(to_jsonb(OLD), to_jsonb(NEW)) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT g.taller_id INTO v_taller_id
  FROM public.taller_plantilla_grupos g
  WHERE g.id = NEW.plantilla_grupo_id;

  IF v_taller_id IS NULL OR NOT public.talleres_es_servidor_activo_del_taller(v_taller_id, NEW.persona_id) THEN
    RAISE EXCEPTION 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.taller_plantilla_facilitadores_exige_servidor_activo() FROM PUBLIC, anon;

-- From 20260925150000_dream_team_servicio_grants_cast_fix.sql. Not a refusal:
-- re-pointing a servicio used to revoke the SURVIVOR's role grants for the old
-- rol (and re-grant only when activo), which stripped them when the moved
-- servicio was the retirado duplicate of step e. Inside a merge the grants
-- move with dream_team_capability_grants.persona_id instead.
CREATE OR REPLACE FUNCTION public.sync_talleres_grants_on_servicio_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_experiencia   text;
  v_rol_new       text;
  v_rol_old       text;
  v_taller_new    uuid;
  v_taller_old    uuid;
  v_estado_new    text;
  v_estado_old    text;
  v_persona_new   uuid;
  v_persona_old   uuid;
BEGIN
  -- personas_fusionar re-points the duplicate's id (20261121120000).
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.personas_fusion', true), '') <> '' THEN
    IF public.personas_fusion_solo_reasigna(to_jsonb(OLD), to_jsonb(NEW)) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── DELETE: revoke everything we ever granted for (persona, taller) ──
  IF TG_OP = 'DELETE' THEN
    v_persona_old := OLD.persona_id;
    v_taller_old  := OLD.equipo_id;
    DELETE FROM public.dream_team_capability_grants g
      USING public.talleres_role_capability_map m
      WHERE g.persona_id     = v_persona_old
        AND g.experience     = 'talleres_crecimiento'
        AND g.source         = 'role-auto-grant'
        AND g.scope_id       = v_taller_old::text
        AND m.capability_key = g.capability_key;
    RETURN OLD;
  END IF;

  -- ── INSERT or UPDATE: discover experiencia + rol ──
  v_persona_new := NEW.persona_id;
  v_taller_new  := NEW.equipo_id;
  v_estado_new  := NEW.estado::text;

  SELECT eq.experiencia, r.label
    INTO v_experiencia, v_rol_new
    FROM public.dream_team_equipos eq
    JOIN public.dream_team_roles    r ON r.id = NEW.rol_id
   WHERE eq.id = NEW.equipo_id;

  -- Only the talleres experience triggers reconciliation.
  IF v_experiencia IS DISTINCT FROM 'talleres_crecimiento' THEN
    RETURN NEW;
  END IF;

  -- Not in the canonical mapping → no-op.
  IF v_rol_new IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.talleres_role_capability_map m WHERE m.rol = v_rol_new
     ) THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, compare with OLD so a rol change revokes the previous grants.
  IF TG_OP = 'UPDATE' THEN
    v_estado_old := OLD.estado::text;
    v_taller_old := OLD.equipo_id;
    SELECT r.label
      INTO v_rol_old
      FROM public.dream_team_roles r
     WHERE r.id = OLD.rol_id;

    -- Revoke prior grants (rol or scope moved, regardless of estado).
    DELETE FROM public.dream_team_capability_grants g
      USING public.talleres_role_capability_map m
      WHERE g.persona_id     = v_persona_new
        AND g.experience     = 'talleres_crecimiento'
        AND g.source         = 'role-auto-grant'
        AND g.scope_id       = v_taller_old::text
        AND m.capability_key = g.capability_key
        AND m.rol            = COALESCE(v_rol_old, '__none__');
  END IF;

  -- Grant only when estado='activo'. Otherwise leave the row revoked.
  IF v_estado_new = 'activo' THEN
    PERFORM public.assign_talleres_capabilities_for_role(
      v_persona_new, v_rol_new, v_taller_new
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_talleres_grants_on_servicio_change() FROM PUBLIC, anon;
