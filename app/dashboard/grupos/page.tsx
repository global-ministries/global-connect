import { Users2, Eye, Edit, Trash2, Plus } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { Badge } from "@/components/ui/badge"

import { ReactNode } from "react"

function GlassCard({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  )
}

export default async function Page() {
  // Seguridad: verificar roles de liderazgo
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    redirect("/login")
  }
  const rolesLiderazgo = ["admin", "pastor", "director-general", "director-etapa", "lider"]
  const tieneAcceso = userData.roles.some(r => rolesLiderazgo.includes(r))
  if (!tieneAcceso) {
    redirect("/dashboard")
  }

  // Obtener grupos usando la función RPC
  const { data: { user } } = await supabase.auth.getUser()
  const { data: grupos, error } = await supabase.rpc("obtener_grupos_para_usuario", { p_auth_id: user?.id })

  // Consultas de estadísticas en paralelo
  const [
    { count: totalGrupos },
    { count: gruposActivos },
    { count: nuevosGruposMes },
    { count: totalMiembros }
  ] = await Promise.all([
    // Total de grupos
    supabase.from("grupos").select("*", { count: "exact", head: true }),
    // Grupos activos
    supabase.from("grupos").select("*", { count: "exact", head: true }).eq("activo", true),
    // Nuevos grupos este mes
    (() => {
      const ahora = new Date()
      const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      const ultimoDiaMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0)
      return supabase
        .from("grupos")
        .select("*", { count: "exact", head: true })
        .gte("fecha_creacion", primerDiaMes.toISOString())
        .lte("fecha_creacion", ultimoDiaMes.toISOString())
    })(),
    // Total de miembros en grupos
    supabase.from("grupo_miembros").select("*", { count: "exact", head: true })
  ])

  // Estadísticas con datos reales
  const estadisticasGrupos = [
    {
      titulo: "Total de Grupos",
      valor: (totalGrupos || 0).toString(),
      crecimiento: "+12.5%",
      esPositivo: true,
      icono: Users2,
      color: "from-blue-500 to-cyan-500",
    },
    {
      titulo: "Grupos Activos",
      valor: (gruposActivos || 0).toString(),
      crecimiento: "+8.2%",
      esPositivo: true,
      icono: Users2,
      color: "from-green-500 to-emerald-500",
    },
    {
      titulo: "Nuevos Grupos (Este mes)",
      valor: (nuevosGruposMes || 0).toString(),
      crecimiento: "+15.3%",
      esPositivo: true,
      icono: Plus,
      color: "from-orange-500 to-red-500",
    },
    {
      titulo: "Total de Miembros en Grupos",
      valor: (totalMiembros || 0).toString(),
      crecimiento: "+5.7%",
      esPositivo: true,
      icono: Users2,
      color: "from-purple-500 to-pink-500",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header GlassCard */}
      <GlassCard>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <Users2 className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-800">Gestión de Grupos</h2>
            <p className="text-gray-600 text-sm lg:text-base">Administra y organiza los grupos de tu comunidad</p>
          </div>
        </div>
      </GlassCard>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {estadisticasGrupos.map((estadistica, indice) => {
          const Icono = estadistica.icono
          return (
            <GlassCard key={indice}>
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br ${estadistica.color} rounded-xl flex items-center justify-center`}>
                  <Icono className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
                </div>
                <div className={`flex items-center gap-1 text-xs lg:text-sm font-medium ${estadistica.esPositivo ? "text-green-600" : "text-red-500"}`}>
                  <span>{estadistica.crecimiento}</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl lg:text-2xl font-bold text-gray-800 mb-1">{estadistica.valor}</h3>
                <p className="text-gray-600 text-xs lg:text-sm">{estadistica.titulo}</p>
              </div>
            </GlassCard>
          )
        })}
      </div>

      {/* Lista de Grupos */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-1">Lista de Grupos</h3>
          <Link href="/dashboard/grupos/create">
            <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
              <Plus className="w-4 h-4" />
              Crear Grupo
            </button>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre del Grupo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Segmento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Temporada</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {grupos && grupos.length > 0 ? (
                grupos.map((grupo: any) => (
                  <tr key={grupo.id} className="bg-white/40 hover:bg-orange-50/40 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">{grupo.nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{grupo.segmentos?.nombre || "Sin segmento"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{grupo.temporadas?.nombre || "Sin temporada"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={grupo.activo ? "default" : "secondary"}>
                        {grupo.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap flex gap-2">
                      <Link href={`/dashboard/grupos/${grupo.id}`}>
                        <button className="p-2 hover:bg-blue-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-blue-600" title="Ver">
                          <Eye className="w-5 h-5" />
                        </button>
                      </Link>
                      <button className="p-2 hover:bg-orange-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-orange-600" title="Editar">
                        <Edit className="w-5 h-5" />
                      </button>
                      <button className="p-2 hover:bg-red-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-red-600" title="Eliminar">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No hay grupos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
