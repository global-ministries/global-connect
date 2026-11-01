/**
 * Editar persona (S14 of odd/tasks/sistema-diseno-v2.md): the view model of
 * the form. Loads the stored person into flat values, says which fields
 * changed (decision 8), labels estado civil by género (decision 7), builds
 * the error summary and the payload for updateUser (decisions 5 and 13).
 */
import { normalizarCedula } from '@/lib/utils/cedula'
import { formatearTelefono, normalizarTelefono } from '@/lib/utils/telefono'

import { estadoDireccion, type CampoEdicion, type ValoresEdicion } from './editar-validacion'

/** The person as the edit page and /perfil load it (usuarios + direccion with its geography). */
export interface UsuarioEditable {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string | null
  readonly email: string | null
  readonly telefono: string | null
  readonly fecha_nacimiento: string | null
  readonly genero: string | null
  readonly estado_civil: string | null
  readonly ocupacion_id: string | null
  readonly profesion_id: string | null
  readonly foto_perfil_url?: string | null
  readonly direccion?: {
    readonly calle: string | null
    readonly barrio: string | null
    readonly codigo_postal: string | null
    readonly referencia: string | null
    readonly latitud: number | null
    readonly longitud: number | null
    readonly parroquia?: {
      readonly id: string
      readonly municipio?: { readonly id: string; readonly estado?: { readonly id: string; readonly pais?: { readonly id: string } } }
    }
  }
}

export const ESTADOS_CIVILES = ['Soltero', 'Casado', 'Divorciado', 'Viudo', 'No especificado'] as const

const texto = (v: string | null | undefined): string => v ?? ''

export function valoresDesdeUsuario(u: UsuarioEditable): ValoresEdicion {
  const d = u.direccion
  const parroquia = d?.parroquia
  const municipio = parroquia?.municipio
  const estado = municipio?.estado
  return {
    nombre: u.nombre ?? '',
    apellido: u.apellido ?? '',
    cedula: texto(u.cedula),
    fecha_nacimiento: texto(u.fecha_nacimiento).slice(0, 10),
    genero: u.genero === 'Masculino' || u.genero === 'Femenino' ? u.genero : '',
    estado_civil: (ESTADOS_CIVILES as readonly string[]).includes(u.estado_civil ?? '') ? (u.estado_civil as string) : 'No especificado',
    ocupacion_id: texto(u.ocupacion_id),
    profesion_id: texto(u.profesion_id),
    telefono: formatearTelefono(u.telefono),
    email: texto(u.email),
    pais_id: texto(estado?.pais?.id),
    estado_id: texto(estado?.id),
    municipio_id: texto(municipio?.id),
    parroquia_id: texto(parroquia?.id),
    calle: texto(d?.calle),
    barrio: texto(d?.barrio),
    codigo_postal: texto(d?.codigo_postal),
    referencia: texto(d?.referencia),
    lat: typeof d?.latitud === 'number' ? d.latitud : null,
    lng: typeof d?.longitud === 'number' ? d.longitud : null,
  }
}

const CAMPOS: readonly Exclude<CampoEdicion, 'ubicacion'>[] = [
  'nombre', 'apellido', 'cedula', 'fecha_nacimiento', 'genero', 'estado_civil', 'ocupacion_id', 'profesion_id',
  'telefono', 'email', 'pais_id', 'estado_id', 'municipio_id', 'parroquia_id', 'calle', 'barrio', 'codigo_postal', 'referencia',
]

function igual(campo: CampoEdicion, a: string, b: string): boolean {
  if (campo === 'telefono') return normalizarTelefono(a.trim()) === normalizarTelefono(b.trim())
  if (campo === 'cedula') return normalizarCedula(a.trim()) === normalizarCedula(b.trim())
  return a === b
}

/** The fields whose value differs from the loaded one; a phone or cédula written another way is the same. */
export function camposCambiados(base: ValoresEdicion, v: ValoresEdicion): CampoEdicion[] {
  const lista: CampoEdicion[] = CAMPOS.filter((k) => !igual(k, v[k], base[k]))
  if (v.lat !== base.lat || v.lng !== base.lng) lista.push('ubicacion')
  return lista
}

export interface CatalogosGeografia {
  readonly paises: readonly { id: string; nombre: string }[]
  readonly estados: readonly { id: string; nombre: string; pais_id: string }[]
  readonly municipios: readonly { id: string; nombre: string; estado_id: string }[]
  readonly parroquias: readonly { id: string; nombre: string; municipio_id: string }[]
}

/** The municipio, estado and país above a parroquia, so a suggested address fills the whole cascade. */
export function geografiaDeParroquia(
  parroquiaId: string,
  c: CatalogosGeografia,
): Partial<Pick<ValoresEdicion, 'pais_id' | 'estado_id' | 'municipio_id'>> {
  const parroquia = c.parroquias.find((p) => p.id === parroquiaId)
  const municipio = parroquia && c.municipios.find((m) => m.id === parroquia.municipio_id)
  const estado = municipio && c.estados.find((e) => e.id === municipio.estado_id)
  if (!municipio || !estado) return {}
  return { pais_id: estado.pais_id, estado_id: estado.id, municipio_id: municipio.id }
}

/** Decision 7: "Casada" for a woman; the stored value stays "Casado". */
export function etiquetaEstadoCivil(valor: string, genero: string): string {
  return genero === 'Femenino' && valor !== 'No especificado' ? valor.replace(/o$/, 'a') : valor
}

export function opcionesEstadoCivil(genero: string): { valor: string; etiqueta: string }[] {
  return ESTADOS_CIVILES.map((valor) => ({ valor, etiqueta: etiquetaEstadoCivil(valor, genero) }))
}

export const ETIQUETAS_CAMPO: Record<CampoEdicion, string> = {
  nombre: 'Nombre', apellido: 'Apellido', cedula: 'Cédula', fecha_nacimiento: 'Fecha de nacimiento', genero: 'Género',
  estado_civil: 'Estado civil', ocupacion_id: 'Ocupación', profesion_id: 'Profesión', telefono: 'Teléfono', email: 'Email',
  pais_id: 'País', estado_id: 'Estado', municipio_id: 'Municipio', parroquia_id: 'Parroquia', calle: 'Calle',
  barrio: 'Barrio o urbanización', codigo_postal: 'Código postal', referencia: 'Referencia', ubicacion: 'Ubicación en el mapa',
}

/** One summary entry per error, in field order: "Apellido: El apellido debe…" (no final period). */
export function resumenErrores(errores: Partial<Record<CampoEdicion, string>>): { campo: CampoEdicion; texto: string }[] {
  return (Object.keys(ETIQUETAS_CAMPO) as CampoEdicion[])
    .filter((k) => errores[k])
    .map((campo) => ({ campo, texto: `${ETIQUETAS_CAMPO[campo]}: ${(errores[campo] as string).replace(/\.$/, '')}` }))
}

export interface DatosGuardarPersona {
  nombre: string
  apellido: string
  cedula?: string
  email?: string
  telefono?: string
  fecha_nacimiento?: string
  estado_civil: 'Soltero' | 'Casado' | 'Divorciado' | 'Viudo' | 'No especificado'
  genero: 'Masculino' | 'Femenino' | 'Otro'
  ocupacion_id?: string
  profesion_id?: string
  direccion?: {
    calle: string
    barrio?: string
    codigo_postal?: string
    referencia?: string
    pais_id?: string
    estado_id?: string
    municipio_id?: string
    parroquia_id?: string
    lat?: number
    lng?: number
  }
}

const opcional = (v: string): string | undefined => (v === '' ? undefined : v)

/** The updateUser payload: canonical cédula and phone, no familia (decision 13), no empty address (decision 5). */
export function datosParaGuardar(v: ValoresEdicion): DatosGuardarPersona {
  const telefono = v.telefono.trim()
  const cedula = v.cedula.trim()
  return {
    nombre: v.nombre.trim(),
    apellido: v.apellido.trim(),
    cedula: cedula === '' ? '' : (normalizarCedula(cedula) ?? cedula),
    email: v.email.trim(),
    telefono: telefono === '' ? '' : (normalizarTelefono(telefono) ?? telefono),
    fecha_nacimiento: v.fecha_nacimiento,
    estado_civil: v.estado_civil as DatosGuardarPersona['estado_civil'],
    // The form only saves once a género is chosen (decision 12).
    genero: v.genero === '' ? 'Otro' : v.genero,
    ocupacion_id: opcional(v.ocupacion_id),
    profesion_id: opcional(v.profesion_id),
    direccion:
      estadoDireccion(v) === 'vacia'
        ? undefined
        : {
            calle: v.calle.trim(),
            barrio: v.barrio.trim(),
            codigo_postal: v.codigo_postal.trim(),
            referencia: v.referencia.trim(),
            pais_id: opcional(v.pais_id),
            estado_id: opcional(v.estado_id),
            municipio_id: opcional(v.municipio_id),
            parroquia_id: opcional(v.parroquia_id),
            lat: v.lat ?? undefined,
            lng: v.lng ?? undefined,
          },
  }
}
