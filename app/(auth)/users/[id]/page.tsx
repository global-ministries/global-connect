"use client"

import {
  Mail,
  Phone,
  PhoneCall,
  Calendar,
  Edit,
  Users,
  MapPin,
  User,
  Briefcase,
  GraduationCap,
  Heart,
  Shield,
  Clock,
  Trash2,
  BarChart3
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { obtenerNombreRelacion, obtenerColorRelacion } from "@/lib/config/relaciones-familiares"
import { AgregarFamiliarModal } from '@/components/modals/AgregarFamiliarModal'
import { ConfirmationModal } from "@/components/modals/ConfirmationModal"
import { createClient } from "@/lib/supabase/client"
import { deleteFamilyRelation } from "@/lib/actions/user.actions"
import { toast } from "@/components/ui/use-toast"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { formatPhoneForCall } from '@/lib/utils'
import LocationPicker from "@/components/maps/LocationPicker.client"

// Roles que pueden ver el botón de llamada
const ROLES_CON_LLAMADA = ['admin', 'pastor', 'director-general', 'director-etapa']

export default function PaginaDetalleUsuario() {
  const params = useParams()
  const id = params?.id as string
  const { roles: rolesActuales } = useCurrentUser()

  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Verificar si el usuario actual puede llamar
  const puedeVerLlamada = rolesActuales.some(r => ROLES_CON_LLAMADA.includes(r))

  // Roles que pueden editar usuarios (admin, pastor)
  const ROLES_CON_EDICION = ['admin', 'pastor']
  const puedeEditar = rolesActuales.some(r => ROLES_CON_EDICION.includes(r))

  // Estado para el modal de agregar familiar
  const [mostrarModalAgregar, setMostrarModalAgregar] = useState(false)

  // Estado para el modal de confirmaci�n de borrado
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [relationToDelete, setRelationToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const recargar = async () => {
    setLoading(true)
    setError(null)
    try {
      // Llama a la función RPC para obtener el detalle del usuario
      const supabase = createClient()
      const { data, error: errorUsuario } = await supabase
        .rpc('obtener_detalle_usuario', { p_user_id: id })
        .single()

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
        return 'bg-muted text-muted-foreground'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const obtenerColorEstadoCivil = (estadoCivil: string) => {
    switch (estadoCivil) {
      case 'Soltero':
        return 'bg-blue-100 text-blue-700'
      case 'Casado':
        return 'bg-green-100 text-green-700'
      case 'Divorciado':
        return 'bg-orange-100 text-orange-700'
      case 'Viudo':
        return 'bg-muted text-muted-foreground'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const obtenerColorGenero = (genero: string) => {
    switch (genero) {
      case 'Masculino':
        return 'bg-blue-100 text-blue-700'
      case 'Femenino':
        return 'bg-pink-100 text-pink-700'
      case 'Otro':
        return 'bg-purple-100 text-purple-700'
      default:
        return 'bg-muted text-muted-foreground'
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
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Cargando datos del usuario...</p>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  if (error || !usuario) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Error al cargar datos</TituloSistema>
              <p className="text-muted-foreground mb-4">{error || 'Usuario no encontrado'}</p>
              <div className="flex gap-3 justify-center">
                <BotonSistema onClick={recargar} variante="primario">
                  Reintentar
                </BotonSistema>
                <Link href="/users">
                  <BotonSistema variante="secundario">
                    Volver a Usuarios
                  </BotonSistema>
                </Link>
              </div>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
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

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`${usuario.nombre} ${usuario.apellido}`}
        botonRegreso={{ href: '/users', texto: 'Volver a Usuarios' }}
      >
        <div className="space-y-6">

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
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-white"></div>
              </div>

              {/* Información principal compacta */}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">
                  {usuario.nombre} {usuario.apellido}
                </h1>
                <p className="text-muted-foreground text-sm truncate">
                  {formatearEmail(usuario.email)}
                </p>

                {/* Badges compactos */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${obtenerColorRol(rolUsuario.nombre_interno)}`}>
                    {rolUsuario.nombre_visible}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${obtenerColorEstadoCivil(usuario.estado_civil)}`}>
                    {usuario.estado_civil}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${obtenerColorGenero(usuario.genero)}`}>
                    {usuario.genero}
                  </span>
                </div>
              </div>

              {/* Botones de acción compactos */}
              <div className="flex-shrink-0 flex gap-2">
                <Link href={`/users/${usuario.id}/asistencia`}>
                  <BotonSistema variante="outline" tamaño="sm" className="gap-2">
                    <BarChart3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Asistencia</span>
                  </BotonSistema>
                </Link>
                {puedeEditar && (
                  <Link href={`/users/${usuario.id}/edit`}>
                    <BotonSistema variante="primario" tamaño="sm" className="gap-2">
                      <Edit className="w-4 h-4" />
                      <span className="hidden sm:inline">Editar</span>
                    </BotonSistema>
                  </Link>
                )}
              </div>
            </div>
          </TarjetaSistema>


          {/* Información Básica */}
          <div className="backdrop-blur-2xl bg-card/50 border border-border rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-orange-500" />
              Información Básica
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <User className="w-5 h-5" /> Cédula
                </span>
                <span className="text-foreground">{formatearCedula(usuario.cedula)}</span>
              </div>
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="w-5 h-5" /> Fecha de Registro
                </span>
                <span className="text-foreground">{formatearFecha(usuario.fecha_registro)}</span>
              </div>
            </div>
          </div>

          {/* Información General */}
          <div className="backdrop-blur-2xl bg-card/50 border border-border rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-orange-500" />
              Información General
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Email */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Mail className="w-5 h-5" /> Email
                </span>
                <span className="text-foreground break-all">{formatearEmail(usuario.email)}</span>
              </div>
              {/* Teléfono con botón de llamada */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Phone className="w-5 h-5" /> Teléfono
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{formatearTelefono(usuario.telefono)}</span>
                  {puedeVerLlamada && usuario.telefono && (
                    <a
                      href={`tel:${formatPhoneForCall(usuario.telefono)}`}
                      className="inline-flex items-center justify-center p-2 bg-green-500 hover:bg-green-600 rounded-full text-white transition-colors shadow-md"
                      title="Llamar"
                    >
                      <PhoneCall className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
              {/* Fecha de Nacimiento */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="w-5 h-5" /> Fecha de Nacimiento
                </span>
                <span className="text-foreground">{formatearFechaNacimiento(usuario.fecha_nacimiento)}</span>
              </div>
              {/* Estado Civil */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Heart className="w-5 h-5" /> Estado Civil
                </span>
                <span className="text-foreground">{usuario.estado_civil}</span>
              </div>
              {/* Género */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <User className="w-5 h-5" /> Género
                </span>
                <span className="text-foreground">{usuario.genero}</span>
              </div>
              {/* Ocupación */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Briefcase className="w-5 h-5" /> Ocupación
                </span>
                <span className="text-foreground">{usuario.ocupacion?.nombre || 'Sin ocupación'}</span>
              </div>
              {/* Profesión */}
              <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <GraduationCap className="w-5 h-5" /> Profesión
                </span>
                <span className="text-foreground">{usuario.profesion?.nombre || 'Sin profesión'}</span>
              </div>
            </div>
          </div>

          {/* Información de Ubicación */}
          <div className="backdrop-blur-2xl bg-card/50 border border-border rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" />
              Información de Ubicación
            </h3>
            {usuario.direccion ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">País</span>
                    <span className="text-foreground">{usuario.direccion?.parroquia?.municipio?.estado?.pais?.nombre || 'Sin país'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Estado</span>
                    <span className="text-foreground">{usuario.direccion?.parroquia?.municipio?.estado?.nombre || 'Sin estado'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Municipio</span>
                    <span className="text-foreground">{usuario.direccion?.parroquia?.municipio?.nombre || 'Sin municipio'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Parroquia</span>
                    <span className="text-foreground">{usuario.direccion?.parroquia?.nombre || 'Sin parroquia'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Calle</span>
                    <span className="text-foreground">{usuario.direccion?.calle || 'Sin calle'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Barrio</span>
                    <span className="text-foreground">{usuario.direccion?.barrio || 'Sin barrio'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Código Postal</span>
                    <span className="text-foreground">{usuario.direccion?.codigo_postal || 'Sin código postal'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-4 bg-card/70 rounded-xl min-h-[80px]">
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">Referencia</span>
                    <span className="text-foreground">{usuario.direccion?.referencia || 'Sin referencia'}</span>
                  </div>
                </div>
                {/* Mapa */}
                <div className="mt-6">
                  {typeof usuario.direccion?.latitud === 'number' && typeof usuario.direccion?.longitud === 'number' ? (
                    <div className="rounded-xl overflow-hidden border border-border">
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
              </>
            ) : (
              <div className="text-muted-foreground text-center py-8">Este usuario no tiene dirección agregada.</div>
            )}
          </div>

          {/* Relaciones Familiares */}
          <div className="backdrop-blur-2xl bg-card/50 border border-border rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
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
            {usuario.relaciones && usuario.relaciones.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                  return (
                    <div key={relacion.id} className="flex items-center gap-3 p-4 bg-card/70 rounded-xl min-h-[80px] group">
                      <div className="flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                        <UserAvatar
                          photoUrl={relacion.familiar.foto_perfil_url}
                          nombre={relacion.familiar.nombre}
                          apellido={relacion.familiar.apellido}
                          size="md"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm text-muted-foreground font-medium">
                            {obtenerNombreRelacion(tipoMostrar, relacion.familiar)}
                          </p>
                          {relacion.es_principal && (
                            <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">
                            {relacion.familiar.nombre} {relacion.familiar.apellido}
                          </p>
                          <button
                            type="button"
                            className="ml-1 p-0 flex items-center"
                            title="Eliminar familiar"
                            onClick={() => handleOpenConfirmationModal(relacion.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-600 transition-colors" />
                          </button>
                        </div>
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Heart className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground text-lg font-medium mb-2">No hay relaciones familiares registradas</p>
                <p className="text-muted-foreground/50 text-sm">Este usuario no tiene relaciones familiares configuradas en el sistema.</p>
                <p className="text-muted-foreground/50 text-sm mt-2">Haz clic en "Agregar Familiar" para comenzar a configurar las relaciones familiares.</p>
              </div>
            )}
          </div>

          {/* Acciones Rápidas */}
          <div className="backdrop-blur-2xl bg-card/50 border border-border rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-foreground mb-6">Acciones Rápidas</h3>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {puedeEditar && (
                <Link href={`/users/${usuario.id}/edit`} className="flex-1">
                  <button className="w-full flex flex-col items-center justify-center p-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
                    <Edit className="w-6 h-6 mb-2" />
                    <span className="block font-medium">Editar Perfil</span>
                  </button>
                </Link>
              )}
              <Link href={`/users/${usuario.id}/familia`} className="flex-1">
                <button className="w-full flex flex-col items-center justify-center p-4 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
                  <Users className="w-6 h-6 mb-2" />
                  <span className="block font-medium">Ver Familia</span>
                </button>
              </Link>
              <Link href={`/users/${usuario.id}/ruta-crecimiento`} className="flex-1">
                <button className="w-full flex flex-col items-center justify-center p-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
                  <Shield className="w-6 h-6 mb-2" />
                  <span className="block font-medium">Ruta de Crecimiento</span>
                </button>
              </Link>
            </div>
          </div>

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
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}