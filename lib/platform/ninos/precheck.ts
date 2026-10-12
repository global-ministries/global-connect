/**
 * Pre-check-in from the car (odd/tasks/ninos-precheck.md): parses
 * ninos_mis_prechecks() for "Voy en camino" in Mis hijos and maps the errors
 * of ninos_precheck_avisar / ninos_precheck_cancelar to Spanish. The SQL
 * decides the window, the children and the caps; this only reads its answer.
 */

/** A service of today that still takes notices (its window is open). */
export type ServicioPrecheck = { turnoId: string; nombre: string; hora: string; campus: string }

export type EstadoPrecheck = 'pendiente' | 'ingresado' | 'expirado'

/** One child's notice for a service of today. */
export type AvisoPrecheck = { ninoId: string; turnoId: string; estado: EstadoPrecheck }

export type MisPrechecks = { servicios: ServicioPrecheck[]; avisos: AvisoPrecheck[] }

type Objeto = Record<string, unknown>

const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const ESTADOS: readonly string[] = ['pendiente', 'ingresado', 'expirado']

export function parseMisPrechecks(data: unknown): MisPrechecks {
  if (!esObjeto(data)) return { servicios: [], avisos: [] }
  const servicios = Array.isArray(data.servicios) ? data.servicios : []
  const avisos = Array.isArray(data.avisos) ? data.avisos : []
  return {
    servicios: servicios
      .filter((s): s is Objeto => esObjeto(s) && typeof s.turno_id === 'string')
      .map((s) => ({ turnoId: s.turno_id as string, nombre: texto(s.nombre), hora: texto(s.hora), campus: texto(s.campus) })),
    avisos: avisos
      .filter((a): a is Objeto => esObjeto(a) && typeof a.nino_id === 'string' && typeof a.turno_id === 'string')
      .filter((a) => ESTADOS.includes(texto(a.estado)))
      .map((a) => ({ ninoId: a.nino_id as string, turnoId: a.turno_id as string, estado: a.estado as EstadoPrecheck })),
  }
}

/** "09:00:00" → "9:00". */
export function horaServicio(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora)
  return m ? `${Number(m[1])}:${m[2]}` : ''
}

const MENSAJES: Record<string, string> = {
  fuera_de_horario: 'Este servicio ya no recibe avisos. Avisa en la mesa al llegar.',
  ya_ingresado: 'Uno de tus hijos ya ingresó a este servicio.',
  limite_diario: 'Llegaste al límite de avisos de hoy.',
  limite_hijos: 'Puedes avisar hasta 10 niños a la vez.',
  nino_no_encontrado: 'No encontramos a uno de los niños entre tus hijos. Recarga la página.',
  sin_ficha: 'Uno de los niños aún no tiene ficha de Niños: regístralo en la mesa.',
  sin_autoridad: 'No tienes permiso para avisar a la mesa.',
}

export function mensajeDeErrorPrecheck(error: { code?: string; message?: string } | null): string {
  const clave = error?.message ?? ''
  if (MENSAJES[clave]) return MENSAJES[clave]
  if (error?.code === '42501') return MENSAJES.sin_autoridad
  return 'No se pudo avisar a la mesa. Intenta de nuevo.'
}
