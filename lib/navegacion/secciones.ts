import { esRutaActiva } from '@/lib/navegacion/registro'

/**
 * The app shell's navigation layout (odd/tasks/sistema-diseno-v2.md, S9;
 * prototype design/app-shell): the sidebar sections, the phone tab bar
 * (4 entries + "Más") and what the "Más" sheet lists. Pure: every helper
 * takes the entries the user can already see (lib/navegacion/registro.ts,
 * composed in components/navegacion/componer-navegacion.ts) and only picks
 * or orders them, so who sees what never changes here.
 */

/**
 * general: no header (Inicio, Mis 1 a 1); ministerios: Grupos de Vida, Niños,
 * Talleres, Estudiantes and the other ministry items; dream-team: the Dream
 * Team group; administracion: Usuarios, Configuración, Cola de soporte and the
 * admin platform items; pie: the footer links; cuenta: Mi perfil.
 */
export type SeccionNavegacion = 'general' | 'ministerios' | 'dream-team' | 'administracion' | 'pie' | 'cuenta'

export const ORDEN_SECCIONES: readonly SeccionNavegacion[] = [
  'general', 'ministerios', 'dream-team', 'administracion', 'pie', 'cuenta',
]

/** The sections of the main list (the sidebar body and the "Más" sections). */
export const SECCIONES_PRINCIPALES: readonly SeccionNavegacion[] = ['general', 'ministerios', 'dream-team', 'administracion']

export interface EntradaConSeccion {
  id: string
  label: string
  href: string
  seccion: SeccionNavegacion
  /** Shorter visible text in the tab bar (label stays the accessible name). */
  labelMovil?: string
  children?: readonly { href: string }[]
}

export interface GrupoSeccion<T> {
  seccion: SeccionNavegacion
  entradas: T[]
}

/** The entries by section, in ORDEN_SECCIONES, each keeping its order; empty sections are left out. */
export function agruparPorSeccion<T extends { seccion: SeccionNavegacion }>(entradas: readonly T[]): GrupoSeccion<T>[] {
  return ORDEN_SECCIONES
    .map((seccion) => ({ seccion, entradas: entradas.filter((entrada) => entrada.seccion === seccion) }))
    .filter((grupo) => grupo.entradas.length > 0)
}

export const MAX_PESTANAS = 4

// Tab priority (S9.7): Inicio, Grupos, Niños (if allowed), Equipo (Dream Team
// if allowed), then filled with Talleres and Ayuda. `labelMovil` is the tab
// text when the entry has none (a scoped Talleres item is labelled
// "Talleres — <scope>").
const PRIORIDAD_PESTANAS: readonly { es: (entrada: { id: string }) => boolean; labelMovil?: string }[] = [
  { es: (entrada) => entrada.id === 'dashboard' },
  { es: (entrada) => entrada.id === 'grupos-vida' },
  { es: (entrada) => entrada.id === 'ninos' },
  { es: (entrada) => entrada.id === 'dream-team' },
  { es: (entrada) => entrada.id.startsWith('platform-talleres_participation-'), labelMovil: 'Talleres' },
  { es: (entrada) => entrada.id === 'ayuda' },
]

export type PestanaNavegacion<T> = T & { labelMovil: string }

/**
 * The phone tab bar: up to MAX_PESTANAS of the visible entries, by priority.
 * Fewer when fewer qualify; the "Más" button always follows them.
 */
export function pestanasBarraInferior<T extends EntradaConSeccion>(entradas: readonly T[]): PestanaNavegacion<T>[] {
  return PRIORIDAD_PESTANAS
    .flatMap(({ es, labelMovil }) => {
      const entrada = entradas.find(es)
      return entrada ? [{ ...entrada, labelMovil: entrada.labelMovil ?? labelMovil ?? entrada.label }] : []
    })
    .slice(0, MAX_PESTANAS)
}

/** A tab is active on its route, below it, or on any of its children's routes. */
export function esPestanaActiva(
  pathname: string | null | undefined,
  pestana: { href: string; children?: readonly { href: string }[] },
): boolean {
  return esRutaActiva(pathname, pestana.href) || (pestana.children ?? []).some((hija) => esRutaActiva(pathname, hija.href))
}

/** A "Más" row: the entry without its submenu, linking to its own href (a group's root or first page). */
export type FilaMas<T> = Omit<T, 'children'>

export interface ContenidoMas<T> {
  cuenta: FilaMas<T>[]
  secciones: GrupoSeccion<FilaMas<T>>[]
  pie: FilaMas<T>[]
}

/**
 * The "Más" sheet (S9.6, S9.8): the account link, then every visible entry
 * the tabs do not already open, by section and without submenus, then the
 * footer links. An entry counts as covered when a tab has its id or its page.
 */
export function contenidoMas<T extends EntradaConSeccion>(
  entradas: readonly T[],
  pestanas: readonly { id: string; href: string }[],
): ContenidoMas<T> {
  const ids = new Set(pestanas.map((pestana) => pestana.id))
  const hrefs = new Set(pestanas.map((pestana) => pestana.href))
  const filas = entradas
    .filter((entrada) => !ids.has(entrada.id) && !hrefs.has(entrada.href))
    .map(sinSubmenu)
  return {
    cuenta: filas.filter((fila) => fila.seccion === 'cuenta'),
    secciones: agruparPorSeccion(filas.filter((fila) => SECCIONES_PRINCIPALES.includes(fila.seccion))),
    pie: filas.filter((fila) => fila.seccion === 'pie'),
  }
}

function sinSubmenu<T extends { children?: unknown }>(entrada: T): FilaMas<T> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropping the submenu on purpose
  const { children, ...fila } = entrada
  return fila
}
