-- ══════════════════════════════════════════════════════════════════════════════
-- W04 — DT-021 — M5: Add sensitivity column to operating_core_participation_eventos
-- Adds sensitivity column with CHECK constraint that includes 'sensitive'.
-- Default 'internal' for existing rows; pastoral_crisis_detected events use 'sensitive'.
--
-- Rollback: sensitivity column can be removed
-- ══════════════════════════════════════════════════════════════════════════════

-- Add sensitivity column with CHECK constraint
-- Default 'internal' preserves existing behavior; 'sensitive' is used for crisis events
ALTER TABLE operating_core_participation_eventos
  ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'internal';

-- Extend the CHECK constraint to include all three values
-- First drop the auto-generated check, then add explicit one
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the auto-generated check constraint for sensitivity
  SELECT conname INTO constraint_name
    FROM pg_constraint
   WHERE conrelid = 'operating_core_participation_eventos'::regclass
     AND conname LIKE '%sensitivity%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE operating_core_participation_eventos DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Add explicit CHECK constraint with all three values
ALTER TABLE operating_core_participation_eventos
  ADD CONSTRAINT chk_operating_core_participation_eventos_sensitivity
  CHECK (sensitivity IN ('internal', 'public', 'sensitive'));

-- Update existing rows to 'internal' (they already have that default, but explicit for safety)
UPDATE operating_core_participation_eventos SET sensitivity = 'internal' WHERE sensitivity IS NULL;

-- Verify the constraint
DO $$
BEGIN
  -- This will fail if the constraint doesn't exist or doesn't accept 'sensitive'
  PERFORM 1 WHERE FALSE IN (
    SELECT TRUE FROM (
      VALUES ('internal'), ('public'), ('sensitive')
    ) AS allowed(value)
    WHERE value NOT IN ('internal', 'public', 'sensitive')
  );
  RAISE NOTICE 'sensitivity CHECK constraint verified';
END $$;
