/**
 * The ficha's Servicio tab (S13 of odd/tasks/sistema-diseno-v2.md): the
 * person's Dream Team servicios, read as the caller, so the
 * dream_team_servicios policies decide what shows (a viewer who may read none
 * gets an empty list and the tab's empty state). Retired servicios are left
 * out; the rest show the team, its path in the tree, the rol and the etapa.
 */
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import type { TonoEstado } from '@/components/ui/punto-estado'
import type { DreamTeamEstado } from '@/lib/platform/dream-team/types'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

type Fila = Readonly<Record<string, unknown>>
type Respuesta = { data: readonly Fila[] | null; error: unknown }

/** The part of the Supabase client this loader uses. */
export type ClienteServicio = Pick<Awaited<ReturnType<typeof createSupabaseServerClient>>, 'from'>

export interface ServicioPersona {
  readonly id: string
  readonly equipo: string
  /** The team's ancestors, "Dirección de Niños · Waumba Land". */
  readonly ruta: string
  readonly rol: string
  readonly etapa: string
  readonly tono: TonoEstado
  readonly desde: string | null
}

/** Etapa colors of the prototype (docs/design-system/foundations.md). */
const TONO_ETAPA: Readonly<Record<DreamTeamEstado, TonoEstado>> = {
  postulado: 'warning',
  en_orientacion: 'info',
  activo: 'success',
  en_pausa: 'muted',
  inactivo: 'muted',
  retirado: 'danger',
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

async function leer(consulta: PromiseLike<Respuesta>): Promise<readonly Fila[]> {
  const { data, error } = await consulta
  return error || !data ? [] : data
}

export async function cargarServiciosPersona(supabase: ClienteServicio, personaId: string): Promise<ServicioPersona[]> {
  const servicios = (
    await leer(
      supabase
        .from('dream_team_servicios')
        .select('id, equipo_id, rol_id, estado, fecha_inicio')
        .eq('persona_id', personaId) as PromiseLike<Respuesta>,
    )
  ).filter((s) => s.estado !== 'retirado' && texto(s.id) && texto(s.equipo_id))
  if (servicios.length === 0) return []

  const rolIds = [...new Set(servicios.map((s) => texto(s.rol_id)).filter((v): v is string => v !== null))]
  const [equipos, roles] = await Promise.all([
    leer(supabase.from('dream_team_equipos').select('id, label, parent_equipo_id') as PromiseLike<Respuesta>),
    rolIds.length
      ? leer(supabase.from('dream_team_roles').select('id, label').in('id', rolIds) as PromiseLike<Respuesta>)
      : Promise.resolve([]),
  ])
  const equipoPorId = new Map(equipos.map((e) => [e.id as string, e]))
  const rolPorId = new Map(roles.map((r) => [r.id as string, texto(r.label) ?? '']))

  const ruta = (equipoId: string): string => {
    const nombres: string[] = []
    const vistos = new Set<string>([equipoId])
    let padre = texto(equipoPorId.get(equipoId)?.parent_equipo_id)
    while (padre && !vistos.has(padre)) {
      vistos.add(padre)
      const nodo = equipoPorId.get(padre)
      if (!nodo) break
      nombres.unshift(texto(nodo.label) ?? '')
      padre = texto(nodo.parent_equipo_id)
    }
    return nombres.filter(Boolean).join(' · ')
  }

  return servicios.map((s) => {
    const equipoId = s.equipo_id as string
    const estado = (s.estado as DreamTeamEstado) in TONO_ETAPA ? (s.estado as DreamTeamEstado) : 'activo'
    return {
      id: s.id as string,
      equipo: texto(equipoPorId.get(equipoId)?.label) ?? 'Equipo',
      ruta: ruta(equipoId),
      rol: rolPorId.get(texto(s.rol_id) ?? '') ?? '',
      etapa: ESTADO_LABELS[estado],
      tono: TONO_ETAPA[estado],
      desde: texto(s.fecha_inicio),
    }
  })
}
