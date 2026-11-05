'use client'

/**
 * Planner — the save state and "Deshacer" of the season header (S13, S15;
 * README "Save step by step and undo"). There is no "Guardar": every change
 * is a step. The state reads "Guardando…" while a step is sent, "Guardado ·
 * hace 5 s" after it (from the latest step of the season when the page
 * opens) and "No se guardó" when the server refused it (the toast says why).
 * "Deshacer" undoes the actor's latest step; when it cannot, the button says
 * why (description and toast) instead of failing silently.
 */
import { useId, useSyncExternalStore, type ReactElement } from 'react'
import { Undo2 } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'

import { haceCuanto } from './modelo'
import type { Deshacer, EstadoGuardado as Estado } from './pasos-planner'

function suscribirReloj(aviso: () => void): () => void {
  const id = window.setInterval(aviso, 1000)
  return () => window.clearInterval(id)
}

/** The current second; null while rendering on the server (no relative time there). */
const useAhora = (): number | null =>
  useSyncExternalStore(suscribirReloj, () => Math.floor(Date.now() / 1000) * 1000, () => null)

function TextoGuardado({ estado }: { readonly estado: Estado }): ReactElement {
  const ahora = useAhora()
  if (estado.tipo === 'guardando') return <PuntoEstado tono="info" etiqueta="Guardando…" />
  if (estado.tipo === 'error') return <PuntoEstado tono="danger" etiqueta="No se guardó" />
  const hace = haceCuanto(estado.en, ahora)
  if (estado.en === null) return <PuntoEstado tono="success" etiqueta="Todo guardado" />
  return <PuntoEstado tono="success" etiqueta={hace ? `Guardado · ${hace}` : 'Guardado'} />
}

export function EstadoGuardado({ estado, deshacer }: { readonly estado: Estado; readonly deshacer: Deshacer }): ReactElement {
  const idDescripcion = useId()
  const descripcion = deshacer.motivo ?? (deshacer.paso ? `Deshace: ${deshacer.paso.descripcion}` : '')
  return (
    <>
      <span role="status" className="inline-flex min-h-9 items-center">
        <TextoGuardado estado={estado} />
      </span>
      <BotonSistema
        type="button"
        variante="ghost"
        tamaño="sm"
        icono={Undo2}
        aria-disabled={deshacer.motivo !== null}
        aria-describedby={idDescripcion}
        title={descripcion}
        onClick={deshacer.ejecutar}
      >
        Deshacer
      </BotonSistema>
      <span id={idDescripcion} hidden>
        {descripcion}
      </span>
    </>
  )
}
