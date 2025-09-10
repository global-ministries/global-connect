-- Endurecer RLS de lectura para eventos_grupo y asistencia
-- Reemplaza políticas abiertas (using true) por pertenencia del usuario (auth.uid())

-- Eventos: eliminar política previa abierta
DROP POLICY IF EXISTS sel_eventos_grupo ON public.eventos_grupo;
-- Crear política: puede leer si es miembro del grupo
CREATE POLICY sel_eventos_grupo ON public.eventos_grupo
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.grupo_miembros gm
        JOIN public.usuarios u ON u.id = gm.usuario_id
       WHERE gm.grupo_id = eventos_grupo.grupo_id
         AND u.auth_id = auth.uid()
    )
  );

-- Asistencia: eliminar política previa abierta
DROP POLICY IF EXISTS sel_asistencia ON public.asistencia;
-- Crear política: puede leer asistencia si es miembro del grupo del evento
CREATE POLICY sel_asistencia ON public.asistencia
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.eventos_grupo eg
        JOIN public.grupo_miembros gm ON gm.grupo_id = eg.grupo_id
        JOIN public.usuarios u ON u.id = gm.usuario_id
       WHERE eg.id = asistencia.evento_grupo_id
         AND u.auth_id = auth.uid()
    )
  );

-- Nota: Las funciones SECURITY DEFINER seguirán pudiendo leer porque se ejecutan con privilegios del definidor.
-- Si en algún momento se endurece más, considerar añadir 'SET search_path' dentro de las funciones para seguridad adicional.
