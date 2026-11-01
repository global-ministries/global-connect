/**
 * Mi familia in Mi perfil (S15 of odd/tasks/sistema-diseno-v2.md, T11b-1;
 * prototype docs/design-system/prototipos/usuarios/07-mi-familia-escritorio.html).
 * Pure pieces: relation labels by gender, parsers of the familia_* RPC
 * answers (supabase/migrations/20261101200000_mi_familia.sql), the tuteo
 * message of every error code, the steps of the "Agregar familiar" sheet and
 * the validation of the homonym datum and of a relative without an account.
 */
import type { Database } from '@/lib/supabase/database.types'

/** The relations a request accepts (tutor stays for Niños). */
export type TipoFamilia = Exclude<Database['public']['Enums']['enum_tipo_relacion'], 'tutor'>
export type GeneroFamilia = string | null

export const RELACIONES_FAMILIA: readonly { readonly valor: TipoFamilia; readonly etiqueta: string }[] = [
  { valor: 'conyuge', etiqueta: 'Cónyuge' },
  { valor: 'padre', etiqueta: 'Padre o madre' },
  { valor: 'hermano', etiqueta: 'Hermano o hermana' },
  { valor: 'hijo', etiqueta: 'Hijo o hija' },
  { valor: 'abuelo', etiqueta: 'Abuelo o abuela' },
  { valor: 'tio', etiqueta: 'Tío o tía' },
  { valor: 'otro_familiar', etiqueta: 'Otro familiar' },
]

const TIPOS = new Set<string>(RELACIONES_FAMILIA.map((r) => r.valor))
const esTipo = (v: unknown): v is TipoFamilia => typeof v === 'string' && TIPOS.has(v)

// [masculine, feminine, neutral]; the neutral one when the gender is unknown or "Otro".
const ETIQUETAS: Record<TipoFamilia, readonly [string, string, string]> = {
  conyuge: ['Esposo', 'Esposa', 'Cónyuge'],
  padre: ['Padre', 'Madre', 'Padre o madre'],
  hijo: ['Hijo', 'Hija', 'Hijo o hija'],
  hermano: ['Hermano', 'Hermana', 'Hermano o hermana'],
  abuelo: ['Abuelo', 'Abuela', 'Abuelo o abuela'],
  tio: ['Tío', 'Tía', 'Tío o tía'],
  otro_familiar: ['Familiar', 'Familiar', 'Familiar'],
}

/** What the relative is to me, following the relative's gender ("Esposa", "Hermano"). */
export function etiquetaRelacion(tipo: TipoFamilia, genero: GeneroFamilia): string {
  const [m, f, neutro] = ETIQUETAS[tipo]
  return genero === 'Femenino' ? f : genero === 'Masculino' ? m : neutro
}

export function etiquetaTipo(tipo: TipoFamilia): string {
  return RELACIONES_FAMILIA.find((r) => r.valor === tipo)?.etiqueta ?? ''
}

// ── familia_mis_solicitudes ──

export interface Familiar {
  readonly relacionId: string
  readonly usuarioId: string
  readonly relacion: TipoFamilia
  readonly nombre: string
  readonly apellido: string
  readonly genero: GeneroFamilia
  readonly cuenta: boolean
  readonly puedoEditar: boolean
  readonly esNino: boolean
}

export interface SolicitudEnviada {
  readonly id: string
  readonly tipo: TipoFamilia
  readonly nombre: string
  readonly apellido: string
  readonly genero: GeneroFamilia
  readonly espera: 'persona' | 'campus'
  readonly creadoEn: string
}

export interface SolicitudRecibida {
  readonly id: string
  readonly relacion: TipoFamilia
  readonly nombre: string
  readonly apellido: string
  readonly genero: GeneroFamilia
  readonly creadoEn: string
}

export interface MiFamilia {
  readonly familiares: readonly Familiar[]
  readonly enviadas: readonly SolicitudEnviada[]
  readonly recibidas: readonly SolicitudRecibida[]
}

type Fila = Record<string, unknown>
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const genero = (v: unknown): GeneroFamilia => (typeof v === 'string' && v ? v : null)
const filas = (v: unknown): Fila[] => (Array.isArray(v) ? v.filter(esObjeto) : [])
const presentes = <T>(lista: (T | null)[]): T[] => lista.filter((x): x is T => x !== null)

function aFamiliar(f: Fila): Familiar | null {
  if (typeof f.relacion_id !== 'string' || typeof f.usuario_id !== 'string' || !esTipo(f.relacion)) return null
  return {
    relacionId: f.relacion_id, usuarioId: f.usuario_id, relacion: f.relacion, nombre: texto(f.nombre), apellido: texto(f.apellido),
    genero: genero(f.genero), cuenta: f.cuenta === true, puedoEditar: f.puedo_editar === true, esNino: f.es_nino === true,
  }
}

function aEnviada(f: Fila): SolicitudEnviada | null {
  if (typeof f.id !== 'string' || !esTipo(f.tipo_relacion)) return null
  return {
    id: f.id, tipo: f.tipo_relacion, nombre: texto(f.nombre), apellido: texto(f.apellido), genero: genero(f.genero),
    espera: f.espera === 'persona' ? 'persona' : 'campus', creadoEn: texto(f.creado_en),
  }
}

function aRecibida(f: Fila): SolicitudRecibida | null {
  if (typeof f.id !== 'string' || !esTipo(f.relacion)) return null
  return { id: f.id, relacion: f.relacion, nombre: texto(f.nombre), apellido: texto(f.apellido), genero: genero(f.genero), creadoEn: texto(f.creado_en) }
}

/** The caller's Mi familia; null when the RPC answered an error. */
export function parseMiFamilia(json: unknown): MiFamilia | null {
  if (!esObjeto(json) || json.ok !== true) return null
  return {
    familiares: presentes(filas(json.familiares).map(aFamiliar)),
    enviadas: presentes(filas(json.enviadas).map(aEnviada)),
    recibidas: presentes(filas(json.recibidas).map(aRecibida)),
  }
}

export const nombreCompleto = (p: { readonly nombre: string; readonly apellido: string }): string => `${p.nombre} ${p.apellido}`.trim()
const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? ''

/** "Lisbeth Rodríguez dice que es tu hermana" (relacion is what the solicitante is to me). */
export function textoRecibida(r: SolicitudRecibida): string {
  return `${nombreCompleto(r)} dice que es tu ${etiquetaRelacion(r.relacion, r.genero).toLowerCase()}`
}

export function textoEspera(e: SolicitudEnviada): string {
  return e.espera === 'persona' ? `Esperando que ${primerNombre(e.nombre)} confirme` : 'Esperando la revisión de tu campus'
}

/** The second line of a confirmed relative; null when there is nothing to add. */
export function notaFamiliar(f: Familiar): string | null {
  if (f.esNino) return 'Menor de 13 años · está en Mis hijos'
  if (f.puedoEditar) return 'Ficha creada por ti · solo tú y tu campus la editan'
  return null
}

// ── familia_buscar ──

export const MIN_LETRAS_BUSQUEDA = 3
const MAX_RESULTADOS = 8

export interface CandidatoFamilia {
  readonly token: string
  readonly nombres: string
  readonly primerApellido: string
  readonly inicialSegundoApellido: string
  readonly campus: string
  readonly homonimo: boolean
}

export function parseCandidatos(json: unknown): CandidatoFamilia[] {
  if (!esObjeto(json) || json.ok !== true) return []
  return presentes(
    filas(json.resultados).map((f) =>
      typeof f.token === 'string'
        ? {
            token: f.token, nombres: texto(f.nombres), primerApellido: texto(f.primer_apellido),
            inicialSegundoApellido: texto(f.inicial_segundo_apellido), campus: texto(f.campus), homonimo: f.homonimo === true,
          }
        : null,
    ),
  ).slice(0, MAX_RESULTADOS)
}

/** First name(s), first surname and the initial of the second: never more. */
export function nombreCandidato(c: CandidatoFamilia): string {
  return [c.nombres, c.primerApellido, c.inicialSegundoApellido ? `${c.inicialSegundoApellido}.` : ''].filter(Boolean).join(' ')
}

export const letrasDe = (q: string): number => q.replace(/[^\p{L}]/gu, '').length

// ── Error codes ──

export const MENSAJES_FAMILIA = {
  BUSQUEDA_CORTA: 'Escribe al menos 3 letras del nombre.',
  LIMITE_BUSQUEDAS: 'Llegaste al límite de búsquedas de hoy. Inténtalo de nuevo mañana.',
  LIMITE_INTENTOS: 'Llegaste al límite de intentos de hoy. Si es tu familiar, agrégalo sin cuenta y tu campus lo revisa.',
  LIMITE_DIARIO: 'Ya enviaste muchas solicitudes hoy. Inténtalo de nuevo mañana.',
  VERIFICACION_REQUERIDA: 'Hay varias personas con ese nombre. Confirma un dato antes de enviar.',
  YA_SOLICITADO: 'Ya hay una solicitud pendiente con esta persona.',
  YA_RELACIONADOS: 'Esta persona ya está en tu familia.',
  YA_TIENE_CONYUGE: 'Ya hay un cónyuge registrado. Cada persona puede tener uno solo.',
  USAR_MIS_HIJOS: 'Los menores de 13 años se registran en Mis hijos.',
  DATOS_INVALIDOS: 'Revisa los datos: nombre, apellido y una fecha de nacimiento válida.',
  CAMPO_NO_PERMITIDO: 'Hay un dato que no se puede enviar. Recarga la página e inténtalo de nuevo.',
  SIN_CAMPUS: 'Tu ficha no tiene un campus principal. Pídele a tu líder que lo asigne.',
  NO_ENCONTRADO: 'No encontramos esa persona o solicitud. Recarga la página e inténtalo de nuevo.',
  TIPO_INVALIDO: 'Elige una relación de la lista.',
  YA_RESUELTO: 'Esta solicitud ya se resolvió.',
  SIN_SESION: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  SIN_FICHA: 'Tu cuenta todavía no tiene ficha. Pídele a tu líder que la cree.',
  PARAMETROS_INVALIDOS: 'Revisa el dato: día y mes, o los últimos 4 dígitos de la cédula.',
} as const

export type CodigoErrorFamilia = keyof typeof MENSAJES_FAMILIA
export const CODIGOS_ERROR_FAMILIA = Object.keys(MENSAJES_FAMILIA) as CodigoErrorFamilia[]
const GENERICO = 'No se pudo completar. Inténtalo de nuevo.'

export function mensajeFamilia(codigo: string | null | undefined): string {
  return codigo && codigo in MENSAJES_FAMILIA ? MENSAJES_FAMILIA[codigo as CodigoErrorFamilia] : GENERICO
}

/** The `codigo` of an RPC answer, or null. */
export function codigoDe(json: unknown): string | null {
  return esObjeto(json) && typeof json.codigo === 'string' ? json.codigo : null
}

// ── The "Agregar familiar" sheet ──

export type CaminoHoja = 'buscar' | 'sincuenta'
export interface EstadoHoja {
  readonly relacion: TipoFamilia | null
  readonly hijoMayor: boolean
  readonly camino: CaminoHoja | null
}
export type PasoHoja = 'relacion' | 'hijo' | 'camino' | CaminoHoja

/** Relation first; hijo/hija asks about the age; then the two paths. */
export function pasoHoja(e: EstadoHoja): PasoHoja {
  if (!e.relacion) return 'relacion'
  if (e.relacion === 'hijo' && !e.hijoMayor) return 'hijo'
  return e.camino ?? 'camino'
}

// ── Homonym verification ──

export interface FormVerificacion {
  readonly modo: 'fecha' | 'cedula'
  readonly dia: string
  readonly mes: string
  readonly ultimos4: string
}
export type DatoVerificacion = { readonly dia: number; readonly mes: number } | { readonly ultimos4: string }

const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function validarVerificacion(f: FormVerificacion): { ok: true; datos: DatoVerificacion } | { ok: false; error: string } {
  if (f.modo === 'cedula') {
    const u = f.ultimos4.trim()
    return /^\d{4}$/.test(u) ? { ok: true, datos: { ultimos4: u } } : { ok: false, error: 'Escribe los últimos 4 dígitos de su cédula.' }
  }
  const dia = Number(f.dia)
  const mes = Number(f.mes)
  const valido = Number.isInteger(dia) && Number.isInteger(mes) && mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_MES[mes - 1]
  return valido ? { ok: true, datos: { dia, mes } } : { ok: false, error: 'Elige un día y un mes que existan.' }
}

// ── A relative without an account ──

export interface FormSinCuenta {
  readonly nombre: string
  readonly apellido: string
  readonly fechaNacimiento: string
  readonly cedula: string
  readonly telefono: string
  readonly genero: '' | 'Masculino' | 'Femenino'
}
export type CampoSinCuenta = keyof FormSinCuenta
export const FORM_SIN_CUENTA_VACIO: FormSinCuenta = { nombre: '', apellido: '', fechaNacimiento: '', cedula: '', telefono: '', genero: '' }

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_CAMPO = 100

/** Under 13 on `hoy` (YYYY-MM-DD), the same cut as ninos_en_rango_edad. */
export function menorDe13(fecha: string, hoy: string): boolean {
  const m = FECHA_RE.exec(fecha)
  const h = FECHA_RE.exec(hoy)
  if (!m || !h) return false
  const corte = `${Number(h[1]) - 13}-${h[2]}-${h[3]}`
  return fecha > corte && fecha <= hoy
}

const fechaValida = (fecha: string): boolean => {
  const m = FECHA_RE.exec(fecha)
  if (!m) return false
  const d = new Date(`${fecha}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha
}

export function validarSinCuenta(f: FormSinCuenta, relacion: TipoFamilia, hoy: string): { errores: Partial<Record<CampoSinCuenta, string>>; menor: boolean } {
  const errores: Partial<Record<CampoSinCuenta, string>> = {}
  if (!f.nombre.trim()) errores.nombre = 'Escribe su nombre.'
  else if (f.nombre.trim().length > MAX_CAMPO) errores.nombre = 'El nombre es demasiado largo.'
  if (!f.apellido.trim()) errores.apellido = 'Escribe su apellido.'
  else if (f.apellido.trim().length > MAX_CAMPO) errores.apellido = 'El apellido es demasiado largo.'
  if (f.cedula.trim().length > MAX_CAMPO) errores.cedula = 'La cédula es demasiado larga.'
  if (f.telefono.trim().length > MAX_CAMPO) errores.telefono = 'El teléfono es demasiado largo.'

  let menor = false
  if (!f.fechaNacimiento) errores.fechaNacimiento = 'Escribe su fecha de nacimiento.'
  else if (!fechaValida(f.fechaNacimiento) || f.fechaNacimiento < '1900-01-01') errores.fechaNacimiento = 'Escribe una fecha de nacimiento válida.'
  else if (f.fechaNacimiento > hoy) errores.fechaNacimiento = 'La fecha de nacimiento no puede ser futura.'
  else if (menorDe13(f.fechaNacimiento, hoy)) {
    menor = true
    errores.fechaNacimiento = relacion === 'hijo'
      ? 'Tiene menos de 13 años: regístralo en Mis hijos.'
      : 'Tiene menos de 13 años: los niños se registran en Niños.'
  }
  return { errores, menor }
}

/** The payload of familia_solicitar_sin_cuenta: only the allowed, non-empty keys. */
export function datosSinCuenta(f: FormSinCuenta): Record<string, string> {
  const datos: Record<string, string> = { nombre: f.nombre.trim(), apellido: f.apellido.trim(), fecha_nacimiento: f.fechaNacimiento }
  if (f.cedula.trim()) datos.cedula = f.cedula.trim()
  if (f.telefono.trim()) datos.telefono = f.telefono.trim()
  if (f.genero) datos.genero = f.genero
  return datos
}

/** "No tiene cuenta" from an empty search: the first word is the name, the rest the surname. */
export function prellenarSinCuenta(q: string): { nombre: string; apellido: string } {
  const [nombre = '', ...resto] = q.trim().split(/\s+/).filter(Boolean)
  return { nombre, apellido: resto.join(' ') }
}
