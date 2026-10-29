/**
 * Estudiantes — the pure view model of /estudiantes/grupos (C2a of
 * odd/tasks/estudiantes-fase-b.md; artboards 06 / 07 of
 * design/estudiantes-asistencia, list anatomy of
 * docs/design-system/patterns.md#list-screen-anatomy).
 *
 * Scope: ámbito (Transit, Inside Out, The Living Room) → sub-área (Grupos de
 * Chicas / Chicos). A level with a single option is fixed: a directora de
 * grupo manages one sub-área, so she gets no scope cards and no link up. The
 * campus chosen in the app narrows everything when the caller manages groups
 * there.
 *
 * The attention metrics (Por confirmar, Grupos sin líder, Desactivados) count
 * the whole scope and ARE the filter; "Desactivados" is the only way to list
 * deactivated groups. "Asistencia baja" and the Sunday column wait for C3
 * (attendance marking; L23).
 *
 * Every filter lives in the URL (`?ambito=&area=&metrica=&anio=&orden=&q=`).
 */
import type { Experiencia, GrupoGestion, Integrante, SubareaGestionable } from './grupos-datos'

export type MetricaGrupos = 'confirmar' | 'sinLider' | 'desactivados'
export type OrdenGrupos = 'anio' | 'nombre' | 'integrantes'

export interface FiltrosGrupos {
  readonly ambito: string | null
  readonly area: string | null
  readonly metrica: MetricaGrupos | null
  readonly anio: number | null
  readonly orden: OrdenGrupos
  readonly q: string
}

export const FILTROS_INICIALES: FiltrosGrupos = { ambito: null, area: null, metrica: null, anio: null, orden: 'anio', q: '' }

/** What "Limpiar" of the filters sheet empties. */
export const LIMPIAR_HOJA: Partial<FiltrosGrupos> = { anio: null, orden: 'anio' }

export const ORDENES: readonly OrdenGrupos[] = ['anio', 'nombre', 'integrantes']

export const ETIQUETA_ORDEN: Readonly<Record<OrdenGrupos, string>> = {
  anio: 'Año escolar',
  nombre: 'Grupo A–Z',
  integrantes: 'Más integrantes',
}

const PIE_ORDEN: Readonly<Record<OrdenGrupos, string>> = {
  anio: 'Orden: año escolar',
  nombre: 'Orden: grupo A–Z',
  integrantes: 'Orden: más integrantes primero',
}

const METRICAS: readonly MetricaGrupos[] = ['confirmar', 'sinLider', 'desactivados']

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

export const miembrosDe = (grupo: GrupoGestion): Integrante[] => grupo.integrantes.filter((i) => i.estado === 'miembro')
export const visitantesDe = (grupo: GrupoGestion): Integrante[] => grupo.integrantes.filter((i) => i.estado === 'visitante')
/** Visitors from the 3rd visit: "Confirmar como miembro" (A2). */
export const porConfirmarDe = (grupo: GrupoGestion): Integrante[] => visitantesDe(grupo).filter((i) => i.sugerirConfirmar)

/** "Ana", "Ana y Paola", "Ana, Paola y Rosa"; `null` without leaders. */
export function lideresTexto(grupo: GrupoGestion): string | null {
  const nombres = grupo.lideres.map((l) => l.nombre)
  if (nombres.length === 0) return null
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** "Jueves · 19:30" for the weekly meeting of a The Living Room group; `null` without a day. */
export function horarioTexto(dia: number | null, hora: string | null): string | null {
  if (dia === null || dia < 0 || dia > 6) return null
  return hora ? `${DIAS_SEMANA[dia]} · ${hora.slice(0, 5)}` : DIAS_SEMANA[dia]
}

/** The visits of a visitor below the 3rd (from the 3rd they are "por confirmar"). */
export function textoVisita(visitas: number): string {
  if (visitas <= 0) return 'Aún sin visitas marcadas'
  if (visitas === 1) return '1.ª visita'
  return `${visitas}.ª visita · se sugiere desde la 3.ª`
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export interface TotalesGrupos {
  readonly grupos: number
  readonly integrantes: number
  readonly visitantes: number
  readonly porConfirmar: number
  readonly sinLider: number
  readonly desactivados: number
}

/** One attention metric, in the shape of `MetricaAtencion` (components/ui/metricas-atencion.tsx). */
export interface MetricaVista {
  readonly id: MetricaGrupos
  readonly etiqueta: string
  readonly valor: number
  readonly total?: number
  readonly pista: string
  readonly tono: 'info' | 'warning' | 'muted'
  readonly activa: boolean
}

export interface TarjetaAlcance {
  readonly id: string
  readonly label: string
  readonly grupos: number
  readonly integrantes: number
  readonly sinLider: number
  readonly porConfirmar: number
  /** Who directs the sub-área (its first director de grupo); `null` on ámbito cards. */
  readonly responsable: string | null
}

export interface Miga {
  readonly id: 'raiz' | 'ambito' | 'area'
  readonly etiqueta: string
  /** What going there changes; `null` = plain text (current level or a fixed scope). */
  readonly parche: Partial<FiltrosGrupos> | null
}

export interface ChipGrupos {
  readonly id: string
  readonly etiqueta: string
  readonly parche: Partial<FiltrosGrupos>
}

export interface VistaGrupos {
  /** The filters after fixing single-option levels and dropping unknown ids. */
  readonly filtros: FiltrosGrupos
  readonly titulo: string
  /** The ámbito shown before the summary inside a sub-área ("Transit · …"). */
  readonly resumenPrefijo: string | null
  readonly migas: readonly Miga[]
  /** The phone "‹ parent"; `null` at the root of the caller's scope. */
  readonly atras: { readonly etiqueta: string; readonly parche: Partial<FiltrosGrupos> } | null
  readonly totales: TotalesGrupos
  readonly metricas: readonly MetricaVista[]
  readonly tarjetas: { readonly nivel: 'ambitos' | 'areas' | null; readonly items: readonly TarjetaAlcance[] }
  readonly visibles: readonly GrupoGestion[]
  /** The años of the scope with their active groups; empty outside Transit / Inside Out. */
  readonly anios: readonly { readonly numero: number; readonly etiqueta: string; readonly cantidad: number }[]
  /** Header of the año / zona column. */
  readonly columnaAnio: string
  readonly filtrosEnHoja: number
  readonly chips: readonly ChipGrupos[]
  readonly pie: { readonly resumen: string; readonly orden: string }
}

export interface EntradaVistaGrupos {
  readonly grupos: readonly GrupoGestion[]
  readonly subareas: readonly SubareaGestionable[]
  readonly filtros: FiltrosGrupos
  /** The campus chosen in the app header; `null` = every campus. */
  readonly campusId: string | null
}

interface Nodo {
  readonly id: string
  readonly label: string
  readonly experiencia: Experiencia
}

function nodos(entradas: readonly Nodo[]): Nodo[] {
  const porId = new Map<string, Nodo>()
  for (const entrada of entradas) if (!porId.has(entrada.id)) porId.set(entrada.id, entrada)
  return [...porId.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

function totalesDe(grupos: readonly GrupoGestion[]): TotalesGrupos {
  const activos = grupos.filter((g) => g.activo)
  return {
    grupos: activos.length,
    integrantes: activos.reduce((suma, g) => suma + miembrosDe(g).length, 0),
    visitantes: activos.reduce((suma, g) => suma + visitantesDe(g).length, 0),
    porConfirmar: activos.reduce((suma, g) => suma + porConfirmarDe(g).length, 0),
    sinLider: activos.filter((g) => g.lideres.length === 0).length,
    desactivados: grupos.length - activos.length,
  }
}

function coincide(grupo: GrupoGestion, consulta: string): boolean {
  if (!consulta) return true
  const nombres = [grupo.nombre, ...grupo.lideres.map((l) => l.nombre), ...grupo.integrantes.map((i) => i.nombre)]
  return nombres.some((nombre) => normalizar(nombre).includes(consulta))
}

const COMPARADORES: Readonly<Record<OrdenGrupos, (a: GrupoGestion, b: GrupoGestion) => number>> = {
  anio: (a, b) =>
    a.ambito.localeCompare(b.ambito, 'es') ||
    (a.anio ?? Number.MAX_SAFE_INTEGER) - (b.anio ?? Number.MAX_SAFE_INTEGER) ||
    a.subarea.localeCompare(b.subarea, 'es') ||
    a.nombre.localeCompare(b.nombre, 'es'),
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  integrantes: (a, b) => miembrosDe(b).length - miembrosDe(a).length || a.nombre.localeCompare(b.nombre, 'es'),
}

const esDirector = (rol: string): boolean => normalizar(rol).startsWith('director')

function metricasDe(totales: TotalesGrupos, activa: MetricaGrupos | null): MetricaVista[] {
  return [
    { id: 'confirmar', etiqueta: 'Por confirmar', valor: totales.porConfirmar, pista: 'Visitantes desde la 3.ª visita', tono: 'info', activa: activa === 'confirmar' },
    {
      id: 'sinLider',
      etiqueta: 'Grupos sin líder',
      valor: totales.sinLider,
      total: totales.grupos,
      pista: 'Asígnale uno desde el grupo',
      tono: 'warning',
      activa: activa === 'sinLider',
    },
    { id: 'desactivados', etiqueta: 'Desactivados', valor: totales.desactivados, pista: 'Ocultos de la lista', tono: 'muted', activa: activa === 'desactivados' },
  ]
}

const ETIQUETA_METRICA: Readonly<Record<MetricaGrupos, string>> = {
  confirmar: 'Por confirmar',
  sinLider: 'Sin líder',
  desactivados: 'Desactivados',
}

export function calcularVistaGrupos({ grupos, subareas, filtros, campusId }: EntradaVistaGrupos): VistaGrupos {
  // The app's campus narrows the screen only where the caller manages groups.
  const campus = campusId !== null && subareas.some((s) => s.campusId === campusId) ? campusId : null
  const enCampus = campus === null ? grupos : grupos.filter((g) => g.campusId === campus)
  const subareasCampus = campus === null ? subareas : subareas.filter((s) => s.campusId === campus)

  const ambitos = nodos([
    ...subareasCampus.map((s) => ({ id: s.ambitoId, label: s.ambito, experiencia: s.experiencia })),
    ...enCampus.map((g) => ({ id: g.ambitoId, label: g.ambito, experiencia: g.experiencia })),
  ])
  const ambito =
    ambitos.length === 1 ? ambitos[0] : (ambitos.find((a) => a.id === filtros.ambito) ?? null)

  const areas = ambito
    ? nodos([
        ...subareasCampus.filter((s) => s.ambitoId === ambito.id).map((s) => ({ id: s.subareaId, label: s.subarea, experiencia: s.experiencia })),
        ...enCampus.filter((g) => g.ambitoId === ambito.id).map((g) => ({ id: g.subareaId, label: g.subarea, experiencia: g.experiencia })),
      ])
    : []
  const area = areas.length === 1 ? areas[0] : (areas.find((a) => a.id === filtros.area) ?? null)

  const conAnio = ambito?.experiencia === 'estudiantes'
  const normalizados: FiltrosGrupos = {
    ...filtros,
    ambito: ambito?.id ?? null,
    area: area?.id ?? null,
    anio: conAnio ? filtros.anio : null,
  }

  const enAlcance = enCampus.filter((g) => (!ambito || g.ambitoId === ambito.id) && (!area || g.subareaId === area.id))
  const totales = totalesDe(enAlcance)
  const activos = enAlcance.filter((g) => g.activo)

  const consulta = normalizar(normalizados.q)
  const { metrica, anio, orden } = normalizados
  const visibles = enAlcance
    .filter((g) => {
      if (metrica === 'desactivados' ? g.activo : !g.activo) return false
      if (metrica === 'confirmar' && porConfirmarDe(g).length === 0) return false
      if (metrica === 'sinLider' && g.lideres.length > 0) return false
      if (anio !== null && g.anio !== anio) return false
      return coincide(g, consulta)
    })
    .sort(COMPARADORES[orden])

  const anios = conAnio
    ? [...new Map(activos.filter((g) => g.anio !== null).map((g) => [g.anio as number, g.anioEtiqueta ?? `${g.anio}`])).entries()]
        .sort(([a], [b]) => a - b)
        .map(([numero, etiqueta]) => ({ numero, etiqueta, cantidad: activos.filter((g) => g.anio === numero).length }))
    : []

  const tarjeta = (id: string, label: string, delNodo: readonly GrupoGestion[], responsable: string | null): TarjetaAlcance => {
    const t = totalesDe(delNodo)
    return { id, label, grupos: t.grupos, integrantes: t.integrantes, sinLider: t.sinLider, porConfirmar: t.porConfirmar, responsable }
  }
  let tarjetas: VistaGrupos['tarjetas'] = { nivel: null, items: [] }
  if (!ambito && ambitos.length > 1) {
    tarjetas = {
      nivel: 'ambitos',
      items: ambitos.map((a) => tarjeta(a.id, a.label, enCampus.filter((g) => g.ambitoId === a.id), null)),
    }
  } else if (ambito && !area && areas.length > 1) {
    tarjetas = {
      nivel: 'areas',
      items: areas.map((a) => {
        const director = subareasCampus.filter((s) => s.subareaId === a.id).flatMap((s) => s.responsables).find((r) => esDirector(r.rol))
        return tarjeta(a.id, a.label, enAlcance.filter((g) => g.subareaId === a.id), director?.nombre ?? null)
      }),
    }
  }

  const migas: Miga[] = [
    { id: 'raiz', etiqueta: 'Estudiantes', parche: ambito && ambitos.length > 1 ? { ambito: null, area: null, anio: null } : null },
  ]
  if (ambito) migas.push({ id: 'ambito', etiqueta: ambito.label, parche: area && areas.length > 1 ? { area: null } : null })
  if (area) migas.push({ id: 'area', etiqueta: area.label, parche: null })
  const anterior = migas
    .slice(0, -1)
    .reverse()
    .find((m) => m.parche !== null)

  const experiencias = new Set(enAlcance.map((g) => g.experiencia))
  if (ambito) experiencias.add(ambito.experiencia)
  const columnaAnio = experiencias.size > 1 ? 'Año o zona' : experiencias.has('the_living_room') ? 'Zona' : 'Año'

  const chips: ChipGrupos[] = []
  if (metrica) chips.push({ id: 'metrica', etiqueta: ETIQUETA_METRICA[metrica], parche: { metrica: null } })
  if (anio !== null) {
    chips.push({ id: 'anio', etiqueta: anios.find((a) => a.numero === anio)?.etiqueta ?? `${anio}`, parche: { anio: null } })
  }

  const resumen =
    metrica === 'desactivados'
      ? `${visibles.length} de ${plural(totales.desactivados, 'grupo desactivado', 'grupos desactivados')}`
      : `${visibles.length} de ${plural(totales.grupos, 'grupo activo', 'grupos activos')} · ${plural(totales.integrantes, 'integrante', 'integrantes')}`

  return {
    filtros: normalizados,
    titulo: area ? area.label : ambito ? `Grupos de ${ambito.label}` : 'Grupos de Estudiantes',
    resumenPrefijo: area && ambito ? ambito.label : null,
    migas,
    atras: anterior?.parche ? { etiqueta: anterior.etiqueta, parche: anterior.parche } : null,
    totales,
    metricas: metricasDe(totales, metrica),
    tarjetas,
    visibles,
    anios,
    columnaAnio,
    filtrosEnHoja: (anio !== null ? 1 : 0) + (orden !== 'anio' ? 1 : 0),
    chips,
    pie: { resumen, orden: PIE_ORDEN[orden] },
  }
}

/** Pressing a metric turns its filter on; pressing it again turns it off. */
export function parcheMetrica(filtros: FiltrosGrupos, id: MetricaGrupos): Partial<FiltrosGrupos> {
  return { metrica: filtros.metrica === id ? null : id }
}

/** Entering a scope card: an ámbito resets the sub-área and the año, a sub-área keeps the rest. */
export function parcheTarjeta(nivel: 'ambitos' | 'areas', id: string): Partial<FiltrosGrupos> {
  return nivel === 'ambitos' ? { ambito: id, area: null, anio: null } : { area: id }
}

export type ParametrosDeUrl = Readonly<Record<string, string | readonly string[] | undefined>>

const primero = (valor: string | readonly string[] | undefined): string | undefined =>
  typeof valor === 'string' ? valor : valor?.[0]

export function leerFiltrosDeUrl(parametros: ParametrosDeUrl): FiltrosGrupos {
  const metrica = primero(parametros.metrica)
  const orden = primero(parametros.orden)
  const anio = Number.parseInt(primero(parametros.anio) ?? '', 10)
  return {
    ambito: primero(parametros.ambito) || null,
    area: primero(parametros.area) || null,
    metrica: METRICAS.includes(metrica as MetricaGrupos) ? (metrica as MetricaGrupos) : null,
    anio: Number.isInteger(anio) && anio > 0 ? anio : null,
    orden: ORDENES.includes(orden as OrdenGrupos) ? (orden as OrdenGrupos) : 'anio',
    q: primero(parametros.q) ?? '',
  }
}

export function escribirFiltrosEnUrl(filtros: FiltrosGrupos): string {
  const consulta = new URLSearchParams()
  if (filtros.ambito) consulta.set('ambito', filtros.ambito)
  if (filtros.area) consulta.set('area', filtros.area)
  if (filtros.metrica) consulta.set('metrica', filtros.metrica)
  if (filtros.anio !== null) consulta.set('anio', String(filtros.anio))
  if (filtros.orden !== 'anio') consulta.set('orden', filtros.orden)
  if (filtros.q.trim()) consulta.set('q', filtros.q.trim())
  return consulta.toString()
}
