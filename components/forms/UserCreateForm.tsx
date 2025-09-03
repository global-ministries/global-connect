"use client"

import { useForm, Controller } from "react-hook-form"
import { useRouter } from "next/navigation"
import { createUser } from "@/lib/actions/user.actions"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
      const newUserId = await createUser(data);
      if (!newUserId) {
        setError("root", { message: "No se pudo crear el usuario. Intenta de nuevo." });
        return;
      }
      router.push(`/dashboard/users/${newUserId}/edit`);
    } catch (err: any) {
      setError("root", { message: err?.message || "Error inesperado al crear usuario" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input id="nombre" {...register("nombre")} placeholder="Nombre" />
          {errors.nombre && <p className="text-red-500 text-sm">{errors.nombre.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="apellido">Apellido *</Label>
          <Input id="apellido" {...register("apellido")} placeholder="Apellido" />
          {errors.apellido && <p className="text-red-500 text-sm">{errors.apellido.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="cedula">Cédula</Label>
          <Input id="cedula" {...register("cedula")} placeholder="Cédula" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} placeholder="Email" />
          {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input id="telefono" {...register("telefono")} placeholder="Teléfono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento</Label>
          <Input id="fecha_nacimiento" type="date" {...register("fecha_nacimiento")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="genero">Género *</Label>
          <Controller
            name="genero"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="genero">
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
          {errors.genero && <p className="text-red-500 text-sm">{errors.genero.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="estado_civil">Estado Civil *</Label>
          <Controller
            name="estado_civil"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="estado_civil">
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
          {errors.estado_civil && <p className="text-red-500 text-sm">{errors.estado_civil.message}</p>}
        </div>
      </div>
      {errors.root && (
        <div className="text-red-600 text-center font-medium mb-4">{errors.root.message}</div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="px-8 py-3 h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl">
          {isSubmitting ? 'Creando...' : 'Crear y Continuar'}
        </Button>
      </div>
    </form>
  )
}
