import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupCreateForm from "@/components/forms/GroupCreateForm";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno";

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
  // Usuarios Líder / Aprendiz / Miembro no pueden crear
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Crear Grupo"
          descripcion="No tienes permisos para crear grupos"
          accionPrincipal={
            <Link href="/dashboard/grupos">
              <BotonSistema variante="outline" tamaño="sm">
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Volver</span>
              </BotonSistema>
            </Link>
          }
        >
          <TarjetaSistema>
            <div className="text-sm text-red-600">No tienes permisos para crear grupos.</div>
          </TarjetaSistema>
        </ContenedorDashboard>
      </DashboardLayout>
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
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Crear Grupo"
        descripcion="Ingresa los datos para crear un nuevo grupo"
        accionPrincipal={
          <Link href="/dashboard/grupos">
            <BotonSistema variante="outline" tamaño="sm">
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Volver</span>
            </BotonSistema>
          </Link>
        }
      >
        <TarjetaSistema>
          <GroupCreateForm temporadas={temporadas} segmentos={segmentos} />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  );
}
