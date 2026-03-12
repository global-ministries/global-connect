-- Migración 006: Vistas y funciones para el panel de solicitudes
-- Vista de solicitudes pendientes, historial de miembro, conteo para badge

-- ═══════════════════════════════════════════════════════════════════════
-- Vista: solicitudes pendientes (para el panel del DG)
-- Incluye datos enriquecidos del grupo, miembro, solicitante y temporada
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_solicitudes_pendientes AS
SELECT
  s.id, s.tipo, s.estado, s.motivo, s.creado_en, s.expira_en,
  s.grupo_id, s.grupo_origen_id, s.rol_solicitado, s.temporada_id,
  g.nombre AS grupo_nombre, seg.nombre AS segmento_nombre,
  go.nombre AS grupo_origen_nombre,
  u.id AS miembro_id, u.nombre AS miembro_nombre, u.apellido AS miembro_apellido,
  u.foto_perfil_url AS miembro_foto,
  sol.nombre AS solicitante_nombre, sol.apellido AS solicitante_apellido,
  t.nombre AS temporada_nombre, t.estado AS temporada_estado
FROM public.solicitudes_grupo s
JOIN public.grupos g ON g.id = s.grupo_id
JOIN public.segmentos seg ON seg.id = g.segmento_id
LEFT JOIN public.grupos go ON go.id = s.grupo_origen_id
LEFT JOIN public.usuarios u ON u.id = s.usuario_id
JOIN public.usuarios sol ON sol.id = s.solicitado_por
LEFT JOIN public.temporadas t ON t.id = s.temporada_id
WHERE s.estado = 'pendiente';

-- ═══════════════════════════════════════════════════════════════════════
-- Vista: historial de movimientos de un miembro
-- Muestra todos los movimientos con nombres legibles
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_historial_miembro AS
SELECT
  h.id, h.usuario_id, h.tipo_movimiento, h.rol_anterior, h.rol_nuevo,
  h.motivo, h.creado_en,
  go.nombre AS grupo_origen, gd.nombre AS grupo_destino,
  r.nombre AS realizado_por_nombre, r.apellido AS realizado_por_apellido,
  t.nombre AS temporada
FROM public.historial_movimientos_grupo h
LEFT JOIN public.grupos go ON go.id = h.grupo_origen_id
LEFT JOIN public.grupos gd ON gd.id = h.grupo_destino_id
LEFT JOIN public.usuarios r ON r.id = h.realizado_por
LEFT JOIN public.temporadas t ON t.id = h.temporada_id;

-- ═══════════════════════════════════════════════════════════════════════
-- Función: contar_solicitudes_pendientes
-- Retorna conteo scoped para el badge del sidebar
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.contar_solicitudes_pendientes(p_auth_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  -- Superadmin ve todas
  IF public.es_superadmin(
    (SELECT id FROM public.usuarios WHERE auth_id = p_auth_id)
  ) THEN
    SELECT COUNT(*) INTO v_count FROM public.solicitudes_grupo WHERE estado = 'pendiente';
  ELSE
    -- DG solo ve las de sus segmentos asignados
    SELECT COUNT(*) INTO v_count FROM public.solicitudes_grupo s
    JOIN public.grupos g ON g.id = s.grupo_id
    WHERE s.estado = 'pendiente'
      AND public.es_director_general_de_grupo(p_auth_id, s.grupo_id);
  END IF;
  RETURN v_count;
END; $$;
