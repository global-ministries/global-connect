-- Migración 002: Tabla casas_anfitrionas
-- Registra las casas donde se reúnen los Grupos de Vida.
-- Idempotente: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.casas_anfitrionas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre_lugar text NOT NULL,
  descripcion text,
  capacidad_maxima integer,
  direccion_id uuid REFERENCES public.direcciones(id) ON DELETE SET NULL,
  disponibilidad jsonb NOT NULL DEFAULT '[]'::jsonb,
  fotos_urls text[] NOT NULL DEFAULT '{}',
  activa boolean NOT NULL DEFAULT false,
  aprobada boolean NOT NULL DEFAULT false,
  aprobada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  aprobada_en timestamptz,
  notas_publicas text,
  notas_privadas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Indexes para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_casas_usuario ON public.casas_anfitrionas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_casas_direccion ON public.casas_anfitrionas(direccion_id);
CREATE INDEX IF NOT EXISTS idx_casas_aprobada ON public.casas_anfitrionas(aprobada) WHERE aprobada = true;

-- RLS
ALTER TABLE public.casas_anfitrionas ENABLE ROW LEVEL SECURITY;

-- Select: aprobada (público), propietario, o liderazgo
CREATE POLICY "casas_select" ON public.casas_anfitrionas
  FOR SELECT USING (
    aprobada = true
    OR usuario_id = (SELECT id FROM public.usuarios WHERE auth_id = (select auth.uid()))
    OR public.tiene_rol_de_liderazgo((select auth.uid()))
  );

-- Insert: solo el propietario registra su casa
CREATE POLICY "casas_insert" ON public.casas_anfitrionas
  FOR INSERT WITH CHECK (
    usuario_id = (SELECT id FROM public.usuarios WHERE auth_id = (select auth.uid()))
  );

-- Update: propietario o liderazgo
CREATE POLICY "casas_update" ON public.casas_anfitrionas
  FOR UPDATE USING (
    usuario_id = (SELECT id FROM public.usuarios WHERE auth_id = (select auth.uid()))
    OR public.tiene_rol_de_liderazgo((select auth.uid()))
  );
