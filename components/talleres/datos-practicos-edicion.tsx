"use client"

/**
 * T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — «Lugar» and
 * «Indicaciones para los participantes» of an edición: what the notices
 * (email + app) tell every participant besides the date and the hour.
 *
 *   - CamposDatosPracticos (campos-datos-practicos.tsx): the two fields,
 *     shared by «Crear edición» (open-edicion-form.tsx) and this dialog.
 *   - EditarDatosPracticosEdicion: the edición page's «Lugar e
 *     indicaciones» button + dialog (same Dialog pattern as
 *     ReprogramarEdicionDialog), saving through guardarDatosPracticosEdicion.
 *     The page renders it only with editarEdicion; the RLS decides anyway.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { MapPin } from 'lucide-react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { guardarDatosPracticosEdicion } from '@/app/(auth)/talleres/[taller]/[edicion]/actions'
import { CamposDatosPracticos } from '@/components/talleres/campos-datos-practicos'

interface EditarInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly lugar: string | null
  readonly indicaciones: string | null
}

export function EditarDatosPracticosEdicion({
  tallerSlug,
  edicionId,
  lugar,
  indicaciones,
}: EditarInput): ReactElement {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lugarEditado, setLugarEditado] = useState(lugar ?? '')
  const [indicacionesEditadas, setIndicacionesEditadas] = useState(indicaciones ?? '')

  function abrirDialogo(): void {
    setLugarEditado(lugar ?? '')
    setIndicacionesEditadas(indicaciones ?? '')
    setError(null)
    setOpen(true)
  }

  function cerrarDialogo(): void {
    setOpen(false)
    setError(null)
  }

  function guardar(): void {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await guardarDatosPracticosEdicion({
        tallerSlug,
        edicionId,
        lugar: lugarEditado,
        indicaciones: indicacionesEditadas,
      })
      if (result.ok) {
        setOpen(false)
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <div>
      <BotonSistema type="button" variante="outline" tamaño="sm" icono={MapPin} onClick={abrirDialogo}>
        Lugar e indicaciones
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrirDialogo() : cerrarDialogo())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lugar e indicaciones</DialogTitle>
            <DialogDescription>
              Van en los avisos de inscripción, de grupo y en el recordatorio de cada clase. Los avisos que ya se
              enviaron no cambian.
            </DialogDescription>
          </DialogHeader>

          <CamposDatosPracticos
            lugar={lugarEditado}
            indicaciones={indicacionesEditadas}
            onLugarChange={setLugarEditado}
            onIndicacionesChange={setIndicacionesEditadas}
            disabled={pending}
          />

          {error && (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          )}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrarDialogo}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="button" variante="primario" onClick={guardar} cargando={pending} disabled={pending}>
              Guardar
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
