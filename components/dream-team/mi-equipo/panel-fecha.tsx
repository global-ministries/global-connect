'use client'

/**
 * Mi equipo · Calendario — one date: who serves (prototype `openFecha`). A
 * `DetalleResponsivo` (side panel from md, bottom sheet below) with "N de M
 * sirven", "Todos" in one click, one 52px checkbox row per volunteer of the
 * scope assigned to the shift, and "Editar fecha" / "Borrar fecha" (with a
 * confirmation) for whoever may plan it. Whoever already serves and is not
 * listed here (another team) is kept on save (`idsParaGuardar`).
 */
import { useId, useMemo, useState, type ReactElement } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import {
  alternarSeleccion,
  etiquetaFecha,
  horaDeFecha,
  idsParaGuardar,
  textoSirven,
  todosSeleccionados,
  type FechaTurno,
} from '@/lib/platform/dream-team/turno-fechas'

import { leerError, urlFecha, type Asignado, type Toast, type TurnoCalendario } from './calendario-datos'

export interface PanelFechaProps {
  readonly turno: TurnoCalendario
  readonly fecha: FechaTurno
  readonly asignados: readonly Asignado[]
  readonly hoy: string
  readonly toast: Toast
  readonly onCerrar: () => void
  readonly onCambiado: () => void
  readonly onEditar: () => void
}

export function PanelFecha({ turno, fecha, asignados, hoy, toast, onCerrar, onCambiado, onEditar }: PanelFechaProps): ReactElement {
  const idBase = useId()
  const visibles = useMemo(() => asignados.map((asignado) => asignado.servicioId), [asignados])
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set(fecha.servidores.filter((id) => visibles.includes(id))))
  const [enviando, setEnviando] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const puede = turno.puedeGestionar
  const conteo = textoSirven(visibles.filter((id) => elegidos.has(id)).length, visibles.length)

  async function enviar(url: string, init: RequestInit, porDefecto: string): Promise<boolean> {
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      if (!respuesta.ok) {
        setError(await leerError(respuesta, porDefecto))
        return false
      }
      return true
    } catch {
      setError(porDefecto)
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function guardar(): Promise<void> {
    const servicioIds = idsParaGuardar(elegidos, visibles, fecha.servidores)
    const ok = await enviar(
      `${urlFecha(turno.id, fecha.id)}/servidores`,
      { method: 'PUT', body: JSON.stringify({ servicioIds }) },
      'No se pudo guardar quién sirve.',
    )
    if (!ok) return
    toast.success(`Guardado: ${conteo}.`)
    onCambiado()
    onCerrar()
  }

  async function borrar(): Promise<void> {
    const ok = await enviar(urlFecha(turno.id, fecha.id), { method: 'DELETE' }, 'No se pudo borrar la fecha.')
    if (!ok) return
    toast.success('Fecha borrada.')
    onCambiado()
    onCerrar()
  }

  const descripcion = [turno.nombre, horaDeFecha(fecha, turno.hora), fecha.nota].filter(Boolean).join(' · ')
  const pie = puede ? (
    <>
      <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
        Cancelar
      </BotonSistema>
      <BotonSistema type="button" disabled={enviando || visibles.length === 0} cargando={enviando} onClick={() => void guardar()}>
        Guardar
      </BotonSistema>
    </>
  ) : undefined

  return (
    <DetalleResponsivo
      abierto
      onCambioAbierto={(abierto) => !abierto && !enviando && onCerrar()}
      titulo={etiquetaFecha(fecha.fecha, hoy)}
      descripcion={descripcion}
      pie={pie}
    >
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-[15px] font-semibold tabular-nums text-foreground">
            {conteo}
          </p>
          {puede && visibles.length > 0 && (
            <BotonSistema type="button" variante="outline" tamaño="sm" disabled={enviando} onClick={() => setElegidos(todosSeleccionados(visibles))}>
              Todos
            </BotonSistema>
          )}
        </div>

        {asignados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie de este equipo tiene asignado este turno. Asígnalo desde «Turnos» en el panel de cada persona.
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {asignados.map((asignado) => {
              const id = `${idBase}-${asignado.servicioId}`
              return (
                <li key={asignado.servicioId} className="flex min-h-[52px] items-center gap-3 rounded-xl px-2 hover:bg-accent">
                  <Checkbox
                    id={id}
                    checked={elegidos.has(asignado.servicioId)}
                    disabled={!puede || enviando}
                    onCheckedChange={() => setElegidos((previos) => alternarSeleccion(previos, asignado.servicioId))}
                  />
                  <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col py-1">
                    <span className="truncate text-[15px] font-medium text-foreground">{asignado.nombre}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{asignado.detalle}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {puede && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={onEditar}>
              Editar fecha
            </BotonSistema>
            {confirmarBorrar ? (
              <>
                <BotonSistema type="button" variante="peligro" disabled={enviando} onClick={() => void borrar()}>
                  Sí, borrar
                </BotonSistema>
                <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={() => setConfirmarBorrar(false)}>
                  No
                </BotonSistema>
              </>
            ) : (
              <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={() => setConfirmarBorrar(true)}>
                Borrar fecha
              </BotonSistema>
            )}
          </div>
        )}

        {error !== null && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </DetalleResponsivo>
  )
}
