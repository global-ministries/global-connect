-- DPS planning, phase 1a-3 (odd/tasks/dps-asistencia-pco.md, T8c; L22, L23):
--   1. Global Music joins the Sunday plan. It stays its own área in the
--      tree (Dirección de Experiencia › Global Music, experiencia
--      'global_music'), but dps_equipos() now returns its subtree next to the
--      DPS one, so its puestos, convocados and attendance live in the same
--      plan. Every dps_* function reads equipos through dps_equipos(), so
--      this is the only function that changes. Planning authority is
--      unchanged: the Global Music director plans once the DPS direction adds
--      them as a planner (dps_planificadores); its coordinators pass
--      attendance in their equipos like any DPS coordinator.
--   2. The puestos of the 2026-11-08 plan (S7.2), as configuration: inserted
--      by equipo path, skipped when the equipo does not exist or an active
--      puesto with that name is already there, so it is idempotent and never
--      overwrites what a director edited.
--
-- Rollback:
--   restore dps_equipos() from 20261108200000_dps_planificacion_base.sql;
--   DROP FUNCTION IF EXISTS public.dps_raiz_musica();
--   the seeded puestos are ordinary rows (deactivate them with
--   dps_puesto_desactivar if unwanted).

CREATE OR REPLACE FUNCTION public.dps_raiz_musica()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT d.id
    FROM public.dream_team_equipos d
    JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
   WHERE d.label = 'Global Music' AND d.experiencia = 'global_music' AND d.activo
     AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
   ORDER BY d.created_at, d.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.dps_raiz_musica() FROM PUBLIC, anon, authenticated;

-- Each root keeps only the descendants of its own experiencia, so a
-- Próximo Paso-like node of another experiencia under DPS stays out.
CREATE OR REPLACE FUNCTION public.dps_equipos()
RETURNS TABLE (equipo_id uuid, parent_equipo_id uuid, label text, profundidad integer, ruta text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE arbol AS (
    SELECT e.id, e.parent_equipo_id, e.label, e.experiencia, 0 AS profundidad, e.label AS ruta
      FROM public.dream_team_equipos e
     WHERE e.id IN (public.dps_raiz(), public.dps_raiz_musica())
    UNION ALL
    SELECT h.id, h.parent_equipo_id, h.label, h.experiencia, a.profundidad + 1, a.ruta || ' › ' || h.label
      FROM public.dream_team_equipos h
      JOIN arbol a ON h.parent_equipo_id = a.id
     WHERE h.activo AND h.experiencia = a.experiencia AND a.profundidad < 16
  )
  SELECT a.id, a.parent_equipo_id, a.label, a.profundidad, a.ruta FROM arbol a;
$$;
REVOKE ALL ON FUNCTION public.dps_equipos() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_fila record;
  v_equipo uuid;
BEGIN
  FOR v_fila IN
    SELECT * FROM (VALUES
      ('DPS', 'Director de programación', 1, 0),
      ('DPS', 'Director de atención al invitado', 1, 1),
      ('DPS', 'Director de media', 1, 2),
      ('DPS', 'Director de producción técnica', 1, 3),
      ('DPS', 'Director de social media', 1, 4),
      ('DPS', 'Director de producción creativa', 2, 5),
      ('DPS › Producción Técnica › Audio', 'Coordinador de audio', 1, 0),
      ('DPS › Producción Técnica › Audio', 'FOH', 1, 1),
      ('DPS › Producción Técnica › Audio', 'Asistente de FOH', 1, 2),
      ('DPS › Producción Técnica › Audio', 'Líder de tarima', 1, 3),
      ('DPS › Producción Técnica › Audio', 'Backstage', 1, 4),
      ('DPS › Producción Técnica › Iluminación', 'Coordinador de iluminación', 1, 0),
      ('DPS › Producción Técnica › Iluminación', 'Operador de luces', 1, 1),
      ('DPS › Producción Técnica › Iluminación', 'Asistente de iluminación', 1, 2),
      ('DPS › Producción Técnica › Iluminación', 'Breakera', 1, 3),
      ('DPS › Producción Técnica › Video › Cámaras', 'Director de cámaras', 1, 0),
      ('DPS › Producción Técnica › Video › Cámaras', 'Cámaras', 4, 1),
      ('DPS › Producción Técnica › Video › Mesa de video', 'Coordinador de video', 1, 0),
      ('DPS › Producción Técnica › Video › Mesa de video', 'Master', 1, 1),
      ('DPS › Producción Técnica › Video › Mesa de video', 'Generador de caracteres', 1, 2),
      ('DPS › Producción Técnica › Video › Mesa de video', 'Teleprompter', 1, 3),
      ('DPS › Producción Técnica › Técnicos', 'Coordinador técnico', 1, 0),
      ('DPS › Producción Técnica › Técnicos', 'Técnicos', 2, 1),
      ('DPS › Producción Creativa', 'Productor', 1, 0),
      ('DPS › Producción Creativa', 'Asistente de producción', 1, 1),
      ('DPS › Producción Creativa', 'Comunicador de bienvenida', 1, 2),
      ('DPS › Producción Creativa', 'Comunicador de mensaje', 1, 3),
      ('DPS › Producción Creativa', 'Opening', 1, 4),
      ('Global Music', 'Líder de alabanza', 2, 0),
      ('Global Music', 'Líder de banda', 1, 1),
      ('Global Music', 'Piano', 1, 2),
      ('Global Music', 'Bajo', 1, 3),
      ('Global Music', 'Batería', 1, 4),
      ('Global Music', 'Guitarra eléctrica', 1, 5),
      ('Global Music', 'Asistente técnico', 2, 6)
    ) AS t(ruta, nombre, cantidad, orden)
  LOOP
    SELECT d.equipo_id INTO v_equipo FROM public.dps_equipos() d WHERE d.ruta = v_fila.ruta;
    IF v_equipo IS NULL THEN
      RAISE NOTICE 'dps puestos: equipo % not found, skipped', v_fila.ruta;
      CONTINUE;
    END IF;
    INSERT INTO public.dps_puestos (equipo_id, nombre, cantidad, orden) -- noqa: insert-into
    SELECT v_equipo, v_fila.nombre, v_fila.cantidad, v_fila.orden
     WHERE NOT EXISTS (SELECT 1 FROM public.dps_puestos p
                        WHERE p.activo AND p.equipo_id = v_equipo AND lower(btrim(p.nombre)) = lower(v_fila.nombre));
  END LOOP;
END;
$$;
