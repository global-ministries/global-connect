-- Migración 005: Vistas para Grupos de Vida
-- 3 vistas: líderes con pareja, casas disponibles, mapa de grupos.
-- CREATE OR REPLACE para idempotencia.

-- Vista 1: Líderes con su cónyuge
CREATE OR REPLACE VIEW public.v_lideres_con_pareja AS
SELECT
  gm.grupo_id,
  gm.usuario_id,
  gm.rol,
  u.nombre,
  u.apellido,
  u.foto_perfil_url,
  u.estado_civil,
  gm.fecha_asignacion,
  pareja.id AS pareja_id,
  pareja.nombre AS pareja_nombre,
  pareja.apellido AS pareja_apellido,
  EXISTS (
    SELECT 1 FROM public.grupo_miembros gm2
    WHERE gm2.grupo_id = gm.grupo_id AND gm2.usuario_id = pareja.id
  ) AS pareja_en_grupo
FROM public.grupo_miembros gm
JOIN public.usuarios u ON u.id = gm.usuario_id
LEFT JOIN public.relaciones_usuarios ru
  ON (ru.usuario1_id = gm.usuario_id OR ru.usuario2_id = gm.usuario_id)
  AND ru.tipo_relacion = 'conyuge'
LEFT JOIN public.usuarios pareja
  ON pareja.id = CASE
    WHEN ru.usuario1_id = gm.usuario_id THEN ru.usuario2_id
    ELSE ru.usuario1_id
  END
WHERE gm.rol = 'Líder';

-- Vista 2: Casas anfitrionas disponibles con información del anfitrión
CREATE OR REPLACE VIEW public.v_casas_anfitrionas_disponibles AS
SELECT
  ca.id,
  ca.nombre_lugar,
  ca.capacidad_maxima,
  ca.disponibilidad,
  ca.fotos_urls,
  u.id AS anfitrion_id,
  u.nombre || ' ' || u.apellido AS anfitrion_nombre,
  pareja.nombre || ' ' || pareja.apellido AS anfitrion_pareja_nombre,
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
LEFT JOIN public.direcciones d ON d.id = ca.direccion_id
LEFT JOIN public.relaciones_usuarios ru_c
  ON (ru_c.usuario1_id = u.id OR ru_c.usuario2_id = u.id)
  AND ru_c.tipo_relacion = 'conyuge'
LEFT JOIN public.usuarios pareja
  ON pareja.id = CASE
    WHEN ru_c.usuario1_id = u.id THEN ru_c.usuario2_id
    ELSE ru_c.usuario1_id
  END
WHERE ca.aprobada = true AND ca.activa = true;

-- Vista 3: Mapa de grupos de vida con geolocalización
CREATE OR REPLACE VIEW public.v_mapa_grupos_vida AS
SELECT
  g.id,
  g.nombre,
  g.dia_reunion,
  g.hora_reunion,
  g.capacidad_maxima,
  g.estado_ciclo,
  s.nombre AS segmento,
  t.nombre AS temporada,
  COALESCE(ca.nombre_lugar, 'Sin casa') AS lugar_reunion,
  COALESCE(d_ca.latitud, d_g.latitud) AS latitud,
  COALESCE(d_ca.longitud, d_g.longitud) AS longitud,
  COALESCE(d_ca.calle, d_g.calle, 'Sin dirección') AS direccion,
  (
    SELECT COUNT(*)
    FROM public.grupo_miembros gm
    WHERE gm.grupo_id = g.id
  ) AS total_miembros,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'nombre', u.nombre || ' ' || u.apellido,
        'foto', u.foto_perfil_url
      )
    )
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
    WHERE gm.grupo_id = g.id AND gm.rol = 'Líder'
  ) AS lideres
FROM public.grupos g
JOIN public.segmentos s ON s.id = g.segmento_id
JOIN public.temporadas t ON t.id = g.temporada_id
LEFT JOIN public.casas_anfitrionas ca ON ca.id = g.casa_anfitriona_id
LEFT JOIN public.direcciones d_ca ON d_ca.id = ca.direccion_id
LEFT JOIN public.direcciones d_g ON d_g.id = g.direccion_anfitrion_id
WHERE g.activo = true AND g.eliminado = false;
