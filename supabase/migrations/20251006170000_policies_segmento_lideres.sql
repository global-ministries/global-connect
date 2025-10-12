-- Habilitar RLS y definir políticas explícitas para segmento_lideres
-- Motivo: endpoint /directores-etapa devuelve vacío probablemente porque no había policy SELECT.

ALTER TABLE public.segmento_lideres ENABLE ROW LEVEL SECURITY;

-- Policy: lectura para roles superiores (admin, pastor, director-general)
CREATE POLICY segmento_lideres_select_roles_superiores ON public.segmento_lideres
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = auth.uid()
      AND rs.nombre_interno IN ('admin','pastor','director-general')
  )
);

-- Policy: lectura para el propio usuario dueño de la fila (cuando actúa como líder/director)
CREATE POLICY segmento_lideres_select_self ON public.segmento_lideres
FOR SELECT USING (usuario_id = auth.uid());

-- (Opcional) Evitar duplicidad si RLS ya estaba habilitado; Supabase ignora ENABLE si ya estaba.
-- No añadimos policies de INSERT/UPDATE/DELETE aquí.
