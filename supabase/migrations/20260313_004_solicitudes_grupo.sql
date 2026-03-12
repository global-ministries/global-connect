-- Migración 004: Tabla de solicitudes de grupo + historial de movimientos
-- btree_gist necesaria para EXCLUDE constraint con operadores =

-- Extensión para EXCLUDE constraint con texto
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ═══════════════════════════════════════════════════════════════════════
-- Tabla: solicitudes_grupo
-- Registra cada solicitud (ingreso, traslado, cambio_rol, egreso, activacion_grupo)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.solicitudes_grupo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              text NOT NULL
                    CHECK (tipo IN ('ingreso', 'traslado', 'cambio_rol', 'egreso', 'activacion_grupo')),
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'expirado')),

  -- Actores
  solicitado_por    uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  aprobado_por      uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,

  -- Objetivo
  usuario_id        uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,  -- nullable para activacion_grupo
  grupo_id          uuid NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  grupo_origen_id   uuid REFERENCES public.grupos(id) ON DELETE SET NULL,

  -- Campos específicos por tipo
  rol_actual        text,
  rol_solicitado    text,

  -- Metadatos
  motivo            text,
  notas_director    text,    -- notas del DG al aprobar/rechazar (info interna, el miembro no la ve)

  -- Temporada asociada
  temporada_id      uuid REFERENCES public.temporadas(id) ON DELETE SET NULL,

  -- Fechas
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  expira_en         timestamptz,  -- calculado: creado_en + dias_expiracion

  -- Evitar solicitudes duplicadas pendientes para el mismo usuario/grupo/tipo
  CONSTRAINT no_solicitud_duplicada_pendiente
    EXCLUDE USING gist (
      usuario_id WITH =,
      grupo_id WITH =,
      tipo WITH =
    ) WHERE (estado = 'pendiente' AND usuario_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON public.solicitudes_grupo(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_grupo ON public.solicitudes_grupo(grupo_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario ON public.solicitudes_grupo(usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitado ON public.solicitudes_grupo(solicitado_por);
CREATE INDEX IF NOT EXISTS idx_solicitudes_expira ON public.solicitudes_grupo(expira_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_solicitudes_temporada ON public.solicitudes_grupo(temporada_id);

ALTER TABLE public.solicitudes_grupo ENABLE ROW LEVEL SECURITY;

-- SELECT: DG+ ve todas las de sus segmentos; DE ve las que creó
CREATE POLICY "solicitudes_select" ON public.solicitudes_grupo
  FOR SELECT USING (
    public.es_superadmin((select auth.uid()))
    OR solicitado_por = (SELECT id FROM public.usuarios WHERE auth_id = (select auth.uid()))
    OR public.es_director_general_de_grupo((select auth.uid()), grupo_id)
  );

-- INSERT: DE+ (cualquier rol de liderazgo) puede crear solicitudes
CREATE POLICY "solicitudes_insert" ON public.solicitudes_grupo
  FOR INSERT WITH CHECK (
    public.tiene_rol_de_liderazgo((select auth.uid()))
  );

-- UPDATE: Solo DG+ que tenga scope sobre el grupo puede procesar
CREATE POLICY "solicitudes_update" ON public.solicitudes_grupo
  FOR UPDATE USING (
    public.es_superadmin((select auth.uid()))
    OR public.es_director_general_de_grupo((select auth.uid()), grupo_id)
  );

-- ═══════════════════════════════════════════════════════════════════════
-- Tabla: historial_movimientos_grupo
-- Registro auditable de todos los movimientos de miembros
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.historial_movimientos_grupo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id      uuid REFERENCES public.solicitudes_grupo(id) ON DELETE SET NULL,
  usuario_id        uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  grupo_origen_id   uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  grupo_destino_id  uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  tipo_movimiento   text NOT NULL
                    CHECK (tipo_movimiento IN ('ingreso', 'egreso', 'traslado', 'cambio_rol', 'ingreso_directo')),
  rol_anterior      text,
  rol_nuevo         text,
  motivo            text,
  realizado_por     uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  temporada_id      uuid REFERENCES public.temporadas(id) ON DELETE SET NULL,
  creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_usuario ON public.historial_movimientos_grupo(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historial_grupo_dest ON public.historial_movimientos_grupo(grupo_destino_id);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON public.historial_movimientos_grupo(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_historial_temporada ON public.historial_movimientos_grupo(temporada_id);

ALTER TABLE public.historial_movimientos_grupo ENABLE ROW LEVEL SECURITY;

-- Solo roles de liderazgo pueden leer el historial
CREATE POLICY "historial_select" ON public.historial_movimientos_grupo
  FOR SELECT USING (public.tiene_rol_de_liderazgo((select auth.uid())));

-- Solo roles de liderazgo pueden insertar (vía RPCs)
CREATE POLICY "historial_insert" ON public.historial_movimientos_grupo
  FOR INSERT WITH CHECK (public.tiene_rol_de_liderazgo((select auth.uid())));
