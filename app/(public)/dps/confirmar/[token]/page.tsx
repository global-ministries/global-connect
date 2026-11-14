/**
 * /dps/confirmar/[token] (RSC, public) — the page the «Confirmar» button of
 * the service e-mail opens (odd/tasks/dps-asistencia-pco.md, T16b; S14.2,
 * S14.5; artboard design/dps-avisos-correo/05). Without a session: the
 * middleware lets exactly `/dps/confirmar/<one segment>` through.
 *
 * Opening it only READS the notice (dps_aviso_token_leer, service client):
 * link scanners open e-mail links, so nothing is confirmed until the person
 * taps the big «Confirmar» (the server action confirmarServicioPorEnlace).
 * It shows the puesto, the date and the hours, never a name. A malformed
 * token never reaches the database. Not indexed, no referrer (the token is
 * in the path).
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ConfirmarServicio } from '@/components/dps/confirmar-servicio'
import { consultarEnlace, enlaceVacio, esTokenConFormato, type ClienteAdminDps, type ServicioEnlace } from '@/lib/platform/dps/avisos-correo'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

import { confirmarServicioPorEnlace } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Confirmar servicio',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

async function leer(token: string): Promise<ServicioEnlace> {
  if (!esTokenConFormato(token)) return enlaceVacio('invalido')
  try {
    return await consultarEnlace(createSupabaseAdminClient() as unknown as ClienteAdminDps, token)
  } catch {
    console.error('[dps-confirmar] No se pudo leer el enlace')
    return enlaceVacio('error')
  }
}

export default async function ConfirmarServicioPage({ params }: { readonly params: Promise<{ token: string }> }) {
  if (!isDreamTeamEnabled()) notFound()
  const { token } = await params
  const inicial = await leer(token)
  return <ConfirmarServicio token={token} inicial={inicial} onConfirmar={confirmarServicioPorEnlace} />
}
