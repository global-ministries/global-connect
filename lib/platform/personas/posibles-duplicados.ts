/**
 * Personas — «¿Es alguna de estas personas?» before registering a person
 * (odd/tasks/dream-team-estructura-correcciones.md, T4, S6b).
 *
 * The database decides who matches (personas_posibles_duplicados,
 * 20261121110000_personas_buscar_sin_acentos.sql): the same normalized cédula,
 * the same normalized teléfono, or the first nombre and first apellido among
 * the person's, ignoring accents and case. This module parses the GET request
 * of /api/dream-team/usuarios/posibles-duplicados, builds the RPC arguments
 * and the client URL, and maps the rows for the panel. Nothing here blocks a
 * registration: the panel only offers the existing people.
 */
import { prepararCedula } from '@/lib/utils/cedula'
import { nombreCorto } from '@/lib/platform/personas/nombre'

export type MotivoCoincidencia = 'cedula' | 'telefono' | 'nombre'

const MOTIVOS: readonly MotivoCoincidencia[] = ['cedula', 'telefono', 'nombre']

export interface PosibleDuplicado {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly nombreCorto: string
  readonly campus: string | null
  readonly servicios: number
  readonly tieneCuenta: boolean
  readonly coincide: readonly MotivoCoincidencia[]
}

export interface DatosPosiblesDuplicados {
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string | null
  readonly telefono: string | null
}

const MAX_LARGO = 100

function texto(v: string | null): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/** The query string of the GET route. Returns the data, or a Spanish message for a 400. */
export function parsePosiblesDuplicados(params: URLSearchParams): DatosPosiblesDuplicados | { readonly error: string } {
  const nombre = texto(params.get('nombre'))
  const apellido = texto(params.get('apellido'))
  if (!nombre || !apellido) return { error: 'Nombre y apellido son requeridos' }
  const cedulaEscrita = texto(params.get('cedula'))
  const telefono = texto(params.get('telefono'))
  if ([nombre, apellido, cedulaEscrita, telefono].some((v) => v !== null && v.length > MAX_LARGO)) {
    return { error: 'Datos inválidos' }
  }
  return { nombre, apellido, cedula: prepararCedula(cedulaEscrita), telefono }
}

/** The RPC arguments; the optional ones are left out when empty, never sent as null. */
export function rpcArgsPosiblesDuplicados(d: DatosPosiblesDuplicados) {
  return {
    p_nombre: d.nombre,
    p_apellido: d.apellido,
    ...(d.cedula ? { p_cedula: d.cedula } : {}),
    ...(d.telefono ? { p_telefono: d.telefono } : {}),
  }
}

/** The GET url for what the form has typed (empty values are left out). */
export function urlPosiblesDuplicados(d: {
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string
  readonly telefono: string
}): string {
  const params = new URLSearchParams()
  for (const clave of ['nombre', 'apellido', 'cedula', 'telefono'] as const) {
    const v = d[clave].trim()
    if (v !== '') params.set(clave, v)
  }
  return `/api/dream-team/usuarios/posibles-duplicados?${params.toString()}`
}

/** Maps the rows of personas_posibles_duplicados, dropping malformed ones. */
export function mapPosiblesDuplicados(data: unknown): PosibleDuplicado[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila) => {
    if (!fila || typeof fila !== 'object') return []
    const f = fila as Record<string, unknown>
    if (typeof f.id !== 'string' || typeof f.nombre !== 'string' || typeof f.apellido !== 'string') return []
    const coincide = Array.isArray(f.coincide)
      ? MOTIVOS.filter((m) => (f.coincide as unknown[]).includes(m))
      : []
    return [{
      id: f.id,
      nombre: f.nombre,
      apellido: f.apellido,
      nombreCorto: nombreCorto(f.nombre, f.apellido),
      campus: typeof f.campus === 'string' ? f.campus : null,
      servicios: typeof f.servicios === 'number' ? f.servicios : 0,
      tieneCuenta: f.tiene_cuenta === true,
      coincide: [...coincide].sort((a, b) => MOTIVOS.indexOf(a) - MOTIVOS.indexOf(b)),
    }]
  })
}

const TEXTO_MOTIVO: Readonly<Record<MotivoCoincidencia, string>> = {
  cedula: 'Misma cédula',
  telefono: 'Mismo teléfono',
  nombre: 'Nombre parecido',
}

/** «Misma cédula · Nombre parecido»: why the person matched, strongest reason first. */
export function textoCoincidencia(coincide: readonly MotivoCoincidencia[]): string {
  return MOTIVOS.filter((m) => coincide.includes(m)).map((m) => TEXTO_MOTIVO[m]).join(' · ')
}
