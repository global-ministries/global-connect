-- ══════════════════════════════════════════════════════════════════════════════
-- Fix scope_type drift: pastoral.one_on_one.* and pastoral.triada.*
-- grants have scope_type='experience' but PLATFORM_CAPABILITIES requires
-- the matching scopeType per capability.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- PLATFORM_CAPABILITIES (lib/platform/experiences.ts:60-77) defines:
--   pastoral.one_on_one.*  -> scopeType: 'one_on_one'
--   pastoral.triada.*      -> scopeType: 'triada'
--   pastoral.read.all etc. -> scopeType: 'experience'
--
-- But M9 / M14 / etc inserted grants with scope_type='experiencia' (Spanish)
-- for ALL pastoral grants. Migration 20260725140000 normalized to 'experience'
-- the read.all / admin.manage / crisis.detect / mentor / metrics ones
-- (which are indeed scopeType: 'experience'). It missed the one_on_one.* and
-- triada.* ones because at write time, M9 was using scope_type='experiencia'
-- for everything, and the post-fix only updated records where
-- scope_type='experiencia'.
--
-- Result: every 1:1 and tríada gate returns ok=false because the grant's
-- scopeType='experience' doesn't match the required scopeType='one_on_one'
-- or 'triada'. The page guard `hasPastoralOneOnOneReadCapability` and
-- `hasPastoralTriadaReadCapability` both fail.
--
-- This migration normalises scope_type for the affected grants.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- one_on_one.* grants should have scopeType 'one_on_one'
  UPDATE public.dream_team_capability_grants
  SET scope_type = 'one_on_one'
  WHERE experience = 'pastoral'
    AND capability_key LIKE 'pastoral.one_on_one.%'
    AND scope_type <> 'one_on_one';

  -- triada.* grants should have scopeType 'triada'
  UPDATE public.dream_team_capability_grants
  SET scope_type = 'triada'
  WHERE experience = 'pastoral'
    AND capability_key LIKE 'pastoral.triada.%'
    AND scope_type <> 'triada';

  -- experiencia vs experience (M10 fix earlier) — safety net
  UPDATE public.dream_team_capability_grants
  SET scope_type = 'experience'
  WHERE experience = 'pastoral'
    AND scope_type = 'experiencia';

  RAISE NOTICE 'M-future-3: pastoral grants normalised to canonical scopeTypes';
END $$;
