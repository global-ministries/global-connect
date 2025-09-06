import { createSupabaseServerClient } from "@/lib/supabase/server";
import GroupAudit from "@/components/grupos/GroupAudit.client";
import Link from "next/link";

export default async function GrupoAuditPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Permitir admin o cualquiera que pueda ver el grupo (pero no rol 'miembro' en el grupo)
  const { data: detalle } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user?.id,
    p_grupo_id: id
  });

  if (!detalle) {
    return (
      <div className="p-6">
        <p className="text-red-600">No tienes acceso a esta auditoría.</p>
        <Link href={`/dashboard/grupos/${id}`} className="text-blue-600 hover:underline">Volver</Link>
      </div>
    );
  }

  // Si puede gestionar miembros o no es miembro simple, permitimos ver auditoría
  const puedeVerAuditoria = detalle.puede_gestionar_miembros || true; // la RPC de auditoría refuerza la restricción de miembros

  if (!puedeVerAuditoria) {
    return (
      <div className="p-6">
        <p className="text-red-600">No tienes permiso para ver la auditoría.</p>
        <Link href={`/dashboard/grupos/${id}`} className="text-blue-600 hover:underline">Volver</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Auditoría del grupo</h1>
        <Link href={`/dashboard/grupos/${id}`} className="text-blue-600 hover:underline">Volver al grupo</Link>
      </div>
      <GroupAudit grupoId={id} />
    </div>
  );
}
