/**
 * DPS planning — the configuration screen (odd/tasks/dps-asistencia-pco.md,
 * T9; S6.2, S6.3): default horarios and llegada for new plans (1 to 4,
 * the llegada not after the first, as a plan's own since T13c), who builds the
 * plan besides the DPS direction (planificadores) and, per team, whether its
 * coordinators pass attendance. dps_config_leer is for planners; the writes
 * are for configurators only (admin/pastor or the DPS direction, L17), and
 * the database is the one that says no. Pure: safe on the client.
 */
import { MENSAJE_HORARIOS, MENSAJE_LLEGADA, MENSAJE_LLEGADA_PRIMERO } from './errores'

export interface PlanificadorDps {
  readonly personaId: string
  readonly nombre: string
}

/** One DPS team and its "Quién pasa asistencia" rule. */
export interface PasanAsistenciaEquipo {
  readonly equipoId: string
  readonly equipo: string
  /** "DPS › Producción Técnica › Audio". */
  readonly ruta: string
  readonly profundidad: number
  /** What applies: its own value or the inherited one. */
  readonly habilitado: boolean
  /** Its own row; null = inherits from the nearest ancestor (true at the top). */
  readonly explicito: boolean | null
}

export interface ConfigDps {
  readonly horarios: readonly string[]
  readonly llegada: string
  readonly planificadores: readonly PlanificadorDps[]
  readonly pasanAsistencia: readonly PasanAsistenciaEquipo[]
}

type Objeto = Record<string, unknown>

function lista(v: unknown): Objeto[] {
  return Array.isArray(v) ? v.filter((x): x is Objeto => Boolean(x) && typeof x === 'object') : []
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Reads dps_config_leer. */
export function leerConfig(data: unknown): ConfigDps {
  const d = data && typeof data === 'object' ? (data as Objeto) : {}
  return {
    horarios: Array.isArray(d.horarios) ? d.horarios.filter((h): h is string => typeof h === 'string') : [],
    llegada: texto(d.llegada),
    planificadores: lista(d.planificadores)
      .map((p) => ({ personaId: texto(p.persona_id), nombre: texto(p.nombre) }))
      .filter((p) => p.personaId),
    pasanAsistencia: lista(d.pasan_asistencia)
      .map((e) => ({
        equipoId: texto(e.equipo_id),
        equipo: texto(e.equipo),
        ruta: texto(e.ruta),
        profundidad: typeof e.profundidad === 'number' ? e.profundidad : 0,
        habilitado: e.habilitado !== false,
        explicito: typeof e.explicito === 'boolean' ? e.explicito : null,
      }))
      .filter((e) => e.equipoId),
  }
}

const HORA_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/
/** As a plan's own horarios (dps_plan_horarios_guardar; T13c, L55). */
export const MAX_HORARIOS_CONFIG = 4

/** "9:15" → "09:15"; null when it is not a time. */
function hora(valor: string): string | null {
  const m = HORA_RE.exec(valor.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/** The horarios as dps_config_guardar wants them: 1 to 4, sorted, no repeats. */
export function normalizarHorarios(
  valores: readonly string[],
): { readonly ok: true; readonly horarios: string[] } | { readonly ok: false; readonly mensaje: string } {
  const llenos = valores.map((v) => v.trim()).filter(Boolean)
  const horas = llenos.map(hora)
  if (horas.some((h) => h === null)) return { ok: false, mensaje: MENSAJE_HORARIOS }
  const unicas = [...new Set(horas as string[])].sort()
  if (unicas.length < 1 || unicas.length > MAX_HORARIOS_CONFIG) return { ok: false, mensaje: MENSAJE_HORARIOS }
  return { ok: true, horarios: unicas }
}

/** The arrival, padded; with the first horario, not after it (dps_config_guardar, T13c). */
export function validarLlegada(
  valor: string,
  primerHorario?: string,
): { readonly ok: true; readonly llegada: string } | { readonly ok: false; readonly mensaje: string } {
  const h = hora(valor)
  if (!h) return { ok: false, mensaje: MENSAJE_LLEGADA }
  const primero = primerHorario ? hora(primerHorario) : null
  return primero && h > primero ? { ok: false, mensaje: MENSAJE_LLEGADA_PRIMERO } : { ok: true, llegada: h }
}

/** The ancestors' rutas of a team, nearest first ("A › B › C" → "A › B", "A"). */
function ancestros(ruta: string): string[] {
  const partes = ruta.split(' › ')
  return partes.slice(0, -1).map((_, i) => partes.slice(0, partes.length - 1 - i).join(' › '))
}

/**
 * The teams after setting `explicito` on one of them, with `habilitado`
 * recomputed for every team the way dps_asistencia_habilitada does it: its
 * own value, else the nearest ancestor's, else true.
 */
export function recalcularPasanAsistencia(
  equipos: readonly PasanAsistenciaEquipo[],
  equipoId: string,
  explicito: boolean | null,
): PasanAsistenciaEquipo[] {
  const conCambio = equipos.map((e) => (e.equipoId === equipoId ? { ...e, explicito } : e))
  const porRuta = new Map(conCambio.map((e) => [e.ruta, e] as const))
  return conCambio.map((e) => {
    const propio = e.explicito
    const heredado = ancestros(e.ruta)
      .map((r) => porRuta.get(r)?.explicito)
      .find((v): v is boolean => typeof v === 'boolean')
    return { ...e, habilitado: propio ?? heredado ?? true }
  })
}
