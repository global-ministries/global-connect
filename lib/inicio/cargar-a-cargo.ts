/**
 * What the home shows of each cargo in «A tu cargo» (odd/tasks/home-por-rol.md
 * T4, S5–S7; design/home-por-rol 05, 06, 09, 10). One loader per cargo, all
 * through the session client, so RLS still decides what each person reads:
 *
 * - grupo-lider: next meeting and place (cargarGruposMiembro), members,
 *   attendance of the last meeting, absent 3+ weeks (v_salud_miembros_grupo)
 *   and new in 30 days. Birthdays have their own section (cargar-cumpleanos).
 * - etapa / segmento: the groups of that etapa, or of that segmento as the
 *   director general sees it (alcance «segmento» or only the etapas marked
 *   for them, as gdv_dg_grupos_visibles), never the whole campus (S7). The
 *   week read is the last complete one (Monday to Sunday before today).
 * - area-dream-team: the area and every equipo under it; the volunteers
 *   (postulado, en orientación, activo) without Próximo Paso, shown only when
 *   the person may mark them (proximo_paso_puede_marcar).
 *
 * A cargo whose loader fails, throws or takes longer than TIEMPO_MAXIMO_CARGO_MS
 * comes back `null` (logged) and its block is hidden; the others are kept.
 * The loaders are memoized per request (React `cache`), so the counts of
 * «Para responder» (cargar-pendientes) and the blocks read once.
 */
import { cache } from 'react'

import { fetchResumenPendientes } from '@/lib/platform/dream-team/pendientes'

import type { ClienteInicio } from './cargar-hechos'
import { cargarGruposMiembro, type ReunionGrupo } from './cargar-grupos-miembro'
import type { CargoInicio } from './decidir-secciones'

const TIEMPO_MAXIMO_MS = 3000
/** A whole cargo: several reads one after another. */
export const TIEMPO_MAXIMO_CARGO_MS = 6000
const TAMANO_PAGINA = 1000
const TAMANO_LOTE_IDS = 100
/** Below this attendance last week a group is «en riesgo». */
export const UMBRAL_RIESGO = 50
const SEMANAS_AUSENTE = 3
const ESTADOS_VOLUNTARIO = ['postulado', 'en_orientacion', 'activo'] as const

export type EstadoVoluntario = (typeof ESTADOS_VOLUNTARIO)[number]

/** One group of an etapa or segmento, as of last week. */
export type GrupoAlcance = {
  grupoId: string
  nombre: string | null
  lideres: string[]
  /** null when the group did not report last week. */
  asistencia: number | null
  reporto: boolean
}

export type ResumenGrupos = {
  grupos: GrupoAlcance[]
  personas: number | null
  /** Average of the groups that reported; null when none did. */
  asistencia: number | null
  enRiesgo: number
  sinReporte: number
}

export type DatosGrupoLider = {
  tipo: 'grupo-lider'
  grupoId: string
  nombre: string | null
  proximaReunion: ReunionGrupo | null
  lugar: string | null
  miembros: number | null
  /** % of the last meeting and its date. */
  ultimaReunion: { fecha: string; asistencia: number } | null
  ausentes: string[] | null
  nuevos: number | null
}

export type DatosEtapa = ResumenGrupos & { tipo: 'etapa'; directorEtapaId: string; nombre: string | null }

export type EtapaDeSegmento = ResumenGrupos & { directorEtapaId: string; directores: string[] }

export type DatosSegmento = ResumenGrupos & { tipo: 'segmento'; segmentoId: string; nombre: string | null; etapas: EtapaDeSegmento[] }

export type Voluntario = { usuarioId: string; nombre: string; estado: EstadoVoluntario; equipo: string | null }

export type DatosArea = {
  tipo: 'area-dream-team'
  equipoId: string
  nombre: string | null
  activos: number
  postulados: number
  enOrientacion: number
  /** Only when it is the person's one area: the RPC counts their whole scope. */
  sinTurno: number | null
  /** Without Próximo Paso; empty when the person may not mark them. */
  sinProximoPaso: Voluntario[]
}

export type DatosCargo = DatosGrupoLider | DatosEtapa | DatosSegmento | DatosArea

export type PedidoACargo = {
  authId: string
  usuarioId: string
  /** YYYY-MM-DD in Caracas. */
  hoy: string
  cargos: CargoInicio[]
}

type Respuesta = { data: unknown; error: { message?: string } | null; count?: number | null }

/** Runs one source; on error, throw or time-out logs and returns `vacio`. */
export async function intentar<T>(fuente: string, leer: () => PromiseLike<T>, vacio: T, ms = TIEMPO_MAXIMO_MS): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`más de ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([leer(), limite])
  } catch (error) {
    console.error(`Inicio: no se pudo leer ${fuente}:`, error instanceof Error ? error.message : error)
    return vacio
  } finally {
    clearTimeout(reloj)
  }
}

async function datos(consulta: PromiseLike<Respuesta>): Promise<unknown> {
  const { data, error } = await consulta
  if (error) throw new Error(error.message ?? 'error de Supabase')
  return data
}

async function contar(consulta: PromiseLike<Respuesta>): Promise<number> {
  const { count, error } = await consulta
  if (error) throw new Error(error.message ?? 'error de Supabase')
  if (typeof count !== 'number') throw new Error('sin conteo')
  return count
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const filas = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(objeto).filter((f): f is Record<string, unknown> => f !== null) : []

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const nombreDe = (u: unknown): string | null => {
  const p = objeto(u)
  return [texto(p?.nombre), texto(p?.apellido)].filter(Boolean).join(' ') || null
}

const unicos = (ids: (string | null)[]): string[] => [...new Set(ids.filter((id): id is string => id !== null))]

/** Every page of a growing read, so the API row cap never truncates a count. */
async function paginado(pagina: (desde: number, hasta: number) => PromiseLike<Respuesta>): Promise<Record<string, unknown>[]> {
  const todas: Record<string, unknown>[] = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const lote = filas(await datos(pagina(desde, desde + TAMANO_PAGINA - 1)))
    todas.push(...lote)
    if (lote.length < TAMANO_PAGINA) return todas
  }
}

/** `.in()` travels in the URL: long id lists go in batches. */
async function porLotes(ids: string[], leer: (lote: string[]) => Promise<Record<string, unknown>[]>): Promise<Record<string, unknown>[]> {
  const todas: Record<string, unknown>[] = []
  for (let i = 0; i < ids.length; i += TAMANO_LOTE_IDS) todas.push(...(await leer(ids.slice(i, i + TAMANO_LOTE_IDS))))
  return todas
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Monday and Sunday of the last complete week before `hoy`. */
export function semanaAnterior(hoy: string): { desde: string; hasta: string } {
  const dia = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7
  const lunes = sumarDias(hoy, -dia)
  return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) }
}

const porcentaje = (parte: number, total: number): number => Math.round((parte / total) * 100)

// ── Groups of an etapa or segmento ───────────────────────────────────

/** Name, leaders and last week's attendance of each active group. */
export const resumirGrupos = cache(async (supabase: ClienteInicio, idsClave: string, hoy: string): Promise<ResumenGrupos> => {
  const ids = idsClave ? idsClave.split(',') : []
  if (ids.length === 0) return { grupos: [], personas: 0, asistencia: null, enRiesgo: 0, sinReporte: 0 }
  const semana = semanaAnterior(hoy)

  const [grupos, eventos, lideres, personas] = await Promise.all([
    porLotes(ids, async (lote) => filas(await datos(supabase.from('grupos').select('id, nombre, activo, eliminado').in('id', lote)))),
    porLotes(ids, (lote) =>
      paginado((desde, hasta) =>
        supabase
          .from('eventos_grupo')
          .select('id, grupo_id, no_hubo_reunion')
          .in('grupo_id', lote)
          .gte('fecha', semana.desde)
          .lte('fecha', semana.hasta)
          .order('id')
          .range(desde, hasta),
      ),
    ),
    porLotes(ids, async (lote) =>
      filas(
        await datos(
          supabase
            .from('grupo_miembros')
            .select('grupo_id, usuario:usuarios!grupo_miembros_usuario_id_fkey(nombre, apellido)')
            .in('grupo_id', lote)
            .eq('rol', 'Líder')
            .is('fecha_salida', null),
        ),
      ),
    ),
    intentar<number | null>(
      'personas del alcance',
      async () => {
        let total = 0
        for (let i = 0; i < ids.length; i += TAMANO_LOTE_IDS) {
          total += await contar(
            supabase.from('grupo_miembros').select('id', { count: 'exact', head: true }).in('grupo_id', ids.slice(i, i + TAMANO_LOTE_IDS)).is('fecha_salida', null),
          )
        }
        return total
      },
      null,
    ),
  ])

  // An event marked «no hubo reunión» is a report, without attendance.
  const eventoGrupo = new Map(eventos.map((e) => [texto(e.id), texto(e.grupo_id)] as const))
  const reportaron = new Set(eventos.map((e) => texto(e.grupo_id)))
  const conAsistencia = unicos(eventos.filter((e) => e.no_hubo_reunion !== true).map((e) => texto(e.id)))
  const asistencias = await porLotes(conAsistencia, (lote) =>
    paginado((desde, hasta) => supabase.from('asistencia').select('id, evento_grupo_id, presente').in('evento_grupo_id', lote).order('id').range(desde, hasta)),
  )
  const cuenta = new Map<string, { presentes: number; total: number }>()
  for (const a of asistencias) {
    const grupoId = eventoGrupo.get(texto(a.evento_grupo_id))
    if (!grupoId) continue
    const c = cuenta.get(grupoId) ?? { presentes: 0, total: 0 }
    c.total += 1
    if (a.presente === true) c.presentes += 1
    cuenta.set(grupoId, c)
  }
  const lideresDe = new Map<string, string[]>()
  for (const l of lideres) {
    const grupoId = texto(l.grupo_id)
    const nombre = nombreDe(l.usuario)
    if (grupoId && nombre) lideresDe.set(grupoId, [...(lideresDe.get(grupoId) ?? []), nombre])
  }

  const activos: GrupoAlcance[] = grupos
    .filter((g) => g.activo === true && g.eliminado !== true && texto(g.id))
    .map((g) => {
      const grupoId = texto(g.id) as string
      const c = cuenta.get(grupoId)
      return {
        grupoId,
        nombre: texto(g.nombre),
        lideres: lideresDe.get(grupoId) ?? [],
        asistencia: c && c.total > 0 ? porcentaje(c.presentes, c.total) : null,
        reporto: reportaron.has(grupoId),
      }
    })
  const conDato = activos.filter((g) => g.asistencia !== null)
  return {
    grupos: activos,
    personas,
    asistencia: conDato.length > 0 ? Math.round(conDato.reduce((s, g) => s + (g.asistencia as number), 0) / conDato.length) : null,
    enRiesgo: conDato.filter((g) => (g.asistencia as number) < UMBRAL_RIESGO).length,
    sinReporte: activos.filter((g) => !g.reporto).length,
  }
})

async function gruposDeEtapas(supabase: ClienteInicio, etapaIds: string[]): Promise<Map<string, string[]>> {
  const enlaces = await porLotes(etapaIds, (lote) =>
    paginado((desde, hasta) => supabase.from('director_etapa_grupos').select('director_etapa_id, grupo_id').in('director_etapa_id', lote).order('grupo_id').range(desde, hasta)),
  )
  const porEtapa = new Map<string, string[]>(etapaIds.map((id) => [id, []]))
  for (const e of enlaces) {
    const etapa = texto(e.director_etapa_id)
    const grupo = texto(e.grupo_id)
    if (etapa && grupo) porEtapa.get(etapa)?.push(grupo)
  }
  return porEtapa
}

const clave = (ids: string[]): string => [...new Set(ids)].sort().join(',')

export const cargarEtapa = cache(async (supabase: ClienteInicio, directorEtapaId: string, hoy: string): Promise<DatosEtapa> => {
  const [fila, porEtapa] = await Promise.all([
    datos(supabase.from('segmento_lideres').select('id, segmento:segmentos!segmento_lideres_segmento_id_fkey(nombre)').eq('id', directorEtapaId).maybeSingle()),
    gruposDeEtapas(supabase, [directorEtapaId]),
  ])
  const resumen = await resumirGrupos(supabase, clave(porEtapa.get(directorEtapaId) ?? []), hoy)
  return { tipo: 'etapa', directorEtapaId, nombre: texto(objeto(objeto(fila)?.segmento)?.nombre), ...resumen }
})

export const cargarSegmento = cache(async (supabase: ClienteInicio, segmentoId: string, usuarioId: string, hoy: string): Promise<DatosSegmento> => {
  const [segmento, alcance, etapas] = await Promise.all([
    datos(supabase.from('segmentos').select('nombre').eq('id', segmentoId).maybeSingle()),
    datos(supabase.from('director_general_segmentos').select('alcance').eq('usuario_id', usuarioId).eq('segmento_id', segmentoId).maybeSingle()),
    datos(
      supabase
        .from('segmento_lideres')
        .select('id, usuario:usuarios!segmento_lideres_usuario_id_fkey(nombre, apellido)')
        .eq('segmento_id', segmentoId)
        .eq('tipo_lider', 'director_etapa'),
    ),
  ])
  // As gdv_dg_grupos_visibles: «segmento» sees every group of it, «directores» only the
  // groups of the etapas marked for this director general.
  const todo = texto(objeto(alcance)?.alcance) === 'segmento'
  const marcadas = todo
    ? null
    : new Set(filas(await datos(supabase.from('dg_directores_etapa').select('segmento_lider_id').eq('dg_usuario_id', usuarioId))).map((f) => texto(f.segmento_lider_id)))
  const directoresPorEtapa = new Map<string, string[]>()
  for (const f of filas(etapas)) {
    const id = texto(f.id)
    if (!id || (marcadas && !marcadas.has(id))) continue
    const nombre = nombreDe(f.usuario)
    directoresPorEtapa.set(id, [...(directoresPorEtapa.get(id) ?? []), ...(nombre ? [nombre] : [])])
  }
  const etapaIds = [...directoresPorEtapa.keys()]
  const porEtapa = await gruposDeEtapas(supabase, etapaIds)
  const delSegmento = todo
    ? unicos(
        (await paginado((desde, hasta) => supabase.from('grupos').select('id').eq('segmento_id', segmentoId).order('id').range(desde, hasta))).map((g) => texto(g.id)),
      )
    : [...new Set([...porEtapa.values()].flat())]

  const [resumen, ...porCadaEtapa] = await Promise.all([
    resumirGrupos(supabase, clave(delSegmento), hoy),
    ...etapaIds.map((id) => resumirGrupos(supabase, clave(porEtapa.get(id) ?? []), hoy)),
  ])
  return {
    tipo: 'segmento',
    segmentoId,
    nombre: texto(objeto(segmento)?.nombre),
    ...resumen,
    etapas: etapaIds.map((id, i) => ({ directorEtapaId: id, directores: directoresPorEtapa.get(id) ?? [], ...porCadaEtapa[i] })),
  }
})

// ── Group a leader leads ─────────────────────────────────────────────

async function cargarGrupoLider(
  supabase: ClienteInicio,
  pedido: PedidoACargo,
  cargo: Extract<CargoInicio, { tipo: 'grupo-lider' }>,
): Promise<DatosGrupoLider> {
  const { grupoId } = cargo
  const [detalle, salud, ultima, nuevos] = await Promise.all([
    cargarGruposMiembro(supabase, { authId: pedido.authId, usuarioId: pedido.usuarioId, hoy: pedido.hoy, grupos: [{ grupoId, nombre: cargo.nombre }] }).then((r) => r[grupoId]),
    intentar<Record<string, unknown>[] | null>(
      'v_salud_miembros_grupo',
      async () => filas(await datos(supabase.from('v_salud_miembros_grupo').select('usuario_id, nombre_completo, semanas_ausente').eq('grupo_id', grupoId))),
      null,
    ),
    intentar<DatosGrupoLider['ultimaReunion']>(
      'última reunión',
      async () => {
        // A few extra in case the last ones had no meeting.
        const e = filas(
          await datos(
            supabase.from('eventos_grupo').select('id, fecha, no_hubo_reunion').eq('grupo_id', grupoId).lte('fecha', pedido.hoy).order('fecha', { ascending: false }).limit(4),
          ),
        ).find((f) => f.no_hubo_reunion !== true)
        const id = texto(e?.id)
        const fecha = texto(e?.fecha)
        if (!id || !fecha) return null
        const marcas = filas(await datos(supabase.from('asistencia').select('presente').eq('evento_grupo_id', id)))
        return marcas.length > 0 ? { fecha, asistencia: porcentaje(marcas.filter((m) => m.presente === true).length, marcas.length) } : null
      },
      null,
    ),
    intentar<number | null>(
      'nuevos del grupo',
      () =>
        contar(
          supabase
            .from('grupo_miembros')
            .select('id', { count: 'exact', head: true })
            .eq('grupo_id', grupoId)
            .is('fecha_salida', null)
            .gte('fecha_asignacion', sumarDias(pedido.hoy, -30)),
        ),
      null,
    ),
  ])

  return {
    tipo: 'grupo-lider',
    grupoId,
    nombre: detalle?.nombre ?? cargo.nombre,
    proximaReunion: detalle?.proximaReunion ?? null,
    lugar: detalle?.lugar ?? null,
    miembros: salud ? salud.length : null,
    ultimaReunion: ultima,
    ausentes: salud
      ? salud.filter((m) => (numero(m.semanas_ausente) ?? 0) >= SEMANAS_AUSENTE).map((m) => texto(m.nombre_completo)).filter((n): n is string => n !== null)
      : null,
    nuevos,
  }
}

// ── Dream Team area ──────────────────────────────────────────────────

const ORDEN_ESTADO: Record<EstadoVoluntario, number> = { postulado: 0, en_orientacion: 1, activo: 2 }

const esEstado = (v: unknown): v is EstadoVoluntario => typeof v === 'string' && (ESTADOS_VOLUNTARIO as readonly string[]).includes(v)

export const cargarArea = cache(async (supabase: ClienteInicio, equipoId: string, unaArea: boolean): Promise<DatosArea> => {
  const equipos = await paginado((desde, hasta) => supabase.from('dream_team_equipos').select('id, label, parent_equipo_id, activo').order('id').range(desde, hasta))
  const hijos = new Map<string, string[]>()
  const etiqueta = new Map<string, string | null>()
  for (const e of equipos) {
    const id = texto(e.id)
    if (!id) continue
    etiqueta.set(id, texto(e.label))
    const padre = texto(e.parent_equipo_id)
    if (padre) hijos.set(padre, [...(hijos.get(padre) ?? []), id])
  }
  const arbol: string[] = []
  for (const pendientes = [equipoId]; pendientes.length > 0; ) {
    const id = pendientes.pop() as string
    if (arbol.includes(id)) continue
    arbol.push(id)
    pendientes.push(...(hijos.get(id) ?? []))
  }

  const [servicios, sinTurno] = await Promise.all([
    porLotes(arbol, (lote) =>
      paginado((desde, hasta) =>
        supabase
          .from('dream_team_servicios')
          .select('id, persona_id, estado, equipo_id, persona:usuarios!dream_team_servicios_persona_id_fkey(nombre, apellido)')
          .in('equipo_id', lote)
          .in('estado', [...ESTADOS_VOLUNTARIO])
          .order('id')
          .range(desde, hasta),
      ),
    ),
    unaArea ? intentar('dream_team_pendientes_resumen', async () => (await fetchResumenPendientes(supabase))?.sinTurno ?? null, null) : Promise.resolve(null),
  ])

  // One row per person, with their earliest estado (postulado before activo).
  const porPersona = new Map<string, Voluntario>()
  const cuenta = { postulado: 0, en_orientacion: 0, activo: 0 }
  for (const s of servicios) {
    const usuarioId = texto(s.persona_id)
    if (!usuarioId || !esEstado(s.estado)) continue
    cuenta[s.estado] += 1
    const previo = porPersona.get(usuarioId)
    if (previo && ORDEN_ESTADO[previo.estado] <= ORDEN_ESTADO[s.estado]) continue
    porPersona.set(usuarioId, { usuarioId, nombre: nombreDe(s.persona) ?? 'Sin nombre', estado: s.estado, equipo: etiqueta.get(texto(s.equipo_id) ?? '') ?? null })
  }

  const ids = [...porPersona.keys()]
  let sinProximoPaso: Voluntario[] = []
  if (ids.length > 0) {
    const hechos = new Set<string>()
    for (let i = 0; i < ids.length; i += 2000) {
      for (const id of (await datos(supabase.rpc('personas_con_proximo_paso', { p_ids: ids.slice(i, i + 2000) }))) as unknown[] ?? []) {
        if (typeof id === 'string') hechos.add(id)
      }
    }
    const faltan = [...porPersona.values()]
      .filter((v) => !hechos.has(v.usuarioId))
      .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.nombre.localeCompare(b.nombre, 'es'))
    // Everyone listed serves in this area, so whoever may mark one may mark them all.
    const puedeMarcar = faltan.length > 0 && (await datos(supabase.rpc('proximo_paso_puede_marcar', { p_usuario_id: faltan[0].usuarioId }))) === true
    sinProximoPaso = puedeMarcar ? faltan : []
  }

  return {
    tipo: 'area-dream-team',
    equipoId,
    nombre: etiqueta.get(equipoId) ?? null,
    activos: cuenta.activo,
    postulados: cuenta.postulado,
    enOrientacion: cuenta.en_orientacion,
    sinTurno,
    sinProximoPaso,
  }
})

// ── All cargos ───────────────────────────────────────────────────────

export const claveCargo = (c: CargoInicio): string => {
  switch (c.tipo) {
    case 'grupo-lider':
      return `grupo-lider:${c.grupoId}`
    case 'etapa':
      return `etapa:${c.directorEtapaId}`
    case 'segmento':
      return `segmento:${c.segmentoId}`
    case 'area-dream-team':
      return `area-dream-team:${c.equipoId}`
  }
}

/** One entry per cargo, in order; `null` where its loader failed. */
export async function cargarACargo(supabase: ClienteInicio, pedido: PedidoACargo): Promise<(DatosCargo | null)[]> {
  // Same arguments as cargarPendientesCargo, so the memoized read is shared.
  const unaArea = new Set(pedido.cargos.flatMap((c) => (c.tipo === 'area-dream-team' ? [c.equipoId] : []))).size === 1
  return Promise.all(
    pedido.cargos.map((c) =>
      intentar<DatosCargo | null>(
        claveCargo(c),
        () => {
          switch (c.tipo) {
            case 'grupo-lider':
              return cargarGrupoLider(supabase, pedido, c)
            case 'etapa':
              return cargarEtapa(supabase, c.directorEtapaId, pedido.hoy)
            case 'segmento':
              return cargarSegmento(supabase, c.segmentoId, pedido.usuarioId, pedido.hoy)
            case 'area-dream-team':
              return cargarArea(supabase, c.equipoId, unaArea)
          }
        },
        null,
        TIEMPO_MAXIMO_CARGO_MS,
      ),
    ),
  )
}
