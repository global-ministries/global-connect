'use client'

/**
 * Dream Team — client island for /admin/dream-team/servidores (the pool).
 *
 * Renders every visible servicio (persona + equipo + rol + estado + fecha),
 * with a shareable estado filter (URL query param `estado`) and a
 * client-side text filter over persona names. Responsive pattern mirrors
 * components/talleres/tabla-inscripciones.tsx: a desktop `<table>` and
 * mobile cards render side by side, toggled purely with `hidden sm:block` /
 * `sm:hidden` (no JS media-query logic).
 *
 * When `puedeEditar` is true it also renders the assigner (search persona →
 * pick a tree node → pick one of that node's roles → POST
 * /api/dream-team/servicios) and, per row, the shared
 * `<AvanceEtapaControl>`. Both call `router.refresh()` on success instead of
 * reconciling local state — the server component re-fetches the
 * RLS-scoped truth.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { EmptyState } from '@/components/talleres/dashboard-page'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS } from '@/components/dream-team/labels'

import { DREAM_TEAM_ESTADOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'

export interface ServidorRow {
  readonly servicio: DreamTeamServicio
  readonly personaNombre: string
  readonly equipoLabel: string
  readonly rolLabel: string
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

  const estadoInicial = searchParams?.get('estado') ?? null
  const [estadoFiltro, setEstadoFiltro] = useState<DreamTeamEstado | typeof FILTRO_TODOS>(
    esEstadoValido(estadoInicial) ? estadoInicial : FILTRO_TODOS,
  )
  const [textoFiltro, setTextoFiltro] = useState('')

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
    for (const row of rows) conteo[row.servicio.estado] += 1
    return conteo
  }, [rows])

  const filasFiltradas = useMemo(() => {
    const texto = textoFiltro.trim().toLowerCase()
    return rows.filter((row) => {
      if (estadoFiltro !== FILTRO_TODOS && row.servicio.estado !== estadoFiltro) return false
      if (texto && !row.personaNombre.toLowerCase().includes(texto)) return false
      return true
    })
  }, [rows, estadoFiltro, textoFiltro])

  const nodosPlanos = useMemo(() => aplanarArbol(arbol), [arbol])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {DREAM_TEAM_ESTADOS.map((estado) => (
          <BadgeSistema key={estado} variante={ESTADO_BADGE_VARIANTE[estado]} tamaño="sm">
            {ESTADO_LABELS[estado]}: {conteoPorEstado[estado]}
          </BadgeSistema>
        ))}
      </div>

      {puedeEditar && (
        <AsignadorServicio nodosPlanos={nodosPlanos} rolesPorEquipo={rolesPorEquipo} onAsignado={() => router.refresh()} />
      )}

      <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-3">
          <SelectSistema
            label="Filtrar por etapa"
            opciones={[
              { valor: FILTRO_TODOS, etiqueta: 'Todas las etapas' },
              ...DREAM_TEAM_ESTADOS.map((estado) => ({ valor: estado, etiqueta: ESTADO_LABELS[estado] })),
            ]}
            value={estadoFiltro}
            onValueChange={cambiarEstadoFiltro}
            className="max-w-xs"
          />
          <InputSistema
            label="Buscar por nombre"
            placeholder="Nombre de la persona…"
            value={textoFiltro}
            onChange={(e) => setTextoFiltro(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </TarjetaSistema>

      {filasFiltradas.length === 0 ? (
        <EmptyState message="No hay servicios que coincidan con el filtro aplicado." />
      ) : (
        <>
          {/* Desktop — table */}
          <div className="hidden sm:block overflow-hidden">
            <TarjetaSistema className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Persona
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Equipo
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Rol
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Etapa
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Inicio
                    </th>
                    {puedeEditar && (
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Acciones
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filasFiltradas.map((row) => (
                    <tr key={row.servicio.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground">{row.personaNombre}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.equipoLabel}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.rolLabel}</td>
                      <td className="px-4 py-3">
                        <BadgeSistema variante={ESTADO_BADGE_VARIANTE[row.servicio.estado]} tamaño="sm">
                          {ESTADO_LABELS[row.servicio.estado]}
                        </BadgeSistema>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatFecha(row.servicio.fechaInicio)}</td>
                      {puedeEditar && (
                        <td className="px-4 py-3">
                          <AvanceEtapaControl
                            servicioId={row.servicio.id}
                            estadoActual={row.servicio.estado}
                            version={row.servicio.version}
                            puedeEditar={puedeEditar}
                            onSuccess={() => router.refresh()}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TarjetaSistema>
          </div>

          {/* Mobile — cards */}
          <div className="sm:hidden space-y-3">
            {filasFiltradas.map((row) => (
              <TarjetaSistema key={row.servicio.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <TextoSistema className="text-sm font-medium">{row.personaNombre}</TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-xs">
                      {row.equipoLabel} · {row.rolLabel}
                    </TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-xs">
                      Desde {formatFecha(row.servicio.fechaInicio)}
                    </TextoSistema>
                  </div>
                  <BadgeSistema variante={ESTADO_BADGE_VARIANTE[row.servicio.estado]} tamaño="sm">
                    {ESTADO_LABELS[row.servicio.estado]}
                  </BadgeSistema>
                </div>
                {puedeEditar && (
                  <div className="mt-3">
                    <AvanceEtapaControl
                      servicioId={row.servicio.id}
                      estadoActual={row.servicio.estado}
                      version={row.servicio.version}
                      puedeEditar={puedeEditar}
                      onSuccess={() => router.refresh()}
                    />
                  </div>
                )}
              </TarjetaSistema>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Assigner ────────────────────────────────────────────────────────────

interface AsignadorServicioProps {
  readonly nodosPlanos: readonly NodoPlano[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly onAsignado: () => void
}

function AsignadorServicio({ nodosPlanos, rolesPorEquipo, onAsignado }: AsignadorServicioProps): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<UsuarioResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<UsuarioResult | null>(null)
  const [equipoId, setEquipoId] = useState('')
  const [rolId, setRolId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestSeqRef = useRef(0)

  useEffect(() => {
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
  }, [query, persona])

  const rolesDelNodo = equipoId ? (rolesPorEquipo[equipoId] ?? []) : []

  function limpiar(): void {
    setPersona(null)
    setQuery('')
    setResultados([])
    setEquipoId('')
    setRolId('')
    setError(null)
  }

  async function crear(): Promise<void> {
    if (!persona || !equipoId || !rolId || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/dream-team/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, equipoId, rolId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError((body && typeof body.error === 'string' && body.error) || 'No se pudo crear el servicio.')
        return
      }
      limpiar()
      setAbierto(false)
      onAsignado()
    } catch {
      setError('No se pudo crear el servicio.')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <BotonSistema type="button" tamaño="sm" onClick={() => setAbierto(true)}>
        Asignar servicio
      </BotonSistema>
    )
  }

  return (
    <TarjetaSistema variante="elevated" className="p-4 sm:p-5">
      <TituloSistema nivel={3}>Asignar servicio</TituloSistema>
      <div className="mt-3 grid gap-3">
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
          opciones={rolesDelNodo.map((r) => ({ valor: r.id, etiqueta: r.label }))}
          placeholder={equipoId ? 'Elegí un rol' : 'Elegí primero un equipo'}
          value={rolId}
          onValueChange={setRolId}
          disabled={!equipoId}
        />
      </div>

      {error && (
        <TextoSistema role="alert" tamaño="sm" className="mt-3 text-red-500 dark:text-red-400">
          {error}
        </TextoSistema>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          onClick={() => {
            limpiar()
            setAbierto(false)
          }}
        >
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
    </TarjetaSistema>
  )
}
