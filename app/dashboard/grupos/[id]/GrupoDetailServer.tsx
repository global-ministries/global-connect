import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GrupoDetailClient from "./GrupoDetailClient";

export default async function GrupoDetailServer({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: grupo, error } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user?.id,
    p_grupo_id: id
  });

  if (error || !grupo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Grupo no encontrado</h2>
          <p className="text-gray-600 mb-4">
            El grupo solicitado no existe o no tienes acceso para verlo.
          </p>
          <a
            href="/dashboard/grupos"
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Volver a Grupos
          </a>
        </div>
      </div>
    );
  }

  // Mapear latitud/longitud a lat/lng para el frontend
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud;
    grupo.direccion.lng = grupo.direccion.longitud;
  }

  return <GrupoDetailClient grupo={grupo} id={id} />;
}
