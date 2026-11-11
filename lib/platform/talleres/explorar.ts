/**
 * R3a (odd/tasks/talleres-rediseno.md, S6 S7) — what /talleres/explorar
 * needs about the person who looks at it, besides the talleres:
 *
 *   - their ficha (usuarios: name, phone, email, género). The género says
 *     «Ya inscrito» or «Ya inscrita» (S6); the rest is «Tus datos» in the
 *     confirmation.
 *   - whether they already did Próximo Paso: public.hizo_proximo_paso(
 *     p_usuario_id = usuarios.id), the same criterion as the home (L5 and
 *     lib/inicio/cargar-hechos.ts). true hides the Próximo Paso taller and
 *     shows the card to share it; false or null (unknown, an error) keeps it
 *     as a taller like the others (S7).
 *
 * Every read is best effort: a failure never breaks the page.
 */

import { PROXIMO_PASO_SLUG, rutaProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

/** The members app; the shared link always points here, whatever the origin of the page. */
export const ORIGEN_MIEMBROS = 'https://miembros.yosoyglobal.org'

/** https://miembros.yosoyglobal.org/proximo-paso */
export const URL_COMPARTIR_PROXIMO_PASO = `${ORIGEN_MIEMBROS}${rutaProximoPaso()}`

export type GeneroFicha = 'Masculino' | 'Femenino'

export interface PersonaExplorar {
  readonly nombre: string | null
  readonly telefono: string | null
  readonly email: string | null
  readonly genero: GeneroFicha | null
}

/** «Ya inscrita» for a woman by her ficha, «Ya inscrito» otherwise. */
export function etiquetaInscrito(genero: GeneroFicha | null | undefined): 'Ya inscrito' | 'Ya inscrita' {
  return genero === 'Femenino' ? 'Ya inscrita' : 'Ya inscrito'
}

/** The toast of an approved inscripción, by the ficha's género. */
export function mensajeInscrito(genero: GeneroFicha | null | undefined): string {
  return genero === 'Femenino' ? '¡Listo, ya estás inscrita!' : '¡Listo, ya estás inscrito!'
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** The viewer's own ficha (usuarios.id = usuarioId); null when it cannot be read. */
export async function cargarPersonaExplorar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  usuarioId: string,
): Promise<PersonaExplorar | null> {
  try {
    const { data, error } = await client
      .from('usuarios')
      .select('nombre, apellido, telefono, email, genero')
      .eq('id', usuarioId)
      .maybeSingle()
    if (error || !data) return null
    const fila = data as Record<string, unknown>
    const nombre = [texto(fila.nombre), texto(fila.apellido)].filter(Boolean).join(' ')
    const genero = fila.genero === 'Femenino' || fila.genero === 'Masculino' ? fila.genero : null
    return { nombre: nombre || null, telefono: texto(fila.telefono), email: texto(fila.email), genero }
  } catch {
    return null
  }
}

/** public.hizo_proximo_paso(usuarioId): true / false, null when unknown or on error. */
export async function cargarHizoProximoPaso(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  usuarioId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await client.rpc('hizo_proximo_paso', { p_usuario_id: usuarioId })
    if (error) return null
    return typeof data === 'boolean' ? data : null
  } catch {
    return null
  }
}

/** Only `true` hides the Próximo Paso taller (S7, L5). */
export function sinProximoPasoSiLoHizo<T extends { readonly slug: string }>(
  filas: readonly T[],
  hizoProximoPaso: boolean | null,
): T[] {
  return hizoProximoPaso === true ? filas.filter((f) => f.slug !== PROXIMO_PASO_SLUG) : [...filas]
}
