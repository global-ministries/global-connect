-- Migración 011: Co-anfitrión en casas anfitrionas
-- Permite registrar un segundo anfitrión (cónyuge u otro familiar) en la misma casa.
-- Evita crear casas duplicadas para esposo y esposa por separado.

-- 1. Agregar columna co_anfitrion_id
ALTER TABLE public.casas_anfitrionas
ADD COLUMN IF NOT EXISTS co_anfitrion_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.casas_anfitrionas.co_anfitrion_id IS
  'ID del co-anfitrión (ej: cónyuge). Nullable. Evita crear casas duplicadas para la misma familia.';

-- 2. Recrear vista con columnas de co-anfitrión
DROP VIEW IF EXISTS public.v_casas_anfitrionas_disponibles;

CREATE VIEW public.v_casas_anfitrionas_disponibles AS
SELECT
  ca.id,
  ca.nombre_lugar,
  ca.capacidad_maxima,
  ca.disponibilidad,
  ca.fotos_urls,
  u.id AS anfitrion_id,
  u.nombre || ' ' || u.apellido AS anfitrion_nombre,
  u.foto_perfil_url AS anfitrion_foto,
  co.id AS co_anfitrion_id,
  CASE WHEN co.id IS NOT NULL THEN co.nombre || ' ' || co.apellido ELSE NULL END AS co_anfitrion_nombre,
  CASE WHEN co.id IS NOT NULL THEN co.foto_perfil_url ELSE NULL END AS co_anfitrion_foto,
  d.calle,
  d.barrio,
  d.latitud,
  d.longitud,
  (
    SELECT COUNT(*)
    FROM public.grupos g
    WHERE g.casa_anfitriona_id = ca.id
      AND g.activo = true
      AND g.eliminado = false
  ) AS grupos_usando
FROM public.casas_anfitrionas ca
JOIN public.usuarios u ON u.id = ca.usuario_id
LEFT JOIN public.usuarios co ON co.id = ca.co_anfitrion_id
LEFT JOIN public.direcciones d ON d.id = ca.direccion_id
WHERE ca.aprobada = true AND ca.activa = true;
