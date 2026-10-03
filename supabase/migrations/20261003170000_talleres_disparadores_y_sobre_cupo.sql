-- L2 (odd/tasks/talleres-limpieza.md, backlog TB-27) — dead trigger guards
-- and the sobre-cupo helper's missing companero branch.
-- noqa: insert-into (the only INSERT is the B trigger body, not data)
--
-- Function bodies only: same names, signatures, return types, language,
-- volatility, security mode and owner. Based on the LIVE staging
-- definitions (pg_get_functiondef), which match their latest migration
-- text: 20260811100000 (A), 20260811110000 (B), 20260928130000 (C); no
-- later migration redefines any of them.
--
-- A. taller_grupos_capture_recursos_snapshot() — trigger
--    trg_taller_grupos_capture_recursos_snapshot, AFTER UPDATE OF estado
--    ON taller_grupos, unchanged. Its whole body sat behind
--    `pg_trigger_depth() < 1`, which is never true inside a trigger (the
--    depth is at least 1 there), so recursos_snapshot was never captured
--    and completed_at never set (talleres_cerrar_edicion sets completed_at
--    itself for that reason). The guard goes; the body now runs when a
--    grupo's estado changes to completado, as designed in
--    20260810140000.
--    * No recursion: the inner UPDATE sets recursos_snapshot and
--      completed_at only, so the AFTER UPDATE OF estado trigger does not
--      fire again for it.
--    * Idempotent: it only acts while recursos_snapshot IS NULL (in the IF
--      and in the UPDATE), so the first snapshot is kept when a grupo is
--      reopened and completed again.
--    * Agrees with talleres_cerrar_edicion: completed_at is now
--      COALESCE(completed_at, now()), so the close's own
--      COALESCE(g.completed_at, now()) and any earlier value are kept
--      instead of being overwritten.
--    * The snapshot keys and their meaning are unchanged:
--      leaders_activos / voluntarios_activos (active assignments of the
--      grupo), inscripciones_count (every inscription of the grupo's
--      cohorte, as written in 20260811100000), asistencia_total (presente
--      rows on the grupo's clases). `c.id = (SELECT cohorte_id FROM
--      taller_grupos WHERE id = NEW.id)` becomes `i.cohorte_id =
--      NEW.cohorte_id`: same rows (cohorte_id is a NOT NULL FK).
--    It stays SECURITY INVOKER with no pinned search_path, as today: every
--    reference is schema-qualified, and its only writer of estado
--    'completado' is talleres_cerrar_edicion (a definer function).
--
-- B. taller_reportes_capture_correccion() — trigger
--    trg_taller_reportes_capture_correccion, AFTER UPDATE ON
--    taller_reportes, unchanged. It started with
--    `IF pg_trigger_depth() < 1 THEN RETURN NULL; END IF;`, the same dead
--    guard: the early exit never ran. It goes and nothing else changes:
--    one taller_reporte_correcciones row per estado change (author
--    COALESCE(reabierto_por_persona_id, firma_lider_persona_id), motivo
--    reabierto_motivo or 'transition'), none for other edits. The insert
--    targets another table, so there is no recursion to guard against.
--    talleres_cerrar_edicion relies on this body. Stays SECURITY INVOKER
--    with no pinned search_path, as today.
--
-- C. talleres_inscripciones_sobre_cupo_personas(uuid[]) mirrors
--    taller_inscripciones_select but missed the companero branch that
--    20261003140000 (part H) added to that policy, so the companero of a
--    couple placed over the cupo could not see who placed them. The
--    branch is added with the same auth.uid() -> usuarios.auth_id idiom;
--    every other term is kept verbatim. Definer mode, STABLE, LANGUAGE
--    sql and search_path pinned to public are kept; grants restated
--    (authenticated only, no PUBLIC, no anon).
--
-- Rollback: recreate A from 20260811100000, B from 20260811110000 and C
-- from 20260928130000 (part F), with its grants.

-- ===========================================================================
-- A. taller_grupos_capture_recursos_snapshot()
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.taller_grupos_capture_recursos_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot jsonb;
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.estado = 'completado'
     AND NEW.recursos_snapshot IS NULL THEN
    SELECT jsonb_build_object(
      'leaders_activos', COUNT(*) FILTER (WHERE a.rol = 'lider'),
      'voluntarios_activos', COUNT(*) FILTER (WHERE a.rol = 'voluntario'),
      'inscripciones_count', (
        SELECT COUNT(*) FROM public.taller_inscripciones i
        WHERE i.cohorte_id = NEW.cohorte_id
      ),
      'asistencia_total', (
        SELECT COUNT(*) FROM public.taller_asistencias ta
        JOIN public.taller_sesiones ts ON ts.id = ta.sesion_id
        WHERE ts.grupo_id = NEW.id AND ta.estado = 'presente'
      )
    ) INTO snapshot
    FROM public.taller_grupo_asignaciones a
    WHERE a.grupo_id = NEW.id AND a.activo = true;

    UPDATE public.taller_grupos
       SET recursos_snapshot = snapshot,
           completed_at = COALESCE(completed_at, now())
     WHERE id = NEW.id AND recursos_snapshot IS NULL;
  END IF;
  RETURN NEW;
END
$$;

-- ===========================================================================
-- B. taller_reportes_capture_correccion()
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.taller_reportes_capture_correccion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    v_motivo := COALESCE(NULLIF(trim(NEW.reabierto_motivo), ''), 'transition');

    INSERT INTO public.taller_reporte_correcciones (
      reporte_id,
      autor_persona_id,
      contenido_anterior,
      contenido_nuevo,
      motivo
    ) VALUES (
      NEW.id,
      COALESCE(NEW.reabierto_por_persona_id, NEW.firma_lider_persona_id),
      to_jsonb(OLD),
      to_jsonb(NEW),
      v_motivo
    );
  END IF;

  RETURN NULL;
END
$$;

-- ===========================================================================
-- C. talleres_inscripciones_sobre_cupo_personas(uuid[])
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_inscripciones_sobre_cupo_personas(
  p_inscripcion_ids uuid[]
)
RETURNS TABLE (
  inscripcion_id uuid,
  sobre_cupo_por_nombre text,
  sobre_cupo_por_apellido text,
  sobre_cupo_en timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    i.id                AS inscripcion_id,
    u.nombre            AS sobre_cupo_por_nombre,
    u.apellido          AS sobre_cupo_por_apellido,
    i.sobre_cupo_en
  FROM public.taller_inscripciones i
  LEFT JOIN public.usuarios u ON u.id = i.sobre_cupo_por
  WHERE i.id = ANY (p_inscripcion_ids)
    AND i.sobre_cupo = true
    -- Mirror of the live taller_inscripciones_select (verbatim terms,
    -- fail-closed), same pattern as talleres_coord_inscripciones_personas.
    AND (
      i.persona_principal_id IN (
        SELECT usuarios.id FROM public.usuarios WHERE usuarios.auth_id = auth.uid()
      )
      OR i.companero_id IN (
        SELECT usuarios.id FROM public.usuarios WHERE usuarios.auth_id = auth.uid()
      )
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.talleres_es_miembro_del_grupo(i.grupo_id)
    );
$$;

COMMENT ON FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]) IS
  'T6 - resolves sobre_cupo_por''s display name for the inscritos table badge tooltip, re-applying taller_inscripciones_select (fail-closed, companero branch included since 20261003170000) instead of a raw usuarios embed.';

REVOKE ALL ON FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]) TO authenticated;
