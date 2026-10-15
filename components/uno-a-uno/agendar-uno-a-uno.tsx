'use client'

/**
 * "Agendar 1 a 1" (odd/tasks/uno-a-uno.md, T4): pick someone the user leads
 * (mis_dirigidos, couples shown once), a Caracas date and time and an
 * optional place. Submits through agendarUnoAUno, which revalidates
 * /mis-uno-a-uno, so no client refresh is needed (same convention as
 * components/talleres/reprogramar-edicion.tsx).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { CalendarPlus } from 'lucide-react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { agendarUnoAUno } from '@/app/(auth)/mis-uno-a-uno/actions'
import { hoyEnCaracas } from '@/lib/uno-a-uno/fecha'
import type { OpcionDirigido } from '@/lib/uno-a-uno/vista'

import { CamposCita, CITA_VACIA, citaCompleta, type ValoresCita } from './campos-cita'

interface Props {
  readonly dirigidos: readonly OpcionDirigido[]
}

export function AgendarUnoAUnoDialog({ dirigidos }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [valores, setValores] = useState<ValoresCita>(CITA_VACIA)
  const [hoy, setHoy] = useState('')

  function abrir(): void {
    setValores(CITA_VACIA)
    setError(null)
    setHoy(hoyEnCaracas())
    setOpen(true)
  }

  function cerrar(): void {
    setOpen(false)
    setError(null)
  }

  const canSubmit = !pending && citaCompleta(valores)

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await agendarUnoAUno({
        dirigidoId: valores.dirigidoId,
        fecha: valores.fecha,
        hora: valores.hora,
        lugar: valores.lugar,
      })
      if (result.ok) setOpen(false)
      else setError(result.message)
    })
  }

  return (
    <>
      <BotonSistema type="button" variante="primario" icono={CalendarPlus} onClick={abrir}>
        Agendar 1 a 1
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrir() : cerrar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agendar 1 a 1</DialogTitle>
            <DialogDescription>
              Elige a la persona, el día y la hora (hora de Caracas). Si la persona está casada, su cónyuge también participa.
            </DialogDescription>
          </DialogHeader>

          <CamposCita dirigidos={dirigidos} valores={valores} onChange={setValores} fechaMin={hoy || undefined} />

          {error ? (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrar}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={CalendarPlus} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Agendando…' : 'Agendar'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
