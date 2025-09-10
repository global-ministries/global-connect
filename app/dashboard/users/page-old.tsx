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
  Search,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { FiltrosUsuarios, type FiltrosUsuarios as FiltrosUsuariosType } from "@/components/ui/filtros-usuarios"
import { supabase } from "@/lib/supabase/client"
import type { UsuarioConRol } from "@/hooks/use-usuarios"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function PaginaUsuarios() {
  // Estados principales (paginación en servidor)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [rolesDisponibles, setRolesDisponibles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [totalCount, setTotalCount] = useState(0)

  const [filtros, setFiltros] = useState<FiltrosUsuariosType>({
    roles: [],
    conEmail: null,
    conTelefono: null,
    estado: []
  })

  // --- Helpers UI y utilidades ---
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage))
  const goToPreviousPage = () => setCurrentPage((p) => Math.max(1, p - 1))
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1))
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value))
    setCurrentPage(1)
  }

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
  const obtenerRolUsuario = (usuario: UsuarioConRol) => {
    if (!usuario.usuario_roles || usuario.usuario_roles.length === 0) {
      return { nombre: 'Sin rol', interno: 'sin-rol' }
    }
    const primerRol = usuario.usuario_roles[0]
    if (primerRol.roles_sistema) {
      return {
        nombre: primerRol.roles_sistema.nombre_visible,
        interno: primerRol.roles_sistema.nombre_interno,
      }
    }
    return { nombre: 'Sin rol', interno: 'sin-rol' }
  }

  // --- Carga de Roles (una vez) ---
  useEffect(() => {
    const fetchRoles = async () => {
      const { data: roles, error: errorRoles } = await supabase
        .from("roles_sistema")
        .select("*")
        .order("nombre_visible", { ascending: true })
      if (!errorRoles) setRolesDisponibles(roles || [])
    }
    fetchRoles()
  }, [])

  // --- Carga de Usuarios (paginación en servidor) ---
  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      // Si filtramos por roles, usamos inner join; si no, left join
      const selectConJoin = (filtros.roles?.length || 0) > 0
        ? `
          *,
          usuario_roles:usuario_roles!inner (
            *,
            roles_sistema:roles_sistema!usuario_roles_rol_id_fkey (
              nombre_interno,
              nombre_visible
            )
          )
        `
        : `
          *,
          usuario_roles:usuario_roles!usuario_roles_usuario_id_fkey (
            *,
            roles_sistema:roles_sistema!usuario_roles_rol_id_fkey (
              nombre_interno,
              nombre_visible
            )
          )
        `

      let query = supabase
        .from("usuarios")
        .select(selectConJoin, { count: "exact" })
        .order("nombre", { ascending: true })

      // Filtro por email
      if (filtros.conEmail !== null) {
        query = filtros.conEmail
          ? query.not("email", "is", null)
          : query.is("email", null)
      }

      // Filtro por teléfono
      if (filtros.conTelefono !== null) {
        query = filtros.conTelefono
          ? query.not("telefono", "is", null)
          : query.is("telefono", null)
      }

      // Búsqueda por nombre, apellido, email, cédula
      if (debouncedSearchTerm) {
        const term = `%${debouncedSearchTerm}%`
        query = query.or(
          `nombre.ilike.${term},apellido.ilike.${term},email.ilike.${term},cedula.ilike.${term}`
        )
      }

      // Filtro por roles: obtener los IDs y filtrar por usuario_roles.rol_id
      if ((filtros.roles?.length || 0) > 0) {
        const { data: roleRows, error: errRoles } = await supabase
          .from("roles_sistema")
          .select("id, nombre_interno")
          .in("nombre_interno", filtros.roles)

        if (errRoles) throw errRoles
        const roleIds = (roleRows || []).map(r => r.id)
        if (roleIds.length === 0) {
          setUsuarios([])
          setTotalCount(0)
          setLoading(false)
          return
        }
        query = query.in("usuario_roles.rol_id", roleIds)
      }

      const { data, error: errorUsuarios, count } = await query.range(from, to)
      if (errorUsuarios) throw errorUsuarios

      setUsuarios(data || [])
      setTotalCount(count || 0)
    } catch (err: any) {
      setError(err?.message || "Error inesperado al cargar usuarios")
      setUsuarios([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }

  // Debounce para la búsqueda (400ms)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 400)
    return () => clearTimeout(id)
  }, [searchTerm])

  // Reset a la primera página cuando cambian filtros o búsqueda
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, filtros])

  // Llamar a fetchUsers cuando cambian paginación/filtros/búsqueda
  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, JSON.stringify(filtros), debouncedSearchTerm])

  // Estadísticas (total global y métricas de la página actual)
  const totalUsuarios = totalCount
  const usuariosConEmail = usuarios.filter(u => u.email).length
  const usuariosConTelefono = usuarios.filter(u => u.telefono).length
  const usuariosEditadosHoy = usuarios.filter(u => {
    const hoy = new Date().toISOString().split('T')[0]
    return (u.fecha_registro || '').startsWith(hoy)
  }).length

  const estadisticasUsuarios = [
    { titulo: "Total Usuarios", valor: totalUsuarios.toString(), crecimiento: "+12.5%", esPositivo: true, icono: Users, color: "from-orange-500 to-orange-600" },
    { titulo: "Con Email", valor: usuariosConEmail.toString(), crecimiento: "+8.2%", esPositivo: true, icono: Mail, color: "from-gray-500 to-gray-600" },
    { titulo: "Con Teléfono", valor: usuariosConTelefono.toString(), crecimiento: "+15.3%", esPositivo: true, icono: Phone, color: "from-orange-400 to-orange-500" },
    { titulo: "Registrados Hoy", valor: usuariosEditadosHoy.toString(), crecimiento: "+5.7%", esPositivo: true, icono: UserEdit, color: "from-gray-400 to-gray-500" },
  ]

  const limpiarFiltros = () => {
    setFiltros({ roles: [], conEmail: null, conTelefono: null, estado: [] })
    setSearchTerm("")
    setCurrentPage(1)
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
          <div className="text-red-500 text-6xl mb-4">⚠︝</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error al cargar datos</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchUsers} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
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
              <p className="text-gray-600 text-sm lg:text-base">Administra y organiza tu comunidad de manera eficiente</p>
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
              {totalUsuarios > 0 && (
                <p className="text-sm text-orange-600 mt-1">Mostrando {usuarios.length} de {totalUsuarios} usuarios</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 md:min-w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, cédula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full rounded-xl py-2 bg-white/80"
                />
              </div>
              <FiltrosUsuarios
                filtros={filtros}
                onFiltrosChange={(f) => { setFiltros(f); setCurrentPage(1); }}
                rolesDisponibles={rolesDisponibles}
                onLimpiarFiltros={limpiarFiltros}
              />
              <Link href="/dashboard/users/create" passHref legacyBehavior>
                <button className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
                  <Plus className="w-4 h-4" />
                  Crear Usuario
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Lista de Usuarios con Espaciado Optimizado */}
        <div className="p-4 space-y-4">
          {usuarios && usuarios.length > 0 ? (
            usuarios.map((usuario) => {
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
                        <h4 className="font-semibold text-gray-800 truncate text-lg mb-1">{usuario.nombre} {usuario.apellido}</h4>
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
                      <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium whitespace-nowrap">Activo</span>
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
                {totalUsuarios === 0 ? 'No hay usuarios registrados' : 'No hay usuarios que coincidan con los filtros o en esta página'}
              </h3>
              <p className="text-gray-500">
                {totalUsuarios === 0 ? 'Comienza creando el primer usuario de tu comunidad' : 'Intenta ajustar los filtros o cambiar de página'}
              </p>
            </div>
          )}
        </div>

        {/* Controles de Paginación (server-side) */}
        {totalUsuarios > 0 && (
          <div className="px-4 py-4 border-t border-white/20">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Selector de items por página */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Mostrar:</span>
                <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-600">por página</span>
              </div>

              {/* Info de página y controles */}
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={goToPreviousPage} disabled={currentPage === 1} className="px-3 py-1 text-sm bg-white/60 border border-white/40 rounded-lg hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Anterior
                  </button>
                  <button onClick={goToNextPage} disabled={currentPage >= totalPages} className="px-3 py-1 text-sm bg-white/60 border border-white/40 rounded-lg hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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