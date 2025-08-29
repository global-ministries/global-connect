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
  Clock,
  Trash2
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { obtenerNombreRelacion, obtenerColorRelacion } from "@/lib/config/relaciones-familiares"
import { AgregarFamiliarModal } from '@/components/modals/AgregarFamiliarModal'
import { ConfirmationModal } from "@/components/modals/ConfirmationModal"
import { supabase } from "@/lib/supabase/client"
import { deleteFamilyRelation } from "@/lib/actions/user.actions"

export default function PaginaDetalleUsuario() {
  const params = useParams()
  const id = params.id as string

  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      // Llama a la funci�n RPC para obtener el detalle del usuario
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
      await deleteFamilyRelation(relationToDelete, id)
      setIsModalOpen(false)
      setRelationToDelete(null)
      setIsDeleting(false)
      recargar()
    } catch (err) {
      setIsDeleting(false)
      setIsModalOpen(false)
      setRelationToDelete(null)
    }
  }

  const obtenerIniciales = (nombre: string, apellido: string) => {
    return `${nombre?.charAt(0) ?? ""}${apellido?.charAt(0) ?? ""}`.toUpperCase()
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
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
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
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
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
        return 'bg-gray-100 text-gray-700'
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
    if (!telefono) return 'Sin tel�fono'
    return telefono
  }

  const formatearEmail = (email: string | null) => {
    if (!email) return 'Sin email'
    return email
  }

  const formatearCedula = (cedula: string | null) => {
    if (!cedula) return 'Sin c�dula'
    return cedula
  }

  // Renderizado
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
          <div className="text-red-500 text-6xl mb-4">??</div>
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

  // Asume que la funci�n RPC retorna un objeto con las siguientes propiedades:
  // usuario: { id, nombre, apellido, ... }
  // roles: [{ nombre_visible, nombre_interno }]
  // relaciones: [{ id, tipo_relacion, es_principal, familiar: { nombre, apellido, email, telefono, genero } }]
  // ...otros campos seg�n tu funci�n

  const rolUsuario = usuario.roles && usuario.roles.length > 0
    ? usuario.roles[0]
    : { nombre_visible: 'Sin rol', nombre_interno: 'sin-rol' }

  return (
    <div className="space-y-6">
      {/* Bot�n de Regreso */}
      <div>
        <Link 
          href="/dashboard/users"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Usuarios
        </Link>
      </div>

      {/* Informaci�n Principal del Usuario */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 lg:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-xl">
            {obtenerIniciales(usuario.nombre, usuario.apellido)}
          </div>

          {/* Informaci�n Principal */}
          <div className="flex-1">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  {usuario.nombre} {usuario.apellido}
                </h1>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(rolUsuario.nombre_interno)}`}>
                    {rolUsuario.nombre_visible}
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

      {/* Informaci�n B�sica */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Informaci�n B�sica
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Hash className="w-5 h-5" /> ID de Usuario
            </span>
            <span className="font-mono text-gray-800 text-base break-all">{usuario.id}</span>
          </div>
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <User className="w-5 h-5" /> C�dula
            </span>
            <span className="text-gray-800">{formatearCedula(usuario.cedula)}</span>
          </div>
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Clock className="w-5 h-5" /> Fecha de Registro
            </span>
            <span className="text-gray-800">{formatearFecha(usuario.fecha_registro)}</span>
          </div>
        </div>
      </div>

      {/* Informaci�n de Contacto */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Mail className="w-5 h-5 text-orange-500" />
          Informaci�n de Contacto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Mail className="w-5 h-5" /> Email
            </span>
            <span className="text-gray-800 break-all">{formatearEmail(usuario.email)}</span>
          </div>
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Phone className="w-5 h-5" /> Tel�fono
            </span>
            <span className="text-gray-800">{formatearTelefono(usuario.telefono)}</span>
          </div>
        </div>
      </div>

      {/* Informaci�n Personal */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Informaci�n Personal
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Calendar className="w-5 h-5" /> Fecha de Nacimiento
            </span>
            <span className="text-gray-800">{formatearFechaNacimiento(usuario.fecha_nacimiento)}</span>
          </div>
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Heart className="w-5 h-5" /> Estado Civil
            </span>
            <span className="text-gray-800">{usuario.estado_civil}</span>
          </div>
          <div className="flex flex-col gap-1 p-4 bg-white/70 rounded-xl min-h-[80px]">
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <User className="w-5 h-5" /> G�nero
            </span>
            <span className="text-gray-800">{usuario.genero}</span>
          </div>
        </div>
      </div>

      {/* Relaciones Familiares */}
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
        {usuario.relaciones && usuario.relaciones.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {usuario.relaciones.map((relacion: any) => {
                // Determinar el tipo de relaci�n a mostrar seg�n el sentido
                let tipoMostrar = relacion.tipo_relacion;
                if (relacion.sentido === 'inverso') {
                  // Si es inverso y no es rec�proca, invertir
                  const { invertirRelacion, esRelacionReciproca } = require('@/lib/config/relaciones-familiares');
                  if (!esRelacionReciproca(relacion.tipo_relacion)) {
                    tipoMostrar = invertirRelacion(relacion.tipo_relacion) || relacion.tipo_relacion;
                  }
                }
                return (
                  <div key={relacion.id} className="flex items-center gap-3 p-4 bg-white/70 rounded-xl min-h-[80px] group">
                    <div className={`w-10 h-10 bg-gradient-to-br ${obtenerColorRelacion(tipoMostrar)} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                      {relacion.familiar.nombre.charAt(0)}{relacion.familiar.apellido.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm text-gray-500 font-medium">
                          {obtenerNombreRelacion(tipoMostrar, relacion.familiar)}
                        </p>
                        {relacion.es_principal && (
                          <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                            Principal
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-800">
                          {relacion.familiar.nombre} {relacion.familiar.apellido}
                        </p>
                        <button
                          type="button"
                          className="ml-1 p-0 flex items-center"
                          title="Eliminar familiar"
                          onClick={() => handleOpenConfirmationModal(relacion.id)}
                        >
                          <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-600 transition-colors" />
                        </button>
                      </div>
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
                );
              })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium mb-2">No hay relaciones familiares registradas</p>
            <p className="text-gray-400 text-sm">Este usuario no tiene relaciones familiares configuradas en el sistema.</p>
            <p className="text-gray-400 text-sm mt-2">Haz clic en "Agregar Familiar" para comenzar a configurar las relaciones familiares.</p>
          </div>
        )}
      </div>

      {/* Acciones R�pidas */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6">Acciones R�pidas</h3>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href={`/dashboard/users/${usuario.id}/edit`} className="flex-1">
            <button className="w-full flex flex-col items-center justify-center p-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
              <Edit className="w-6 h-6 mb-2" />
              <span className="block font-medium">Editar Perfil</span>
            </button>
          </Link>
          <Link href={`/dashboard/users/${usuario.id}/familia`} className="flex-1">
            <button className="w-full flex flex-col items-center justify-center p-4 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105">
              <Users className="w-6 h-6 mb-2" />
              <span className="block font-medium">Ver Familia</span>
            </button>
          </Link>
          <Link href={`/dashboard/users/${usuario.id}/ruta-crecimiento`} className="flex-1">
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

      {/* Modal de Confirmaci�n para eliminar relaci�n */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleCloseConfirmationModal}
        onConfirm={handleConfirmDelete}
        title="Confirmar Eliminaci�n"
        message="�Est�s seguro de que deseas eliminar esta relaci�n familiar? Esta acci�n no se puede deshacer."
        isLoading={isDeleting}
      />
    </div>
  )
}