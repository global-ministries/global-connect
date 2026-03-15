-- Migración: Agregar campos de organización a configuracion_plataforma
-- Email, dirección y teléfono de contacto

ALTER TABLE public.configuracion_plataforma
  ADD COLUMN IF NOT EXISTS email_contacto text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS telefono text;
