'use client'

/**
 * Dream Team — client island for /dream-team/mi-equipo (area director view).
 *
 * Renders the org-tree branch the caller reaches (see ../../../../../lib/platform/dream-team/arbol.ts)
 * and, per node, the people serving there with their current stage. Structure
 * mirrors app/(auth)/admin/dream-team/estructura/estructura-client.tsx's tree
 * rendering (nested cards, capped indentation for 400px width) but shows
 * servicios instead of edit-the-tree controls.
 *
 * When `puedeEditar` is true, each servicio row gets the shared
 * `<AvanceEtapaControl>` (see components/dream-team/avance-etapa-control.tsx)
 * — the same control used on /admin/dream-team/servidores, not a duplicate.
 */
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'

import { BadgeSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { EmptyState } from '@/components/talleres/dashboard-page'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS } from '@/components/dream-team/labels'

import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'

export interface MiEquipoServicioRow {
  readonly servicio: DreamTeamServicio
  readonly personaNombre: string
  readonly rolLabel: string
}

export interface MiEquipoClientProps {
  readonly arbol: readonly NodoArbol[]
  readonly serviciosPorEquipo: Readonly<Record<string, readonly MiEquipoServicioRow[]>>
  readonly puedeEditar: boolean
}

const INDENTACION_PX_POR_NIVEL = 14
const INDENTACION_PX_MAXIMA = 70

export function MiEquipoClient({ arbol, serviciosPorEquipo, puedeEditar }: MiEquipoClientProps): ReactElement {
  const router = useRouter()

  if (arbol.length === 0) {
    return (
      <EmptyState message="No alcanzás ningún equipo todavía. Puede deberse a que aún no te asignaron un área en la estructura de Dream Team." />
    )
  }

  return (
    <div className="grid gap-3">
      {arbol.map((nodo) => (
        <NodoEquipoView
          key={nodo.equipo.id}
          nodo={nodo}
          serviciosPorEquipo={serviciosPorEquipo}
          puedeEditar={puedeEditar}
          onAdvanced={() => router.refresh()}
        />
      ))}
    </div>
  )
}

interface NodoEquipoViewProps {
  readonly nodo: NodoArbol
  readonly serviciosPorEquipo: Readonly<Record<string, readonly MiEquipoServicioRow[]>>
  readonly puedeEditar: boolean
  readonly onAdvanced: () => void
}

function NodoEquipoView({ nodo, serviciosPorEquipo, puedeEditar, onAdvanced }: NodoEquipoViewProps): ReactElement {
  const { equipo, hijos, nivel } = nodo
  const filas = serviciosPorEquipo[equipo.id] ?? []
  const indentacion = Math.min(nivel * INDENTACION_PX_POR_NIVEL, INDENTACION_PX_MAXIMA)

  return (
    <div style={{ marginLeft: indentacion }} className="min-w-0">
      <TarjetaSistema variante="outlined" className="p-3 sm:p-4">
        <TituloSistema nivel={4} className="min-w-0 break-words">
          {equipo.label}
        </TituloSistema>

        {filas.length === 0 ? (
          <TextoSistema variante="sutil" tamaño="sm" className="mt-2 block">
            Nadie sirve en este equipo todavía.
          </TextoSistema>
        ) : (
          <ul className="mt-2 grid gap-2">
            {filas.map((fila) => (
              <li
                key={fila.servicio.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <TextoSistema className="text-sm font-medium">{fila.personaNombre}</TextoSistema>
                  <TextoSistema variante="sutil" tamaño="sm">
                    {fila.rolLabel}
                  </TextoSistema>
                </div>
                <div className="flex items-center gap-2">
                  <BadgeSistema variante={ESTADO_BADGE_VARIANTE[fila.servicio.estado]} tamaño="sm">
                    {ESTADO_LABELS[fila.servicio.estado]}
                  </BadgeSistema>
                  <AvanceEtapaControl
                    servicioId={fila.servicio.id}
                    estadoActual={fila.servicio.estado}
                    version={fila.servicio.version}
                    puedeEditar={puedeEditar}
                    onSuccess={onAdvanced}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </TarjetaSistema>

      {hijos.length > 0 && (
        <div className="mt-3 grid gap-3">
          {hijos.map((hijo) => (
            <NodoEquipoView
              key={hijo.equipo.id}
              nodo={hijo}
              serviciosPorEquipo={serviciosPorEquipo}
              puedeEditar={puedeEditar}
              onAdvanced={onAdvanced}
            />
          ))}
        </div>
      )}
    </div>
  )
}
