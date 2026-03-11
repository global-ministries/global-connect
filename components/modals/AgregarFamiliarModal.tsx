"use client"

import type { Database } from '@/lib/supabase/database.types'

import { useState, useEffect } from 'react'
import { X, Search, User, Users, Plus } from 'lucide-react'
import { InputSistema, SelectSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { createClient } from '@/lib/supabase/client'
import { addFamilyRelation } from "@/lib/actions/user.actions"
import { CrearMiembroModal, type UsuarioMin } from '@/components/modals/CrearMiembroModal'
import { useNotificaciones } from '@/hooks/use-notificaciones'


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

  const toast = useNotificaciones()

  // Buscar usuarios
  const buscarUsuarios = async () => {
    if (!terminoBusqueda || terminoBusqueda.length < 2) {
      setResultados([])
      return
    }
    setCreando(true)
    try {
      const excluir = usuarioActualId
      const url = `/api/usuarios/buscar-para-relacion?q=${encodeURIComponent(terminoBusqueda)}&excluir=${encodeURIComponent(excluir)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`HTTP ${res.status} ${txt}`)
      }
      const data = await res.json()
      setResultados(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
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
      const res = await addFamilyRelation({
        usuario1_id: usuarioActualId,
        usuario2_id: familiarSeleccionado.id,
        tipo_relacion: tipoRelacion,
      })
      if (res.success) {
        toast.success('Relación familiar creada correctamente')
        onRelacionCreada()
        onClose()
        setFamiliarSeleccionado(null)
        setTipoRelacion('')
        setTerminoBusqueda('')
        setResultados([])
      } else {
        toast.error(res.message || 'Error al agregar relación')
      }
    } catch (err) {
      toast.error('Error inesperado al agregar relación')
    } finally {
      setCreando(false)
    }
  }

  // Cargar familiares existentes al abrir el modal
  useEffect(() => {
    const cargarFamiliares = async () => {
      if (!isOpen) return
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('relaciones_usuarios')
          .select('usuario1_id, usuario2_id')
          .or(`usuario1_id.eq.${usuarioActualId},usuario2_id.eq.${usuarioActualId}`)
        if (data) {
          const ids = data.map((r) =>
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

  // Buscar cuando cambie el término
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      buscarUsuarios()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [terminoBusqueda])

  if (!isOpen) return null

  const opcionesRelacion = [
    { valor: "padre", etiqueta: "Padre/Madre" },
    { valor: "hijo", etiqueta: "Hijo/Hija" },
    { valor: "conyuge", etiqueta: "Cónyuge" },
    { valor: "hermano", etiqueta: "Hermano/Hermana" },
    { valor: "tutor", etiqueta: "Tutor" },
    { valor: "otro_familiar", etiqueta: "Otro Familiar" },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">Agregar Familiar</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>

        {/* Indicador de carga visible */}
        {creando && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)] mr-2" />
            <span className="text-[var(--brand-primary)] font-medium">Buscando...</span>
          </div>
        )}

        {/* Contenido */}
        <form onSubmit={crearRelacion}>
          <div className="p-6 space-y-6">
            {/* Búsqueda */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                <InputSistema
                  label="Buscar Usuario"
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
                <p className="text-muted-foreground mb-3">No se encontraron usuarios con ese criterio.</p>
                <BotonSistema type="button" variante="primario" onClick={() => setCrearAbierto(true)} className="inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Crear nuevo miembro
                </BotonSistema>
              </div>
            )}
            {resultados.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Usuarios encontrados:</label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {resultados.map((usuario) => {
                    const yaEsFamiliar = familiaresExistentes.includes(usuario.id)
                    return (
                      <button
                        type="button"
                        key={usuario.id}
                        onClick={() => !yaEsFamiliar && setFamiliarSeleccionado(usuario)}
                        className={`w-full p-3 rounded-xl border-2 transition-colors flex items-center gap-3 ${familiarSeleccionado?.id === usuario.id
                          ? 'border-[var(--brand-primary)] bg-accent'
                          : yaEsFamiliar
                            ? 'border-border bg-muted opacity-60 cursor-not-allowed'
                            : 'border-border hover:border-muted-foreground'
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
                          <p className="font-medium text-foreground">
                            {usuario.nombre} {usuario.apellido}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {usuario.email} • {usuario.cedula}
                          </p>
                        </div>
                        {yaEsFamiliar && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30"
                            aria-label="Este usuario ya está relacionado como familiar/miembro"
                            title="Ya es miembro / familiar"
                          >
                            <span className="text-orange-500">●</span>
                            Ya es familiar
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tipo de relación */}
            {familiarSeleccionado && (
              <SelectSistema
                label="Tipo de Relación"
                placeholder="Selecciona el tipo de relación"
                value={tipoRelacion}
                onValueChange={setTipoRelacion}
                opciones={opcionesRelacion}
              />
            )}

            {/* Resumen */}
            {familiarSeleccionado && tipoRelacion && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                <h4 className="font-semibold text-orange-800 dark:text-orange-400 mb-2">Resumen de la Relación:</h4>
                <p className="text-orange-700 dark:text-orange-300">
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
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
            <BotonSistema type="button" variante="ghost" onClick={onClose}>
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="submit"
              variante="primario"
              disabled={!familiarSeleccionado || !tipoRelacion || creando}
              cargando={creando}
            >
              Crear Relación
            </BotonSistema>
          </div>

        </form>
      </div>

      {crearAbierto && (
        <CrearMiembroModal
          isOpen={crearAbierto}
          onClose={() => setCrearAbierto(false)}
          onCreated={(u: UsuarioMin) => {
            setCrearAbierto(false)
            setFamiliarSeleccionado({
              id: u.id,
              nombre: u.nombre,
              apellido: u.apellido,
              email: u.email || '',
              genero: u.genero || 'Otro',
              cedula: u.cedula || '',
              foto_perfil_url: u.foto_perfil_url,
            })
          }}
        />
      )}
    </div>
  )
}