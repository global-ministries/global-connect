'use client'

/**
 * Dream Team — shared stage-advance control.
 *
 * Used by both /admin/dream-team/servidores (the pool) and
 * /dream-team/mi-equipo (the area director view) so the transition UX and
 * its rules live in exactly one place instead of being duplicated.
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

  if (!abierto) {
    return (
      <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setAbierto(true)}>
        Cambiar etapa
      </BotonSistema>
    )
  }

  return (
    <div className="grid min-w-[16rem] gap-2">
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
      <div className="flex gap-2">
        <BotonSistema
          type="button"
          tamaño="sm"
          disabled={!estadoNuevo || !motivo || enviando}
          onClick={() => {
            void enviar()
          }}
        >
          Confirmar
        </BotonSistema>
        <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={enviando} onClick={cerrar}>
          Cancelar
        </BotonSistema>
      </div>
      {error && (
        <TextoSistema role="alert" tamaño="sm" className="text-red-500 dark:text-red-400">
          {error}
        </TextoSistema>
      )}
    </div>
  )
}
