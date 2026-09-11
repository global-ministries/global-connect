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
 * surfaced read-only (see lib/platform/dream-team/lideres-gdv.ts). A
 * `dream_team` row gets the shared `<AvanceEtapaControl>` (see
 * components/dream-team/avance-etapa-control.tsx) as its "Cambiar etapa"
 * action, which calls `router.refresh()` on success instead of reconciling
 * local state, since the server component re-fetches the RLS-scoped truth.
 * A `grupos_vida` row never gets that control — its lifecycle is managed in
 * Grupos de Vida, not here — and shows muted "Se gestiona en Grupos de
 * Vida" text plus an 'Grupos de Vida' badge in its place.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL, rolLabel } from '@/components/dream-team/labels'

import { DREAM_TEAM_ESTADOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
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
  readonly arbol: readonly NodoArbol[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
}

interface NodoPlano {
  readonly id: string
  readonly etiqueta: string
}

interface UsuarioResult {
  readonly id: string
  readonly email: string | null
  readonly nombre: string | null
  readonly apellido: string | null
}

const FILTRO_TODOS = 'todos' as const
const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

function aplanarArbol(nodos: readonly NodoArbol[]): NodoPlano[] {
  const resultado: NodoPlano[] = []
  function visitar(nodo: NodoArbol): void {
    const prefijo = nodo.nivel > 0 ? `${'—'.repeat(nodo.nivel)} ` : ''
    resultado.push({ id: nodo.equipo.id, etiqueta: `${prefijo}${nodo.equipo.label}` })
    nodo.hijos.forEach(visitar)
  }
  nodos.forEach(visitar)
  return resultado
}

/** Maps every equipoId to the labels of its visible ancestors, root-first (not including itself). */
function construirRutasAncestros(nodos: readonly NodoArbol[]): Map<string, readonly string[]> {
  const mapa = new Map<string, readonly string[]>()
  function visitar(nodo: NodoArbol, ancestros: readonly string[]): void {
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

function nombreCompleto(u: UsuarioResult): string {
  const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim()
  return nombre.length > 0 ? nombre : (u.email ?? 'Sin nombre')
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

  const filasFiltradas = useMemo(() => {
    const texto = textoFiltro.trim().toLowerCase()
    return rows.filter((row) => {
      if (estadoFiltro !== FILTRO_TODOS && estadoDeServidor(row.servidor) !== estadoFiltro) return false
      if (texto && !row.personaNombre.toLowerCase().includes(texto)) return false
      return true
    })
  }, [rows, estadoFiltro, textoFiltro])

  const nodosPlanos = useMemo(() => aplanarArbol(arbol), [arbol])
  const rutasAncestros = useMemo(() => construirRutasAncestros(arbol), [arbol])
  const filtrosActivos = estadoFiltro !== FILTRO_TODOS ? 1 : 0

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
                              <>
                                <BadgeSistema variante="default" tamaño="sm">
                                  {ORIGEN_GRUPOS_VIDA_LABEL}
                                </BadgeSistema>
                                {servidor.lider.grupos > 1 && (
                                  <TextoSistema variante="sutil" tamaño="sm">
                                    · {servidor.lider.grupos} grupos
                                  </TextoSistema>
                                )}
                              </>
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
                          {servidor.lider.grupos > 1 && (
                            <TextoSistema variante="sutil" tamaño="sm">
                              · {servidor.lider.grupos} grupos
                            </TextoSistema>
                          )}
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

// ── Assigner dialog ────────────────────────────────────────────────────

interface AsignadorServicioDialogProps {
  readonly abierto: boolean
  readonly onClose: () => void
  readonly nodosPlanos: readonly NodoPlano[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly onAsignado: () => void
  readonly toast: ReturnType<typeof useNotificaciones>
}

function AsignadorServicioDialog({
  abierto,
  onClose,
  nodosPlanos,
  rolesPorEquipo,
  onAsignado,
  toast,
}: AsignadorServicioDialogProps): ReactElement {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<UsuarioResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<UsuarioResult | null>(null)
  const [equipoId, setEquipoId] = useState('')
  const [rolId, setRolId] = useState('')
  const [enviando, setEnviando] = useState(false)

  const requestSeqRef = useRef(0)

  useEffect(() => {
    if (!abierto) return
    setQuery('')
    setResultados([])
    setPersona(null)
    setEquipoId('')
    setRolId('')
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const q = query.trim()
    if (persona || q.length < MIN_QUERY_LENGTH) {
      setResultados([])
      setBuscando(false)
      return
    }

    const seq = ++requestSeqRef.current
    const controller = new AbortController()
    setBuscando(true)

    async function ejecutar(): Promise<void> {
      try {
        const res = await fetch(`/api/dream-team/usuarios/buscar?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as UsuarioResult[]
        if (seq === requestSeqRef.current) setResultados(data)
      } catch {
        if (seq === requestSeqRef.current) setResultados([])
      } finally {
        if (seq === requestSeqRef.current) setBuscando(false)
      }
    }

    const timer = setTimeout(() => {
      void ejecutar()
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, persona, abierto])

  const rolesDelNodo = equipoId ? (rolesPorEquipo[equipoId] ?? []) : []

  async function crear(): Promise<void> {
    if (!persona || !equipoId || !rolId || enviando) return
    setEnviando(true)
    try {
      const res = await fetch('/api/dream-team/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, equipoId, rolId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error((body && typeof body.error === 'string' && body.error) || 'No se pudo crear el servicio.')
        return
      }
      toast.success('Servicio asignado correctamente.')
      onAsignado()
    } catch {
      toast.error('No se pudo crear el servicio.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asignar servicio</DialogTitle>
          <DialogDescription>Buscá a la persona, elegí el nodo del árbol y su rol.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {persona ? (
            <div className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
              <TextoSistema className="min-w-0 truncate font-medium">{nombreCompleto(persona)}</TextoSistema>
              <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setPersona(null)}>
                Cambiar
              </BotonSistema>
            </div>
          ) : (
            <div>
              <InputSistema
                icono={Search}
                label="Buscar persona"
                placeholder="Buscar por nombre, apellido o email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {buscando && (
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
                  Buscando…
                </TextoSistema>
              )}
              {!buscando && query.trim().length >= MIN_QUERY_LENGTH && resultados.length === 0 && (
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
                  Sin resultados.
                </TextoSistema>
              )}
              {resultados.length > 0 && (
                <ul className="mt-2 max-h-56 overflow-auto rounded border border-border">
                  {resultados.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPersona(u)
                          setResultados([])
                        }}
                        className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="text-sm font-medium">{nombreCompleto(u)}</span>
                        {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <SelectSistema
            label="Equipo"
            opciones={nodosPlanos.map((n) => ({ valor: n.id, etiqueta: n.etiqueta }))}
            placeholder="Elegí un nodo del árbol"
            value={equipoId}
            onValueChange={(v) => {
              setEquipoId(v)
              setRolId('')
            }}
          />

          <SelectSistema
            label="Rol"
            opciones={rolesDelNodo.map((r) => ({ valor: r.id, etiqueta: rolLabel(r.label) }))}
            placeholder={equipoId ? 'Elegí un rol' : 'Elegí primero un equipo'}
            value={rolId}
            onValueChange={setRolId}
            disabled={!equipoId}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onClose}>
            Cancelar
          </BotonSistema>
          <BotonSistema
            type="button"
            tamaño="sm"
            disabled={!persona || !equipoId || !rolId || enviando}
            onClick={() => {
              void crear()
            }}
          >
            {enviando ? 'Creando…' : 'Crear'}
          </BotonSistema>
        </div>
      </DialogContent>
    </Dialog>
  )
}
