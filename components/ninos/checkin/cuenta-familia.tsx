'use client'

/**
 * Niños › Check-in — «Sin cuenta» on the family at the desk
 * (odd/tasks/ninos-checkin-pco.md, T2k, S9.9 "Invitación automática + botón
 * en la mesa"): a parent registered without an account keeps everything;
 * at any visit the desk can write or confirm the email and invite them
 * (InvitarCuenta, the same flow as right after "Nueva familia"). Nothing
 * shows for a parent with an account, while loading, or when the database
 * refuses (ninos_familia_cuenta: anfitriones and coordinación of the
 * family's campus).
 */
import { useEffect, useState, type ReactElement } from 'react'
import { UserRound } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import type { EstadoInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import { cargarCuentaFamilia } from '@/lib/platform/ninos/invitar-familia'
import { createClient } from '@/lib/supabase/client'

import { InvitarCuenta } from '../registro-rapido/resultado-mesa'

export function CuentaFamilia({ padreId }: { readonly padreId: string }): ReactElement | null {
  const [cuenta, setCuenta] = useState<{ padreId: string; estado: EstadoInvitacion | null } | null>(null)

  useEffect(() => {
    let vigente = true
    void cargarCuentaFamilia(createClient(), padreId).then((estado) => {
      if (vigente) setCuenta({ padreId, estado })
    })
    return () => {
      vigente = false
    }
  }, [padreId])

  const estado = cuenta?.padreId === padreId ? cuenta.estado : null
  if (!estado?.sinCuenta) return null
  const enviada = estado.invitacion?.estado === 'enviada' ? estado.invitacion.email : null

  return (
    <section aria-label="Cuenta del representante" className="grid min-w-0 gap-2 text-left">
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <UserRound aria-hidden="true" className="size-4 shrink-0" />
        <BadgeSistema tamaño="sm">Sin cuenta</BadgeSistema>
        <span className="min-w-0">{enviada ? `Invitación enviada a ${enviada}.` : 'Puede crearla cuando quiera; no se pierde nada.'}</span>
      </p>
      <InvitarCuenta key={padreId} padreId={padreId} emailInicial={estado.emailFicha ?? enviada ?? ''} />
    </section>
  )
}
