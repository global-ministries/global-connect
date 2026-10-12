/**
 * Niños — /ninos/registro (RSC, public, no login), odd/tasks/ninos-checkin.md N8.
 *
 * The QR poster at the church entrance (/ninos/cartel) points here. A new
 * family fills in its data step by step (odd/tasks/ninos-registro-pasos.md);
 * the wizard posts to /api/ninos/preregistro and the anfitrión confirms it at
 * the table, where the room is assigned from the birth date. The campus list
 * comes from the service-role-only RPC ninos_preregistro_campus (names of
 * campuses with an active room; nothing personal). ?campus= preselects one.
 * A visitor who is already signed in is pointed to /perfil instead (R2).
 */
import { EntradaRegistro } from '@/components/ninos/registro/entrada-registro'
import { TextoSistema } from '@/components/ui/sistema-diseno'
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
  // A failure to read the session must not block the public form: treat it as signed out.
  const supabase = await createSupabaseServerClientOrNull()
  const sesion = supabase ? await supabase.auth.getUser().catch(() => null) : null
  const conSesion = Boolean(sesion?.data.user)

  return (
    // One flat background so the sticky action bar blends in. overflow-x-clip (not
    // overflow-hidden) guards against horizontal scroll without turning <main> into a
    // scroll container, which kept the action bar from ever sticking.
    <main className="min-h-dvh overflow-x-clip bg-background">
      <div className="relative mx-auto flex min-h-dvh w-full min-w-0 max-w-xl flex-col px-4 pt-6 sm:px-6 sm:py-12">
        {campus.length === 0 ? (
          <TextoSistema className="text-center">El registro no está disponible en este momento. Acércate a la mesa de check-in.</TextoSistema>
        ) : (
          <EntradaRegistro conSesion={conSesion} campus={campus} campusInicial={campusInicial} />
        )}
      </div>
    </main>
  )
}
