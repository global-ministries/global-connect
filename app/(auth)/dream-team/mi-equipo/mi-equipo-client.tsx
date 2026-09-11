'use client'

/**
 * Dream Team — client island for /dream-team/mi-equipo (area director view).
 *
 * Owns `ContenedorDashboard` directly (titulo="Mi equipo", no back arrow, no
 * description card). Renders the org-tree branch the caller reaches with
 * the SAME shared `<NodoFila>` row used by
 * app/(auth)/admin/dream-team/estructura/estructura-client.tsx (see
 * components/dream-team/nodo-fila.tsx) so the two screens never diverge —
 * here its accessory is a person count instead of edit actions. Below each
 * row, the people serving there render as compact member rows (name, rol
 * badge, etapa badge, and "Cambiar etapa" when `puedeEditar`); an empty
 * node gets one muted "Sin servidores" line instead of its own card, so a
 * director can scan for gaps without eight near-empty cards.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Network } from 'lucide-react'

import { BadgeSistema, ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { NodoFila, NODO_FILA_INDENTACION_PX_MAXIMA, NODO_FILA_INDENTACION_PX_POR_NIVEL } from '@/components/dream-team/nodo-fila'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS, rolBadgeVariante, rolLabel } from '@/components/dream-team/labels'

import { DREAM_TEAM_ESTADOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'

export interface MiEquipoServicioRow {
  readonly servicio: DreamTeamServicio
  readonly personaNombre: string
  readonly rolLabel: string
}

export interface MiEquipoClientProps {
  readonly arbol: readonly NodoArbol[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly serviciosPorEquipo: Readonly<Record<string, readonly MiEquipoServicioRow[]>>
  readonly puedeEditar: boolean
}

function indentacionPx(nivel: number): number {
  return Math.min(nivel * NODO_FILA_INDENTACION_PX_POR_NIVEL, NODO_FILA_INDENTACION_PX_MAXIMA)
}

export function MiEquipoClient({
  arbol,
  rolesPorEquipo,
  serviciosPorEquipo,
  puedeEditar,
}: MiEquipoClientProps): ReactElement {
  const router = useRouter()
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(new Set())

  const conteoPorEstado = useMemo(() => {
    const conteo: Record<DreamTeamEstado, number> = {
      postulado: 0,
      en_orientacion: 0,
      activo: 0,
      en_pausa: 0,
      inactivo: 0,
      retirado: 0,
    }
    for (const filas of Object.values(serviciosPorEquipo)) {
      for (const fila of filas) conteo[fila.servicio.estado] += 1
    }
    return conteo
  }, [serviciosPorEquipo])

  function toggleColapsado(id: string): void {
    setColapsados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (arbol.length === 0) {
    return (
      <ContenedorDashboard titulo="Mi equipo">
        <EstadoVacio
          icono={Network}
          titulo="No alcanzás ningún equipo todavía"
          subtitulo="Puede deberse a que aún no te asignaron un área en la estructura de Dream Team."
        />
      </ContenedorDashboard>
    )
  }

  function renderFilas(nodos: readonly NodoArbol[]): ReactElement[] {
    return nodos.flatMap((nodo) => {
      const { equipo, hijos, nivel } = nodo
      const roles = rolesPorEquipo[equipo.id] ?? []
      const filas = serviciosPorEquipo[equipo.id] ?? []
      const expandido = !colapsados.has(equipo.id)

      const bloque = (
        <div key={equipo.id}>
          <NodoFila
            equipo={equipo}
            roles={roles}
            nivel={nivel}
            tieneHijos={hijos.length > 0}
            expandido={expandido}
            onToggleExpandido={() => toggleColapsado(equipo.id)}
            accesorio={
              <TextoSistema variante="sutil" tamaño="sm" className="whitespace-nowrap">
                {filas.length} {filas.length === 1 ? 'persona' : 'personas'}
              </TextoSistema>
            }
          />
          <div style={{ marginLeft: indentacionPx(nivel) + 44 }} className="pb-2">
            {filas.length === 0 ? (
              <TextoSistema variante="sutil" tamaño="sm" className="text-muted-foreground/70">
                Sin servidores
              </TextoSistema>
            ) : (
              <ul className="grid gap-2 border-l border-border pl-3">
                {filas.map((fila) => (
                  <li
                    key={fila.servicio.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <TextoSistema className="text-sm font-medium">{fila.personaNombre}</TextoSistema>
                      <BadgeSistema variante={rolBadgeVariante(fila.rolLabel)} tamaño="sm" className="mt-1">
                        {rolLabel(fila.rolLabel)}
                      </BadgeSistema>
                    </div>
                    <div className="flex items-center gap-2">
                      <BadgeSistema variante={ESTADO_BADGE_VARIANTE[fila.servicio.estado]} tamaño="sm">
                        {ESTADO_LABELS[fila.servicio.estado]}
                      </BadgeSistema>
                      {puedeEditar && (
                        <AvanceEtapaControl
                          servicioId={fila.servicio.id}
                          estadoActual={fila.servicio.estado}
                          version={fila.servicio.version}
                          puedeEditar={puedeEditar}
                          onSuccess={() => router.refresh()}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )

      return expandido ? [bloque, ...renderFilas(hijos)] : [bloque]
    })
  }

  return (
    <ContenedorDashboard titulo="Mi equipo">
      <div className="flex flex-wrap gap-2">
        {DREAM_TEAM_ESTADOS.map((estado) => (
          <BadgeSistema key={estado} variante={ESTADO_BADGE_VARIANTE[estado]} tamaño="sm">
            {ESTADO_LABELS[estado]}: {conteoPorEstado[estado]}
          </BadgeSistema>
        ))}
      </div>

      <TarjetaSistema className="p-0">
        <div className="divide-y divide-border px-3 sm:px-4">{renderFilas(arbol)}</div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
