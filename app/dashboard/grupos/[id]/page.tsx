import { ArrowLeft, Edit, Users, MapPin, Clock, Calendar } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"

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

export default async function GrupoDetailPage({ params }: Props) {
  const { id } = await params

  // Obtener detalle del grupo usando RPC
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: grupo, error } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user?.id,
    p_grupo_id: id
  })

  if (error || !grupo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Grupo no encontrado</h2>
          <p className="text-gray-600 mb-4">
            El grupo solicitado no existe o no tienes acceso para verlo.
          </p>
          <Link
            href="/dashboard/grupos"
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Volver a Grupos
          </Link>
        </div>
      </div>
    )
  }

  // Función para obtener iniciales
  const obtenerIniciales = (nombre: string, apellido: string) => {
    return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
  }

  // Función para obtener color del rol
  const obtenerColorRol = (rol: string) => {
    switch (rol.toLowerCase()) {
      case 'líder':
        return 'bg-orange-100 text-orange-700'
      case 'colíder':
        return 'bg-blue-100 text-blue-700'
      case 'miembro':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* Botón de regreso */}
      <div>
        <Link
          href="/dashboard/grupos"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Grupos
        </Link>
      </div>

      {/* Header con información del grupo */}
      <GlassCard>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 lg:w-16 lg:h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">{grupo.nombre}</h1>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline">{grupo.segmentos?.nombre || "Sin segmento"}</Badge>
                  <Badge variant="outline">{grupo.temporadas?.nombre || "Sin temporada"}</Badge>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href={`/dashboard/grupos/${id}/edit`}>
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
                <Edit className="w-4 h-4" />
                Editar Grupo
              </button>
            </Link>
          </div>
        </div>
      </GlassCard>

      {/* Información de la Reunión */}
      <GlassCard>
        <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-4">Información de la Reunión</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Día</p>
              <p className="font-medium text-gray-800">{grupo.dia_reunion || "No especificado"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Hora</p>
              <p className="font-medium text-gray-800">{grupo.hora_reunion || "No especificada"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Dirección</p>
              <p className="font-medium text-gray-800">{grupo.direccion || "No especificada"}</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Líderes y Miembros */}
      <GlassCard>
        <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-6">Líderes y Miembros</h3>
        <div className="space-y-4">
          {grupo.miembros && grupo.miembros.length > 0 ? (
            grupo.miembros.map((miembro: any) => (
              <div key={miembro.id} className="flex items-center gap-4 p-4 bg-white/40 rounded-xl">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                  {obtenerIniciales(miembro.nombre, miembro.apellido)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-800 truncate">
                    {miembro.nombre} {miembro.apellido}
                  </h4>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-gray-500">
                    <span className="truncate">{miembro.email || "Sin email"}</span>
                    <span className="truncate">{miembro.telefono || "Sin teléfono"}</span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(miembro.rol)}`}>
                    {miembro.rol}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No hay miembros en este grupo</p>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
