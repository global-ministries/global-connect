'use client'

/**
 * Planner — the save bar of the season header (S24, S15; replaces "Guardado ·
 * hace N s" of S13). Changes stay in the browser until "Guardar":
 * "N cambios sin guardar" opens the pending list (panel-cambios.tsx),
 * "Descartar" asks before throwing them away, "Guardar" (primary, disabled
 * with nothing pending) saves them all in one transaction. With no pending
 * changes the bar says "Todo guardado".
 *
 * "Deshacer" removes the last pending change; with none it reads "Deshacer
 * último guardado" and undoes the actor's latest saved step. When it cannot,
 * the button says why (description and toast) instead of failing silently.
 *
 * Phone (`compacta`, T8c): the counter chip, "Deshacer" as an icon and
 * "Guardar"; "Descartar" lives in the pending list it opens.
 */
import { useId, type ReactElement } from 'react'
import { Undo2 } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { contar } from '@/lib/platform/grupos-vida/planner'

import type { Deshacer } from './pasos-planner'

export interface BarraGuardadoProps {
  readonly cambios: number
  readonly guardando: boolean
  /** The last save failed: the counter turns red until the draft changes. */
  readonly conError: boolean
  readonly deshacer: Deshacer
  readonly onAbrirLista: () => void
  readonly onDescartar: () => void
  readonly onGuardar: () => void
  /** Phone layout: no "Descartar" (it is in the pending list), "Deshacer" icon-only. */
  readonly compacta?: boolean
}

export const textoSinGuardar = (n: number): string => `${contar(n, 'cambio', 'cambios')} sin guardar`

export function BarraGuardado({ cambios, guardando, conError, deshacer, onAbrirLista, onDescartar, onGuardar, compacta = false }: BarraGuardadoProps): ReactElement {
  const textoDeshacer = deshacer.pendiente ? 'Deshacer' : 'Deshacer último guardado'
  const idDescripcion = useId()
  const descripcion = deshacer.motivo ?? (deshacer.pendiente ? `Quita: ${deshacer.pendiente.descripcion}` : deshacer.paso ? `Deshace: ${deshacer.paso.descripcion}` : '')
  return (
    <>
      {cambios > 0 ? (
        <BotonSistema type="button" variante="ghost" tamaño="sm" aria-haspopup="dialog" onClick={onAbrirLista}>
          <PuntoEstado tono={conError ? 'danger' : 'warning'} etiqueta={textoSinGuardar(cambios)} className="text-sm text-foreground" />
        </BotonSistema>
      ) : (
        <span role="status" className="inline-flex min-h-9 items-center">
          <PuntoEstado tono="success" etiqueta="Todo guardado" />
        </span>
      )}
      {compacta ? (
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          soloIcono
          icono={Undo2}
          aria-label={textoDeshacer}
          aria-disabled={deshacer.motivo !== null}
          aria-describedby={idDescripcion}
          title={descripcion}
          onClick={deshacer.ejecutar}
        />
      ) : (
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
          {textoDeshacer}
        </BotonSistema>
      )}
      <span id={idDescripcion} hidden>
        {descripcion}
      </span>
      {cambios > 0 && !compacta && (
        <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={guardando} onClick={onDescartar}>
          Descartar
        </BotonSistema>
      )}
      <BotonSistema type="button" variante="primario" tamaño="sm" disabled={cambios === 0} cargando={guardando} onClick={onGuardar}>
        Guardar
      </BotonSistema>
    </>
  )
}
