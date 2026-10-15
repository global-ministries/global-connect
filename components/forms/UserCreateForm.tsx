"use client"

import { useForm, Controller } from "react-hook-form"
import { useRouter } from "next/navigation"
import { createUser } from "@/lib/actions/user.actions"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { InputSistema, SelectSistema, BotonSistema, PieAccionesSistema } from "@/components/ui/sistema-diseno"
import { normalizarCedula } from "@/lib/utils/cedula"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { User, Mail, Phone, Calendar, Users } from "lucide-react"
import { AvisoFormulario } from "./aviso-formulario"
import { COLUMNAS_CAMPOS, SeccionFormulario } from "./seccion-formulario"

const userCreateSchema = z.object({
  nombre: z.string().min(2, "El nombre es requerido"),
  apellido: z.string().min(2, "El apellido es requerido"),
  cedula: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().optional(),
  fecha_nacimiento: z.string().optional(),
  genero: z.enum(["Masculino", "Femenino", "Otro"]),
  estado_civil: z.enum(["Soltero", "Casado", "Divorciado", "Viudo", "No especificado"]),
})

type UserCreateFormData = z.infer<typeof userCreateSchema>

export default function UserCreateForm() {

  const router = useRouter();
  const { success, error: errorToast } = useNotificaciones()
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, control, setValue } = useForm<UserCreateFormData>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      nombre: "",
      apellido: "",
      cedula: "",
      email: "",
      telefono: "",
      fecha_nacimiento: "",
      genero: "Masculino",
      estado_civil: "Soltero",
    }
  });

  const onSubmit = async (data: UserCreateFormData) => {
    try {
      const res = await createUser(data)

      // Validar que la respuesta tenga la estructura correcta
      if (!res || typeof res !== 'object') {
        const msg = 'Respuesta inválida del servidor. Intenta de nuevo.'
        setError("root", { message: msg })
        errorToast(msg)
        return
      }

      // Si hay error
      if (res.ok === false || res.error) {
        const msg = res.error || "No se pudo crear el usuario. Intenta de nuevo."
        const lower = String(msg).toLowerCase()
        if (lower.includes('email')) setError('email', { message: msg })
        if (lower.includes('cédula') || lower.includes('cedula')) setError('cedula', { message: msg })
        setError("root", { message: msg })
        errorToast(msg)
        return
      }

      // Si fue exitoso, extraer y validar el ID
      if (res.ok !== true) {
        const msg = 'Respuesta del servidor sin estado de éxito. Intenta de nuevo.'
        setError("root", { message: msg })
        errorToast(msg)
        return
      }

      const idStr = String(res.id || '').trim()
      const esUUID = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

      if (!idStr || !esUUID(idStr)) {
        const msg = 'No se pudo obtener el ID del nuevo usuario. Intenta nuevamente.'
        setError('root', { message: msg })
        errorToast(msg)
        return
      }

      success('Usuario creado correctamente')
      router.push(`/users/${idStr}/edit`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado al crear usuario"
      setError("root", { message: msg });
      errorToast(msg)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <SeccionFormulario titulo="Información Personal" icono={User}>
        <div className={COLUMNAS_CAMPOS[2]}>
          <InputSistema
            label="Nombre *"
            placeholder="Nombre"
            icono={User}
            error={errors.nombre?.message}
            {...register("nombre")}
          />

          <InputSistema
            label="Apellido *"
            placeholder="Apellido"
            error={errors.apellido?.message}
            {...register("apellido")}
          />

          <InputSistema
            label="Cédula"
            placeholder="Número de cédula"
            {...register("cedula", {
              onBlur: (e) => setValue("cedula", normalizarCedula(e.target.value) ?? "", { shouldDirty: true }),
            })}
          />

          <InputSistema
            label="Fecha de Nacimiento"
            type="date"
            icono={Calendar}
            {...register("fecha_nacimiento")}
          />
        </div>
      </SeccionFormulario>

      <SeccionFormulario titulo="Contacto" icono={Mail}>
        <div className={COLUMNAS_CAMPOS[2]}>
          <InputSistema
            label="Email"
            type="email"
            placeholder="correo@ejemplo.com"
            icono={Mail}
            error={errors.email?.message}
            {...register("email")}
          />

          <InputSistema
            label="Teléfono"
            placeholder="Número de teléfono"
            icono={Phone}
            {...register("telefono")}
          />
        </div>
      </SeccionFormulario>

      <SeccionFormulario titulo="Información Adicional" icono={Users}>
        <div className={COLUMNAS_CAMPOS[2]}>
          <Controller
            name="genero"
            control={control}
            render={({ field }) => (
              <SelectSistema
                label="Género *"
                placeholder="Selecciona el género"
                value={field.value}
                onValueChange={field.onChange}
                error={errors.genero?.message}
                opciones={[
                  { valor: "Masculino", etiqueta: "Masculino" },
                  { valor: "Femenino", etiqueta: "Femenino" },
                  { valor: "Otro", etiqueta: "Otro" },
                ]}
              />
            )}
          />

          <Controller
            name="estado_civil"
            control={control}
            render={({ field }) => (
              <SelectSistema
                label="Estado Civil *"
                placeholder="Selecciona el estado civil"
                value={field.value}
                onValueChange={field.onChange}
                error={errors.estado_civil?.message}
                opciones={[
                  { valor: "Soltero", etiqueta: "Soltero" },
                  { valor: "Casado", etiqueta: "Casado" },
                  { valor: "Divorciado", etiqueta: "Divorciado" },
                  { valor: "Viudo", etiqueta: "Viudo" },
                  { valor: "No especificado", etiqueta: "No especificado" },
                ]}
              />
            )}
          />
        </div>
      </SeccionFormulario>

      {errors.root && <AvisoFormulario tono="error">{errors.root.message}</AvisoFormulario>}

      <PieAccionesSistema fijo={false}>
        <BotonSistema
          type="submit"
          variante="primario"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creando...' : 'Crear y Continuar'}
        </BotonSistema>
      </PieAccionesSistema>
    </form>
  )
}
