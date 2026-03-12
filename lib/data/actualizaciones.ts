
/** Registro de una actualización del sistema visible para usuarios internos. */
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
    version: "1.9.2",
    fecha: "2026-03-16",
    titulo: "Mejoras en Navegación, Tardanzas y Dirección",
    descripcion:
      "Nuevos subitems en la navegación, selector inteligente de casa anfitriona, tardanzas detalladas y sugerencias de dirección familiar.",
    tipo: "mejora",
    modulo: "grupos",
    detalles: [
      "Solicitudes, Configuración y Dashboard Riesgo disponibles en el menú de Grupos de Vida",
      "Selector de casa anfitriona al editar un grupo — el mapa se centra automáticamente",
      "Al marcar a alguien como 'Tarde', ahora puedes indicar cuánto tardó y por qué",
      "Si un familiar tiene dirección registrada, el sistema te sugiere usarla al editar tu perfil",
      "El mapa ahora usa Leaflet + OpenStreetMap — sin costo de API",
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
  {
    version: "1.7.0",
    fecha: "2026-03-11",
    titulo: "Experiencia Visual Premium",
    descripcion:
      "El sistema ahora se siente como una app nativa con dark mode completo, mejores formularios y navegación inteligente.",
    tipo: "mejora",
    modulo: "sistema",
    detalles: [
      "Dark mode funciona correctamente en todas las pantallas",
      "Los gráficos se ven bien en modo oscuro",
      "El header móvil muestra el nombre de la página en la que estás",
      "Botón de regreso disponible en todas las páginas internas",
      "Las tablas se adaptan mejor a pantallas pequeñas",
      "Nuevos campos de formulario más accesibles y modernos",
    ],
    impactoRoles: ["admin", "pastor", "director_general", "director_etapa", "lider", "miembro"],
  },
  {
    version: "1.6.0",
    fecha: "2026-03-10",
    titulo: "Mejoras en Grupos y Seguridad",
    descripcion:
      "Grupos ahora se conectan con el sistema multi-campus y la seguridad se fortaleció en auditorías.",
    tipo: "feature",
    modulo: "grupos",
    detalles: [
      "Al crear un grupo puedes asignarle un campus",
      "La auditoría de grupos es más segura — solo ves los de tu campus",
      "Se corrigieron duplicados en la base de datos",
    ],
    impactoRoles: ["admin", "pastor", "director_general"],
  },
  {
    version: "1.5.0",
    fecha: "2026-03-10",
    titulo: "Multi-Campus",
    descripcion:
      "Ahora puedes gestionar múltiples campus desde un solo dashboard.",
    tipo: "feature",
    modulo: "dashboard",
    detalles: [
      "Selector de campus en el sidebar y header móvil",
      "El dashboard se actualiza automáticamente al cambiar de campus",
      "Los KPIs, grupos y usuarios se filtran por campus seleccionado",
      "171 grupos y 1020 usuarios asignados al campus Barquisimeto",
    ],
    impactoRoles: ["admin", "pastor", "director_general"],
  },
  {
    version: "1.4.0",
    fecha: "2026-03-10",
    titulo: "Permisos Mejorados",
    descripcion:
      "Ahora los permisos se verifican en el servidor para mayor seguridad.",
    tipo: "seguridad",
    modulo: "usuarios",
    detalles: [
      "Solo usuarios con permiso pueden editar perfiles de otros",
      "Solo usuarios con permiso pueden crear nuevos miembros",
      "Los botones se ocultan automáticamente si no tienes acceso",
    ],
    impactoRoles: ["admin", "pastor", "director_general", "director_etapa", "lider"],
  },
  {
    version: "1.2.0",
    fecha: "2026-03-09",
    titulo: "Emails Transaccionales",
    descripcion:
      "El sistema ahora puede enviar emails de bienvenida, verificación e invitación a grupos.",
    tipo: "feature",
    modulo: "sistema",
    detalles: [
      "Email de bienvenida al registrarse",
      "Email de verificación de cuenta",
      "Email de restablecimiento de contraseña",
      "Email de invitación a un grupo",
    ],
    impactoRoles: ["admin", "pastor"],
  },
]
