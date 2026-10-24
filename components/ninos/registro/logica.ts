/**
 * Public family pre-registration wizard (odd/tasks/ninos-registro-pasos.md R1):
 * the wizard state, the per-step validation and the request body. The body is
 * the same one the single-page form sent, so parsePreregistro and the API do
 * not change. Error keys are the DOM ids of the fields, so the container can
 * focus the first invalid one.
 */
import { hijoVacio, validarAutorizados, validarFamilia, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import { erroresPadrePreregistro } from '@/lib/platform/ninos/preregistro'

export const PASOS = [
  { paso: 1, titulo: 'Tus datos' },
  { paso: 2, titulo: 'Tus niños' },
  { paso: 3, titulo: 'Salud' },
  { paso: 4, titulo: 'Quién más retira' },
  { paso: 5, titulo: 'Tu cuenta' },
  { paso: 6, titulo: 'Revisar' },
] as const

export type Paso = (typeof PASOS)[number]['paso']

export const PASO_REVISAR: Paso = 6

export type PadreRegistro = { nombre: string; apellido: string; telefono: string; email: string; cedula: string }

/** A child as the wizard asks it: the health answers are explicit Sí/No. */
export type HijoRegistro = {
  nombre: string
  apellido: string
  fechaNacimiento: string
  genero: string
  tieneAlergias: boolean | null
  alergias: string
  tieneNecesidades: boolean | null
  necesidadesEspeciales: string
}

export type DatosRegistro = {
  campusId: string
  padre: PadreRegistro
  hijos: HijoRegistro[]
  autorizados: AutorizadoForm[]
}

/** Field id → message, in form order. */
export type Errores = Record<string, string>

export const idCampo = {
  campus: 'reg-campus',
  /** A step-level error that belongs to no single field. */
  paso: 'reg-paso-error',
  padre: (campo: keyof PadreRegistro) => `reg-${campo}`,
  hijo: (i: number, campo: 'nombre' | 'apellido' | 'nacimiento' | 'genero' | 'tiene-alergias' | 'alergias' | 'tiene-nee' | 'nee') =>
    `reg-nino-${i + 1}-${campo}`,
  autorizado: (i: number) => `reg-autorizado-${i + 1}-nombre`,
}

export function hijoRegistroVacio(apellido = ''): HijoRegistro {
  return {
    nombre: '',
    apellido,
    fechaNacimiento: '',
    genero: '',
    tieneAlergias: null,
    alergias: '',
    tieneNecesidades: null,
    necesidadesEspeciales: '',
  }
}

/** The staff-only fields stay as the old form sent them ("Sin indicar"); a "No" sends no text. */
export function aHijoForm(h: HijoRegistro): HijoForm {
  return {
    ...hijoVacio(),
    nombre: h.nombre,
    apellido: h.apellido,
    fechaNacimiento: h.fechaNacimiento,
    genero: h.genero,
    alergias: h.tieneAlergias ? h.alergias : '',
    necesidadesEspeciales: h.tieneNecesidades ? h.necesidadesEspeciales : '',
  }
}

/** The POST /api/ninos/preregistro body. */
export function cuerpoPreregistro(d: DatosRegistro, sitioWeb: string) {
  return { campusId: d.campusId, padre: d.padre, hijos: d.hijos.map(aHijoForm), autorizados: d.autorizados, sitioWeb }
}

function validarPadre(d: DatosRegistro, campusIds: readonly string[]): Errores {
  const e: Errores = {}
  if (!campusIds.includes(d.campusId)) e[idCampo.campus] = 'Elige tu campus.'
  const padre = erroresPadrePreregistro(d.padre)
  if (padre.nombre) e[idCampo.padre('nombre')] = padre.nombre
  if (padre.apellido) e[idCampo.padre('apellido')] = padre.apellido
  if (padre.telefono) e[idCampo.padre('telefono')] = padre.telefono
  return e
}

type ErroresHijo = { campos: Set<string>; otros: string[] }

/**
 * Which fields of one child the shared family validation rejects. Any message
 * it cannot place on a field is kept in `otros`, so it still blocks the step.
 */
function erroresHijo(h: HijoRegistro, i: number, hoy: string): ErroresHijo {
  const r = validarFamilia({ padre: { id: 'registro', nombre: '', apellido: '', telefono: '', cedula: '', genero: '' }, hijos: [aHijoForm(h)], autorizados: [] }, hoy)
  const res: ErroresHijo = { campos: new Set(), otros: [] }
  if (r.ok) return res
  for (const m of r.errores) {
    if (m.includes('el nombre')) res.campos.add('nombre')
    else if (m.includes('el apellido')) res.campos.add('apellido')
    else if (m.includes('fecha de nacimiento')) res.campos.add('nacimiento')
    else if (m.includes('el género')) res.campos.add('genero')
    // Validated alone, the child is always "Niño 1"; name it by its place in the wizard.
    else res.otros.push(m.replace(/^Niño \d+:/, `Niño ${i + 1}:`))
  }
  return res
}

const MENSAJES_HIJO: Record<string, string> = {
  nombre: 'Escribe su nombre.',
  apellido: 'Escribe su apellido.',
  nacimiento: 'Elige una fecha de nacimiento válida.',
  genero: 'Elige si es niño o niña.',
}

function validarHijos(d: DatosRegistro, hoy: string): Errores {
  const e: Errores = {}
  const otros: string[] = []
  d.hijos.forEach((h, i) => {
    const { campos, otros: delHijo } = erroresHijo(h, i, hoy)
    for (const campo of ['nombre', 'apellido', 'nacimiento', 'genero'] as const) {
      if (campos.has(campo)) e[idCampo.hijo(i, campo)] = MENSAJES_HIJO[campo]
    }
    otros.push(...delHijo)
  })
  if (otros.length > 0) e[idCampo.paso] = otros.join(' ')
  return e
}

function validarSalud(d: DatosRegistro): Errores {
  const e: Errores = {}
  d.hijos.forEach((h, i) => {
    if (h.tieneAlergias === null) e[idCampo.hijo(i, 'tiene-alergias')] = 'Elige Sí o No.'
    else if (h.tieneAlergias && !h.alergias.trim()) e[idCampo.hijo(i, 'alergias')] = 'Cuéntanos cuáles.'
    if (h.tieneNecesidades === null) e[idCampo.hijo(i, 'tiene-nee')] = 'Elige Sí o No.'
    else if (h.tieneNecesidades && !h.necesidadesEspeciales.trim()) e[idCampo.hijo(i, 'nee')] = 'Cuéntanos cuáles.'
  })
  return e
}

function validarAutorizadosPaso(d: DatosRegistro): Errores {
  const e: Errores = {}
  d.autorizados.forEach((a, i) => {
    if (validarAutorizados([a]).errores.length > 0) e[idCampo.autorizado(i)] = 'Escribe su nombre o quita esta persona.'
  })
  return e
}

function validarCuenta(d: DatosRegistro): Errores {
  const email = erroresPadrePreregistro(d.padre).email
  return email ? { [idCampo.padre('email')]: email } : {}
}

/** Only the fields of `paso`; the review step relies on the ones before it. */
export function validarPaso(paso: Paso, d: DatosRegistro, campusIds: readonly string[], hoy: string): Errores {
  switch (paso) {
    case 1:
      return validarPadre(d, campusIds)
    case 2:
      return validarHijos(d, hoy)
    case 3:
      return validarSalud(d)
    case 4:
      return validarAutorizadosPaso(d)
    case 5:
      return validarCuenta(d)
    default:
      return {}
  }
}

/** The first step with an error, for a final check before sending. */
export function primerPasoInvalido(d: DatosRegistro, campusIds: readonly string[], hoy: string): Paso | null {
  for (const { paso } of PASOS) {
    if (Object.keys(validarPaso(paso, d, campusIds, hoy)).length > 0) return paso
  }
  return null
}

export const autorizadoVacio = (): AutorizadoForm => ({ nombre: '', telefono: '', relacion: '' })

export const autorizadoEnBlanco = (a: AutorizadoForm) => !a.nombre.trim() && !a.telefono.trim() && !a.relacion.trim()
