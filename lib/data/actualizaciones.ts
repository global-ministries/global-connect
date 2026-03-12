
export interface Actualizacion {
  version: string
  fecha: string // YYYY-MM-DD
  titulo: string
  descripcion: string
  tipo: "feature" | "mejora" | "correccion" | "seguridad"
  modulo: string
  detalles: string[]
  impactoRoles?: string[]
}

/**
 * Lista de actualizaciones visibles para los usuarios internos.
 * Solo incluir cambios que afecten la experiencia del usuario.
 * Ordenar por fecha descendente (más reciente primero).
 */
export const actualizaciones: Actualizacion[] = [
  {
    version: "1.9.1",
    fecha: "2026-03-12",
    titulo: "Asistencia Avanzada y Reportes de Salud",
    descripcion:
      "Nuevo sistema de asistencia con tipos detallados, notas pastorales, y herramientas de seguimiento de la salud de los miembros.",
    tipo: "feature",
    modulo: "grupos",
    detalles: [
      "Ahora puedes marcar a los miembros como presente, ausente, tarde o justificado",
      "Agrega notas pastorales a cada reunión: descripción, puntos de oración y notas privadas",
      "Si no hubo reunión, puedes marcarlo con un motivo para que no afecte los reportes",
      "Nuevo Dashboard de Riesgo para directores: ve qué miembros necesitan atención pastoral",
      "Vista de salud por grupo con niveles de riesgo (normal, atención, riesgo, crítico)",
      "Si la ventana de edición se cerró, puedes solicitar permiso a tu director para editar",
    ],
    impactoRoles: [
      "admin",
      "pastor",
      "director_general",
      "director_etapa",
      "lider",
    ],
  },
  {
    version: "1.9.0",
    fecha: "2026-03-12",
    titulo: "Sistema de Solicitudes de Grupo",
    descripcion:
      "Flujos de aprobación para ingresos, traslados, egresos y cambios de rol en los grupos de vida.",
    tipo: "feature",
    modulo: "grupos",
    detalles: [
      "Los directores de etapa pueden solicitar ingresos, traslados y egresos de miembros",
      "El director general revisa y aprueba o rechaza cada solicitud",
      "Historial completo de movimientos de miembros con auditoría",
      "Panel de configuración para ajustar días de expiración de solicitudes",
      "Badge de solicitudes pendientes en el menú lateral",
    ],
    impactoRoles: ["admin", "pastor", "director_general", "director_etapa"],
  },
  {
    version: "1.8.0",
    fecha: "2026-03-12",
    titulo: "Reestructuración de Grupos de Vida",
    descripcion:
      "Módulo de Grupos reorganizado con Casas Anfitrionas, geocodificación y navegación mejorada.",
    tipo: "mejora",
    modulo: "grupos",
    detalles: [
      "Nuevo submódulo de Casas Anfitrionas con mapa interactivo",
      "Geocodificación automática de direcciones al crear o editar grupos",
      "Menú lateral con submenús colapsables para Grupos de Vida",
      "Todas las rutas reorganizadas para mejor navegación",
    ],
    impactoRoles: [
      "admin",
      "pastor",
      "director_general",
      "director_etapa",
      "lider",
    ],
  },
]
