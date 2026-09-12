'use client'

/**
 * Dream Team — shared stage-advance control.
 *
 * Used by both /admin/dream-team/servidores (the pool) and
 * /dream-team/mi-equipo (the area director view) so the transition UX and
 * its rules live in exactly one place instead of being duplicated. Renders
 * a small outline button (icon always visible, label `hidden sm:inline`,
 * matching the GrupoDetailClient.tsx secondary-action pattern) that opens a
 * `Dialog` with the transition + motivo — not an always-expanded inline
 * form.
 *
 * Offered target states are derived from `TRANSICIONES_VALIDAS` (see
 * lib/platform/dream-team/state-machine.ts) — never hardcoded here. From a
 * terminal estado (`retirado`) that set is empty, so the component renders
 * nothing; it also renders nothing when the caller lacks write capability.
 *
 * On submit it PATCHes /api/dream-team/servicios/[id] with
 * `{ estado, motivo, expectedVersion }`. A 409 (optimistic-lock conflict)
 * gets a clear message inviting a reload, never a generic error.
 */
import { useState, type ReactElement } from 'react'
import { ArrowRightLeft } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, SelectSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'
import { DREAM_TEAM_MOTIVOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamMotivo, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { ESTADO_LABELS, MOTIVO_LABELS } from './labels'

export interface AvanceEtapaControlProps {
  readonly servicioId: string
  readonly estadoActual: DreamTeamEstado
  readonly version: number
  readonly puedeEditar: boolean
  readonly onSuccess: (servicioActualizado: DreamTeamServicio) => void
}

const CONFLICT_MESSAGE =
  'Este servicio fue modificado por otra persona. Recargá la página para ver el estado actual e intentá de nuevo.'
const GENERIC_ERROR_MESSAGE = 'No se pudo actualizar la etapa. Probá de nuevo.'

export function AvanceEtapaControl({
  servicioId,
  estadoActual,
  version,
  puedeEditar,
  onSuccess,
}: AvanceEtapaControlProps): ReactElement | null {
  const transicionesValidas = Array.from(TRANSICIONES_VALIDAS[estadoActual] ?? [])

  const [abierto, setAbierto] = useState(false)
  const [estadoNuevo, setEstadoNuevo] = useState<DreamTeamEstado | ''>('')
  const [motivo, setMotivo] = useState<DreamTeamMotivo | ''>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedeEditar || transicionesValidas.length === 0) return null

  function cerrar(): void {
    setAbierto(false)
    setEstadoNuevo('')
    setMotivo('')
    setError(null)
  }

  async function enviar(): Promise<void> {
    if (!estadoNuevo || !motivo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/dream-team/servicios/${servicioId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: estadoNuevo, motivo, expectedVersion: version }),
      })

      if (res.status === 409) {
        setError(CONFLICT_MESSAGE)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError((body && typeof body.error === 'string' && body.error) || GENERIC_ERROR_MESSAGE)
        return
      }

      const body = await res.json()
      onSuccess(body.servicio as DreamTeamServicio)
      cerrar()
    } catch {
      setError(GENERIC_ERROR_MESSAGE)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        icono={ArrowRightLeft}
        onClick={() => setAbierto(true)}
      >
        <span className="hidden sm:inline">Cambiar etapa</span>
      </BotonSistema>

      <Dialog open={abierto} onOpenChange={(open) => !open && cerrar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar etapa</DialogTitle>
            <DialogDescription>Elegí la nueva etapa y el motivo del cambio.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <SelectSistema
              label="Nueva etapa"
              opciones={transicionesValidas.map((estado) => ({ valor: estado, etiqueta: ESTADO_LABELS[estado] }))}
              placeholder="Elegí la nueva etapa"
              value={estadoNuevo}
              onValueChange={(v) => setEstadoNuevo(v as DreamTeamEstado)}
              disabled={enviando}
            />
            <SelectSistema
              label="Motivo"
              opciones={DREAM_TEAM_MOTIVOS.map((m) => ({ valor: m, etiqueta: MOTIVO_LABELS[m] }))}
              placeholder="Elegí un motivo"
              value={motivo}
              onValueChange={(v) => setMotivo(v as DreamTeamMotivo)}
              disabled={enviando}
            />
            {error && (
              <TextoSistema role="alert" tamaño="sm" className="text-red-500 dark:text-red-400">
                {error}
              </TextoSistema>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" disabled={enviando} onClick={cerrar}>
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="button"
              tamaño="sm"
              disabled={!estadoNuevo || !motivo || enviando}
              onClick={() => {
                void enviar()
              }}
            >
              {enviando ? 'Guardando…' : 'Confirmar'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
