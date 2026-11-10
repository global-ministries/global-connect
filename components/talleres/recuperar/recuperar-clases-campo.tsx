'use client'

/**
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — «Recuperar clases
 * aparte» inside the taller's Configuración (artboard 14). Like
 * MinimoInscritosCampo it reads and saves its own value
 * (leerPermiteRecuperar / guardarPermiteRecuperar) until T9 folds the
 * configuration into one save; the tap saves at once.
 *
 * The actions are imported on demand so ConfiguracionTaller does not pull
 * the server-action module until this field reads or saves.
 */

import { useEffect, useState, useTransition, type ReactElement } from 'react'

import { TextoSistema } from '@/components/ui/sistema-diseno'
import { Interruptor } from '@/components/ui/interruptor'
import { useNotificaciones } from '@/hooks/use-notificaciones'

export interface RecuperarClasesCampoProps {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly puedeEditar: boolean
}

const ETIQUETA = 'Recuperar clases aparte'

export const NOTA_RECUPERAR =
  'Quien falte puede recuperar la clase en otro grupo o en una cita. La facilitadora o la coordinación la registra con fecha y quién la dio, y cuenta como asistida para el certificado.'

export function RecuperarClasesCampo({ tallerId, tallerSlug, puedeEditar }: RecuperarClasesCampoProps): ReactElement {
  const notificar = useNotificaciones()
  const [permite, setPermite] = useState<boolean | null>(null)
  const [sinLectura, setSinLectura] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let vigente = true
    import('@/lib/platform/talleres/recuperar-clase-actions')
      .then(({ leerPermiteRecuperar }) => leerPermiteRecuperar(tallerId))
      .then((r) => {
        if (!vigente) return
        if (r.ok) setPermite(r.permite)
        else setSinLectura(true)
      })
      .catch(() => {
        if (vigente) setSinLectura(true)
      })
    return () => {
      vigente = false
    }
  }, [tallerId])

  function cambiar(siguiente: boolean): void {
    setError(null)
    startTransition(async () => {
      const { guardarPermiteRecuperar } = await import('@/lib/platform/talleres/recuperar-clase-actions')
      const r = await guardarPermiteRecuperar({ tallerId, tallerSlug, permite: siguiente })
      if (r.ok) {
        setPermite(siguiente)
        notificar.success(
          siguiente
            ? 'Quien falte puede recuperar la clase aparte.'
            : 'Ya no se pueden recuperar clases aparte en este taller.',
        )
      } else {
        setError(r.message)
      }
    })
  }

  if (!puedeEditar) {
    return (
      <div>
        <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
          {ETIQUETA}
        </TextoSistema>
        <TextoSistema className="mt-1 block">
          {sinLectura ? 'No se pudo leer' : permite === null ? '…' : permite ? 'Sí' : 'No'}
        </TextoSistema>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TextoSistema className="block font-medium">{ETIQUETA}</TextoSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            {sinLectura ? 'No se pudo leer si el taller permite recuperar clases. Recarga la página para intentarlo de nuevo.' : NOTA_RECUPERAR}
          </TextoSistema>
        </div>
        <Interruptor
          aria-label={ETIQUETA}
          activo={permite === true}
          onCambio={cambiar}
          disabled={permite === null || pending}
        />
      </div>
      {error && (
        <TextoSistema role="alert" tamaño="sm" className="mt-1 block text-danger-text">
          {error}
        </TextoSistema>
      )}
    </div>
  )
}
