"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createUser } from "@/lib/actions/user.actions"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { supabase } from "@/lib/supabase/client"

export type UsuarioMin = {
  id: string
  nombre: string
  apellido: string
  email: string | null
  genero: string
  cedula: string | null
  foto_perfil_url: string | null
}

interface CrearMiembroModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (usuario: UsuarioMin) => void
}

export function CrearMiembroModal({ isOpen, onClose, onCreated }: CrearMiembroModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { success, error: errorToast } = useNotificaciones()

  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [cedula, setCedula] = useState("")
  const [email, setEmail] = useState("")
  const [telefono, setTelefono] = useState("")
  const [fechaNacimiento, setFechaNacimiento] = useState("")
  const [genero, setGenero] = useState<"Masculino" | "Femenino" | "Otro">("Masculino")
  const [estadoCivil, setEstadoCivil] = useState<"Soltero" | "Casado" | "Divorciado" | "Viudo">("Soltero")

  if (!isOpen) return null

  const reset = () => {
    setNombre("")
    setApellido("")
    setCedula("")
    setEmail("")
    setTelefono("")
    setFechaNacimiento("")
    setGenero("Masculino")
    setEstadoCivil("Soltero")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nombre || !apellido) {
      setError("Nombre y apellido son requeridos")
      return
    }
    setSaving(true)
    try {
      const res: any = await createUser({
        nombre,
        apellido,
        cedula: cedula || undefined,
        email: email || undefined,
        telefono: telefono || undefined,
        fecha_nacimiento: fechaNacimiento || undefined,
        genero,
        estado_civil: estadoCivil,
      })
      
      // Validar respuesta
      if (!res || typeof res !== 'object') {
        const msg = 'Respuesta inválida del servidor'
        setError(msg)
        errorToast(msg)
        return
      }
      
      if (res.ok === false || res.error) {
        const msg = res.error || 'No se pudo crear el usuario'
        setError(msg)
        errorToast(msg)
        return
      }
      
      if (res.ok !== true) {
        const msg = 'Respuesta sin estado de éxito'
        setError(msg)
        errorToast(msg)
        return
      }
      
      const newUserId = String(res.id || '').trim()
      const esUUID = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
      if (!newUserId || !esUUID(newUserId)) {
        const msg = 'No se pudo obtener el ID del usuario creado'
        setError(msg)
        errorToast(msg)
        return
      }
      const { data, error: qErr } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, email, genero, cedula, foto_perfil_url')
        .eq('id', newUserId)
        .maybeSingle()
      if (qErr || !data) throw new Error(qErr?.message || 'No se pudo recuperar el usuario creado')

      onCreated({
        id: data.id,
        nombre: data.nombre,
        apellido: data.apellido,
        email: data.email,
        genero: data.genero,
        cedula: data.cedula,
        foto_perfil_url: data.foto_perfil_url,
      })
      success('Miembro creado correctamente')
      reset()
      onClose()
    } catch (err: any) {
      const msg = err?.message || 'Error al crear usuario'
      setError(msg)
      errorToast(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Crear nuevo miembro</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="space-y-2">
              <Label>Apellido *</Label>
              <Input value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" />
            </div>
            <div className="space-y-2">
              <Label>Cédula</Label>
              <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de cédula" />
            </div>
            <div className="space-y-2">
              <Label>Fecha de nacimiento</Label>
              <Input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Número de teléfono" />
            </div>
            <div className="space-y-2">
              <Label>Género *</Label>
              <Select value={genero} onValueChange={(v) => setGenero(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Masculino">Masculino</SelectItem>
                  <SelectItem value="Femenino">Femenino</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado civil *</Label>
              <Select value={estadoCivil} onValueChange={(v) => setEstadoCivil(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el estado civil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Soltero">Soltero</SelectItem>
                  <SelectItem value="Casado">Casado</SelectItem>
                  <SelectItem value="Divorciado">Divorciado</SelectItem>
                  <SelectItem value="Viudo">Viudo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
              {saving ? 'Creando...' : 'Crear miembro'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
