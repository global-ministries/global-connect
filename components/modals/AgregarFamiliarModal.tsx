
"use client"

import type { Database } from '@/lib/supabase/database.types'
// Eliminar función vacía o remanente para corregir el error de sintaxis

import { useState, useEffect } from 'react'
import { X, Search, User, Users, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { supabase } from '@/lib/supabase/client'
import { addFamilyRelation } from "@/lib/actions/user.actions"
import { CrearMiembroModal, type UsuarioMin } from '@/components/modals/CrearMiembroModal'


// Si necesitas el tipo Usuario, puedes importarlo desde donde lo tengas definido

// Tipo para los resultados de búsqueda (solo los campos que necesitamos)
export type Usuario = {
  id: string
  nombre: string
  apellido: string
  email: string
  genero: string
  cedula: string
  foto_perfil_url: string | null
}

interface AgregarFamiliarModalProps {
  isOpen: boolean
  onClose: () => void
  usuarioActualId: string
  onRelacionCreada: () => void
}

export function AgregarFamiliarModal({ 
  isOpen, 
  onClose, 
  usuarioActualId, 
  onRelacionCreada 
}: AgregarFamiliarModalProps) {
  const [terminoBusqueda, setTerminoBusqueda] = useState('')
  const [resultados, setResultados] = useState<Usuario[]>([])
  const [familiarSeleccionado, setFamiliarSeleccionado] = useState<Usuario | null>(null)
  const [tipoRelacion, setTipoRelacion] = useState<string>('')
  const [creando, setCreando] = useState(false)
  // Lista de IDs de familiares ya existentes (para deshabilitar selección)
  const [familiaresExistentes, setFamiliaresExistentes] = useState<string[]>([])
  // Modal crear miembro
  const [crearAbierto, setCrearAbierto] = useState(false)

  // Usar el cliente supabase global importado

  // Buscar usuarios (ahora incluye búsqueda por email)
  const buscarUsuarios = async () => {
    if (!terminoBusqueda || terminoBusqueda.length < 2) {
      setResultados([])
      return
    }
    setCreando(true)
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, email, genero, cedula, foto_perfil_url')
        .or(`nombre.ilike.%${terminoBusqueda}%,apellido.ilike.%${terminoBusqueda}%,cedula.ilike.%${terminoBusqueda}%,email.ilike.%${terminoBusqueda}%`)
        .neq('id', usuarioActualId)
        .limit(10)
      if (error) {
        setResultados([])
      } else {
        setResultados(data || [])
      }
    } catch {
      setResultados([])
    } finally {
      setCreando(false)
    }
  }

  // Crear relación familiar usando la Server Action
  const crearRelacion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familiarSeleccionado || !tipoRelacion) return
    setCreando(true)
    try {
        // Guardar el tipo de relación tal como lo selecciona el usuario
      const res = await addFamilyRelation({
        usuario1_id: usuarioActualId,
        usuario2_id: familiarSeleccionado.id,
          tipo_relacion: tipoRelacion,
      })
      if (res.success) {
        onRelacionCreada()
        onClose()
        setFamiliarSeleccionado(null)
        setTipoRelacion('')
        setTerminoBusqueda('')
        setResultados([])
      } else {
        alert(res.message || "Error al agregar relación")
      }
    } catch (err) {
      alert("Error inesperado al agregar relación")
    } finally {
      setCreando(false)
    }
  }

  // Cargar familiares existentes al abrir el modal
  useEffect(() => {
    const cargarFamiliares = async () => {
      if (!isOpen) return
      try {
        // Buscar relaciones donde el usuario actual es usuario1_id o usuario2_id
        const { data, error } = await supabase
          .from('relaciones_usuarios')
          .select('usuario1_id, usuario2_id')
          .or(`usuario1_id.eq.${usuarioActualId},usuario2_id.eq.${usuarioActualId}`)
        if (data) {
          // Extraer todos los IDs relacionados (el otro usuario en cada relación)
          const ids = data.map((r: any) =>
            r.usuario1_id === usuarioActualId ? r.usuario2_id : r.usuario1_id
          )
          setFamiliaresExistentes(ids)
        } else {
          setFamiliaresExistentes([])
        }
      } catch {
        setFamiliaresExistentes([])
      }
    }
    cargarFamiliares()
  }, [isOpen, usuarioActualId])

  // Buscar cuando cambie el tÃ©rmino
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      buscarUsuarios()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [terminoBusqueda])

  if (!isOpen) return null


  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Agregar Familiar</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Indicador de carga visible */}
        {creando && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-2"></div>
            <span className="text-orange-600 font-medium">Buscando...</span>
          </div>
        )}

        {/* Contenido */}
        <form onSubmit={crearRelacion}>
          <div className="p-6 space-y-6">
            {/* Búsqueda */}
            <div className="space-y-3">
              <Label htmlFor="busqueda">Buscar Usuario</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="busqueda"
                  placeholder="Buscar por nombre, apellido, cédula o correo..."
                  value={terminoBusqueda}
                  onChange={(e) => setTerminoBusqueda(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Resultados de búsqueda */}
            {terminoBusqueda.length >= 2 && !creando && resultados.length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500 mb-3">No se encontraron usuarios con ese criterio.</p>
                <Button type="button" onClick={() => setCrearAbierto(true)} className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
                  <Plus className="w-4 h-4" /> Crear nuevo miembro
                </Button>
              </div>
            )}
            {resultados.length > 0 && (
              <div className="space-y-2">
                <Label>Usuarios encontrados:</Label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {resultados.map((usuario) => {
                    const yaEsFamiliar = familiaresExistentes.includes(usuario.id)
                    return (
                      <button
                        type="button"
                        key={usuario.id}
                        onClick={() => !yaEsFamiliar && setFamiliarSeleccionado(usuario)}
                        className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                          familiarSeleccionado?.id === usuario.id
                            ? 'border-orange-500 bg-orange-50'
                            : yaEsFamiliar
                              ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                        disabled={yaEsFamiliar}
                        title={yaEsFamiliar ? 'Este usuario ya es tu familiar' : ''}
                      >
                        <UserAvatar
                          photoUrl={usuario.foto_perfil_url}
                          nombre={usuario.nombre}
                          apellido={usuario.apellido}
                          size="md"
                        />
                        <div className="text-left flex-1">
                          <p className="font-medium text-gray-800">
                            {usuario.nombre} {usuario.apellido}
                          </p>
                          <p className="text-sm text-gray-500">
                            {usuario.email} • {usuario.cedula}
                          </p>
                        </div>
                        {yaEsFamiliar && (
                          <span className="ml-2 text-xs text-orange-500 font-semibold">Ya es familiar</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tipo de relación */}
            {familiarSeleccionado && (
              <div className="space-y-3">
                <Label htmlFor="tipo-relacion">Tipo de Relación</Label>
                <Select value={tipoRelacion} onValueChange={setTipoRelacion}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el tipo de relación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="padre">Padre/Madre</SelectItem>
                    <SelectItem value="hijo">Hijo/Hija</SelectItem>
                    <SelectItem value="conyuge">Cónyuge</SelectItem>
                    <SelectItem value="hermano">Hermano/Hermana</SelectItem>
                    <SelectItem value="tutor">Tutor</SelectItem>
                    <SelectItem value="otro_familiar">Otro Familiar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Resumen */}
            {familiarSeleccionado && tipoRelacion && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <h4 className="font-semibold text-orange-800 mb-2">Resumen de la Relación:</h4>
                <p className="text-orange-700">
                  <strong>{familiarSeleccionado.nombre} {familiarSeleccionado.apellido}</strong> será tu{' '}
                  <strong>
                    {tipoRelacion === 'hijo' ? 'hijo/hija' : 
                     tipoRelacion === 'padre' ? 'padre/madre' : 
                     tipoRelacion === 'conyuge' ? 'cónyuge' : 
                     tipoRelacion === 'hermano' ? 'hermano/hermana' : 
                     tipoRelacion === 'tutor' ? 'tutor' : 'otro familiar'}
                  </strong>
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={creando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!familiarSeleccionado || !tipoRelacion || creando}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            >
              {creando ? 'Creando...' : 'Crear Relación'}
            </Button>
          </div>
        </form>
      </div>
      {/* Modal crear miembro */}
      <CrearMiembroModal
        isOpen={crearAbierto}
        onClose={() => setCrearAbierto(false)}
        onCreated={(u: UsuarioMin) => {
          // Al crear, seleccionarlo y pedir tipo de relación
          setCrearAbierto(false)
          setFamiliarSeleccionado({
            id: u.id,
            nombre: u.nombre,
            apellido: u.apellido,
            email: u.email || '',
            genero: (u.genero as any) || 'Otro',
            cedula: u.cedula || '',
            foto_perfil_url: u.foto_perfil_url,
          })
        }}
      />
    </div>
  )
}