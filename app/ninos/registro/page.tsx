/**
 * Niños — /ninos/registro (RSC, public, no login), odd/tasks/ninos-checkin.md N8.
 *
 * The QR poster at the church entrance (/ninos/cartel) points here. A new
 * family fills in its data; the form posts to /api/ninos/preregistro and the
 * anfitrión confirms it at the table. The campus list comes from the
 * service-role-only RPC ninos_preregistro_campus (names of campuses with an
 * active room; nothing personal). ?campus= preselects one.
 */
import { PreregistroPublico } from '@/components/ninos/preregistro-publico'
import { TextoSistema } from '@/components/ui/sistema-diseno'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: 'Registro de familia — Niños' }
export const dynamic = 'force-dynamic'

type Props = { readonly searchParams: Promise<{ readonly campus?: string }> }

export default async function NinosRegistroPage({ searchParams }: Props) {
  const { campus: campusInicial } = await searchParams
  const { data } = await createSupabaseAdminClient().rpc('ninos_preregistro_campus')
  const campus = (data ?? []) as { id: string; nombre: string }[]

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[var(--surface-primary)] via-[var(--surface-secondary)] to-[var(--surface-primary)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-gradient-to-br from-orange-300/20 to-orange-400/20 blur-xl" />
        <div className="absolute bottom-24 right-10 h-40 w-40 rounded-full bg-gradient-to-br from-orange-200/10 to-orange-300/10 blur-2xl" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {campus.length === 0 ? (
          <TextoSistema className="text-center">El registro no está disponible en este momento. Acércate a la mesa de check-in.</TextoSistema>
        ) : (
          <PreregistroPublico campus={campus} campusInicial={campusInicial} />
        )}
      </div>
    </main>
  )
}
