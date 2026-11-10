/**
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — recover a missed clase.
 *
 * Pure helpers and the reads of the grupo page:
 *   - loadPermiteRecuperar: talleres.permite_recuperar_clases (the
 *     «Recuperar clases aparte» switch);
 *   - loadRecuperacionesGrupo / loadMarcasGrupo: the grupo's recoveries
 *     (taller_recuperaciones, RLS = whoever reads the grupo's attendance)
 *     and its attendance marks, both by sesión id;
 *   - progresoCertificado: per inscription, the clases attended (presente
 *     or recovered, one per clase — the same rule as
 *     talleres_cierre_resultados in 20261110220000) and how many are still
 *     missing for the certificate;
 *   - traducirErrorRecuperacion: the RPC's refusals in Spanish.
 *
 * Every read fails soft (empty / false): an environment without the
 * migration keeps the page exactly as it was, with no recovery controls.
 */

import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'

export const NOTA_RECUPERACION_MAX = 300

export interface RecuperacionClase {
  readonly id: string
  readonly sesionId: string
  readonly personaId: string
  /** YYYY-MM-DD */
  readonly fecha: string
  readonly dadaPor: string
  readonly nota: string | null
}

export interface MarcaGrupo {
  readonly sesionId: string
  readonly inscripcionId: string
  readonly estado: 'presente' | 'ausente' | 'no_aplica'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client, matches this feature's other loaders
type Cliente = any

function esFila(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** false when the column is missing or unreadable: no recovery control is offered. */
export async function loadPermiteRecuperar(client: Cliente, tallerId: string): Promise<boolean> {
  try {
    const { data, error } = await client
      .from('talleres')
      .select('permite_recuperar_clases')
      .eq('id', tallerId)
      .maybeSingle()
    if (error || !esFila(data)) return false
    return data.permite_recuperar_clases === true
  } catch {
    return false
  }
}

export function parseRecuperaciones(data: unknown): RecuperacionClase[] {
  if (!Array.isArray(data)) return []
  return data.filter(esFila).flatMap((r) => {
    if (
      typeof r.id !== 'string' ||
      typeof r.sesion_id !== 'string' ||
      typeof r.persona_id !== 'string' ||
      typeof r.fecha !== 'string' ||
      typeof r.dada_por !== 'string'
    ) {
      return []
    }
    return [
      {
        id: r.id,
        sesionId: r.sesion_id,
        personaId: r.persona_id,
        fecha: r.fecha.slice(0, 10),
        dadaPor: r.dada_por,
        nota: typeof r.nota === 'string' && r.nota.length > 0 ? r.nota : null,
      },
    ]
  })
}

export async function loadRecuperacionesGrupo(
  client: Cliente,
  sesionIds: readonly string[],
): Promise<RecuperacionClase[]> {
  if (sesionIds.length === 0) return []
  try {
    const { data, error } = await client
      .from('taller_recuperaciones')
      .select('id, sesion_id, persona_id, fecha, dada_por, nota')
      .in('sesion_id', sesionIds)
    if (error) return []
    return parseRecuperaciones(data)
  } catch {
    return []
  }
}

export async function loadMarcasGrupo(client: Cliente, sesionIds: readonly string[]): Promise<MarcaGrupo[]> {
  if (sesionIds.length === 0) return []
  try {
    const { data, error } = await client
      .from('taller_asistencias')
      .select('sesion_id, inscripcion_id, estado')
      .in('sesion_id', sesionIds)
    if (error || !Array.isArray(data)) return []
    return data.filter(esFila).flatMap((m) => {
      if (
        typeof m.sesion_id !== 'string' ||
        typeof m.inscripcion_id !== 'string' ||
        (m.estado !== 'presente' && m.estado !== 'ausente' && m.estado !== 'no_aplica')
      ) {
        return []
      }
      return [{ sesionId: m.sesion_id, inscripcionId: m.inscripcion_id, estado: m.estado }]
    })
  } catch {
    return []
  }
}

// ─── Progress toward the certificate ─────────────────────────────────────

export interface ProgresoEntrada {
  readonly sesiones: readonly { readonly id: string; readonly estado: string }[]
  readonly inscripciones: readonly { readonly id: string; readonly personaId: string }[]
  readonly marcas: readonly MarcaGrupo[]
  readonly recuperaciones: readonly RecuperacionClase[]
  /** talleres.clases_minimas_para_completar; null = every clase. */
  readonly clasesMinimas: number | null
  /** talleres.permite_recuperar_clases: off = recoveries do not count. */
  readonly permiteRecuperar: boolean
}

export interface ProgresoCertificado {
  /** Held clases attended: presente, or recovered apart (one per clase). */
  readonly asistidas: number
  readonly recuperadas: number
  /** Held clases (en_curso or cerrada). */
  readonly dictadas: number
  /** Clases this person needs for the certificate. */
  readonly requeridas: number
  /** max(0, requeridas − asistidas). */
  readonly faltan: number
  /** Not enough clases left to reach it without recovering one. */
  readonly enRiesgo: boolean
}

/**
 * Same rule as talleres_cierre_resultados, read ahead of the cierre: the
 * requirement is the taller's minimum capped at the clases still planned
 * (not cancelled); held = en_curso | cerrada. A recovery only counts while
 * the switch is on and never twice for the same clase.
 */
export function progresoCertificado(entrada: ProgresoEntrada): ReadonlyMap<string, ProgresoCertificado> {
  const planificadas = entrada.sesiones.filter((s) => s.estado !== 'cancelada')
  const dictadas = planificadas.filter((s) => s.estado === 'en_curso' || s.estado === 'cerrada')
  const idsDictadas = new Set(dictadas.map((s) => s.id))
  const total = planificadas.length
  const requeridas = total === 0 ? 0 : Math.max(1, Math.min(entrada.clasesMinimas ?? total, total))
  const restantes = total - dictadas.length

  const presentes = new Set(
    entrada.marcas.filter((m) => m.estado === 'presente').map((m) => `${m.sesionId}:${m.inscripcionId}`),
  )
  const recuperadas = new Set(
    entrada.permiteRecuperar ? entrada.recuperaciones.map((r) => `${r.sesionId}:${r.personaId}`) : [],
  )

  const resultado = new Map<string, ProgresoCertificado>()
  for (const ins of entrada.inscripciones) {
    let asistidas = 0
    let recuperadasPersona = 0
    for (const sesionId of idsDictadas) {
      const presente = presentes.has(`${sesionId}:${ins.id}`)
      const recuperada = recuperadas.has(`${sesionId}:${ins.personaId}`)
      if (presente || recuperada) asistidas += 1
      if (recuperada && !presente) recuperadasPersona += 1
    }
    const faltan = Math.max(0, requeridas - asistidas)
    resultado.set(ins.id, {
      asistidas,
      recuperadas: recuperadasPersona,
      dictadas: dictadas.length,
      requeridas,
      faltan,
      enRiesgo: faltan > restantes,
    })
  }
  return resultado
}

/** «Vino 2 de 3 · 1 recuperada» */
export function textoAsistencia(p: ProgresoCertificado): string {
  const base = `Vino ${p.asistidas} de ${p.dictadas}`
  if (p.recuperadas === 0) return base
  return `${base} · ${p.recuperadas} ${p.recuperadas === 1 ? 'recuperada' : 'recuperadas'}`
}

/** «Faltan 2 clases para el certificado» / null when nothing is missing. */
export function textoFaltan(p: ProgresoCertificado): string | null {
  if (p.faltan === 0) return null
  return p.faltan === 1 ? 'Falta 1 clase para el certificado' : `Faltan ${p.faltan} clases para el certificado`
}

// ─── Errors ──────────────────────────────────────────────────────────────

const MENSAJES: Readonly<Record<string, { readonly error: string; readonly message: string }>> = {
  RECUPERACION_NO_PERMITIDA: {
    error: 'conflict',
    message: 'Este taller no permite recuperar clases aparte. Actívalo en la configuración del taller.',
  },
  RECUPERACION_YA_REGISTRADA: { error: 'conflict', message: 'Esta persona ya recuperó esa clase.' },
  RECUPERACION_NO_ENCONTRADA: { error: 'not-found', message: 'Esa recuperación ya no existe.' },
  EDICION_YA_CERRADA: {
    error: 'conflict',
    message: 'La edición ya está cerrada y sus certificados emitidos; no se pueden cambiar las recuperaciones.',
  },
  CLASE_NO_CERRADA: { error: 'conflict', message: 'Solo se recupera una clase que ya está cerrada.' },
  PERSONA_NO_AUSENTE: {
    error: 'conflict',
    message: 'Solo se recupera una clase a la que la persona faltó en este grupo.',
  },
  FECHA_RECUPERACION_REQUERIDA: { error: 'invalid-input', message: 'Elige la fecha de la recuperación.' },
  FECHA_RECUPERACION_FUTURA: { error: 'invalid-input', message: 'La fecha de la recuperación no puede ser futura.' },
  FECHA_RECUPERACION_ANTES_DE_LA_CLASE: {
    error: 'invalid-input',
    message: 'La recuperación no puede ser antes de la clase que recupera.',
  },
  NOTA_DEMASIADO_LARGA: {
    error: 'invalid-input',
    message: `La nota no puede superar los ${NOTA_RECUPERACION_MAX} caracteres.`,
  },
  DADA_POR_INVALIDA: { error: 'invalid-input', message: 'Elige quién dio la clase.' },
  sin_permisos_para_este_grupo: {
    error: 'forbidden',
    message: 'Solo el líder del grupo o la coordinación del taller registran recuperaciones.',
  },
}

/** Longest keys first, so a key never shadows a longer one. */
const CLAVES = Object.keys(MENSAJES).sort((a, b) => b.length - a.length)

export function traducirErrorRecuperacion(
  error: { readonly message?: string; readonly code?: string } | null | undefined,
  mensajePorDefecto: string,
): { readonly error: string; readonly message: string } {
  const crudo = `${error?.message ?? ''}`
  for (const clave of CLAVES) {
    if (crudo.includes(clave)) return MENSAJES[clave]
  }
  const traducido = traducirErrorTalleres(error, mensajePorDefecto)
  return { error: traducido.error, message: traducido.message }
}
