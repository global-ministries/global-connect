/**
 * What the home shows of each group where the person is Miembro or Colíder
 * (odd/tasks/home-por-rol.md T3, S6; design/home-por-rol 4b): leaders, next
 * meeting, place, how many of the last meetings they went to, and the links
 * «Cómo llegar» and «Escribir al líder». Every field degrades on its own: a
 * source that fails, throws or takes longer than TIEMPO_MAXIMO_MS leaves its
 * fields empty and is logged; the card still shows what is known.
 */
import { enlaceWhatsapp } from '@/lib/utils/telefono'

import type { ClienteInicio } from './cargar-hechos'

export type ReunionGrupo = { fecha: string; hora: string | null }

export type DatosGrupoMiembro = {
  grupoId: string
  nombre: string | null
  /** Full names of the group's Líderes. */
  lideres: string[]
  proximaReunion: ReunionGrupo | null
  lugar: string | null
  comoLlegar: string | null
  /** WhatsApp of the first leader with a mobile number. */
  escribirLider: string | null
  /** null when there is no past meeting or it could not be read. */
  asistencia: { fui: number; de: number } | null
}

export type PedidoGruposMiembro = {
  authId: string
  usuarioId: string
  /** YYYY-MM-DD in Caracas. */
  hoy: string
  grupos: { grupoId: string; nombre: string | null }[]
}

const TIEMPO_MAXIMO_MS = 3000
const ULTIMAS_REUNIONES = 8
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type Respuesta = { data: unknown; error: { message?: string } | null }

async function intentar<T>(fuente: string, leer: () => PromiseLike<T>, vacio: T): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`más de ${TIEMPO_MAXIMO_MS} ms`)), TIEMPO_MAXIMO_MS)
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

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const filas = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(objeto).filter((f): f is Record<string, unknown> => f !== null) : []

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** `19:30:00` → `19:30`. */
const hora = (v: unknown): string | null => texto(v)?.slice(0, 5) ?? null

/** The first date from `hoy` (included) that falls on `dia`. */
function proximoDia(hoy: string, dia: string): string | null {
  const objetivo = DIAS.indexOf(dia)
  if (objetivo < 0) return null
  const fecha = new Date(`${hoy}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + ((objetivo - fecha.getUTCDay() + 7) % 7))
  return fecha.toISOString().slice(0, 10)
}

type Detalle = Pick<DatosGrupoMiembro, 'nombre' | 'lideres' | 'lugar' | 'comoLlegar' | 'escribirLider'> & {
  reunionHabitual: ReunionGrupo | null
}

function aDetalle(data: unknown, hoy: string): Detalle {
  const g = objeto(data)
  if (!g) throw new Error('sin detalle')
  const lideres = filas(g.miembros).filter((m) => m.rol === 'Líder')
  const direccion = objeto(g.direccion)
  const lat = numero(direccion?.latitud)
  const lng = numero(direccion?.longitud)
  const lugar = [texto(direccion?.calle), texto(direccion?.barrio)].filter(Boolean).join(', ') || null
  const consulta = lat !== null && lng !== null ? `${lat},${lng}` : lugar
  const dia = texto(g.dia_reunion)
  const fecha = dia ? proximoDia(hoy, dia) : null
  return {
    nombre: texto(g.nombre),
    lideres: lideres.map((m) => [texto(m.nombre), texto(m.apellido)].filter(Boolean).join(' ')).filter(Boolean),
    lugar,
    comoLlegar: consulta ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}` : null,
    escribirLider: lideres.map((m) => enlaceWhatsapp(texto(m.telefono))).find((e) => e !== null) ?? null,
    reunionHabitual: fecha ? { fecha, hora: hora(g.hora_reunion) } : null,
  }
}

async function cargarGrupo(supabase: ClienteInicio, pedido: PedidoGruposMiembro, grupo: PedidoGruposMiembro['grupos'][number]): Promise<DatosGrupoMiembro> {
  const { grupoId } = grupo
  const [detalle, siguiente, pasadas] = await Promise.all([
    intentar(
      'obtener_detalle_grupo',
      async () => aDetalle(await datos(supabase.rpc('obtener_detalle_grupo', { p_auth_id: pedido.authId, p_grupo_id: grupoId })), pedido.hoy),
      null,
    ),
    intentar<ReunionGrupo | null>(
      'próxima reunión',
      async () => {
        const [f] = filas(
          await datos(supabase.from('eventos_grupo').select('fecha, hora').eq('grupo_id', grupoId).gte('fecha', pedido.hoy).order('fecha', { ascending: true }).limit(1)),
        )
        const fecha = texto(f?.fecha)
        return fecha ? { fecha, hora: hora(f?.hora) } : null
      },
      null,
    ),
    intentar<string[] | null>(
      'reuniones pasadas',
      async () =>
        filas(
          await datos(
            supabase
              .from('eventos_grupo')
              .select('id, no_hubo_reunion')
              .eq('grupo_id', grupoId)
              .lt('fecha', pedido.hoy)
              .order('fecha', { ascending: false })
              // A few extra in case some had no meeting.
              .limit(ULTIMAS_REUNIONES * 2),
          ),
        )
          .filter((f) => f.no_hubo_reunion !== true)
          .map((f) => texto(f.id))
          .filter((id): id is string => id !== null)
          .slice(0, ULTIMAS_REUNIONES),
      null,
    ),
  ])

  const asistencia =
    pasadas && pasadas.length > 0
      ? await intentar(
          'asistencia',
          async () => {
            const presentes = filas(
              await datos(supabase.from('asistencia').select('evento_grupo_id').eq('usuario_id', pedido.usuarioId).eq('presente', true).in('evento_grupo_id', pasadas)),
            )
            return { fui: new Set(presentes.map((f) => f.evento_grupo_id)).size, de: pasadas.length }
          },
          null,
        )
      : null

  return {
    grupoId,
    nombre: detalle?.nombre ?? grupo.nombre,
    lideres: detalle?.lideres ?? [],
    proximaReunion: siguiente ?? detalle?.reunionHabitual ?? null,
    lugar: detalle?.lugar ?? null,
    comoLlegar: detalle?.comoLlegar ?? null,
    escribirLider: detalle?.escribirLider ?? null,
    asistencia,
  }
}

export async function cargarGruposMiembro(supabase: ClienteInicio, pedido: PedidoGruposMiembro): Promise<Record<string, DatosGrupoMiembro>> {
  const grupos = await Promise.all(pedido.grupos.map((g) => cargarGrupo(supabase, pedido, g)))
  return Object.fromEntries(grupos.map((g) => [g.grupoId, g]))
}
