/**
 * The editable texts of the talleres notices, app side (R4b of
 * odd/tasks/talleres-rediseno.md, S10 S11; design/talleres-avisos 01–04).
 * The contract is 20261113140000_talleres_avisos_textos.sql:
 *
 * - `talleres_aviso_variables()` is THE list of variables per kind and of
 *   those allowed in the subject. The app reads it (`parseVariablesAvisos`)
 *   for the chips and the client validation; it is never written here.
 * - `validarTextoAviso` mirrors the checks of `talleres_aviso_texto_guardar`
 *   (same normalization, same codes) so the editor can disable «Guardar»
 *   before the server says no; the server stays the authority.
 * - `renderTextoAviso` mirrors `talleres_aviso_texto_render` (a line with a
 *   missing value does not go out, no doubled period, blank-line runs
 *   collapse) for the preview and «Enviarme una prueba».
 *
 * What lives only here is presentation: the default text of each kind as a
 * template (the same words the SQL builders write today), its automatic
 * title, button and data rows, a description and a sample value per
 * variable, and the Spanish «tú» messages of every error.
 */
import type { TipoAvisoTaller } from './avisos-catalogo'

export type TipoAvisoEditable = Exclude<TipoAvisoTaller, 'taller_cambio_fecha'>

export interface DefinicionVariables {
  /** Every variable the kind accepts, in the database's order. */
  readonly variables: readonly string[]
  /** The ones that always have a value: the only ones allowed in the subject. */
  readonly asunto: readonly string[]
}

export type VariablesAvisos = Readonly<Record<string, DefinicionVariables>>

export interface TextoAvisoGuardado {
  readonly tipo: string
  /** A plantilla clase (recordatorio_clase only); null = the general text. */
  readonly claseId: string | null
  readonly asunto: string
  readonly mensaje: string
  readonly editadoPor: string | null
  readonly editadoEn: string | null
}

export const MAX_ASUNTO = 200
export const MAX_MENSAJE = 1000

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === 'string' && x !== '') : []
}

function textoNoVacio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

/** The reply of `talleres_aviso_variables()`. */
export function parseVariablesAvisos(data: unknown): VariablesAvisos {
  const raiz = objeto(data) ?? {}
  const salida: Record<string, DefinicionVariables> = {}
  for (const [tipo, bruto] of Object.entries(raiz)) {
    const def = objeto(bruto)
    if (!def) continue
    salida[tipo] = { variables: textos(def.variables), asunto: textos(def.asunto) }
  }
  return salida
}

interface RespuestaRpc {
  readonly data: unknown
  readonly error: { readonly message?: string; readonly code?: string } | null
}

export interface ClienteVariablesAvisos {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
}

/** null when the call failed (the editor cannot validate, so it does not open). */
export async function cargarVariablesAvisos(client: ClienteVariablesAvisos): Promise<VariablesAvisos | null> {
  const { data, error } = await client.rpc('talleres_aviso_variables')
  if (error) return null
  return parseVariablesAvisos(data)
}

/** The "textos" of `talleres_avisos_panel`. */
export function parseTextosAvisos(data: unknown): TextoAvisoGuardado[] {
  if (!Array.isArray(data)) return []
  const salida: TextoAvisoGuardado[] = []
  for (const bruto of data) {
    const fila = objeto(bruto)
    if (!fila) continue
    const tipo = textoNoVacio(fila.tipo)
    const asunto = textoNoVacio(fila.asunto)
    const mensaje = textoNoVacio(fila.mensaje)
    if (!tipo || !asunto || !mensaje) continue
    salida.push({
      tipo,
      claseId: textoNoVacio(fila.clase_id),
      asunto,
      mensaje,
      editadoPor: textoNoVacio(fila.editado_por),
      editadoEn: textoNoVacio(fila.editado_en),
    })
  }
  return salida
}

// ─── Normalization and validation (talleres_aviso_texto_guardar) ───

const VARIABLE = /\{([^{}]*)\}/g

/** Characters as Postgres counts them (code points, not UTF-16 units). */
export function largo(texto: string): number {
  return Array.from(texto).length
}

export function normalizarAsunto(asunto: string): string {
  return asunto.replace(/\s+/g, ' ').trim()
}

export function normalizarMensaje(mensaje: string): string {
  return mensaje.replace(/\r\n?/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '')
}

function variablesDe(texto: string): string[] {
  return Array.from(texto.matchAll(VARIABLE), (m) => m[1])
}

function unicas(lista: readonly string[]): string[] {
  return Array.from(new Set(lista))
}

export type CodigoErrorTexto =
  | 'ASUNTO_VACIO'
  | 'ASUNTO_DEMASIADO_LARGO'
  | 'MENSAJE_VACIO'
  | 'MENSAJE_DEMASIADO_LARGO'
  | 'VARIABLE_DESCONOCIDA'
  | 'VARIABLE_NO_PERMITIDA_EN_ASUNTO'
  | 'LLAVE_SIN_CERRAR'

export interface ErrorTexto {
  readonly codigo: CodigoErrorTexto
  /** Without braces, in order of first appearance (subject first). */
  readonly variables?: readonly string[]
}

/**
 * Every problem of a draft at once (the server stops at the first one):
 * empty or too long subject/message, unknown variables, variables that can
 * be missing used in the subject, and an unpaired brace.
 */
export function validarTextoAviso(
  borrador: { readonly asunto: string; readonly mensaje: string },
  definicion: DefinicionVariables,
): ErrorTexto[] {
  const asunto = normalizarAsunto(borrador.asunto)
  const mensaje = normalizarMensaje(borrador.mensaje)
  const errores: ErrorTexto[] = []

  if (asunto === '') errores.push({ codigo: 'ASUNTO_VACIO' })
  else if (largo(asunto) > MAX_ASUNTO) errores.push({ codigo: 'ASUNTO_DEMASIADO_LARGO' })
  if (mensaje === '') errores.push({ codigo: 'MENSAJE_VACIO' })
  else if (largo(mensaje) > MAX_MENSAJE) errores.push({ codigo: 'MENSAJE_DEMASIADO_LARGO' })

  const enAsunto = unicas(variablesDe(asunto))
  const desconocidas = unicas([...enAsunto, ...variablesDe(mensaje)]).filter((v) => !definicion.variables.includes(v))
  if (desconocidas.length > 0) errores.push({ codigo: 'VARIABLE_DESCONOCIDA', variables: desconocidas })

  const noPermitidas = enAsunto.filter((v) => definicion.variables.includes(v) && !definicion.asunto.includes(v))
  if (noPermitidas.length > 0) errores.push({ codigo: 'VARIABLE_NO_PERMITIDA_EN_ASUNTO', variables: noPermitidas })

  if (/[{}]/.test(asunto.replace(VARIABLE, '')) || /[{}]/.test(mensaje.replace(VARIABLE, ''))) {
    errores.push({ codigo: 'LLAVE_SIN_CERRAR' })
  }
  return errores
}

/** Whether an error belongs to the subject field (for aria-invalid). */
export function errorDelAsunto(error: ErrorTexto, asunto: string): boolean {
  if (error.codigo === 'ASUNTO_VACIO' || error.codigo === 'ASUNTO_DEMASIADO_LARGO' || error.codigo === 'VARIABLE_NO_PERMITIDA_EN_ASUNTO') return true
  if (error.codigo === 'VARIABLE_DESCONOCIDA') return (error.variables ?? []).some((v) => asunto.includes(`{${v}}`))
  if (error.codigo === 'LLAVE_SIN_CERRAR') return /[{}]/.test(asunto.replace(VARIABLE, ''))
  return false
}

/** Whether an error belongs to the message field (for aria-invalid). */
export function errorDelMensaje(error: ErrorTexto, mensaje: string): boolean {
  if (error.codigo === 'MENSAJE_VACIO' || error.codigo === 'MENSAJE_DEMASIADO_LARGO') return true
  if (error.codigo === 'VARIABLE_DESCONOCIDA') return (error.variables ?? []).some((v) => mensaje.includes(`{${v}}`))
  if (error.codigo === 'LLAVE_SIN_CERRAR') return /[{}]/.test(mensaje.replace(VARIABLE, ''))
  return false
}

// ─── Messages («tú») ───

const POR_QUE: Readonly<Record<string, string>> = {
  grupo: 'El grupo se conoce al asignarlo; lo avisa «Grupo asignado».',
  facilitadores: 'Quién facilita se sabe al asignar grupo; lo avisa «Grupo asignado».',
  clase: 'El nombre de la clase solo existe en «Recordatorio de clase».',
  numero: 'El número de la clase solo existe en «Recordatorio de clase».',
}

const llaves = (variables: readonly string[]) => variables.map((v) => `{${v}}`).join(', ')

const MENSAJES_FIJOS: Readonly<Record<string, string>> = {
  ASUNTO_VACIO: 'El asunto no puede quedar vacío.',
  ASUNTO_DEMASIADO_LARGO: `El asunto supera los ${MAX_ASUNTO} caracteres.`,
  MENSAJE_VACIO: 'El mensaje no puede quedar vacío.',
  MENSAJE_DEMASIADO_LARGO: `El mensaje supera los ${MAX_MENSAJE} caracteres.`,
  LLAVE_SIN_CERRAR: 'Hay una llave { sin cerrar.',
  AVISO_NO_EDITABLE: 'Ese aviso no se puede editar.',
  CLASE_SOLO_EN_RECORDATORIO: 'Solo el recordatorio de clase puede tener un texto por clase.',
  CLASE_INVALIDA: 'Esa clase ya no está en la plantilla del taller. Recarga la página.',
}

function noPermitidaEnAsunto(lista: string, varias: boolean): string {
  return `El asunto no puede usar ${lista}: a veces ${varias ? 'faltan' : 'falta'} y el asunto quedaría cortado.`
}

/** The message of one client-side error; `nombreAviso` is the kind's name («Aprobada»). */
export function mensajeErrorTexto(error: ErrorTexto, nombreAviso: string): string {
  const variables = error.variables ?? []
  if (error.codigo === 'VARIABLE_DESCONOCIDA') {
    if (variables.length === 1) {
      const [variable] = variables
      return `{${variable}} no es un dato de «${nombreAviso}». ${POR_QUE[variable] ?? 'Revisa cómo está escrito o elige uno de la lista.'}`
    }
    return `${llaves(variables)} no son datos de «${nombreAviso}». Revisa cómo están escritos o elige uno de la lista.`
  }
  if (error.codigo === 'VARIABLE_NO_PERMITIDA_EN_ASUNTO') return noPermitidaEnAsunto(llaves(variables), variables.length > 1)
  return MENSAJES_FIJOS[error.codigo]
}

export const MENSAJE_SIN_PERMISO = 'Solo la coordinación o la dirección del taller puede cambiar el texto de sus avisos.'

/** A save/restore RPC error («tú»). */
export function mensajeErrorServidor(
  error: { readonly code?: string; readonly message?: string },
  porDefecto = 'No se pudo guardar. Inténtalo de nuevo.',
): string {
  if (error.code === '42501') return MENSAJE_SIN_PERMISO
  if (error.code === 'P0002') return 'No encontramos este taller.'
  const bruto = (error.message ?? '').trim()
  const dosPuntos = bruto.indexOf(':')
  const codigo = dosPuntos === -1 ? bruto : bruto.slice(0, dosPuntos)
  const detalle = dosPuntos === -1 ? '' : bruto.slice(dosPuntos + 1).trim()
  if (!/^[A-Z_]+$/.test(codigo)) return porDefecto
  const varias = (detalle.match(/\{/g) ?? []).length > 1
  if (codigo === 'VARIABLE_DESCONOCIDA' && detalle) {
    return varias
      ? `${detalle} no son datos de este aviso. Quítalos o elige uno de la lista.`
      : `${detalle} no es un dato de este aviso. Quítalo o elige uno de la lista.`
  }
  if (codigo === 'VARIABLE_NO_PERMITIDA_EN_ASUNTO' && detalle) return noPermitidaEnAsunto(detalle, varias)
  return MENSAJES_FIJOS[codigo] ?? porDefecto
}

/** «Quitar {x}»: removes every {x} and tidies what it leaves («grupo: .» → «grupo.»). */
export function quitarVariable(texto: string, variable: string): string {
  return texto
    .split(`{${variable}}`)
    .join('')
    .split('\n')
    .map((linea) =>
      linea
        .replace(/[ \t]*:[ \t]*\./g, '.')
        .replace(/[ \t]+([.,])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+$/, ''),
    )
    .join('\n')
}

// ─── Render (talleres_aviso_texto_render) ───

export type DatosAviso = Readonly<Record<string, string | null | undefined>>

export interface Segmento {
  readonly tipo: 'texto' | 'valor' | 'malo'
  readonly texto: string
}

function valorDe(datos: DatosAviso, variable: string): string | null {
  const valor = datos[variable]
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** One line: text, values and (preview only) unknown variables; values are never scanned again. */
function segmentosDe(linea: string, datos: DatosAviso, conocidas: readonly string[] | null): Segmento[] {
  const segmentos: Segmento[] = []
  const agregarTexto = (texto: string) => {
    if (texto !== '') segmentos.push({ tipo: 'texto', texto })
  }
  let resto = linea
  for (;;) {
    const m = /\{([^{}]*)\}/.exec(resto)
    if (!m) break
    agregarTexto(resto.slice(0, m.index))
    resto = resto.slice(m.index + m[0].length)
    const variable = m[1]
    const valor = conocidas && !conocidas.includes(variable) ? null : valorDe(datos, variable)
    if (valor === null) {
      segmentos.push({ tipo: 'malo', texto: m[0] })
      continue
    }
    segmentos.push({ tipo: 'valor', texto: valor })
    if (valor.endsWith('.') && resto.startsWith('.')) resto = resto.slice(1)
  }
  agregarTexto(resto)
  return segmentos
}

function lineaSale(linea: string, datos: DatosAviso, conocidas: readonly string[] | null): boolean {
  return variablesDe(linea).every((v) => (conocidas && !conocidas.includes(v)) || valorDe(datos, v) !== null)
}

/** The rendered text, exactly as the database writes it. */
export function renderTextoAviso(plantilla: string, datos: DatosAviso): string {
  const lineas: string[] = []
  for (const linea of plantilla.replace(/\r\n?/g, '\n').split('\n')) {
    if (linea.replace(/[ \t]/g, '') === '') {
      lineas.push('')
      continue
    }
    if (variablesDe(linea).some((v) => valorDe(datos, v) === null)) continue
    lineas.push(segmentosDe(linea, datos, null).map((s) => s.texto).join(''))
  }
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '')
}

export interface RenderPrevio {
  /** Paragraphs → lines → segments. */
  readonly parrafos: readonly (readonly (readonly Segmento[])[])[]
  /** Lines that do not go out because a known variable has no value. */
  readonly caidas: number
}

/**
 * The editor's preview: like the database, but an unknown variable stays
 * visible (marked) instead of dropping its line, so the error shows where
 * it is.
 */
export function renderPrevio(plantilla: string, datos: DatosAviso, conocidas: readonly string[]): RenderPrevio {
  const parrafos: Segmento[][][] = []
  let actual: Segmento[][] = []
  let caidas = 0
  for (const linea of plantilla.replace(/\r\n?/g, '\n').split('\n')) {
    if (linea.replace(/[ \t]/g, '') === '') {
      if (actual.length > 0) parrafos.push(actual)
      actual = []
      continue
    }
    if (!lineaSale(linea, datos, conocidas)) {
      caidas += 1
      continue
    }
    actual.push(segmentosDe(linea, datos, conocidas))
  }
  if (actual.length > 0) parrafos.push(actual)
  return { parrafos, caidas }
}

/** A rendered subject: one line. */
export function renderAsunto(plantilla: string, datos: DatosAviso): string {
  return renderTextoAviso(plantilla, datos).replace(/\s+/g, ' ').trim()
}

// ─── Defaults, automatic parts and sample data ───

export interface PlantillaAviso {
  readonly asunto: string
  readonly mensaje: string
  /** The automatic title of the email and the bell (not editable). */
  readonly titulo: string
  /** The automatic button label; null = no button. */
  readonly cta: string | null
  /** The automatic data rows under the text (label, template). */
  readonly ficha: readonly (readonly [string, string])[]
}

/** The default text of each kind: the words the SQL builders write today, as a template. */
export const TEXTOS_PREDETERMINADOS: Readonly<Record<TipoAvisoEditable, PlantillaAviso>> = {
  inscripcion_recibida: {
    asunto: 'Recibimos tu solicitud para {taller}',
    mensaje:
      'Recibimos tu inscripción en {taller}. La coordinación revisa cada inscripción y te avisa en unos días.\nEmpieza el {fecha} a las {hora}.\nLugar: {lugar}\nIndicaciones: {indicaciones}',
    titulo: 'Recibimos tu solicitud',
    cta: 'Ver mi inscripción',
    ficha: [['Taller', '{edicion}'], ['Estado', 'Esperando aprobación'], ['Empieza', '{fecha} · {hora}'], ['Lugar', '{lugar}'], ['Indicaciones', '{indicaciones}']],
  },
  inscripcion_aprobada: {
    asunto: 'Aprobamos tu inscripción en {taller}',
    mensaje:
      'Tienes tu lugar en {taller}.\nEmpieza el {fecha} a las {hora}.\nLugar: {lugar}\nIndicaciones: {indicaciones}\nPronto te avisamos tu grupo y quién lo facilita.',
    titulo: 'Aprobamos tu inscripción',
    cta: 'Ver mi taller',
    ficha: [['Taller', '{edicion}'], ['Empieza', '{fecha} · {hora}'], ['Lugar', '{lugar}'], ['Indicaciones', '{indicaciones}']],
  },
  inscripcion_rechazada: {
    asunto: 'Tu inscripción en {taller} no fue aprobada',
    mensaje: 'No pudimos aprobar tu inscripción en {taller}.\n{mensaje_no_aprobado}\nSi tienes dudas, habla con la coordinación del taller.',
    titulo: 'Tu inscripción no fue aprobada',
    cta: null,
    ficha: [],
  },
  grupo_asignado: {
    asunto: 'Tu grupo de {taller}: {grupo}',
    mensaje: 'Ya tienes grupo en {taller}: {grupo}.\nFacilita {facilitadores}.\nEmpieza el {fecha} · {hora} · {lugar}.\nIndicaciones: {indicaciones}',
    titulo: 'Tu grupo y quién lo facilita',
    cta: 'Ver mi taller',
    ficha: [['Grupo', '{grupo}'], ['Facilita', '{facilitadores}'], ['Empieza', '{fecha} · {hora}'], ['Lugar', '{lugar}'], ['Indicaciones', '{indicaciones}']],
  },
  recordatorio_clase: {
    asunto: 'Mañana es tu clase de {taller}',
    mensaje: 'Clase {numero}: {clase} de {taller} · {fecha} · {hora} · {lugar}.\nFacilita {facilitadores}.\nIndicaciones: {indicaciones}',
    titulo: 'Mañana es tu clase',
    cta: 'Ver mi taller',
    ficha: [['Cuándo', '{fecha} · {hora}'], ['Dónde', '{lugar}'], ['Facilita', '{facilitadores}'], ['Indicaciones', '{indicaciones}']],
  },
  certificado_listo: {
    asunto: 'Completaste {taller}: tu certificado está listo',
    mensaje: 'Completaste {taller}. Descarga tu certificado o guárdalo en la app.',
    titulo: 'Tu certificado está listo',
    cta: 'Ver mi certificado',
    ficha: [['Taller', '{edicion}']],
  },
  lugar_disponible: {
    asunto: 'Se liberó un lugar en {taller}',
    mensaje: 'Se liberó un lugar en {taller}.\nEmpieza el {fecha}.\nAvisamos a todas las personas que esperaban: quien reserve primero se queda con el lugar.',
    titulo: 'Se liberó un lugar',
    cta: 'Reservar mi lugar',
    ficha: [['Taller', '{edicion}']],
  },
}

export function esTipoEditable(tipo: string): tipo is TipoAvisoEditable {
  return Object.prototype.hasOwnProperty.call(TEXTOS_PREDETERMINADOS, tipo)
}

/** What each variable means (chip title); a variable added later still shows its name. */
export const DESCRIPCION_VARIABLE: Readonly<Record<string, string>> = {
  nombre: 'Nombre de pila de la persona',
  taller: 'Nombre del taller',
  edicion: 'Nombre de la edición',
  fecha: 'Fecha de la primera clase',
  hora: 'Hora de la clase',
  lugar: 'Lugar de las clases',
  indicaciones: 'Indicaciones de la edición',
  grupo: 'Nombre del grupo',
  facilitadores: 'Quién facilita el grupo',
  numero: 'Número de la clase',
  clase: 'Nombre de la clase',
  mensaje_no_aprobado: 'Mensaje para la persona, escrito al no aprobar',
}

export function descripcionVariable(tipo: string, variable: string): string {
  if (variable === 'fecha' && tipo === 'recordatorio_clase') return 'Fecha de la clase'
  if (variable === 'fecha' && tipo === 'lugar_disponible') return 'Fecha de inicio de la edición'
  return DESCRIPCION_VARIABLE[variable] ?? variable
}

export interface OpcionesEjemplo {
  /** «Sin lugar ni indicaciones»: shows which lines do not go out. */
  readonly sinLugar?: boolean
  readonly clase?: { readonly numero: number; readonly tema: string } | null
}

/** Sample data for the preview and the test email (never a real person's data). */
export function datosEjemplo(tipo: string, tallerNombre: string, opciones: OpcionesEjemplo = {}): Record<string, string> {
  const datos: Record<string, string> = {
    nombre: 'Carolina',
    taller: tallerNombre,
    edicion: `${tallerNombre} · Octubre 2026`,
    fecha: tipo === 'recordatorio_clase' ? 'martes 8 de diciembre' : 'jueves 8 de octubre',
    hora: '7:00 p. m.',
    lugar: 'Salón 2',
    indicaciones: 'Trae tu Biblia y un cuaderno. Entra por la puerta lateral.',
    grupo: 'Jueves noche',
    facilitadores: 'Yusmary y Yelitza',
    numero: '3',
    clase: 'Mujer de propósito',
    mensaje_no_aprobado: 'El cupo de esta edición es para mujeres casadas.',
  }
  if (opciones.clase) {
    datos.numero = String(opciones.clase.numero)
    datos.clase = opciones.clase.tema
  }
  if (opciones.sinLugar) {
    datos.lugar = ''
    datos.indicaciones = ''
  }
  return datos
}

/** The automatic data rows with sample data; a row with a missing value does not go out. */
export function fichaEjemplo(plantilla: PlantillaAviso, datos: DatosAviso): (readonly [string, string])[] {
  const filas: (readonly [string, string])[] = []
  for (const [etiqueta, valor] of plantilla.ficha) {
    const texto = renderTextoAviso(valor, datos)
    if (texto !== '') filas.push([etiqueta, texto])
  }
  return filas
}

/** «4 nov» (Caracas time). */
export function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'America/Caracas' })
    .format(fecha)
    .replace(/\.$/, '')
}
