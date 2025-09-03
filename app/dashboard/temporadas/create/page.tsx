import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import SeasonForm from "@/components/forms/SeasonForm"

import { ReactNode } from "react";

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  )
}

export default function CreateSeasonPage() {
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
          Crear Nueva Temporada
        </h1>
        <p className="text-gray-600 mt-2">
          Ingresa los datos para crear una nueva temporada.
        </p>
      </GlassCard>

      {/* Formulario */}
      <GlassCard>
        <SeasonForm />
      </GlassCard>
    </div>
  )
}
