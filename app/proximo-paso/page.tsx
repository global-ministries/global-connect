/**
 * Próximo Paso — /proximo-paso (RSC, public, no login), odd/tasks/proximo-paso.md T2 (S3).
 *
 * The URL of the QR on the Próximo Paso announcement. A new person picks the
 * edición (the month they start) and creates their account; a signed-in one
 * just enrolls. The open ediciones come from proximo_paso_ediciones_abiertas,
 * which anon may execute and which returns only public fields (nombre, fechas,
 * clases, cupo restante; nothing personal). ?edicion= preselects one: the
 * login and the confirmation email come back with it. The middleware lets the
 * path through without a session (SKIP_AUTH_PATHS).
 */
import { RegistroProximoPaso } from '@/components/proximo-paso/registro-proximo-paso'
import { TextoSistema } from '@/components/ui/sistema-diseno'
import { tieneSesionAcotada } from '@/lib/auth/sesion-acotada'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { parseEdicionesProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'
import { createSupabaseServerClientOrNull } from '@/lib/supabase/server'

export const metadata = { title: 'Inscríbete en Próximo Paso' }
export const dynamic = 'force-dynamic'

type Props = { readonly searchParams: Promise<{ readonly edicion?: string }> }

function Marco({ children }: { readonly children: React.ReactNode }) {
  return (
    // Same frame as /ninos/registro: one flat background so the sticky send bar
    // blends in, overflow-x-clip so it can still stick.
    <main className="min-h-dvh overflow-x-clip bg-background">
      <div className="relative mx-auto flex min-h-dvh w-full min-w-0 max-w-2xl flex-col px-4 pt-6 sm:px-6 sm:py-12">{children}</div>
    </main>
  )
}

export default async function ProximoPasoPage({ searchParams }: Props) {
  const { edicion } = await searchParams
  const client = await createSupabaseServerClientOrNull()

  if (!isTalleresEnabled() || !client) {
    return (
      <Marco>
        <TextoSistema className="text-center">Las inscripciones no están disponibles en este momento. Pregunta en la mesa de bienvenida.</TextoSistema>
      </Marco>
    )
  }

  const { data, error } = await client.rpc('proximo_paso_ediciones_abiertas')
  // Bounded: a failed or slow session lookup counts as signed out, so the page always renders.
  const conSesion = await tieneSesionAcotada(client)

  return (
    <Marco>
      {error ? (
        <TextoSistema className="text-center">No pudimos cargar las fechas. Recarga la página en un momento.</TextoSistema>
      ) : (
        <RegistroProximoPaso ediciones={parseEdicionesProximoPaso(data)} conSesion={conSesion} edicionInicial={edicion ?? null} />
      )}
    </Marco>
  )
}
