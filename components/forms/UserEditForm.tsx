"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  MapPin, 
  Users, 
  Briefcase, 
  GraduationCap,
  Heart,
  Hash,
  Save,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateUser } from "@/lib/actions/user.actions"
import type { Database } from '@/lib/supabase/database.types'

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]
type Direccion = Database["public"]["Tables"]["direcciones"]["Row"] & {
  parroquia?: {
    id: string
    nombre: string
    municipio?: {
      id: string
      nombre: string
      estado?: {
        id: string
        nombre: string
        pais?: {
          id: string
          nombre: string
        }
      }
    }
  }
}
type Familia = Database["public"]["Tables"]["familias"]["Row"]
type Ocupacion = Database["public"]["Tables"]["ocupaciones"]["Row"]
type Profesion = Database["public"]["Tables"]["profesiones"]["Row"]

type UsuarioDetallado = Usuario & {
  direccion?: Direccion
  familia?: Familia
  ocupacion?: Ocupacion
  profesion?: Profesion
}

// Esquema de validación para el formulario
const userEditSchema = z.object({
  // Información básica
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  apellido: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  cedula: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().optional(),
  
  // Información personal
  fecha_nacimiento: z.string().optional(),
  estado_civil: z.enum(["Soltero", "Casado", "Divorciado", "Viudo"]),
  genero: z.enum(["Masculino", "Femenino", "Otro"]),
  
  // Información profesional
  ocupacion_id: z.string().optional().or(z.literal("none")),
  profesion_id: z.string().optional().or(z.literal("none")),
  
  // Información de ubicación
  direccion_id: z.string().optional(),
  direccion: z.object({
    calle: z.string().min(1, "La calle es requerida"),
    barrio: z.string().optional(),
    codigo_postal: z.string().optional(),
    referencia: z.string().optional(),
    pais_id: z.string().optional(),
    estado_id: z.string().optional(),
    municipio_id: z.string().optional(),
    parroquia_id: z.string().optional().or(z.literal("none")),
  }).optional(),
  
  // Información familiar
  familia_id: z.string().optional(),
  familia: z.object({
    nombre: z.string().min(1, "El nombre de la familia es requerido"),
  }).optional(),
})

type UserEditFormData = z.infer<typeof userEditSchema>

interface UserEditFormProps {
  usuario: UsuarioDetallado
  ocupaciones: { id: string; nombre: string }[]
  profesiones: { id: string; nombre: string }[]
  paises: { id: string; nombre: string }[]
  estados: { id: string; nombre: string; pais_id: string }[]
  municipios: { id: string; nombre: string; estado_id: string }[]
  parroquias: { id: string; nombre: string; municipio_id: string }[]
}

export function UserEditForm({ usuario, ocupaciones, profesiones, paises, estados, municipios, parroquias }: UserEditFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
  } = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      cedula: usuario.cedula || "",
      email: usuario.email || "",
      telefono: usuario.telefono || "",
      fecha_nacimiento: usuario.fecha_nacimiento || "",
      estado_civil: usuario.estado_civil,
      genero: usuario.genero,
      ocupacion_id: usuario.ocupacion_id || "none",
      profesion_id: usuario.profesion_id || "none",
      direccion_id: usuario.direccion_id || "",
      direccion: usuario.direccion ? {
        calle: usuario.direccion.calle,
        barrio: usuario.direccion.barrio || "",
        codigo_postal: usuario.direccion.codigo_postal || "",
        referencia: usuario.direccion.referencia || "",
        pais_id: usuario.direccion.parroquia?.municipio?.estado?.pais?.id || "",
        estado_id: usuario.direccion.parroquia?.municipio?.estado?.id || "",
        municipio_id: usuario.direccion.parroquia?.municipio?.id || "",
        parroquia_id: usuario.direccion.parroquia?.id || "none",
      } : undefined,
      familia_id: usuario.familia_id || "",
      familia: usuario.familia ? {
        nombre: usuario.familia.nombre || "",
      } : undefined,
    }
  })

  const onSubmit = async (data: UserEditFormData) => {
    try {
      setLoading(true)
      setError(null)

      console.log('🚀 Iniciando envío del formulario...')
      console.log('📋 Datos del formulario:', data)
      console.log('✅ Validación del formulario exitosa')

      // Convertir "none" a undefined para campos opcionales
      const datosProcesados = {
        ...data,
        ocupacion_id: data.ocupacion_id === "none" ? undefined : data.ocupacion_id,
        profesion_id: data.profesion_id === "none" ? undefined : data.profesion_id,
        direccion: data.direccion ? {
          ...data.direccion,
          pais_id: data.direccion.pais_id || undefined,
          estado_id: data.direccion.estado_id || undefined,
          municipio_id: data.direccion.municipio_id || undefined,
          parroquia_id: data.direccion.parroquia_id === "none" ? undefined : data.direccion.parroquia_id,
        } : undefined,
      }

      console.log('📝 Datos procesados para enviar:', datosProcesados)
      console.log('🆔 ID del usuario:', usuario.id)

      // Llamar a la Server Action
      console.log('📡 Llamando a updateUser...')
      await updateUser(usuario.id, datosProcesados)

      console.log('✅ updateUser completado exitosamente')
      // Si llegamos aquí, la actualización fue exitosa
      // La Server Action se encargará de la redirección
      
    } catch (err) {
      console.error('? Error al enviar formulario:', err)
      // Elimina el log de tipo de error para evitar confusi�n
      // Mostrar el error como JSON si no es instancia de Error
      if (!(err instanceof Error)) {
        try {
          console.error('? Error (JSON):', JSON.stringify(err))
        } catch {
          console.error('? Error (no serializable):', err)
        }
      }
      console.error('? Error completo:', err)
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        setError((err as any).message)
      } else {
        setError('Error desconocido al enviar el formulario')
      }
    } finally {
      setLoading(false)
      console.log('🝝 onSubmit completado')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Información Básica */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Información Básica
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="nombre" className="text-sm font-medium text-gray-700">Nombre *</Label>
            <Input
              id="nombre"
              {...register("nombre")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el nombre"
            />
            {errors.nombre && (
              <p className="text-red-500 text-sm">{errors.nombre.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apellido" className="text-sm font-medium text-gray-700">Apellido *</Label>
            <Input
              id="apellido"
              {...register("apellido")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el apellido"
            />
            {errors.apellido && (
              <p className="text-red-500 text-sm">{errors.apellido.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cedula" className="text-sm font-medium text-gray-700">Cédula</Label>
            <Input
              id="cedula"
              {...register("cedula")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa la cédula"
            />
            {errors.cedula && (
              <p className="text-red-500 text-sm">{errors.cedula.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_nacimiento" className="text-sm font-medium text-gray-700">Fecha de Nacimiento</Label>
            <Input
              id="fecha_nacimiento"
              type="date"
              {...register("fecha_nacimiento")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
            />
            {errors.fecha_nacimiento && (
              <p className="text-red-500 text-sm">{errors.fecha_nacimiento.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="genero" className="text-sm font-medium text-gray-700">Género</Label>
            <Select onValueChange={(value) => setValue("genero", value as "Masculino" | "Femenino" | "Otro")} defaultValue={watch("genero")}>
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200">
                <SelectValue placeholder="Selecciona el género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Masculino">Masculino</SelectItem>
                <SelectItem value="Femenino">Femenino</SelectItem>
                <SelectItem value="Otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            {errors.genero && (
              <p className="text-red-500 text-sm">{errors.genero.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="estado_civil" className="text-sm font-medium text-gray-700">Estado Civil</Label>
            <Select onValueChange={(value) => setValue("estado_civil", value as "Soltero" | "Casado" | "Divorciado" | "Viudo")} defaultValue={watch("estado_civil")}>
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200">
                <SelectValue placeholder="Selecciona el estado civil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Soltero">Soltero</SelectItem>
                <SelectItem value="Casado">Casado</SelectItem>
                <SelectItem value="Divorciado">Divorciado</SelectItem>
                <SelectItem value="Viudo">Viudo</SelectItem>
              </SelectContent>
            </Select>
            {errors.estado_civil && (
              <p className="text-red-500 text-sm">{errors.estado_civil.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Mail className="w-5 h-5 text-orange-500" />
          Información de Contacto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
            <Input
              id="email"
              type="email"
              {...register("email")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el email"
            />
            {errors.email && (
              <p className="text-red-500 text-sm">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefono" className="text-sm font-medium text-gray-700">Teléfono</Label>
            <Input
              id="telefono"
              {...register("telefono")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el teléfono"
            />
            {errors.telefono && (
              <p className="text-red-500 text-sm">{errors.telefono.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Información Profesional */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-orange-500" />
          Información Profesional
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="ocupacion_id" className="text-sm font-medium text-gray-700">Ocupación</Label>
            <Select onValueChange={(value) => setValue("ocupacion_id", value)} defaultValue={watch("ocupacion_id")}>
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200">
                <SelectValue placeholder="Selecciona la ocupación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin ocupación</SelectItem>
                {ocupaciones.map((ocupacion) => (
                  <SelectItem key={ocupacion.id} value={ocupacion.id}>
                    {ocupacion.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.ocupacion_id && (
              <p className="text-red-500 text-sm">{errors.ocupacion_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="profesion_id" className="text-sm font-medium text-gray-700">Profesión</Label>
            <Select onValueChange={(value) => setValue("profesion_id", value)} defaultValue={watch("profesion_id")}>
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200">
                <SelectValue placeholder="Selecciona la profesión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin profesión</SelectItem>
                {profesiones.map((profesion) => (
                  <SelectItem key={profesion.id} value={profesion.id}>
                    {profesion.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.profesion_id && (
              <p className="text-red-500 text-sm">{errors.profesion_id.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Información de Ubicación */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          Información de Ubicación
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="pais_id" className="text-sm font-medium text-gray-700">País</Label>
            <Select onValueChange={(value) => setValue("direccion.pais_id", value)} defaultValue={watch("direccion.pais_id")}>
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200">
                <SelectValue placeholder="Selecciona el país" />
              </SelectTrigger>
              <SelectContent>
                {paises.map((pais) => (
                  <SelectItem key={pais.id} value={pais.id}>
                    {pais.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.direccion?.pais_id && (
              <p className="text-red-500 text-sm">{errors.direccion.pais_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="estado_id" className="text-sm font-medium text-gray-700">Estado</Label>
            <Select 
              onValueChange={(value) => setValue("direccion.estado_id", value)} 
              defaultValue={watch("direccion.estado_id")}
              disabled={!watch("direccion.pais_id")}
            >
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 disabled:opacity-50">
                <SelectValue placeholder="Selecciona el estado" />
              </SelectTrigger>
              <SelectContent>
                {estados
                  .filter(estado => !watch("direccion.pais_id") || estado.pais_id === watch("direccion.pais_id"))
                  .map((estado) => (
                    <SelectItem key={estado.id} value={estado.id}>
                      {estado.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.direccion?.estado_id && (
              <p className="text-red-500 text-sm">{errors.direccion.estado_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="municipio_id" className="text-sm font-medium text-gray-700">Municipio</Label>
            <Select 
              onValueChange={(value) => setValue("direccion.municipio_id", value)} 
              defaultValue={watch("direccion.municipio_id")}
              disabled={!watch("direccion.estado_id")}
            >
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 disabled:opacity-50">
                <SelectValue placeholder="Selecciona el municipio" />
              </SelectTrigger>
              <SelectContent>
                {municipios
                  .filter(municipio => !watch("direccion.estado_id") || municipio.estado_id === watch("direccion.estado_id"))
                  .map((municipio) => (
                    <SelectItem key={municipio.id} value={municipio.id}>
                      {municipio.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.direccion?.municipio_id && (
              <p className="text-red-500 text-sm">{errors.direccion.municipio_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="parroquia_id" className="text-sm font-medium text-gray-700">Parroquia</Label>
            <Select 
              onValueChange={(value) => setValue("direccion.parroquia_id", value)} 
              defaultValue={watch("direccion.parroquia_id")}
              disabled={!watch("direccion.municipio_id")}
            >
              <SelectTrigger className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 disabled:opacity-50">
                <SelectValue placeholder="Selecciona la parroquia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin parroquia</SelectItem>
                {parroquias
                  .filter(parroquia => !watch("direccion.municipio_id") || parroquia.municipio_id === watch("direccion.municipio_id"))
                  .map((parroquia) => (
                    <SelectItem key={parroquia.id} value={parroquia.id}>
                      {parroquia.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.direccion?.parroquia_id && (
              <p className="text-red-500 text-sm">{errors.direccion.parroquia_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="calle" className="text-sm font-medium text-gray-700">Calle *</Label>
            <Input
              id="calle"
              {...register("direccion.calle")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa la calle"
            />
            {errors.direccion?.calle && (
              <p className="text-red-500 text-sm">{errors.direccion.calle.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="barrio" className="text-sm font-medium text-gray-700">Barrio</Label>
            <Input
              id="barrio"
              {...register("direccion.barrio")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el barrio"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo_postal" className="text-sm font-medium text-gray-700">Código Postal</Label>
            <Input
              id="codigo_postal"
              {...register("direccion.codigo_postal")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el código postal"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3 space-y-2">
            <Label htmlFor="referencia" className="text-sm font-medium text-gray-700">Referencia</Label>
            <Input
              id="referencia"
              {...register("direccion.referencia")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa puntos de referencia"
            />
          </div>
        </div>
      </div>

      {/* Información Familiar */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-orange-500" />
          Información Familiar
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="nombre_familia" className="text-sm font-medium text-gray-700">Nombre de la Familia</Label>
            <Input
              id="nombre_familia"
              {...register("familia.nombre")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa el nombre de la familia"
            />
            {errors.familia?.nombre && (
              <p className="text-red-500 text-sm">{errors.familia.nombre.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Mensaje de Error */}
      {error && (
        <div className="backdrop-blur-2xl bg-red-50 border border-red-200 rounded-3xl p-4 shadow-2xl">
          <p className="text-red-600 text-center font-medium">{error}</p>
        </div>
      )}

      {/* Botones de Acción */}
      <div className="flex flex-col sm:flex-row gap-4 justify-end pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.history.back()}
          className="px-8 py-3 h-12 border-2 border-gray-300 hover:border-gray-400 rounded-xl transition-all duration-200 font-medium"
          disabled={loading}
        >
          <X className="w-4 h-4 mr-2" />
          Cancelar
        </Button>
        
        <Button
          type="submit"
          className="px-8 py-3 h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
          disabled={loading}
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  )
}
