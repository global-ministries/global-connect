'use client'

/**
 * "Reprogramar" a scheduled 1:1 (odd/tasks/uno-a-uno.md, T4): a new Caracas
 * date and time, starting from the current ones. The database requires a
 * future date and resets the reminder.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { CalendarClock } from 'lucide-react'

import { BotonSistema, InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { reprogramarUnoAUno } from '@/app/(auth)/mis-uno-a-uno/actions'
import { hoyEnCaracas, partesEnCaracas } from '@/lib/uno-a-uno/fecha'

interface Props {
  readonly unoAUnoId: string
  /** The current scheduled instant (timestamptz). */
  readonly fechaHora: string
}

export function ReprogramarUnoAUnoDialog({ unoAUnoId, fechaHora }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [hoy, setHoy] = useState('')

  function abrir(): void {
    const actual = partesEnCaracas(fechaHora)
    setFecha(actual.fecha)
    setHora(actual.hora)
    setError(null)
    setHoy(hoyEnCaracas())
    setOpen(true)
  }

  function cerrar(): void {
    setOpen(false)
    setError(null)
  }

  const canSubmit = !pending && fecha !== '' && hora !== ''

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await reprogramarUnoAUno({ id: unoAUnoId, fecha, hora })
      if (result.ok) setOpen(false)
      else setError(result.message)
    })
  }

  return (
    <>
      <BotonSistema type="button" variante="outline" tamaño="sm" icono={CalendarClock} onClick={abrir}>
        Reprogramar
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrir() : cerrar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reprogramar 1 a 1</DialogTitle>
            <DialogDescription>Elige la nueva fecha y hora (hora de Caracas).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <InputSistema
              label="Fecha"
              type="date"
              min={hoy || undefined}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <InputSistema label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>

          {error ? (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrar}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={CalendarClock} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Guardando…' : 'Guardar fecha'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
