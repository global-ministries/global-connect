"use client"

import { useMemo, useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Eye, Edit, Trash2, Plus, Users2, Sparkles, UserPlus, Filter, ChevronDown, ChevronUp } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import FiltrosGrupos, { type FiltrosGruposState } from "@/components/ui/FiltrosGrupos"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { TarjetaSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno"
import { TabsSistema, TabsList, TabsTrigger, TabsContent } from "@/components/ui/TabsSistema"
import { useNotificaciones } from "@/hooks/use-notificaciones"

type Segmento = { id: string; nombre: string }
type Temporada = { id: string; nombre: string }
type Municipio = { id: string; nombre: string }
type Parroquia = { id: string; nombre: string; municipio_id: string }

type Grupo = {
  id: string
  nombre: string
  activo: boolean
  eliminado?: boolean
  segmento_nombre?: string | null
  temporada_nombre?: string | null
  municipio_nombre?: string | null
  parroquia_nombre?: string | null
  lideres?: Array<{ id: string; nombre_completo?: string | null; rol?: string | null }>
  // opcionales del RPC futuro
  fecha_creacion?: string | null
  miembros_count?: number | null
  supervisado_por_mi?: boolean | null
  soy_miembro?: boolean | null
  soy_lider?: boolean | null
  estado_temporal?: 'actual' | 'pasado' | 'futuro'
}

// Helper: color por segmento (misma lógica que en server, mantenida aquí para client)
const SEGMENTO_COLOR_MAP: Record<string, string> = {
  WaumbaLand: "bg-amber-100 text-amber-800 border-amber-200",
  Upstreet: "bg-sky-100 text-sky-800 border-sky-200",
  Transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Inside Out": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  "The Living Room": "bg-rose-100 text-rose-800 border-rose-200",
  Matrimonios: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Hombre +36": "bg-blue-100 text-blue-800 border-blue-200",
  "Hombres de 26 a 35": "bg-blue-50 text-blue-800 border-blue-200",
  "Mujeres +36": "bg-pink-100 text-pink-800 border-pink-200",
  "Mujeres de 26 a 35": "bg-pink-50 text-pink-800 border-pink-200",
}

function segmentoBadgeClass(nombre?: string | null) {
  if (!nombre) return "bg-gray-100 text-gray-700 border-gray-200"
  const exact = SEGMENTO_COLOR_MAP[nombre]
  if (exact) return exact
  const key = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  if (key.includes("matrimon")) return "bg-rose-100 text-rose-800 border-rose-200"
  if (key.includes("mujer")) return "bg-pink-100 text-pink-800 border-pink-200"
  if (key.includes("hombre")) return "bg-blue-100 text-blue-800 border-blue-200"
  if (key.includes("joven")) return "bg-violet-100 text-violet-800 border-violet-200"
  if (key.includes("nino") || key.includes("niño")) return "bg-amber-100 text-amber-800 border-amber-200"
  if (key.includes("adolesc")) return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200"
  if (key.includes("famil")) return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (key.includes("discipul")) return "bg-cyan-100 text-cyan-800 border-cyan-200"
  if (key.includes("lider")) return "bg-teal-100 text-teal-800 border-teal-200"
  if (key.includes("mision")) return "bg-orange-100 text-orange-800 border-orange-200"
  if (key.includes("visit")) return "bg-slate-100 text-slate-800 border-slate-200"
  if (key.includes("nuevo")) return "bg-green-100 text-green-800 border-green-200"
  return "bg-gray-100 text-gray-700 border-gray-200"
}

export default function GruposListClient({
  grupos,
  segmentos,
  temporadas,
  municipios,
  parroquias,
  totalCount = 0,
  pageSize = 20,
  canCreate = false,
  canDelete = false,
  canRestore = false,
  userRoles = [],
  filtroEstado,
  hayMisGrupos = false,
  preActuales,
  prePasados,
  preMios,
  preFuturos,
  totalActuales,
  totalPasados,
  totalMios,
  totalFuturos,
}: {
  grupos: Grupo[]
  segmentos: Segmento[]
  temporadas: Temporada[]
  municipios?: Municipio[]
  parroquias?: Parroquia[]
  totalCount?: number
  pageSize?: number
  canCreate?: boolean
  canDelete?: boolean
  canRestore?: boolean
  userRoles?: string[]
  filtroEstado?: string | undefined
  hayMisGrupos?: boolean
  preActuales?: Grupo[]
  prePasados?: Grupo[]
  preMios?: Grupo[]
  preFuturos?: Grupo[]
  totalActuales?: number
  totalPasados?: number
  totalMios?: number
  totalFuturos?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [filtros, setFiltros] = useState<FiltrosGruposState>({})
  const [mostrarTodosKpis, setMostrarTodosKpis] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [updatingAction, setUpdatingAction] = useState<'activar' | 'desactivar' | null>(null)
  const initialTab = (sp?.get('tab') as 'actuales' | 'pasados' | 'futuros' | 'mios' | null) || 'actuales'
  const [pestanaActiva, setPestanaActiva] = useState<'actuales' | 'pasados' | 'futuros' | 'mios'>(initialTab)

  const puedeGestionarEnLote = useMemo(() => 
    (userRoles || []).some(role =>
      ['admin', 'pastor', 'director-general'].includes(role)
    ), [userRoles]);

  const segmentoNombreById = useMemo(() => {
    const m = new Map<string, string>()
    segmentos.forEach(s => m.set(s.id, s.nombre))
    return m
  }, [])

  const onTabChange = useCallback((v: string) => {
    const next = (v as 'actuales' | 'pasados' | 'futuros' | 'mios')
    setPestanaActiva(next)
    const params = new URLSearchParams(sp?.toString() || '')
    params.set('tab', next)
    // reiniciar página de la pestaña activa
    const paramName = next === 'actuales' ? 'page_actuales' : next === 'pasados' ? 'page_pasados' : next === 'mios' ? 'page_mios' : 'page_futuros'
    params.set(paramName, '1')
    // limpiar parámetro legacy
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}`)
  }, [pathname, router, sp])

  useEffect(() => {
    const t = (sp?.get('tab') as any) || 'actuales'
    setPestanaActiva(t)
  }, [sp])

  const temporadaNombreById = useMemo(() => {
    const m = new Map<string, string>()
    temporadas.forEach(t => m.set(t.id, t.nombre))
    return m
  }, [temporadas])

  // Los grupos ya vienen filtrados desde el servidor
  const toast = useNotificaciones()
  const [internalGrupos, setInternalGrupos] = useState<Grupo[]>(grupos)
  useEffect(()=>{ 
    setInternalGrupos(grupos)
    setSelectedGroups([]) // Limpiar selección si los datos de grupos cambian
  }, [grupos])

  const eliminarGrupo = useCallback(async (id: string, nombre: string) => {
    if (!canDelete) return
    const confirmar = window.confirm(`¿Enviar a la papelera el grupo "${nombre}"? Podrás restaurarlo luego si tienes permisos.`)
    if (!confirmar) return
    try {
      const res = await fetch(`/api/grupos/${id}`, { method: 'DELETE' })
      const body = await res.json().catch(()=>({}))
      if (!res.ok || !body.ok) {
        toast.error(body.error || `Error al eliminar (HTTP ${res.status})`)
        return
      }
      // Si no estamos en vista 'eliminado' quitamos la fila inmediatamente; si estamos en 'eliminado' (raro) la dejamos actualizada
      setInternalGrupos(prev => prev
        .map(g => g.id === id ? { ...g, eliminado: true, activo: false } : g)
        .filter(g => (filtroEstado === 'eliminado') || !g.eliminado ? true : (filtroEstado === 'eliminado'))
      )
      toast.success(`"${nombre}" ahora está en la papelera.`)
    } catch (e:any) {
      toast.error(e.message || 'Error desconocido')
    }
  }, [canDelete, toast, filtroEstado])

  const restaurarGrupo = useCallback(async (id: string, nombre: string) => {
    if (!canRestore) return
    try {
      const res = await fetch(`/api/grupos/${id}/restore`, { method: 'POST' })
      const body = await res.json().catch(()=>({}))
      if (!res.ok || !body.ok) {
        toast.error(body.error || `Error al restaurar (HTTP ${res.status})`)
        return
      }
      setInternalGrupos(prev => prev
        .map(g => g.id === id ? { ...g, eliminado: false, activo: true } : g)
        // Si estamos viendo sólo eliminados, al restaurar lo removemos de la lista
        .filter(g => filtroEstado === 'eliminado' ? g.eliminado : true)
      )
      toast.success(`"${nombre}" ha sido restaurado.`)
    } catch (e:any) {
      toast.error(e.message || 'Error desconocido')
    }
  }, [canRestore, toast, filtroEstado])

  // Aplicar filtro estado 'eliminado' client-side adicionalmente (ya se filtró en server, pero refuerzo por seguridad si cambian props sin recarga)
  const gruposFiltrados = useMemo(() => {
    return internalGrupos
  }, [internalGrupos])

  const onFiltrosChange = useCallback((f: FiltrosGruposState) => setFiltros(f), [])

  const gruposActuales = useMemo(() => (preActuales && preActuales.length > 0) ? preActuales : internalGrupos.filter(g => (g.estado_temporal ?? (g.activo ? 'actual' : 'pasado')) === 'actual'), [preActuales, internalGrupos])
  const gruposPasados = useMemo(() => (prePasados && prePasados.length > 0) ? prePasados : internalGrupos.filter(g => (g.estado_temporal ?? (g.activo ? 'actual' : 'pasado')) === 'pasado'), [prePasados, internalGrupos])
  const gruposFuturos = useMemo(() => (preFuturos && preFuturos.length > 0) ? preFuturos : internalGrupos.filter(g => g.estado_temporal === 'futuro'), [preFuturos, internalGrupos])
  const gruposMios = useMemo(() => (preMios && preMios.length > 0) ? preMios : internalGrupos.filter(g => !!g.soy_miembro), [preMios, internalGrupos])
  const mostrarFuturos = useMemo(() => {
    const esSuperior = (userRoles || []).some(r => ['admin','pastor','director-general'].includes(r))
    return esSuperior && gruposFuturos.length > 0
  }, [userRoles, gruposFuturos.length])

  const mostrarMisGrupos = useMemo(() => hayMisGrupos || gruposMios.length > 0, [hayMisGrupos, gruposMios.length])

  const listaMostrada = useMemo(() => {
    if (pestanaActiva === 'actuales') return gruposActuales
    if (pestanaActiva === 'pasados') return gruposPasados
    if (pestanaActiva === 'futuros') return gruposFuturos
    return gruposMios
  }, [pestanaActiva, gruposActuales, gruposPasados, gruposFuturos, gruposMios])

  const totalPorPestana = useMemo(() => {
    switch (pestanaActiva) {
      case 'actuales': return totalActuales ?? totalCount
      case 'pasados': return totalPasados ?? totalCount
      case 'mios': return totalMios ?? totalCount
      case 'futuros': return totalFuturos ?? totalCount
    }
  }, [pestanaActiva, totalActuales, totalPasados, totalMios, totalFuturos, totalCount])

  const pageParam = useMemo(() => (
    pestanaActiva === 'actuales' ? 'page_actuales' :
    pestanaActiva === 'pasados' ? 'page_pasados' :
    pestanaActiva === 'mios' ? 'page_mios' : 'page_futuros'
  ), [pestanaActiva])

  function Listado({ lista }: { lista: Grupo[] }) {
    return (
      <>
        {/* Lista responsiva - Desktop: tabla, Móvil: tarjetas */}
        <TarjetaSistema className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  {puedeGestionarEnLote && (
                    <th className="px-4 py-3">
                      <Checkbox
                        checked={lista.length > 0 && selectedGroups.length === lista.length}
                        onCheckedChange={(checked) => {
                          setSelectedGroups(checked ? lista.map(g => g.id) : [])
                        }}
                        aria-label="Seleccionar todos los grupos"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grupo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Líder</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Segmento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Temporada</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  {canDelete && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lista && lista.length > 0 ? (
                  lista.map((grupo) => (
                    <tr key={grupo.id} className={cn("hover:bg-gray-50/50 transition-colors", selectedGroups.includes(grupo.id) && 'bg-orange-50')}>
                      {puedeGestionarEnLote && (
                        <td className="px-4 py-4">
                          <Checkbox
                            checked={selectedGroups.includes(grupo.id)}
                            onCheckedChange={(checked) => {
                              setSelectedGroups(prev => 
                                checked 
                                  ? [...prev, grupo.id] 
                                  : prev.filter(id => id !== grupo.id)
                              )
                            }}
                            aria-label={`Seleccionar grupo ${grupo.nombre}`}
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-10 bg-gradient-to-r from-orange-400 to-orange-500 rounded-lg flex-shrink-0"></div>
                          <div>
                            <Link href={`/dashboard/grupos/${grupo.id}`} className="hover:text-orange-600 transition-colors">
                              <div className="flex items-center gap-2 font-medium text-gray-900 hover:underline cursor-pointer">
                                <span>{grupo.nombre}</span>
                                {grupo.supervisado_por_mi && (
                                  <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                                    Dir. etapa
                                  </span>
                                )}
                              </div>
                            </Link>
                            {(grupo.soy_lider || grupo.soy_miembro) && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {grupo.soy_lider ? 'Soy líder' : 'Soy miembro'}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 align-top">
                        {(() => {
                          if (!Array.isArray(grupo.lideres) || grupo.lideres.length === 0) return 'Sin líder asignado'
                          const leaders = grupo.lideres.filter(l => (l.rol || '').toLowerCase() === 'líder')
                          if (leaders.length === 0) return 'Sin líder asignado'
                          const coliders = grupo.lideres.filter(l => (l.rol || '').toLowerCase() === 'colíder')
                          const leaderNames = leaders.map(l => l.nombre_completo).filter(Boolean)
                          return (
                            <div className="flex flex-col gap-0.5">
                              {leaderNames.map((n, idx) => (
                                <span key={idx}>{n}</span>
                              ))}
                              {coliders.length > 0 && (
                                <span className="mt-0.5 inline-flex w-max items-center rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-medium border border-orange-200">
                                  +{coliders.length} {coliders.length === 1 ? 'aprendiz' : 'aprendices'}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <BadgeSistema 
                          variante="default" 
                          tamaño="sm"
                          className={segmentoBadgeClass(grupo.segmento_nombre || undefined)}
                        >
                          {grupo.segmento_nombre || "Sin segmento"}
                        </BadgeSistema>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {grupo.temporada_nombre || "Sin temporada"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {grupo.eliminado ? (
                          <BadgeSistema variante="default" tamaño="sm" className="bg-red-100 text-red-700 border-red-200">Eliminado</BadgeSistema>
                        ) : grupo.activo ? (
                          <BadgeSistema variante="success" tamaño="sm">Activo</BadgeSistema>
                        ) : (
                          <BadgeSistema variante="default" tamaño="sm">Inactivo</BadgeSistema>
                        )}
                      </td>
                      {canDelete && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {grupo.eliminado ? (
                            canRestore && (
                              <button
                                onClick={() => restaurarGrupo(grupo.id, grupo.nombre)}
                                className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-xs font-medium"
                              >Restaurar</button>
                            )
                          ) : (
                            <button
                              onClick={() => eliminarGrupo(grupo.id, grupo.nombre)}
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 text-xs font-medium"
                            >
                              <Trash2 className="w-4 h-4" /> Papelera
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={puedeGestionarEnLote ? 6 : 5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Users2 className="w-12 h-12 text-gray-300" />
                        <div>
                          <p className="text-gray-500 font-medium">No hay grupos registrados</p>
                          <p className="text-gray-400 text-sm">No hay grupos que coincidan con los filtros</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TarjetaSistema>

        {/* Vista móvil - Tarjetas */}
        <div className="md:hidden space-y-4">
          {lista && lista.length > 0 ? (
            lista.map((grupo) => (
              <TarjetaSistema key={grupo.id} className={cn("p-4 relative", puedeGestionarEnLote && "pr-12", selectedGroups.includes(grupo.id) && 'bg-orange-50 border-orange-200')}>
                {puedeGestionarEnLote && (
                  <div className="absolute top-3 right-3">
                    <Checkbox
                      checked={selectedGroups.includes(grupo.id)}
                      onCheckedChange={(checked) => {
                        setSelectedGroups(prev => 
                          checked 
                            ? [...prev, grupo.id] 
                            : prev.filter(id => id !== grupo.id)
                        )
                      }}
                      aria-label={`Seleccionar grupo ${grupo.nombre}`}
                    />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="w-12 h-8 bg-gradient-to-r from-orange-400 to-orange-500 rounded-lg flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <Link href={`/dashboard/grupos/${grupo.id}`} className="hover:text-orange-600 transition-colors">
                          <h3 className="font-semibold text-gray-900 truncate hover:underline cursor-pointer flex items-center gap-2">
                            <span className="truncate">{grupo.nombre}</span>
                            {grupo.supervisado_por_mi && (
                              <span className="inline-flex flex-shrink-0 items-center rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                                Dir. etapa
                              </span>
                            )}
                          </h3>
                        </Link>
                        {(grupo.soy_lider || grupo.soy_miembro) && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {grupo.soy_lider ? 'Soy líder' : 'Soy miembro'}
                          </div>
                        )}
                      </div>
                      {grupo.eliminado ? (
                        <BadgeSistema variante="default" tamaño="sm" className="ml-2 flex-shrink-0 bg-red-100 text-red-700 border-red-200">Eliminado</BadgeSistema>
                      ) : grupo.activo ? (
                        <BadgeSistema variante="success" tamaño="sm" className="ml-2 flex-shrink-0">Activo</BadgeSistema>
                      ) : (
                        <BadgeSistema variante="default" tamaño="sm" className="ml-2 flex-shrink-0">Inactivo</BadgeSistema>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Líder:</span>{" "}
                        <span>
                          {(() => {
                            if (!Array.isArray(grupo.lideres) || grupo.lideres.length === 0) return 'Sin líder asignado'
                            const leaders = grupo.lideres.filter(l => (l.rol || '').toLowerCase() === 'líder')
                            if (leaders.length === 0) return 'Sin líder asignado'
                            const coliders = grupo.lideres.filter(l => (l.rol || '').toLowerCase() === 'colíder')
                            const leaderNames = leaders.map(l => l.nombre_completo).filter(Boolean)
                            return (
                              <span className="inline-flex flex-col gap-0.5">
                                {leaderNames.map((n, idx) => (
                                  <span key={idx}>{n}</span>
                                ))}
                                {coliders.length > 0 && (
                                  <span className="mt-0.5 inline-flex w-max items-center rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 text-[10px] font-medium border border-orange-200">
                                    +{coliders.length} {coliders.length === 1 ? 'aprendiz' : 'aprendices'}
                                  </span>
                                )}
                              </span>
                            )
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Segmento:</span>
                        <BadgeSistema 
                          variante="default" 
                          tamaño="sm"
                          className={segmentoBadgeClass(grupo.segmento_nombre || undefined)}
                        >
                          {grupo.segmento_nombre || "Sin segmento"}
                        </BadgeSistema>
                      </div>
                    </div>
                  </div>
                </div>
              </TarjetaSistema>
            ))
          ) : (
            <TarjetaSistema className="p-8">
              <div className="text-center">
                <Users2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay grupos disponibles</h3>
                <p className="text-gray-500 mb-6">No hay grupos que coincidan con los filtros seleccionados</p>
                {canCreate && (
                  <Link href="/dashboard/grupos/create">
                    <BotonSistema variante="primario">
                      <Plus className="w-4 h-4 mr-2" />
                      Crear Primer Grupo
                    </BotonSistema>
                  </Link>
                )}
              </div>
            </TarjetaSistema>
          )}
        </div>
      </>
    )
  }

  const handleUpdateStatus = async (status: boolean) => {
    if (selectedGroups.length === 0 || isUpdating) return;

    setUpdatingAction(status ? 'activar' : 'desactivar')
    setIsUpdating(true);
    try {
      const res = await fetch('/api/grupos/bulk-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: selectedGroups, status }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar los grupos.');
      }

      toast.success(`${data.count} grupos han sido actualizados.`);
      
      // Forzar la recarga de datos desde el servidor para reflejar los cambios
      router.refresh();
      setSelectedGroups([]);

    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar los grupos.');
    } finally {
      setIsUpdating(false);
      setUpdatingAction(null)
    }
  };

  // Sincronizar filtros con la URL
  useEffect(() => {
    // Sincroniza filtros en la URL pero SOLO toca 'page' si realmente cambió algún filtro
    const current = new URLSearchParams(sp?.toString() || '')
    const prevKey = JSON.stringify([
      current.get('segmentoId'),
      current.get('temporadaId'),
      current.get('estado'),
      current.get('municipioId'),
      current.get('parroquiaId'),
    ])
    const next = new URLSearchParams(current.toString())
    const setOrDel = (k: string, v?: string) => {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setOrDel('segmentoId', filtros.segmentoId)
    setOrDel('temporadaId', filtros.temporadaId)
    setOrDel('estado', filtros.estado)
    setOrDel('municipioId', filtros.municipioId)
    setOrDel('parroquiaId', filtros.parroquiaId)
    const nextKey = JSON.stringify([
      next.get('segmentoId'),
      next.get('temporadaId'),
      next.get('estado'),
      next.get('municipioId'),
      next.get('parroquiaId'),
    ])
    // Si los filtros cambiaron, resetear page a 1
    if (prevKey !== nextKey) {
      next.delete('page')
    }
    // Evitar navegación redundante
    if (next.toString() !== current.toString()) {
      router.replace(`${pathname}?${next.toString()}`)
    }
  }, [filtros, router, pathname, sp])

  // Inicializar filtros desde URL al cargar
  useEffect(() => {
    setFiltros({
  segmentoId: sp?.get('segmentoId') || undefined,
  temporadaId: sp?.get('temporadaId') || undefined,
  estado: (sp?.get('estado') as any) || undefined,
  municipioId: sp?.get('municipioId') || undefined,
  parroquiaId: sp?.get('parroquiaId') || undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // KPIs dinámicos según filtros
  const kpis = useMemo(() => {
    const total = listaMostrada.length
    const activos = listaMostrada.filter(g => g.activo).length
    // Nuevos este mes por fecha_creacion si existe; si no, 0
    const ahora = new Date()
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0)
    const nuevosMes = listaMostrada.filter(g => {
      if (!g.fecha_creacion) return false
      const d = new Date(g.fecha_creacion)
      return d >= inicioMes && d <= finMes
    }).length
    // Total miembros si hay conteo; si no, estimado 0
    const totalMiembros = listaMostrada.reduce((acc, g) => acc + (g.miembros_count ?? 0), 0)
    return { total, activos, nuevosMes, totalMiembros }
  }, [listaMostrada])

  const filtrosActivos = useMemo(() => {
    let n = 0
    if (filtros.segmentoId) n++
    if (filtros.temporadaId) n++
    if (filtros.estado) n++
    if (filtros.municipioId) n++
    if (filtros.parroquiaId) n++
    return n
  }, [filtros])

  return (
    <div className="space-y-6">
      {puedeGestionarEnLote && selectedGroups.length > 0 && (
        <TarjetaSistema className="p-4 bg-orange-50 border-orange-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{selectedGroups.length} seleccionados</span>
            <div className="flex items-center gap-2 flex-wrap">
              <BotonSistema onClick={() => handleUpdateStatus(true)} tamaño="sm" cargando={isUpdating && updatingAction === 'activar'} disabled={isUpdating}>
                {isUpdating && updatingAction === 'activar' ? 'Activando...' : 'Activar'}
              </BotonSistema>
              <BotonSistema onClick={() => handleUpdateStatus(false)} tamaño="sm" variante="secundario" cargando={isUpdating && updatingAction === 'desactivar'} disabled={isUpdating}>
                {isUpdating && updatingAction === 'desactivar' ? 'Desactivando...' : 'Desactivar'}
              </BotonSistema>
              <BotonSistema onClick={() => setSelectedGroups([])} tamaño="sm" variante="ghost" disabled={isUpdating}>
                Cancelar
              </BotonSistema>
            </div>
          </div>
        </TarjetaSistema>
      )}
      {/* KPIs responsivos - Móvil: solo total + botón, Desktop: todos */}
      <div className="md:hidden">
        <div className="grid grid-cols-1 gap-4">
          <KpiCard title="Total de Grupos" value={kpis.total} gradient="from-blue-500 to-cyan-500" Icon={Users2} />
          {mostrarTodosKpis && (
            <>
              <KpiCard title="Grupos Activos" value={kpis.activos} gradient="from-green-500 to-emerald-500" Icon={Sparkles} />
              <KpiCard title="Nuevos Grupos" subtitle="Este mes" value={kpis.nuevosMes} gradient="from-orange-500 to-red-500" Icon={UserPlus} />
              <KpiCard title="Total Miembros" subtitle="En grupos" value={kpis.totalMiembros} gradient="from-purple-500 to-pink-500" Icon={Users2} />
            </>
          )}
          <BotonSistema 
            variante="outline" 
            tamaño="sm"
            onClick={() => setMostrarTodosKpis(!mostrarTodosKpis)}
            className="w-full"
          >
            {mostrarTodosKpis ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                Mostrar menos
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                Ver todas las estadísticas
              </>
            )}
          </BotonSistema>
        </div>
      </div>
      
      {/* Desktop: mostrar todas las KPIs */}
      <div className="hidden md:grid md:grid-cols-4 gap-4">
        <KpiCard title="Total de Grupos" value={kpis.total} gradient="from-blue-500 to-cyan-500" Icon={Users2} />
        <KpiCard title="Grupos Activos" value={kpis.activos} gradient="from-green-500 to-emerald-500" Icon={Sparkles} />
        <KpiCard title="Nuevos Grupos" subtitle="Este mes" value={kpis.nuevosMes} gradient="from-orange-500 to-red-500" Icon={UserPlus} />
        <KpiCard title="Total Miembros" subtitle="En grupos" value={kpis.totalMiembros} gradient="from-purple-500 to-pink-500" Icon={Users2} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg lg:text-xl font-bold text-gray-800">Lista de Grupos</h3>
        <div className="flex items-center gap-2">
            <Sheet>
            <SheetTrigger asChild>
                <BotonSistema variante="outline" tamaño="sm" className="relative min-w-0">
                  <Filter className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline ml-2">Filtros</span>
                  {filtrosActivos > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-orange-600 text-white text-[10px] w-4 h-4 z-10">
                      {filtrosActivos}
                    </span>
                  )}
                </BotonSistema>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0">
              <SheetHeader className="px-6 py-4 border-b border-gray-200">
                <SheetTitle className="text-lg font-semibold text-gray-900">Filtros de grupos</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto max-h-[calc(100vh-80px)]">
                <FiltrosGrupos filtros={filtros} onFiltrosChange={onFiltrosChange} segmentos={segmentos} temporadas={temporadas} municipios={municipios || []} parroquias={parroquias || []} />
              </div>
            </SheetContent>
          </Sheet>
          {canCreate && (
            <Link href="/dashboard/grupos/create">
              <BotonSistema variante="primario" tamaño="sm" className="min-w-0">
                <Plus className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline ml-2">Crear Grupo</span>
              </BotonSistema>
            </Link>
          )}
        </div>
      </div>


      {/* Pestañas */}
      <TabsSistema value={pestanaActiva} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="actuales">Grupos Actuales</TabsTrigger>
          <TabsTrigger value="pasados">Grupos Pasados</TabsTrigger>
          {mostrarMisGrupos && <TabsTrigger value="mios">Mis Grupos</TabsTrigger>}
          {mostrarFuturos && <TabsTrigger value="futuros">Grupos Futuros</TabsTrigger>}
        </TabsList>

        <TabsContent value="actuales">
          <Listado lista={gruposActuales} />
        </TabsContent>
        <TabsContent value="pasados">
          <Listado lista={gruposPasados} />
        </TabsContent>
        {mostrarMisGrupos && (
          <TabsContent value="mios">
            <Listado lista={gruposMios} />
          </TabsContent>
        )}
        {mostrarFuturos && (
          <TabsContent value="futuros">
            <Listado lista={gruposFuturos} />
          </TabsContent>
        )}
      </TabsSistema>

      {/* Paginación y tamaño de página */}
      {totalPorPestana && totalPorPestana > 0 && (
        <div className="pt-6 mt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <span className="text-sm text-gray-600 select-none">Página {Number(sp?.get(pageParam)||'1')} de {Math.max(1, Math.ceil((totalPorPestana || 0) / pageSize))}</span>
            <PageSizeSelector />
          </div>
          <PaginationControls totalCount={totalPorPestana || 0} pageSize={pageSize} pageParam={pageParam} />
        </div>
      )}
    </div>
  )
}

function KpiCard({ title, subtitle, value, gradient, Icon }: { title: string; subtitle?: string; value: number; gradient: string; Icon: React.ComponentType<any> }) {
  return (
    <TarjetaSistema className="p-4 hover:scale-105 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br shadow-lg", gradient)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-800">{value}</div>
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-gray-800">{title}</div>
        {subtitle && (
          <div className="text-xs text-gray-500">{subtitle}</div>
        )}
      </div>
    </TarjetaSistema>
  )
}

function PaginationControls({ totalCount, pageSize, pageParam }: { totalCount: number; pageSize: number; pageParam: string }) {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const page = Number(sp?.get(pageParam) || '1')
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  // Si no hay más de una página, no renderizar controles
  if (totalPages <= 1) return null
  const updatePage = (next: number) => {
    const n = Math.min(Math.max(1, next), totalPages)
    if (n === page) return
    const params = new URLSearchParams(sp?.toString() || '')
    params.set(pageParam, String(n))
    router.replace(`${pathname}?${params.toString()}`)
  }
  return totalPages > 1 ? (
    <div className="flex gap-2" aria-label="Controles de paginación">
      <BotonSistema
        variante="outline"
        tamaño="sm"
        onClick={() => updatePage(page - 1)}
        disabled={page === 1}
      >Anterior</BotonSistema>
      <BotonSistema
        variante="outline"
        tamaño="sm"
        onClick={() => updatePage(page + 1)}
        disabled={page >= totalPages}
      >Siguiente</BotonSistema>
    </div>
  ) : null
}

function PageSizeSelector() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const size = Number(sp?.get('pageSize') || '20')
  const setSize = (n: number) => {
  const params = new URLSearchParams(sp?.toString() || "")
    params.set('pageSize', String(n))
    // reset de todas las páginas por pestaña
    params.delete('page')
    params.delete('page_actuales')
    params.delete('page_pasados')
    params.delete('page_mios')
    params.delete('page_futuros')
    router.replace(`${pathname}?${params.toString()}`)
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Mostrar:</span>
      <select
        className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
      >
        {[10, 20, 50, 100].map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  )
}
