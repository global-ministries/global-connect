"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
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
  X,
  Lightbulb
} from "lucide-react"
import { InputSistema, SelectSistema, BotonSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput"
import LocationPicker from "@/components/maps/LocationPicker.client"
import { Label } from "@/components/ui/label"
import { updateUser } from "@/lib/actions/user.actions"
import { geocodeAddress } from "@/lib/actions/location.actions"
import { ProfilePhotoUploader } from "@/components/ui/ProfilePhotoUploader"
import type { Database } from '@/lib/supabase/database.types'
import { useNotificaciones } from "@/hooks/use-notificaciones"
import type { SugerenciaDireccionFamiliar } from "@/lib/actions/direccion-familiar.actions"

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
  genero: z.enum(["Masculino", "Femenino"]),

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

  // Información familiar
  familia_id: z.string().optional(),
  familia: z.object({
    nombre: z.string().optional(),
  }).optional(),
})

type UserEditFormData = z.infer<typeof userEditSchema>

interface UserEditFormProps {
  usuario?: UsuarioDetallado
  ocupaciones: { id: string; nombre: string }[]
  profesiones: { id: string; nombre: string }[]
  paises: { id: string; nombre: string }[]
  estados: { id: string; nombre: string; pais_id: string }[]
  municipios: { id: string; nombre: string; estado_id: string }[]
  parroquias: { id: string; nombre: string; municipio_id: string }[]
  sugerenciasDireccion?: SugerenciaDireccionFamiliar[]
  esPerfil?: boolean
}

/**
 * Formulario completo de edición de usuario.
 *
 * Usa componentes del design system (InputSistema, SelectSistema, BotonSistema,
 * TarjetaSistema) para consistencia visual, accesibilidad y dark mode.
 */
export function UserEditForm({ usuario, ocupaciones, profesiones, paises, estados, municipios, parroquias, sugerenciasDireccion = [], esPerfil = false }: UserEditFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useNotificaciones()

  // Obtener los IDs correctos para los selects de dirección
  const parroquiaObj = usuario?.direccion?.parroquia
  const municipioObj = parroquiaObj?.municipio
  const estadoObj = municipioObj?.estado
  const paisObj = estadoObj?.pais

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
      genero: usuario?.genero === "Otro" ? "Masculino" : (usuario?.genero ?? "Masculino"),
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
        lat: usuario.direccion.latitud || undefined,
        lng: usuario.direccion.longitud || undefined,
      } : {
        calle: "",
        barrio: "",
        codigo_postal: "",
        referencia: "",
        pais_id: "",
        estado_id: "",
        municipio_id: "",
        parroquia_id: "none",
        lat: undefined,
        lng: undefined,
      },
    }
  })

  const onSubmit = async (data: UserEditFormData) => {
    try {
      setLoading(true)
      setError(null)

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

      if (usuario) {
        await updateUser(usuario.id, datosProcesados, esPerfil)
      }

      if (esPerfil) {
        toast.success('Perfil actualizado exitosamente')
        window.location.href = '/perfil'
      }

    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String((err as { message: unknown }).message))
      } else {
        setError('Error desconocido al enviar el formulario')
      }
    } finally {
      setLoading(false)
    }
  }

  // Coordenadas iniciales para el mapa
  const latitudGuardada = usuario?.direccion?.latitud
  const longitudGuardada = usuario?.direccion?.longitud
  const initialLat = typeof latitudGuardada === "number" ? latitudGuardada : 10.4681
  const initialLng = typeof longitudGuardada === "number" ? longitudGuardada : -66.8792
  const [mapCenter, setMapCenter] = useState({ lat: initialLat, lng: initialLng })

  // Actualizar el centro del mapa cuando cambian país, estado o municipio
  useEffect(() => {
    if (typeof latitudGuardada === "number" && typeof longitudGuardada === "number") {
      return
    }
    const paisId = watch("direccion.pais_id")
    const estadoId = watch("direccion.estado_id")
    const municipioId = watch("direccion.municipio_id")

    const paisNombre = paises.find(p => p.id === paisId)?.nombre
    const estadoNombre = estados.find(e => e.id === estadoId)?.nombre
    const municipioNombre = municipios.find(m => m.id === municipioId)?.nombre

    if (municipioNombre?.toLowerCase() === 'iribarren') {
      const iribarrenLat = 10.078726345593038
      const iribarrenLng = -69.28487917698043
      setMapCenter({ lat: iribarrenLat, lng: iribarrenLng })
      setValue("direccion.lat", iribarrenLat, { shouldValidate: true, shouldDirty: true })
      setValue("direccion.lng", iribarrenLng, { shouldValidate: true, shouldDirty: true })
      return
    }

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
      {/* Foto de Perfil */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-[var(--brand-primary)]" />
          Foto de Perfil
        </h3>
        <div className="flex justify-center">
          <ProfilePhotoUploader
            currentPhotoUrl={usuario?.foto_perfil_url}
            size="lg"
            userId={usuario?.id}
            onPhotoChange={(newPhotoUrl) => {
              console.log('Nueva foto:', newPhotoUrl)
            }}
          />
        </div>
      </TarjetaSistema>

      {/* Información Básica */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-[var(--brand-primary)]" />
          Información Básica
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <InputSistema
            label="Nombre *"
            placeholder="Ingresa el nombre"
            error={errors.nombre?.message}
            {...register("nombre")}
          />

          <InputSistema
            label="Apellido *"
            placeholder="Ingresa el apellido"
            error={errors.apellido?.message}
            {...register("apellido")}
          />

          <InputSistema
            label="Cédula"
            placeholder="Ingresa la cédula"
            error={errors.cedula?.message}
            {...register("cedula")}
          />

          <InputSistema
            label="Fecha de Nacimiento"
            type="date"
            error={errors.fecha_nacimiento?.message}
            {...register("fecha_nacimiento")}
          />

          <SelectSistema
            label="Género"
            value={watch("genero")}
            onValueChange={(value) => setValue("genero", value as "Masculino" | "Femenino")}
            error={errors.genero?.message}
            opciones={[
              { valor: "Masculino", etiqueta: "Masculino" },
              { valor: "Femenino", etiqueta: "Femenino" },
            ]}
          />

          <SelectSistema
            label="Estado Civil"
            value={watch("estado_civil")}
            onValueChange={(value) => setValue("estado_civil", value as "Soltero" | "Casado" | "Divorciado" | "Viudo")}
            error={errors.estado_civil?.message}
            opciones={[
              { valor: "Soltero", etiqueta: "Soltero" },
              { valor: "Casado", etiqueta: "Casado" },
              { valor: "Divorciado", etiqueta: "Divorciado" },
              { valor: "Viudo", etiqueta: "Viudo" },
            ]}
          />
        </div>
      </TarjetaSistema>

      {/* Información de Contacto */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <Mail className="w-5 h-5 text-[var(--brand-primary)]" />
          Información de Contacto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <InputSistema
            label="Email"
            type="email"
            placeholder="Ingresa el email"
            icono={Mail}
            error={errors.email?.message}
            {...register("email")}
          />

          <div className="space-y-2">
            <Label htmlFor="telefono" className="text-sm font-medium text-foreground">Teléfono</Label>
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
              <p role="alert" className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.telefono.message}</p>
            )}
          </div>
        </div>
      </TarjetaSistema>

      {/* Información Profesional */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-[var(--brand-primary)]" />
          Información Profesional
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SelectSistema
            label="Ocupación"
            placeholder="Selecciona la ocupación"
            value={watch("ocupacion_id")}
            onValueChange={(value) => setValue("ocupacion_id", value)}
            error={errors.ocupacion_id?.message}
            opciones={[
              { valor: "none", etiqueta: "Sin ocupación" },
              ...ocupaciones.map((o) => ({ valor: o.id, etiqueta: o.nombre })),
            ]}
          />

          <SelectSistema
            label="Profesión"
            placeholder="Selecciona la profesión"
            value={watch("profesion_id")}
            onValueChange={(value) => setValue("profesion_id", value)}
            error={errors.profesion_id?.message}
            opciones={[
              { valor: "none", etiqueta: "Sin profesión" },
              ...profesiones.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
            ]}
          />
        </div>
      </TarjetaSistema>

      {/* Información de Ubicación */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[var(--brand-primary)]" />
          Información de Ubicación
        </h3>

        {/* Sugerencias de dirección familiar */}
        {sugerenciasDireccion.length > 0 && !usuario?.direccion?.calle && (
          <TarjetaSistema variante="outlined" className="border-blue-500/30 bg-blue-500/5 p-4 mb-6">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-medium text-foreground text-sm">
                  Sugerencias de dirección
                </p>
                {sugerenciasDireccion.map((s) => (
                  <button
                    key={s.familiar_id}
                    type="button"
                    onClick={() => {
                      setValue("direccion.calle", s.direccion.calle, { shouldDirty: true })
                      if (s.direccion.barrio) setValue("direccion.barrio", s.direccion.barrio, { shouldDirty: true })
                      if (s.direccion.codigo_postal) setValue("direccion.codigo_postal", s.direccion.codigo_postal, { shouldDirty: true })
                      if (s.direccion.referencia) setValue("direccion.referencia", s.direccion.referencia, { shouldDirty: true })
                      if (s.direccion.parroquia_id) setValue("direccion.parroquia_id", s.direccion.parroquia_id, { shouldDirty: true })
                      if (s.direccion.lat != null && s.direccion.lng != null) {
                        setValue("direccion.lat", s.direccion.lat, { shouldDirty: true })
                        setValue("direccion.lng", s.direccion.lng, { shouldDirty: true })
                        setMapCenter({ lat: s.direccion.lat, lng: s.direccion.lng })
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    <span>Usar dirección de {s.relacion_label} ({s.familiar_nombre})</span>
                    <span className="text-xs">📍 {s.direccion.calle}</span>
                  </button>
                ))}
                <p className="text-xs text-muted-foreground">
                  Si esta persona no vive en la misma dirección, ignora estas sugerencias.
                </p>
              </div>
            </div>
          </TarjetaSistema>
        )}
        {/* Fila superior: Selectores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <SelectSistema
            label="País"
            placeholder="Selecciona el país"
            value={watch("direccion.pais_id")}
            onValueChange={(value) => setValue("direccion.pais_id", value)}
            error={errors.direccion?.pais_id?.message}
            opciones={paises.map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
          />

          <SelectSistema
            label="Estado"
            placeholder="Selecciona el estado"
            value={watch("direccion.estado_id")}
            onValueChange={(value) => setValue("direccion.estado_id", value)}
            disabled={!watch("direccion.pais_id")}
            error={errors.direccion?.estado_id?.message}
            opciones={estados
              .filter(e => !watch("direccion.pais_id") || e.pais_id === watch("direccion.pais_id"))
              .map((e) => ({ valor: e.id, etiqueta: e.nombre }))}
          />

          <SelectSistema
            label="Municipio"
            placeholder="Selecciona el municipio"
            value={watch("direccion.municipio_id")}
            onValueChange={(value) => setValue("direccion.municipio_id", value)}
            disabled={!watch("direccion.estado_id")}
            error={errors.direccion?.municipio_id?.message}
            opciones={municipios
              .filter(m => !watch("direccion.estado_id") || m.estado_id === watch("direccion.estado_id"))
              .map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
          />

          <SelectSistema
            label="Parroquia"
            placeholder="Selecciona la parroquia"
            value={watch("direccion.parroquia_id")}
            onValueChange={(value) => setValue("direccion.parroquia_id", value)}
            disabled={!watch("direccion.municipio_id")}
            error={errors.direccion?.parroquia_id?.message}
            opciones={[
              { valor: "none", etiqueta: "Sin parroquia" },
              ...parroquias
                .filter(p => !watch("direccion.municipio_id") || p.municipio_id === watch("direccion.municipio_id"))
                .map((p) => ({ valor: p.id, etiqueta: p.nombre })),
            ]}
          />
        </div>

        {/* Sección central: Detalles de dirección */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <InputSistema
            label="Calle *"
            placeholder="Ingresa la calle"
            error={errors.direccion?.calle?.message}
            {...register("direccion.calle")}
          />

          <InputSistema
            label="Barrio"
            placeholder="Ingresa el barrio"
            {...register("direccion.barrio")}
          />

          <InputSistema
            label="Código Postal"
            placeholder="Ingresa el código postal"
            {...register("direccion.codigo_postal")}
          />

          <InputSistema
            label="Referencia"
            placeholder="Ingresa puntos de referencia"
            {...register("direccion.referencia")}
          />
        </div>

        {/* Fila inferior: Mapa y coordenadas */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <Controller
              name="direccion"
              control={control}
              render={({ field }) => {
                const lat = field.value?.lat ?? initialLat
                const lng = field.value?.lng ?? initialLng
                return (
                  <LocationPicker
                    lat={lat}
                    lng={lng}
                    center={mapCenter}
                    onLocationChange={({ lat, lng }) => {
                      field.onChange({ ...field.value, lat, lng })
                      setValue("direccion.lat", lat, { shouldValidate: true, shouldDirty: true })
                      setValue("direccion.lng", lng, { shouldValidate: true, shouldDirty: true })
                      setMapCenter({ lat, lng })
                    }}
                  />
                )
              }}
            />
          </div>
          <div className="flex flex-col gap-4">
            <InputSistema
              label="Latitud"
              type="text"
              value={String(watch("direccion")?.lat ?? '')}
              disabled
            />
            <InputSistema
              label="Longitud"
              type="text"
              value={String(watch("direccion")?.lng ?? '')}
              disabled
            />
          </div>
        </div>
      </TarjetaSistema>

      {/* Mensaje de Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-600 dark:text-red-400 text-center font-medium">{error}</p>
        </div>
      )}

      {/* Botones de Acción */}
      <div className="flex flex-col sm:flex-row gap-4 justify-end pt-6">
        <BotonSistema
          type="button"
          variante="outline"
          onClick={() => window.history.back()}
          disabled={loading}
        >
          <X className="w-4 h-4 mr-2" />
          Cancelar
        </BotonSistema>

        <BotonSistema
          type="submit"
          variante="primario"
          cargando={loading}
        >
          <Save className="w-4 h-4 mr-2" />
          Guardar Cambios
        </BotonSistema>
      </div>
    </form>
  )
}
