"use client"

import { useForm, Controller } from "react-hook-form"
import { useRouter } from "next/navigation"
import { createUser } from "@/lib/actions/user.actions"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { InputSistema, BotonSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Mail, Phone, Calendar, Users } from "lucide-react"

const userCreateSchema = z.object({
  nombre: z.string().min(2, "El nombre es requerido"),
  apellido: z.string().min(2, "El apellido es requerido"),
  cedula: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().optional(),
  fecha_nacimiento: z.string().optional(),
  genero: z.enum(["Masculino", "Femenino", "Otro"]),
  estado_civil: z.enum(["Soltero", "Casado", "Divorciado", "Viudo"]),
})

type UserCreateFormData = z.infer<typeof userCreateSchema>

export default function UserCreateForm() {

  const router = useRouter();
  const { success, error: errorToast } = useNotificaciones()
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, control } = useForm<UserCreateFormData>({
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
      const res: any = await createUser(data as any)
      
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
      router.push(`/dashboard/users/${idStr}/edit`)
    } catch (err: any) {
      const msg = err?.message || "Error inesperado al crear usuario"
      setError("root", { message: msg });
      errorToast(msg)
    }
  }

  return (
    <TarjetaSistema>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Información Personal */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <User className="w-5 h-5" />
            Información Personal
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {...register("cedula")}
            />
            
            <InputSistema
              label="Fecha de Nacimiento"
              type="date"
              icono={Calendar}
              {...register("fecha_nacimiento")}
            />
          </div>
        </div>

        {/* Información de Contacto */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Contacto
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        {/* Información Adicional */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Información Adicional
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Género *
              </label>
              <Controller
                name="genero"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full py-3 px-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200">
                      <SelectValue placeholder="Selecciona el género" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Femenino">Femenino</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.genero && <p className="text-red-500 text-sm mt-1">{errors.genero.message}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado Civil *
              </label>
              <Controller
                name="estado_civil"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full py-3 px-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200">
                      <SelectValue placeholder="Selecciona el estado civil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Soltero">Soltero</SelectItem>
                      <SelectItem value="Casado">Casado</SelectItem>
                      <SelectItem value="Divorciado">Divorciado</SelectItem>
                      <SelectItem value="Viudo">Viudo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.estado_civil && <p className="text-red-500 text-sm mt-1">{errors.estado_civil.message}</p>}
            </div>
          </div>
        </div>

        {/* Error general */}
        {errors.root && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-center font-medium">{errors.root.message}</p>
          </div>
        )}

        {/* Botón de envío */}
        <div className="pt-4">
          <BotonSistema
            type="submit"
            variante="primario"
            tamaño="lg"
            disabled={isSubmitting}
            className="w-full md:w-auto md:min-w-[200px] md:ml-auto md:block"
          >
            {isSubmitting ? 'Creando...' : 'Crear y Continuar'}
          </BotonSistema>
        </div>
      </form>
    </TarjetaSistema>
  )
}
