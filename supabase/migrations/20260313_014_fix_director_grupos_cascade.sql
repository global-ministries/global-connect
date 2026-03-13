-- Fix: director_etapa_grupos.grupo_id debe ser CASCADE para permitir hard-delete de grupos
ALTER TABLE public.director_etapa_grupos
  DROP CONSTRAINT IF EXISTS director_etapa_grupos_grupo_id_fkey;

ALTER TABLE public.director_etapa_grupos
  ADD CONSTRAINT director_etapa_grupos_grupo_id_fkey
  FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;
