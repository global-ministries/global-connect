/**
 * Niños — /ninos/etiquetas (RSC), odd/tasks/ninos-checkin-pco.md T3b (S10,
 * S6; artboard design/ninos-checkin-pco/03-admin-etiquetas.html): the print
 * stations of a campus and its reprints.
 *
 * Same gate as /ninos/eventos and /ninos/salones: whoever may configure some
 * Niños area (ninos_puede_configurar_algun_area: Directora de Niños, area
 * coordinators, admin and pastor); everyone else gets a 404. Campuses: those
 * with active salones where the caller configures some area. Reads, as the
 * user: ninos_impresion_estaciones() (filtered to the campus) and
 * ninos_impresion_reimpresiones(campus, today, today). Managing a station is
 * checked again by its RPC (ninos_impresion_puede_administrar). Query:
 * ?campus=. These RPCs are not in database.types.ts yet: untyped client.
 */
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { EtiquetasClient } from '@/components/ninos/etiquetas/etiquetas-client'
import { consultarPermiso } from '@/lib/platform/ninos/eventos'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { leerEstaciones, leerReimpresiones } from '@/lib/platform/ninos/impresion-vista'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Etiquetas e impresoras — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly campus?: string }>
}

export default async function NinosEtiquetasPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_configurar_algun_area')
  if (puede !== true) notFound()

  const cliente = supabase as unknown as SupabaseClient
  const [query, { data: activos }] = await Promise.all([
    searchParams,
    supabase.from('ninos_salones').select('campus_id').eq('activo', true),
  ])
  const ids = [...new Set((activos ?? []).map((s) => s.campus_id))]
  const permitidos = (
    await Promise.all(ids.map(async (id) => ((await consultarPermiso(cliente, 'ninos_puede_configurar_algun_area_campus', id)) ? id : null)))
  ).filter((id): id is string => id !== null)
  const { data: campusFilas } = permitidos.length
    ? await supabase.from('campus').select('id, nombre').in('id', permitidos).order('nombre')
    : { data: [] as { id: string; nombre: string }[] }
  const campus = (campusFilas ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))
  const actual = campus.find((c) => c.id === query.campus) ?? campus[0] ?? null
  const hoy = hoyEnCaracas()

  if (!actual) {
    return (
      <EtiquetasClient campus={[]} campusId={null} estaciones={[]} reimpresionesHoy={[]} hoy={hoy} puedeAdministrar={false} errorLectura={null} />
    )
  }

  const [estacionesR, reimpresionesR] = await Promise.all([
    cliente.rpc('ninos_impresion_estaciones', {}),
    cliente.rpc('ninos_impresion_reimpresiones', { p_campus_id: actual.id, p_desde: hoy, p_hasta: hoy }),
  ])

  const estaciones = leerEstaciones(estacionesR.data).filter((e) => e.campusId === actual.id)
  return (
    <EtiquetasClient
      campus={campus}
      campusId={actual.id}
      estaciones={estaciones}
      reimpresionesHoy={leerReimpresiones(reimpresionesR.data)}
      hoy={hoy}
      // The campus flag of the station rows (ninos_impresion_puede_administrar); with none yet, the page gate.
      puedeAdministrar={estaciones.length === 0 || estaciones.some((e) => e.puedeAdministrar)}
      errorLectura={estacionesR.error ? 'No se pudieron leer las impresoras. Recarga la página.' : null}
    />
  )
}
