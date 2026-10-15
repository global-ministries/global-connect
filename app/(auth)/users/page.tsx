"use client"

import { useState, useMemo, useEffect, type FormEvent } from "react"
import { Plus, Users, Mail, Phone, UserCheckIcon as UserEdit, Search, CheckSquare, Square, ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useUsuariosConPermisos } from '@/hooks/use-usuarios-con-permisos'

import { UserAvatar } from '@/components/ui/UserAvatar'
import { PaginaSistema, TarjetaSistema, BotonSistema, InputSistema, SelectSistema, BadgeSistema, TituloSistema, TextoSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { FiltrosUsuarios as FiltrosUsuariosUI } from '@/components/ui/filtros-usuarios'
import type { FiltrosUsuarios as FiltrosUsuariosType } from '@/components/ui/filtros-usuarios'
import { useCampus } from '@/hooks/useCampus'
import { VinculosPendientesCard } from '@/components/users/vinculos-pendientes-card'

type RolSeleccionable = 'miembro' | 'lider' | 'pastor' | 'director-etapa' | 'director-general' | 'admin'

const ROLES_DISPONIBLES = [
  { nombre_interno: 'miembro', nombre_visible: 'Miembro' },
  { nombre_interno: 'lider', nombre_visible: 'Líder' },
  { nombre_interno: 'pastor', nombre_visible: 'Pastor' },
  { nombre_interno: 'director-etapa', nombre_visible: 'Director de Etapa' },
  { nombre_interno: 'director-general', nombre_visible: 'Director General' },
  { nombre_interno: 'admin', nombre_visible: 'Administrador' },
]

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

const OPCIONES_POR_PAGINA = [
  { valor: '20', etiqueta: '20' },
  { valor: '50', etiqueta: '50' },
  { valor: '100', etiqueta: '100' },
]

/** Row checkbox with a 44px hit area around the 16px box. */
function CasillaSeleccion({ nombre, marcada, onCambiar }: { nombre: string; marcada: boolean; onCambiar: () => void }) {
  return (
    <label className="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl">
      <input
        type="checkbox"
        className="size-4 accent-[var(--brand-primary)]"
        aria-label={`Seleccionar a ${nombre}`}
        checked={marcada}
        onChange={onCambiar}
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  )
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
  const { campusId } = useCampus()
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
  } = useUsuariosConPermisos({ campusId })

  const { roles: rolesActual } = useCurrentUser()
  const esAdmin = useMemo(() => rolesActual.includes('admin'), [rolesActual])
  const puedeCrear = useMemo(() => rolesActual.some(r => ['admin', 'pastor', 'director-general', 'director-etapa'].includes(r)), [rolesActual])
  const [mostrarMetricasAdicionales, setMostrarMetricasAdicionales] = useState(false)

  // Search: typing only edits the draft; the search runs on confirm (Enter or the "Buscar" button).
  const [busquedaBorrador, setBusquedaBorrador] = useState(filtros.busqueda)
  // The draft follows the applied value when it changes from outside (e.g. clearing filters).
  useEffect(() => {
    setBusquedaBorrador(filtros.busqueda)
  }, [filtros.busqueda])

  const confirmarBusqueda = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const busqueda = busquedaBorrador.trim()
    setBusquedaBorrador(busqueda)
    if (busqueda !== filtros.busqueda) {
      actualizarFiltros({ busqueda })
    }
  }

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

  // Seleccionar todos en la página actual
  const visiblesIds = useMemo(() => (usuarios || []).map(u => u.id), [usuarios])
  const todosSeleccionadosEnPagina = useMemo(
    () => visiblesIds.length > 0 && visiblesIds.every(id => seleccionados.has(id)),
    [visiblesIds, seleccionados]
  )
  const toggleSeleccionPagina = () => {
    setSeleccionados(prev => {
      const nuevo = new Set(prev)
      if (todosSeleccionadosEnPagina) {
        // deseleccionar todos los visibles
        visiblesIds.forEach(id => nuevo.delete(id))
      } else {
        // seleccionar todos los visibles
        visiblesIds.forEach(id => nuevo.add(id))
      }
      return nuevo
    })
  }

  // Cambiar rol
  const [cambiandoRol, setCambiandoRol] = useState(false)
  const [rolNuevo, setRolNuevo] = useState<RolSeleccionable>('miembro')
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
    setBusquedaBorrador('')
    limpiarFiltrosHook()
  }

  const estadisticasUsuarios = [
    { titulo: "Total Usuarios", valor: estadisticas?.total_usuarios || 0, crecimiento: "+12.5%", icono: Users },
    { titulo: "Con Email", valor: estadisticas?.con_email || 0, crecimiento: "+8.2%", icono: Mail },
    { titulo: "Con Teléfono", valor: estadisticas?.con_telefono || 0, crecimiento: "+15.3%", icono: Phone },
    { titulo: "Registrados Hoy", valor: estadisticas?.registrados_hoy || 0, crecimiento: "+5.7%", icono: UserEdit },
  ]

  if (cargando) {
    return (
      <PaginaSistema titulo="Usuarios">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <TarjetaSistema key={i} className="p-4">
              <div className="flex items-center gap-3">
                <SkeletonSistema ancho="48px" alto="48px" />
                <div className="space-y-2 flex-1">
                  <SkeletonSistema ancho="80px" alto="20px" />
                  <SkeletonSistema ancho="120px" alto="16px" />
                </div>
              </div>
            </TarjetaSistema>
          ))}
        </div>

        <div className="space-y-3">
          <SkeletonSistema ancho="100%" alto="44px" />
          {[...Array(5)].map((_, i) => (
            <TarjetaSistema key={i} className="p-4">
              <div className="flex items-center gap-4">
                <SkeletonSistema ancho="48px" alto="48px" redondo />
                <div className="space-y-2 flex-1 min-w-0">
                  <SkeletonSistema ancho="60%" alto="16px" />
                  <SkeletonSistema ancho="80%" alto="14px" />
                </div>
              </div>
            </TarjetaSistema>
          ))}
        </div>
      </PaginaSistema>
    )
  }

  const haySeleccion = esAdmin && seleccionados.size > 0

  // Bulk role change: in the desktop header, and inline on mobile where the header is hidden.
  const accionesSeleccion = haySeleccion ? (
    <div className="flex flex-wrap items-center gap-2">
      <SelectSistema
        aria-label="Nuevo rol"
        value={rolNuevo}
        onValueChange={(valor) => setRolNuevo(valor as RolSeleccionable)}
        opciones={ROLES_DISPONIBLES.map(r => ({ valor: r.nombre_interno, etiqueta: r.nombre_visible }))}
        className="w-auto min-w-44"
      />
      <BotonSistema variante="primario" onClick={cambiarRolSeleccionados} cargando={cambiandoRol}>
        Cambiar Rol ({seleccionados.size})
      </BotonSistema>
      <BotonSistema variante="outline" onClick={limpiarSeleccion} disabled={cambiandoRol}>
        Cancelar
      </BotonSistema>
    </div>
  ) : null

  return (
    <PaginaSistema titulo="Usuarios" acciones={accionesSeleccion}>

        {/* Signups by cédula waiting for this director; renders nothing when there are none */}
        <VinculosPendientesCard />

        {/* Tarjetas de Estadísticas */}
        <div className="space-y-4">
          {/* Móvil: Solo Total Usuarios visible, resto colapsable */}
          <div className="md:hidden">
            <TarjetaEstadistica {...estadisticasUsuarios[0]} />

            <BotonSistema
              variante="ghost"
              tamaño="sm"
              onClick={() => setMostrarMetricasAdicionales(!mostrarMetricasAdicionales)}
              aria-expanded={mostrarMetricasAdicionales}
              icono={ChevronDown}
              iconoPosicion="derecha"
              className={`mt-3 w-full bg-muted [&>svg]:transition-transform ${mostrarMetricasAdicionales ? '[&>svg]:rotate-180' : ''}`}
            >
              {mostrarMetricasAdicionales ? 'Ocultar métricas' : 'Ver más métricas'}
            </BotonSistema>

            {/* Métricas adicionales colapsables */}
            {mostrarMetricasAdicionales && (
              <div className="mt-3 space-y-3">
                {estadisticasUsuarios.slice(1).map((estadistica) => (
                  <TarjetaEstadistica key={estadistica.titulo} {...estadistica} />
                ))}
              </div>
            )}
          </div>

          {/* Desktop: Grid normal */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {estadisticasUsuarios.map((estadistica) => (
              <TarjetaEstadistica key={estadistica.titulo} {...estadistica} />
            ))}
          </div>
        </div>

        {/* Lista de Usuarios */}
        <section aria-labelledby="titulo-lista-usuarios" className="space-y-4">
          {/* The page title already says "Usuarios"; the list heading is for screen readers. */}
          <TituloSistema id="titulo-lista-usuarios" nivel={2} className="sr-only">Usuarios</TituloSistema>

          {/* Buscador Simple */}
          <div className="space-y-3">
            <form onSubmit={confirmarBusqueda} className="flex gap-2">
              <div className="flex-1 min-w-0">
                <InputSistema
                  type="text"
                  aria-label="Buscar usuarios"
                  placeholder="Buscar por nombre, email, cédula..."
                  value={busquedaBorrador}
                  onChange={(e) => setBusquedaBorrador(e.target.value)}
                  icono={Search}
                />
              </div>
              <BotonSistema type="submit">
                Buscar
              </BotonSistema>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtros avanzados */}
              {(() => {
                const filtrosUI: FiltrosUsuariosType = {
                  roles: filtros.roles,
                  conEmail: filtros.con_email,
                  conTelefono: filtros.con_telefono,
                  enGrupo: filtros.en_grupo ?? null,
                  estado: []
                }
                return (
                  <FiltrosUsuariosUI
                    filtros={filtrosUI}
                    onFiltrosChange={(f) => {
                      actualizarFiltros({ roles: f.roles, con_email: f.conEmail, con_telefono: f.conTelefono, en_grupo: f.enGrupo })
                    }}
                    rolesDisponibles={ROLES_DISPONIBLES}
                    onLimpiarFiltros={limpiarFiltros}
                  />
                )
              })()}
              {filtros.busqueda && (
                <BotonSistema variante="outline" onClick={limpiarFiltros}>
                  Limpiar Filtros
                </BotonSistema>
              )}

              {esAdmin && (usuarios && usuarios.length > 0) && seleccionados.size > 0 && (
                <BotonSistema
                  variante="outline"
                  onClick={toggleSeleccionPagina}
                  icono={todosSeleccionadosEnPagina ? CheckSquare : Square}
                  className="md:ml-auto"
                >
                  {todosSeleccionadosEnPagina ? 'Deseleccionar todos (página)' : 'Seleccionar todos (página)'}
                </BotonSistema>
              )}
            </div>

            {accionesSeleccion && <div className="md:hidden">{accionesSeleccion}</div>}
          </div>

          {/* Lista de Usuarios */}
          <ul className="space-y-2 md:space-y-3">
            {usuarios && usuarios.length > 0 ? (
              usuarios.map((usuario) => {
                const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`
                return (
                  <li key={usuario.id}>
                    {/* Versión Móvil */}
                    <div className="md:hidden flex items-center gap-3 p-3 bg-card rounded-2xl border border-border hover:bg-accent/50 transition-colors">
                      {esAdmin && (
                        <CasillaSeleccion
                          nombre={nombreCompleto}
                          marcada={seleccionados.has(usuario.id)}
                          onCambiar={() => toggleSeleccion(usuario.id)}
                        />
                      )}
                      <Link href={`/users/${usuario.id}`} className="flex min-h-11 items-center gap-3 flex-1 min-w-0">
                        <UserAvatar
                          photoUrl={usuario.foto_perfil_url || null}
                          nombre={usuario.nombre}
                          apellido={usuario.apellido}
                          size="md"
                          className="flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {nombreCompleto}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {formatearEmail(usuario.email)}
                          </div>
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                      </Link>
                    </div>

                    {/* Desktop */}
                    <TarjetaSistema className="hidden md:block p-4 hover:shadow-md transition-shadow duration-200">
                      <div className="flex items-center gap-4">
                        {esAdmin && (
                          <CasillaSeleccion
                            nombre={nombreCompleto}
                            marcada={seleccionados.has(usuario.id)}
                            onCambiar={() => toggleSeleccion(usuario.id)}
                          />
                        )}
                        <Link href={`/users/${usuario.id}`} className="group flex items-center gap-4 flex-1 min-w-0">
                          <UserAvatar
                            photoUrl={usuario.foto_perfil_url || null}
                            nombre={usuario.nombre}
                            apellido={usuario.apellido}
                            size="lg"
                            className="flex-shrink-0 shadow-lg"
                          />

                          <div className="flex-1 min-w-0 grid grid-cols-4 gap-4">
                            <div className="min-w-0">
                              <TituloSistema nivel={4} className="truncate transition-colors group-hover:text-[var(--brand-primary)]">
                                {nombreCompleto}
                              </TituloSistema>
                            </div>

                            <div className="min-w-0">
                              <TextoSistema tamaño="sm" className="truncate">
                                {formatearEmail(usuario.email)}
                              </TextoSistema>
                            </div>

                            <div className="min-w-0">
                              <TextoSistema tamaño="sm" className="truncate">
                                {formatearTelefono(usuario.telefono)}
                              </TextoSistema>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <BadgeSistema variante={obtenerVarianteBadgeRol(usuario.rol_nombre_interno)} tamaño="sm">
                                {getRolLabel(usuario.rol_nombre_interno || '')}
                              </BadgeSistema>
                              <BadgeSistema variante="success" tamaño="sm">Activo</BadgeSistema>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </TarjetaSistema>
                  </li>
                )
              })
            ) : (
              <li className="text-center py-12">
                <Users className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" aria-hidden="true" />
                <TituloSistema nivel={3} variante="sutil" className="mb-2">
                  {estadisticas?.total_usuarios === 0 ? 'No hay usuarios registrados' : 'No hay usuarios que coincidan con los filtros'}
                </TituloSistema>
                <TextoSistema variante="sutil">
                  {estadisticas?.total_usuarios === 0 ? 'Comienza creando el primer usuario de tu comunidad' : 'Intenta ajustar los filtros o cambiar de página'}
                </TextoSistema>
              </li>
            )}
          </ul>

          {/* Controles de Paginación */}
          {estadisticas?.total_usuarios && estadisticas.total_usuarios > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <TextoSistema tamaño="sm" variante="sutil">
                  Página {paginaActual} de {totalPaginas}
                </TextoSistema>

                {/* Selector de elementos por página */}
                <div className="flex items-center gap-2">
                  <label htmlFor="usuarios-por-pagina" className="text-sm text-muted-foreground">Mostrar:</label>
                  <SelectSistema
                    id="usuarios-por-pagina"
                    value={String(filtros.limite || 20)}
                    onValueChange={(valor) => actualizarFiltros({ limite: parseInt(valor) })}
                    opciones={OPCIONES_POR_PAGINA}
                    className="w-24"
                  />
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

          {/* Botón Agregar Miembro Fijo — solo roles con permiso */}
          {puedeCrear && (
            <Link href="/users/create" className="fixed bottom-20 md:bottom-6 right-4 z-30 rounded-xl">
              <BotonSistema variante="primario" icono={Plus} tabIndex={-1}>
                Agregar Miembro
              </BotonSistema>
            </Link>
          )}
        </section>
      </PaginaSistema>
  )
}

/** One KPI tile: brand-tinted icon, value, growth badge and label. */
function TarjetaEstadistica({ titulo, valor, crecimiento, icono: Icono }: { titulo: string; valor: number; crecimiento: string; icono: typeof Users }) {
  return (
    <TarjetaSistema className="p-4 hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-xl bg-[var(--brand-accent-strong)] text-[var(--brand-primary)] flex items-center justify-center flex-shrink-0">
          <Icono className="size-6" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <TituloSistema nivel={3} className="text-foreground truncate">{valor}</TituloSistema>
            <BadgeSistema variante="success" tamaño="sm">{crecimiento}</BadgeSistema>
          </div>
          <TextoSistema variante="sutil" tamaño="sm" className="truncate">{titulo}</TextoSistema>
        </div>
      </div>
    </TarjetaSistema>
  )
}
