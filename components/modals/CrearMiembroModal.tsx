"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { InputSistema, SelectSistema, BotonSistema } from "@/components/ui/sistema-diseno"
import { createUser } from "@/lib/actions/user.actions"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { createClient } from "@/lib/supabase/client"

export type UsuarioMin = {
  id: string
  nombre: string
  apellido: string
  email: string | null
  genero: string
  cedula: string | null
  foto_perfil_url: string | null
}

type Genero = "Masculino" | "Femenino" | "Otro"
type EstadoCivil = "Soltero" | "Casado" | "Divorciado" | "Viudo"

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
  const [genero, setGenero] = useState<Genero>("Masculino")
  const [estadoCivil, setEstadoCivil] = useState<EstadoCivil>("Soltero")

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
      const res = await createUser({
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

      if ('ok' in res && res.ok === false) {
        const msg = ('error' in res && typeof res.error === 'string') ? res.error : 'No se pudo crear el usuario'
        setError(msg)
        errorToast(msg)
        return
      }

      if (!('ok' in res) || res.ok !== true) {
        const msg = 'Respuesta sin estado de éxito'
        setError(msg)
        errorToast(msg)
        return
      }

      const newUserId = String('id' in res ? res.id : '').trim()
      const esUUID = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
      if (!newUserId || !esUUID(newUserId)) {
        const msg = 'No se pudo obtener el ID del usuario creado'
        setError(msg)
        errorToast(msg)
        return
      }
      const supabase = createClient()
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear usuario'
      setError(msg)
      errorToast(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">Crear nuevo miembro</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputSistema label="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
            <InputSistema label="Apellido *" value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" />
            <InputSistema label="Cédula" value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de cédula" />
            <InputSistema label="Fecha de nacimiento" type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
            <InputSistema label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            <InputSistema label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Número de teléfono" />
            <SelectSistema
              label="Género *"
              value={genero}
              onValueChange={(v) => setGenero(v as Genero)}
              opciones={[
                { valor: "Masculino", etiqueta: "Masculino" },
                { valor: "Femenino", etiqueta: "Femenino" },
                { valor: "Otro", etiqueta: "Otro" },
              ]}
            />
            <SelectSistema
              label="Estado civil *"
              value={estadoCivil}
              onValueChange={(v) => setEstadoCivil(v as EstadoCivil)}
              opciones={[
                { valor: "Soltero", etiqueta: "Soltero" },
                { valor: "Casado", etiqueta: "Casado" },
                { valor: "Divorciado", etiqueta: "Divorciado" },
                { valor: "Viudo", etiqueta: "Viudo" },
              ]}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <BotonSistema type="button" variante="outline" onClick={onClose} disabled={saving}>Cancelar</BotonSistema>
            <BotonSistema type="submit" variante="primario" disabled={saving} cargando={saving}>
              Crear miembro
            </BotonSistema>
          </div>
        </form>
      </div>
    </div>
  )
}
