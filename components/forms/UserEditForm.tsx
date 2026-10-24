"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { User, Mail, MapPin, Briefcase, Save, X, Lightbulb, Camera } from "lucide-react"
import {
  InputSistema,
  SelectSistema,
  BotonSistema,
  PieAccionesSistema,
  SeccionesSistema,
  CamposSistema,
} from "@/components/ui/sistema-diseno"
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput"
import LocationPicker from "@/components/maps/LocationPicker.client"
import { AvisoFormulario } from "./aviso-formulario"
import { SeccionFormulario } from "./seccion-formulario"
import { updateUser } from "@/lib/actions/user.actions"
import { geocodeAddress } from "@/lib/actions/location.actions"
import { ProfilePhotoUploader } from "@/components/ui/ProfilePhotoUploader"
import type { Database } from '@/lib/supabase/database.types'
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { normalizarCedula } from "@/lib/utils/cedula"
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
  estado_civil: z.enum(["Soltero", "Casado", "Divorciado", "Viudo", "No especificado"]),
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
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
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
        router.push('/perfil')
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
      <SeccionesSistema>
        <SeccionFormulario titulo="Foto de Perfil" icono={Camera}>
          <div className="flex justify-center">
            <ProfilePhotoUploader
              currentPhotoUrl={usuario?.foto_perfil_url}
              size="lg"
              userId={usuario?.id}
              onPhotoChange={() => {
                // Foto actualizada vía ProfilePhotoUploader — no se requiere acción adicional
              }}
            />
          </div>
        </SeccionFormulario>

        <SeccionFormulario titulo="Información Básica" icono={User}>
          <CamposSistema>
            <InputSistema
              id="nombre"
              label="Nombre *"
              placeholder="Ingresa el nombre"
              autoComplete="given-name"
              error={errors.nombre?.message}
              {...register("nombre")}
            />

            <InputSistema
              id="apellido"
              label="Apellido *"
              placeholder="Ingresa el apellido"
              autoComplete="family-name"
              error={errors.apellido?.message}
              {...register("apellido")}
            />

            <InputSistema
              id="cedula"
              label="Cédula"
              placeholder="Ingresa la cédula"
              autoComplete="off"
              error={errors.cedula?.message}
              {...register("cedula", {
                onBlur: (e) => setValue("cedula", normalizarCedula(e.target.value) ?? "", { shouldDirty: true }),
              })}
            />

            <InputSistema
              id="fecha_nacimiento"
              label="Fecha de Nacimiento"
              type="date"
              autoComplete="bday"
              error={errors.fecha_nacimiento?.message}
              {...register("fecha_nacimiento")}
            />

            <SelectSistema
              id="genero"
              name="genero"
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
              id="estado_civil"
              name="estado_civil"
              label="Estado Civil"
              value={watch("estado_civil")}
              onValueChange={(value) => setValue("estado_civil", value as "Soltero" | "Casado" | "Divorciado" | "Viudo" | "No especificado")}
              error={errors.estado_civil?.message}
              opciones={[
                { valor: "Soltero", etiqueta: "Soltero" },
                { valor: "Casado", etiqueta: "Casado" },
                { valor: "Divorciado", etiqueta: "Divorciado" },
                { valor: "Viudo", etiqueta: "Viudo" },
                { valor: "No especificado", etiqueta: "No especificado" },
              ]}
            />
          </CamposSistema>
        </SeccionFormulario>

        <SeccionFormulario titulo="Información de Contacto" icono={Mail}>
          <CamposSistema>
            <InputSistema
              id="email"
              label="Email"
              type="email"
              placeholder="Ingresa el email"
              autoComplete="email"
              icono={Mail}
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="space-y-2">
              <label htmlFor="telefono" className="block text-sm font-medium text-foreground">Teléfono</label>
              <Controller
                name="telefono"
                control={control}
                render={({ field }) => (
                  <PhoneNumberInput
                    id="telefono"
                    name={field.name}
                    autoComplete="tel"
                    value={field.value || ""}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.telefono && (
                <p role="alert" className="mt-1 text-sm text-danger-text">{errors.telefono.message}</p>
              )}
            </div>
          </CamposSistema>
        </SeccionFormulario>

        <SeccionFormulario titulo="Información Profesional" icono={Briefcase}>
          <CamposSistema>
            <SelectSistema
              id="ocupacion_id"
              name="ocupacion_id"
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
              id="profesion_id"
              name="profesion_id"
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
          </CamposSistema>
        </SeccionFormulario>

        <SeccionFormulario titulo="Información de Ubicación" icono={MapPin} className="col-span-full">
          <div className="space-y-6">
            {/* Sugerencias de dirección familiar */}
            {sugerenciasDireccion.length > 0 && !usuario?.direccion?.calle && (
              <AvisoFormulario tono="info">
                <div className="flex items-start gap-3">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-medium text-foreground">
                      Sugerencias de dirección
                    </p>
                    <ul className="space-y-1">
                      {sugerenciasDireccion.map((s) => (
                        <li key={s.familiar_id}>
                          <button
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
                            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] flex-col items-start justify-center rounded-xl px-2 py-1.5 text-left text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="text-foreground">Usar dirección de {s.relacion_label} ({s.familiar_nombre})</span>
                            <span className="flex items-center gap-1 text-xs">
                              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                              {s.direccion.calle}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Si esta persona no vive en la misma dirección, ignora estas sugerencias.
                    </p>
                  </div>
                </div>
              </AvisoFormulario>
            )}

            <CamposSistema>
              <SelectSistema
                id="direccion_pais_id"
                name="direccion.pais_id"
                label="País"
                placeholder="Selecciona el país"
                value={watch("direccion.pais_id")}
                onValueChange={(value) => {
                  setValue("direccion.pais_id", value)
                  // Cascading reset: país cambia → limpiar estado, municipio, parroquia
                  setValue("direccion.estado_id", "")
                  setValue("direccion.municipio_id", "")
                  setValue("direccion.parroquia_id", "none")
                }}
                error={errors.direccion?.pais_id?.message}
                opciones={paises.map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
              />

              <SelectSistema
                id="direccion_estado_id"
                name="direccion.estado_id"
                label="Estado"
                placeholder="Selecciona el estado"
                value={watch("direccion.estado_id")}
                onValueChange={(value) => {
                  setValue("direccion.estado_id", value)
                  // Cascading reset: estado cambia → limpiar municipio, parroquia
                  setValue("direccion.municipio_id", "")
                  setValue("direccion.parroquia_id", "none")
                }}
                disabled={!watch("direccion.pais_id")}
                error={errors.direccion?.estado_id?.message}
                opciones={estados
                  .filter(e => !watch("direccion.pais_id") || e.pais_id === watch("direccion.pais_id"))
                  .map((e) => ({ valor: e.id, etiqueta: e.nombre }))}
              />

              <SelectSistema
                id="direccion_municipio_id"
                name="direccion.municipio_id"
                label="Municipio"
                placeholder="Selecciona el municipio"
                value={watch("direccion.municipio_id")}
                onValueChange={(value) => {
                  setValue("direccion.municipio_id", value)
                  // Cascading reset: municipio cambia → limpiar parroquia
                  setValue("direccion.parroquia_id", "none")
                }}
                disabled={!watch("direccion.estado_id")}
                error={errors.direccion?.municipio_id?.message}
                opciones={municipios
                  .filter(m => !watch("direccion.estado_id") || m.estado_id === watch("direccion.estado_id"))
                  .map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
              />

              <SelectSistema
                id="direccion_parroquia_id"
                name="direccion.parroquia_id"
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

              <InputSistema
                id="direccion_calle"
                label="Calle *"
                placeholder="Ingresa la calle"
                autoComplete="address-line1"
                error={errors.direccion?.calle?.message}
                {...register("direccion.calle")}
              />

              <InputSistema
                id="direccion_barrio"
                label="Barrio"
                placeholder="Ingresa el barrio"
                autoComplete="address-line2"
                {...register("direccion.barrio")}
              />

              <InputSistema
                id="direccion_codigo_postal"
                label="Código Postal"
                placeholder="Ingresa el código postal"
                autoComplete="postal-code"
                {...register("direccion.codigo_postal")}
              />

              <InputSistema
                id="direccion_referencia"
                label="Referencia"
                placeholder="Ingresa puntos de referencia"
                autoComplete="off"
                {...register("direccion.referencia")}
              />

              {/* El mapa ocupa toda la fila; las coordenadas siguen como campos */}
              <div className="col-span-full overflow-hidden rounded-xl">
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

              <InputSistema
                id="direccion_latitud"
                name="direccion.lat"
                label="Latitud"
                type="text"
                value={String(watch("direccion")?.lat ?? '')}
                disabled
              />
              <InputSistema
                id="direccion_longitud"
                name="direccion.lng"
                label="Longitud"
                type="text"
                value={String(watch("direccion")?.lng ?? '')}
                disabled
              />
            </CamposSistema>
          </div>
        </SeccionFormulario>
      </SeccionesSistema>

      {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}

      <PieAccionesSistema fijo={false}>
        <BotonSistema
          type="button"
          variante="outline"
          icono={X}
          onClick={() => window.history.back()}
          disabled={loading}
        >
          Cancelar
        </BotonSistema>

        <BotonSistema
          type="submit"
          variante="primario"
          icono={Save}
          cargando={loading}
        >
          Guardar Cambios
        </BotonSistema>
      </PieAccionesSistema>
    </form>
  )
}
