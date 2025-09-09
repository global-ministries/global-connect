import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupCreateForm from "@/components/forms/GroupCreateForm";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { ReactNode } from "react";

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

export default async function CreateGroupPage() {
  const supabase = await createSupabaseServerClient();
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    return null
  }
  const roles = userData.roles || []
  const esAdminOPastorODG = roles.some(r => ["admin","pastor","director-general"].includes(r))
  const esDirectorEtapa = roles.includes("director-etapa")

  // Si no es admin/pastor/director-general ni director-etapa, redirigir a listado
  if (!esAdminOPastorODG && !esDirectorEtapa) {
    // Usuarios Líder / Colíder / Miembro no pueden crear
    return (
      <div className="p-6 text-sm text-red-600">No tienes permisos para crear grupos.</div>
    )
  }

  // Cargar temporadas activas y segmentos permitidos
  const [temporadasResult, segmentosResult] = await Promise.all([
    supabase.from("temporadas").select("id, nombre").order('nombre'),
    (async () => {
      if (esAdminOPastorODG) {
        return await supabase.from("segmentos").select("id, nombre").order('nombre')
      }
      // director-etapa: sólo segmentos donde es líder de etapa
      const { data: authData } = await supabase.auth.getUser()
      const { data: segs, error } = await supabase.rpc('obtener_segmentos_para_director', { p_auth_id: authData?.user?.id })
      if (error) {
        console.error('[Create] obtener_segmentos_para_director error:', error)
        return { data: [], error }
      }
      return { data: (segs as any[])?.map(s => ({ id: s.id, nombre: s.nombre })) || [], error: null }
    })()
  ]);

  // Manejar errores y logging para depuración
  if (temporadasResult.error) {
    console.error("Error cargando temporadas:", temporadasResult.error);
  }
  if (segmentosResult.error) {
    console.error("Error cargando segmentos:", segmentosResult.error);
  }

  const temporadas = temporadasResult.data || [];
  const segmentos = segmentosResult.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/grupos"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Grupos
          </Link>
          <h1 className="text-3xl font-bold text-gray-800">Crear Nuevo Grupo</h1>
          <p className="text-gray-600 mt-2">Complete la información básica del grupo</p>
        </div>
      </div>

  {/* Formulario */}
      <GlassCard className="max-w-2xl">
        <GroupCreateForm
          temporadas={temporadas}
          segmentos={segmentos}
        />
      </GlassCard>
    </div>
  );
}
