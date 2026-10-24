/**
 * Register a child from home in Mi Perfil (odd/tasks/ninos-mis-hijos.md, M5):
 * validates the parent's form, builds the ninos_mis_hijos_registrar payload
 * (only the keys a parent may send: never a parent, a room or VIP), reads the
 * campus list, the pending requests and the result, and maps the error codes
 * to Spanish. The RPC enforces every rule again; this only gives the parent
 * early, readable errors.
 */
import { fichaPayload, validarAutorizados, validarEdicionNino, type AutorizadoForm, type AutorizadoPayload, type FichaPayload, type Genero, type HijoForm } from './familia'
import { LIMITES_MIS_HIJOS, mensajeDeErrorMisHijos, textoOtrosPadres } from './mis-hijos'

/** Mirror of the SQL limits of ninos_mis_hijos_registrar. */
export const LIMITES_REGISTRO = { hijos: 10, edadMaxima: 13 } as const

export type CampusMisHijos = { id: string; nombre: string; principal: boolean }

/** A child named in a registration result or a pending request. */
export type NombreHijo = { nombre: string; apellido: string }

export type ResultadoRegistro = { registrados: NombreHijo[]; pendientes: NombreHijo[] }

export type HijoRegistroPayload = Omit<FichaPayload, 'salon_preferido_id'> & {
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: Genero
}

export type PayloadRegistro = {
  campus_id: string
  hijos: HijoRegistroPayload[]
  autorizados: AutorizadoPayload[]
}

export type FormRegistro = { campusId: string; hijos: readonly HijoForm[]; autorizados: readonly AutorizadoForm[] }

type Objeto = Record<string, unknown>

function esObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** True when a child born on `fecha` is under 13 on `hoy` (both YYYY-MM-DD), like ninos_en_rango_edad. */
function menorDeTrece(fecha: string, hoy: string): boolean {
  const limite = `${Number(hoy.slice(0, 4)) - LIMITES_REGISTRO.edadMaxima}${hoy.slice(4)}`
  return fecha > limite
}

/**
 * Validates the registration form: the campus, 1 to 10 children with name,
 * birth date (under 13) and gender, at most 6 pickup people and 500
 * characters per text.
 */
export function validarRegistroMisHijos(
  form: FormRegistro,
  /** Today in Caracas (hoyEnCaracas()). */
  hoy: string,
): { ok: true; payload: PayloadRegistro } | { ok: false; errores: string[] } {
  if (form.hijos.length === 0) return { ok: false, errores: ['Agrega al menos un niño.'] }
  if (form.hijos.length > LIMITES_REGISTRO.hijos) {
    return { ok: false, errores: [`Puedes registrar hasta ${LIMITES_REGISTRO.hijos} niños a la vez.`] }
  }

  const errores: string[] = []
  if (!form.campusId) errores.push('Elige el campus.')
  const varios = form.hijos.length > 1
  const hijos: HijoRegistroPayload[] = []
  let mayor = false
  form.hijos.forEach((h, i) => {
    // The room is never the parent's: it cannot make the form invalid either.
    const r = validarEdicionNino({ ...h, salonPreferidoId: '' }, hoy)
    if (!r.ok) {
      errores.push(...r.errores.map((e) => (varios ? `Niño ${i + 1}: ${e}` : e)))
      return
    }
    if (!menorDeTrece(r.payload.fecha_nacimiento, hoy)) mayor = true
    const { salon_preferido_id: _salon, ...ficha } = fichaPayload(h)
    hijos.push({ ...ficha, nombre: r.payload.nombre, apellido: r.payload.apellido, fecha_nacimiento: r.payload.fecha_nacimiento, genero: r.payload.genero })
  })
  if (mayor) errores.push(`Solo se registran niños menores de ${LIMITES_REGISTRO.edadMaxima} años.`)

  const aut = validarAutorizados(form.autorizados)
  errores.push(...aut.errores)
  if (aut.payload.length > LIMITES_MIS_HIJOS.autorizados) {
    errores.push(`Puedes indicar hasta ${LIMITES_MIS_HIJOS.autorizados} personas autorizadas.`)
  }
  const textos = [
    ...hijos.flatMap((h) => [h.nombre, h.apellido, h.alergias, h.necesidades_especiales, h.habitos, h.notas]),
    ...aut.payload.flatMap((a) => [a.nombre, a.telefono, a.relacion]),
  ]
  if (textos.some((t) => typeof t === 'string' && t.length > LIMITES_MIS_HIJOS.texto)) {
    errores.push(`Cada campo admite hasta ${LIMITES_MIS_HIJOS.texto} caracteres.`)
  }

  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, payload: { campus_id: form.campusId, hijos, autorizados: aut.payload } }
}

function parseNombres(data: unknown): NombreHijo[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((x): x is Objeto => esObjeto(x) && typeof x.nombre === 'string')
    .map((x) => ({ nombre: x.nombre as string, apellido: typeof x.apellido === 'string' ? x.apellido : '' }))
}

export function parseCampusMisHijos(data: unknown): CampusMisHijos[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((c): c is Objeto => esObjeto(c) && typeof c.id === 'string' && typeof c.nombre === 'string')
    .map((c) => ({ id: c.id as string, nombre: c.nombre as string, principal: c.principal === true }))
}

/** My requests waiting at the table (ninos_mis_hijos_pendientes). */
export const parsePendientesMisHijos = parseNombres

export function parseResultadoRegistro(data: unknown): ResultadoRegistro {
  const r = esObjeto(data) ? data : {}
  return { registrados: parseNombres(r.registrados), pendientes: parseNombres(r.pendientes) }
}

const nombres = (xs: readonly NombreHijo[]) => textoOtrosPadres(xs.map((x) => ({ nombre: x.nombre, apellido: '' })))

/** The notices after a registration: who can come in on Sunday and who waits for the table. */
export function mensajeRegistro(r: ResultadoRegistro): { listos: string | null; pendientes: string | null } {
  return {
    listos: r.registrados.length > 0 ? `Registramos a ${nombres(r.registrados)}. Ya pueden entrar el domingo.` : null,
    pendientes:
      r.pendientes.length === 0
        ? null
        : r.pendientes.length === 1
          ? `${nombres(r.pendientes)} quedó pendiente de confirmar en la mesa: se parece a un niño ya registrado, así que un anfitrión lo revisará contigo el domingo.`
          : `${nombres(r.pendientes)} quedaron pendientes de confirmar en la mesa: se parecen a niños ya registrados, así que un anfitrión los revisará contigo el domingo.`,
  }
}

const MENSAJES: Record<string, string> = {
  hijo_ya_registrado: 'Uno de los niños ya está entre tus hijos o pendiente de confirmar.',
  limite_diario: `Llegaste al máximo de ${LIMITES_REGISTRO.hijos} niños por día. Intenta mañana o pide ayuda en la mesa de check-in.`,
  limite_hijos: `Puedes registrar hasta ${LIMITES_REGISTRO.hijos} niños a la vez.`,
  sin_campus: 'Elige un campus con Niños.',
  edad_fuera_de_rango: `Solo se registran niños menores de ${LIMITES_REGISTRO.edadMaxima} años.`,
}

/** Codes shared with ninos_mis_hijos_guardar keep its copy. */
const COMPARTIDOS = new Set(['sin_autoridad', 'campo_no_permitido', 'limite_autorizados', 'texto_muy_largo', 'datos_invalidos'])

/** Spanish copy for a ninos_mis_hijos_registrar error; the RPC raises a snake_case code as the message. */
export function mensajeDeErrorRegistro(error: { code?: string; message?: string } | null): string {
  const clave = error?.message ?? ''
  if (MENSAJES[clave]) return MENSAJES[clave]
  if (COMPARTIDOS.has(clave) || error?.code === '42501' || error?.code === '22023') return mensajeDeErrorMisHijos(error)
  return 'No pudimos registrar a tus hijos. Intenta de nuevo.'
}
