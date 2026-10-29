'use client'

/**
 * Estructura — "Agregar subequipo" from the phone FAB when no box was opened
 * yet: first choose where (every active, editable Dream Team node, indented
 * by depth), then name it in the same dialog the node panel uses
 * (DialogoNombre + crearEquipo). Grupos de Vida nodes are read-only and never
 * offered.
 */
import { useState, type ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { crearEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'
import type { NodoOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'

import { DialogoNombre } from './dialogo-nombre'
import type { Toast } from './mensajes'

export interface DialogoSubequipoProps {
  /** The parent; the dialog closes when it is `null`. */
  readonly padre: { readonly id: string; readonly label: string } | null
  readonly onClose: () => void
  readonly onHecho: () => void
  readonly toast: Toast
}

/** The one-field "Agregar subequipo" dialog for a known parent. */
export function DialogoSubequipo({ padre, onClose, onHecho, toast }: DialogoSubequipoProps): ReactElement | null {
  if (!padre) return null
  return (
    <DialogoNombre
      titulo="Agregar subequipo"
      descripcion={`Se creará dentro de «${padre.label}».`}
      etiquetaCampo="Nombre del subequipo"
      valorInicial=""
      textoBoton="Crear"
      exito="Subequipo creado correctamente."
      guardar={(label) => crearEquipo({ parentEquipoId: padre.id, label })}
      onClose={onClose}
      onHecho={onHecho}
      toast={toast}
    />
  )
}

export interface SelectorPadreProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** Every node, pre-order; only the active, editable ones are offered. */
  readonly nodos: readonly NodoOrganigrama[]
  readonly onHecho: () => void
  readonly toast: Toast
}

export function SelectorPadre({ abierto, onCambioAbierto, nodos, onHecho, toast }: SelectorPadreProps): ReactElement {
  const [padre, setPadre] = useState<{ readonly id: string; readonly label: string } | null>(null)
  const opciones = nodos.filter((nodo) => nodo.editable && nodo.activo)

  return (
    <>
      <DetalleResponsivo
        abierto={abierto}
        onCambioAbierto={onCambioAbierto}
        titulo="Agregar subequipo"
        descripcion="Elegí dentro de qué equipo crearlo."
      >
        <ul aria-label="Equipos" className="divide-y divide-border overflow-hidden rounded-2xl bg-card">
          {opciones.map((nodo) => (
            <li key={nodo.id}>
              <button
                type="button"
                onClick={() => {
                  onCambioAbierto(false)
                  setPadre({ id: nodo.id, label: nodo.label })
                }}
                className="focus-ring flex min-h-14 w-full items-center gap-3 px-3.5 text-left touch-manipulation active:bg-accent"
                style={{ paddingLeft: 14 + nodo.profundidad * 16 }}
              >
                <span className="min-w-0 flex-1 truncate text-base text-foreground">{nodo.label}</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </DetalleResponsivo>
      <DialogoSubequipo padre={padre} onClose={() => setPadre(null)} onHecho={onHecho} toast={toast} />
    </>
  )
}
