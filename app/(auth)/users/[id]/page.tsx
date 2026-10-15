"use client"

import { Mail, Phone, PhoneCall, Calendar, Edit, Users, MapPin, User, Briefcase, GraduationCap, Heart, Shield, Clock, Trash2, BarChart3, AlertTriangle, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import * as React from "react"
import { useState, useEffect } from "react"
import { obtenerNombreRelacion } from "@/lib/config/relaciones-familiares"
import { AgregarFamiliarModal } from '@/components/modals/AgregarFamiliarModal'
import { ConfirmationModal } from "@/components/modals/ConfirmationModal"
import { createClient } from "@/lib/supabase/client"
import { deleteFamilyRelation } from "@/lib/actions/user.actions"
import { toast } from "@/components/ui/use-toast"

import { PaginaSistema, TituloSistema, BotonSistema, TarjetaSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { formatPhoneForCall } from '@/lib/utils'
import LocationPicker from "@/components/maps/LocationPicker.client"
import { shouldShowEditAction, toPermissionRpcValue } from "./user-edit-permission"
import { InvitarCuentaBoton } from "@/components/cuentas/invitar-cuenta-panel"

// Roles que pueden ver el botón de llamada
const ROLES_CON_LLAMADA = ['admin', 'pastor', 'director-general', 'director-etapa']

export default function PaginaDetalleUsuario() {
  const params = useParams()
  const id = params?.id as string
  const { roles: rolesActuales } = useCurrentUser()

  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [puedeEditar, setPuedeEditar] = useState(false)

  // Verificar si el usuario actual puede llamar
  const puedeVerLlamada = rolesActuales.some(r => ROLES_CON_LLAMADA.includes(r))

  // Estado para el modal de agregar familiar
  const [mostrarModalAgregar, setMostrarModalAgregar] = useState(false)

  // Estado para el modal de confirmaci�n de borrado
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [relationToDelete, setRelationToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const recargar = async () => {
    setLoading(true)
    setError(null)
    setPuedeEditar(false)
    try {
      // Llama a la función RPC para obtener el detalle del usuario
      const supabase = createClient()

      const [{ data: userData }, { data, error: errorUsuario }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .rpc('obtener_detalle_usuario', { p_user_id: id })
          .single(),
      ])

      const authUserId = userData?.user?.id
      if (authUserId) {
        const { data: permitido, error: permisoError } = await supabase.rpc('puede_editar_usuario', {
          p_auth_id: authUserId,
          p_target_user_id: id,
        })
        if (permisoError) {
          console.error('Error verificando permisos de edición:', permisoError)
        } else {
          setPuedeEditar(shouldShowEditAction(toPermissionRpcValue(permitido)))
        }
      }

      if (errorUsuario) {
        setError("Error al cargar usuario: " + errorUsuario.message)
        setUsuario(null)
      } else if (!data) {
        setError("Usuario no encontrado")
        setUsuario(null)
      } else {
        setUsuario(data)
      }
    } catch (err: any) {
      setError("Error inesperado al cargar usuario")
      setUsuario(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleOpenConfirmationModal = (relationId: string) => {
    setRelationToDelete(relationId)
    setIsModalOpen(true)
  }

  const handleCloseConfirmationModal = () => {
    setIsModalOpen(false)
    setRelationToDelete(null)
  }

  const handleConfirmDelete = async () => {
    if (!relationToDelete) return
    setIsDeleting(true)
    try {
      console.log('Intentando borrar relación:', relationToDelete)
      const res = await deleteFamilyRelation(relationToDelete, id)
      console.log('Resultado de deleteFamilyRelation:', res)
      if (res.success) {
        toast({
          title: "Relación eliminada",
          description: "La relación familiar fue eliminada correctamente.",
          variant: "default",
        })
        recargar()
      } else {
        toast({
          title: "Error al eliminar",
          description: res.error || "No se pudo eliminar la relación.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      console.error('Error inesperado al borrar relación:', err)
      toast({
        title: "Error inesperado",
        description: err?.message || "No se pudo eliminar la relación.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setIsModalOpen(false)
      setRelationToDelete(null)
    }
  }

  // Role badges share the variants of the user list; marital status and gender stay neutral.
  const obtenerVarianteRol = (rolInterno: string): "default" | "warning" | "error" | "info" => {
    switch (rolInterno) {
      case 'admin':
      case 'pastor':
        return 'error'
      case 'director-general':
      case 'director-etapa':
        return 'warning'
      case 'lider':
        return 'info'
      default:
        return 'default'
    }
  }

  const formatearFecha = (fecha: string) => {
    if (!fecha) return 'No especificada'
    const fechaObj = new Date(fecha)
    const dia = String(fechaObj.getUTCDate()).padStart(2, '0')
    const mes = String(fechaObj.getUTCMonth() + 1).padStart(2, '0')
    const anio = fechaObj.getUTCFullYear()
    return `${dia}/${mes}/${anio}`
  }

  const formatearFechaNacimiento = (fecha: string | null) => {
    if (!fecha) return 'No especificada'
    const fechaObj = new Date(fecha)
    const dia = String(fechaObj.getUTCDate()).padStart(2, '0')
    const mes = String(fechaObj.getUTCMonth() + 1).padStart(2, '0')
    const anio = fechaObj.getUTCFullYear()
    return `${dia}/${mes}/${anio}`
  }

  const formatearTelefono = (telefono: string | null) => {
    if (!telefono) return 'Sin telefono'
    return telefono
  }

  const formatearEmail = (email: string | null) => {
    if (!email) return 'Sin email'
    return email
  }

  const formatearCedula = (cedula: string | null) => {
    if (!cedula) return 'Sin cedula'
    return cedula
  }

  // Renderizado
  if (loading) {
    return (
      <PaginaSistema regreso={{ href: '/users', texto: 'Volver a Usuarios' }}>
        <div role="status" className="flex flex-col items-center justify-center gap-4 min-h-[50vh]">
          <div className="size-10 animate-spin rounded-full border-2 border-muted border-t-[var(--brand-primary)]" aria-hidden="true" />
          <p className="text-muted-foreground">Cargando datos del usuario...</p>
        </div>
      </PaginaSistema>
    )
  }

  if (error || !usuario) {
    return (
      <PaginaSistema regreso={{ href: '/users', texto: 'Volver a Usuarios' }}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <AlertTriangle className="size-12 text-danger mx-auto mb-4" aria-hidden="true" />
            <TituloSistema nivel={2}>Error al cargar datos</TituloSistema>
            <p className="text-muted-foreground mb-4">{error || 'Usuario no encontrado'}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <BotonSistema onClick={recargar} variante="primario">
                Reintentar
              </BotonSistema>
              <BotonSistema asChild variante="secundario">
                <Link href="/users">
                  Volver a Usuarios
                </Link>
              </BotonSistema>
            </div>
          </div>
        </div>
      </PaginaSistema>
    )
  }

  // Asume que la función RPC retorna un objeto con las siguientes propiedades:
  // usuario: { id, nombre, apellido, ... }
  // roles: [{ nombre_visible, nombre_interno }]
  // relaciones: [{ id, tipo_relacion, es_principal, familiar: { nombre, apellido, email, telefono, genero } }]
  // ...otros campos según tu función

  const rolUsuario = usuario.roles && usuario.roles.length > 0
    ? usuario.roles[0]
    : { nombre_visible: 'Sin rol', nombre_interno: 'sin-rol' }

  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`

  return (
    <PaginaSistema
      titulo={nombreCompleto}
      regreso={{ href: '/users', texto: 'Volver a Usuarios' }}
    >
      {/* Tarjeta Principal del Usuario - Minimalista */}
      <TarjetaSistema className="p-4">
        <div className="flex items-center gap-4">
          {/* Avatar compacto */}
          <div className="relative flex-shrink-0">
            <UserAvatar
              photoUrl={usuario.foto_perfil_url}
              nombre={usuario.nombre}
              apellido={usuario.apellido}
              size="xl"
              className="shadow-lg"
            />
            <div className="absolute -bottom-1 -right-1 size-5 bg-success rounded-full border-2 border-card" aria-hidden="true"></div>
          </div>

          {/* Información principal compacta */}
          <div className="flex-1 min-w-0">
            {/* The desktop header holds the page h1; this repeats the name for mobile. */}
            <h2 className="text-xl font-bold text-foreground truncate">
              {nombreCompleto}
            </h2>
            <p className="text-muted-foreground text-sm truncate">
              {formatearEmail(usuario.email)}
            </p>

            {/* Badges compactos */}
            <div className="flex flex-wrap gap-2 mt-2">
              <BadgeSistema variante={obtenerVarianteRol(rolUsuario.nombre_interno)} tamaño="sm">
                {rolUsuario.nombre_visible}
              </BadgeSistema>
              {usuario.estado_civil && <BadgeSistema tamaño="sm">{usuario.estado_civil}</BadgeSistema>}
              {usuario.genero && <BadgeSistema tamaño="sm">{usuario.genero}</BadgeSistema>}
            </div>
          </div>

          {/* Botones de acción compactos: icon-only on mobile, labelled from sm */}
          <div className="flex-shrink-0 flex gap-2">
            <BotonSistema asChild variante="outline" icono={BarChart3} className="max-sm:w-11 max-sm:px-0">
              <Link href={`/users/${usuario.id}/asistencia`} aria-label="Asistencia">
                <span className="hidden sm:inline">Asistencia</span>
              </Link>
            </BotonSistema>
            {puedeEditar && (
              <BotonSistema asChild variante="primario" icono={Edit} className="max-sm:w-11 max-sm:px-0">
                <Link href={`/users/${usuario.id}/edit`} aria-label="Editar">
                  <span className="hidden sm:inline">Editar</span>
                </Link>
              </BotonSistema>
            )}
          </div>
        </div>
      </TarjetaSistema>

      {/* Información Básica */}
      <SeccionDetalle titulo="Información Básica" icono={User}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <CampoDetalle etiqueta="Cédula" icono={User}>{formatearCedula(usuario.cedula)}</CampoDetalle>
          <CampoDetalle etiqueta="Fecha de Registro" icono={Clock}>{formatearFecha(usuario.fecha_registro)}</CampoDetalle>
        </div>
      </SeccionDetalle>

      {/* Información General */}
      <SeccionDetalle titulo="Información General" icono={User}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CampoDetalle etiqueta="Email" icono={Mail}>
            <span className="break-all">{formatearEmail(usuario.email)}</span>
          </CampoDetalle>
          {/* Teléfono con botón de llamada */}
          <CampoDetalle etiqueta="Teléfono" icono={Phone}>
            <span className="flex items-center gap-2">
              {formatearTelefono(usuario.telefono)}
              {puedeVerLlamada && usuario.telefono && (
                <a
                  href={`tel:${formatPhoneForCall(usuario.telefono)}`}
                  className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-full bg-success text-success-foreground shadow-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`Llamar a ${nombreCompleto}`}
                  title="Llamar"
                >
                  <PhoneCall className="size-4" aria-hidden="true" />
                </a>
              )}
            </span>
          </CampoDetalle>
          <CampoDetalle etiqueta="Fecha de Nacimiento" icono={Calendar}>{formatearFechaNacimiento(usuario.fecha_nacimiento)}</CampoDetalle>
          <CampoDetalle etiqueta="Estado Civil" icono={Heart}>{usuario.estado_civil}</CampoDetalle>
          <CampoDetalle etiqueta="Género" icono={User}>{usuario.genero}</CampoDetalle>
          <CampoDetalle etiqueta="Ocupación" icono={Briefcase}>{usuario.ocupacion?.nombre || 'Sin ocupación'}</CampoDetalle>
          <CampoDetalle etiqueta="Profesión" icono={GraduationCap}>{usuario.profesion?.nombre || 'Sin profesión'}</CampoDetalle>
        </div>
      </SeccionDetalle>

      {/* Información de Ubicación */}
      <SeccionDetalle titulo="Información de Ubicación" icono={MapPin}>
        {usuario.direccion ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <CampoDetalle etiqueta="País">{usuario.direccion?.parroquia?.municipio?.estado?.pais?.nombre || 'Sin país'}</CampoDetalle>
              <CampoDetalle etiqueta="Estado">{usuario.direccion?.parroquia?.municipio?.estado?.nombre || 'Sin estado'}</CampoDetalle>
              <CampoDetalle etiqueta="Municipio">{usuario.direccion?.parroquia?.municipio?.nombre || 'Sin municipio'}</CampoDetalle>
              <CampoDetalle etiqueta="Parroquia">{usuario.direccion?.parroquia?.nombre || 'Sin parroquia'}</CampoDetalle>
              <CampoDetalle etiqueta="Calle">{usuario.direccion?.calle || 'Sin calle'}</CampoDetalle>
              <CampoDetalle etiqueta="Barrio">{usuario.direccion?.barrio || 'Sin barrio'}</CampoDetalle>
              <CampoDetalle etiqueta="Código Postal">{usuario.direccion?.codigo_postal || 'Sin código postal'}</CampoDetalle>
              <CampoDetalle etiqueta="Referencia">{usuario.direccion?.referencia || 'Sin referencia'}</CampoDetalle>
            </div>
            {/* Mapa */}
            {typeof usuario.direccion?.latitud === 'number' && typeof usuario.direccion?.longitud === 'number' ? (
              <div className="rounded-2xl overflow-hidden border border-border">
                <LocationPicker
                  lat={usuario.direccion.latitud}
                  lng={usuario.direccion.longitud}
                  center={{ lat: usuario.direccion.latitud, lng: usuario.direccion.longitud }}
                  onLocationChange={() => { }}
                />
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-8">No hay coordenadas para mostrar el mapa.</div>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground text-center py-8">Este usuario no tiene dirección agregada.</div>
        )}
      </SeccionDetalle>

      {/* Relaciones Familiares */}
      <SeccionDetalle
        titulo="Relaciones Familiares"
        icono={Heart}
        accion={
          <BotonSistema variante="outline" icono={Users} onClick={() => setMostrarModalAgregar(true)}>
            Agregar Familiar
          </BotonSistema>
        }
      >
        {usuario.relaciones && usuario.relaciones.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {usuario.relaciones.map((relacion: any) => {
              // Determinar el tipo de relación a mostrar según el sentido
              let tipoMostrar = relacion.tipo_relacion;
              if (relacion.sentido === 'inverso') {
                // Si es inverso y no es reciproca, invertir
                const { invertirRelacion, esRelacionReciproca } = require('@/lib/config/relaciones-familiares');
                if (!esRelacionReciproca(relacion.tipo_relacion)) {
                  tipoMostrar = invertirRelacion(relacion.tipo_relacion) || relacion.tipo_relacion;
                }
              }
              const nombreFamiliar = `${relacion.familiar.nombre} ${relacion.familiar.apellido}`
              return (
                <li key={relacion.id} className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl min-h-[80px]">
                  <div className="flex-shrink-0">
                    <UserAvatar
                      photoUrl={relacion.familiar.foto_perfil_url}
                      nombre={relacion.familiar.nombre}
                      apellido={relacion.familiar.apellido}
                      size="md"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm text-muted-foreground font-medium">
                        {obtenerNombreRelacion(tipoMostrar, relacion.familiar)}
                      </p>
                      {relacion.es_principal && (
                        <span className="inline-block px-2 py-1 bg-brand-tint text-foreground text-xs rounded-full font-medium">
                          Principal
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground truncate">
                      {nombreFamiliar}
                    </p>
                    {relacion.familiar.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {relacion.familiar.email}
                      </p>
                    )}
                    {relacion.familiar.telefono && (
                      <p className="text-xs text-muted-foreground">
                        {formatearTelefono(relacion.familiar.telefono)}
                      </p>
                    )}
                  </div>
                  <BotonSistema
                    soloIcono
                    icono={Trash2}
                    variante="ghost"
                    tamaño="sm"
                    aria-label={`Eliminar relación con ${nombreFamiliar}`}
                    title="Eliminar familiar"
                    onClick={() => handleOpenConfirmationModal(relacion.id)}
                    className="hover:text-danger-text"
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center py-8">
            <Heart className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" aria-hidden="true" />
            <p className="text-muted-foreground text-lg font-medium mb-2">No hay relaciones familiares registradas</p>
            <p className="text-muted-foreground text-sm">Este usuario no tiene relaciones familiares configuradas en el sistema.</p>
            <p className="text-muted-foreground text-sm mt-2">Haz clic en &quot;Agregar Familiar&quot; para comenzar a configurar las relaciones familiares.</p>
          </div>
        )}
      </SeccionDetalle>

      {/* Acciones Rápidas */}
      <SeccionDetalle titulo="Acciones Rápidas">
        <div className="flex flex-col sm:flex-row gap-3">
          {puedeEditar && (
            <BotonSistema asChild variante="primario" icono={Edit} className="flex-1 w-full">
              <Link href={`/users/${usuario.id}/edit`}>
                Editar Perfil
              </Link>
            </BotonSistema>
          )}
          {/* T12: only when the viewer may invite and the person has no account. */}
          <div className="flex-1 empty:hidden">
            <InvitarCuentaBoton personaId={usuario.id} nombre={usuario.nombre ?? ''} />
          </div>
          <BotonSistema asChild variante="outline" icono={Users} className="flex-1 w-full">
            <Link href={`/users/${usuario.id}/familia`}>
              Ver Familia
            </Link>
          </BotonSistema>
          <BotonSistema asChild variante="outline" icono={Shield} className="flex-1 w-full">
            <Link href={`/users/${usuario.id}/ruta-crecimiento`}>
              Ruta de Crecimiento
            </Link>
          </BotonSistema>
        </div>
      </SeccionDetalle>

      {/* Modal para Agregar Familiar */}
      <AgregarFamiliarModal
        isOpen={mostrarModalAgregar}
        onClose={() => setMostrarModalAgregar(false)}
        usuarioActualId={id}
        onRelacionCreada={recargar}
      />

      {/* Modal de Confirmación para eliminar relación */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleCloseConfirmationModal}
        onConfirm={handleConfirmDelete}
        title="Confirmar Eliminación"
        message="¿Estás seguro de que deseas eliminar esta relación familiar? Esta acción no se puede deshacer."
        isLoading={isDeleting}
      />
    </PaginaSistema>
  )
}

/** A detail section: surface card with a heading row and an optional action. */
function SeccionDetalle({ titulo, icono: Icono, accion, children }: { titulo: string; icono?: LucideIcon; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <TarjetaSistema>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
          {Icono && <Icono className="size-5 text-brand" aria-hidden="true" />}
          {titulo}
        </h3>
        {accion}
      </div>
      {children}
    </TarjetaSistema>
  )
}

/** One read-only field tile inside a detail section. */
function CampoDetalle({ etiqueta, icono: Icono, children }: { etiqueta: string; icono?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 p-4 bg-muted/50 rounded-xl min-h-[80px]">
      <span className="flex items-center gap-2 text-muted-foreground text-sm">
        {Icono && <Icono className="size-5" aria-hidden="true" />} {etiqueta}
      </span>
      <span className="text-foreground">{children}</span>
    </div>
  )
}
