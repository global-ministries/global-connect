/**
 * Grupos de Vida — checked reads shared by the server loaders.
 *
 * Every read is checked: a failed read throws instead of returning partial
 * rows. Tables that grow (groups, links, leaders) are read in pages so the API
 * row cap never truncates a count silently. Server-side only.
 */

const TAMANO_PAGINA = 1000
const TAMANO_LOTE_IDS = 100

export type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function leer<T>(tabla: string, consulta: Respuesta<T>): Promise<T[]> {
  const { data, error } = await consulta
  if (error) throw new Error(`Error al leer ${tabla}: ${error.message}`)
  return data ?? []
}

export async function leerPaginado<T>(tabla: string, pagina: (desde: number, hasta: number) => Respuesta<T>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const lote = await leer(tabla, pagina(desde, desde + TAMANO_PAGINA - 1))
    filas.push(...lote)
    if (lote.length < TAMANO_PAGINA) return filas
  }
}

/** `.in()` filters travel in the URL: long id lists are split into batches. */
export async function leerPorIds<T>(tabla: string, ids: readonly string[], consulta: (lote: string[]) => Respuesta<T>): Promise<T[]> {
  const filas: T[] = []
  for (let i = 0; i < ids.length; i += TAMANO_LOTE_IDS) {
    filas.push(...(await leer(tabla, consulta(ids.slice(i, i + TAMANO_LOTE_IDS)))))
  }
  return filas
}
