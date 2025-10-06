"use client"

import { useMemo, useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Eye, Edit, Trash2, Plus, Users2, Sparkles, UserPlus, Filter, ChevronDown, ChevronUp } from "lucide-react"
import FiltrosGrupos, { type FiltrosGruposState } from "@/components/ui/FiltrosGrupos"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { TarjetaSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno"

type Segmento = { id: string; nombre: string }
type Temporada = { id: string; nombre: string }
type Municipio = { id: string; nombre: string }
type Parroquia = { id: string; nombre: string; municipio_id: string }

type Grupo = {
  id: string
  nombre: string
  activo: boolean
  segmento_nombre?: string | null
  temporada_nombre?: string | null
  municipio_nombre?: string | null
  parroquia_nombre?: string | null
  lideres?: Array<{ id: string; nombre_completo?: string | null; rol?: string | null }>
  // opcionales del RPC futuro
  fecha_creacion?: string | null
  miembros_count?: number | null
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
}: {
  grupos: Grupo[]
  segmentos: Segmento[]
  temporadas: Temporada[]
  municipios?: Municipio[]
  parroquias?: Parroquia[]
  totalCount?: number
  pageSize?: number
  canCreate?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [filtros, setFiltros] = useState<FiltrosGruposState>({})
  const [mostrarTodosKpis, setMostrarTodosKpis] = useState(false)

  const segmentoNombreById = useMemo(() => {
    const m = new Map<string, string>()
    segmentos.forEach(s => m.set(s.id, s.nombre))
    return m
  }, [segmentos])

  const temporadaNombreById = useMemo(() => {
    const m = new Map<string, string>()
    temporadas.forEach(t => m.set(t.id, t.nombre))
    return m
  }, [temporadas])

  // Los grupos ya vienen filtrados desde el servidor
  const gruposFiltrados = grupos

  const onFiltrosChange = useCallback((f: FiltrosGruposState) => setFiltros(f), [])

  // Sincronizar filtros con la URL
  useEffect(() => {
  const params = new URLSearchParams(sp?.toString() || "")
    const setOrDel = (k: string, v?: string) => {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    setOrDel('segmentoId', filtros.segmentoId)
    setOrDel('temporadaId', filtros.temporadaId)
    setOrDel('estado', filtros.estado)
    setOrDel('municipioId', filtros.municipioId)
    setOrDel('parroquiaId', filtros.parroquiaId)
    // reset page
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}`)
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
    const total = totalCount || gruposFiltrados.length
    const activos = gruposFiltrados.filter(g => g.activo).length
    // Nuevos este mes por fecha_creacion si existe; si no, 0
    const ahora = new Date()
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0)
    const nuevosMes = gruposFiltrados.filter(g => {
      if (!g.fecha_creacion) return false
      const d = new Date(g.fecha_creacion)
      return d >= inicioMes && d <= finMes
    }).length
    // Total miembros si hay conteo; si no, estimado 0
    const totalMiembros = gruposFiltrados.reduce((acc, g) => acc + (g.miembros_count ?? 0), 0)
    return { total, activos, nuevosMes, totalMiembros }
  }, [gruposFiltrados, totalCount])

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


      {/* Lista responsiva - Desktop: tabla, Móvil: tarjetas */}
      <TarjetaSistema className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grupo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Líder</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Segmento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Temporada</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {gruposFiltrados && gruposFiltrados.length > 0 ? (
                gruposFiltrados.map((grupo) => (
                  <tr key={grupo.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {/* Placeholder para imagen horizontal - más grande en desktop */}
                        <div className="w-16 h-10 bg-gradient-to-r from-orange-400 to-orange-500 rounded-lg flex-shrink-0"></div>
                        <Link href={`/dashboard/grupos/${grupo.id}`} className="hover:text-orange-600 transition-colors">
                          <div className="font-medium text-gray-900 hover:underline cursor-pointer">{grupo.nombre}</div>
                        </Link>
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
                      <BadgeSistema 
                        variante={grupo.activo ? "success" : "default"}
                        tamaño="sm"
                      >
                        {grupo.activo ? "Activo" : "Inactivo"}
                      </BadgeSistema>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
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
        {gruposFiltrados && gruposFiltrados.length > 0 ? (
          gruposFiltrados.map((grupo) => (
            <TarjetaSistema key={grupo.id} className="p-4">
              <div className="flex items-start gap-3">
                {/* Placeholder para imagen horizontal */}
                <div className="w-12 h-8 bg-gradient-to-r from-orange-400 to-orange-500 rounded-lg flex-shrink-0"></div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/dashboard/grupos/${grupo.id}`} className="hover:text-orange-600 transition-colors">
                        <h3 className="font-semibold text-gray-900 truncate hover:underline cursor-pointer">{grupo.nombre}</h3>
                      </Link>
                    </div>
                    <BadgeSistema 
                      variante={grupo.activo ? "success" : "default"}
                      tamaño="sm"
                      className="ml-2 flex-shrink-0"
                    >
                      {grupo.activo ? "Activo" : "Inactivo"}
                    </BadgeSistema>
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
                    <div>
                      <span className="font-medium">Temporada:</span>{" "}
                      <span>{grupo.temporada_nombre || "Sin temporada"}</span>
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

      {/* Paginación y tamaño de página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        <PageSizeSelector />
        {totalCount > pageSize && (
          <PaginationControls totalCount={totalCount} pageSize={pageSize} />
        )}
      </div>
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

function PaginationControls({ totalCount, pageSize }: { totalCount: number; pageSize: number }) {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const page = Number(sp?.get('page') || '1')
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const setPage = (p: number) => {
  const params = new URLSearchParams(sp?.toString() || "")
    params.set('page', String(p))
    router.replace(`${pathname}?${params.toString()}`)
  }
  return (
    <div className="flex items-center justify-between mt-4">
      <BotonSistema variante="outline" tamaño="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Anterior
      </BotonSistema>
      <div className="text-sm text-gray-600">Página {page} de {totalPages}</div>
      <BotonSistema variante="outline" tamaño="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
        Siguiente
      </BotonSistema>
    </div>
  )
}

function PageSizeSelector() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const size = Number(sp?.get('pageSize') || '20')
  const setSize = (n: number) => {
  const params = new URLSearchParams(sp?.toString() || "")
    params.set('pageSize', String(n))
    params.delete('page') // reset page
    router.replace(`${pathname}?${params.toString()}`)
  }
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>Items por página:</span>
      <select className="border rounded-md px-2 py-1 bg-white/70" value={size} onChange={(e) => setSize(Number(e.target.value))}>
        {[10, 20, 50, 100].map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  )
}
