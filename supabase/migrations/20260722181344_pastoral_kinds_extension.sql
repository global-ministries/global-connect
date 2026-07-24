-- ══════════════════════════════════════════════════════════════════════════════
-- W04 — DT-020 — M4: Extend operating_core_participation_kind ENUM
-- Adds 14 pastoral_* kinds to the shared ledger from F3.
--
-- Rollback: ALTER TYPE ... DROP VALUE (Postgres 14+)
-- The original 11 values are preserved; only pastoral_* values are added.
-- ══════════════════════════════════════════════════════════════════════════════

-- Extend the ENUM type with 14 new pastoral kinds (IF NOT EXISTS not supported for ADD VALUE,
-- so we use a DO block to handle re-runs safely)
DO $$
BEGIN
  -- These values must be added in order matching the PASTORAL_PARTICIPATION_KINDS array
  -- in lib/platform/pastoral/participation-kinds.ts (W01 DT-002)
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_logged';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_completed';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_cancelled';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_note_logged';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_followup_set';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_followup_completed';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_one_on_one_step_validated';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_triada_formed';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_triada_member_added';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_triada_member_removed';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_triada_disbanded';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_triada_step_suggested';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_triada_step_validated';
  ALTER TYPE operating_core_participation_kind ADD VALUE IF NOT EXISTS 'pastoral_crisis_detected';
END $$;

-- Verify the extension ( informational — will fail gracefully if already applied )
DO $$
DECLARE
  count_before integer := 11;
  count_after  integer;
BEGIN
  SELECT COUNT(*) INTO count_after
    FROM pg_enum
   WHERE enumtypid = 'operating_core_participation_kind'::regtype;

  IF count_after < count_before + 14 THEN
    RAISE WARNING 'Expected at least % enum values, got %', count_before + 14, count_after;
  END IF;
END $$;
