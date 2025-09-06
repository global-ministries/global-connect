import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupCreateForm from "@/components/forms/GroupCreateForm";
import { ReactNode } from "react";

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

export default async function CreateGroupPage() {
  // Cargar temporadas y segmentos en paralelo
  const supabase = await createSupabaseServerClient();

  const [temporadasResult, segmentosResult] = await Promise.all([
    supabase.from("temporadas").select("id, nombre"),
    supabase.from("segmentos").select("id, nombre")
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
