-- Family links: two more kinships for representatives (decision of 2026-10-06,
-- follow-up of PR #546).
--
-- What: enum_tipo_relacion gains 'abuelo' and 'tio'. They are gender-neutral
-- values like the existing ones ('padre' covers madre, 'hermano' hermana); the
-- UI labels them "Abuelo/a" and "Tío/a". "Hermano mayor" and "otro familiar"
-- reuse the existing 'hermano' and 'otro_familiar'.
--
-- Read as every other value: "usuario2 is <tipo> of usuario1".
--
-- Own migration: a value added by ALTER TYPE ... ADD VALUE cannot be used in
-- the same transaction, and 20261006110100 uses them.
--
-- Blast radius: existing rows are untouched. The SQL readers filter on
-- 'conyuge' or pass the value through; eliminar_relacion_familiar's inverse
-- CASE has no branch for the new values, so like 'otro_familiar' it deletes
-- the one row (no inverse row is ever created for them either).
--
-- Rollback: Postgres cannot drop an enum value. Rows using them would first be
-- moved to 'otro_familiar'; the values may then stay unused.

ALTER TYPE public.enum_tipo_relacion ADD VALUE IF NOT EXISTS 'abuelo';
ALTER TYPE public.enum_tipo_relacion ADD VALUE IF NOT EXISTS 'tio';
