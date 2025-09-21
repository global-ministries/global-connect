"use client"

import { useState, useMemo } from "react"
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
import { useUsuariosConPermisos } from '@/hooks/use-usuarios-con-permisos'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { UserAvatar } from '@/components/ui/UserAvatar'
import {
  ContenedorDashboard,
  TarjetaSistema,
  BotonSistema,
  InputSistema,
  BadgeSistema,
  TituloSistema,
  TextoSistema,
  SkeletonSistema
} from '@/components/ui/sistema-diseno'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// Funciones auxiliares
function obtenerVarianteBadgeRol(rol?: string): "default" | "success" | "warning" | "error" | "info" {
  switch (rol) {
    case 'admin':
      return 'error'
    case 'pastor':
      return 'error'
    case 'director-general':
      return 'warning'
    case 'director-etapa':
      return 'warning'
    case 'lider':
      return 'info'
    case 'miembro':
      return 'default'
    default:
      return 'default'
  }
}

function formatearEmail(email?: string | null): string {
  return email || 'Sin email'
}

function formatearTelefono(telefono?: string | null): string {
  return telefono || 'Sin teléfono'
}

function getRolLabel(rolInterno: string): string {
  switch (rolInterno) {
    case 'admin':
      return 'Administrador'
    case 'pastor':
      return 'Pastor'
    case 'director-general':
      return 'Director General'
    case 'director-etapa':
      return 'Director de Etapa'
    case 'lider':
      return 'Líder'
    case 'miembro':
      return 'Miembro'
    default:
      return 'Sin rol'
  }
}

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

  const { roles: rolesActual } = useCurrentUser()
  const esAdmin = useMemo(() => rolesActual.includes('admin'), [rolesActual])
  const [mostrarMetricasAdicionales, setMostrarMetricasAdicionales] = useState(false)

  // Selección de usuarios
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const copia = new Set(prev)
      if (copia.has(id)) copia.delete(id); else copia.add(id)
      return copia
    })
  }
  const limpiarSeleccion = () => setSeleccionados(new Set())

  // Cambiar rol
  const [cambiandoRol, setCambiandoRol] = useState(false)
  const [rolNuevo, setRolNuevo] = useState<'miembro' | 'lider' | 'pastor' | 'director-etapa' | 'director-general' | 'admin'>('miembro')
  const cambiarRolSeleccionados = async () => {
    if (!esAdmin || seleccionados.size === 0) return
    try {
      setCambiandoRol(true)
      const res = await fetch('/api/usuarios/cambiar-rol', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(seleccionados), rol: rolNuevo })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error al cambiar rol')
      limpiarSeleccion()
      await recargarDatos()
    } catch (e) {
      console.error(e)
      // opcional: toast de error
    } finally {
      setCambiandoRol(false)
    }
  }

  const limpiarFiltros = () => {
    limpiarFiltrosHook()
  }


  const estadisticasUsuarios = [
    { titulo: "Total Usuarios", valor: estadisticas?.total_usuarios || 0, crecimiento: "+12.5%", esPositivo: true, icono: Users, color: "from-orange-500 to-orange-600" },
    { titulo: "Con Email", valor: estadisticas?.con_email || 0, crecimiento: "+8.2%", esPositivo: true, icono: Mail, color: "from-gray-500 to-gray-600" },
    { titulo: "Con Teléfono", valor: estadisticas?.con_telefono || 0, crecimiento: "+15.3%", esPositivo: true, icono: Phone, color: "from-orange-400 to-orange-500" },
    { titulo: "Registrados Hoy", valor: estadisticas?.registrados_hoy || 0, crecimiento: "+5.7%", esPositivo: true, icono: UserEdit, color: "from-gray-400 to-gray-500" },
  ]

  if (cargando) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Usuarios"
          descripcion="Cargando información de usuarios..."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <TarjetaSistema key={i} className="p-6">
                <div className="flex items-center gap-4">
                  <SkeletonSistema ancho="48px" alto="48px" redondo />
                  <div className="space-y-2 flex-1">
                    <SkeletonSistema ancho="80px" alto="20px" />
                    <SkeletonSistema ancho="120px" alto="16px" />
                  </div>
                </div>
              </TarjetaSistema>
            ))}
          </div>

          <TarjetaSistema className="p-6">
            <div className="space-y-4">
              <SkeletonSistema ancho="200px" alto="24px" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg">
                  <SkeletonSistema ancho="48px" alto="48px" redondo />
                  <div className="space-y-2 flex-1">
                    <SkeletonSistema ancho="150px" alto="16px" />
                    <SkeletonSistema ancho="200px" alto="14px" />
                  </div>
                  <SkeletonSistema ancho="80px" alto="32px" />
                </div>
              ))}
            </div>
          </TarjetaSistema>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Usuarios"
        descripcion=""
        accionPrincipal={esAdmin && seleccionados.size > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={rolNuevo}
              onChange={(e) => setRolNuevo(e.target.value as any)}
              className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              <option value="miembro">Miembro</option>
              <option value="lider">Líder</option>
              <option value="pastor">Pastor</option>
              <option value="director-etapa">Director de Etapa</option>
              <option value="director-general">Director General</option>
              <option value="admin">Administrador</option>
            </select>
            <BotonSistema variante="primario" tamaño="sm" onClick={cambiarRolSeleccionados} cargando={cambiandoRol}>
              Cambiar Rol ({seleccionados.size})
            </BotonSistema>
            <BotonSistema variante="outline" tamaño="sm" onClick={limpiarSeleccion} disabled={cambiandoRol}>
              Cancelar
            </BotonSistema>
          </div>
        ) : null}
      >

        {/* Tarjetas de Estadísticas */}
        <div className="space-y-4">
          {/* Móvil: Solo Total Usuarios visible, resto colapsable */}
          <div className="md:hidden">
            {/* Tarjeta Principal - Total Usuarios */}
            <TarjetaSistema className="p-4 hover:shadow-lg transition-all duration-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <TituloSistema nivel={3} className="text-gray-900 truncate">{estadisticas?.total_usuarios || 0}</TituloSistema>
                    <BadgeSistema variante="success" tamaño="sm">+12.5%</BadgeSistema>
                  </div>
                  <TextoSistema variante="sutil" tamaño="sm" className="truncate">Total Usuarios</TextoSistema>
                </div>
              </div>
            </TarjetaSistema>

            {/* Botón para mostrar/ocultar métricas adicionales */}
            <button
              onClick={() => setMostrarMetricasAdicionales(!mostrarMetricasAdicionales)}
              className="w-full mt-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-2 text-gray-600"
            >
              <span className="text-sm font-medium">
                {mostrarMetricasAdicionales ? 'Ocultar métricas' : 'Ver más métricas'}
              </span>
              <svg
                className={`w-4 h-4 transition-transform ${mostrarMetricasAdicionales ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Métricas adicionales colapsables */}
            {mostrarMetricasAdicionales && (
              <div className="mt-3 space-y-3">
                {estadisticasUsuarios.slice(1).map((estadistica, indice) => {
                  const Icono = estadistica.icono
                  return (
                    <TarjetaSistema key={indice + 1} className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-gradient-to-br ${estadistica.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icono className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <TituloSistema nivel={4} className="text-gray-900 truncate">{estadistica.valor}</TituloSistema>
                            <BadgeSistema variante="success" tamaño="sm">
                              {estadistica.crecimiento}
                            </BadgeSistema>
                          </div>
                          <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                            {estadistica.titulo}
                          </TextoSistema>
                        </div>
                      </div>
                    </TarjetaSistema>
                  )
                })}
              </div>
            )}
          </div>

          {/* Desktop: Grid normal */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {estadisticasUsuarios.map((estadistica, indice) => {
              const Icono = estadistica.icono
              return (
                <TarjetaSistema key={indice} className="p-4 hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 bg-gradient-to-br ${estadistica.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icono className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <TituloSistema nivel={3} className="text-gray-900 truncate">{estadistica.valor}</TituloSistema>
                        <BadgeSistema variante="success" tamaño="sm">
                          {estadistica.crecimiento}
                        </BadgeSistema>
                      </div>
                      <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                        {estadistica.titulo}
                      </TextoSistema>
                    </div>
                  </div>
                </TarjetaSistema>
              )
            })}
          </div>
        </div>

        {/* Lista de Usuarios */}
        <div className="space-y-4">
          {/* Encabezado Minimalista */}
          <div className="flex items-center justify-between">
            <div>
              <TituloSistema nivel={2} className="mb-2">Usuarios</TituloSistema>
            </div>
          </div>

          {/* Buscador Simple */}
          <div className="space-y-3">
            <InputSistema
              type="text"
              placeholder="Buscar por nombre, email, cédula..."
              value={filtros.busqueda}
              onChange={(e) => actualizarFiltros({ busqueda: e.target.value })}
              icono={Search}
            />

            {filtros.busqueda && (
              <BotonSistema
                variante="outline"
                onClick={limpiarFiltros}
                tamaño="sm"
                className="w-full md:w-auto"
              >
                Limpiar Filtros
              </BotonSistema>
            )}
          </div>

          {/* Lista de Usuarios */}
          <div className="space-y-2 md:space-y-3">
            {usuarios && usuarios.length > 0 ? (
              usuarios.map((usuario) => (
                <div key={usuario.id} className="block">
                  {/* Versión Móvil */}
                  <div className="md:hidden flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    {esAdmin && (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={seleccionados.has(usuario.id)}
                        onChange={() => toggleSeleccion(usuario.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <Link href={`/dashboard/users/${usuario.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <UserAvatar
                        photoUrl={usuario.foto_perfil_url || null}
                        nombre={usuario.nombre}
                        apellido={usuario.apellido}
                        size="md"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {usuario.nombre} {usuario.apellido}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {formatearEmail(usuario.email)}
                        </div>
                      </div>
                      <div className="text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  </div>

                  {/* Desktop */}
                  <TarjetaSistema className="hidden md:block p-4 hover:shadow-md transition-all duration-200">
                    <div className="flex items-center gap-4">
                      {esAdmin && (
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={seleccionados.has(usuario.id)}
                          onChange={() => toggleSeleccion(usuario.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <Link href={`/dashboard/users/${usuario.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                        <UserAvatar
                          photoUrl={usuario.foto_perfil_url || null}
                          nombre={usuario.nombre}
                          apellido={usuario.apellido}
                          size="lg"
                          className="flex-shrink-0 shadow-lg"
                        />

                        <div className="flex-1 min-w-0 grid grid-cols-4 gap-4">
                          <div>
                            <TituloSistema nivel={4} className="truncate hover:text-orange-600 transition-colors">
                              {usuario.nombre} {usuario.apellido}
                            </TituloSistema>
                          </div>

                          <div>
                            <TextoSistema tamaño="sm" className="truncate">
                              {formatearEmail(usuario.email)}
                            </TextoSistema>
                          </div>

                          <div>
                            <TextoSistema tamaño="sm" className="truncate">
                              {formatearTelefono(usuario.telefono)}
                            </TextoSistema>
                          </div>

                          <div className="flex items-center gap-2">
                            <BadgeSistema variante={obtenerVarianteBadgeRol(usuario.rol_nombre_interno)} tamaño="sm">
                              {getRolLabel(usuario.rol_nombre_interno || '')}
                            </BadgeSistema>
                            <BadgeSistema variante="success" tamaño="sm">Activo</BadgeSistema>
                          </div>
                        </div>
                      </Link>
                    </div>
                  </TarjetaSistema>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <TituloSistema nivel={3} variante="sutil" className="mb-2">
                  {estadisticas?.total_usuarios === 0 ? 'No hay usuarios registrados' : 'No hay usuarios que coincidan con los filtros'}
                </TituloSistema>
                <TextoSistema variante="sutil">
                  {estadisticas?.total_usuarios === 0 ? 'Comienza creando el primer usuario de tu comunidad' : 'Intenta ajustar los filtros o cambiar de página'}
                </TextoSistema>
              </div>
            )}
          </div>

          {/* Controles de Paginación */}
          {estadisticas?.total_usuarios && estadisticas.total_usuarios > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <TextoSistema tamaño="sm" variante="sutil">
                  Página {paginaActual} de {totalPaginas}
                </TextoSistema>

                {/* Selector de elementos por página */}
                <div className="flex items-center gap-2">
                  <TextoSistema tamaño="sm" variante="sutil">Mostrar:</TextoSistema>
                  <select
                    value={filtros.limite || 20}
                    onChange={(e) => actualizarFiltros({ limite: parseInt(e.target.value) })}
                    className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {totalPaginas > 1 && (
                <div className="flex gap-2">
                  <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    onClick={() => cambiarPagina(paginaActual - 1)}
                    disabled={paginaActual === 1}
                  >
                    Anterior
                  </BotonSistema>
                  <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    onClick={() => cambiarPagina(paginaActual + 1)}
                    disabled={paginaActual >= totalPaginas}
                  >
                    Siguiente
                  </BotonSistema>
                </div>
              )}
            </div>
          )}

          {/* Botón Agregar Miembro Fijo */}
          <Link href="/dashboard/users/create">
            <div className="fixed bottom-20 md:bottom-6 right-4 z-30">
              <BotonSistema
                variante="outline"
                className="border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 px-4 py-2 rounded-lg shadow-lg bg-white"
                tamaño="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Miembro
              </BotonSistema>
            </div>
          </Link>
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
