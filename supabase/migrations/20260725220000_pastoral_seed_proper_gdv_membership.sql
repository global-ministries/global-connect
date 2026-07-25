-- ══════════════════════════════════════════════════════════════════════════════
-- F4 staging seed PROPER: connect seed personas to GDV membership
-- ══════════════════════════════════════════════════════════════════════════════
--
-- M8 (20260724000000_pastoral_seeding) inserted `usuarios` rows for Ana
-- (líder) and Asistido but DID NOT add them to `grupo_miembros` of any
-- Grupo de Vida. Without that membership the W10 mentor-cascade resolver
-- finds no GDV common to mentor and asignado → no `mentor_oficial` is
-- ever computed for Asistido.
--
-- The demo tríada also had 4 miembros instead of the required 3 (D25
-- cardinality constraint). This migration normalises it.
--
-- Key facts about the schema (verified against staging):
--   * grupos.temporada_id, grupos.segmento_id are NOT NULL on insert.
--   * grupo_miembros.rol is enum_rol_grupo = {'Líder','Colíder','Miembro'}.
--   * pastoral_triada_miembros.rol_en_triada is plain text (not enum).
--   * Active temporada is 2026-I = 74822ab6-6222-46ae-81ed-2ef715af60af.
--   * Segmento 'Matrimonios' = fff5cad9-e81e-4857-b24a-74aa0dad4c83.
--
-- Idempotent: re-runnable, recovers existing rows by conflict.
-- Already applied to staging via raw migration run.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_temporada_id   uuid := '74822ab6-6222-46ae-81ed-2ef715af60af'; -- 2026-I
  v_segmento_id uuid := 'fff5cad9-e81e-4857-b24a-74aa0dad4c83';   -- 'Matrimonios'
  v_grupo_id     uuid;
  v_ana_persona   uuid;
  v_asis_persona  uuid;
  v_admin_persona uuid;
  v_triada_id     uuid;
  v_miembro_id    uuid;
  i int;
BEGIN
  SELECT id INTO v_ana_persona   FROM public.usuarios WHERE email = 'seed_ana_lider@global.test';
  SELECT id INTO v_asis_persona  FROM public.usuarios WHERE email = 'seed_asistido@global.test';
  SELECT id INTO v_admin_persona FROM public.usuarios WHERE email = 'seed_admin_pastoral@global.test';
  SELECT id INTO v_triada_id     FROM pastoral_triada ORDER BY created_at LIMIT 1;

  IF v_ana_persona IS NULL OR v_asis_persona IS NULL OR v_triada_id IS NULL THEN
    RAISE EXCEPTION 'M-future-2: missing seed personas or tríada. Run M-future-1 first.';
  END IF;

  -- 1. Create the demo GDV if it doesn't exist
  SELECT id INTO v_grupo_id FROM grupos
  WHERE nombre = 'Demo Pastoral - Barquisimeto' AND temporada_id = v_temporada_id;

  IF v_grupo_id IS NULL THEN
    INSERT INTO grupos (
      nombre, temporada_id, segmento_id, segmento_ubicacion_id,
      activo, fecha_creacion, campus_id, localidad_id, tipo_grupo_id,
      estado_aprobacion, es_publico, capacidad_maxima
    ) VALUES (
      'Demo Pastoral - Barquisimeto', v_temporada_id, v_segmento_id, NULL,
      true, now(), NULL, NULL, NULL,
      'aprobado', false, 50
    )
    RETURNING id INTO v_grupo_id;
  END IF;

  -- 2. Link seed personas to the GDV (idempotent ON CONFLICT)
  INSERT INTO grupo_miembros (grupo_id, usuario_id, rol, fecha_asignacion, estado)
  VALUES (v_grupo_id, v_ana_persona, 'Líder', now(), 'activo')
  ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Líder', estado = 'activo';

  INSERT INTO grupo_miembros (grupo_id, usuario_id, rol, fecha_asignacion, estado)
  VALUES (v_grupo_id, v_asis_persona, 'Miembro', now(), 'activo')
  ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Miembro', estado = 'activo';

  IF v_admin_persona IS NOT NULL THEN
    INSERT INTO grupo_miembros (grupo_id, usuario_id, rol, fecha_asignacion, estado)
    VALUES (v_grupo_id, v_admin_persona, 'Colíder', now(), 'activo')
    ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Colíder', estado = 'activo';
  END IF;

  -- 3. 1:1 — ensure Asistido is a participant (the row was orphan)
  INSERT INTO pastoral_one_on_one_participantes (one_on_one_id, persona_id)
  SELECT id, v_asis_persona
  FROM pastoral_one_on_one
  WHERE NOT EXISTS (
    SELECT 1 FROM pastoral_one_on_one_participantes p
    WHERE p.one_on_one_id = pastoral_one_on_one.id
      AND p.persona_id = v_asis_persona
  )
  LIMIT 1;

  -- 4. Tríada: drop the 4-member state, rebuild canonical 3 (mentor/asignado/observador)
  DELETE FROM pastoral_triada_miembros WHERE triada_id = v_triada_id;

  i := 1;
  FOR v_miembro_id IN
    SELECT id FROM (VALUES (v_ana_persona), (v_asis_persona), (v_admin_persona)) AS t(id)
    WHERE id IS NOT NULL
    LIMIT 3
  LOOP
    INSERT INTO pastoral_triada_miembros (triada_id, persona_id, rol_en_triada)
    VALUES (
      v_triada_id,
      v_miembro_id,
      CASE i
        WHEN 1 THEN 'mentor_actual'
        WHEN 2 THEN 'asistido'
        WHEN 3 THEN 'coordinador_area'
      END
    );
    i := i + 1;
  END LOOP;

  RAISE NOTICE 'M-future-2: done. grupo=%, triada=%', v_grupo_id, v_triada_id;
END $$;
