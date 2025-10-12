-- Policy temporal amplia para diagnosticar visibilidad de directores de etapa.
-- Eliminar después de confirmar funcionamiento.

CREATE POLICY segmento_lideres_select_director_etapa_temporal ON public.segmento_lideres
FOR SELECT USING (
  tipo_lider = 'director_etapa'
);
