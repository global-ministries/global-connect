"use client"

import { useState, useEffect } from 'react'
import { X, Search, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]

// Tipo para los resultados de búsqueda (solo los campos que necesitamos)
type UsuarioBusqueda = Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email' | 'genero' | 'cedula'>

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
  const [resultados, setResultados] = useState<UsuarioBusqueda[]>([])
  const [familiarSeleccionado, setFamiliarSeleccionado] = useState<UsuarioBusqueda | null>(null)
  const [tipoRelacion, setTipoRelacion] = useState<string>('')
  const [creando, setCreando] = useState(false)

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Buscar usuarios
  const buscarUsuarios = async () => {
    if (!terminoBusqueda || terminoBusqueda.length < 2) {
      setResultados([])
      return
    }

    setCreando(true)
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, email, genero, cedula')
        .or(`nombre.ilike.%${terminoBusqueda}%,apellido.ilike.%${terminoBusqueda}%,cedula.ilike.%${terminoBusqueda}%`)
        .neq('id', usuarioActualId)
        .limit(10)

      if (error) {
        console.error('Error buscando usuarios:', error)
        setResultados([])
      } else {
        setResultados(data || [])
      }
    } catch (error) {
      console.error('Error en búsqueda:', error)
      setResultados([])
    } finally {
      setCreando(false)
    }
  }

  // Crear relación familiar
  const crearRelacion = async () => {
    if (!familiarSeleccionado || !tipoRelacion) return

    setCreando(true)
    try {
      // Verificar si la relación ya existe
      const { data: relacionExistente, error: errorVerificacion } = await supabase
        .from('relaciones_usuarios')
        .select('id, tipo_relacion')
        .or(`and(usuario1_id.eq.${usuarioActualId},usuario2_id.eq.${familiarSeleccionado.id}),and(usuario1_id.eq.${familiarSeleccionado.id},usuario2_id.eq.${usuarioActualId})`)
        .maybeSingle()

      if (errorVerificacion) {
        console.error('Error verificando relación existente:', errorVerificacion)
        alert('Error al verificar si la relación ya existe')
        return
      }

      if (relacionExistente) {
        // Verificar si ya existe una relación del mismo tipo o inversa
        const tipoInverso = tipoRelacion === 'padre' ? 'hijo' : 
                           tipoRelacion === 'hijo' ? 'padre' : 
                           tipoRelacion === 'tutor' ? 'tutelado' : tipoRelacion
        
        if (relacionExistente.tipo_relacion === tipoRelacion || 
            relacionExistente.tipo_relacion === tipoInverso) {
          alert(`Ya existe una relación entre estos usuarios. No se puede crear una relación duplicada.`)
          return
        }
      }

      // Crear la relación principal
      const { error: error1 } = await supabase
        .from('relaciones_usuarios')
        .insert({
          usuario1_id: usuarioActualId,
          usuario2_id: familiarSeleccionado.id,
          tipo_relacion: tipoRelacion === 'hijo' ? 'padre' : 
                         tipoRelacion === 'padre' ? 'hijo' : 
                         tipoRelacion as any,
          es_principal: true
        })

      if (error1) {
        console.error('Error creando relación principal:', {
          code: error1.code,
          message: error1.message,
          details: error1.details,
          hint: error1.hint,
          fullError: error1
        })
        
        // Manejar errores específicos de Supabase
        if (error1.code === '23505') {
          alert('Esta relación ya existe en la base de datos')
        } else if (error1.code === '23503') {
          alert('Error de referencia: verifica que ambos usuarios existan')
        } else {
          alert(`Error al crear la relación: ${error1.message || 'Error desconocido'}`)
        }
        return
      }

      // Éxito - recargar datos y cerrar modal
      alert('Relación familiar creada exitosamente')
      onRelacionCreada()
      onClose()
      setFamiliarSeleccionado(null)
      setTipoRelacion('')
      setTerminoBusqueda('')
      setResultados([])

    } catch (error) {
      console.error('Error inesperado:', error)
      alert('Error inesperado al crear la relación')
    } finally {
      setCreando(false)
    }
  }

  // Buscar cuando cambie el término
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

        {/* Contenido */}
        <div className="p-6 space-y-6">
          {/* Búsqueda */}
          <div className="space-y-3">
            <Label htmlFor="busqueda">Buscar Usuario</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="busqueda"
                placeholder="Buscar por nombre, apellido o cédula..."
                value={terminoBusqueda}
                onChange={(e) => setTerminoBusqueda(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Resultados de búsqueda */}
          {resultados.length > 0 && (
            <div className="space-y-2">
              <Label>Usuarios encontrados:</Label>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {resultados.map((usuario) => (
                  <button
                    key={usuario.id}
                    onClick={() => setFamiliarSeleccionado(usuario)}
                    className={`w-full p-3 rounded-xl border-2 transition-all ${
                      familiarSeleccionado?.id === usuario.id
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {usuario.nombre.charAt(0)}{usuario.apellido.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800">
                          {usuario.nombre} {usuario.apellido}
                        </p>
                        <p className="text-sm text-gray-500">
                          {usuario.email} • {usuario.cedula}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
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
                {(tipoRelacion === 'hijo' || tipoRelacion === 'padre') && (
                  <span className="block text-sm text-orange-600 mt-1">
                    {tipoRelacion === 'hijo' 
                      ? '(Se guardará en la base de datos como relación padre-hijo)' 
                      : '(Se guardará en la base de datos como relación hijo-padre)'}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={creando}
          >
            Cancelar
          </Button>
          <Button
            onClick={crearRelacion}
            disabled={!familiarSeleccionado || !tipoRelacion || creando}
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
          >
            {creando ? 'Creando...' : 'Crear Relación'}
          </Button>
        </div>
      </div>
    </div>
  )
}