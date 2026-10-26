'use client'

/**
 * "¿Vienen hoy?" (odd/tasks/ninos-precheck.md P4): the optional last screen
 * of the public wizard, shown only when the create answered a service of
 * today that still takes notices. Picking one tells the table the family is
 * on its way; "No, otro día" goes on without telling anything.
 */
import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { etiquetaServicio, type AvisoPreregistro, type ServicioHoy } from '@/lib/platform/ninos/preregistro-aviso'

const MENSAJE_SERVIDOR = 'No pudimos avisar a la mesa. Intenta de nuevo o avísale al llegar.'
const MENSAJE_RED = 'No pudimos avisar a la mesa. Revisa tu conexión e intenta de nuevo.'

type Props = {
  aviso: AvisoPreregistro
  /** The chosen service's label once the table knows, or null when skipped. */
  onTerminar: (llegada: string | null) => void
}

export function PasoVienenHoy({ aviso, onTerminar }: Props) {
  const [enviando, setEnviando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function avisar(s: ServicioHoy) {
    setEnviando(s.turnoId)
    setError(null)
    try {
      const res = await fetch('/api/ninos/preregistro/aviso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aviso.id, token: aviso.token, turnoId: s.turnoId }),
      })
      if (res.ok) {
        onTerminar(etiquetaServicio(s))
        return
      }
      const respuesta = (await res.json().catch(() => null)) as { errores?: string[] } | null
      setError(respuesta?.errores?.[0] ?? MENSAJE_SERVIDOR)
    } catch {
      setError(MENSAJE_RED)
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="space-y-6">
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-success-text">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        Recibimos tu registro.
      </p>
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">¿Vienen hoy?</h2>
        <TextoSistema variante="sutil">Si vienen a un servicio de hoy, avisamos a la mesa para recibirlos más rápido.</TextoSistema>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {aviso.servicios.map((s) => {
          const etiqueta = etiquetaServicio(s)
          return (
            <BotonSistema
              key={s.turnoId}
              type="button"
              tamaño="lg"
              aria-label={`Venimos a las ${etiqueta}`}
              cargando={enviando === s.turnoId}
              disabled={enviando !== null}
              onClick={() => void avisar(s)}
            >
              {etiqueta}
            </BotonSistema>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger-text">
          {error}
        </p>
      )}
      <BotonSistema type="button" variante="outline" tamaño="lg" className="w-full" disabled={enviando !== null} onClick={() => onTerminar(null)}>
        No, otro día
      </BotonSistema>
    </div>
  )
}
