-- noqa: insert-into
-- Niños: seed the rooms of the Barquisimeto campus (odd/tasks/ninos-checkin.md,
-- task N2). Reference data, resolved by name (no hardcoded ids):
--   campus  = campus.nombre 'Barquisimeto' (the campus whose Sunday turnos the
--             Niños services reuse);
--   equipos = 'Waumba Land' and 'Upstreet' under 'Dirección de Niños'.
-- If any of them is missing the seed inserts nothing.
--
-- Ranges are assumptions, editable later from room configuration:
--   Waumba Land (age in months): Maternal 0–23, Preescolar I 24–35,
--     Preescolar II 36–47, Preescolar III 48–59, Waumba Land Plus (special
--     needs, no range).
--   UpStreet (school grade): 1º, 2º, 3º, 4º grado; Preadolescentes 5º–6º.
--   Capacity 20 everywhere.
--
-- Rollback:
--   DELETE FROM public.ninos_salones s USING public.campus c
--    WHERE c.id = s.campus_id AND c.nombre = 'Barquisimeto'
--      AND NOT EXISTS (SELECT 1 FROM public.ninos_checkins k WHERE k.salon_id = s.id);

WITH campus AS (
  SELECT c.id FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1
), areas AS (
  SELECT e.id, e.label
  FROM public.dream_team_equipos e
  JOIN public.dream_team_equipos d ON d.id = e.parent_equipo_id
  WHERE d.label = 'Dirección de Niños' AND d.experiencia = 'ninos'
    AND e.label IN ('Waumba Land', 'Upstreet')
), salones (area_label, area, nombre, edad_min, edad_max, grado_min, grado_max, nee, orden) AS (
  VALUES
    ('Waumba Land', 'waumba', 'Maternal', 0, 23, NULL::int, NULL::int, false, 10),
    ('Waumba Land', 'waumba', 'Preescolar I', 24, 35, NULL, NULL, false, 20),
    ('Waumba Land', 'waumba', 'Preescolar II', 36, 47, NULL, NULL, false, 30),
    ('Waumba Land', 'waumba', 'Preescolar III', 48, 59, NULL, NULL, false, 40),
    ('Waumba Land', 'waumba', 'Waumba Land Plus', NULL, NULL, NULL, NULL, true, 50),
    ('Upstreet', 'upstreet', '1º grado', NULL, NULL, 1, 1, false, 110),
    ('Upstreet', 'upstreet', '2º grado', NULL, NULL, 2, 2, false, 120),
    ('Upstreet', 'upstreet', '3º grado', NULL, NULL, 3, 3, false, 130),
    ('Upstreet', 'upstreet', '4º grado', NULL, NULL, 4, 4, false, 140),
    ('Upstreet', 'upstreet', 'Preadolescentes', NULL, NULL, 5, 6, false, 150)
)
INSERT INTO public.ninos_salones
  (campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses,
   grado_min, grado_max, es_necesidades_especiales, orden)
SELECT campus.id, areas.id, s.area, s.nombre, 20, s.edad_min, s.edad_max, s.grado_min, s.grado_max, s.nee, s.orden
FROM salones s
JOIN areas ON areas.label = s.area_label
CROSS JOIN campus
ON CONFLICT (campus_id, nombre) DO NOTHING;
