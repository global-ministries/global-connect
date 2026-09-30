/**
 * Grupos de Vida — server loader of /grupos-vida/segmentos.
 *
 * Reads the rows with the admin client (RLS would hide groups and links from
 * most roles, and the counts and the deletion guard need all of them) but only
 * AFTER checking the caller's role. Server-side only — the admin client refuses
 * to run in a browser.
 *
 * Who sees what is unchanged: admin and pastor see every segment; a director
 * general only the segments they hold (`director_general_segmentos`); a
 * director de etapa only the segments where they are director de etapa
 * (`segmento_lideres`); anyone else gets `null`. Only admin manages segments.
 *
 * One read per table, aggregated by the pure view model: no query per segment.
 * A failed read throws instead of showing partial numbers.
 */
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { leer, leerPaginado } from '@/lib/platform/grupos-vida/lectura-supabase'
import { construirVistaSegmentos, type VistaSegmentos } from '@/lib/platform/grupos-vida/segmentos-vista'

const ROLES_QUE_ENTRAN = ['admin', 'pastor', 'director-general', 'director-etapa']
const TIPO_DIRECTOR_ETAPA = 'director_etapa'

export interface ParametrosCargaSegmentos {
  readonly authId: string
  readonly roles: readonly string[]
}

export interface DatosSegmentos {
  readonly vista: VistaSegmentos
  /** Only admin creates, edits and deletes segments. */
  readonly puedeGestionar: boolean
  /** A director general with no segment gets a message that tells them to ask the administrator. */
  readonly esGeneralSinSegmentos: boolean
}

export async function cargarVistaSegmentos({ authId, roles }: ParametrosCargaSegmentos): Promise<DatosSegmentos | null> {
  if (!roles.some((rol) => ROLES_QUE_ENTRAN.includes(rol))) return null

  const esAdmin = roles.includes('admin')
  const veTodos = esAdmin || roles.includes('pastor')
  const esGeneral = !veTodos && roles.includes('director-general')

  const adminDb = createSupabaseAdminClient()

  const [usuarios, segmentos, grupos, lideres, enlaces, generales] = await Promise.all([
    veTodos ? Promise.resolve([]) : leer('usuarios', adminDb.from('usuarios').select('id').eq('auth_id', authId)),
    leer('segmentos', adminDb.from('segmentos').select('id, nombre')),
    leerPaginado('grupos', (desde, hasta) =>
      adminDb
        .from('grupos')
        .select('id, segmento_id, activo, eliminado, estado_aprobacion')
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado('segmento_lideres', (desde, hasta) =>
      adminDb
        .from('segmento_lideres')
        .select('id, segmento_id, tipo_lider, usuario_id')
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado('director_etapa_grupos', (desde, hasta) =>
      adminDb
        .from('director_etapa_grupos')
        .select('director_etapa_id, grupo_id')
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
    leer('director_general_segmentos', adminDb.from('director_general_segmentos').select('usuario_id, segmento_id')),
  ])

  const usuarioId = usuarios[0]?.id
  let visibles: ReadonlySet<string> | null = null
  if (!veTodos) {
    const propios = esGeneral
      ? generales.filter((g) => usuarioId && g.usuario_id === usuarioId).map((g) => g.segmento_id)
      : lideres.filter((l) => usuarioId && l.usuario_id === usuarioId && l.tipo_lider === TIPO_DIRECTOR_ETAPA).map((l) => l.segmento_id)
    visibles = new Set(propios)
  }

  const vista = construirVistaSegmentos({
    segmentos: segmentos.filter((s) => !visibles || visibles.has(s.id)).map((s) => ({ id: s.id, nombre: s.nombre })),
    grupos: grupos.map((g) => ({
      id: g.id,
      segmentoId: g.segmento_id,
      activo: g.activo === true,
      eliminado: g.eliminado,
      estadoAprobacion: g.estado_aprobacion,
    })),
    lideres: lideres.map((l) => ({ id: l.id, segmentoId: l.segmento_id, tipoLider: l.tipo_lider })),
    enlaces: enlaces.map((e) => ({ directorId: e.director_etapa_id, grupoId: e.grupo_id })),
    directoresGenerales: generales.map((g) => ({ segmentoId: g.segmento_id })),
  })

  return { vista, puedeGestionar: esAdmin, esGeneralSinSegmentos: esGeneral && vista.filas.length === 0 }
}
