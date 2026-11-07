/**
 * T2 (odd/tasks/proximo-paso.md, S3) — the public QR registration of
 * Próximo Paso (/proximo-paso): the shape of the open ediciones read from
 * proximo_paso_ediciones_abiertas (anon-executable, only public fields), the
 * routes the page and the login go back to, the copy of the confirmation and
 * the validation of the account form. Pure: no Supabase client here, the
 * server action in app/proximo-paso/actions.ts does the writes.
 */

import { esTelefonoReconocible, normalizarTelefono } from '@/lib/utils/telefono'

export const PROXIMO_PASO_SLUG = 'proximo-paso'
export const RUTA_PROXIMO_PASO = '/proximo-paso'
/** Where an enrolled participant sees their clases (the "Para mí" screen). */
export const RUTA_MIS_CLASES = '/talleres/mi-recorrido'

export interface ClaseProximoPaso {
  readonly numero: number
  readonly tema: string | null
  /** YYYY-MM-DD */
  readonly fecha: string
}

export interface EdicionProximoPaso {
  readonly id: string
  /** The edición's name, the month it starts: "Diciembre 2026". */
  readonly nombre: string
  readonly fechaInicio: string
  readonly fechaFin: string | null
  /** null = sin cupo definido. */
  readonly cupoRestante: number | null
  readonly clases: readonly ClaseProximoPaso[]
}

/** What the confirmation needs from an edición. */
export type EdicionResumen = Pick<EdicionProximoPaso, 'id' | 'nombre' | 'fechaInicio'>

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function parseClases(raw: unknown): ClaseProximoPaso[] {
  if (!Array.isArray(raw)) return []
  const clases: ClaseProximoPaso[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const { numero, tema, fecha } = c as Record<string, unknown>
    const dia = texto(fecha)
    if (typeof numero !== 'number' || !dia) continue
    clases.push({ numero, tema: texto(tema), fecha: dia })
  }
  return clases.sort((a, b) => a.numero - b.numero)
}

/** The rows of proximo_paso_ediciones_abiertas; anything malformed is dropped. */
export function parseEdicionesProximoPaso(raw: unknown): EdicionProximoPaso[] {
  if (!Array.isArray(raw)) return []
  const ediciones: EdicionProximoPaso[] = []
  for (const fila of raw) {
    if (!fila || typeof fila !== 'object') continue
    const f = fila as Record<string, unknown>
    const id = texto(f.edicion_id)
    const fechaInicio = texto(f.fecha_inicio)
    if (!id || !fechaInicio) continue
    ediciones.push({
      id,
      nombre: texto(f.nombre) ?? fechaInicio,
      fechaInicio,
      fechaFin: texto(f.fecha_fin),
      cupoRestante: typeof f.cupo_restante === 'number' ? f.cupo_restante : null,
      clases: parseClases(f.clases),
    })
  }
  return ediciones
}

/** The public page, with the edición preselected when given. */
export function rutaProximoPaso(edicionId?: string | null): string {
  return edicionId ? `${RUTA_PROXIMO_PASO}?edicion=${encodeURIComponent(edicionId)}` : RUTA_PROXIMO_PASO
}

/** The login lives at `/`; `redirect` brings the person back to the same edición. */
export function loginProximoPaso(edicionId?: string | null): string {
  return `/?redirect=${encodeURIComponent(rutaProximoPaso(edicionId))}`
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "6 de diciembre" for a YYYY-MM-DD date, read as a calendar day (no timezone shift). */
export function fechaDomingo(iso: string): string {
  const [, mes, dia] = iso.split('-').map(Number)
  return `${dia} de ${MESES[mes - 1] ?? ''}`
}

export function mensajeInscrito(edicion: Pick<EdicionResumen, 'nombre' | 'fechaInicio'>): string {
  return `Quedaste inscrito en Próximo Paso — ${edicion.nombre}, primera clase el domingo ${fechaDomingo(edicion.fechaInicio)}`
}

/** inscrito = approved on the spot; pendiente = waiting for the coordinación. */
export type EstadoInscripcionProximoPaso = 'inscrito' | 'pendiente'

/**
 * The estado of a talleres_inscribirme result or of a taller_inscripciones
 * row. Only an explicit 'aprobado' reads as inscrito: anything else, or
 * nothing, never claims more than "pendiente".
 */
export function estadoInscripcion(raw: unknown): EstadoInscripcionProximoPaso {
  const estado = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).estado : null
  return estado === 'aprobado' ? 'inscrito' : 'pendiente'
}

export function mensajePendiente(edicion: Pick<EdicionResumen, 'nombre'>): string {
  return `Recibimos tu inscripción en Próximo Paso — ${edicion.nombre}`
}

export type CampoRegistro = 'nombre' | 'apellido' | 'telefono' | 'email' | 'password'

export interface DatosRegistro {
  readonly nombre: string
  readonly apellido: string
  /** Normalized: 04XXXXXXXXX for a Venezuelan number, +digits for a foreign one. */
  readonly telefono: string
  /** Trimmed and lowercased. */
  readonly email: string
  readonly password: string
}

export type ValidacionRegistro =
  | { readonly ok: true; readonly datos: DatosRegistro }
  | { readonly ok: false; readonly errores: Partial<Record<CampoRegistro, string>> }

export const MENSAJES_REGISTRO: Readonly<Record<CampoRegistro, string>> = {
  nombre: 'Escribe tu nombre.',
  apellido: 'Escribe tu apellido.',
  telefono: 'Escribe tu teléfono, por ejemplo 0412 123 4567.',
  email: 'Revisa tu correo: no parece una dirección válida.',
  password: 'La contraseña debe tener al menos 8 caracteres.',
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const INTERNACIONAL = /^\+\d{7,15}$/

function nombrePropio(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().replace(/\s+/g, ' ')
  return limpio.length >= 1 && limpio.length <= 80 ? limpio : null
}

function telefono(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  if (esTelefonoReconocible(valor)) return normalizarTelefono(valor)
  const internacional = valor.trim().replace(/[\s .()-]/g, '')
  return INTERNACIONAL.test(internacional) ? internacional : null
}

function correo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().toLowerCase()
  return limpio.length <= 254 && EMAIL.test(limpio) ? limpio : null
}

function contrasena(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length >= 8 && valor.length <= 72 ? valor : null
}

/** Validates the account form; every invalid field gets its message. */
export function validarRegistro(raw: unknown): ValidacionRegistro {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const valores = {
    nombre: nombrePropio(r.nombre),
    apellido: nombrePropio(r.apellido),
    telefono: telefono(r.telefono),
    email: correo(r.email),
    password: contrasena(r.password),
  }
  const errores: Partial<Record<CampoRegistro, string>> = {}
  for (const campo of Object.keys(valores) as CampoRegistro[]) {
    if (valores[campo] === null) errores[campo] = MENSAJES_REGISTRO[campo]
  }
  if (Object.keys(errores).length > 0) return { ok: false, errores }
  return { ok: true, datos: valores as DatosRegistro }
}
