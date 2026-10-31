/**
 * Estudiantes — "Agregar visitante" (artboard 02 of
 * design/estudiantes-asistencia; Q4, Q6, S7, L19): the short form prefilled
 * from the search, its validation, the `p_datos` of
 * estudiantes_visitante_crear, the possible-duplicates search and what a
 * search result allows.
 *
 * Transit / Inside Out: nombre, apellido, cédula (optional), año escolar (the
 * group's by default), sexo, teléfono and, when any of it is filled, a
 * representante (nombre, teléfono and sexo required: the database creates
 * that person too). The Living Room: no año and no representante; an optional
 * birth date instead of the age (the person keeps a date, not an age).
 */
import type { Json } from '@/lib/supabase/database.types'

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
}

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

export type CampoVisitante = 'nombre' | 'apellido' | 'genero' | 'telefono' | 'fechaNacimiento' | 'repNombre' | 'repTelefono' | 'repGenero'
export type ErroresVisitante = Partial<Record<CampoVisitante, string>>

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

const lleno = (texto: string): boolean => texto.trim() !== ''

function tieneRepresentante(r: RepresentanteFormulario): boolean {
  return [r.nombre, r.apellido, r.telefono, r.cedula].some(lleno)
}

/** The messages per field; an empty object when the form can be sent. */
export function validarVisitante(form: FormularioVisitante, experiencia: Experiencia, hoy: string): ErroresVisitante {
  const errores: ErroresVisitante = {}
  if (!lleno(form.nombre)) errores.nombre = 'Escribe el nombre.'
  if (!lleno(form.apellido)) errores.apellido = 'Escribe el apellido.'
  if (form.genero === '') errores.genero = 'Elige el sexo.'
  if (!lleno(form.telefono)) errores.telefono = 'Escribe el teléfono.'
  if (form.fechaNacimiento && form.fechaNacimiento > hoy) errores.fechaNacimiento = 'La fecha de nacimiento no puede ser futura.'
  if (experiencia !== 'the_living_room' && tieneRepresentante(form.representante)) {
    const r = form.representante
    if (!lleno(r.nombre)) errores.repNombre = 'Escribe el nombre del representante.'
    if (!lleno(r.telefono)) errores.repTelefono = 'Escribe el teléfono del representante.'
    if (r.genero === '') errores.repGenero = 'Elige el sexo del representante.'
  }
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
  if (experiencia !== 'the_living_room' && tieneRepresentante(form.representante)) {
    const r = form.representante
    const representante: Record<string, Json> = {}
    conTexto(representante, 'nombre', r.nombre)
    conTexto(representante, 'apellido', r.apellido)
    conTexto(representante, 'telefono', r.telefono)
    conTexto(representante, 'cedula', r.cedula)
    if (r.genero) representante.genero = r.genero
    representante.tipo = r.tipo
    datos.representante = representante
  }
  return datos
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
