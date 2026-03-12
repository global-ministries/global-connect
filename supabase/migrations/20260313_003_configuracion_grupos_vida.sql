-- Migración 003: Tabla de configuración de Grupos de Vida
-- Configuración global o por campus para el módulo de solicitudes
-- RLS: lectura pública, escritura solo superadmin

CREATE TABLE IF NOT EXISTS public.configuracion_grupos_vida (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id                 uuid REFERENCES public.campus(id) ON DELETE CASCADE,

  -- Expiración de solicitudes (días permitidos: 5, 7, 14, 30)
  dias_expiracion_solicitud integer NOT NULL DEFAULT 7
    CHECK (dias_expiracion_solicitud IN (5, 7, 14, 30)),

  -- Restricciones de membresía
  max_miembros_por_grupo    integer DEFAULT NULL,  -- null = sin límite
  permitir_lider_en_otro_grupo boolean NOT NULL DEFAULT true,

  -- Temporadas
  requiere_aprobacion_grupo_planificacion boolean NOT NULL DEFAULT true,

  -- Notificaciones
  notificar_lider_ingreso   boolean NOT NULL DEFAULT true,

  creado_en                 timestamptz NOT NULL DEFAULT now(),
  actualizado_en            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campus_id)
);

ALTER TABLE public.configuracion_grupos_vida ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer la configuración
CREATE POLICY "config_select" ON public.configuracion_grupos_vida
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- Solo superadmin puede modificar
CREATE POLICY "config_admin" ON public.configuracion_grupos_vida
  FOR ALL USING (public.es_superadmin((select auth.uid())));

-- Seed: configuración global por defecto (campus_id = NULL)
INSERT INTO public.configuracion_grupos_vida (campus_id) VALUES (NULL)
ON CONFLICT (campus_id) DO NOTHING;
