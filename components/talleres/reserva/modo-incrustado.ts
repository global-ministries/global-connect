/**
 * The embeddable mode of /talleres/reservar (T6 of
 * odd/tasks/talleres-reserva-publica.md, S2 S18): the same pages with
 * `?embed=1`, read by public/embed.js's card, catalog and modal. Query
 * params instead of new routes keep one public allowlist in middleware.ts
 * and one set of pages. Pure, server-safe.
 */
import { esUuid } from '@/lib/platform/talleres/reserva-publica'

export interface ModoIncrustado {
  /** `embed=1`: no public header or footer; the height goes to the parent. */
  readonly incrustado: boolean
  /** `modal=1`: inside the modal of embed.js (close button and Esc). */
  readonly modal: boolean
  /** `edicion=<id>`: the snippet pinned one edición. */
  readonly edicion: string | null
  /** `catalogo=1`: opened from the embedded catalog (back to it). */
  readonly desdeCatalogo: boolean
}

export const SIN_INCRUSTAR: ModoIncrustado = { incrustado: false, modal: false, edicion: null, desdeCatalogo: false }

/** postMessage types read by public/embed.js. */
export const MENSAJE_ALTO = 'global-taller:resize'
export const MENSAJE_CERRAR = 'global-taller:close'

type Parametros = Record<string, string | string[] | undefined>

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function leerModoIncrustado(parametros: Parametros): ModoIncrustado {
  if (uno(parametros.embed) !== '1') return SIN_INCRUSTAR
  const edicion = uno(parametros.edicion)
  return {
    incrustado: true,
    modal: uno(parametros.modal) === '1',
    edicion: esUuid(edicion) ? edicion : null,
    desdeCatalogo: uno(parametros.catalogo) === '1',
  }
}

const RAIZ = '/talleres/reservar'

/** The catalog, keeping the embedded mode. */
export function rutaCatalogoDe(modo: ModoIncrustado): string {
  if (!modo.incrustado) return RAIZ
  return `${RAIZ}?embed=1${modo.modal ? '&modal=1' : ''}`
}

/** One taller, keeping the embedded mode; from the embedded catalog it remembers the way back. */
export function rutaTallerDe(slug: string, modo: ModoIncrustado): string {
  if (!modo.incrustado) return `${RAIZ}/${slug}`
  return `${RAIZ}/${slug}?embed=1${modo.modal ? '&modal=1' : ''}&catalogo=1`
}
