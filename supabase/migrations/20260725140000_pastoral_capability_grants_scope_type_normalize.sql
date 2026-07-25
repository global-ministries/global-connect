-- ══════════════════════════════════════════════════════════════════════════════
-- F4 staging fix: Normalize dream_team_capability_grants.scope_type
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Root cause: M9's seeded grants used the Spanish "experiencia" as scope_type,
-- but lib/platform/experiences.ts:1 defines PLATFORM_SCOPE_TYPES as the English
-- canonical set: ['experience', 'equipo', 'etapa', 'grupo', 'salon', 'taller',
-- 'one_on_one', 'triada']. resolvePlatformCapability() in
-- lib/platform/experiences.ts:141 silently returns { ok: false, reason: '...' }
-- for any grant whose scope_type doesn't match the canonical set, so every
-- pastoral route redirect()'d because hasPastoralReadAllCapability returned
-- false even when the user had 13 grants.
--
-- 47/47 rows had scope_type = 'experiencia' (no other variants in staging).
-- Fix: UPDATE the value to the canonical 'experience' for pastoral grants
-- (the only experience that was affected), and add a CHECK constraint so
-- future inserts cannot drift again.
--
-- Idempotent: only UPDATEs rows still in the old form.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.dream_team_capability_grants
SET scope_type = 'experience'
WHERE experience = 'pastoral'
  AND scope_type = 'experiencia';

-- Add a CHECK to prevent the drift from recurring. The canonical set is the
-- union of lib/platform/experiences.ts:1 ('experience','equipo','etapa',
-- 'grupo','salon','taller','one_on_one','triada') — the values that
-- resolvePlatformCapability actually recognizes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dream_team_grants_scope_type_canonical'
  ) THEN
    ALTER TABLE public.dream_team_capability_grants
      ADD CONSTRAINT dream_team_grants_scope_type_canonical
      CHECK (scope_type IN (
        'experience','equipo','etapa','grupo','salon','taller','one_on_one','triada'
      ));
  END IF;
END $$;
