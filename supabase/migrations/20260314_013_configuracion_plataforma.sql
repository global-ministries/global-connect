-- Migración: Tabla configuracion_plataforma para branding (logos, favicon, colores)
-- Singleton: una sola fila (sin campus_id), garantizada con CHECK

CREATE TABLE IF NOT EXISTS public.configuracion_plataforma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  color_primario text DEFAULT '#E96C20',
  color_secundario text DEFAULT '#F59E0B',
  nombre_organizacion text,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now()
);

-- Garantizar singleton: solo una fila
CREATE UNIQUE INDEX IF NOT EXISTS idx_configuracion_plataforma_singleton
  ON public.configuracion_plataforma ((true));

-- Insertar fila inicial si no existe
INSERT INTO public.configuracion_plataforma (
  logo_light_url,
  logo_dark_url,
  nombre_organizacion
) VALUES (
  'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg',
  'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg',
  'Global Connect'
) ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.configuracion_plataforma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plataforma_select_all" ON public.configuracion_plataforma
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "plataforma_update_admin" ON public.configuracion_plataforma
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuario_roles ur
      JOIN usuarios u ON u.id = ur.usuario_id
      JOIN roles_sistema rs ON rs.id = ur.rol_id
      WHERE u.auth_id = auth.uid()
        AND rs.nombre_interno IN ('admin', 'pastor')
    )
  );

-- Trigger para actualizado_en
CREATE OR REPLACE FUNCTION actualizar_timestamp_plataforma()
RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_config_plataforma_updated
  BEFORE UPDATE ON public.configuracion_plataforma
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_plataforma();

-- Storage policy: allow admin/pastor to upload to logos bucket
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'logos_upload_admin', 'logos', 'INSERT', 
  'EXISTS (SELECT 1 FROM usuario_roles ur JOIN usuarios u ON u.id = ur.usuario_id JOIN roles_sistema rs ON rs.id = ur.rol_id WHERE u.auth_id = auth.uid() AND rs.nombre_interno IN (''admin'', ''pastor''))'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'logos_upload_admin' AND bucket_id = 'logos'
);
