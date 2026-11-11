/**
 * Public reservation of Grupos de Corto Plazo (T5b of
 * odd/tasks/talleres-reserva-publica.md, S1 S3 S4 S12 S13): the pure rules
 * shared by the pages, the client flow and the API routes. No node:crypto
 * here (the code, its hash and the token live in ./reserva-publica-servidor).
 *
 * The catalog shape mirrors talleres_publico_taller_json
 * (supabase/migrations/20261110140000_talleres_reserva_publica_rpc.sql); the
 * ficha rules mirror talleres_reserva_ficha so the form says what the
 * database would refuse before sending it.
 */
import type { TonoEstado } from '@/components/ui/punto-estado'

export type Genero = 'Masculino' | 'Femenino'
export type Vinculo = 'matrimonio' | 'novios'

export interface EdicionPublica {
  readonly id: string
  /** YYYY-MM-DD */
  readonly fechaInicio: string
  readonly fechaFin: string | null
  /** YYYY-MM-DD; inscription is open while today is before it. */
  readonly cierreInscripcion: string | null
  readonly lugar: string | null
  readonly clases: number | null
  /** HH:MM (24 h) */
  readonly hora: string | null
  /** null: no limit */
  readonly cupo: number | null
  readonly lugaresLibres: number | null
  readonly lleno: boolean
  /** First names of the active group leaders. */
  readonly facilitadores: readonly string[]
}

export interface TallerPublico {
  readonly slug: string
  readonly nombre: string
  readonly descripcion: string | null
  /** Couple taller: both people enroll in one inscription (S12). */
  readonly pareja: boolean
  /** Set by the taller; when null a pareja reservation asks for it. */
  readonly vinculo: Vinculo | null
  readonly generoRequerido: Genero | null
  readonly duracionMinutos: number | null
  readonly ediciones: readonly EdicionPublica[]
}

/** Every request body of /api/talleres/reserva/* stays under this (p_datos is capped at 8 KB). */
export const LIMITE_CUERPO = 8_192

/** Name of the honeypot field: hidden from people, bots fill it. */
export const CAMPO_TRAMPA = 'sitio_web'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{2}:\d{2}$/
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/
/** The raw reservation token: 32 random bytes in base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const fecha = (v: unknown): string | null => (typeof v === 'string' && FECHA.test(v) ? v : null)

export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
export const esSlug = (v: unknown): v is string => typeof v === 'string' && SLUG.test(v)

// ─── Catalog ───

function parseEdicion(raw: unknown): EdicionPublica | null {
  if (!esObjeto(raw) || !esUuid(raw.id)) return null
  const fechaInicio = fecha(raw.fecha_inicio)
  if (!fechaInicio) return null
  return {
    id: raw.id,
    fechaInicio,
    fechaFin: fecha(raw.fecha_fin),
    cierreInscripcion: fecha(raw.cierre_inscripcion),
    lugar: texto(raw.lugar),
    clases: entero(raw.clases),
    hora: typeof raw.hora === 'string' && HORA.test(raw.hora) ? raw.hora : null,
    cupo: entero(raw.cupo),
    lugaresLibres: entero(raw.lugares_libres),
    lleno: raw.lleno === true,
    facilitadores: Array.isArray(raw.facilitadores) ? raw.facilitadores.filter((f): f is string => typeof f === 'string' && f.trim() !== '') : [],
  }
}

export function parseTallerPublico(raw: unknown): TallerPublico | null {
  if (!esObjeto(raw)) return null
  const slug = texto(raw.slug)
  const nombre = texto(raw.nombre)
  if (!slug || !nombre) return null
  return {
    slug,
    nombre,
    descripcion: texto(raw.descripcion),
    pareja: raw.tipo === 'pareja',
    vinculo: raw.vinculo === 'matrimonio' || raw.vinculo === 'novios' ? raw.vinculo : null,
    generoRequerido: raw.genero_requerido === 'Masculino' || raw.genero_requerido === 'Femenino' ? raw.genero_requerido : null,
    duracionMinutos: entero(raw.duracion_minutos),
    ediciones: Array.isArray(raw.ediciones) ? raw.ediciones.map(parseEdicion).filter((e): e is EdicionPublica => e !== null) : [],
  }
}

export function parseCatalogo(raw: unknown): TallerPublico[] {
  return Array.isArray(raw) ? raw.map(parseTallerPublico).filter((t): t is TallerPublico => t !== null) : []
}

/** Ediciones that still take a reservation (not full). */
export const edicionesConLugar = (t: TallerPublico) => t.ediciones.filter((e) => !e.lleno)

// ─── Labels ───

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** A YYYY-MM-DD as a calendar date (no time zone shift). */
function partes(f: string): { dia: number; mes: number; anio: number; semana: number } {
  const [anio, mes, dia] = f.split('-').map(Number)
  return { anio, mes, dia, semana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() }
}

/** "Jueves" */
export const diaSemana = (f: string) => DIAS[partes(f).semana]

/** "19 nov" */
export function fechaDiaMes(f: string): string {
  const p = partes(f)
  return `${p.dia} ${MESES[p.mes - 1]}`
}

/** "jue 19 nov" */
export const fechaCorta = (f: string) => `${diaSemana(f).slice(0, 3).toLowerCase()} ${fechaDiaMes(f)}`

/** "19:00" → "7:00 p.m." */
export function horaLegible(hora: string | null): string | null {
  if (!hora || !HORA.test(hora)) return null
  const [h, m] = hora.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

/** "Jueves · 7:00 p.m." */
export function tituloEdicion(e: EdicionPublica): string {
  const hora = horaLegible(e.hora)
  return hora ? `${diaSemana(e.fechaInicio)} · ${hora}` : diaSemana(e.fechaInicio)
}

export interface EstadoCupo {
  readonly tono: TonoEstado
  readonly etiqueta: string
  /** Share taken, 0–1; null without a cupo. */
  readonly ocupado: number | null
}

/** Status of an edición's places, said in words (never color alone). */
export function estadoCupo(e: EdicionPublica): EstadoCupo {
  if (e.lleno) return { tono: 'danger', etiqueta: 'Lleno', ocupado: 1 }
  if (e.cupo === null || e.lugaresLibres === null) return { tono: 'success', etiqueta: 'Inscripción abierta', ocupado: null }
  const ocupado = e.cupo > 0 ? Math.min(1, Math.max(0, (e.cupo - e.lugaresLibres) / e.cupo)) : null
  if (e.lugaresLibres <= Math.max(5, Math.ceil(e.cupo * 0.2))) {
    return { tono: 'warning', etiqueta: e.lugaresLibres === 1 ? 'Queda 1 lugar' : `Quedan ${e.lugaresLibres} lugares`, ocupado }
  }
  return { tono: 'success', etiqueta: `Quedan ${e.lugaresLibres} de ${e.cupo} lugares`, ocupado }
}

/** "Para mujeres", "Para matrimonios"… */
export function audiencia(t: TallerPublico): string | null {
  if (t.generoRequerido === 'Femenino') return 'Para mujeres'
  if (t.generoRequerido === 'Masculino') return 'Para hombres'
  if (t.pareja) return t.vinculo === 'matrimonio' ? 'Para matrimonios' : t.vinculo === 'novios' ? 'Para novios' : 'Para parejas'
  return null
}

/** "tu cónyuge" or "tu pareja", as the taller's vínculo reads. */
export const nombrePareja = (v: Vinculo | null) => (v === 'matrimonio' ? 'tu cónyuge' : 'tu pareja')

// ─── Cédula ───

/**
 * What people type ("V-15.598.745", "e 1234567") as the database's form:
 * 6–8 digits, or E + 6–9 digits (talleres_cedula_pareja_normalizada).
 */
export function normalizarCedula(valor: string): string | null {
  const limpio = valor.toUpperCase().replace(/[\s.\-]/g, '')
  const extranjera = /^E(\d{6,9})$/.exec(limpio)
  if (extranjera) return `E${extranjera[1]}`
  const venezolana = /^V?(\d{6,8})$/.exec(limpio)
  return venezolana ? venezolana[1] : null
}

/** "15598745" → "V-15.598.745" */
export function formatoCedula(cedula: string): string {
  const extranjera = cedula.startsWith('E')
  const digitos = extranjera ? cedula.slice(1) : cedula
  const grupos: string[] = []
  for (let fin = digitos.length; fin > 0; fin -= 3) grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin))
  return `${extranjera ? 'E' : 'V'}-${grupos.join('.')}`
}

// ─── Ficha nueva (S4, S12) ───

export const CAMPOS_FICHA = ['cedula', 'nombre', 'apellido', 'fecha_nacimiento', 'telefono', 'email', 'genero'] as const
export type CampoFicha = (typeof CAMPOS_FICHA)[number]
export type FichaNueva = Record<CampoFicha, string>

export const fichaVacia = (cedula = ''): FichaNueva => ({
  cedula,
  nombre: '',
  apellido: '',
  fecha_nacimiento: '',
  telefono: '',
  email: '',
  genero: '',
})

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const TELEFONO = /^\+?[0-9 ()-]{7,20}$/

/** Today minus 18 years, YYYY-MM-DD (the latest adult birth date). */
function mayoriaDeEdad(hoy: string): string {
  const p = partes(hoy)
  return `${p.anio - 18}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

/**
 * One message per field the database would refuse. `contactoRequerido` is
 * false only for a new spouse, whose email and phone are optional.
 */
export function validarFicha(
  f: FichaNueva,
  opciones: { hoy: string; contactoRequerido: boolean; generoRequerido?: Genero | null },
): Partial<Record<CampoFicha, string>> {
  const errores: Partial<Record<CampoFicha, string>> = {}
  if (!normalizarCedula(f.cedula)) errores.cedula = 'Escribe una cédula válida, solo números.'
  const nombre = f.nombre.trim()
  if (!nombre || nombre.length > 80) errores.nombre = 'Escribe el nombre.'
  const apellido = f.apellido.trim()
  if (!apellido || apellido.length > 80) errores.apellido = 'Escribe el apellido.'
  if (!FECHA.test(f.fecha_nacimiento) || f.fecha_nacimiento <= '1900-01-01' || f.fecha_nacimiento > opciones.hoy) {
    errores.fecha_nacimiento = 'Escribe la fecha de nacimiento.'
  } else if (f.fecha_nacimiento > mayoriaDeEdad(opciones.hoy)) {
    errores.fecha_nacimiento = 'Los talleres son para mayores de 18 años.'
  }
  const telefono = f.telefono.trim()
  if (telefono ? !TELEFONO.test(telefono) : opciones.contactoRequerido) errores.telefono = 'Escribe un teléfono, por ejemplo 0414 123 4567.'
  const email = f.email.trim()
  if (email ? email.length > 254 || !EMAIL.test(email) : opciones.contactoRequerido) errores.email = 'Escribe un correo completo, por ejemplo nombre@gmail.com.'
  if (f.genero !== 'Femenino' && f.genero !== 'Masculino') {
    errores.genero = 'Elige una opción.'
  } else if (opciones.generoRequerido && f.genero !== opciones.generoRequerido) {
    errores.genero = `Este taller es solo para ${opciones.generoRequerido === 'Femenino' ? 'mujeres' : 'hombres'}.`
  }
  return errores
}

/** The ficha as the database expects it (trimmed). */
export function fichaParaEnviar(f: FichaNueva): FichaNueva {
  const salida = fichaVacia()
  for (const c of CAMPOS_FICHA) salida[c] = f[c].trim()
  salida.cedula = normalizarCedula(f.cedula) ?? f.cedula.trim()
  return salida
}

// ─── Request bodies of /api/talleres/reserva/* ───

const trampa = (b: Objeto) => typeof b[CAMPO_TRAMPA] === 'string' && (b[CAMPO_TRAMPA] as string).trim() !== ''
const corto = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

export interface SolicitudIdentificar {
  readonly edicionId: string
  readonly slug: string
  readonly cedula: string
  readonly honeypot: boolean
}

/** The cédula goes as typed: the database normalizes and validates it. */
export function parseIdentificar(body: unknown): SolicitudIdentificar | null {
  if (!esObjeto(body) || !esUuid(body.edicionId) || !esSlug(body.slug) || !corto(body.cedula, 32)) return null
  return { edicionId: body.edicionId, slug: body.slug, cedula: body.cedula, honeypot: trampa(body) }
}

export function parseVerificar(body: unknown): { codigoId: string; codigo: string } | null {
  if (!esObjeto(body) || !esUuid(body.codigoId) || typeof body.codigo !== 'string' || !/^\d{6}$/.test(body.codigo)) return null
  return { codigoId: body.codigoId, codigo: body.codigo }
}

export function parseReenviar(body: unknown): { codigoId: string; slug: string } | null {
  if (!esObjeto(body) || !esUuid(body.codigoId) || !esSlug(body.slug)) return null
  return { codigoId: body.codigoId, slug: body.slug }
}

export type PrincipalCrear = { token: string } | { por_verificar: { cedula: string } } | { ficha_nueva: FichaNueva }
export type ParejaCrear = { token: string } | { ficha_nueva: FichaNueva } | { pendiente_cedula: string }

export interface SolicitudCrear {
  readonly edicionId: string
  readonly principal: PrincipalCrear
  readonly pareja: ParejaCrear | null
  readonly vinculo: Vinculo | null
  readonly honeypot: boolean
}

/** Only the known keys, each a short string; the database validates the values. */
function parseFicha(raw: unknown): FichaNueva | null {
  if (!esObjeto(raw)) return null
  const ficha = fichaVacia()
  for (const c of CAMPOS_FICHA) {
    const v = raw[c]
    if (v === undefined || v === null) continue
    if (!corto(v, 254)) return null
    ficha[c] = v
  }
  return ficha
}

/** Exactly one of the keys, else null. */
function unaClave(raw: unknown, claves: readonly string[]): string | null {
  if (!esObjeto(raw)) return null
  const presentes = claves.filter((c) => c in raw)
  return presentes.length === 1 ? presentes[0] : null
}

function parsePrincipal(raw: unknown): PrincipalCrear | null {
  const clave = unaClave(raw, ['token', 'por_verificar', 'ficha_nueva'])
  const o = raw as Objeto
  if (clave === 'token') return typeof o.token === 'string' && TOKEN.test(o.token) ? { token: o.token } : null
  if (clave === 'por_verificar') {
    const pv = o.por_verificar
    return esObjeto(pv) && corto(pv.cedula, 32) ? { por_verificar: { cedula: pv.cedula } } : null
  }
  if (clave === 'ficha_nueva') {
    const ficha = parseFicha(o.ficha_nueva)
    return ficha ? { ficha_nueva: ficha } : null
  }
  return null
}

function parsePareja(raw: unknown): ParejaCrear | null {
  const clave = unaClave(raw, ['token', 'ficha_nueva', 'pendiente_cedula'])
  const o = raw as Objeto
  if (clave === 'token') return typeof o.token === 'string' && TOKEN.test(o.token) ? { token: o.token } : null
  if (clave === 'pendiente_cedula') return corto(o.pendiente_cedula, 32) ? { pendiente_cedula: o.pendiente_cedula } : null
  if (clave === 'ficha_nueva') {
    const ficha = parseFicha(o.ficha_nueva)
    return ficha ? { ficha_nueva: ficha } : null
  }
  return null
}

export function parseCrear(body: unknown): SolicitudCrear | null {
  if (!esObjeto(body) || !esUuid(body.edicionId)) return null
  const principal = parsePrincipal(body.principal)
  if (!principal) return null
  let pareja: ParejaCrear | null = null
  if (body.pareja !== undefined && body.pareja !== null) {
    pareja = parsePareja(body.pareja)
    if (!pareja) return null
  }
  const vinculo = body.vinculo === 'matrimonio' || body.vinculo === 'novios' ? body.vinculo : null
  return { edicionId: body.edicionId, principal, pareja, vinculo, honeypot: trampa(body) }
}

export interface SolicitudAvisame {
  readonly edicionId: string
  readonly nombre: string
  readonly email: string
  readonly honeypot: boolean
}

export function parseAvisame(body: unknown): SolicitudAvisame | null {
  if (!esObjeto(body) || !esUuid(body.edicionId) || !corto(body.nombre, 120) || !corto(body.email, 254)) return null
  return { edicionId: body.edicionId, nombre: body.nombre, email: body.email, honeypot: trampa(body) }
}

// ─── Answers ───

/** Every estado a route can answer, as the client reads it. */
export type EstadoReserva =
  | 'ok'
  | 'codigo'
  | 'nuevo'
  | 'sin_correo'
  | 'invalido'
  | 'vencido'
  | 'bloqueado'
  | 'espera'
  | 'limite'
  | 'cerrada'
  | 'cupo_lleno'
  | 'ya_inscrito'
  | 'genero_no_aplica'
  | 'pareja_no_disponible'
  | 'error'

const STATUS: Partial<Record<EstadoReserva, number>> = {
  invalido: 400,
  vencido: 409,
  bloqueado: 409,
  cerrada: 409,
  cupo_lleno: 409,
  ya_inscrito: 409,
  genero_no_aplica: 409,
  pareja_no_disponible: 409,
  espera: 429,
  limite: 429,
  error: 500,
}

/** HTTP status of an estado; 200 for the ones the flow continues with. */
export const statusDe = (estado: EstadoReserva) => STATUS[estado] ?? 200

export const MENSAJES = {
  solicitudInvalida: 'No pudimos leer la solicitud. Recarga la página e intenta de nuevo.',
  demasiadoGrande: 'La solicitud es demasiado grande.',
  error: 'No pudimos completar este paso. Intenta de nuevo en un momento.',
  red: 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo; tus datos siguen aquí.',
  limite: 'Recibimos varios intentos seguidos. Espera unos minutos e intenta de nuevo.',
  cerrada: 'Las inscripciones de este horario cerraron.',
  cedula: 'Revisa la cédula: escribe solo los números, por ejemplo 15598745.',
  codigoInvalido: 'Ese código no sirve. Pide uno nuevo.',
  vencido: 'El código venció. Pide uno nuevo.',
  bloqueado: 'Bloqueamos este código por demasiados intentos. Vuelve a escribir tu cédula para recibir otro.',
  cupoLleno: 'Se ocupó el último lugar de este horario mientras completabas tus datos. Tus datos siguen aquí.',
  yaInscrito: 'Ya pediste un lugar en este taller. No hace falta enviarla otra vez.',
  generoNoAplica: 'Este taller no es para ti según los datos de tu ficha.',
  parejaNoDisponible: 'Tu pareja ya tiene un lugar en este horario.',
  datosRechazados:
    'No pudimos registrar la solicitud con estos datos. Si ya estás en Global, vuelve atrás y usa tu cédula; si no, escribe a la coordinación.',
} as const

export const mensajeIntentos = (restantes: number) =>
  restantes === 1 ? 'Ese código no coincide. Te queda 1 intento.' : `Ese código no coincide. Te quedan ${restantes} intentos.`

export const mensajeEspera = (segundos: number) => `Puedes pedir otro código en ${segundos} s.`

const ETIQUETA_CAMPO: Record<string, string> = {
  cedula: 'la cédula',
  nombre: 'el nombre',
  apellido: 'el apellido',
  fecha_nacimiento: 'la fecha de nacimiento',
  telefono: 'el teléfono',
  email: 'el correo',
  genero: 'el sexo',
  vinculo: 'el vínculo',
  pareja: 'los datos de tu pareja',
}

/** "pareja.email" → "Revisa el correo de tu pareja." */
export function mensajeCampo(campo: string): string {
  const [primero, segundo] = campo.split('.')
  if (primero === 'pareja' && segundo) return `Revisa ${ETIQUETA_CAMPO[segundo] ?? 'los datos'} de tu pareja.`
  return `Revisa ${ETIQUETA_CAMPO[primero] ?? 'los datos'}.`
}
