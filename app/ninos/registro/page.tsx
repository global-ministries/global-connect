/**
 * Niños — /ninos/registro (RSC, public, no login), odd/tasks/ninos-checkin.md N8.
 *
 * The QR poster at the church entrance (/ninos/cartel) points here. A new
 * family fills in one scrolling page (odd/tasks/ninos-v2.md N4b, prototype
 * 01); the form posts to /api/ninos/preregistro and the anfitrión confirms it
 * at the table, where the room is assigned. The campus list comes from the
 * service-role-only RPC ninos_preregistro_campus (names of campuses with an
 * active room; nothing personal); the active salones (name and age or grade
 * range, nothing personal) show each child's salón live. ?campus= preselects
 * one. A visitor who is already signed in is pointed to /perfil instead (R2).
 */
import { EntradaRegistro } from '@/components/ninos/registro/entrada-registro'
import { TextoSistema } from '@/components/ui/sistema-diseno'
import { tieneSesionAcotada } from '@/lib/auth/sesion-acotada'
import { aSalonSugerible, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClientOrNull } from '@/lib/supabase/server'

export const metadata = { title: 'Registro de familia — Niños' }
export const dynamic = 'force-dynamic'

type Props = { readonly searchParams: Promise<{ readonly campus?: string }> }

export default async function NinosRegistroPage({ searchParams }: Props) {
  const { campus: campusInicial } = await searchParams
  const admin = createSupabaseAdminClient()
  const { data } = await admin.rpc('ninos_preregistro_campus')
  const campus = (data ?? []) as { id: string; nombre: string }[]
  // Only for the live salón hint: a failed read just hides it.
  const { data: filas } = campus.length
    ? await admin
        .from('ninos_salones')
        .select('id, nombre, area, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, activo, orden, campus_id')
        .eq('activo', true)
        .in(
          'campus_id',
          campus.map((c) => c.id),
        )
    : { data: [] }
  const salones = ((filas ?? []) as (SalonFila & { campus_id: string })[]).map((s) => ({ ...aSalonSugerible(s), campusId: s.campus_id }))
  // Bounded: a failed or slow session lookup counts as signed out, so the form always renders.
  const conSesion = await tieneSesionAcotada(await createSupabaseServerClientOrNull())

  return (
    // One flat background so the sticky send bar blends in. overflow-x-clip (not
    // overflow-hidden) guards against horizontal scroll without turning <main> into a
    // scroll container, which kept the bar from ever sticking.
    <main className="min-h-dvh overflow-x-clip bg-background">
      <div className="relative mx-auto flex min-h-dvh w-full min-w-0 max-w-2xl flex-col px-4 pt-6 sm:px-6 sm:py-12">
        {campus.length === 0 ? (
          <TextoSistema className="text-center">El registro no está disponible en este momento. Acércate a la mesa de check-in.</TextoSistema>
        ) : (
          <EntradaRegistro conSesion={conSesion} campus={campus} campusInicial={campusInicial} salones={salones} />
        )}
      </div>
    </main>
  )
}
