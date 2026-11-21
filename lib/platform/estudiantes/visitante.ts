/**
 * Estudiantes — "Agregar visitante" (artboard 02 of
 * design/estudiantes-asistencia; Q4, Q6, S7, L19): the short form prefilled
 * from the search, its validation, the `p_datos` of
 * estudiantes_visitante_crear, the possible-duplicates search and what a
 * search result allows.
 *
 * Transit / Inside Out: nombre, apellido, cédula (optional), año escolar (the
 * group's by default), sexo, teléfono and an optional representante that is
 * searched first (S1 of odd/tasks/representante-buscador.md): a person picked
 * from the search is sent as `{ persona_id, tipo }`; «No está, registrarlo»
 * opens the typed fields and, when any of them is filled, nombre, teléfono
 * and sexo are required (the database creates that person too). The same
 * validation and payload serve «Agregar representante» on an existing member
 * (S2), where the typed fields are always required. The Living
 * Room: no año and no representante; an optional birth date instead of the
 * age (the person keeps a date, not an age).
 */
import type { Json } from '@/lib/supabase/database.types'

import { argumentosBusqueda } from './gestion-grupo'
import type { Experiencia } from './grupos-datos'

export type Genero = 'Femenino' | 'Masculino'
export type TipoRepresentante = 'padre' | 'tutor' | 'abuelo' | 'tio' | 'hermano' | 'otro_familiar'

export const OPCIONES_PARENTESCO: readonly { readonly valor: TipoRepresentante; readonly etiqueta: string }[] = [
  { valor: 'padre', etiqueta: 'Madre o padre' },
  { valor: 'tutor', etiqueta: 'Tutor o tutora' },
  { valor: 'abuelo', etiqueta: 'Abuela o abuelo' },
  { valor: 'tio', etiqueta: 'Tía o tío' },
  { valor: 'hermano', etiqueta: 'Hermana o hermano' },
  { valor: 'otro_familiar', etiqueta: 'Otro familiar' },
]

export interface RepresentanteFormulario {
  readonly nombre: string
  readonly apellido: string
  readonly telefono: string
  readonly cedula: string
  readonly genero: Genero | ''
  readonly tipo: TipoRepresentante
  /** The person picked from the search; absent while searching or typing. */
  readonly personaId?: string
  /** Their full name, shown with «Cambiar». */
  readonly personaNombre?: string
  /** `true` after «No está, registrarlo»: the typed fields are shown. */
  readonly nuevo?: boolean
}

/** The three states of the picker: search, a picked person, the typed fields. */
export type ModoRepresentante = 'buscar' | 'elegido' | 'nuevo'

export interface FormularioVisitante {
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string
  readonly telefono: string
  readonly genero: Genero | ''
  /** The año escolar number as text ("" without one); Transit / Inside Out. */
  readonly anio: string
  /** ISO date or ""; The Living Room. */
  readonly fechaNacimiento: string
  readonly representante: RepresentanteFormulario
}

export type CampoRepresentante = 'repNombre' | 'repTelefono' | 'repGenero'
export type CampoVisitante = 'nombre' | 'apellido' | 'genero' | 'telefono' | 'fechaNacimiento' | CampoRepresentante
export type ErroresVisitante = Partial<Record<CampoVisitante, string>>
export type ErroresRepresentante = Partial<Record<CampoRepresentante, string>>

/** A cédula ("V-31.455.102") or a phone: digits with an optional V / E / J and separators. */
const PARECE_NUMERO = /^[vej]?[\s.-]*\d[\d\s.-]*$/i
/** A Venezuelan phone: starts with 0 and has 10 or 11 digits. */
const PARECE_TELEFONO = /^0\d{9,10}$/

const capital = (palabra: string): string => palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1)

const REPRESENTANTE_VACIO: RepresentanteFormulario = { nombre: '', apellido: '', telefono: '', cedula: '', genero: '', tipo: 'padre' }

/** The form after "Crear nueva": what was typed in the search, the group's año, the sub-área's sexo. */
export function formularioInicial({
  consulta,
  experiencia,
  subarea,
  anio,
}: {
  readonly consulta: string
  readonly experiencia: Experiencia
  readonly subarea: string
  readonly anio: number | null
}): FormularioVisitante {
  const limpio = consulta.trim()
  let nombre = ''
  let apellido = ''
  let cedula = ''
  let telefono = ''
  if (PARECE_NUMERO.test(limpio)) {
    if (PARECE_TELEFONO.test(limpio.replace(/\D/g, '')) && !/^[vej]/i.test(limpio)) telefono = limpio
    else cedula = limpio
  } else if (limpio) {
    const [primero, ...resto] = limpio.split(/\s+/).map(capital)
    nombre = primero ?? ''
    apellido = resto.join(' ')
  }
  const sexo = subarea.toLocaleLowerCase('es')
  const genero: Genero | '' = sexo.includes('chicas') ? 'Femenino' : sexo.includes('chicos') ? 'Masculino' : ''
  return {
    nombre,
    apellido,
    cedula,
    telefono,
    genero,
    anio: experiencia === 'the_living_room' || anio === null ? '' : String(anio),
    fechaNacimiento: '',
    representante: REPRESENTANTE_VACIO,
  }
}

export function modoRepresentante(r: RepresentanteFormulario): ModoRepresentante {
  if (r.personaId) return 'elegido'
  return r.nuevo ? 'nuevo' : 'buscar'
}

/** Links a person from the search; the parentesco stays, anything typed goes. */
export function elegirRepresentante(r: RepresentanteFormulario, persona: { readonly personaId: string; readonly nombre: string }): RepresentanteFormulario {
  return { ...REPRESENTANTE_VACIO, tipo: r.tipo, personaId: persona.personaId, personaNombre: persona.nombre }
}

/** «Cambiar» / «Volver a buscar»: back to the search with only the parentesco. */
export function buscarRepresentante(r: RepresentanteFormulario): RepresentanteFormulario {
  return { ...REPRESENTANTE_VACIO, tipo: r.tipo }
}

/** «No está, registrarlo»: the empty typed fields with the parentesco. */
export function registrarRepresentante(r: RepresentanteFormulario): RepresentanteFormulario {
  return { ...REPRESENTANTE_VACIO, tipo: r.tipo, nuevo: true }
}

const lleno = (texto: string): boolean => texto.trim() !== ''

function tieneRepresentante(r: RepresentanteFormulario): boolean {
  return [r.nombre, r.apellido, r.telefono, r.cedula].some(lleno)
}

const ETIQUETA_COINCIDENCIA: Readonly<Record<string, string>> = { cedula: 'cédula', telefono: 'teléfono', nombre: 'nombre' }

/**
 * "Coincide por cédula": what matched, from the database's `coincide` when
 * given (estudiantes_buscar_personas returns it and buscarPersonas passes it
 * through as `coincide`), else what the search compared (a number is looked up as
 * cédula and teléfono, anything else as the full name; see argumentosBusqueda).
 */
export function textoCoincidencia(consulta: string, coincide?: readonly string[]): string {
  const partes = (coincide ?? []).map((c) => ETIQUETA_COINCIDENCIA[c]).filter((c): c is string => c !== undefined)
  if (partes.length > 0) return `Coincide por ${partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]}`
  const argumentos = argumentosBusqueda(consulta)
  return argumentos !== null && 'p_cedula' in argumentos ? 'Coincide por cédula o teléfono' : 'Coincide por nombre'
}

/** The messages per field; an empty object when the form can be sent. */
export function validarVisitante(form: FormularioVisitante, experiencia: Experiencia, hoy: string): ErroresVisitante {
  const errores: ErroresVisitante = {}
  if (!lleno(form.nombre)) errores.nombre = 'Escribe el nombre.'
  if (!lleno(form.apellido)) errores.apellido = 'Escribe el apellido.'
  if (form.genero === '') errores.genero = 'Elige el sexo.'
  if (!lleno(form.telefono)) errores.telefono = 'Escribe el teléfono.'
  if (form.fechaNacimiento && form.fechaNacimiento > hoy) errores.fechaNacimiento = 'La fecha de nacimiento no puede ser futura.'
  if (experiencia !== 'the_living_room') Object.assign(errores, validarRepresentante(form.representante))
  return errores
}

/**
 * The typed representante's messages: nombre, teléfono and sexo. A picked
 * person needs none. In the visitor form the representante is optional, so
 * nothing is asked until a field is filled; `obligatorio` (the member view's
 * «Agregar representante», S2) asks for them even when nothing was typed.
 */
export function validarRepresentante(r: RepresentanteFormulario, obligatorio = false): ErroresRepresentante {
  const errores: ErroresRepresentante = {}
  if (r.personaId || (!obligatorio && !tieneRepresentante(r))) return errores
  if (!lleno(r.nombre)) errores.repNombre = 'Escribe el nombre del representante.'
  if (!lleno(r.telefono)) errores.repTelefono = 'Escribe el teléfono del representante.'
  if (r.genero === '') errores.repGenero = 'Elige el sexo del representante.'
  return errores
}

function conTexto(destino: Record<string, Json>, clave: string, valor: string): void {
  const limpio = valor.trim()
  if (limpio) destino[clave] = limpio
}

/** `p_datos` of estudiantes_visitante_crear; empty fields are left out. */
export function datosVisitante(form: FormularioVisitante, experiencia: Experiencia, ignorarCoincidencias: boolean): Record<string, Json> {
  const datos: Record<string, Json> = {}
  conTexto(datos, 'nombre', form.nombre)
  conTexto(datos, 'apellido', form.apellido)
  if (form.genero) datos.genero = form.genero
  conTexto(datos, 'telefono', form.telefono)
  conTexto(datos, 'cedula', form.cedula)
  if (experiencia === 'the_living_room') {
    conTexto(datos, 'fecha_nacimiento', form.fechaNacimiento)
  } else {
    const anio = Number.parseInt(form.anio, 10)
    if (Number.isInteger(anio)) datos.anio = anio
  }
  if (ignorarCoincidencias) datos.ignorar_coincidencias = true
  const representante = experiencia === 'the_living_room' ? null : datosRepresentante(form.representante)
  if (representante) datos.representante = representante
  return datos
}

/**
 * The representante as the database takes it (`representante` of
 * estudiantes_visitante_crear, `p_representante` of
 * estudiantes_representante_agregar): `{ persona_id, tipo }` for a picked
 * person, else the typed fields without empty keys and the tipo; `null` when
 * nothing was picked or typed.
 */
export function datosRepresentante(r: RepresentanteFormulario): Record<string, Json> | null {
  if (r.personaId) return { persona_id: r.personaId, tipo: r.tipo }
  if (!tieneRepresentante(r)) return null
  const representante: Record<string, Json> = {}
  conTexto(representante, 'nombre', r.nombre)
  conTexto(representante, 'apellido', r.apellido)
  conTexto(representante, 'telefono', r.telefono)
  conTexto(representante, 'cedula', r.cedula)
  if (r.genero) representante.genero = r.genero
  representante.tipo = r.tipo
  return representante
}

/** «Patricia Ferrer»: the picked person's name or the typed nombre and apellido. */
export function nombreRepresentante(r: RepresentanteFormulario): string {
  if (r.personaId) return r.personaNombre ?? ''
  return `${r.nombre.trim()} ${r.apellido.trim()}`.trim()
}

export interface ArgumentosCoincidencias {
  readonly p_nombre: string
  readonly p_apellido: string
  readonly p_telefono?: string
}

/** The search behind "posibles_duplicados": the full name and the phone, as the database compared them. */
export function argumentosCoincidencias(form: Pick<FormularioVisitante, 'nombre' | 'apellido' | 'telefono'>): ArgumentosCoincidencias {
  const telefono = form.telefono.trim()
  return { p_nombre: form.nombre.trim(), p_apellido: form.apellido.trim(), ...(telefono ? { p_telefono: telefono } : {}) }
}

export type OpcionEncontrada =
  | { readonly tipo: 'en_lista'; readonly etiqueta: string }
  | { readonly tipo: 'otro_grupo'; readonly etiqueta: string }
  | { readonly tipo: 'agregable'; readonly etiqueta: string }

/** "Ya está en tu lista", "En 3er año · Chicas" (not addable here) or "Agregar". */
export function opcionEncontrada(persona: { readonly grupoId: string | null; readonly grupo: string | null; readonly enEsteGrupo: boolean }): OpcionEncontrada {
  if (persona.enEsteGrupo) return { tipo: 'en_lista', etiqueta: 'Ya está en tu lista' }
  if (persona.grupoId !== null) return { tipo: 'otro_grupo', etiqueta: `En ${persona.grupo ?? 'otro grupo'}` }
  return { tipo: 'agregable', etiqueta: 'Agregar' }
}
