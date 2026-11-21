'use client'

/**
 * Estructura — «Mover a…» (odd/tasks/dream-team-estructura-correcciones.md,
 * T3, S5). Two steps in one dialog: pick the new equipo above (the ones the
 * viewer directs, searchable by name, each with its path), then confirm with
 * origin, destination and what moves with it (subequipos and people, who stay
 * in their equipos). The move is moverEquipo (dream_team_equipo_mover); a
 * refusal shows its Spanish message and keeps the dialog open.
 */
import { useState, useTransition, type ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { moverEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'
import { buscarDestinos, confirmacionMover, type DestinoMover } from '@/lib/platform/dream-team/estructura-gestion'

import { reportarResultado, type Toast } from './mensajes'

export interface EquipoAMover {
  readonly id: string
  readonly label: string
  /** The current equipo above. */
  readonly origen: string
  readonly subequipos: number
  readonly personas: number
}

export interface MoverEquipoDialogoProps {
  readonly equipo: EquipoAMover
  readonly destinos: readonly DestinoMover[]
  readonly onClose: () => void
  /** Called once the move went through (after closing). */
  readonly onHecho: () => void
  readonly toast: Toast
}

const SEPARADOR = ' › '

export function MoverEquipoDialogo({ equipo, destinos, onClose, onHecho, toast }: MoverEquipoDialogoProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState('')
  const [elegido, setElegido] = useState<DestinoMover | null>(null)
  const visibles = buscarDestinos(destinos, q)

  function mover(destino: DestinoMover): void {
    startTransition(async () => {
      const resultado = await moverEquipo({ id: equipo.id, nuevoPadreId: destino.id })
      if (reportarResultado(toast, resultado, `«${equipo.label}» ahora está en «${destino.label}».`)) {
        onClose()
        onHecho()
      }
    })
  }

  if (elegido) {
    const texto = confirmacionMover({
      equipo: equipo.label,
      origen: equipo.origen,
      destino: elegido.label,
      subequipos: equipo.subequipos,
      personas: equipo.personas,
    })
    return (
      <Dialog open onOpenChange={(abierto) => !abierto && !isPending && onClose()}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{texto.titulo}</DialogTitle>
            <DialogDescription>{texto.origenDestino}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{texto.arrastra}</p>
          <DialogFooter>
            <BotonSistema type="button" variante="outline" disabled={isPending} onClick={() => setElegido(null)}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" cargando={isPending} onClick={() => mover(elegido)}>
              Sí, mover
            </BotonSistema>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{`Mover «${equipo.label}» a…`}</DialogTitle>
          <DialogDescription>Elige el equipo de arriba al que pasará. Sus personas siguen en sus equipos.</DialogDescription>
        </DialogHeader>
        {destinos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay otro equipo que dirijas al que puedas moverlo.</p>
        ) : (
          <div className="grid min-w-0 gap-3">
            <InputSistema label="Buscar equipo" type="search" autoFocus value={q} onChange={(event) => setQ(event.target.value)} />
            {visibles.length === 0 && <p className="text-sm text-muted-foreground">{`Ningún equipo coincide con «${q.trim()}».`}</p>}
            <ul
              aria-label="Equipos de destino"
              className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card"
            >
              {visibles.map((destino) => {
                const arriba = destino.ruta.slice(0, -1).join(SEPARADOR)
                return (
                  <li key={destino.id}>
                    <button
                      type="button"
                      aria-label={arriba ? `${destino.label}, en ${arriba}` : destino.label}
                      onClick={() => setElegido(destino)}
                      className="focus-ring flex min-h-14 w-full min-w-0 items-center gap-3 px-3.5 py-2 text-left touch-manipulation hover:bg-accent active:bg-accent"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-base text-foreground">{destino.label}</span>
                        {arriba && <span className="truncate text-xs text-muted-foreground">{arriba}</span>}
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <DialogFooter>
          <BotonSistema type="button" variante="outline" onClick={onClose}>
            Cancelar
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
