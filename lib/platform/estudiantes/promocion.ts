/**
 * Estudiantes — the pure view model of "Promover temporada"
 * (/estudiantes/promocion, C6b3 of odd/tasks/estudiantes-fase-b.md, S11–S15;
 * artboards 09 / 10 of design/estudiantes-asistencia, assumptions A18–A25).
 *
 * Source: estudiantes_promocion_vista(p_campus_id) and the summary of
 * estudiantes_promocion_aplicar(p_campus_id, p_decisiones)
 * (supabase/migrations/20261102100000_estudiantes_promocion.sql). The preview
 * brings both options of every last-Transit-year group ('por_decidir'); the
 * director's choice lives in the client (`Decisiones`) and this module turns
 * preview + choices into what the screen shows: the hero numbers, the four
 * attention metrics, the ámbito cards, one decision card per 3er año group,
 * the groups "Grupo hoy → Queda como" by ámbito and sub-área (plus the new
 * group option (a) creates), the graduates, the confirmation and the blocked
 * state of a campus promoted less than 180 days ago.
 *
 * Every jsonb value is read defensively: a malformed group or person is left
 * out, a missing number is 0.
 */
import type { SubareaGestionable } from './grupos-datos'

// ── Input ────────────────────────────────────────────────────────────

export type Decision = 'pasan_chicos' | 'pasa_grupo'
export const DECISIONES: readonly Decision[] = ['pasan_chicos', 'pasa_grupo']
/** The director's choice per 3er año group id. */
export type Decisiones = Readonly<Record<string, Decision>>

export type TipoGrupoPromocion = 'sube' | 'vuelve' | 'por_decidir'

/** What a group becomes (estudiantes_promocion_destino). */
export interface DestinoPromocion {
  /** NULL when Inside Out has no sub-área of that label. */
  readonly nombre: string | null
  readonly nombreCambia: boolean
  /** The name it would have had; set when it took " B" (L38). */
  readonly choca: string | null
  readonly anioEtiqueta: string | null
  readonly subareaId: string | null
  readonly subarea: string | null
  readonly ambito: string | null
}

export interface LiderPromocion {
  readonly servicioId: string
  /** "Nombre Apellido". */
  readonly nombre: string
  readonly rol: string
}

export interface ServicioCruce extends LiderPromocion {
  /** The same rol in the Inside Out sub-área; NULL = it does not exist (rol_invalido). */
  readonly rolDestino: string | null
  readonly turnos: number
  /** The turnos that equipo serves; the rest do not carry over. */
  readonly turnosDestino: number
}

export interface IntegrantePromocion {
  readonly personaId: string
  readonly nombre: string
  readonly estado: 'miembro' | 'visitante'
  readonly anioEtiqueta: string | null
  readonly egresa: boolean
  readonly anioNuevoEtiqueta: string | null
}

export interface OpcionesPromocion {
  readonly pasanChicos: {
    /** The Transit group back to the first year, with its leader. */
    readonly grupo: DestinoPromocion | null
    /** The new first-Inside-Out-year group, without leader. */
    readonly nuevo: DestinoPromocion | null
    readonly llegan: number
    readonly lleganVisitantes: number
  }
  readonly pasaGrupo: {
    readonly grupo: DestinoPromocion | null
    readonly servicios: readonly ServicioCruce[]
  } | null
}

export interface GrupoPromocion {
  readonly id: string
  readonly nombre: string
  readonly ambitoId: string
  readonly ambito: string
  readonly subareaId: string
  readonly subarea: string
  readonly anio: number
  readonly anioEtiqueta: string
  readonly tipo: TipoGrupoPromocion
  readonly lideres: readonly LiderPromocion[]
  readonly miembros: number
  readonly visitantes: number
  readonly egresan: number
  readonly visitantesEgresan: number
  readonly suben: number
  readonly quedaVacio: boolean
  /** NULL for a 'por_decidir' group: see `opciones`. */
  readonly despues: DestinoPromocion | null
  readonly opciones: OpcionesPromocion | null
  readonly integrantes: readonly IntegrantePromocion[]
}

export interface AmbitoPromocion {
  readonly id: string
  readonly nombre: string
  readonly primerAnio: number
  readonly ultimoAnio: number
  readonly primerEtiqueta: string
  readonly ultimoEtiqueta: string
}

export interface EgresadoPromocion {
  readonly personaId: string
  readonly nombre: string
  readonly grupoId: string | null
  readonly grupo: string | null
  readonly anio: number | null
  readonly anioEtiqueta: string | null
  readonly anioFinalEtiqueta: string | null
  /** "Grupos de Chicas" of The Living Room; NULL without sexo or sub-área. */
  readonly destino: string | null
}

export interface ResumenPromocion {
  readonly grupos: number
  readonly egresan: number
  readonly fichasSuben: number
  readonly gruposNuevos: readonly string[]
  readonly pasanGrupo: readonly string[]
  readonly aplicadaAt: string | null
  readonly proxima: string | null
}

export interface UltimaPromocion {
  readonly aplicadaAt: string
  /** "Nombre Apellido" of whoever applied it. */
  readonly por: string | null
  /** YYYY-MM-DD, 180 days later. */
  readonly proxima: string | null
  readonly resumen: ResumenPromocion | null
}

export interface TotalesPromocion {
  readonly grupos: number
  readonly integrantes: number
  readonly suben: number
  readonly pasanInsideOut: number
  readonly egresan: number
  /** Fichas without a group that move up (not graduating). */
  readonly sinGrupo: number
  readonly porDecidir: number
  readonly quedanVacios: number
}

export interface VistaPromocion {
  readonly campus: { readonly id: string; readonly nombre: string }
  readonly bloqueado: boolean
  readonly ultima: UltimaPromocion | null
  readonly ambitos: readonly AmbitoPromocion[]
  /** The The Living Room ámbito graduates go to. */
  readonly theLivingRoom: { readonly id: string; readonly nombre: string } | null
  readonly grupos: readonly GrupoPromocion[]
  readonly egresados: readonly EgresadoPromocion[]
  readonly totales: TotalesPromocion
}

// ── Reading the jsonb ────────────────────────────────────────────────

type Objeto = Record<string, unknown>

const esObjeto = (valor: unknown): valor is Objeto => typeof valor === 'object' && valor !== null && !Array.isArray(valor)
const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() !== '' ? valor : null)
const numero = (valor: unknown): number => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0)
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : [])
const nombreCompleto = (o: Objeto): string => [texto(o.nombre), texto(o.apellido)].filter(Boolean).join(' ')

function deLista<T>(valor: unknown, leer: (o: Objeto) => T | null): T[] {
  return lista(valor).flatMap((x) => {
    const leido = esObjeto(x) ? leer(x) : null
    return leido === null ? [] : [leido]
  })
}

function aDestino(valor: unknown): DestinoPromocion | null {
  if (!esObjeto(valor)) return null
  return {
    nombre: texto(valor.nombre),
    nombreCambia: valor.nombre_cambia === true,
    choca: texto(valor.choca),
    anioEtiqueta: texto(valor.anio_etiqueta),
    subareaId: texto(valor.subarea_id),
    subarea: texto(valor.subarea),
    ambito: texto(valor.ambito),
  }
}

function aLider(o: Objeto): LiderPromocion | null {
  const servicioId = texto(o.servicio_id)
  return servicioId ? { servicioId, nombre: nombreCompleto(o), rol: texto(o.rol) ?? '' } : null
}

function aServicio(o: Objeto): ServicioCruce | null {
  const lider = aLider(o)
  return lider ? { ...lider, rolDestino: texto(o.rol_destino), turnos: numero(o.turnos), turnosDestino: numero(o.turnos_destino) } : null
}

function aIntegrante(o: Objeto): IntegrantePromocion | null {
  const personaId = texto(o.persona_id)
  if (!personaId) return null
  return {
    personaId,
    nombre: nombreCompleto(o),
    estado: o.estado === 'visitante' ? 'visitante' : 'miembro',
    anioEtiqueta: texto(o.anio_etiqueta),
    egresa: o.egresa === true,
    anioNuevoEtiqueta: texto(o.anio_nuevo_etiqueta),
  }
}

function aOpciones(valor: unknown): OpcionesPromocion | null {
  if (!esObjeto(valor)) return null
  const a = esObjeto(valor.pasan_chicos) ? valor.pasan_chicos : {}
  const b = esObjeto(valor.pasa_grupo) ? valor.pasa_grupo : null
  return {
    pasanChicos: { grupo: aDestino(a.grupo), nuevo: aDestino(a.nuevo), llegan: numero(a.llegan), lleganVisitantes: numero(a.llegan_visitantes) },
    pasaGrupo: b ? { grupo: aDestino(b.grupo), servicios: deLista(b.servicios, aServicio) } : null,
  }
}

const TIPOS: readonly TipoGrupoPromocion[] = ['sube', 'vuelve', 'por_decidir']

function aGrupo(o: Objeto): GrupoPromocion | null {
  const id = texto(o.grupo_id)
  const nombre = texto(o.nombre)
  const ambitoId = texto(o.ambito_id)
  const subareaId = texto(o.subarea_id)
  const tipo = TIPOS.find((t) => t === o.tipo)
  if (!id || !nombre || !ambitoId || !subareaId || !tipo) return null
  return {
    id,
    nombre,
    ambitoId,
    ambito: texto(o.ambito) ?? '',
    subareaId,
    subarea: texto(o.subarea) ?? '',
    anio: numero(o.anio),
    anioEtiqueta: texto(o.anio_etiqueta) ?? '',
    tipo,
    lideres: deLista(o.lideres, aLider),
    miembros: numero(o.miembros),
    visitantes: numero(o.visitantes),
    egresan: numero(o.egresan),
    visitantesEgresan: numero(o.visitantes_egresan),
    suben: numero(o.suben),
    quedaVacio: o.queda_vacio === true,
    despues: aDestino(o.despues),
    opciones: tipo === 'por_decidir' ? aOpciones(o.opciones) : null,
    integrantes: deLista(o.integrantes, aIntegrante),
  }
}

function aAmbito(o: Objeto): AmbitoPromocion | null {
  const id = texto(o.ambito_id)
  if (!id) return null
  return {
    id,
    nombre: texto(o.nombre) ?? '',
    primerAnio: numero(o.primer_anio),
    ultimoAnio: numero(o.ultimo_anio),
    primerEtiqueta: texto(o.primer_etiqueta) ?? '',
    ultimoEtiqueta: texto(o.ultimo_etiqueta) ?? '',
  }
}

function aEgresado(o: Objeto): EgresadoPromocion | null {
  const personaId = texto(o.persona_id)
  if (!personaId) return null
  return {
    personaId,
    nombre: nombreCompleto(o),
    grupoId: texto(o.grupo_id),
    grupo: texto(o.grupo),
    anio: typeof o.anio === 'number' ? o.anio : null,
    anioEtiqueta: texto(o.anio_etiqueta),
    anioFinalEtiqueta: texto(o.anio_final_etiqueta),
    destino: esObjeto(o.destino) ? texto(o.destino.subarea) : null,
  }
}

/** The summary of estudiantes_promocion_aplicar (also `ultima.resumen` of the preview). */
export function leerResumenPromocion(valor: unknown): ResumenPromocion | null {
  if (!esObjeto(valor)) return null
  const nombres = (x: unknown): string[] => deLista(x, (o) => texto(o.nombre))
  return {
    grupos: numero(valor.grupos),
    egresan: numero(valor.egresan),
    fichasSuben: numero(valor.fichas_suben),
    gruposNuevos: nombres(valor.grupos_nuevos),
    pasanGrupo: nombres(valor.pasan_grupo),
    aplicadaAt: texto(valor.aplicada_at),
    proxima: texto(valor.proxima),
  }
}

function aUltima(valor: unknown): UltimaPromocion | null {
  if (!esObjeto(valor)) return null
  const aplicadaAt = texto(valor.aplicada_at)
  if (!aplicadaAt) return null
  return {
    aplicadaAt,
    por: esObjeto(valor.por) ? nombreCompleto(valor.por) || null : null,
    proxima: texto(valor.proxima),
    resumen: leerResumenPromocion(valor.resumen),
  }
}

/** The preview of estudiantes_promocion_vista; `null` when it is not one. */
export function leerVistaPromocion(data: unknown): VistaPromocion | null {
  if (!esObjeto(data) || !esObjeto(data.campus)) return null
  const id = texto(data.campus.id)
  if (!id) return null
  const t = esObjeto(data.totales) ? data.totales : {}
  return {
    campus: { id, nombre: texto(data.campus.nombre) ?? '' },
    bloqueado: data.bloqueado === true,
    ultima: aUltima(data.ultima),
    ambitos: deLista(data.ambitos, aAmbito),
    theLivingRoom:
      esObjeto(data.the_living_room) && texto(data.the_living_room.ambito_id)
        ? { id: texto(data.the_living_room.ambito_id)!, nombre: texto(data.the_living_room.nombre) ?? 'The Living Room' }
        : null,
    grupos: deLista(data.grupos, aGrupo),
    egresados: deLista(data.egresados, aEgresado),
    totales: {
      grupos: numero(t.grupos),
      integrantes: numero(t.integrantes),
      suben: numero(t.suben),
      pasanInsideOut: numero(t.pasan_inside_out),
      egresan: numero(t.egresan),
      sinGrupo: numero(t.sin_grupo),
      porDecidir: numero(t.por_decidir),
      quedanVacios: numero(t.quedan_vacios),
    },
  }
}

/** What the page hands the client island for the chosen campus. */
export type ContenidoPromocion =
  | { readonly tipo: 'vista'; readonly vista: VistaPromocion }
  | { readonly tipo: 'sin_escala' }
  | { readonly tipo: 'error'; readonly mensaje: string }

// ── Errors ───────────────────────────────────────────────────────────

type ErrorRpc = { readonly code?: string; readonly message?: string } | null | undefined

export const MENSAJES_ERROR_PROMOCION = {
  sin_autoridad: 'No tienes permiso para promover este campus.',
  campus_invalido: 'Ese campus ya no está activo. Recarga la página.',
  escala_invalida: 'Este campus no tiene la escala de años de Transit e Inside Out. Pide que la configuren antes de promover.',
  promocion_reciente: 'Este campus ya se promovió hace menos de 180 días. Recarga la página para ver cuándo se habilita.',
  decision_invalida: 'Cambiaron los grupos de 3er año. Recarga la página y vuelve a decidir.',
  subarea_invalida: 'Inside Out no tiene la sub-área a la que pasaría un grupo. Créala en Estructura o elige la otra opción.',
  rol_invalido: 'Un líder no tiene su mismo rol en Inside Out. Créalo en Estructura o elige la otra opción.',
} as const

export type CodigoErrorPromocion = keyof typeof MENSAJES_ERROR_PROMOCION

const esCodigo = (valor: string): valor is CodigoErrorPromocion => Object.prototype.hasOwnProperty.call(MENSAJES_ERROR_PROMOCION, valor)

/** The code of an RPC error (`sin_autoridad` for SQLSTATE 42501); `null` when unknown. */
export function codigoErrorPromocion(error: ErrorRpc): CodigoErrorPromocion | null {
  const mensaje = error?.message?.trim() ?? ''
  if (esCodigo(mensaje)) return mensaje
  if (error?.code === '42501') return 'sin_autoridad'
  return null
}

export function mensajeErrorPromocion(error: ErrorRpc): string {
  const codigo = codigoErrorPromocion(error)
  return codigo ? MENSAJES_ERROR_PROMOCION[codigo] : 'No se pudo promover. Inténtalo de nuevo.'
}

// ── Campus ───────────────────────────────────────────────────────────

export interface CampusPromocion {
  readonly id: string
  readonly nombre: string
}

/** The campuses where the caller manages a Transit / Inside Out sub-área, by name. */
export function campusDePromocion(subareas: readonly SubareaGestionable[]): CampusPromocion[] {
  const porId = new Map<string, CampusPromocion>()
  for (const s of subareas) if (s.experiencia === 'estudiantes' && !porId.has(s.campusId)) porId.set(s.campusId, { id: s.campusId, nombre: s.campus })
  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** `?campus=` when it is one of them, else the first. */
export function elegirCampus<T extends CampusPromocion>(campus: readonly T[], pedido: string | null | undefined): T | null {
  return campus.find((c) => c.id === pedido) ?? campus[0] ?? null
}

// ── Words ────────────────────────────────────────────────────────────

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`
const unirY = (partes: readonly string[]): string =>
  partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
/** "Transit e Inside Out": "e" before an /i/ sound. */
const unirAmbitos = (partes: readonly string[]): string =>
  partes.reduce((acc, p, i) => (i === 0 ? p : `${acc}${i === partes.length - 1 ? (/^h?i/i.test(p) ? ' e ' : ' y ') : ', '}${p}`), '')
const lideresTexto = (lideres: readonly LiderPromocion[]): string | null => (lideres.length ? unirY(lideres.map((l) => l.nombre)) : null)
/** "Grupos de Chicas" → "Chicas". */
const sexoDe = (subarea: string): string => subarea.replace(/^grupos\s+de\s+/i, '')
const esChicas = (subarea: string): boolean => /chicas$/i.test(subarea.trim())
const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const ZONA = 'America/Caracas'

/** "14 sep 2026" of an instant (Caracas) or a YYYY-MM-DD date. */
export function fechaPromocion(valor: string): string {
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: soloFecha ? 'UTC' : ZONA, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(
    new Date(soloFecha ? `${valor}T00:00:00Z` : valor),
  )
  const parte = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value)
  return `${parte('day')} ${MESES[parte('month') - 1]} ${parte('year')}`
}

/** "9:15" of an instant in Caracas. */
function horaPromocion(instante: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante))
  const parte = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '0'
  return `${Number(parte('hour'))}:${parte('minute')}`
}

// ── The plan with the director's choices ─────────────────────────────

export type MetricaPromocion = 'decidir' | 'cruzan' | 'egresan' | 'vacios'

export interface FiltrosPromocion {
  /** Ámbito id; null = both. */
  readonly ambito: string | null
  readonly metrica: MetricaPromocion | null
  readonly q: string
}

export const FILTROS_PROMOCION: FiltrosPromocion = { ambito: null, metrica: null, q: '' }

const METRICAS: readonly MetricaPromocion[] = ['decidir', 'cruzan', 'egresan', 'vacios']

export type ParametrosPromocion = Readonly<Record<string, string | string[] | undefined>>

const primero = (valor: string | string[] | undefined): string | null => (Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null))

/** `?ambito&metrica&q` (the campus is read by the page). */
export function leerFiltrosPromocion(parametros: ParametrosPromocion): FiltrosPromocion {
  const metrica = primero(parametros.metrica)
  return {
    ambito: primero(parametros.ambito) || null,
    metrica: METRICAS.find((m) => m === metrica) ?? null,
    q: primero(parametros.q) ?? '',
  }
}

export function urlPromocion(campusId: string | null, filtros: FiltrosPromocion): string {
  const p = new URLSearchParams()
  if (campusId) p.set('campus', campusId)
  if (filtros.ambito) p.set('ambito', filtros.ambito)
  if (filtros.metrica) p.set('metrica', filtros.metrica)
  if (filtros.q.trim()) p.set('q', filtros.q.trim())
  const consulta = p.toString()
  return consulta ? `/estudiantes/promocion?${consulta}` : '/estudiantes/promocion'
}

const esDecision = (valor: unknown): valor is Decision => DECISIONES.includes(valor as Decision)

/** Groups of the last Transit year, by sub-área and name (the decision cards). */
const porDecidir = (vista: VistaPromocion): GrupoPromocion[] =>
  vista.grupos
    .filter((g) => g.tipo === 'por_decidir')
    .sort((a, b) => a.subarea.localeCompare(b.subarea, 'es') || a.nombre.localeCompare(b.nombre, 'es'))

interface OpcionCalculada {
  readonly disponible: boolean
  readonly motivo: string | null
}

const OTRA = 'Créalo en Estructura o elige la otra opción.'

function opcionA(g: GrupoPromocion): OpcionCalculada {
  const a = g.opciones?.pasanChicos
  if (!a?.nuevo?.subareaId || !a.nuevo.nombre || !a.grupo?.nombre) {
    return { disponible: false, motivo: `${a?.nuevo?.ambito ?? 'Inside Out'} no tiene «${g.subarea}». ${OTRA}` }
  }
  return { disponible: true, motivo: null }
}

function opcionB(g: GrupoPromocion): OpcionCalculada {
  const b = g.opciones?.pasaGrupo
  if (!b?.grupo?.subareaId || !b.grupo.nombre) return { disponible: false, motivo: `${b?.grupo?.ambito ?? 'Inside Out'} no tiene «${g.subarea}». ${OTRA}` }
  const sinRol = b.servicios.find((s) => s.rolDestino === null)
  if (sinRol) return { disponible: false, motivo: `${b.grupo.ambito ?? 'Inside Out'} · ${b.grupo.subarea ?? g.subarea} no tiene el rol «${sinRol.rol}» de ${sinRol.nombre}. ${OTRA}` }
  return { disponible: true, motivo: null }
}

/** The valid choice of a 3er año group (an option Inside Out cannot take counts as none). */
function decisionDe(g: GrupoPromocion, decisiones: Decisiones): Decision | null {
  const d = decisiones[g.id]
  if (!esDecision(d)) return null
  return (d === 'pasan_chicos' ? opcionA(g) : opcionB(g)).disponible ? d : null
}

/** The decisions to send to estudiantes_promocion_aplicar; `null` while one is missing or the campus is blocked. */
export function decisionesParaAplicar(vista: VistaPromocion, decisiones: Decisiones): Record<string, Decision> | null {
  if (vista.bloqueado) return null
  const salida: Record<string, Decision> = {}
  for (const g of porDecidir(vista)) {
    const d = decisionDe(g, decisiones)
    if (!d) return null
    salida[g.id] = d
  }
  return salida
}

/** Where a group lands with the choices (`null` while a 3er año group is pending). */
function destinoDe(g: GrupoPromocion, d: Decision | null): DestinoPromocion | null {
  if (g.tipo !== 'por_decidir') return g.despues
  if (d === 'pasan_chicos') return g.opciones?.pasanChicos.grupo ?? null
  if (d === 'pasa_grupo') return g.opciones?.pasaGrupo?.grupo ?? null
  return null
}

const quedaVacio = (g: GrupoPromocion, d: Decision | null): boolean => g.quedaVacio || d === 'pasan_chicos'

/** "ya es el grupo que hoy es 6to año" for a name that took " B". */
function chocaCon(vista: VistaPromocion, choca: string): string {
  const otro = vista.grupos.find((g) => g.despues?.nombre === choca)
  return otro ? `«${choca}» ya es el grupo que hoy es ${otro.anioEtiqueta}` : `«${choca}» ya es el nombre de otro grupo`
}

// ── Output ───────────────────────────────────────────────────────────

export type TonoMetrica = 'warning' | 'info' | 'muted' | 'success'

export interface MetricaVista {
  readonly id: MetricaPromocion
  readonly etiqueta: string
  readonly valor: number
  readonly total?: number
  readonly pista: string
  readonly tono: TonoMetrica
  readonly activa: boolean
}

export interface InsigniaPromocion {
  readonly texto: string
  readonly tono: 'info' | 'warning' | 'success' | 'default'
}

export interface TarjetaAmbitoPromocion {
  readonly id: string
  readonly label: string
  readonly subtitulo: string
  readonly total: number
  readonly insignias: readonly { readonly texto: string; readonly tono: 'info' | 'warning' }[]
  readonly activa: boolean
}

export interface OpcionDecision extends OpcionCalculada {
  readonly valor: Decision
  readonly titulo: string
  readonly descripcion: string
}

export interface AvisoDecision {
  readonly tono: 'info' | 'marca' | 'warning'
  readonly titulo: string | null
  readonly texto: string
}

export interface TarjetaDecision {
  readonly grupoId: string
  readonly titulo: string
  /** "Grupos de Chicas · Karla Mujica · 13 integrantes y 1 visitante". */
  readonly ruta: string
  readonly decision: Decision | null
  readonly decidido: boolean
  readonly opciones: readonly OpcionDecision[]
  readonly avisos: readonly AvisoDecision[]
  readonly nota: string | null
}

export interface FilaPromocion {
  /** The group id, or `nuevo:<3er año group id>` for the group option (a) creates. */
  readonly id: string
  readonly nuevo: boolean
  readonly hoy: { readonly nombre: string; readonly detalle: string; readonly sinLider: boolean }
  readonly quedaComo: { readonly nombre: string; readonly detalle: string; readonly pendiente: boolean; readonly sinLider: boolean }
  readonly integrantes: number
  readonly cifra: string
  readonly insignias: readonly InsigniaPromocion[]
  readonly etiqueta: string
}

export interface BloquePromocion {
  readonly id: string
  /** "Transit · Grupos de Chicas". */
  readonly titulo: string
  readonly filas: readonly FilaPromocion[]
}

export interface FilaEgresado {
  readonly personaId: string
  readonly nombre: string
  readonly grupo: string
  readonly grupoDetalle: string
  readonly anioFinal: string
  readonly pasaA: string
  readonly pasaADetalle: string
}

export interface LineaConfirmacion {
  readonly icono: 'subir' | 'flecha' | 'grupo' | 'egresan'
  readonly texto: string
}

export interface EstadoBloqueado {
  readonly titulo: string
  readonly fecha: string
  readonly texto: string
  readonly datos: readonly { readonly etiqueta: string; readonly valor: number }[]
}

export interface ResultadoPromocion {
  readonly resumen: { readonly campus: string; readonly grupos: number; readonly suben: number; readonly pasanInsideOut: number; readonly egresan: number }
  readonly metricas: readonly MetricaVista[]
  readonly ambitos: readonly TarjetaAmbitoPromocion[]
  readonly decisiones: readonly TarjetaDecision[]
  /** Names of the 3er año groups still without a valid choice. */
  readonly pendientes: readonly string[]
  readonly pistaDecisiones: string
  readonly bloques: readonly BloquePromocion[]
  readonly pie: { readonly resumen: string; readonly sinGrupo: string | null }
  readonly egresados: readonly FilaEgresado[]
  readonly totalEgresados: number
  readonly pieEgresados: string
  readonly puedeConfirmar: boolean
  readonly estadoPie: string
  readonly confirmacion: { readonly titulo: string; readonly descripcion: string; readonly lineas: readonly LineaConfirmacion[] }
  readonly bloqueado: EstadoBloqueado | null
}

export interface EntradaPromocion {
  readonly vista: VistaPromocion
  readonly decisiones: Decisiones
  readonly filtros: FiltrosPromocion
}

function tarjetaDecision(vista: VistaPromocion, g: GrupoPromocion, decisiones: Decisiones): TarjetaDecision {
  const d = decisionDe(g, decisiones)
  const lideres = lideresTexto(g.lideres)
  const varios = g.lideres.length > 1
  const visitas = g.visitantes ? ` y ${plural(g.visitantes, 'visitante', 'visitantes')}` : ''
  const a = g.opciones?.pasanChicos
  const b = g.opciones?.pasaGrupo
  const sexo = sexoDe(g.subarea)
  const nuevoAnio = a?.nuevo?.anioEtiqueta ?? b?.grupo?.anioEtiqueta ?? ''
  const ambitoDestino = a?.nuevo?.ambito ?? b?.grupo?.ambito ?? 'Inside Out'
  const vuelveA = a?.grupo?.anioEtiqueta ?? ''

  const opciones: OpcionDecision[] = [
    {
      valor: 'pasan_chicos',
      titulo: esChicas(g.subarea) ? 'Pasan las chicas' : 'Pasan los chicos',
      descripcion: `Sus ${g.miembros} integrantes${visitas} van a un grupo nuevo de ${nuevoAnio} de ${ambitoDestino}, sin líder. ${g.nombre} vuelve a ${vuelveA} ${lideres ? `con ${lideres}` : 'sin líder'}, vacío.`,
      ...opcionA(g),
    },
    {
      valor: 'pasa_grupo',
      titulo: 'Pasa el grupo con su líder',
      descripcion: `Todo el grupo pasa a ${ambitoDestino} como ${b?.grupo?.anioEtiqueta ?? nuevoAnio}.${lideres ? ` ${lideres} ${varios ? 'empiezan' : 'empieza'} a servir en ${ambitoDestino}.` : ''}`,
      ...opcionB(g),
    },
  ]

  const avisos: AvisoDecision[] = []
  let nota: string | null = null
  if (d === 'pasan_chicos' && a?.nuevo && a.grupo) {
    const nombre = a.nuevo.choca ? `Se llamará «${a.nuevo.nombre}»: ${chocaCon(vista, a.nuevo.choca)}. ` : ''
    avisos.push({
      tono: 'info',
      titulo: `→ ${a.nuevo.ambito} · ${a.nuevo.anioEtiqueta} · ${sexo} (grupo nuevo, sin líder)`,
      texto: `${nombre}Asígnale líder después en Grupos.`,
    })
    nota = `${g.nombre} queda como ${a.grupo.nombre} en ${a.grupo.ambito}, ${lideres ? `con ${lideres} y` : 'sin líder y'} sin integrantes, para quienes llegan de Niños.`
  }
  if (d === 'pasa_grupo' && b?.grupo) {
    const destino = `${b.grupo.ambito} · ${b.grupo.subarea}`
    const origen = `${g.ambito} · ${g.subarea}`
    const mismos = b.servicios.every((s) => s.turnosDestino === s.turnos)
    if (b.servicios.length > 0 && mismos) {
      const multi = b.servicios.length > 1
      avisos.push({
        tono: 'marca',
        titulo: null,
        texto: `${unirY(b.servicios.map((s) => s.nombre))} ${multi ? 'dejan' : 'deja'} de servir en ${origen} y ${multi ? 'empiezan' : 'empieza'} en ${destino}, con sus mismos turnos.`,
      })
    } else {
      for (const s of b.servicios) {
        avisos.push({
          tono: 'marca',
          titulo: null,
          texto: `${s.nombre} deja de servir en ${origen} y empieza en ${destino}, con ${s.turnosDestino} de sus ${s.turnos} turnos.`,
        })
      }
    }
    if (b.grupo.choca) nota = `El grupo queda como ${b.grupo.nombre}: ${chocaCon(vista, b.grupo.choca)}.`
    // Transit keeps a first-year group of the sub-área only if another 3er año group goes back to it (S12 a, L38).
    const otroVuelve = porDecidir(vista).some((o) => o.id !== g.id && o.subareaId === g.subareaId && decisionDe(o, decisiones) === 'pasan_chicos')
    if (!otroVuelve) {
      avisos.push({
        tono: 'warning',
        titulo: null,
        texto: `${g.ambito} se queda sin grupo de ${vuelveA || '1er año'} · ${sexo} para quienes llegan de Niños. Puedes crearlo después en Grupos.`,
      })
    }
  }

  return {
    grupoId: g.id,
    titulo: g.nombre,
    ruta: `${g.subarea} · ${lideres ?? 'Sin líder'} · ${plural(g.miembros, 'integrante', 'integrantes')}${visitas}`,
    decision: d,
    decidido: d !== null,
    opciones,
    avisos,
    nota,
  }
}

const egresanTexto = (n: number): string => `${n} ${n === 1 ? 'egresa' : 'egresan'}`

function filaGrupo(g: GrupoPromocion, d: Decision | null): FilaPromocion {
  const destino = destinoDe(g, d)
  const lideres = lideresTexto(g.lideres)
  const pendiente = g.tipo === 'por_decidir' && d === null
  const vacio = quedaVacio(g, d)
  const cruza = d === 'pasa_grupo'

  let quedaNombre = 'Falta decidir'
  let quedaDetalle = 'Elige qué pasa en la tarjeta del grupo'
  if (!pendiente && destino) {
    quedaNombre = destino.nombre ?? g.nombre
    quedaDetalle = `${destino.ambito} · ${destino.anioEtiqueta}`
    if (vacio) quedaDetalle += lideres ? ' · vacío, con su líder' : ' · vacío, sin líder'
    else if (cruza) quedaDetalle += lideres ? ' · con su líder' : ' · sin líder'
    else if (!destino.nombreCambia) quedaDetalle += ' · el nombre no cambia'
  }

  let cifra = ''
  if (pendiente) cifra = `${g.suben} pasan a ${g.opciones?.pasanChicos.nuevo?.ambito ?? 'Inside Out'}`
  else if (d === 'pasan_chicos') cifra = `${g.opciones?.pasanChicos.llegan ?? g.suben} pasan a ${g.opciones?.pasanChicos.nuevo?.nombre ?? ''}`
  else if (g.egresan > 0) cifra = g.suben > 0 ? `${egresanTexto(g.egresan)} · ${g.suben} suben` : egresanTexto(g.egresan)
  else if (g.visitantes > 0) cifra = `y ${plural(g.visitantes, 'visitante', 'visitantes')}`

  const insignias: InsigniaPromocion[] = []
  if (pendiente) insignias.push({ texto: 'Por decidir', tono: 'warning' })
  if (pendiente || cruza) insignias.push({ texto: `Pasa a ${g.opciones?.pasaGrupo?.grupo?.ambito ?? 'Inside Out'}`, tono: 'info' })
  if (g.egresan > 0) insignias.push({ texto: egresanTexto(g.egresan), tono: 'default' })
  if (vacio) insignias.push({ texto: 'Queda vacío', tono: 'success' })

  return {
    id: g.id,
    nuevo: false,
    hoy: { nombre: g.nombre, detalle: lideres ? `${g.anioEtiqueta} · ${lideres}` : g.anioEtiqueta, sinLider: lideres === null },
    quedaComo: { nombre: quedaNombre, detalle: quedaDetalle, pendiente, sinLider: false },
    integrantes: g.miembros,
    cifra,
    insignias,
    etiqueta: `Abrir ${g.nombre}`,
  }
}

function filaNuevo(g: GrupoPromocion): FilaPromocion | null {
  const a = g.opciones?.pasanChicos
  if (!a?.nuevo?.nombre) return null
  return {
    id: `nuevo:${g.id}`,
    nuevo: true,
    hoy: { nombre: 'Grupo nuevo', detalle: 'Se crea al promover', sinLider: false },
    quedaComo: { nombre: a.nuevo.nombre, detalle: `${a.nuevo.ambito} · ${a.nuevo.anioEtiqueta}`, pendiente: false, sinLider: true },
    integrantes: a.llegan,
    cifra: `llegan de ${g.nombre}`,
    insignias: [
      { texto: 'Grupo nuevo', tono: 'info' },
      { texto: 'Sin líder', tono: 'warning' },
    ],
    etiqueta: `Abrir ${a.nuevo.nombre} (grupo nuevo)`,
  }
}

const coincide = (consulta: string, textos: readonly (string | null | undefined)[]): boolean =>
  consulta === '' || textos.some((t) => t && normalizar(t).includes(consulta))

const ambitoDeAnio = (vista: VistaPromocion, anio: number | null): AmbitoPromocion | null =>
  anio === null ? null : (vista.ambitos.find((a) => anio >= a.primerAnio && anio <= a.ultimoAnio) ?? null)

export function calcularPromocion({ vista, decisiones, filtros }: EntradaPromocion): ResultadoPromocion {
  const { totales } = vista
  const terceros = porDecidir(vista)
  const decisionPor = new Map(vista.grupos.map((g) => [g.id, g.tipo === 'por_decidir' ? decisionDe(g, decisiones) : null] as const))
  const pendientes = terceros.filter((g) => decisionPor.get(g.id) === null)
  const nuevos = terceros.filter((g) => decisionPor.get(g.id) === 'pasan_chicos')
  const vacios = vista.grupos.filter((g) => quedaVacio(g, decisionPor.get(g.id) ?? null)).length
  const ambitoNombre = vista.ambitos.find((a) => terceros[0]?.ambitoId === a.id)?.nombre ?? 'Transit'
  const ultimoTransit = terceros[0]?.anioEtiqueta ?? vista.ambitos[0]?.ultimoEtiqueta ?? '3er año'
  const destinoNombre = vista.ambitos[1]?.nombre ?? 'Inside Out'
  const tlr = vista.theLivingRoom?.nombre ?? 'The Living Room'
  const egresadosAmbito = (ambitoId: string): number => vista.egresados.filter((e) => ambitoDeAnio(vista, e.anio)?.id === ambitoId).length

  const metricas: MetricaVista[] = [
    { id: 'decidir', etiqueta: 'Por decidir', valor: pendientes.length, total: terceros.length, pista: `Grupos de ${ultimoTransit} sin elegir`, tono: 'warning', activa: false },
    {
      id: 'cruzan',
      etiqueta: `Pasan a ${destinoNombre}`,
      valor: totales.pasanInsideOut,
      pista: nuevos.length ? `En ${plural(nuevos.length, 'grupo nuevo', 'grupos nuevos')} sin líder` : `Estudiantes de ${ultimoTransit} de ${ambitoNombre}`,
      tono: 'info',
      activa: false,
    },
    { id: 'egresan', etiqueta: 'Egresan', valor: totales.egresan, pista: `A ${tlr}, sin grupo`, tono: 'muted', activa: false },
    { id: 'vacios', etiqueta: 'Quedan vacíos', valor: vacios, total: totales.grupos, pista: 'Con su líder, listos para recibir', tono: 'success', activa: false },
  ].map((m) => ({ ...(m as MetricaVista), activa: filtros.metrica === m.id }))

  const ambitos: TarjetaAmbitoPromocion[] = vista.ambitos.map((a) => {
    const grupos = vista.grupos.filter((g) => g.ambitoId === a.id)
    const pend = pendientes.filter((g) => g.ambitoId === a.id).length
    const egr = egresadosAmbito(a.id)
    const nuevosAqui = nuevos.filter((g) => g.opciones?.pasanChicos.nuevo?.ambito === a.nombre).length
    const insignias: { texto: string; tono: 'info' | 'warning' }[] = []
    if (pend) insignias.push({ texto: plural(pend, 'grupo por decidir', 'grupos por decidir'), tono: 'warning' })
    if (nuevosAqui) insignias.push({ texto: plural(nuevosAqui, 'grupo nuevo sin líder', 'grupos nuevos sin líder'), tono: 'warning' })
    if (terceros.some((g) => g.ambitoId === a.id)) insignias.push({ texto: `${totales.pasanInsideOut} pasan a ${destinoNombre}`, tono: 'info' })
    if (egr) insignias.push({ texto: `${egr} ${egr === 1 ? 'egresa' : 'egresan'}`, tono: 'info' })
    return {
      id: a.id,
      label: a.nombre,
      subtitulo: `${plural(grupos.length, 'grupo', 'grupos')} · ${a.primerEtiqueta} a ${a.ultimoEtiqueta}`,
      total: grupos.reduce((s, g) => s + g.miembros, 0),
      insignias,
      activa: filtros.ambito === a.id,
    }
  })

  // Groups, then the new groups of option (a) at the end of their Inside Out block.
  const consulta = normalizar(filtros.q.trim())
  const ordenAmbito = (nombre: string | null): number => {
    const i = vista.ambitos.findIndex((a) => a.nombre === nombre)
    return i < 0 ? vista.ambitos.length : i
  }
  type Entrada = { readonly fila: FilaPromocion; readonly ambitoId: string | null; readonly ambito: string; readonly subarea: string; readonly anio: number; readonly grupo: GrupoPromocion }
  const entradas: Entrada[] = []
  for (const g of vista.grupos) entradas.push({ fila: filaGrupo(g, decisionPor.get(g.id) ?? null), ambitoId: g.ambitoId, ambito: g.ambito, subarea: g.subarea, anio: g.anio, grupo: g })
  for (const g of nuevos) {
    const fila = filaNuevo(g)
    const nuevo = g.opciones?.pasanChicos.nuevo
    if (fila && nuevo) {
      const ambitoId = vista.ambitos.find((a) => a.nombre === nuevo.ambito)?.id ?? null
      entradas.push({ fila, ambitoId, ambito: nuevo.ambito ?? '', subarea: nuevo.subarea ?? g.subarea, anio: Number.MAX_SAFE_INTEGER, grupo: g })
    }
  }
  const filtroMetrica: Record<MetricaPromocion, (e: Entrada) => boolean> = {
    decidir: (e) => !e.fila.nuevo && e.grupo.tipo === 'por_decidir' && decisionPor.get(e.grupo.id) === null,
    cruzan: (e) => e.fila.nuevo || e.grupo.tipo === 'por_decidir',
    egresan: (e) => !e.fila.nuevo && e.grupo.egresan + e.grupo.visitantesEgresan > 0,
    vacios: (e) => !e.fila.nuevo && quedaVacio(e.grupo, decisionPor.get(e.grupo.id) ?? null),
  }
  const visibles = entradas
    .filter((e) => filtros.ambito === null || e.ambitoId === filtros.ambito)
    .filter((e) => filtros.metrica === null || filtroMetrica[filtros.metrica](e))
    .filter((e) => coincide(consulta, [e.fila.nuevo ? e.fila.quedaComo.nombre : e.grupo.nombre, ...e.grupo.lideres.map((l) => l.nombre), ...e.grupo.integrantes.map((p) => p.nombre)]))
    .sort(
      (x, y) =>
        ordenAmbito(x.ambito) - ordenAmbito(y.ambito) ||
        x.subarea.localeCompare(y.subarea, 'es') ||
        x.anio - y.anio ||
        x.fila.hoy.nombre.localeCompare(y.fila.hoy.nombre, 'es'),
    )
  const bloques: BloquePromocion[] = []
  for (const e of visibles) {
    const id = `${e.ambito}|${e.subarea}`
    const ultimo = bloques[bloques.length - 1]
    if (ultimo?.id === id) (ultimo.filas as FilaPromocion[]).push(e.fila)
    else bloques.push({ id, titulo: `${e.ambito} · ${e.subarea}`, filas: [e.fila] })
  }
  const nuevosVisibles = visibles.filter((e) => e.fila.nuevo).length
  const integrantesVisibles = visibles.filter((e) => !e.fila.nuevo).reduce((s, e) => s + e.grupo.miembros, 0)
  const totalFilas = vista.grupos.length + nuevos.length
  const pie = {
    resumen: `${visibles.length} de ${totalFilas} grupos${nuevos.length ? ` (${nuevosVisibles} ${nuevosVisibles === 1 ? 'nuevo' : 'nuevos'})` : ''} · ${integrantesVisibles} integrantes`,
    sinGrupo: totales.sinGrupo
      ? `Además, ${plural(totales.sinGrupo, 'estudiante sin grupo sube', 'estudiantes sin grupo suben')} de año en su ficha`
      : null,
  }

  const grupoPorId = new Map(vista.grupos.map((g) => [g.id, g] as const))
  const ultimoIo = vista.ambitos[vista.ambitos.length - 1]
  const egresados: FilaEgresado[] = vista.egresados
    .filter((e) => filtros.ambito === null || ambitoDeAnio(vista, e.anio)?.id === filtros.ambito)
    .filter((e) => coincide(consulta, [e.nombre, e.grupo]))
    .map((e) => {
      const ambito = (e.grupoId ? grupoPorId.get(e.grupoId)?.ambito : null) ?? ambitoDeAnio(vista, e.anio)?.nombre ?? ''
      return {
        personaId: e.personaId,
        nombre: e.nombre,
        grupo: e.grupo ?? 'Sin grupo',
        grupoDetalle: [ambito, e.anioEtiqueta].filter(Boolean).join(' · '),
        anioFinal: e.anioFinalEtiqueta ?? e.anioEtiqueta ?? '',
        pasaA: e.destino ? `${tlr} · Sin grupo · ${sexoDe(e.destino)}` : `${tlr} · Sin grupo`,
        pasaADetalle: `Un director de ${tlr} le asigna grupo`,
      }
    })
  const pieEgresados = `${egresados.length} de ${vista.egresados.length} · los grupos de ${ultimoIo?.ultimoEtiqueta ?? '6to año'} quedan con su líder en ${ultimoIo?.primerEtiqueta ?? '4to año'}`

  const lineas: LineaConfirmacion[] = [{ icono: 'subir', texto: `${plural(totales.grupos, 'grupo', 'grupos')} y ${totales.suben} estudiantes suben un año.` }]
  for (const g of terceros) {
    const d = decisionPor.get(g.id)
    const lideres = lideresTexto(g.lideres)
    if (d === 'pasan_chicos') {
      const a = g.opciones!.pasanChicos
      lineas.push({
        icono: 'flecha',
        texto: `${g.nombre}: ${esChicas(g.subarea) ? 'pasan las chicas' : 'pasan los chicos'} a ${a.nuevo?.nombre}, grupo nuevo de ${a.nuevo?.ambito} sin líder; el grupo vuelve a ${a.grupo?.anioEtiqueta} ${lideres ? `con ${lideres}` : 'sin líder'}.`,
      })
    } else if (d === 'pasa_grupo') {
      const b = g.opciones!.pasaGrupo!
      lineas.push({ icono: 'flecha', texto: `${g.nombre}: pasa entero a ${b.grupo?.ambito} como ${b.grupo?.nombre}, ${lideres ? `con ${lideres}` : 'sin líder'}.` })
    }
  }
  const nombresNuevos = nuevos.map((g) => g.opciones?.pasanChicos.nuevo?.nombre).filter((n): n is string => !!n)
  if (nombresNuevos.length) {
    lineas.push({
      icono: 'grupo',
      texto: `Se ${nombresNuevos.length === 1 ? 'crea' : 'crean'} ${plural(nombresNuevos.length, 'grupo nuevo', 'grupos nuevos')} en ${destinoNombre}, sin líder: ${unirY(nombresNuevos)}.`,
    })
  }
  if (totales.egresan) lineas.push({ icono: 'egresan', texto: `${totales.egresan} ${totales.egresan === 1 ? 'egresa' : 'egresan'} a ${tlr}, sin grupo.` })
  if (totales.sinGrupo) lineas.push({ icono: 'grupo', texto: `${plural(totales.sinGrupo, 'estudiante sin grupo sube', 'estudiantes sin grupo suben')} de año en su ficha.` })

  let bloqueado: EstadoBloqueado | null = null
  if (vista.bloqueado && vista.ultima) {
    const u = vista.ultima
    const fecha = fechaPromocion(u.aplicadaAt)
    const hora = horaPromocion(u.aplicadaAt)
    const quien = u.por ? `Lo hizo ${u.por} a las ${hora}.` : `Se aplicó a las ${hora}.`
    const proxima = u.proxima ? ` La próxima promoción de ${vista.campus.nombre} se habilita el ${fechaPromocion(u.proxima)}, 180 días después.` : ''
    bloqueado = {
      titulo: `Ya se promovió este campus el ${fecha}`,
      fecha,
      texto: `${quien}${proxima} Se guardó una copia de cómo estaba todo; si algo salió mal, pide ayuda en Soporte.`,
      datos: u.resumen
        ? [
            { etiqueta: 'Grupos que subieron', valor: u.resumen.grupos },
            { etiqueta: 'Fichas que subieron de año', valor: u.resumen.fichasSuben },
            { etiqueta: 'Grupos nuevos sin líder', valor: u.resumen.gruposNuevos.length },
            { etiqueta: `Egresaron a ${tlr}`, valor: u.resumen.egresan },
          ]
        : [],
    }
  }

  return {
    resumen: { campus: vista.campus.nombre, grupos: totales.grupos, suben: totales.suben, pasanInsideOut: totales.pasanInsideOut, egresan: totales.egresan },
    metricas,
    ambitos,
    decisiones: terceros.map((g) => tarjetaDecision(vista, g, decisiones)),
    pendientes: pendientes.map((g) => g.nombre),
    pistaDecisiones: pendientes.length ? `${pendientes.length} por decidir · obligatorio para confirmar` : 'Todo decidido',
    bloques,
    pie,
    egresados,
    totalEgresados: vista.egresados.length,
    pieEgresados,
    puedeConfirmar: decisionesParaAplicar(vista, decisiones) !== null,
    estadoPie: pendientes.length
      ? `Falta decidir ${plural(pendientes.length, 'grupo', 'grupos')} de ${ultimoTransit}: ${unirY(pendientes.map((g) => g.nombre))}.`
      : 'Todo listo. Al confirmar verás el resumen antes de aplicar.',
    confirmacion: {
      titulo: `¿Promover ${vista.campus.nombre}?`,
      descripcion: `${unirAmbitos(vista.ambitos.map((a) => a.nombre))} suben un año ahora mismo. No se puede deshacer desde la app.`,
      lineas,
    },
    bloqueado,
  }
}

// ── Group drawer ─────────────────────────────────────────────────────

export interface PersonaDetalle {
  readonly personaId: string
  readonly nombre: string
  readonly detalle: string
  readonly egresa: boolean
}

export interface DetallePromocion {
  readonly titulo: string
  readonly meta: string
  /** A 3er año group without a choice: "Ir a la decisión". */
  readonly pendiente: boolean
  readonly grupoDecision: string | null
  /** The new group of option (a). */
  readonly sinLider: boolean
  readonly subareaDestino: string | null
  readonly datos: readonly { readonly etiqueta: string; readonly valor: string | number }[]
  readonly quedaComo: { readonly nombre: string; readonly detalle: string; readonly nota: string } | null
  readonly integrantes: readonly PersonaDetalle[]
  readonly visitantes: readonly PersonaDetalle[]
}

/** The read-only drawer of a row (`FilaPromocion.id`); `null` when it is not in the plan. */
export function detallePromocion(vista: VistaPromocion, decisiones: Decisiones, filaId: string): DetallePromocion | null {
  if (filaId.startsWith('nuevo:')) {
    const g = vista.grupos.find((x) => x.id === filaId.slice('nuevo:'.length))
    if (!g || g.tipo !== 'por_decidir' || decisionDe(g, decisiones) !== 'pasan_chicos') return null
    const nuevo = g.opciones!.pasanChicos.nuevo!
    const llegan = g.integrantes.filter((p) => !p.egresa)
    const persona = (p: IntegrantePromocion, detalle: string): PersonaDetalle => ({ personaId: p.personaId, nombre: p.nombre, detalle, egresa: false })
    return {
      titulo: nuevo.nombre ?? '',
      meta: `${nuevo.ambito} · ${nuevo.subarea} · grupo nuevo`,
      pendiente: false,
      grupoDecision: null,
      sinLider: true,
      subareaDestino: `${nuevo.ambito} · ${nuevo.subarea}`,
      datos: [
        { etiqueta: 'Hoy', valor: 'No existe' },
        { etiqueta: 'Después', valor: nuevo.anioEtiqueta ?? '—' },
        { etiqueta: 'Integrantes', valor: g.opciones!.pasanChicos.llegan },
        { etiqueta: 'Llegan de', valor: g.nombre },
      ],
      quedaComo: null,
      integrantes: llegan.filter((p) => p.estado === 'miembro').map((p) => persona(p, `${p.anioEtiqueta ?? g.anioEtiqueta} · ${g.ambito} → ${nuevo.anioEtiqueta} · ${nuevo.ambito}`)),
      visitantes: llegan.filter((p) => p.estado === 'visitante').map((p) => persona(p, 'Visitante · se mueve con el grupo')),
    }
  }

  const g = vista.grupos.find((x) => x.id === filaId)
  if (!g) return null
  const d = g.tipo === 'por_decidir' ? decisionDe(g, decisiones) : null
  const pendiente = g.tipo === 'por_decidir' && d === null
  const destino = destinoDe(g, d)
  const fila = filaGrupo(g, d)
  const lideres = lideresTexto(g.lideres)
  const tlr = vista.theLivingRoom?.nombre ?? 'The Living Room'
  const nuevo = g.opciones?.pasanChicos.nuevo
  const ioDestino = g.opciones?.pasaGrupo?.grupo

  const detalleMiembro = (p: IntegrantePromocion): string => {
    if (p.egresa) return `Año final ${p.anioEtiqueta ?? g.anioEtiqueta} · pasa a ${tlr}`
    const desde = p.anioEtiqueta ?? 'Sin año'
    if (pendiente) return `${desde} → ${p.anioNuevoEtiqueta ?? '—'} · ${nuevo?.ambito ?? ioDestino?.ambito ?? 'Inside Out'}`
    if (d === 'pasan_chicos') return `${desde} → ${p.anioNuevoEtiqueta ?? '—'} · ${nuevo?.nombre ?? ''}`
    return `${desde} → ${p.anioNuevoEtiqueta ?? '—'}`
  }
  const persona = (p: IntegrantePromocion, detalle: string): PersonaDetalle => ({ personaId: p.personaId, nombre: p.nombre, detalle, egresa: p.egresa })

  let nota = lideres ? `Sigue con ${lideres}.` : 'Sigue sin líder; asígnale uno en Grupos.'
  if (d === 'pasa_grupo' && lideres) nota = `${lideres} ${g.lideres.length > 1 ? 'empiezan' : 'empieza'} a servir en ${ioDestino?.ambito} · ${ioDestino?.subarea}.`

  return {
    titulo: g.nombre,
    meta: `${g.ambito} · ${g.subarea} · ${g.anioEtiqueta}`,
    pendiente,
    grupoDecision: pendiente ? g.id : null,
    sinLider: false,
    subareaDestino: null,
    datos: [
      { etiqueta: 'Hoy', valor: g.anioEtiqueta },
      { etiqueta: 'Después', valor: pendiente ? '—' : (destino?.anioEtiqueta ?? '—') },
      { etiqueta: 'Integrantes', valor: g.miembros },
      { etiqueta: 'Egresan', valor: g.egresan },
    ],
    quedaComo: pendiente ? null : { nombre: fila.quedaComo.nombre, detalle: fila.quedaComo.detalle, nota },
    integrantes: g.integrantes.filter((p) => p.estado === 'miembro').map((p) => persona(p, detalleMiembro(p))),
    visitantes: g.integrantes
      .filter((p) => p.estado === 'visitante')
      .map((p) => persona(p, p.egresa ? `Visitante · egresa a ${tlr}` : 'Visitante · se mueve con el grupo')),
  }
}
