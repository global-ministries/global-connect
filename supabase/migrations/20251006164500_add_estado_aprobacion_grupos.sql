-- Añade columna de estado/aprobación a grupos
-- Estados iniciales: 'pendiente', 'aprobado', 'rechazado'
-- Se aplica valor por defecto 'aprobado' para grupos existentes para no alterar lógica actual.
-- También agrega columnas opcionales de tracking si no existen (created_at/updated_at) de ser necesarias.

ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS estado_aprobacion text NOT NULL DEFAULT 'aprobado' CHECK (estado_aprobacion IN ('pendiente','aprobado','rechazado')),
  ADD COLUMN IF NOT EXISTS aprobado_por uuid NULL REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS aprobado_en timestamptz NULL;

-- Trigger opcional de updated_at (solo si la columna existe / se quiere mantener coherencia)
ALTER TABLE public.grupos ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.grupos ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Asegurar que nuevas inserciones (crear_grupo) puedan establecer 'pendiente'
-- Para fase inicial no cambiamos crear_grupo; front podrá actualizar luego el estado vía update separado.

COMMENT ON COLUMN public.grupos.estado_aprobacion IS 'Estado de aprobación del grupo: pendiente, aprobado, rechazado';
COMMENT ON COLUMN public.grupos.aprobado_por IS 'Usuario que aprobó el grupo cuando pasa a aprobado';
COMMENT ON COLUMN public.grupos.aprobado_en IS 'Timestamp de aprobación';
