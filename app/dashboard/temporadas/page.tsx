import { Calendar, Edit, Plus } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno"

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

  if (error) {
    console.error('Error al obtener temporadas:', error)
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Temporadas"
        descripcion="Administra los períodos temporales de tu organización"
        accionPrincipal={
          <Link href="/dashboard/temporadas/create">
            <BotonSistema variante="primario" tamaño="sm">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Crear Temporada</span>
            </BotonSistema>
          </Link>
        }
      >
        {/* Lista de Temporadas - Vista Desktop */}
        <div className="hidden md:block">
          <TarjetaSistema>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Inicio</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Fin</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {temporadas && temporadas.length > 0 ? (
                    temporadas.map(temporada => (
                      <tr key={temporada.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{temporada.nombre}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(temporada.fecha_inicio).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(temporada.fecha_fin).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <BadgeSistema 
                            variante={temporada.activa ? "success" : "default"}
                            tamaño="sm"
                          >
                            {temporada.activa ? "Activa" : "Inactiva"}
                          </BadgeSistema>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link href={`/dashboard/temporadas/${temporada.id}/edit`}>
                            <BotonSistema variante="ghost" tamaño="sm">
                              <Edit className="w-4 h-4" />
                            </BotonSistema>
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Calendar className="w-12 h-12 text-gray-300" />
                          <div>
                            <p className="text-gray-500 font-medium">No hay temporadas registradas</p>
                            <p className="text-gray-400 text-sm">Crea tu primera temporada para comenzar</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TarjetaSistema>
        </div>

        {/* Lista de Temporadas - Vista Mobile */}
        <div className="md:hidden space-y-4">
          {temporadas && temporadas.length > 0 ? (
            temporadas.map(temporada => (
              <TarjetaSistema key={temporada.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 truncate">{temporada.nombre}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <BadgeSistema 
                            variante={temporada.activa ? "success" : "default"}
                            tamaño="sm"
                          >
                            {temporada.activa ? "Activa" : "Inactiva"}
                          </BadgeSistema>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Inicio:</span>
                        <span>{new Date(temporada.fecha_inicio).toLocaleDateString('es-ES')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Fin:</span>
                        <span>{new Date(temporada.fecha_fin).toLocaleDateString('es-ES')}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="ml-3">
                    <Link href={`/dashboard/temporadas/${temporada.id}/edit`}>
                      <BotonSistema variante="ghost" tamaño="sm">
                        <Edit className="w-4 h-4" />
                      </BotonSistema>
                    </Link>
                  </div>
                </div>
              </TarjetaSistema>
            ))
          ) : (
            <TarjetaSistema className="p-8">
              <div className="text-center">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay temporadas registradas</h3>
                <p className="text-gray-500 mb-6">Crea tu primera temporada para comenzar a organizar los períodos de tu organización</p>
                <Link href="/dashboard/temporadas/create">
                  <BotonSistema variante="primario">
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Primera Temporada
                  </BotonSistema>
                </Link>
              </div>
            </TarjetaSistema>
          )}
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
