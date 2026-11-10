/**
 * What "Compartir" gives a coordinator (T6 of odd/tasks/talleres-reserva-publica.md,
 * S2 S18; design/talleres-reserva/08): the public link, the snippet for
 * public/embed.js and the URL of its live preview. Pure. The snippet works
 * on any site (no allowed-sites list): every request still waits for
 * approval.
 */
export type ModoIncrustar = 'modal' | 'tarjeta' | 'catalogo'

export interface OpcionesCodigo {
  /** Origin of the app, e.g. https://miembros.yosoyglobal.org (no trailing slash). */
  readonly base: string
  readonly slug: string
  readonly nombre: string
  readonly modo: ModoIncrustar
  /** null: every open edición (the snippet follows the next ones on its own). */
  readonly edicion: string | null
}

export const DESCRIPCION_MODO: Record<ModoIncrustar, string> = {
  modal: 'Un botón en tu página. Al tocarlo se abre la inscripción en una ventana encima del sitio. En celular abre una pestaña nueva.',
  tarjeta: 'Una tarjeta con los horarios y los cupos dentro de tu página. La inscripción sigue dentro de la misma tarjeta.',
  catalogo: 'Todos los Grupos de Corto Plazo con su próxima edición. Cada uno abre su inscripción.',
}

const sinBarra = (base: string) => base.replace(/\/+$/, '')

/** The text inside an HTML attribute or element of the snippet. */
const escapar = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function urlPublica(base: string, slug: string): string {
  return `${sinBarra(base)}/talleres/reservar/${slug}`
}

export function codigoIncrustar({ base, slug, nombre, modo, edicion }: OpcionesCodigo): string {
  const origen = sinBarra(base)
  const script = `<script src="${origen}/embed.js" async></script>`
  if (modo === 'catalogo') {
    return `${script}\n<a href="${origen}/talleres/reservar" data-global-taller="" data-modo="catalogo">Grupos de Corto Plazo</a>`
  }
  const fijada = edicion ? ` data-edicion="${escapar(edicion)}"` : ''
  const texto = modo === 'modal' ? 'Reservar mi lugar' : escapar(nombre)
  return `${script}\n<a href="${urlPublica(origen, slug)}" data-global-taller="${slug}" data-modo="${modo}"${fijada}>${texto}</a>`
}

/** Same-origin page the preview iframe shows: what embed.js would load. */
export function urlVistaPrevia({ slug, modo, edicion }: Pick<OpcionesCodigo, 'slug' | 'modo' | 'edicion'>): string {
  if (modo === 'catalogo') return '/talleres/reservar?embed=1'
  return `/talleres/reservar/${slug}?embed=1${modo === 'modal' ? '&modal=1' : ''}${edicion ? `&edicion=${edicion}` : ''}`
}
