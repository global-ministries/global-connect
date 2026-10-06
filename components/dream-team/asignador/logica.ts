/**
 * Dream Team — pure rules of the "Asignar servicio" side panel.
 *
 * The panel walks three steps (Persona → Equipo y rol → Turno) and only sends
 * anything on the last one. These helpers decide when a step is complete and
 * build the POST /api/dream-team/usuarios body, so the components stay thin
 * and the rules are testable without rendering.
 */
import type { TipoRepresentante } from '@/lib/platform/dream-team/alta-persona'

export type Paso = 1 | 2 | 3

export const PASOS: readonly { readonly paso: Paso; readonly titulo: string }[] = [
  { paso: 1, titulo: 'Persona' },
  { paso: 2, titulo: 'Equipo y rol' },
  { paso: 3, titulo: 'Turno' },
]

export interface RepresentanteElegido {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
}

/** Everything typed in "Registrar persona nueva". */
export interface DatosPersonaNueva {
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string
  readonly fechaNacimiento: string
  readonly genero: string
  readonly estadoCivil: string
  readonly telefono: string
  /** '' = sin dato, 'si' or 'no'. */
  readonly bautizado: string
  readonly fechaBautizo: string
  readonly tallaFranela: string
  readonly redesSociales: string
  readonly representante: RepresentanteElegido | null
  readonly tipoRepresentante: TipoRepresentante
}

export const DATOS_VACIOS: DatosPersonaNueva = {
  nombre: '',
  apellido: '',
  cedula: '',
  fechaNacimiento: '',
  genero: '',
  estadoCivil: 'Soltero',
  telefono: '',
  bautizado: '',
  fechaBautizo: '',
  tallaFranela: '',
  redesSociales: '',
  representante: null,
  tipoRepresentante: 'padre',
}

/** "Datos básicos" are complete: without a cedula the birth date is required (duplicate check). */
export function datosBasicosCompletos(d: DatosPersonaNueva): boolean {
  const sinCedula = d.cedula.trim() === ''
  return (
    d.nombre.trim() !== '' &&
    d.apellido.trim() !== '' &&
    d.genero !== '' &&
    d.estadoCivil !== '' &&
    (!sinCedula || d.fechaNacimiento !== '')
  )
}

/** Under 18 on `hoy` (YYYY-MM-DD dates). `false` without a valid birth date. */
export function esMenorDeEdad(fechaNacimiento: string, hoy: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaNacimiento)
  if (!m) return false
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let edad = hoy.getFullYear() - anio
  const antesDelCumple = hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)
  if (antesDelCumple) edad -= 1
  return edad >= 0 && edad < 18
}

/** The POST /api/dream-team/usuarios body (the single-transaction registration RPC). */
export function cuerpoAltaPersona(d: DatosPersonaNueva, equipoId: string, rolId: string): Record<string, unknown> {
  return {
    equipoId,
    rolId,
    nombre: d.nombre,
    apellido: d.apellido,
    cedula: d.cedula,
    fechaNacimiento: d.fechaNacimiento,
    genero: d.genero,
    estadoCivil: d.estadoCivil,
    telefono: d.telefono,
    bautizado: d.bautizado === '' ? null : d.bautizado === 'si',
    fechaBautizo: d.bautizado === 'si' ? d.fechaBautizo : '',
    tallaFranela: d.tallaFranela,
    redesSociales: d.redesSociales,
    representanteId: d.representante?.id ?? null,
    representanteTipo: d.representante ? d.tipoRepresentante : null,
  }
}

/** An equipo as the picker shows it: its path from the top ("Waumba Land › Desmontaje"). */
export interface EquipoElegible {
  readonly id: string
  readonly ruta: readonly string[]
}

const SEPARADOR = ' › '

/** Builds the path of an option: an explicit `ruta`, else the label split on "›" (dash indents dropped). */
export function rutaDeEquipo(opcion: { readonly etiqueta: string; readonly ruta?: readonly string[] }): string[] {
  if (opcion.ruta && opcion.ruta.length > 0) return [...opcion.ruta]
  return opcion.etiqueta
    .replace(/^[—–-]+\s*/, '')
    .split('›')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')
}

export function textoRuta(ruta: readonly string[]): string {
  return ruta.join(SEPARADOR)
}

/** Case- and accent-insensitive match of the query against the whole path. */
export function coincideRuta(ruta: readonly string[], query: string): boolean {
  const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = normalizar(query.trim())
  return q === '' || normalizar(textoRuta(ruta)).includes(q)
}
