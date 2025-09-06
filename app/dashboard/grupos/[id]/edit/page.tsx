import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupEditForm from "@/components/forms/GroupEditForm";
import { ReactNode } from "react";

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditGroupPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  // Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Obtener detalle del grupo usando RPC
  const { data: grupo, error } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user.id,
    p_grupo_id: id
  });

  if (error || !grupo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Grupo no encontrado</h2>
          <p className="text-gray-600 mb-4">
            El grupo solicitado no existe o no tienes acceso para editarlo.
          </p>
          <Link
            href="/dashboard/grupos"
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Volver a Grupos
          </Link>
        </div>
      </div>
    );
  }

  // Regla de Mapeo: Mapear latitud/longitud a lat/lng
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud;
    grupo.direccion.lng = grupo.direccion.longitud;
  }

  // Cargar listas de catálogo en paralelo
  const [
    { data: temporadas },
    { data: segmentos },
    { data: paises },
    { data: estados },
    { data: municipios },
    { data: parroquias }
  ] = await Promise.all([
    supabase.from("temporadas").select("id, nombre"),
    supabase.from("segmentos").select("id, nombre"),
    supabase.from("paises").select("id, nombre"),
    supabase.from("estados").select("id, nombre"),
    supabase.from("municipios").select("id, nombre"),
    supabase.from("parroquias").select("id, nombre")
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/grupos/${id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Grupo
          </Link>
          <h1 className="text-3xl font-bold text-gray-800">Editar Grupo</h1>
          <p className="text-gray-600 mt-2">Modifica la información del grupo "{grupo.nombre}"</p>
        </div>
      </div>

      {/* Formulario */}
      <GlassCard>
        <GroupEditForm
          grupo={grupo}
          temporadas={temporadas || []}
          segmentos={segmentos || []}
          paises={paises || []}
          estados={estados || []}
          municipios={municipios || []}
          parroquias={parroquias || []}
        />
      </GlassCard>
    </div>
  );
}
