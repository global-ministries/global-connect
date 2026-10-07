/**
 * Dream Team — fixing a person's ficha from Servidores (T11 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 *
 * Imported volunteers arrive with gaps (no birth date, 'No especificado', no
 * cedula, no phone). The database decides who may fix them
 * (dream_team_editar_ficha / dream_team_ficha_persona,
 * 20261008100000_dream_team_editar_ficha.sql): the same people who may
 * register a new person (the volunteer coordinator of the area,
 * dream_team.org.manage, admin or pastor), for someone with a non-retired
 * servicio in that area. This module validates the PATCH body with the same
 * rules (a clear message before a round trip), maps the RPC answer and errors,
 * and diffs the form against the loaded ficha so only the changed keys travel.
 *
 * Email is deliberately not editable here: it may be tied to the auth account.
 */
import { prepararCedula } from '@/lib/utils/cedula'

import { ESTADOS_CIVILES, GENEROS, type EstadoCivil, type Genero } from './alta-persona'

export interface FichaPersona {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly fechaNacimiento: string | null
  readonly cedula: string | null
  readonly genero: Genero
  readonly estadoCivil: EstadoCivil
  readonly telefono: string | null
  readonly redesSociales: string | null
}

/** The editable fields as the form holds them ('' = empty). */
export interface FormularioFicha {
  readonly fechaNacimiento: string
  readonly cedula: string
  readonly genero: string
  readonly estadoCivil: string
  readonly telefono: string
  readonly redesSociales: string
}

type CampoFicha = keyof FormularioFicha

/** The PATCH body key → the RPC (usuarios column) key. */
const COLUMNAS: Readonly<Record<CampoFicha, string>> = {
  fechaNacimiento: 'fecha_nacimiento',
  cedula: 'cedula',
  genero: 'genero',
  estadoCivil: 'estado_civil',
  telefono: 'telefono',
  redesSociales: 'redes_sociales',
}
const CAMPOS = Object.keys(COLUMNAS) as CampoFicha[]

export const FECHA_NACIMIENTO_MINIMA = '1900-01-01'
export const REDES_SOCIALES_MAX = 300

export type ParcheFicha = Readonly<Record<string, string | null>>

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(v: string): boolean {
  if (!FECHA.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Today as YYYY-MM-DD in local time (what the date input shows). */
export function hoyIso(hoy: Date = new Date()): string {
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

/** Validates one field; returns its value for the RPC or a Spanish message. */
function validarCampo(campo: CampoFicha, v: unknown, hoy: Date): { valor: string | null } | { error: string } {
  if (v !== null && typeof v !== 'string') {
    const nombres: Record<CampoFicha, string> = {
      fechaNacimiento: 'Fecha de nacimiento inválida',
      cedula: 'Cédula inválida',
      genero: 'Género inválido',
      estadoCivil: 'Estado civil inválido',
      telefono: 'Teléfono inválido',
      redesSociales: 'Redes sociales inválidas',
    }
    return { error: nombres[campo] }
  }
  const texto = v === null ? null : v.trim() === '' ? null : v.trim()
  switch (campo) {
    case 'fechaNacimiento':
      if (texto === null) return { valor: null }
      if (!fechaValida(texto) || texto < FECHA_NACIMIENTO_MINIMA) return { error: 'Fecha de nacimiento inválida' }
      if (texto > hoyIso(hoy)) return { error: 'La fecha de nacimiento no puede ser futura' }
      return { valor: texto }
    case 'cedula':
      return { valor: prepararCedula(texto ?? '') }
    case 'genero':
      return GENEROS.includes(texto as Genero) ? { valor: texto } : { error: 'Género inválido' }
    case 'estadoCivil':
      return ESTADOS_CIVILES.includes(texto as EstadoCivil) ? { valor: texto } : { error: 'Estado civil inválido' }
    case 'telefono':
      return { valor: texto }
    case 'redesSociales':
      if (texto !== null && texto.length > REDES_SOCIALES_MAX) {
        return { error: `Redes sociales: máximo ${REDES_SOCIALES_MAX} caracteres` }
      }
      return { valor: texto }
  }
}

/** Validates the PATCH body: only the keys present, at least one. */
export function parseEditarFicha(body: unknown, hoy: Date = new Date()): { readonly datos: ParcheFicha } | { readonly error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const desconocida = Object.keys(b).find((k) => !CAMPOS.includes(k as CampoFicha))
  if (desconocida !== undefined) return { error: `Campo no editable: ${desconocida}` }

  const datos: Record<string, string | null> = {}
  for (const campo of CAMPOS) {
    if (!(campo in b)) continue
    const r = validarCampo(campo, b[campo], hoy)
    if ('error' in r) return r
    datos[COLUMNAS[campo]] = r.valor
  }
  if (Object.keys(datos).length === 0) return { error: 'No hay cambios para guardar' }
  return { datos }
}

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Maps the jsonb of dream_team_ficha_persona / dream_team_editar_ficha. */
export function mapFicha(data: unknown): FichaPersona {
  if (!data || typeof data !== 'object') throw new Error('dream_team ficha: unexpected answer')
  const d = data as Record<string, unknown>
  return {
    id: String(d.id),
    nombre: String(d.nombre ?? ''),
    apellido: String(d.apellido ?? ''),
    fechaNacimiento: texto(d.fecha_nacimiento),
    cedula: texto(d.cedula),
    genero: d.genero as Genero,
    estadoCivil: d.estado_civil as EstadoCivil,
    telefono: texto(d.telefono),
    redesSociales: texto(d.redes_sociales),
  }
}

/** The RPC's messages (RAISE EXCEPTION '<code>' USING errcode 22023) in the form's words. */
const MENSAJES: Readonly<Record<string, string>> = {
  datos_invalidos: 'Datos inválidos',
  campo_no_editable: 'Ese campo no se puede editar aquí',
  fecha_nacimiento_invalida: 'Fecha de nacimiento inválida',
  genero_invalido: 'Género inválido',
  estado_civil_invalido: 'Estado civil inválido',
  redes_sociales_largo: `Redes sociales: máximo ${REDES_SOCIALES_MAX} caracteres`,
}

export type FichaFallo =
  | { readonly status: 403 | 409 | 422 | 500; readonly error: string }

/** Maps an RPC error to an HTTP answer. Never leaks the SQLSTATE or the detail on a 500. */
export function mapFichaError(error: { code?: string; message?: string }): FichaFallo {
  if (error.code === '42501') return { status: 403, error: 'Permiso denegado' }
  if (error.code === '23505') return { status: 409, error: 'Esa cédula ya pertenece a otra persona' }
  if (error.code === '22023' || error.code === '22007' || error.code === '22008' || error.code === '23514') {
    return { status: 422, error: MENSAJES[error.message ?? ''] ?? 'Datos inválidos' }
  }
  return { status: 500, error: 'Error interno' }
}

/** The form values for a loaded ficha. */
export function formularioDesdeFicha(ficha: FichaPersona): FormularioFicha {
  return {
    fechaNacimiento: ficha.fechaNacimiento ?? '',
    cedula: ficha.cedula ?? '',
    genero: ficha.genero,
    estadoCivil: ficha.estadoCivil,
    telefono: ficha.telefono ?? '',
    redesSociales: ficha.redesSociales ?? '',
  }
}

/** The PATCH body: only the fields whose trimmed value changed. */
export function cambiosDeFicha(ficha: FichaPersona, form: FormularioFicha): Partial<FormularioFicha> {
  const inicial = formularioDesdeFicha(ficha)
  const cambios: Partial<Record<CampoFicha, string>> = {}
  for (const campo of CAMPOS) {
    if (form[campo].trim() !== inicial[campo].trim()) cambios[campo] = form[campo].trim()
  }
  return cambios
}

/**
 * The equipos whose people the caller may fix the ficha of (and register new
 * people into): dream_team_equipos_registrables. Fails closed: any error is
 * an empty set.
 */
export async function fetchEquiposRegistrables(supabase: {
  rpc: (fn: 'dream_team_equipos_registrables') => PromiseLike<{ data: unknown; error: unknown }>
}): Promise<ReadonlySet<string>> {
  try {
    const { data, error } = await supabase.rpc('dream_team_equipos_registrables')
    if (error || !Array.isArray(data)) return new Set()
    return new Set(
      data.flatMap((fila) => {
        const id = (fila as { equipo_id?: unknown } | null)?.equipo_id
        return typeof id === 'string' ? [id] : []
      }),
    )
  } catch {
    return new Set()
  }
}
