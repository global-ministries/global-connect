/**
 * The person's in-app notices (avisos_persona, odd/tasks/talleres-reserva-publica.md
 * S6 S11): generic, not tied to talleres. The owner reads them through
 * `mis_avisos()` (non-expired, newest first, at most 100) and marks one read
 * with `aviso_marcar_leido(uuid)`; both run as the caller, so RLS keeps every
 * person to their own rows. Rows are written only by database functions.
 */

export interface AvisoPersona {
  readonly id: string
  readonly tipo: string
  readonly titulo: string
  readonly cuerpo: string | null
  /** In-app path ("/talleres/mi-recorrido"), or null. */
  readonly url: string | null
  /** The taller name, when the notice belongs to one: the row's tag. */
  readonly etiqueta: string | null
  readonly leido: boolean
  readonly creadoEn: string
}

interface RespuestaRpc {
  readonly data: unknown
  readonly error: { readonly message?: string } | null
}

/** The slice of a Supabase client these calls need. */
export interface ClienteAvisos {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

/** In-app paths only: a notice never links outside the app. */
function rutaInterna(valor: unknown): string | null {
  const ruta = texto(valor)
  return ruta && ruta.startsWith('/') && !ruta.startsWith('//') ? ruta : null
}

/** Parses `mis_avisos()` rows; malformed rows are dropped. */
export function parseAvisos(data: unknown): AvisoPersona[] {
  if (!Array.isArray(data)) return []
  const avisos: AvisoPersona[] = []
  for (const fila of data) {
    if (typeof fila !== 'object' || fila === null) continue
    const f = fila as Record<string, unknown>
    const id = texto(f.id)
    const titulo = texto(f.titulo)
    const creadoEn = texto(f.created_at)
    if (!id || !titulo || !creadoEn) continue
    const datos = typeof f.datos === 'object' && f.datos !== null ? (f.datos as Record<string, unknown>) : {}
    avisos.push({
      id,
      tipo: texto(f.tipo) ?? 'aviso',
      titulo,
      cuerpo: texto(f.cuerpo),
      url: rutaInterna(f.url),
      etiqueta: texto(datos.taller),
      leido: f.leido_at !== null && f.leido_at !== undefined,
      creadoEn,
    })
  }
  return avisos
}

export function contarNoLeidos(avisos: readonly AvisoPersona[]): number {
  return avisos.filter((aviso) => !aviso.leido).length
}

export async function cargarMisAvisos(client: ClienteAvisos): Promise<AvisoPersona[]> {
  const { data, error } = await client.rpc('mis_avisos')
  if (error) throw new Error(error.message ?? 'No se pudieron cargar los avisos')
  return parseAvisos(data)
}

/** True when the notice became read now. */
export async function marcarAvisoLeido(client: ClienteAvisos, id: string): Promise<boolean> {
  const { data, error } = await client.rpc('aviso_marcar_leido', { p_aviso_id: id })
  if (error) return false
  return data === true
}

const FORMATO_DIA = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', timeZone: 'America/Caracas' })
const FORMATO_HORA = new Intl.DateTimeFormat('es-VE', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas' })
const DIA_CARACAS = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' })

/** "Hoy 9:12 a. m.", "Ayer" or "5 nov", in Caracas time. */
export function cuandoAviso(creadoEn: string, ahora: Date = new Date()): string {
  const fecha = new Date(creadoEn)
  if (Number.isNaN(fecha.getTime())) return ''
  const dia = DIA_CARACAS.format(fecha)
  if (dia === DIA_CARACAS.format(ahora)) return `Hoy ${FORMATO_HORA.format(fecha)}`
  if (dia === DIA_CARACAS.format(new Date(ahora.getTime() - 24 * 60 * 60 * 1000))) return 'Ayer'
  return FORMATO_DIA.format(fecha).replace('.', '')
}
