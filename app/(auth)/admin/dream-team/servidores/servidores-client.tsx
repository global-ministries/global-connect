'use client'

/**
 * Dream Team — client island for /admin/dream-team/servidores (the pool).
 *
 * Owns `ContenedorDashboard` directly (titulo="Servidores", no back arrow,
 * no description card — see components/dream-team/estado-vacio.tsx for why
 * this island no longer imports from components/talleres/). The primary
 * action ("Asignar servicio") sits in `accionPrincipal` — desktop-only,
 * like Grupos de Vida's header actions — with a `BotonFlotante` mirror for
 * mobile (its `onClick` prop, not `href`, since this opens a `Dialog`
 * rather than navigating).
 *
 * Filters follow the Grupos de Vida pattern (GruposList.client.tsx): a
 * visible name search plus a `Sheet` with the etapa filter (kept in the URL
 * query param `estado`, shareable). The assigner is a `Dialog` following
 * SelectLeaderModal.tsx: debounced persona search with `AbortController`,
 * a flattened-tree node selector, then a role selector for that node.
 *
 * Each row's `servidor` (see lib/platform/dream-team/servidores.ts) is
 * either a Dream Team servicio or a Grupos de Vida leader/co-leader
 * surfaced read-only (see lib/platform/dream-team/lideres-gdv.ts), grouped
 * under the GROUP node they lead — a virtual node from
 * lib/platform/dream-team/estructura-gdv.ts, so its label resolves through
 * the merged tree the same way a real equipo's does. A `dream_team` row
 * gets the shared `<AvanceEtapaControl>` (see
 * components/dream-team/avance-etapa-control.tsx) as its "Cambiar etapa"
 * action, which calls `router.refresh()` on success instead of reconciling
 * local state, since the server component re-fetches the RLS-scoped truth.
 * A `grupos_vida` row never gets that control — its lifecycle is managed in
 * Grupos de Vida, not here — and shows muted "Se gestiona en Grupos de
 * Vida" text plus an 'Grupos de Vida' badge in its place.
 *
 * The assigner's "Equipo" select only ever lists REAL (`origen: 'dream_team'`)
 * nodes — creating a new servicio against a virtual Grupos de Vida id would
 * be meaningless (it isn't a `dream_team_equipos` row to assign into), so
 * `aplanarArbol` filters those out even though the merged `arbol` prop
 * carries both.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Filter, Search, UserPlus } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  ContenedorDashboard,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { AsignadorServicioDialog, type NodoPlano } from '@/components/dream-team/asignador-servicio-dialog'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL, rolLabel } from '@/components/dream-team/labels'

import { DREAM_TEAM_ESTADOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { claveDeServidor, equipoIdDeServidor, estadoDeServidor, type Servidor } from '@/lib/platform/dream-team/servidores'

export interface ServidorRow {
  readonly servidor: Servidor
  readonly personaNombre: string
  readonly equipoLabel: string
  readonly rolLabel: string
}

/** The date a servidor started — `fechaInicio` for a servicio, `desde` for a GdV leader. */
function fechaInicioDeServidor(servidor: Servidor): string {
  return servidor.origen === 'dream_team' ? servidor.servicio.fechaInicio : servidor.lider.desde
}

/**
 * The humanized rol text for a row. A dream_team row's `rolLabel` is the raw
 * catalog key (e.g. `coordinador`) and needs `rolLabel()`; a grupos_vida
 * row's is already the final Spanish text from `ROL_LIDER_GDV_LABELS`.
 */
function etiquetaRolDeFila(row: ServidorRow): string {
  return row.servidor.origen === 'dream_team' ? rolLabel(row.rolLabel) : row.rolLabel
}

export interface ServidoresClientProps {
  readonly rows: readonly ServidorRow[]
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
}

const FILTRO_TODOS = 'todos' as const

/**
 * Flattens the tree into the assigner's "Equipo" select options — REAL
 * equipos only. A virtual Grupos de Vida node is never offered: assigning a
 * new servicio against it would target an id that isn't a `dream_team_equipos`
 * row (see this file's header comment). Its children are still walked (a
 * dream_team descendant under a virtual ancestor can't happen today, but
 * this stays correct if it ever did) — only the push is filtered.
 */
function aplanarArbol(nodos: readonly NodoArbol<NodoEquipoArbol>[]): NodoPlano[] {
  const resultado: NodoPlano[] = []
  function visitar(nodo: NodoArbol<NodoEquipoArbol>): void {
    if (nodo.equipo.origen === 'dream_team') {
      const prefijo = nodo.nivel > 0 ? `${'—'.repeat(nodo.nivel)} ` : ''
      resultado.push({ id: nodo.equipo.id, etiqueta: `${prefijo}${nodo.equipo.label}` })
    }
    nodo.hijos.forEach(visitar)
  }
  nodos.forEach(visitar)
  return resultado
}

/** Maps every equipoId to the labels of its visible ancestors, root-first (not including itself). */
function construirRutasAncestros(nodos: readonly NodoArbol<NodoEquipoArbol>[]): Map<string, readonly string[]> {
  const mapa = new Map<string, readonly string[]>()
  function visitar(nodo: NodoArbol<NodoEquipoArbol>, ancestros: readonly string[]): void {
    mapa.set(nodo.equipo.id, ancestros)
    nodo.hijos.forEach((hijo) => visitar(hijo, [...ancestros, nodo.equipo.label]))
  }
  nodos.forEach((nodo) => visitar(nodo, []))
  return mapa
}

function formatFecha(value: string): string {
  try {
    return new Date(value).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return value
  }
}

function esEstadoValido(value: string | null): value is DreamTeamEstado {
  return value !== null && (DREAM_TEAM_ESTADOS as readonly string[]).includes(value)
}

export function ServidoresClient({ rows, arbol, rolesPorEquipo, puedeEditar }: ServidoresClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const toast = useNotificaciones()

  const estadoInicial = searchParams?.get('estado') ?? null
  const [estadoFiltro, setEstadoFiltro] = useState<DreamTeamEstado | typeof FILTRO_TODOS>(
    esEstadoValido(estadoInicial) ? estadoInicial : FILTRO_TODOS,
  )
  // T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — the
  // taller page's "Gestionar en Servidores" link deep-links with
  // ?equipo=<nodeId>, same URL-as-state pattern as estadoFiltro above.
  const [equipoFiltro, setEquipoFiltro] = useState<string | null>(searchParams?.get('equipo') ?? null)
  const [textoFiltro, setTextoFiltro] = useState('')
  const [asignadorAbierto, setAsignadorAbierto] = useState(false)

  function cambiarEstadoFiltro(valor: string): void {
    const nuevoEstado = valor === FILTRO_TODOS ? FILTRO_TODOS : (valor as DreamTeamEstado)
    setEstadoFiltro(nuevoEstado)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (nuevoEstado === FILTRO_TODOS) {
      params.delete('estado')
    } else {
      params.set('estado', nuevoEstado)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  function limpiarEquipoFiltro(): void {
    setEquipoFiltro(null)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.delete('equipo')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  const conteoPorEstado = useMemo(() => {
    const conteo: Record<DreamTeamEstado, number> = {
      postulado: 0,
      en_orientacion: 0,
      activo: 0,
      en_pausa: 0,
      inactivo: 0,
      retirado: 0,
    }
    for (const row of rows) conteo[estadoDeServidor(row.servidor)] += 1
    return conteo
  }, [rows])

  // T11 — the label for the active equipo filter's chip, resolved from
  // whichever row already carries it (every row — dream_team or
  // grupos_vida — has its own resolved equipoLabel), never re-derived from
  // the tree by hand.
  const equipoFiltroLabel = useMemo(
    () => (equipoFiltro ? (rows.find((row) => equipoIdDeServidor(row.servidor) === equipoFiltro)?.equipoLabel ?? equipoFiltro) : null),
    [rows, equipoFiltro],
  )

  const filasFiltradas = useMemo(() => {
    const texto = textoFiltro.trim().toLowerCase()
    return rows.filter((row) => {
      if (estadoFiltro !== FILTRO_TODOS && estadoDeServidor(row.servidor) !== estadoFiltro) return false
      if (equipoFiltro && equipoIdDeServidor(row.servidor) !== equipoFiltro) return false
      if (texto && !row.personaNombre.toLowerCase().includes(texto)) return false
      return true
    })
  }, [rows, estadoFiltro, equipoFiltro, textoFiltro])

  const nodosPlanos = useMemo(() => aplanarArbol(arbol), [arbol])
  const rutasAncestros = useMemo(() => construirRutasAncestros(arbol), [arbol])
  const filtrosActivos = (estadoFiltro !== FILTRO_TODOS ? 1 : 0) + (equipoFiltro ? 1 : 0)

  function cerrarAsignadorYRefrescar(): void {
    setAsignadorAbierto(false)
    router.refresh()
  }

  return (
    <ContenedorDashboard
      titulo="Servidores"
      accionPrincipal={
        puedeEditar ? (
          <BotonSistema
            type="button"
            variante="primario"
            tamaño="sm"
            icono={UserPlus}
            onClick={() => setAsignadorAbierto(true)}
          >
            Asignar servicio
          </BotonSistema>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        {DREAM_TEAM_ESTADOS.map((estado) => (
          <BadgeSistema key={estado} variante={ESTADO_BADGE_VARIANTE[estado]} tamaño="sm">
            {ESTADO_LABELS[estado]}: {conteoPorEstado[estado]}
          </BadgeSistema>
        ))}
      </div>

      {/* T11 — the taller page's "Gestionar en Servidores" link lands here
          pre-filtered (?equipo=<nodeId>); this chip makes that filter
          visible (never a silent, unexplained shorter list) and clearable. */}
      {equipoFiltro && (
        <div className="flex items-center gap-2">
          <BadgeSistema variante="info" tamaño="sm">
            Equipo: {equipoFiltroLabel}
          </BadgeSistema>
          <button
            type="button"
            onClick={limpiarEquipoFiltro}
            className="text-sm text-muted-foreground underline"
          >
            Quitar filtro
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <InputSistema
          icono={Search}
          label="Buscar por nombre"
          placeholder="Nombre de la persona…"
          value={textoFiltro}
          onChange={(e) => setTextoFiltro(e.target.value)}
          className="max-w-xs"
        />
        <Sheet>
          <SheetTrigger asChild>
            <BotonSistema variante="outline" tamaño="sm" className="relative min-w-0">
              <Filter className="h-4 w-4 flex-shrink-0" />
              <span className="ml-2 hidden sm:inline">Filtros</span>
              {filtrosActivos > 0 && (
                <span className="absolute -top-1 -right-1 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-orange-600 text-[10px] text-primary-foreground">
                  {filtrosActivos}
                </span>
              )}
            </BotonSistema>
          </SheetTrigger>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            <SheetHeader className="border-b border-border px-6 py-4">
              <SheetTitle className="text-lg font-semibold text-foreground">Filtros de servidores</SheetTitle>
            </SheetHeader>
            <div className="grid gap-3 p-6">
              <SelectSistema
                label="Filtrar por etapa"
                opciones={[
                  { valor: FILTRO_TODOS, etiqueta: 'Todas las etapas' },
                  ...DREAM_TEAM_ESTADOS.map((estado) => ({ valor: estado, etiqueta: ESTADO_LABELS[estado] })),
                ]}
                value={estadoFiltro}
                onValueChange={cambiarEstadoFiltro}
              />
              <BotonSistema type="button" variante="outline" onClick={() => cambiarEstadoFiltro(FILTRO_TODOS)}>
                Limpiar filtros
              </BotonSistema>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {filasFiltradas.length === 0 ? (
        <EstadoVacio icono={UserPlus} titulo="No hay servicios registrados" subtitulo="No hay servicios que coincidan con el filtro aplicado." />
      ) : (
        <>
          {/* Desktop — table */}
          <div className="hidden overflow-hidden md:block">
            <TarjetaSistema className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Persona</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Equipo</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Rol</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Etapa</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">
                      Inicio
                    </th>
                    {puedeEditar && (
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filasFiltradas.map((row) => {
                    const servidor = row.servidor
                    const esGdv = servidor.origen === 'grupos_vida'
                    const estado = estadoDeServidor(servidor)
                    const ruta = rutasAncestros.get(equipoIdDeServidor(servidor)) ?? []
                    return (
                      <tr key={claveDeServidor(servidor)} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-sm text-foreground">{row.personaNombre}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-foreground">{row.equipoLabel}</div>
                          {ruta.length > 0 && (
                            <div className="text-xs text-muted-foreground/70">{ruta.join(' · ')}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{etiquetaRolDeFila(row)}</span>
                            {esGdv && servidor.origen === 'grupos_vida' && (
                              <BadgeSistema variante="default" tamaño="sm">
                                {ORIGEN_GRUPOS_VIDA_LABEL}
                              </BadgeSistema>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <BadgeSistema variante={ESTADO_BADGE_VARIANTE[estado]} tamaño="sm">
                            {ESTADO_LABELS[estado]}
                          </BadgeSistema>
                        </td>
                        <td className="hidden px-4 py-3 text-sm text-muted-foreground lg:table-cell">
                          {formatFecha(fechaInicioDeServidor(servidor))}
                        </td>
                        {puedeEditar && (
                          <td className="px-4 py-3">
                            {esGdv ? (
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
                            ) : null}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TarjetaSistema>
          </div>

          {/* Mobile — cards */}
          <div className="space-y-3 md:hidden">
            {filasFiltradas.map((row) => {
              const servidor = row.servidor
              const esGdv = servidor.origen === 'grupos_vida'
              const estado = estadoDeServidor(servidor)
              const ruta = rutasAncestros.get(equipoIdDeServidor(servidor)) ?? []
              return (
                <TarjetaSistema key={claveDeServidor(servidor)} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <TextoSistema className="text-sm font-medium">{row.personaNombre}</TextoSistema>
                      <TextoSistema variante="sutil" className="mt-1 block text-xs">
                        {row.equipoLabel}
                        {ruta.length > 0 && ` · ${ruta.join(' · ')}`} · {etiquetaRolDeFila(row)}
                      </TextoSistema>
                      {esGdv && servidor.origen === 'grupos_vida' && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <BadgeSistema variante="default" tamaño="sm">
                            {ORIGEN_GRUPOS_VIDA_LABEL}
                          </BadgeSistema>
                        </div>
                      )}
                      <TextoSistema variante="sutil" className="mt-1 block text-xs">
                        Desde {formatFecha(fechaInicioDeServidor(servidor))}
                      </TextoSistema>
                    </div>
                    <BadgeSistema variante={ESTADO_BADGE_VARIANTE[estado]} tamaño="sm">
                      {ESTADO_LABELS[estado]}
                    </BadgeSistema>
                  </div>
                  {puedeEditar && (
                    <div className="mt-3">
                      {esGdv ? (
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
                      ) : null}
                    </div>
                  )}
                </TarjetaSistema>
              )
            })}
          </div>
        </>
      )}

      {puedeEditar && (
        <BotonFlotante icono={UserPlus} label="Asignar servicio" onClick={() => setAsignadorAbierto(true)} />
      )}

      <AsignadorServicioDialog
        abierto={asignadorAbierto}
        onClose={() => setAsignadorAbierto(false)}
        nodosPlanos={nodosPlanos}
        rolesPorEquipo={rolesPorEquipo}
        onAsignado={cerrarAsignadorYRefrescar}
        toast={toast}
      />
    </ContenedorDashboard>
  )
}
