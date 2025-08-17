"use client"

import {
  Eye,
  Edit,
  Trash2,
  Plus,
  Users,
  Mail,
  Phone,
  UserCheckIcon as UserEdit,
} from "lucide-react"
import Link from "next/link"
import { useState, useMemo } from "react"
import { FiltrosUsuarios, type FiltrosUsuarios as FiltrosUsuariosType } from "@/components/ui/filtros-usuarios"
import { useUsuarios, type UsuarioConRol } from "@/hooks/use-usuarios"

export default function PaginaUsuarios() {
  const { usuariosConRoles, rolesDisponibles, loading, error, recargar } = useUsuarios()
  const [filtros, setFiltros] = useState<FiltrosUsuariosType>({
    roles: [],
    conEmail: null,
    conTelefono: null,
    estado: []
  })

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

  // Función para obtener el rol del usuario
  const obtenerRolUsuario = (usuario: UsuarioConRol) => {
    if (!usuario.usuario_roles || usuario.usuario_roles.length === 0) {
      return { nombre: 'Sin rol', interno: 'sin-rol' }
    }

    // Tomar el primer rol (asumiendo que un usuario puede tener múltiples roles)
    const primerRol = usuario.usuario_roles[0]
    if (primerRol.roles_sistema) {
      return {
        nombre: primerRol.roles_sistema.nombre_visible,
        interno: primerRol.roles_sistema.nombre_interno
      }
    }

    return { nombre: 'Sin rol', interno: 'sin-rol' }
  }

  // Aplicar filtros a los usuarios
  const usuariosFiltrados = useMemo(() => {
    return usuariosConRoles.filter(usuario => {
      const rolUsuario = obtenerRolUsuario(usuario)
      
      // Filtro por roles
      if (filtros.roles.length > 0 && !filtros.roles.includes(rolUsuario.interno)) {
        return false
      }
      
      // Filtro por email
      if (filtros.conEmail !== null) {
        const tieneEmail = !!usuario.email
        if (filtros.conEmail !== tieneEmail) {
          return false
        }
      }
      
      // Filtro por teléfono
      if (filtros.conTelefono !== null) {
        const tieneTelefono = !!usuario.telefono
        if (filtros.conTelefono !== tieneTelefono) {
          return false
        }
      }
      
      // Filtro por estado (por ahora todos están activos)
      if (filtros.estado.length > 0 && !filtros.estado.includes('activo')) {
        return false
      }
      
      return true
    })
  }, [usuariosConRoles, filtros])

  // Calcular estadísticas basadas en datos filtrados
  const totalUsuarios = usuariosFiltrados.length
  const usuariosConEmail = usuariosFiltrados.filter(u => u.email).length
  const usuariosConTelefono = usuariosFiltrados.filter(u => u.telefono).length
  const usuariosEditadosHoy = usuariosFiltrados.filter(u => {
    const hoy = new Date().toISOString().split('T')[0]
    return u.fecha_registro.startsWith(hoy)
  }).length

  const estadisticasUsuarios = [
    {
      titulo: "Total Usuarios",
      valor: totalUsuarios.toString(),
      crecimiento: "+12.5%",
      esPositivo: true,
      icono: Users,
      color: "from-orange-500 to-orange-600",
    },
    {
      titulo: "Con Email",
      valor: usuariosConEmail.toString(),
      crecimiento: "+8.2%",
      esPositivo: true,
      icono: Mail,
      color: "from-gray-500 to-gray-600",
    },
    {
      titulo: "Con Teléfono",
      valor: usuariosConTelefono.toString(),
      crecimiento: "+15.3%",
      esPositivo: true,
      icono: Phone,
      color: "from-orange-400 to-orange-500",
    },
    {
      titulo: "Registrados Hoy",
      valor: usuariosEditadosHoy.toString(),
      crecimiento: "+5.7%",
      esPositivo: true,
      icono: UserEdit,
      color: "from-gray-400 to-gray-500",
    },
  ]

  const limpiarFiltros = () => {
    setFiltros({
      roles: [],
      conEmail: null,
      conTelefono: null,
      estado: []
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando usuarios...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error al cargar datos</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={recargar}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-800">Gestión de Usuarios</h2>
              <p className="text-gray-600 text-sm lg:text-base">
                Administra y organiza tu comunidad de manera eficiente
              </p>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-sm text-gray-500">Usuarios Totales</p>
              <p className="text-xl lg:text-2xl font-bold text-gray-800">{totalUsuarios}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {estadisticasUsuarios.map((estadistica, indice) => {
          const Icono = estadistica.icono
          return (
            <div key={indice} className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl hover:shadow-3xl transition-all duration-200">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br ${estadistica.color} rounded-xl flex items-center justify-center`}>
                  <Icono className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
                </div>
                <div className={`flex items-center gap-1 text-xs lg:text-sm font-medium ${estadistica.esPositivo ? "text-green-600" : "text-red-500"}`}>
                  <span>{estadistica.crecimiento}</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl lg:text-2xl font-bold text-gray-800 mb-1">{estadistica.valor}</h3>
                <p className="text-gray-600 text-xs lg:text-sm">{estadistica.titulo}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla de Usuarios */}
      <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl overflow-hidden">
        {/* Encabezado de Tabla */}
        <div className="p-4 lg:p-6 border-b border-white/20">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-1">Lista de Usuarios</h3>
              <p className="text-gray-600 text-sm">Gestiona y organiza tu comunidad</p>
              {usuariosFiltrados.length !== usuariosConRoles.length && (
                <p className="text-sm text-orange-600 mt-1">
                  Mostrando {usuariosFiltrados.length} de {usuariosConRoles.length} usuarios
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <FiltrosUsuarios
                filtros={filtros}
                onFiltrosChange={setFiltros}
                rolesDisponibles={rolesDisponibles}
                onLimpiarFiltros={limpiarFiltros}
              />
              <button className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
                <Plus className="w-4 h-4" />
                Crear Usuario
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Usuarios con Espaciado Optimizado */}
        <div className="p-4 space-y-4">
          {usuariosFiltrados && usuariosFiltrados.length > 0 ? (
            usuariosFiltrados.map((usuario) => {
              const rolUsuario = obtenerRolUsuario(usuario)
              return (
            <div key={usuario.id} className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-2xl p-6 hover:bg-white/60 transition-all duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                {/* Avatar y Nombre - 4 columnas */}
                <div className="lg:col-span-4 flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg flex-shrink-0">
                        {obtenerIniciales(usuario.nombre, usuario.apellido)}
                  </div>
                  <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-800 truncate text-lg mb-1">
                          {usuario.nombre} {usuario.apellido}
                        </h4>
                    <div className="space-y-1 text-sm text-gray-500">
                          <div className="truncate">{formatearEmail(usuario.email)}</div>
                          <div className="truncate">{formatearTelefono(usuario.telefono)}</div>
                    </div>
                  </div>
                </div>

                {/* Rol - 3 columnas */}
                <div className="lg:col-span-3 flex justify-center lg:justify-start">
                      <span className={`px-4 py-2 rounded-full text-sm font-medium ${obtenerColorRol(rolUsuario.interno)} whitespace-nowrap`}>
                        {rolUsuario.nombre}
                  </span>
                </div>

                {/* Estado - 2 columnas */}
                <div className="lg:col-span-2 flex justify-center lg:justify-start">
                  <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium whitespace-nowrap">
                        Activo
                  </span>
                </div>

                {/* Acciones - 3 columnas */}
                <div className="lg:col-span-3 flex items-center justify-center lg:justify-end gap-3">
                  <Link href={`/dashboard/users/${usuario.id}`}>
                    <button className="p-3 hover:bg-orange-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-orange-600 hover:scale-105" title="Ver detalles">
                      <Eye className="w-5 h-5" />
                    </button>
                  </Link>
                  <button className="p-3 hover:bg-orange-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-orange-600 hover:scale-105" title="Editar">
                    <Edit className="w-5 h-5" />
                  </button>
                  <button className="p-3 hover:bg-red-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-red-600 hover:scale-105" title="Eliminar">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {usuariosConRoles.length === 0 ? 'No hay usuarios registrados' : 'No hay usuarios que coincidan con los filtros'}
              </h3>
              <p className="text-gray-500">
                {usuariosConRoles.length === 0 
                  ? 'Comienza creando el primer usuario de tu comunidad'
                  : 'Intenta ajustar los filtros aplicados'
                }
              </p>
              {usuariosConRoles.length > 0 && (
                <button
                  onClick={limpiarFiltros}
                  className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}