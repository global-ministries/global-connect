
/** Registro de una actualización del sistema visible para usuarios internos. */
export interface Actualizacion {
  version: string
  fecha: string // YYYY-MM-DD
  titulo: string
  descripcion: string
  tipo: "feature" | "mejora" | "correccion" | "seguridad"
  modulo: string
  detalles: string[]
  /** Detalles específicos por rol. Cada clave es un rol del sistema. */
  detallesPorRol?: Partial<Record<RolSistema, string[]>>
  impactoRoles?: string[]
}

/** Roles del sistema usados para filtrar actualizaciones. */
export type RolSistema =
  | "admin"
  | "pastor"
  | "director_general"
  | "director_etapa"
  | "lider"
  | "miembro"

/** Etiquetas legibles por cada rol. */
export const etiquetasRol: Record<RolSistema, string> = {
  admin: "Administrador",
  pastor: "Pastor",
  director_general: "Director General",
  director_etapa: "Director de Etapa",
  lider: "Líder",
  miembro: "Miembro",
}

/**
 * Lista de actualizaciones visibles para los usuarios internos.
 * Solo incluir cambios que afecten la experiencia del usuario.
 * Ordenar por fecha descendente (más reciente primero).
 */
export const actualizaciones: Actualizacion[] = [
  {
    version: "1.9.3",
    fecha: "2026-03-14",
    titulo: "Fixes Finales, Dashboard Mejorado y Nuevas Funcionalidades",
    descripcion:
      "Correcciones críticas, co-anfitriones en casas, dashboard de riesgo rediseñado, solicitudes con filtros, y configuración global del sistema.",
    tipo: "feature",
    modulo: "grupos",
    detalles: [
      "Ahora puedes asignar un co-anfitrión (cónyuge) a cada casa anfitriona",
      "Dashboard de riesgo con gráficas de distribución, tendencia y barras por segmento",
      "Nueva página de miembros en riesgo con filtros por nivel (crítico, riesgo, atención)",
      "Solicitudes rediseñadas con pestañas Pendientes/Completadas y filtros por tipo",
      "Widget de notas de líderes en el dashboard principal",
      "Ranking de asistencia: miembros más constantes y con más ausencias",
      "Los grupos de matrimonios agrupan a las parejas juntas en la asistencia",
      "Configuración global del sistema: nombre, logos, datos de contacto",
      "Al eliminar un miembro, ahora se crea una solicitud de egreso según la configuración",
      "Corregidos problemas al guardar grupos con casa anfitriona seleccionada",
      "Los filtros de temporada ahora funcionan correctamente al buscar en todas las pestañas",
    ],
    detallesPorRol: {
      admin: [
        "Nueva página de configuración global: personaliza nombre, logos y datos de contacto de tu organización",
        "Configura desde qué rol se pueden eliminar miembros directamente (sin solicitud de egreso)",
        "Dashboard de riesgo rediseñado con gráficas de distribución por nivel, tendencia y barras por segmento",
        "Nueva página de miembros en riesgo con filtros por nivel y búsqueda",
        "Solicitudes rediseñadas: pestañas Pendientes/Completadas con filtros por tipo",
        "Widget de notas de líderes visible en el dashboard",
      ],
      pastor: [
        "Dashboard de riesgo rediseñado con gráficas de distribución por nivel, tendencia y barras por segmento",
        "Nueva página de miembros en riesgo con filtros por nivel y búsqueda",
        "Solicitudes rediseñadas: pestañas Pendientes/Completadas con filtros por tipo",
        "Widget de notas de líderes visible en el dashboard",
      ],
      director_general: [
        "Dashboard de riesgo rediseñado con gráficas y tendencia de tus segmentos",
        "Nueva página de miembros en riesgo filtrada a tus segmentos asignados",
        "Solicitudes rediseñadas con pestañas y filtros por tipo",
        "Widget de notas de líderes de tus grupos asignados",
        "Al aprobar/rechazar solicitudes de activación, el grupo se activa o elimina automáticamente",
      ],
      director_etapa: [
        "Dashboard de riesgo con datos de tus grupos asignados",
        "Al intentar eliminar un miembro, se crea una solicitud de egreso que aprueba tu director",
        "Ranking de asistencia: ve quiénes son los más constantes y quiénes tienen más ausencias en tus grupos",
        "Widget de notas de líderes de tus grupos",
      ],
      lider: [
        "Los grupos de matrimonios agrupan a las parejas juntas en la asistencia",
        "Al eliminar un miembro de tu grupo, se crea una solicitud de egreso automáticamente",
        "Puedes asignar un co-anfitrión (cónyuge) a la casa de tu grupo",
        "El ranking muestra quiénes asisten más y quiénes faltan más en tu grupo",
        "Mejoras en el formulario de asistencia: el selector de hora tiene mejor espaciado en móvil",
        "Corregidos problemas al guardar grupos con casa anfitriona seleccionada",
      ],
      miembro: [
        "Puedes ver las actualizaciones recientes del sistema",
        "Los filtros de temporada funcionan mejor al buscar grupos",
      ],
    },
    impactoRoles: [
      "admin",
      "pastor",
      "director_general",
      "director_etapa",
      "lider",
    ],
  },
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
    detallesPorRol: {
      admin: [
        "Nuevos subitems en el menú: Solicitudes, Configuración y Dashboard Riesgo",
        "El mapa ahora usa Leaflet + OpenStreetMap — sin costo de API",
      ],
      pastor: [
        "Nuevos subitems en el menú: Solicitudes y Dashboard Riesgo",
      ],
      director_general: [
        "Nuevos subitems en el menú: Solicitudes y Dashboard Riesgo",
      ],
      director_etapa: [
        "Selector de casa anfitriona al editar un grupo — el mapa se centra automáticamente",
        "Al marcar 'Tarde', ahora puedes indicar cuánto tardó y por qué",
      ],
      lider: [
        "Al marcar a alguien como 'Tarde', puedes indicar cuánto tardó y por qué",
        "Si un familiar tiene dirección registrada, el sistema te sugiere usarla",
        "Selector de casa anfitriona al editar tu grupo",
      ],
    },
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
    detallesPorRol: {
      admin: [
        "Configura la ventana de edición de asistencia y umbrales de salud",
        "Nuevo Dashboard de Riesgo con KPIs globales y top 5 grupos en riesgo",
        "Vista de salud de miembros por grupo",
      ],
      pastor: [
        "Nuevo Dashboard de Riesgo con KPIs y top 5 grupos en riesgo",
        "Vista de salud de miembros por grupo",
      ],
      director_general: [
        "Dashboard de Riesgo filtrado a tus segmentos",
        "Aprueba o rechaza solicitudes de edición tardía de asistencia",
      ],
      director_etapa: [
        "Aprueba o rechaza solicitudes de edición tardía de asistencia",
        "Vista de salud de los miembros de tus grupos",
      ],
      lider: [
        "Marca a tus miembros como presente, ausente, tarde o justificado",
        "Agrega notas pastorales: descripción, puntos de oración y notas privadas",
        "Marca 'No hubo reunión' con un motivo para no penalizar al grupo",
        "Si no editaste a tiempo, solicita permiso a tu director",
        "Vista de salud: ve qué miembros necesitan atención",
      ],
    },
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
    detallesPorRol: {
      admin: [
        "Configura los días de expiración de solicitudes",
        "Aprueba o rechaza cualquier tipo de solicitud",
        "Historial completo de movimientos de miembros",
      ],
      director_general: [
        "Aprueba o rechaza solicitudes de tus segmentos",
        "Badge de solicitudes pendientes visible en el menú",
      ],
      director_etapa: [
        "Crea solicitudes de ingreso, traslado y egreso para tus grupos",
        "Ve el estado de tus solicitudes en 'Mis Solicitudes'",
        "Badge de solicitudes pendientes visible en el menú",
      ],
    },
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
