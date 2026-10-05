/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). Public, token-free page reached from /activar/[token]: reads the
 * HttpOnly cookie, checks the invitation with the admin client and shows
 * the activation form, or a neutral invalid-link message.
 */

import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { FondoAutenticacion, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import {
  COOKIE_ACTIVACION,
  consultarInvitacion,
  esTokenConFormato,
  mensajeActivacion,
  type ClienteActivacion,
} from '@/lib/platform/talleres/activacion-acceso'
import { hashTokenInvitacion } from '@/lib/platform/talleres/invitacion-acceso-envio'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

import { ActivarCuentaForm } from './activar-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Activa tu cuenta',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ActivarPage() {
  const token = (await cookies()).get(COOKIE_ACTIVACION)?.value
  const invitacion = esTokenConFormato(token)
    ? await consultarInvitacion(createSupabaseAdminClient() as unknown as ClienteActivacion, hashTokenInvitacion(token))
    : ({ valida: false } as const)

  return (
    <FondoAutenticacion>
      <TarjetaSistema variante="elevated" className="space-y-6">
        {invitacion.valida ? (
          <ActivarCuentaForm
            tallerNombre={invitacion.tallerNombre}
            nombreInvitado={invitacion.nombreInvitado}
            nombreInvitante={invitacion.nombreInvitante}
            vinculo={invitacion.vinculo}
          />
        ) : (
          <div className="flex flex-col gap-2 text-center">
            <TituloSistema nivel={1}>Enlace no disponible</TituloSistema>
            <TextoSistema variante="sutil">{mensajeActivacion('ENLACE_INVALIDO')}</TextoSistema>
          </div>
        )}
      </TarjetaSistema>
    </FondoAutenticacion>
  )
}
