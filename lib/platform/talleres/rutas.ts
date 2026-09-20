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
 *   /talleres/temporadas (+ /[id], /crear)
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

/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — "crear", not "nueva".
 * Parent decision, 2026-09-20: 4 of the app's 6 creation routes already use
 * "crear", and the SAME object in Grupos de Vida is already
 * `grupos-vida/temporadas/crear`. The tree in docs/talleres-de-punta-a-
 * punta.md said "nueva"; the doc was corrected, not the app.
 */
export function rutaTemporadaCrear(): string {
  return '/talleres/temporadas/crear'
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
// every old route must redirect, none may 404. T10 is the task that
// wires the full set: every entry below is `activa: true` and every old
// screen this file used to point at is gone (deleted in T10) — this IS
// the redirect that replaces it.
//
// Two mechanisms:
//   - A plain HTTP redirect (next.config.mjs's `redirects()`), for every
//     entry with a non-null `destino`. Positional only — no DB lookup —
//     so a `[param]` segment in `origen`/`destino` is a literal
//     placeholder (matching Next.js's own folder-bracket convention),
//     translated to next.config.mjs's `:param` syntax 1:1 by position
//     (the names don't need to match between origen/destino and the
//     real destination page's own folder — Next.js resolves redirects
//     purely as path strings).
//   - A "puente" page (`puente: true`, `destino: null`): the old id
//     alone doesn't carry enough shape to build the new URL (a grupo id
//     or an edición id doesn't expose the taller SLUG the new tree
//     threads into the path), so the OLD route's own page.tsx now does
//     the lookup at request time (lib/platform/talleres/bridges.ts) and
//     redirects — see __tests__/lib/platform/talleres/rutas.test.ts's
//     "T10 — every origen resolves" suite for how each mechanism is
//     verified.
export interface RutaAntigua {
  readonly origen: string
  /** The new destination path, or `null` when a puente page resolves it at request time (see `puente`). */
  readonly destino: string | null
  readonly activa: boolean
  /**
   * `true` when `origen`'s own page.tsx is now a redirect-resolving
   * bridge (lib/platform/talleres/bridges.ts) rather than a static
   * next.config.mjs redirect — always paired with `destino: null`.
   */
  readonly puente: boolean
  readonly nota: string
}

export const TALLERES_RUTAS_ANTIGUAS: readonly RutaAntigua[] = [
  // Ya activos desde T0 + T1, repuntados a su destino FINAL en T10 — ver
  // el guard "no destino is itself an origen" más abajo en rutas.test.ts.
  { origen: '/talleres/grupos', destino: '/talleres', activa: true, puente: false, nota: '' },
  { origen: '/talleres/sesiones', destino: '/talleres', activa: true, puente: false, nota: '' },

  // Dirección — pantallas por rol borradas; el catálogo ya no filtra por rol.
  { origen: '/talleres/direccion', destino: '/talleres', activa: true, puente: false, nota: '' },
  { origen: '/talleres/direccion/talleres', destino: '/talleres', activa: true, puente: false, nota: '' },
  { origen: '/talleres/direccion/periodos', destino: '/talleres', activa: true, puente: false, nota: 'sin destino estático propio — se vuelve la sección "ventana" dentro de /talleres/[taller]/[edicion]' },
  { origen: '/talleres/direccion/equipos', destino: '/talleres', activa: true, puente: false, nota: 'sin destino estático propio — se vuelve la sección "su equipo" dentro de /talleres/[taller]' },
  { origen: '/talleres/direccion/solicitudes', destino: '/talleres/pendientes', activa: true, puente: false, nota: '' },
  { origen: '/talleres/direccion/metricas', destino: '/talleres', activa: true, puente: false, nota: 'pantalla eliminada (sin datos reales) — sin reemplazo directo' },
  { origen: '/talleres/direccion/reportes', destino: '/talleres/reportes', activa: true, puente: false, nota: '' },

  // Coordinación
  { origen: '/talleres/coordinacion', destino: '/talleres', activa: true, puente: false, nota: '' },
  { origen: '/talleres/coordinacion/inscripciones', destino: '/talleres/pendientes', activa: true, puente: false, nota: '' },
  { origen: '/talleres/coordinacion/talleres', destino: '/talleres', activa: true, puente: false, nota: '' },
  { origen: '/talleres/coordinacion/equipos', destino: '/talleres', activa: true, puente: false, nota: 'sin destino estático propio — se vuelve la sección "su equipo" dentro de /talleres/[taller]' },
  { origen: '/talleres/coordinacion/reportes', destino: '/talleres/reportes', activa: true, puente: false, nota: '' },
  { origen: '/talleres/coordinacion/solicitudes', destino: '/talleres/pendientes', activa: true, puente: false, nota: '' },

  // Equipo (líder / voluntario)
  { origen: '/talleres/equipo/mis-grupos', destino: '/talleres', activa: true, puente: false, nota: 'sección "mis grupos" del catálogo' },
  { origen: '/talleres/equipo/mis-grupos/[id]', destino: null, activa: true, puente: true, nota: 'nunca tuvo page.tsx propio — resuelto igual, por si alguien lo tenía guardado' },
  { origen: '/talleres/equipo/mis-grupos/[id]/asistencia', destino: null, activa: true, puente: true, nota: 'sólo lectura; exigía ?sesion_id= a mano — /talleres/[taller]/[edicion]/[grupo] ya muestra asistencia por clase sin eso' },
  { origen: '/talleres/equipo/mis-grupos/[id]/reporte', destino: null, activa: true, puente: true, nota: 'sólo lectura — /talleres/[taller]/[edicion]/[grupo] es su reemplazo' },
  { origen: '/talleres/equipo/proximas-sesiones', destino: '/talleres', activa: true, puente: false, nota: 'sección "próximas sesiones" del catálogo' },
  { origen: '/talleres/equipo/recursos', destino: '/talleres', activa: true, puente: false, nota: 'pantalla eliminada en T0 (sin datos reales) — sin reemplazo directo' },

  // Participante
  { origen: '/talleres/mis-talleres', destino: '/talleres/mi-recorrido', activa: true, puente: false, nota: '' },
  { origen: '/talleres/historial', destino: '/talleres/mi-recorrido?tab=historial', activa: true, puente: false, nota: 'pestaña historial' },
  { origen: '/talleres/certificados', destino: '/talleres/mi-recorrido?tab=certificados', activa: true, puente: false, nota: 'pestaña certificados' },
  { origen: '/talleres/certificados/[id]', destino: '/talleres/mi-recorrido/certificados/[id]', activa: true, puente: false, nota: 'mismo id, sin lookup' },

  // Admin
  { origen: '/admin/talleres/abstracto', destino: '/talleres', activa: true, puente: false, nota: '"crear taller" pasa al catálogo' },
  { origen: '/admin/talleres/abstracto/nuevo', destino: '/talleres', activa: true, puente: false, nota: '' },
  { origen: '/admin/talleres/abstracto/[slug]', destino: '/talleres/[slug]', activa: true, puente: false, nota: 'mismo slug, sin lookup — la carpeta real es /talleres/[taller]; el nombre del segmento no importa para el redirect' },
  { origen: '/admin/talleres/edicion/[id]', destino: null, activa: true, puente: true, nota: '' },
  // T6 resolvió la mitad "pendiente cruzado por taller"; T10 cierra el
  // resto: el filtro por estado en /talleres/pendientes cubre la
  // auditoría entre ediciones que faltaba (ver ese loader/página).
  { origen: '/admin/talleres/inscripciones', destino: '/talleres/pendientes', activa: true, puente: false, nota: 'la auditoría entre ediciones ahora vive en el filtro por estado de /talleres/pendientes' },
  { origen: '/admin/talleres/temporadas', destino: '/talleres/temporadas', activa: true, puente: false, nota: '' },
  { origen: '/admin/talleres/temporadas/[id]', destino: '/talleres/temporadas/[id]', activa: true, puente: false, nota: 'mismo id, sin lookup' },
  { origen: '/admin/talleres/temporadas/crear', destino: '/talleres/temporadas/crear', activa: true, puente: false, nota: '' },
]
