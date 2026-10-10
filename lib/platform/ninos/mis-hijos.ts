/**
 * "Mis hijos" in Mi Perfil (odd/tasks/ninos-mis-hijos.md, M4): parses
 * ninos_mis_hijos(), builds the parent's payload for ninos_mis_hijos_guardar
 * (only the keys a parent may send: never the room or VIP) and maps its error
 * codes to Spanish. The RPCs enforce every rule again; this only gives the
 * parent early, readable errors.
 */
import {
  fichaPayload,
  parseGrado,
  validarAutorizados,
  validarEdicionNino,
  type AutorizadoForm,
  type AutorizadoPayload,
  type EdicionNinoPayload,
  type FichaPayload,
  type HijoForm,
} from './familia'
import type { AutorizadoEncontrado, HijoEncontrado } from './familias-vista'

/** Mirror of the SQL limits of ninos_mis_hijos_guardar. */
export const LIMITES_MIS_HIJOS = { autorizados: 6, texto: 500 } as const

/** Another linked parent or tutor: names only, never contact data. */
export type PadreVinculado = { nombre: string; apellido: string }

/** One of the logged-in parent's children, as ninos_mis_hijos() returns it. */
export type MiHijo = {
  id: string
  nombre: string
  apellido: string
  fecha_nacimiento: string | null
  genero: string | null
  edad: number | null
  tiene_ficha: boolean
  grado: number | null
  alergias: string | null
  necesidades_especiales: string | null
  habitos: string | null
  notas: string | null
  puede_comer: boolean | null
  cambio_panal: boolean | null
  autoriza_imagen: boolean | null
  escolarizado: boolean | null
  autorizados: AutorizadoEncontrado[]
  otros_padres: PadreVinculado[]
  /** False when the child has an own account: name, birth date and gender are theirs to change. */
  puede_editar_identidad: boolean
}

type Objeto = Record<string, unknown>

function esObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const siNo = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const numero = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export function parseMisHijos(data: unknown): MiHijo[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((h): h is Objeto => esObjeto(h) && typeof h.id === 'string')
    .map((h) => ({
      id: h.id as string,
      nombre: texto(h.nombre) ?? '',
      apellido: texto(h.apellido) ?? '',
      fecha_nacimiento: texto(h.fecha_nacimiento),
      genero: texto(h.genero),
      edad: numero(h.edad),
      tiene_ficha: h.tiene_ficha !== false,
      grado: numero(h.grado),
      alergias: texto(h.alergias),
      necesidades_especiales: texto(h.necesidades_especiales),
      habitos: texto(h.habitos),
      notas: texto(h.notas),
      puede_comer: siNo(h.puede_comer),
      cambio_panal: siNo(h.cambio_panal),
      autoriza_imagen: siNo(h.autoriza_imagen),
      escolarizado: siNo(h.escolarizado),
      autorizados: Array.isArray(h.autorizados)
        ? h.autorizados
            .filter((a): a is Objeto => esObjeto(a) && typeof a.nombre === 'string')
            .map((a) => ({ id: texto(a.id) ?? '', nombre: a.nombre as string, telefono: texto(a.telefono), relacion: texto(a.relacion) }))
        : [],
      otros_padres: Array.isArray(h.otros_padres)
        ? h.otros_padres
            .filter((p): p is Objeto => esObjeto(p) && typeof p.nombre === 'string')
            .map((p) => ({ nombre: p.nombre as string, apellido: texto(p.apellido) ?? '' }))
        : [],
      // Fail closed: identity is editable only when the RPC says so.
      puede_editar_identidad: h.puede_editar_identidad === true,
    }))
}

/** The child as EditarNinoForm expects it; the staff-only fields stay empty (a parent never sees them). */
export function miHijoAEncontrado(h: MiHijo): HijoEncontrado {
  return {
    id: h.id,
    nombre: h.nombre,
    apellido: h.apellido,
    fecha_nacimiento: h.fecha_nacimiento,
    genero: h.genero,
    grado: h.grado,
    alergias: h.alergias,
    necesidades_especiales: h.necesidades_especiales,
    habitos: h.habitos,
    notas: h.notas,
    puede_comer: h.puede_comer,
    cambio_panal: h.cambio_panal,
    autoriza_imagen: h.autoriza_imagen,
    escolarizado: h.escolarizado,
    salon_preferido_id: null,
    es_vip_desde: null,
    tiene_ficha: h.tiene_ficha,
    autorizados: h.autorizados,
  }
}

/** "7 años", "1 año", "Menos de 1 año"; '' when the birth date is unknown. */
export function textoEdad(edad: number | null): string {
  if (edad === null) return ''
  if (edad < 1) return 'Menos de 1 año'
  return edad === 1 ? '1 año' : `${edad} años`
}

/** "Juan Pérez", "Juan Pérez y Rosa Gil", "Juan Pérez, Rosa Gil y Ana Ruiz". */
export function textoOtrosPadres(padres: readonly PadreVinculado[]): string {
  const nombres = padres.map((p) => `${p.nombre} ${p.apellido}`.trim())
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

const MAX_RESUMEN = 80

/** The allergies for the card, cut at 80 characters; '' when there are none. */
export function resumenAlergias(alergias: string | null): string {
  const t = (alergias ?? '').trim()
  return t.length <= MAX_RESUMEN ? t : `${t.slice(0, MAX_RESUMEN - 1)}…`
}

type Identidad = Pick<EdicionNinoPayload, 'nombre' | 'apellido' | 'fecha_nacimiento' | 'genero'>

/** What a parent may send to ninos_mis_hijos_guardar (identity only when it is theirs to edit). */
export type PayloadMisHijos = Omit<FichaPayload, 'salon_preferido_id'> &
  Partial<Identidad> & { autorizados: AutorizadoPayload[] }

/** The ficha fields a parent keeps up to date: every field but the room. */
function fichaPadre(h: HijoForm): Omit<FichaPayload, 'salon_preferido_id'> {
  const f = fichaPayload(h)
  return {
    grado: f.grado,
    alergias: f.alergias,
    necesidades_especiales: f.necesidades_especiales,
    habitos: f.habitos,
    notas: f.notas,
    puede_comer: f.puede_comer,
    cambio_panal: f.cambio_panal,
    autoriza_imagen: f.autoriza_imagen,
    escolarizado: f.escolarizado,
  }
}

function algunTextoLargo(valores: ReadonlyArray<string | null | undefined>): boolean {
  return valores.some((v) => typeof v === 'string' && v.length > LIMITES_MIS_HIJOS.texto)
}

/**
 * Validates the parent's form: the name, birth date and gender only when
 * editable, the ficha fields a parent may change and the pickup list, with the
 * SQL limits (6 people, 500 characters per text).
 */
export function validarEdicionMisHijos(
  h: HijoForm,
  autorizados: readonly AutorizadoForm[],
  opciones: { identidadEditable: boolean },
  hoy: string = new Date().toISOString().slice(0, 10),
): { ok: true; payload: PayloadMisHijos } | { ok: false; errores: string[] } {
  const errores: string[] = []
  // The room is never the parent's: it cannot make the form invalid either.
  const edicion = opciones.identidadEditable ? validarEdicionNino({ ...h, salonPreferidoId: '' }, hoy) : null
  if (edicion && !edicion.ok) errores.push(...edicion.errores)
  if (!edicion && parseGrado(h.grado) === 'invalido') errores.push('El grado no es válido.')

  const aut = validarAutorizados(autorizados)
  errores.push(...aut.errores)
  if (aut.payload.length > LIMITES_MIS_HIJOS.autorizados) {
    errores.push(`Puedes indicar hasta ${LIMITES_MIS_HIJOS.autorizados} personas autorizadas.`)
  }

  const ficha = fichaPadre(h)
  const identidad: Partial<Identidad> =
    edicion && edicion.ok
      ? {
          nombre: edicion.payload.nombre,
          apellido: edicion.payload.apellido,
          fecha_nacimiento: edicion.payload.fecha_nacimiento,
          genero: edicion.payload.genero,
        }
      : {}
  const textos = [
    ficha.alergias,
    ficha.necesidades_especiales,
    ficha.habitos,
    ficha.notas,
    identidad.nombre,
    identidad.apellido,
    ...aut.payload.flatMap((a) => [a.nombre, a.telefono, a.relacion]),
  ]
  if (algunTextoLargo(textos)) errores.push(`Cada campo admite hasta ${LIMITES_MIS_HIJOS.texto} caracteres.`)

  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, payload: { ...identidad, ...ficha, autorizados: aut.payload } }
}

const MENSAJES: Record<string, string> = {
  sin_autoridad: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  nino_no_encontrado: 'No encontramos a este niño entre tus hijos. Recarga la página.',
  campo_no_permitido: 'Hay un dato que no puedes cambiar desde aquí.',
  limite_autorizados: `Puedes indicar hasta ${LIMITES_MIS_HIJOS.autorizados} personas autorizadas.`,
  texto_muy_largo: `Cada campo admite hasta ${LIMITES_MIS_HIJOS.texto} caracteres.`,
  edad_fuera_de_rango: 'Con esa fecha de nacimiento no estaría en Niños (solo menores de 13 años).',
  datos_invalidos: 'Revisa los datos: hay campos inválidos.',
}

/** Spanish copy for a ninos_mis_hijos_guardar error; the RPC raises a snake_case code as the message. */
export function mensajeDeErrorMisHijos(error: { code?: string; message?: string } | null): string {
  const clave = error?.message ?? ''
  if (MENSAJES[clave]) return MENSAJES[clave]
  if (error?.code === '42501') return 'No tienes permiso para hacer este cambio.'
  if (error?.code === '22023') return MENSAJES.datos_invalidos
  return 'No se pudo guardar. Intenta de nuevo.'
}
