"use client"

import { useState, useEffect } from "react"
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
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput"
import LocationPicker from "@/components/maps/LocationPicker.client"
import { Controller } from "react-hook-form"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateUser } from "@/lib/actions/user.actions"
import { geocodeAddress } from "@/lib/actions/location.actions"
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
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).optional(),
  
  // Información familiar (eliminada, no requerida)
  familia_id: z.string().optional(),
  familia: z.object({
    nombre: z.string().optional(),
  }).optional(),
})

type UserEditFormData = z.infer<typeof userEditSchema>

interface UserEditFormProps {
  usuario?: UsuarioDetallado // <-- debe ser opcional
  ocupaciones: { id: string; nombre: string }[]
  profesiones: { id: string; nombre: string }[]
  paises: { id: string; nombre: string }[]
  estados: { id: string; nombre: string; pais_id: string }[]
  municipios: { id: string; nombre: string; estado_id: string }[]
  parroquias: { id: string; nombre: string; municipio_id: string }[]
  esPerfil?: boolean // Nueva prop para indicar si es página de perfil
}

export function UserEditForm({ usuario, ocupaciones, profesiones, paises, estados, municipios, parroquias, esPerfil = false }: UserEditFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Obtener los IDs correctos para los selects de direcci�n
  const parroquiaObj = usuario?.direccion?.parroquia
  const municipioObj = parroquiaObj?.municipio
  const estadoObj = municipioObj?.estado
  const paisObj = estadoObj?.pais

  // Obtener los IDs actuales para selects (soportando undefined)
  const parroquia_id = parroquiaObj?.id || ""
  const municipio_id = municipioObj?.id || ""
  const estado_id = estadoObj?.id || ""
  const pais_id = paisObj?.id || ""

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    control,
  } = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      nombre: usuario?.nombre ?? "",
      apellido: usuario?.apellido ?? "",
      cedula: usuario?.cedula ?? "",
      email: usuario?.email ?? "",
      telefono: usuario?.telefono ?? "",
      fecha_nacimiento: usuario?.fecha_nacimiento ?? "",
      estado_civil: usuario?.estado_civil ?? "Soltero",
      genero: usuario?.genero ?? "Masculino",
      ocupacion_id: usuario?.ocupacion_id ?? "none",
      profesion_id: usuario?.profesion_id ?? "none",
      direccion_id: usuario?.direccion_id ?? "",
      direccion: usuario?.direccion ? {
        calle: usuario.direccion.calle,
        barrio: usuario.direccion.barrio || "",
        codigo_postal: usuario.direccion.codigo_postal || "",
        referencia: usuario.direccion.referencia || "",
        pais_id: usuario.direccion.parroquia?.municipio?.estado?.pais?.id || "",
        estado_id: usuario.direccion.parroquia?.municipio?.estado?.id || "",
        municipio_id: usuario.direccion.parroquia?.municipio?.id || "",
        parroquia_id: usuario.direccion.parroquia?.id || "none",
      } : {
        calle: "",
        barrio: "",
        codigo_postal: "",
        referencia: "",
        pais_id: "",
        estado_id: "",
        municipio_id: "",
        parroquia_id: "none",
      },
  // familia_id y familia ya no son requeridos ni usados
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
        familia: data.familia && typeof data.familia.nombre === "string"
          ? { nombre: data.familia.nombre ?? "" }
          : undefined,
      }

      console.log('📝 Datos procesados para enviar:', datosProcesados)
      console.log('🆔 ID del usuario:', usuario?.id)

      // Llamar a la Server Action
      console.log('📡 Llamando a updateUser...')
      if (usuario) {
        await updateUser(usuario.id, datosProcesados, esPerfil)
      } else {
        // Aquí debes llamar a la función para crear un usuario nuevo
        // await createUser(datosProcesados)
      }

      console.log('✅ updateUser completado exitosamente')
      // Si llegamos aquí, la actualización fue exitosa
      // Redirección condicional según el contexto
      if (esPerfil) {
        // En perfil, mostrar mensaje de éxito y redirigir al perfil
        alert('Perfil actualizado exitosamente')
        window.location.href = '/dashboard/perfil'
      } else {
        // En edición de usuario, la Server Action se encarga de la redirección
      }
      
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

  // Coordenadas iniciales para el mapa
  const latitudGuardada = usuario?.direccion?.latitud;
  const longitudGuardada = usuario?.direccion?.longitud;
  const initialLat = typeof latitudGuardada === "number" ? latitudGuardada : 10.4681;
  const initialLng = typeof longitudGuardada === "number" ? longitudGuardada : -66.8792;
  const [mapCenter, setMapCenter] = useState({ lat: initialLat, lng: initialLng });

  // Actualizar el centro del mapa cuando cambian país, estado o municipio,
  // pero solo si NO hay lat/lng guardados en la base de datos
  useEffect(() => {
    if (typeof latitudGuardada === "number" && typeof longitudGuardada === "number") {
      // Si hay coordenadas guardadas, no actualizar el centro por selects
      return;
    }
    const paisId = watch("direccion.pais_id")
    const estadoId = watch("direccion.estado_id")
    const municipioId = watch("direccion.municipio_id")

    const paisNombre = paises.find(p => p.id === paisId)?.nombre
    const estadoNombre = estados.find(e => e.id === estadoId)?.nombre
    const municipioNombre = municipios.find(m => m.id === municipioId)?.nombre

    // Construir dirección solo si hay al menos municipio, estado o país
    const partes = [municipioNombre, estadoNombre, paisNombre].filter(Boolean)
    const direccionStr = partes.join(", ")

    if (direccionStr.length > 0) {
      geocodeAddress(direccionStr).then(res => {
        if (res.success && typeof res.lat === "number" && typeof res.lng === "number") {
          setMapCenter({ lat: res.lat, lng: res.lng })
          setValue("direccion.lat", res.lat, { shouldValidate: true, shouldDirty: true })
          setValue("direccion.lng", res.lng, { shouldValidate: true, shouldDirty: true })
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch("direccion.pais_id"), watch("direccion.estado_id"), watch("direccion.municipio_id")])

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
            <Controller
              name="telefono"
              control={control}
              render={({ field }) => (
                <PhoneNumberInput
                  value={field.value || ""}
                  onChange={field.onChange}
                />
              )}
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
        {/* Fila superior: Selectores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
        </div>
        {/* Sección central: Detalles de dirección */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
          <div className="space-y-2">
            <Label htmlFor="referencia" className="text-sm font-medium text-gray-700">Referencia</Label>
            <Input
              id="referencia"
              {...register("direccion.referencia")}
              className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
              placeholder="Ingresa puntos de referencia"
            />
          </div>
        </div>
        {/* Fila inferior: Mapa y coordenadas */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <Controller
              name="direccion"
              control={control}
              render={({ field }) => {
                const lat = field.value?.lat ?? 10.4681;
                const lng = field.value?.lng ?? -66.8792;
                return (
                  <LocationPicker
                    lat={lat}
                    lng={lng}
                    center={mapCenter}
                    onLocationChange={({ lat, lng }) => {
                      field.onChange({ ...field.value, lat, lng });
                      setValue("direccion.lat", lat, { shouldValidate: true, shouldDirty: true });
                      setValue("direccion.lng", lng, { shouldValidate: true, shouldDirty: true });
                      setMapCenter({ lat, lng });
                    }}
                  />
                );
              }}
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Latitud</Label>
              <Input
                type="text"
                value={watch("direccion")?.lat ?? ''}
                disabled
                className="w-full h-11 px-4 border border-gray-300 rounded-xl bg-gray-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Longitud</Label>
              <Input
                type="text"
                value={watch("direccion")?.lng ?? ''}
                disabled
                className="w-full h-11 px-4 border border-gray-300 rounded-xl bg-gray-100"
              />
            </div>
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
