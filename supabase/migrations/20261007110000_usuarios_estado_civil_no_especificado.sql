-- usuarios.estado_civil is NOT NULL and typed public.enum_estado_civil
-- (Soltero, Casado, Divorciado, Viudo). Bulk volunteer loads bring people
-- whose marital status is unknown, so the enum gains 'No especificado'.
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that adds
-- it, so this migration does nothing else.
--
-- Rollback: Postgres cannot drop an enum value. Repoint rows first
--   (UPDATE public.usuarios SET estado_civil = ... WHERE estado_civil = 'No especificado')
-- and recreate the type without the value if it must go.
ALTER TYPE public.enum_estado_civil ADD VALUE IF NOT EXISTS 'No especificado';
