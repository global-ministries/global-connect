'use client'

/**
 * "Turnos" of one servicio: the campus shifts its team serves in, as
 * checkboxes (a person may serve in several). Loads them from
 * GET /api/dream-team/servicios/[id]/turnos when it opens and saves with PUT.
 * The database decides what is valid (campus, active, served by the team); a
 * refusal comes back as a message shown in the dialog.
 */
import { useEffect, useId, useState, type ReactElement } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { detalleTurno, type Turno } from '@/lib/platform/dream-team/turnos'

export interface TurnosServicioDialogProps {
  readonly servicioId: string
  readonly nombre: string
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly onGuardado: () => void
}

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'error'; readonly mensaje: string }
  | { readonly estado: 'listo'; readonly turnos: readonly Turno[] }

async function mensajeDe(respuesta: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string }
    return cuerpo.error ?? porDefecto
  } catch {
    return porDefecto
  }
}

export function TurnosServicioDialog({
  servicioId,
  nombre,
  abierto,
  onAbiertoChange,
  onGuardado,
}: TurnosServicioDialogProps): ReactElement {
  const idBase = useId()
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = `/api/dream-team/servicios/${encodeURIComponent(servicioId)}/turnos`

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    setCarga({ estado: 'cargando' })
    setError(null)
    void (async () => {
      try {
        const respuesta = await fetch(url, { cache: 'no-store' })
        if (!respuesta.ok) throw new Error(await mensajeDe(respuesta, 'No se pudieron cargar los turnos.'))
        const cuerpo = (await respuesta.json()) as { turnos: Turno[]; asignados: string[] }
        if (!vigente) return
        setCarga({ estado: 'listo', turnos: cuerpo.turnos })
        setElegidos(new Set(cuerpo.asignados))
      } catch (causa) {
        if (vigente) setCarga({ estado: 'error', mensaje: causa instanceof Error ? causa.message : 'No se pudieron cargar los turnos.' })
      }
    })()
    return () => {
      vigente = false
    }
  }, [abierto, url])

  function alternar(id: string): void {
    setElegidos((previos) => {
      const siguientes = new Set(previos)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }

  async function guardar(): Promise<void> {
    if (carga.estado !== 'listo') return
    setEnviando(true)
    setError(null)
    try {
      // Keep the campus order of the list, not the order of the clicks.
      const turnoIds = carga.turnos.filter((turno) => elegidos.has(turno.id)).map((turno) => turno.id)
      const respuesta = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnoIds }),
      })
      if (!respuesta.ok) {
        setError(await mensajeDe(respuesta, 'No se pudieron guardar los turnos.'))
        return
      }
      onGuardado()
      onAbiertoChange(false)
    } catch {
      setError('No se pudieron guardar los turnos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !enviando && onAbiertoChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turnos de servicio</DialogTitle>
          <DialogDescription>Elige en qué turnos sirve {nombre}. Puede ser más de uno.</DialogDescription>
        </DialogHeader>

        {carga.estado === 'cargando' && <TextoSistema variante="sutil">Cargando turnos…</TextoSistema>}
        {carga.estado === 'error' && (
          <TextoSistema role="alert" tamaño="sm" className="text-red-500 dark:text-red-400">
            {carga.mensaje}
          </TextoSistema>
        )}
        {carga.estado === 'listo' && carga.turnos.length === 0 && (
          <TextoSistema variante="sutil">
            Este equipo no tiene turnos disponibles en el campus. Configúralos en Estructura.
          </TextoSistema>
        )}
        {carga.estado === 'listo' && carga.turnos.length > 0 && (
          <ul className="grid gap-1">
            {carga.turnos.map((turno) => {
              const id = `${idBase}-${turno.id}`
              return (
                <li key={turno.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-accent">
                  <Checkbox
                    id={id}
                    checked={elegidos.has(turno.id)}
                    disabled={enviando}
                    onCheckedChange={() => alternar(turno.id)}
                  />
                  <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col py-2">
                    <span className="text-sm font-medium text-foreground">{turno.nombre}</span>
                    <span className="text-xs text-muted-foreground">{detalleTurno(turno)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {error && (
          <TextoSistema role="alert" tamaño="sm" className="text-red-500 dark:text-red-400">
            {error}
          </TextoSistema>
        )}

        <div className="flex justify-end gap-2">
          <BotonSistema type="button" variante="outline" tamaño="sm" disabled={enviando} onClick={() => onAbiertoChange(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema
            type="button"
            tamaño="sm"
            disabled={carga.estado !== 'listo' || carga.turnos.length === 0 || enviando}
            onClick={() => {
              void guardar()
            }}
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </BotonSistema>
        </div>
      </DialogContent>
    </Dialog>
  )
}
