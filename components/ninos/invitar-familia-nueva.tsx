'use client'

import { useState } from 'react'
import { CheckCircle2, Mail, Send } from 'lucide-react'

import { BotonSistema, InputSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { parseInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'

type Props = {
  /** The parent ficha just created at the table. */
  padreId: string
  onContinuar: () => void
}

/**
 * Right after "Nueva familia" created a NEW adult: an optional account
 * invitation by email (G5 of odd/tasks/ninos-cobertura.md). The server only
 * accepts it from the operator who registered the family, within one hour.
 */
export function InvitarFamiliaNueva({ padreId, onContinuar }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviada, setEnviada] = useState<string | null>(null)

  async function invitar() {
    const entrada = parseInvitacion({ email })
    if ('error' in entrada) {
      setError('Escribe un correo válido.')
      return
    }
    setError(null)
    setEnviando(true)
    try {
      const res = await fetch(`/api/ninos/familia/${encodeURIComponent(padreId)}/invitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: entrada.email }),
      })
      const datos = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>
      if (res.ok) setEnviada(typeof datos.email === 'string' ? datos.email : entrada.email)
      else setError(typeof datos.error === 'string' ? datos.error : 'No se pudo enviar la invitación. Intenta de nuevo.')
    } catch {
      setError('No se pudo enviar la invitación. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <TarjetaSistema className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <TituloSistema nivel={3}>Familia registrada</TituloSistema>
      </div>
      {enviada ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Le enviamos la invitación a {enviada}.
        </p>
      ) : (
        <>
          <TextoSistema variante="sutil" tamaño="sm">
            Opcional: con su correo, le enviamos una invitación para crear su cuenta en GlobalConnect.
          </TextoSistema>
          <InputSistema
            id="familia-invitar-email"
            label="Correo del representante (opcional)"
            aria-label="Correo del representante"
            icono={Mail}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-red-500 dark:text-red-400">
              {error}
            </p>
          )}
          <BotonSistema type="button" variante="outline" icono={Send} disabled={enviando} onClick={() => void invitar()}>
            Invitar por correo
          </BotonSistema>
        </>
      )}
      <div className="flex justify-end">
        <BotonSistema type="button" onClick={onContinuar}>
          Continuar
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}
