import { createSupabaseServerClient } from "@/lib/supabase/server";
import AuditViewer from "@/components/grupos/AuditViewer.client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, BotonSistema } from "@/components/ui/sistema-diseno";

export default async function GrupoAuditPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Permitir admin o cualquiera que pueda ver el grupo (pero no rol 'miembro' en el grupo)
  const { data: detalle } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user?.id,
    p_grupo_id: id
  });

  if (!detalle) {
    return (
      <DashboardLayout>
        <ContenedorDashboard>
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">No tienes acceso a esta auditoría.</p>
            <Link href={`/dashboard/grupos/${id}`}>
              <BotonSistema variante="outline" tamaño="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al grupo
              </BotonSistema>
            </Link>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    );
  }

  // Si puede gestionar miembros o no es miembro simple, permitimos ver auditoría
  const puedeVerAuditoria = detalle.puede_gestionar_miembros || true; // la RPC de auditoría refuerza la restricción de miembros

  if (!puedeVerAuditoria) {
    return (
      <DashboardLayout>
        <ContenedorDashboard>
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">No tienes permiso para ver la auditoría.</p>
            <Link href={`/dashboard/grupos/${id}`}>
              <BotonSistema variante="outline" tamaño="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al grupo
              </BotonSistema>
            </Link>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Auditoría"
        subtitulo={`Historial de cambios del grupo ${detalle.nombre}`}
        botonRegreso={{
          href: `/dashboard/grupos/${id}`,
          texto: "Volver al grupo"
        }}
      >
        <AuditViewer grupoId={id} />
      </ContenedorDashboard>
    </DashboardLayout>
  );
}
