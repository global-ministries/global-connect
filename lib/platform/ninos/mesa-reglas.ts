/**
 * Rules of the check-in desk (odd/tasks/ninos-checkin-pco.md, T2d, S9.1,
 * S9.3, S5; artboard design/ninos-checkin-pco/05-mesa-tableta.html).
 *
 *  - Visitor (S9.3, "Visitante = primeras 3 visitas del niño"): the prior
 *    visits come from ninos_es_visitante_lote; 0 is «Primera vez», 1–2
 *    «Visitante» (one concept), 3 or more a regular.
 *  - The salón rules (open, regulars' quota, visitor places, fecha de corte)
 *    and the occupancy go into the suggestion (salonParaHijo).
 *  - Full salón (S9.1, "Avisa y ofrece otro salón, pero deja forzar"): the
 *    room is full for this child at the regulars' quota, or at quota +
 *    visitor places for a visitor; the desk offers the next room that fits
 *    and has room, and may still force it. The forced children travel to
 *    ninos_checkin as p_forzados, which records who forced it.
 *  - No salón (S9.6, T2g): a child that fits no salón says which data is
 *    missing (faltaDeHijo); it cannot go in until that is completed, the
 *    rest of the family can.
 *  - Horario window (S5): open from abre_min_antes before the turno hour to
 *    cierra_min_despues after it, in Caracas time; 120 / 120 without a
 *    horario, as ninos_horario_de_turno. Shown only, never blocks.
 */
import type { OcupacionSalon, SalonDeHijo } from './checkin-vista'
import { aSalonSugerible, salonesDelHijo, salonParaHijo, type HijoEncontrado, type ReglasSugerencia, type SalonFila } from './familias-vista'
import { explicarSalon, type DatoFaltante } from './sugerir-salon'

/** S8.3: a child is a visitor in their first 3 visits. */
export const VISITAS_DE_VISITANTE = 3

export type Visita = 'primera' | 'visitante' | 'regular'

export const ETIQUETA_VISITA: Readonly<Record<Exclude<Visita, 'regular'>, string>> = { primera: 'Primera vez', visitante: 'Visitante' }

/** Prior visits (distinct check-in dates before the service) per child id. */
export type VisitasPrevias = Readonly<Record<string, number>>

export function visitaDe(previas: number | undefined): Visita | null {
  if (previas === undefined) return null
  if (previas === 0) return 'primera'
  return previas < VISITAS_DE_VISITANTE ? 'visitante' : 'regular'
}

type Fila = Record<string, unknown>
const esFila = (x: unknown): x is Fila => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The rows of ninos_es_visitante_lote (nino_id, visitas_previas, visitante). */
export function parseVisitas(data: unknown): Record<string, number> {
  if (!Array.isArray(data)) return {}
  const visitas: Record<string, number> = {}
  for (const f of data) {
    if (esFila(f) && typeof f.nino_id === 'string' && typeof f.visitas_previas === 'number') visitas[f.nino_id] = f.visitas_previas
  }
  return visitas
}

/** What the desk knows when it places a child: prior visits and the room occupancy. */
export type ReglasMesa = { readonly visitas?: VisitasPrevias; readonly ocupacion?: ReadonlyMap<string, OcupacionSalon> }

/** An unknown visit count is treated as a regular: the stricter quota. */
const esVisitante = (h: Pick<HijoEncontrado, 'id'>, reglas: ReglasMesa): boolean => {
  const v = visitaDe(reglas.visitas?.[h.id])
  return v === 'primera' || v === 'visitante'
}

function reglasDe(h: HijoEncontrado, reglas: ReglasMesa): ReglasSugerencia {
  const ocupados = reglas.ocupacion?.size ? Object.fromEntries([...reglas.ocupacion].map(([id, o]) => [id, o.presentes])) : undefined
  return { visitante: esVisitante(h, reglas), ocupados }
}

/** checkin-vista's salonDeHijo with the salón rules: picked by hand › remembered › suggested by the rules. */
export function salonDeHijoConReglas(
  h: HijoEncontrado,
  salones: readonly SalonFila[],
  fechaServicio: string,
  manual: string | undefined,
  reglas: ReglasMesa,
): SalonDeHijo {
  if (manual) return { salonId: manual, origen: 'manual' }
  const r = salonParaHijo(h, salones, fechaServicio, reglasDe(h, reglas))
  return r.tipo === 'ninguno' ? { salonId: null, origen: 'ninguno' } : { salonId: r.salon.id, origen: r.tipo }
}

/** The data a child lacks to fit any salón (S9.6); null when one fits, even closed or full. */
export function faltaDeHijo(
  h: Pick<HijoEncontrado, 'fecha_nacimiento' | 'grado' | 'necesidades_especiales'>,
  salones: readonly SalonFila[],
  fechaServicio: string,
): DatoFaltante | null {
  return salonesDelHijo(h, salones, fechaServicio).falta
}

/** «Llegaron» stops on a child without salón: the family opens at the mesa. */
export function mensajeSinSalon(nombre: string): string {
  return `${nombre} no tiene salón: completa el dato que falta o registra a los demás.`
}

/** Whether the room has no place for this child: the regulars' quota, plus the visitor places for a visitor. */
export function salonLleno(salon: SalonFila | undefined, cupo: OcupacionSalon | undefined, visitante: boolean): boolean {
  if (!cupo) return false
  const extra = visitante ? (salon?.cupo_visitantes ?? 0) : 0
  return cupo.presentes >= cupo.capacidad + extra
}

export type EstadoHijoMesa = {
  readonly visita: Visita | null
  /** The room is full for this child (S9.1): the desk warns and may force it. */
  readonly lleno: boolean
  /** The next room that fits the child and has room, for «Usar {otro}». */
  readonly otro: SalonFila | null
}

export function estadoHijo(
  h: HijoEncontrado,
  salonId: string | null,
  salones: readonly SalonFila[],
  fechaServicio: string,
  reglas: ReglasMesa,
): EstadoHijoMesa {
  const visita = visitaDe(reglas.visitas?.[h.id])
  const visitante = esVisitante(h, reglas)
  const salon = salones.find((s) => s.id === salonId)
  const lleno = salonId !== null && salonLleno(salon, reglas.ocupacion?.get(salonId), visitante)
  if (!lleno) return { visita, lleno, otro: null }
  const { ocupados } = reglasDe(h, reglas)
  const e = explicarSalon({
    fechaNacimiento: h.fecha_nacimiento,
    grado: h.grado,
    necesidadesEspeciales: Boolean(h.necesidades_especiales),
    fechaServicio,
    salones: salones.map(aSalonSugerible),
    visitante,
    ocupados,
  })
  const otroId = (e.salon && e.salon.id !== salonId ? e.salon : e.disponibles.find((s) => s.id !== salonId))?.id
  return { visita, lleno, otro: salones.find((s) => s.id === otroId) ?? null }
}

/** The children of a check-in that go in over their room's quota: ninos_checkin's p_forzados. */
export function forzadosDe(
  seleccion: readonly { ninoId: string; salonId: string }[],
  hijos: readonly HijoEncontrado[],
  salones: readonly SalonFila[],
  reglas: ReglasMesa,
): string[] {
  return seleccion
    .filter(({ ninoId, salonId }) => {
      const h = hijos.find((x) => x.id === ninoId)
      return h !== undefined && salonLleno(salones.find((s) => s.id === salonId), reglas.ocupacion?.get(salonId), esVisitante(h, reglas))
    })
    .map((s) => s.ninoId)
}

// ── horario window ───────────────────────────────────────────────────

/** The event and the check-in window of a turno (ninos_evento_horarios). */
export type HorarioMesa = { readonly evento: string | null; readonly abreMinAntes: number; readonly cierraMinDespues: number }

/** As ninos_horario_de_turno: a turno without an active horario keeps the fixed 2 h. */
export const VENTANA_POR_DEFECTO = 120

const minutos = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : VENTANA_POR_DEFECTO)

/** Rows of ninos_evento_horarios with their event, by turno id. */
export function parseHorarios(data: unknown): Record<string, HorarioMesa> {
  if (!Array.isArray(data)) return {}
  const horarios: Record<string, HorarioMesa> = {}
  for (const f of data) {
    if (!esFila(f) || typeof f.turno_id !== 'string') continue
    const evento = esFila(f.evento) && typeof f.evento.nombre === 'string' ? f.evento.nombre : null
    horarios[f.turno_id] = { evento, abreMinAntes: minutos(f.abre_min_antes), cierraMinDespues: minutos(f.cierra_min_despues) }
  }
  return horarios
}

/** Caracas has no daylight saving time. */
const CARACAS = '-04:00'
const MINUTO = 60_000

/** "09:00:00" → "9:00". */
export function horaCorta(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora)
  return m ? `${Number(m[1])}:${m[2]}` : hora
}

export type Ventana = { readonly abre: number; readonly cierra: number }

/** Opening and closing instants (ms) of the window on the service date. */
export function ventanaDelHorario(fecha: string, hora: string, abreMinAntes: number, cierraMinDespues: number): Ventana {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora)
  const hhmm = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '00:00'
  const inicio = Date.parse(`${fecha}T${hhmm}:00${CARACAS}`)
  return { abre: inicio - abreMinAntes * MINUTO, cierra: inicio + cierraMinDespues * MINUTO }
}

export type EstadoVentana = { readonly estado: 'antes' | 'abierto' | 'despues'; readonly minutos: number }

/** Where `ahora` falls; `minutos` until it opens (antes) or closes (abierto). */
export function estadoVentana(v: Ventana, ahora: number): EstadoVentana {
  if (ahora < v.abre) return { estado: 'antes', minutos: Math.ceil((v.abre - ahora) / MINUTO) }
  if (ahora < v.cierra) return { estado: 'abierto', minutos: Math.ceil((v.cierra - ahora) / MINUTO) }
  return { estado: 'despues', minutos: 0 }
}

const duracion = (min: number): string => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`)

/** Caracas wall clock of an instant: "7:00". */
function horaEnCaracas(instante: number): string {
  const d = new Date(instante - 4 * 60 * MINUTO)
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** «Abierto · cierra en 47 min», «Cerrado · abre a las 7:00», «Cerrado». */
export function textoVentana(v: Ventana, e: EstadoVentana): { titulo: 'Abierto' | 'Cerrado'; detalle: string | null } {
  if (e.estado === 'abierto') return { titulo: 'Abierto', detalle: `cierra en ${duracion(e.minutos)}` }
  if (e.estado === 'antes') return { titulo: 'Cerrado', detalle: `abre a las ${horaEnCaracas(v.abre)}` }
  return { titulo: 'Cerrado', detalle: null }
}
