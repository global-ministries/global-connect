/**
 * T1 (odd/tasks/talleres-consolidar-pantallas.md) — pure URL builders for
 * the consolidated /talleres tree (docs/talleres-de-punta-a-punta.md §8,
 * "De 32 a once"), plus the old→new route map.
 *
 *   /talleres
 *   /talleres/[taller]
 *   /talleres/[taller]/[edicion]
 *   /talleres/[taller]/[edicion]/[grupo]
 *   /talleres/pendientes
 *   /talleres/reportes
 *   /talleres/temporadas (+ /[id], /nueva)
 *   /talleres/explorar
 *   /talleres/mi-recorrido (+ /certificados/[id])
 *
 * These builders are the single place a page or component constructs one
 * of these URLs — no template string is repeated across files. They are
 * pure (no I/O): every dynamic segment (slug, ids) is supplied by the
 * caller, who already has it from a loader or an RPC result.
 *
 * No page under this new tree exists yet (T2–T9 build them one at a
 * time); these helpers exist ahead of the pages so route construction has
 * one source of truth from the start, per docs/talleres-de-punta-a-
 * punta.md §9 ("route-access.ts es hoy una segunda fuente de verdad...
 * al consolidar, ese catálogo debe pasar a ser la única fuente" — the
 * same discipline applies to URL construction).
 */

function segment(value: string, label: string): string {
  if (value.length === 0) {
    throw new Error(`rutas: ${label} must not be empty`)
  }
  return value
}

export function rutaCatalogo(): string {
  return '/talleres'
}

export function rutaTaller(slug: string): string {
  return `/talleres/${segment(slug, 'slug')}`
}

export function rutaEdicion(slug: string, edicionId: string): string {
  return `/talleres/${segment(slug, 'slug')}/${segment(edicionId, 'edicionId')}`
}

export function rutaGrupo(slug: string, edicionId: string, grupoId: string): string {
  return `/talleres/${segment(slug, 'slug')}/${segment(edicionId, 'edicionId')}/${segment(grupoId, 'grupoId')}`
}

export function rutaPendientes(): string {
  return '/talleres/pendientes'
}

export function rutaReportes(): string {
  return '/talleres/reportes'
}

export function rutaTemporadas(): string {
  return '/talleres/temporadas'
}

export function rutaTemporada(temporadaId: string): string {
  return `/talleres/temporadas/${segment(temporadaId, 'temporadaId')}`
}

export function rutaTemporadaNueva(): string {
  return '/talleres/temporadas/nueva'
}

export function rutaExplorar(): string {
  return '/talleres/explorar'
}

export function rutaMiRecorrido(): string {
  return '/talleres/mi-recorrido'
}

export function rutaCertificado(certificadoId: string): string {
  return `/talleres/mi-recorrido/certificados/${segment(certificadoId, 'certificadoId')}`
}

// ─── Old → new route map ────────────────────────────────────────────────
//
// odd/tasks/talleres-consolidar-pantallas.md, acceptance criterion 1:
// every one of the 30 old routes must eventually redirect, none may 404.
// This is the single inventory of that mapping — T10 is the task that
// wires the full set of HTTP redirects (and, per the "Decisiones"
// section, a slug-resolving bridge page for the id-based old routes),
// once the new pages exist to redirect to.
//
// `activa: true` means the destination page already exists TODAY and the
// HTTP redirect is already live in next.config.mjs — currently just the
// 2 nav-link stopgaps T0 also fixed at the nav-catalog level. Every other
// entry is `activa: false` with a `nota` explaining why it waits for
// T10: either the new consolidated page doesn't exist yet, the old
// screen is deleted outright (Recursos, Métricas — no real data, per
// this task's "Decisiones"), or (for the id-based old routes) the new
// path needs a slug lookup a static redirect can't do.
export interface RutaAntigua {
  readonly origen: string
  /** The new destination path, or `null` when the old screen has no destination (deleted outright). */
  readonly destino: string | null
  readonly activa: boolean
  readonly nota: string
}

const DESTINO_AUN_NO_EXISTE = 'destino nuevo aún no existe — se redirige en T10'
const REQUIERE_PUENTE = 'la URL vieja lleva un id; resolver su slug requiere una página puente (T10)'
const PANTALLA_ELIMINADA = 'pantalla eliminada en esta consolidación (sin datos reales) — sin destino'

export const TALLERES_RUTAS_ANTIGUAS: readonly RutaAntigua[] = [
  // Ya activos (T0 + T1) — el destino ya existe hoy.
  { origen: '/talleres/grupos', destino: '/talleres/equipo/mis-grupos', activa: true, nota: '' },
  { origen: '/talleres/sesiones', destino: '/talleres/equipo/proximas-sesiones', activa: true, nota: '' },

  // Dirección
  { origen: '/talleres/direccion', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/direccion/talleres', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/direccion/periodos', destino: null, activa: false, nota: 'se vuelve la sección "ventana" dentro de /talleres/[taller]/[edicion] — sin destino estático propio' },
  { origen: '/talleres/direccion/equipos', destino: null, activa: false, nota: 'se vuelve la sección "su equipo" dentro de /talleres/[taller] — sin destino estático propio' },
  { origen: '/talleres/direccion/solicitudes', destino: '/talleres/pendientes', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/direccion/metricas', destino: null, activa: false, nota: PANTALLA_ELIMINADA },
  { origen: '/talleres/direccion/reportes', destino: '/talleres/reportes', activa: false, nota: DESTINO_AUN_NO_EXISTE },

  // Coordinación
  { origen: '/talleres/coordinacion', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/coordinacion/inscripciones', destino: '/talleres/pendientes', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/coordinacion/talleres', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/coordinacion/equipos', destino: null, activa: false, nota: 'se vuelve la sección "su equipo" dentro de /talleres/[taller] — sin destino estático propio' },
  { origen: '/talleres/coordinacion/reportes', destino: '/talleres/reportes', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/coordinacion/solicitudes', destino: '/talleres/pendientes', activa: false, nota: DESTINO_AUN_NO_EXISTE },

  // Equipo (líder / voluntario)
  { origen: '/talleres/equipo/mis-grupos', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE + ' (sección "mis grupos" del catálogo)' },
  { origen: '/talleres/equipo/mis-grupos/[id]', destino: null, activa: false, nota: REQUIERE_PUENTE },
  { origen: '/talleres/equipo/mis-grupos/[id]/asistencia', destino: null, activa: false, nota: REQUIERE_PUENTE },
  { origen: '/talleres/equipo/mis-grupos/[id]/reporte', destino: null, activa: false, nota: REQUIERE_PUENTE },
  { origen: '/talleres/equipo/proximas-sesiones', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE + ' (sección "próximas sesiones" del catálogo)' },
  { origen: '/talleres/equipo/recursos', destino: null, activa: false, nota: PANTALLA_ELIMINADA + ' (T0)' },

  // Participante
  { origen: '/talleres/mis-talleres', destino: '/talleres/mi-recorrido', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/talleres/historial', destino: '/talleres/mi-recorrido', activa: false, nota: DESTINO_AUN_NO_EXISTE + ' (pestaña historial)' },
  { origen: '/talleres/certificados', destino: '/talleres/mi-recorrido', activa: false, nota: DESTINO_AUN_NO_EXISTE + ' (pestaña certificados)' },
  { origen: '/talleres/certificados/[id]', destino: null, activa: false, nota: DESTINO_AUN_NO_EXISTE + ' — mismo id, sin lookup, pero el destino aún no existe' },

  // Admin
  { origen: '/admin/talleres/abstracto', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE + ' ("crear taller" pasa al catálogo)' },
  { origen: '/admin/talleres/abstracto/nuevo', destino: '/talleres', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/admin/talleres/abstracto/[slug]', destino: null, activa: false, nota: DESTINO_AUN_NO_EXISTE + ' — mismo slug, sin lookup, pero /talleres/[taller] aún no existe' },
  { origen: '/admin/talleres/edicion/[id]', destino: null, activa: false, nota: REQUIERE_PUENTE },
  // T6 — resolves the decision this comment used to defer. Only the
  // "pendiente cruzado por taller" half moves to /talleres/pendientes;
  // the admin page's full multi-estado audit filter (todas/aprobadas/no
  // aprobadas/completadas) has no 1:1 replacement here and stays open —
  // still to be decided at T10.
  { origen: '/admin/talleres/inscripciones', destino: '/talleres/pendientes', activa: false, nota: 'cubre sólo el subconjunto "pendiente"; la vista completa por estado (auditoría) no tiene reemplazo 1:1 — decisión pendiente para T10' },
  { origen: '/admin/talleres/temporadas', destino: '/talleres/temporadas', activa: false, nota: DESTINO_AUN_NO_EXISTE },
  { origen: '/admin/talleres/temporadas/[id]', destino: null, activa: false, nota: DESTINO_AUN_NO_EXISTE + ' — mismo id, sin lookup, pero el destino aún no existe' },
  { origen: '/admin/talleres/temporadas/crear', destino: '/talleres/temporadas/nueva', activa: false, nota: DESTINO_AUN_NO_EXISTE },
]
