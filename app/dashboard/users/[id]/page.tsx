"use client"

import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Calendar, 
  Edit, 
  Users, 
  MapPin, 
  User, 
  Briefcase, 
  GraduationCap,
  Heart,
  Hash,
  Shield,
  Clock
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useUsuarioDetalle } from "@/hooks/use-usuario-detalle"
import { obtenerNombreRelacion, obtenerColorRelacion } from "@/lib/config/relaciones-familiares"
import { useState } from "react"
import { AgregarFamiliarModal } from '@/components/modals/AgregarFamiliarModal'

export default function PaginaDetalleUsuario() {
  const params = useParams()
  const id = params.id as string
  const { usuario, loading, error, recargar } = useUsuarioDetalle(id)
  
  // Estado para el modal de agregar familiar
  const [mostrarModalAgregar, setMostrarModalAgregar] = useState(false)

  // Función para obtener las iniciales del nombre y apellido
  const obtenerIniciales = (nombre: string, apellido: string) => {
    return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
  }

  // Función para obtener el color del rol
  const obtenerColorRol = (rolInterno: string) => {
    switch (rolInterno) {
      case 'admin':
        return 'bg-red-100 text-red-700'
      case 'pastor':
        return 'bg-orange-100 text-orange-700'
      case 'director-general':
        return 'bg-purple-100 text-purple-700'
      case 'director-etapa':
        return 'bg-blue-100 text-blue-700'
      case 'lider':
        return 'bg-green-100 text-green-700'
      case 'miembro':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // Función para obtener el color del estado civil
  const obtenerColorEstadoCivil = (estadoCivil: string) => {
    switch (estadoCivil) {
      case 'Soltero':
        return 'bg-blue-100 text-blue-700'
      case 'Casado':
        return 'bg-green-100 text-green-700'
      case 'Divorciado':
        return 'bg-orange-100 text-orange-700'
      case 'Viudo':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // Función para obtener el color del género
  const obtenerColorGenero = (genero: string) => {
    switch (genero) {
      case 'Masculino':
        return 'bg-blue-100 text-blue-700'
      case 'Femenino':
        return 'bg-pink-100 text-pink-700'
      case 'Otro':
        return 'bg-purple-100 text-purple-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // Función para formatear la fecha
  const formatearFecha = (fecha: string) => {
    const fechaObj = new Date(fecha)
    return fechaObj.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Función para formatear la fecha de nacimiento
  const formatearFechaNacimiento = (fecha: string | null) => {
    if (!fecha) return 'No especificada'
    const fechaObj = new Date(fecha)
    return fechaObj.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Función para obtener el rol del usuario
  const obtenerRolUsuario = () => {
    if (!usuario?.usuario_roles || usuario.usuario_roles.length === 0) {
      return { nombre: 'Sin rol', interno: 'sin-rol' }
    }

    const primerRol = usuario.usuario_roles[0]
    if (primerRol.roles_sistema) {
      return {
        nombre: primerRol.roles_sistema.nombre_visible,
        interno: primerRol.roles_sistema.nombre_interno
      }
    }

    return { nombre: 'Sin rol', interno: 'sin-rol' }
  }

  // Función para formatear el teléfono
  const formatearTelefono = (telefono: string | null) => {
    if (!telefono) return 'Sin teléfono'
    return telefono
  }

  // Función para formatear el email
  const formatearEmail = (email: string | null) => {
    if (!email) return 'Sin email'
    return email
  }

  // Función para formatear la cédula
  const formatearCedula = (cedula: string | null) => {
    if (!cedula) return 'Sin cédula'
    return cedula
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando datos del usuario...</p>
        </div>
      </div>
    )
  }

  if (error || !usuario) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error al cargar datos</h2>
          <p className="text-gray-600 mb-4">{error || 'Usuario no encontrado'}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={recargar}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              Reintentar
            </button>
            <Link
              href="/dashboard/users"
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Volver a Usuarios
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const rolUsuario = obtenerRolUsuario()

  return (
    <div className="space-y-6">
      {/* Botón de Regreso */}
      <div>
        <Link 
          href="/dashboard/users"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-white/70 rounded-xl transition-all duration-200 text-gray-700 hover:bg-orange-50/50"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Usuarios
        </Link>
      </div>

      {/* Información Principal del Usuario */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 lg:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-xl">
            {obtenerIniciales(usuario.nombre, usuario.apellido)}
          </div>

          {/* Información Principal */}
          <div className="flex-1">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  {usuario.nombre} {usuario.apellido}
                </h1>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(rolUsuario.interno)}`}>
                    {rolUsuario.nombre}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorEstadoCivil(usuario.estado_civil)}`}>
                    {usuario.estado_civil}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorGenero(usuario.genero)}`}>
                    {usuario.genero}
                  </span>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    Activo
                  </span>
                </div>
              </div>
              
              <Link href={`/dashboard/users/${usuario.id}/edit`}>
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
                <Edit className="w-4 h-4" />
                Editar Usuario
              </button>
              </Link>
            </div>
          </div>
        </div>
            </div>

            {/* Información Básica */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Información Básica
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Hash className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">ID de Usuario</p>
              <p className="font-medium text-gray-800 font-mono text-sm break-all">
                    {usuario.id}
                  </p>
                </div>
              </div>

          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Cédula</p>
                  <p className="font-medium text-gray-800">
                {formatearCedula(usuario.cedula)}
                  </p>
                </div>
              </div>

          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Clock className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Fecha de Registro</p>
                  <p className="font-medium text-gray-800">
                {formatearFecha(usuario.fecha_registro)}
                  </p>
            </div>
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Mail className="w-5 h-5 text-orange-500" />
          Información de Contacto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Mail className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Email</p>
              <p className="font-medium text-gray-800 break-all">
                {formatearEmail(usuario.email)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Phone className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Teléfono</p>
              <p className="font-medium text-gray-800">
                {formatearTelefono(usuario.telefono)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Información Personal */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Información Personal
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Fecha de Nacimiento</p>
              <p className="font-medium text-gray-800">
                {formatearFechaNacimiento(usuario.fecha_nacimiento)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Heart className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Estado Civil</p>
              <p className="font-medium text-gray-800">
                {usuario.estado_civil}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Género</p>
              <p className="font-medium text-gray-800">
                {usuario.genero}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Información Profesional */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-orange-500" />
          Información Profesional
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <Briefcase className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Ocupación</p>
              <p className="font-medium text-gray-800">
                {usuario.ocupacion?.nombre || 'No especificada'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
            <GraduationCap className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 mb-1">Profesión</p>
              <p className="font-medium text-gray-800">
                {usuario.profesion?.nombre || 'No especificada'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Relaciones Familiares */}
      {usuario.relaciones_familiares && usuario.relaciones_familiares.length > 0 && (
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Heart className="w-5 h-5 text-orange-500" />
              Relaciones Familiares
        </h3>
            <button 
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl transition-all duration-200 text-white shadow-lg text-sm"
              onClick={() => setMostrarModalAgregar(true)}
            >
              <Users className="w-4 h-4" />
              Agregar Familiar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {usuario.relaciones_familiares.map((relacion) => (
              <div key={relacion.id} className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px] group">
                <div className={`w-10 h-10 bg-gradient-to-br ${obtenerColorRelacion(relacion.tipo_relacion)} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                  {relacion.familiar.nombre.charAt(0)}{relacion.familiar.apellido.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm text-gray-500 font-medium">
                      {obtenerNombreRelacion(relacion.tipo_relacion, relacion.familiar)}
                    </p>
                    {relacion.es_principal && (
                      <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                        Principal
                      </span>
                    )}
                  </div>
              <p className="font-medium text-gray-800">
                    {relacion.familiar.nombre} {relacion.familiar.apellido}
                  </p>
                  {relacion.familiar.email && (
                    <p className="text-xs text-gray-500 truncate">
                      {relacion.familiar.email}
                    </p>
                  )}
                  {relacion.familiar.telefono && (
                    <p className="text-xs text-gray-500">
                      {formatearTelefono(relacion.familiar.telefono)}
                    </p>
                  )}
                </div>
            </div>
            ))}
          </div>
        </div>
      )}

      {/* Estado sin relaciones familiares */}
      {(!usuario.relaciones_familiares || usuario.relaciones_familiares.length === 0) && (
        <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Heart className="w-5 h-5 text-orange-500" />
              Relaciones Familiares
            </h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl transition-all duration-200 text-white shadow-lg text-sm">
              <Users className="w-4 h-4" />
              Agregar Familiar
            </button>
          </div>
          <div className="text-center py-8">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium mb-2">No hay relaciones familiares registradas</p>
            <p className="text-gray-400 text-sm">Este usuario no tiene relaciones familiares configuradas en el sistema.</p>
            <p className="text-gray-400 text-sm mt-2">Haz clic en "Agregar Familiar" para comenzar a configurar las relaciones familiares.</p>
        </div>
      </div>
      )}

      {/* Información de Ubicación */}
      {usuario.direccion && (
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-500" />
            Información de Ubicación
        </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
              <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 mb-1">Calle</p>
              <p className="font-medium text-gray-800">
                  {usuario.direccion.calle || 'No especificada'}
              </p>
            </div>
          </div>

            <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
              <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 mb-1">Barrio</p>
                <p className="font-medium text-gray-800">
                  {usuario.direccion.barrio || 'No especificado'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
              <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 mb-1">Código Postal</p>
                <p className="font-medium text-gray-800">
                  {usuario.direccion.codigo_postal || 'No especificado'}
                </p>
              </div>
            </div>

            {usuario.direccion.referencia && (
              <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px] md:col-span-2">
                <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500 mb-1">Referencia</p>
                  <p className="font-medium text-gray-800">
                    {usuario.direccion.referencia}
                  </p>
                </div>
              </div>
            )}

            {usuario.direccion.parroquia_id && (
              <div className="flex items-center gap-3 p-4 bg-white/50 rounded-xl hover:bg-white/70 transition-colors min-h-[80px]">
                <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500 mb-1">ID de Parroquia</p>
                  <p className="font-medium text-gray-800 font-mono text-sm">
                    {usuario.direccion.parroquia_id}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Acciones Rápidas */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6">Acciones Rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {usuario.email && (
            <button className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
              <Mail className="w-6 h-6 mx-auto mb-2" />
              <span className="block font-medium">Enviar Email</span>
            </button>
          )}
          
          {usuario.telefono && (
            <button className="p-4 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
              <Phone className="w-6 h-6 mx-auto mb-2" />
              <span className="block font-medium">Llamar</span>
            </button>
          )}

          <Link href={`/dashboard/users/${usuario.id}/edit`}>
          <button className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
            <Edit className="w-6 h-6 mx-auto mb-2" />
            <span className="block font-medium">Editar Perfil</span>
          </button>
          </Link>

          {usuario.relaciones_familiares && usuario.relaciones_familiares.length > 0 && (
            <button className="p-4 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
              <Users className="w-6 h-6 mx-auto mb-2" />
              <span className="block font-medium">Ver Familia Completa</span>
            </button>
          )}

          {usuario.familia && (
            <button className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
              <MapPin className="w-6 h-6 mx-auto mb-2" />
              <span className="block font-medium">Ver Dirección Familiar</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal para Agregar Familiar */}
      <AgregarFamiliarModal
        isOpen={mostrarModalAgregar}
        onClose={() => setMostrarModalAgregar(false)}
        usuarioActualId={id}
        onRelacionCreada={recargar}
      />
    </div>
  )
}