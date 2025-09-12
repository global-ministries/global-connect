"use client"

import {
  Eye,
  Edit,
  Plus,
  Users,
  Mail,
  Phone,
  UserCheckIcon as UserEdit,
  Search,
} from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { useUsuariosConPermisos } from '@/hooks/use-usuarios-con-permisos'

export default function PaginaUsuarios() {
  const {
    usuarios,
    estadisticas,
    cargando,
    filtros,
    paginaActual,
    totalPaginas,
    actualizarFiltros,
    recargarDatos,
    limpiarFiltros: limpiarFiltrosHook,
    cambiarPagina
  } = useUsuariosConPermisos()

  const limpiarFiltros = () => {
    limpiarFiltrosHook()
  }

  // Helpers UI y utilidades
  const obtenerIniciales = (nombre: string, apellido: string) => `${nombre?.[0] || ""}${apellido?.[0] || ""}`.toUpperCase()
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
  const formatearTelefono = (t: string | null) => (t ? t : 'Sin teléfono')
  const formatearEmail = (e: string | null) => (e ? e : 'Sin email')
  const getRolLabel = (rolInterno: string) => {
    switch (rolInterno) {
      case 'admin': return 'Administrador'
      case 'pastor': return 'Pastor'
      case 'director-general': return 'Director General'
      case 'director-etapa': return 'Director de Etapa'
      case 'lider': return 'Líder'
      case 'miembro': return 'Miembro'
      default: return 'Sin rol'
    }
  }

  const estadisticasUsuarios = [
    { titulo: "Total Usuarios", valor: estadisticas?.total_usuarios || 0, crecimiento: "+12.5%", esPositivo: true, icono: Users, color: "from-orange-500 to-orange-600" },
    { titulo: "Con Email", valor: estadisticas?.con_email || 0, crecimiento: "+8.2%", esPositivo: true, icono: Mail, color: "from-gray-500 to-gray-600" },
    { titulo: "Con Teléfono", valor: estadisticas?.con_telefono || 0, crecimiento: "+15.3%", esPositivo: true, icono: Phone, color: "from-orange-400 to-orange-500" },
    { titulo: "Registrados Hoy", valor: estadisticas?.registrados_hoy || 0, crecimiento: "+5.7%", esPositivo: true, icono: UserEdit, color: "from-gray-400 to-gray-500" },
  ]

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando usuarios...</p>
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
              <p className="text-gray-600 text-sm lg:text-base">Administra y organiza tu comunidad de manera eficiente</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {estadisticasUsuarios.map((estadistica, indice) => {
          const Icono = estadistica.icono
          return (
            <div key={indice} className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-2xl p-3 lg:p-4 shadow-2xl hover:shadow-3xl transition-all duration-200">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br ${estadistica.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icono className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg lg:text-xl font-bold text-gray-800 truncate">{estadistica.valor}</h3>
                    <div className={`flex items-center gap-1 text-xs font-medium ${estadistica.esPositivo ? "text-green-600" : "text-red-500"} ml-2`}>
                      <span>{estadistica.crecimiento}</span>
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs lg:text-sm truncate">{estadistica.titulo}</p>
                </div>
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
              {estadisticas?.total_usuarios && estadisticas.total_usuarios > 0 && (
                <p className="text-sm text-orange-600 mt-1">Mostrando {usuarios.length} de {estadisticas.total_usuarios} usuarios</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 md:min-w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, cédula..."
                  value={filtros.busqueda}
                  onChange={(e) => actualizarFiltros({ busqueda: e.target.value })}
                  className="pl-10 w-full rounded-xl py-2 bg-white/80"
                />
              </div>
              <button 
                onClick={limpiarFiltros}
                className="px-4 py-2 text-sm bg-white/60 border border-white/40 rounded-xl hover:bg-white/80 transition-colors"
              >
                Limpiar Filtros
              </button>
              <Link href="/dashboard/users/create" passHref legacyBehavior>
                <button className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
                  <Plus className="w-4 h-4" />
                  Crear Usuario
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Lista de Usuarios Optimizada para Móvil */}
        <div className="p-3 sm:p-4 space-y-3">
          {usuarios && usuarios.length > 0 ? (
            usuarios.map((usuario) => (
              <div key={usuario.id} className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-2xl hover:bg-white/60 transition-all duration-200">
                {/* Layout Móvil: Diseño vertical optimizado */}
                <div className="lg:hidden p-4">
                  {/* Header: Avatar, Nombre y Acciones */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg flex-shrink-0">
                      {obtenerIniciales(usuario.nombre, usuario.apellido)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-800 text-base mb-1 leading-tight">{usuario.nombre} {usuario.apellido}</h4>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${obtenerColorRol(usuario.rol_nombre_interno)}`}>
                          {getRolLabel(usuario.rol_nombre_interno)}
                        </span>
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Activo</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link href={`/dashboard/users/${usuario.id}`}>
                        <button className="p-2 hover:bg-orange-100/60 rounded-lg transition-all duration-200 text-gray-600 hover:text-orange-600" title="Ver detalles">
                          <Eye className="w-4 h-4" />
                        </button>
                      </Link>
                      <button className="p-2 hover:bg-orange-100/60 rounded-lg transition-all duration-200 text-gray-600 hover:text-orange-600" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Info de contacto en tarjeta separada */}
                  <div className="bg-white/40 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4 flex-shrink-0 text-gray-400" />
                      <span className="truncate font-medium">{formatearEmail(usuario.email)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
                      <span className="truncate font-medium">{formatearTelefono(usuario.telefono)}</span>
                    </div>
                  </div>
                </div>

                {/* Layout Desktop: Grid horizontal */}
                <div className="hidden lg:block p-6">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Avatar y Nombre - 4 columnas */}
                    <div className="col-span-4 flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg flex-shrink-0">
                        {obtenerIniciales(usuario.nombre, usuario.apellido)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-800 truncate text-lg mb-1">{usuario.nombre} {usuario.apellido}</h4>
                        <div className="space-y-1 text-sm text-gray-500">
                          <div className="truncate">{formatearEmail(usuario.email)}</div>
                          <div className="truncate">{formatearTelefono(usuario.telefono)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Rol - 3 columnas */}
                    <div className="col-span-3 flex justify-start">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(usuario.rol_nombre_interno)} whitespace-nowrap`}>
                        {getRolLabel(usuario.rol_nombre_interno)}
                      </span>
                    </div>

                    {/* Estado - 2 columnas */}
                    <div className="col-span-2 flex justify-start">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium whitespace-nowrap">Activo</span>
                    </div>

                    {/* Acciones - 3 columnas */}
                    <div className="col-span-3 flex items-center justify-end gap-3">
                      <Link href={`/dashboard/users/${usuario.id}`}>
                        <button className="p-3 hover:bg-orange-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-orange-600 hover:scale-105" title="Ver detalles">
                          <Eye className="w-5 h-5" />
                        </button>
                      </Link>
                      <button className="p-3 hover:bg-orange-100/60 rounded-xl transition-all duration-200 text-gray-600 hover:text-orange-600 hover:scale-105" title="Editar">
                        <Edit className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {estadisticas?.total_usuarios === 0 ? 'No hay usuarios registrados' : 'No hay usuarios que coincidan con los filtros'}
              </h3>
              <p className="text-gray-500">
                {estadisticas?.total_usuarios === 0 ? 'Comienza creando el primer usuario de tu comunidad' : 'Intenta ajustar los filtros o cambiar de página'}
              </p>
            </div>
          )}
        </div>

        {/* Controles de Paginación */}
        {estadisticas?.total_usuarios && estadisticas.total_usuarios > 0 && (
          <div className="px-4 py-4 border-t border-white/20">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Info de página y controles */}
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Página {paginaActual} de {totalPaginas}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => cambiarPagina(paginaActual - 1)} 
                    disabled={paginaActual === 1} 
                    className="px-3 py-1 text-sm bg-white/60 border border-white/40 rounded-lg hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>
                  <button 
                    onClick={() => cambiarPagina(paginaActual + 1)} 
                    disabled={paginaActual >= totalPaginas} 
                    className="px-3 py-1 text-sm bg-white/60 border border-white/40 rounded-lg hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
