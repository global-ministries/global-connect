'use client'

/**
 * "Turnos" of one servicio: the campus shifts its team serves in, as
 * checkboxes (a person may serve in several). Loads them from
 * GET /api/dream-team/servicios/[id]/turnos when it opens and saves with PUT.
 * The database decides what is valid (campus, active, served by the team); a
 * refusal comes back as a message shown in the dialog.
 *
 * Each chosen shift has a frequency (T10): weekly, or biweekly from an anchor
 * Sunday, which defaults to the coming Sunday.
 */
import { useEffect, useId, useState, type ReactElement } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import {
  FRECUENCIA_SEMANAL,
  esDomingo,
  isoLocal,
  proximoDomingoDeServicio,
  textoFrecuencia,
  type FrecuenciaTurno,
} from '@/lib/platform/dream-team/frecuencia-turno'
import { detalleTurno, type FrecuenciasPorTurno, type Turno } from '@/lib/platform/dream-team/turnos'

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
  const [frecuencias, setFrecuencias] = useState<FrecuenciasPorTurno>({})
  const hoy = isoLocal(new Date())
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
        const cuerpo = (await respuesta.json()) as { turnos: Turno[]; asignados: string[]; frecuencias?: FrecuenciasPorTurno }
        if (!vigente) return
        setCarga({ estado: 'listo', turnos: cuerpo.turnos })
        setElegidos(new Set(cuerpo.asignados))
        setFrecuencias(cuerpo.frecuencias ?? {})
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

  function cambiarFrecuencia(id: string, frecuencia: FrecuenciaTurno): void {
    setFrecuencias((previas) => ({ ...previas, [id]: frecuencia }))
  }

  async function guardar(): Promise<void> {
    if (carga.estado !== 'listo') return
    const elegidas = carga.turnos.filter((turno) => elegidos.has(turno.id))
    const ancladaMal = elegidas.find((turno) => {
      const ancla = frecuencias[turno.id]?.fechaAncla
      return frecuencias[turno.id]?.frecuencia === 'quincenal' && !(ancla && esDomingo(ancla))
    })
    if (ancladaMal) {
      setError(`Elige un domingo de referencia para ${ancladaMal.nombre}.`)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      // Keep the campus order of the list, not the order of the clicks.
      const turnoIds = elegidas.map((turno) => turno.id)
      const frecuenciasElegidas = Object.fromEntries(turnoIds.map((id) => [id, frecuencias[id] ?? FRECUENCIA_SEMANAL]))
      const respuesta = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnoIds, frecuencias: frecuenciasElegidas }),
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
              const frecuencia = frecuencias[turno.id] ?? FRECUENCIA_SEMANAL
              const ancla = frecuencia.fechaAncla
              return (
                <li key={turno.id} className="grid gap-1 rounded-xl px-2 hover:bg-accent">
                  <div className="flex min-h-11 items-center gap-3">
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
                  </div>
                  {elegidos.has(turno.id) && (
                    <div className="flex flex-wrap items-center gap-2 pb-2 pl-9">
                      <select
                        aria-label={`Frecuencia de ${turno.nombre}`}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={frecuencia.frecuencia}
                        disabled={enviando}
                        onChange={(evento) =>
                          cambiarFrecuencia(
                            turno.id,
                            evento.target.value === 'quincenal'
                              ? { frecuencia: 'quincenal', fechaAncla: proximoDomingoDeServicio(FRECUENCIA_SEMANAL, hoy) }
                              : FRECUENCIA_SEMANAL,
                          )
                        }
                      >
                        <option value="semanal">Semanal</option>
                        <option value="quincenal">Quincenal</option>
                      </select>
                      {frecuencia.frecuencia === 'quincenal' && (
                        <>
                          <Input
                            type="date"
                            aria-label={`Domingo de referencia de ${turno.nombre}`}
                            className="h-9 w-auto"
                            value={ancla ?? ''}
                            disabled={enviando}
                            onChange={(evento) =>
                              cambiarFrecuencia(turno.id, { frecuencia: 'quincenal', fechaAncla: evento.target.value || null })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {ancla && esDomingo(ancla) ? textoFrecuencia(frecuencia, hoy) : 'Elige un domingo'}
                          </span>
                        </>
                      )}
                    </div>
                  )}
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
