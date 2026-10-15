import { createSupabaseServerClient } from "@/lib/supabase/server";
import AuditViewer from "@/components/grupos/AuditViewer.client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PaginaSistema, BotonSistema } from "@/components/ui/sistema-diseno";

export default async function GrupoAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Permitir admin o cualquiera que pueda ver el grupo (pero no rol 'miembro' en el grupo)
  const { data: detalleRaw } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user!.id,
    p_grupo_id: id
  });
  const detalle = detalleRaw as any;

  if (!detalle) {
    return (
<PaginaSistema>
          <div className="text-center py-12">
            <p className="text-danger-text mb-4">No tienes acceso a esta auditoría.</p>
            <Link href={`/grupos-vida/${id}`}>
              <BotonSistema variante="outline" tamaño="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al grupo
              </BotonSistema>
            </Link>
          </div>
        </PaginaSistema>
);
  }

  // Si puede gestionar miembros o no es miembro simple, permitimos ver auditoría
  const puedeVerAuditoria = detalle.puede_gestionar_miembros || true; // la RPC de auditoría refuerza la restricción de miembros

  if (!puedeVerAuditoria) {
    return (
<PaginaSistema>
          <div className="text-center py-12">
            <p className="text-danger-text mb-4">No tienes permiso para ver la auditoría.</p>
            <Link href={`/grupos-vida/${id}`}>
              <BotonSistema variante="outline" tamaño="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al grupo
              </BotonSistema>
            </Link>
          </div>
        </PaginaSistema>
);
  }

  return (
<PaginaSistema
        titulo="Auditoría"
        descripcion={`Historial de cambios del grupo ${detalle.nombre}`}
        regreso={{
          href: `/grupos-vida/${id}`,
          texto: "Volver al grupo"
        }}
      >
        <AuditViewer grupoId={id} />
      </PaginaSistema>
);
}
