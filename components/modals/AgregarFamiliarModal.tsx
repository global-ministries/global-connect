"use client"

import { useState, useEffect } from 'react'
import { X, Search, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { addFamilyRelation } from "@/lib/actions/user.actions"

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]

// Tipo para los resultados de bÃºsqueda (solo los campos que necesitamos)
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

  // Buscar usuarios (nombre, apellido, cedula, email)
  const buscarUsuarios = async () => {
    if (!terminoBusqueda || terminoBusqueda.length < 2) {
      setResultados([])
      return
    }
    try {
      // Busca por nombre, apellido, cedula o email (case-insensitive)
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, email, genero, cedula')
        .or(
          [
            `nombre.ilike.%${terminoBusqueda}%`,
            `apellido.ilike.%${terminoBusqueda}%`,
            `cedula.ilike.%${terminoBusqueda}%`,
            `email.ilike.%${terminoBusqueda}%`
          ].join(',')
        )
        .neq('id', usuarioActualId)
        .order('nombre', { ascending: true })
        .limit(15)
      if (error) {
        setResultados([])
      } else {
        setResultados(data || [])
      }
    } catch {
      setResultados([])
    }
  }

  // Crear relación familiar usando la Server Action
  const crearRelacion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familiarSeleccionado || !tipoRelacion) return
    setCreando(true)
    try {
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

  // Buscar cuando cambie el término
  useEffect(() => {
    if (!isOpen) return
    const timeoutId = setTimeout(() => {
      buscarUsuarios()
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [terminoBusqueda, isOpen])

  // Limpiar resultados al cerrar el modal
  useEffect(() => {
    if (!isOpen) {
      setResultados([])
      setTerminoBusqueda('')
      setFamiliarSeleccionado(null)
      setTipoRelacion('')
    }
  }, [isOpen])

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
        <form onSubmit={crearRelacion}>
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
                      type="button"
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
    </div>
  )
}