'use client'

/**
 * T7b (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
 * "Reprogramar" dialog in the edición page's Ventana block. Two modes,
 * radio-selected (same plain `<input type="radio">` + `<label>` pattern
 * components/talleres/inscribir-persona-form.tsx already uses — there is
 * no dedicated RadioSistema primitive):
 *
 *   - "Extender la inscripción": one date field ("Inscripción hasta").
 *   - "Mover la primera clase": a date field ("Nueva primera clase") plus
 *     an optional "Inscripción hasta" override. Disabled (with a hint)
 *     when `primeraClaseCerrada` — the exact same EDICION_YA_EMPEZO rule
 *     talleres_reprogramar_edicion itself refuses a move on.
 *
 * The preview line is computed client-side from the edición's own dates
 * plus `clasesPendientes` (both passed in by the page — no second round
 * trip), same UTC-anchored day-math helpers components/talleres/open-
 * edicion-form.tsx already uses so a `date`-only column never off-by-ones
 * against the viewer's own timezone.
 *
 * Submits through `reprogramarEdicion` (app/(auth)/talleres/[taller]/
 * [edicion]/actions.ts), which already revalidates every affected path —
 * no client-side router.refresh needed, same convention
 * components/talleres/open-edicion-button.tsx documents for its own
 * server-action buttons.
 */

import { useMemo, useState, useTransition, type ReactElement } from 'react'
import { CalendarClock } from 'lucide-react'

import { BotonSistema, InputSistema, TarjetaSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { reprogramarEdicion } from '@/app/(auth)/talleres/[taller]/[edicion]/actions'

const MOTIVO_MAX = 300

type Modo = 'extender' | 'mover'

interface Input {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly fechaInicio: string
  readonly fechaFin: string
  readonly cierreInscripcion: string
  readonly clasesPendientes: number
  readonly primeraClaseCerrada: boolean
}

/** Parses a `YYYY-MM-DD` (or an ISO timestamp's date part) as a UTC midnight Date, so day-math never shifts with the viewer's timezone. */
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function addDays(value: string, days: number): Date {
  return new Date(parseDateOnly(value).getTime() + days * 86_400_000)
}

function diffDays(a: string, b: string): number {
  return Math.round((parseDateOnly(a).getTime() - parseDateOnly(b).getTime()) / 86_400_000)
}

function formatFechaCorta(date: Date): string {
  return date.toLocaleDateString('es', { timeZone: 'UTC' })
}

export function ReprogramarEdicionDialog({
  tallerSlug,
  edicionId,
  fechaInicio,
  fechaFin,
  cierreInscripcion,
  clasesPendientes,
  primeraClaseCerrada,
}: Input): ReactElement {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [modo, setModo] = useState<Modo>('extender')
  const [nuevaFechaInicio, setNuevaFechaInicio] = useState('')
  // Extend mode's own REQUIRED field, pre-filled with the current cierre so
  // there is always a sensible starting point to push further out.
  const [nuevoCierre, setNuevoCierre] = useState('')
  // Move mode's own OPTIONAL override — starts EMPTY on purpose, never
  // inheriting nuevoCierre's prefill: an untouched field must submit
  // cierreInscripcion: null so the RPC's own COALESCE keeps the taller's
  // offset, instead of silently pinning cierre_inscripcion to its stale
  // pre-move value.
  const [cierreOverrideMover, setCierreOverrideMover] = useState('')
  const [motivo, setMotivo] = useState('')

  function abrirDialogo(): void {
    setOpen(true)
    setError(null)
    setModo('extender')
    setNuevaFechaInicio('')
    setNuevoCierre(cierreInscripcion.slice(0, 10))
    setCierreOverrideMover('')
    setMotivo('')
  }

  function cerrarDialogo(): void {
    setOpen(false)
    setError(null)
  }

  const canSubmit =
    !pending &&
    (modo === 'extender' ? nuevoCierre !== '' : nuevaFechaInicio !== '' && !primeraClaseCerrada)

  const preview = useMemo(() => {
    if (modo === 'extender') {
      if (!nuevoCierre) return null
      return { texto: `Inscripción hasta ${formatFechaCorta(parseDateOnly(nuevoCierre))}.` }
    }
    if (!nuevaFechaInicio) return null
    const delta = diffDays(nuevaFechaInicio, fechaInicio)
    const nuevaFin = addDays(fechaFin, delta)
    const cierreDate = cierreOverrideMover ? parseDateOnly(cierreOverrideMover) : addDays(cierreInscripcion, delta)
    return {
      texto: `Las ${clasesPendientes} ${clasesPendientes === 1 ? 'clase pendiente se mueve' : 'clases pendientes se mueven'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'día' : 'días'}; última clase ${formatFechaCorta(nuevaFin)}; inscripción hasta ${formatFechaCorta(cierreDate)}.`,
    }
  }, [modo, nuevoCierre, nuevaFechaInicio, cierreOverrideMover, fechaInicio, fechaFin, cierreInscripcion, clasesPendientes])

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await reprogramarEdicion({
        tallerSlug,
        edicionId,
        fechaInicio: modo === 'mover' ? nuevaFechaInicio : null,
        cierreInscripcion: modo === 'mover' ? cierreOverrideMover || null : nuevoCierre || null,
        motivo: motivo.trim() || null,
      })
      if (result.ok) {
        setOpen(false)
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <div>
      <BotonSistema type="button" variante="outline" tamaño="sm" icono={CalendarClock} onClick={abrirDialogo}>
        Reprogramar
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrirDialogo() : cerrarDialogo())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reprogramar edición</DialogTitle>
            <DialogDescription>
              Extiende sólo la inscripción, o mueve la primera clase y recalcula el resto de las fechas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="modo-reprogramar"
                checked={modo === 'extender'}
                onChange={() => setModo('extender')}
              />
              <TextoSistema tamaño="sm">Extender la inscripción</TextoSistema>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="modo-reprogramar"
                checked={modo === 'mover'}
                onChange={() => setModo('mover')}
                disabled={primeraClaseCerrada}
              />
              <TextoSistema tamaño="sm" variante={primeraClaseCerrada ? 'sutil' : undefined}>
                Mover la primera clase
              </TextoSistema>
            </label>
            {primeraClaseCerrada && (
              <TextoSistema variante="sutil" tamaño="sm" className="block pl-6">
                La primera clase ya se dictó; no se puede mover el inicio. Puedes extender la inscripción.
              </TextoSistema>
            )}
          </div>

          {modo === 'extender' ? (
            <InputSistema
              label="Inscripción hasta"
              type="date"
              value={nuevoCierre}
              onChange={(e) => setNuevoCierre(e.target.value)}
            />
          ) : (
            <div className="grid gap-4">
              <InputSistema
                label="Nueva primera clase"
                type="date"
                value={nuevaFechaInicio}
                onChange={(e) => setNuevaFechaInicio(e.target.value)}
                disabled={primeraClaseCerrada}
              />
              <InputSistema
                label="Inscripción hasta (opcional)"
                type="date"
                value={cierreOverrideMover}
                onChange={(e) => setCierreOverrideMover(e.target.value)}
                disabled={primeraClaseCerrada}
              />
            </div>
          )}

          {preview && (
            <TarjetaSistema variante="outlined" className="p-3">
              <TextoSistema tamaño="sm">{preview.texto}</TextoSistema>
            </TarjetaSistema>
          )}

          <TextareaSistema
            label="Motivo (opcional)"
            value={motivo}
            maxLength={MOTIVO_MAX}
            onChange={(e) => setMotivo(e.target.value)}
            filas={2}
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
            <BotonSistema type="button" variante="primario" icono={CalendarClock} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Reprogramando…' : 'Reprogramar'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
