-- Migración 001: Tabla tipos_grupo
-- Tabla de tipos de grupo con configuración específica por tipo.
-- Idempotente: IF NOT EXISTS, ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS public.tipos_grupo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text UNIQUE NOT NULL,
  descripcion text,
  icono text,
  color_hex text,
  usa_temporadas boolean NOT NULL DEFAULT true,
  usa_casa_anfitriona boolean NOT NULL DEFAULT false,
  usa_grupos_matrimonio boolean NOT NULL DEFAULT false,
  requiere_aprobacion_ingreso boolean NOT NULL DEFAULT true,
  es_confidencial boolean NOT NULL DEFAULT false,
  requiere_ruta_previa boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  campus_id uuid REFERENCES public.campus(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.tipos_grupo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_grupo_select" ON public.tipos_grupo
  FOR SELECT USING ((select auth.role()) = 'authenticated');

CREATE POLICY "tipos_grupo_admin_insert" ON public.tipos_grupo
  FOR INSERT WITH CHECK (public.es_superadmin((select auth.uid())));

CREATE POLICY "tipos_grupo_admin_update" ON public.tipos_grupo
  FOR UPDATE USING (public.es_superadmin((select auth.uid())));

-- Seed: tipo "Grupos de Vida"
INSERT INTO public.tipos_grupo (nombre, slug, descripcion, icono, color_hex, usa_temporadas, usa_casa_anfitriona, usa_grupos_matrimonio)
VALUES (
  'Grupos de Vida',
  'grupos-de-vida',
  'Grupos estables de temporada larga con casa anfitriona',
  'home',
  '#7C3AED',
  true,
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;
