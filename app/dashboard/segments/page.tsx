

import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { Layers, Edit, Trash2, Plus } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  )
}

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
    <div className="space-y-6">
      {/* Header GlassCard */}
      <GlassCard>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-800">Gestión de Segmentos</h2>
            <p className="text-gray-600 text-sm lg:text-base">Administra las categorías de tus grupos</p>
          </div>
        </div>
      </GlassCard>

      {/* Lista de Segmentos */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-1">Lista de Segmentos</h3>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
            <Plus className="w-4 h-4" />
            Crear Segmento
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre del Segmento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {segmentos && segmentos.length > 0 ? (
                segmentos.map(segmento => (
                  <tr key={segmento.id} className="bg-white/40 hover:bg-orange-50/40 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">{segmento.nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap flex gap-2">
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
                  <td colSpan={2} className="px-6 py-8 text-center text-gray-500">No hay segmentos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
