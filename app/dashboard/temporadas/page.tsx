import { Calendar, Edit } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { Badge } from "@/components/ui/badge"

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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

  // Obtener temporadas
  const { data: temporadas, error } = await supabase
    .from("temporadas")
    .select("*")
    .order("fecha_inicio", { ascending: false })

  return (
    <div className="space-y-6">
      {/* Header GlassCard */}
      <GlassCard>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-800">Gestión de Temporadas</h2>
            <p className="text-gray-600 text-sm lg:text-base">Administra los períodos temporales de tu organización</p>
          </div>
        </div>
      </GlassCard>

      {/* Lista de Temporadas */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-1">Lista de Temporadas</h3>
          <Link href="/dashboard/temporadas/create">
            <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
              <Calendar className="w-4 h-4" />
              Crear Temporada
            </button>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Inicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Fin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {temporadas && temporadas.length > 0 ? (
                temporadas.map(temporada => (
                  <tr key={temporada.id} className="bg-white/40 hover:bg-orange-50/40 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">{temporada.nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {new Date(temporada.fecha_inicio).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {new Date(temporada.fecha_fin).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={temporada.activa ? "default" : "secondary"}>
                        {temporada.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap flex gap-2">
                      <Link href={`/dashboard/temporadas/${temporada.id}/edit`}>
                        <button className="p-2 hover:bg-orange-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-orange-600" title="Editar">
                          <Edit className="w-5 h-5" />
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No hay temporadas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
