import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import SeasonForm from "@/components/forms/SeasonForm"

import { ReactNode } from "react"

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  )
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditSeasonPage({ params }: Props) {
  const { id } = await params

  // Obtener temporada
  const supabase = createSupabaseServerClient()
  const { data: temporada, error } = await supabase
    .from("temporadas")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !temporada) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Temporada no encontrada</h2>
          <p className="text-gray-600 mb-4">
            No se pudo cargar la información de la temporada con ID: {id}
          </p>
          <Link
            href="/dashboard/temporadas"
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Volver a Temporadas
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Botón de regreso */}
      <div>
        <Link
          href="/dashboard/temporadas"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Temporadas
        </Link>
      </div>

      {/* Título */}
      <GlassCard>
        <h1 className="text-3xl font-bold text-gray-800">
          Editar Temporada
        </h1>
        <p className="text-gray-600 mt-2">
          Modifica la información de {temporada.nombre}
        </p>
      </GlassCard>

      {/* Formulario */}
      <GlassCard>
        <SeasonForm initialData={temporada} />
      </GlassCard>
    </div>
  )
}
