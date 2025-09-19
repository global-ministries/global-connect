import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { Layers, Edit, Trash2, Plus } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema, TextoSistema } from "@/components/ui/sistema-diseno"

export default async function Page() {
  // Instancia única de supabase para toda la página
  const supabase = await createSupabaseServerClient();
  const userData = await getUserWithRoles(supabase);
  // Depuración temporal (puedes quitar estos logs si ya no los necesitas)
  console.log("[SEGMENTOS] user:", userData?.user);
  console.log("[SEGMENTOS] roles:", userData?.roles);
  if (!userData) {
    redirect("/login");
  }
  const rolesLiderazgo = ["admin", "pastor", "director-general", "director-etapa", "lider"];
  const tieneAcceso = userData.roles.some(r => rolesLiderazgo.includes(r));
  console.log("[SEGMENTOS] tieneAcceso:", tieneAcceso);
  if (!tieneAcceso) {
    redirect("/dashboard");
  }

  // Obtener segmentos usando la misma instancia
  const { data: segmentos, error } = await supabase
    .from("segmentos")
    .select("*")
    .order("nombre", { ascending: true });

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Segmentos"
        subtitulo="Administra las categorías de tus grupos"
      >
        {/* Lista de Segmentos */}
        <div className="space-y-4">
          {/* Encabezado con título */}
          <div className="flex items-center justify-between">
            <TituloSistema nivel={2}>Lista de Segmentos</TituloSistema>
            <BotonSistema variante="primario" tamaño="md">
              <Plus className="w-4 h-4 mr-2" />
              Crear Segmento
            </BotonSistema>
          </div>

          {/* Lista responsive */}
          <div className="space-y-2 sm:space-y-3">
            {segmentos && segmentos.length > 0 ? (
              segmentos.map(segmento => (
                <div key={segmento.id}>
                  {/* Versión Móvil - Lista Simple */}
                  <div className="sm:hidden flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {segmento.nombre}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <BotonSistema variante="ghost" tamaño="sm">
                        <Edit className="w-4 h-4" />
                      </BotonSistema>
                      <BotonSistema variante="ghost" tamaño="sm">
                        <Trash2 className="w-4 h-4" />
                      </BotonSistema>
                    </div>
                  </div>

                  {/* Versión Desktop - Tarjeta Completa */}
                  <TarjetaSistema className="hidden sm:block">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Layers className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <TituloSistema nivel={4} className="text-gray-900">
                            {segmento.nombre}
                          </TituloSistema>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <BotonSistema variante="outline" tamaño="sm">
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </BotonSistema>
                        <BotonSistema variante="outline" tamaño="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar
                        </BotonSistema>
                      </div>
                    </div>
                  </TarjetaSistema>
                </div>
              ))
            ) : (
              <TarjetaSistema className="p-8 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <Layers className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <TituloSistema nivel={3} variante="sutil" className="mb-2">
                      No hay segmentos registrados
                    </TituloSistema>
                    <TextoSistema variante="sutil">
                      Comienza creando el primer segmento para organizar tus grupos
                    </TextoSistema>
                  </div>
                  <BotonSistema variante="primario" tamaño="md">
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Primer Segmento
                  </BotonSistema>
                </div>
              </TarjetaSistema>
            )}
          </div>
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
