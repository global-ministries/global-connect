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
 *
 * Each member row's `servidor` (see lib/platform/dream-team/servidores.ts)
 * is either a Dream Team servicio or a Grupos de Vida leader/co-leader
 * surfaced read-only (see lib/platform/dream-team/lideres-gdv.ts) — grouped
 * under the GROUP node they lead, a virtual node from
 * lib/platform/dream-team/estructura-gdv.ts. A `grupos_vida` row is always
 * shown as Activo, gets the 'Grupos de Vida' badge next to its rol, and
 * never gets "Cambiar etapa" — its lifecycle is managed in Grupos de Vida —
 * showing muted "Se gestiona en Grupos de Vida" text instead when
 * `puedeEditar`.
 *
 * Every Grupos de Vida segmento starts collapsed, same reasoning and same
 * mechanism (the initial `colapsados` state) as estructura-client.tsx — see
 * estructura-arbol.ts's `idsSegmentosColapsadosPorDefecto`.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Network } from 'lucide-react'

import { BadgeSistema, ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { NodoFila, NODO_FILA_INDENTACION_PX_MAXIMA, NODO_FILA_INDENTACION_PX_POR_NIVEL } from '@/components/dream-team/nodo-fila'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL, rolBadgeVariante, rolLabel } from '@/components/dream-team/labels'

import { DREAM_TEAM_ESTADOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamRol } from '@/lib/platform/dream-team/types'
import { contarPorRama, type NodoArbol } from '@/lib/platform/dream-team/arbol'
import { idsSegmentosColapsadosPorDefecto, type NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { claveDeServidor, estadoDeServidor, type Servidor } from '@/lib/platform/dream-team/servidores'

export interface MiEquipoServicioRow {
  readonly servidor: Servidor
  readonly personaNombre: string
  readonly rolLabel: string
}

/**
 * The humanized rol text for a row. A dream_team row's `rolLabel` is the raw
 * catalog key (e.g. `coordinador`) and needs `rolLabel()`; a grupos_vida
 * row's is already the final Spanish text from `ROL_LIDER_GDV_LABELS`.
 */
function etiquetaRolDeFila(fila: MiEquipoServicioRow): string {
  return fila.servidor.origen === 'dream_team' ? rolLabel(fila.rolLabel) : fila.rolLabel
}

export interface MiEquipoClientProps {
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
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
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(() => idsSegmentosColapsadosPorDefecto(arbol))

  // Branch headcount: a parent's people live in its descendants. Counting only
  // the node itself told a director "Experiencia · Sin servidores" while three
  // people served beneath it.
  const totalesPorRama = useMemo(() => {
    const propios: Record<string, number> = {}
    for (const [equipoId, filas] of Object.entries(serviciosPorEquipo)) propios[equipoId] = filas.length
    return contarPorRama(arbol, propios)
  }, [arbol, serviciosPorEquipo])

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
      for (const fila of filas) conteo[estadoDeServidor(fila.servidor)] += 1
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

  function renderFilas(nodos: readonly NodoArbol<NodoEquipoArbol>[]): ReactElement[] {
    return nodos.flatMap((nodo) => {
      const { equipo, hijos, nivel } = nodo
      const roles = rolesPorEquipo[equipo.id] ?? []
      const filas = serviciosPorEquipo[equipo.id] ?? []
      const totalRama = totalesPorRama.get(equipo.id) ?? filas.length
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
                {etiquetaConteo(totalRama, hijos.length > 0)}
              </TextoSistema>
            }
          />
          <div style={{ marginLeft: indentacionPx(nivel) + 44 }} className="pb-2">
            {totalRama === 0 ? (
              <TextoSistema variante="sutil" tamaño="sm" className="text-muted-foreground/70">
                Sin servidores
              </TextoSistema>
            ) : filas.length === 0 ? null : (
              <ul className="grid gap-2 border-l border-border pl-3">
                {filas.map((fila) => {
                  const servidor = fila.servidor
                  const esGdv = servidor.origen === 'grupos_vida'
                  const estado = estadoDeServidor(servidor)
                  return (
                    <li
                      key={claveDeServidor(servidor)}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
                    >
                      <div className="min-w-0">
                        <TextoSistema className="text-sm font-medium">{fila.personaNombre}</TextoSistema>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <BadgeSistema variante={rolBadgeVariante(fila.rolLabel)} tamaño="sm">
                            {etiquetaRolDeFila(fila)}
                          </BadgeSistema>
                          {esGdv && servidor.origen === 'grupos_vida' && (
                            <BadgeSistema variante="default" tamaño="sm">
                              {ORIGEN_GRUPOS_VIDA_LABEL}
                            </BadgeSistema>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <BadgeSistema variante={ESTADO_BADGE_VARIANTE[estado]} tamaño="sm">
                          {ESTADO_LABELS[estado]}
                        </BadgeSistema>
                        {puedeEditar &&
                          (esGdv ? (
                            <TextoSistema variante="sutil" tamaño="sm">
                              Se gestiona en Grupos de Vida
                            </TextoSistema>
                          ) : servidor.origen === 'dream_team' ? (
                            <AvanceEtapaControl
                              servicioId={servidor.servicio.id}
                              estadoActual={servidor.servicio.estado}
                              version={servidor.servicio.version}
                              puedeEditar={puedeEditar}
                              onSuccess={() => router.refresh()}
                            />
                          ) : null)}
                      </div>
                    </li>
                  )
                })}
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

/**
 * A leaf shows its own people; a parent shows its whole branch and says so,
 * so "3 en la rama" is never mistaken for three people serving directly there.
 */
function etiquetaConteo(total: number, tieneHijos: boolean): string {
  if (tieneHijos) return `${total} en la rama`
  return `${total} ${total === 1 ? 'persona' : 'personas'}`
}
