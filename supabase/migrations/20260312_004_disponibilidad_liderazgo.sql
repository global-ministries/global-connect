-- Migración 004: Tabla disponibilidad_liderazgo
-- Registra la disponibilidad de usuarios para roles de liderazgo.
-- Idempotente: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.disponibilidad_liderazgo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  disponible_como_lider boolean NOT NULL DEFAULT false,
  disponible_como_anfitrion boolean NOT NULL DEFAULT false,
  disponible_como_voluntario boolean NOT NULL DEFAULT false,
  dias_disponibles text[] NOT NULL DEFAULT '{}',
  horario_preferido text CHECK (horario_preferido IN ('mañana','tarde','noche')),
  notas text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_disponibilidad_usuario ON public.disponibilidad_liderazgo(usuario_id);

-- RLS
ALTER TABLE public.disponibilidad_liderazgo ENABLE ROW LEVEL SECURITY;

-- Select: el propio usuario o liderazgo
CREATE POLICY "disponibilidad_select" ON public.disponibilidad_liderazgo
  FOR SELECT USING (
    usuario_id = (SELECT id FROM public.usuarios WHERE auth_id = (select auth.uid()))
    OR public.tiene_rol_de_liderazgo((select auth.uid()))
  );

-- Upsert: solo el propio usuario
CREATE POLICY "disponibilidad_upsert" ON public.disponibilidad_liderazgo
  FOR ALL USING (
    usuario_id = (SELECT id FROM public.usuarios WHERE auth_id = (select auth.uid()))
  );
