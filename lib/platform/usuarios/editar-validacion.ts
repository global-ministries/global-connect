/**
 * Editar persona (S14 of odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/usuarios/05-editar-escritorio.html,
 * `validar`): the field rules. The form shows them while typing and
 * updateUser (lib/actions/user.actions.ts) applies the address rule again, so
 * both sides share this file. Errors block saving; notices (avisos) never do.
 */
import { esCedulaReconocible } from '@/lib/utils/cedula'
import { esTelefonoReconocible } from '@/lib/utils/telefono'

export interface ValoresEdicion {
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string
  /** YYYY-MM-DD or empty. */
  readonly fecha_nacimiento: string
  /** Empty until somebody chooses (a stored "Otro" loads empty, decision 12). */
  readonly genero: '' | 'Masculino' | 'Femenino'
  readonly estado_civil: string
  /** Empty = none. */
  readonly ocupacion_id: string
  readonly profesion_id: string
  readonly telefono: string
  readonly email: string
  readonly pais_id: string
  readonly estado_id: string
  readonly municipio_id: string
  /** Empty = "Sin parroquia". */
  readonly parroquia_id: string
  readonly calle: string
  readonly barrio: string
  readonly codigo_postal: string
  readonly referencia: string
  readonly lat: number | null
  readonly lng: number | null
}

/** A field with its own control (the map pin is `ubicacion`). */
export type CampoEdicion = Exclude<keyof ValoresEdicion, 'lat' | 'lng'> | 'ubicacion'

export interface AvisoCampo {
  /** Bold lead ("Revisar teléfono"). */
  readonly destacado?: string
  readonly texto: string
}

export interface ValidacionEdicion {
  readonly errores: Partial<Record<CampoEdicion, string>>
  readonly avisos: Partial<Record<CampoEdicion, AvisoCampo>>
}

export const MENSAJE_CALLE = 'Escribe la calle para guardar la dirección.'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const lleno = (valor: unknown): boolean => typeof valor === 'string' && valor.trim() !== '' && valor !== 'none'

/** The address fields that, once filled, make calle required (país alone does not). */
const OTROS_CAMPOS_DIRECCION = ['estado_id', 'municipio_id', 'parroquia_id', 'barrio', 'codigo_postal', 'referencia'] as const

export interface DireccionEntrante {
  readonly calle?: string | null
  readonly barrio?: string | null
  readonly codigo_postal?: string | null
  readonly referencia?: string | null
  readonly estado_id?: string | null
  readonly municipio_id?: string | null
  readonly parroquia_id?: string | null
}

/**
 * Decision 5: the address is optional as a whole. "vacia" = nothing to save,
 * "sin-calle" = another field is filled but calle is not, "completa" = calle.
 */
export function estadoDireccion(direccion: DireccionEntrante | null | undefined): 'vacia' | 'sin-calle' | 'completa' {
  if (!direccion) return 'vacia'
  if (lleno(direccion.calle)) return 'completa'
  return OTROS_CAMPOS_DIRECCION.some((k) => lleno(direccion[k])) ? 'sin-calle' : 'vacia'
}

export function validarEdicion(v: ValoresEdicion, hoy: string): ValidacionEdicion {
  const errores: Partial<Record<CampoEdicion, string>> = {}
  const avisos: Partial<Record<CampoEdicion, AvisoCampo>> = {}

  if (v.nombre.trim().length < 2) errores.nombre = 'El nombre debe tener al menos 2 caracteres.'
  if (v.apellido.trim().length < 2) errores.apellido = 'El apellido debe tener al menos 2 caracteres.'
  if (v.fecha_nacimiento && v.fecha_nacimiento > hoy) errores.fecha_nacimiento = 'La fecha de nacimiento no puede ser posterior a hoy.'
  if (!v.genero) errores.genero = 'Elige el género.'
  if (v.email.trim() && !EMAIL.test(v.email.trim())) errores.email = 'Escribe un email válido, como nombre@gmail.com.'
  if (estadoDireccion(v) === 'sin-calle') errores.calle = MENSAJE_CALLE

  if (v.cedula.trim() && !esCedulaReconocible(v.cedula)) {
    avisos.cedula = { texto: 'No parece una cédula venezolana (6 a 8 dígitos) ni extranjera (E y 6 a 9 dígitos). Se guardará tal cual.' }
  }
  const telefono = v.telefono.trim()
  if (telefono && !esTelefonoReconocible(telefono)) {
    avisos.telefono = {
      destacado: 'Revisar teléfono',
      texto: `«${telefono}» no parece un número venezolano, así que WhatsApp no funcionará. Si es extranjero, puedes guardarlo así.`,
    }
  }
  return { errores, avisos }
}
