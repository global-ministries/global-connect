"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createSeason, updateSeason } from "@/lib/actions/season.actions"

const seasonSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  fecha_inicio: z.string().min(1, "La fecha de inicio es requerida"),
  fecha_fin: z.string().min(1, "La fecha de fin es requerida"),
  activa: z.boolean(),
})

type SeasonFormData = z.infer<typeof seasonSchema>

interface SeasonFormProps {
  initialData?: {
    id?: string
    nombre: string
    fecha_inicio: string
    fecha_fin: string
    activa: boolean
  }
}

export default function SeasonForm({ initialData }: SeasonFormProps) {
  const isEditMode = !!initialData

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm<SeasonFormData>({
    resolver: zodResolver(seasonSchema),
    defaultValues: initialData ? {
      nombre: initialData.nombre,
      fecha_inicio: initialData.fecha_inicio,
      fecha_fin: initialData.fecha_fin,
      activa: initialData.activa,
    } : {
      nombre: "",
      fecha_inicio: "",
      fecha_fin: "",
      activa: false,
    }
  })

  const activaValue = watch("activa")

  const handleFormSubmit = async (data: SeasonFormData) => {
    try {
      if (isEditMode && initialData?.id) {
        await updateSeason(initialData.id, data)
      } else {
        await createSeason(data)
      }
    } catch (error) {
      console.error("Error al guardar temporada:", error)
      // Aquí podrías manejar el error, por ejemplo, mostrando un toast
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nombre */}
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre de la Temporada *</Label>
          <Input
            id="nombre"
            {...register("nombre")}
            placeholder="Ej: Temporada 2025"
          />
          {errors.nombre && <p className="text-red-500 text-sm">{errors.nombre.message}</p>}
        </div>

        {/* Fecha de Inicio */}
        <div className="space-y-2">
          <Label htmlFor="fecha_inicio">Fecha de Inicio *</Label>
          <Input
            id="fecha_inicio"
            type="date"
            {...register("fecha_inicio")}
          />
          {errors.fecha_inicio && <p className="text-red-500 text-sm">{errors.fecha_inicio.message}</p>}
        </div>

        {/* Fecha de Fin */}
        <div className="space-y-2">
          <Label htmlFor="fecha_fin">Fecha de Fin *</Label>
          <Input
            id="fecha_fin"
            type="date"
            {...register("fecha_fin")}
          />
          {errors.fecha_fin && <p className="text-red-500 text-sm">{errors.fecha_fin.message}</p>}
        </div>

        {/* Activa */}
        <div className="space-y-2">
          <Label htmlFor="activa">¿Activa?</Label>
          <div className="flex items-center space-x-2">
            <Switch
              id="activa"
              checked={activaValue}
              onCheckedChange={(checked) => setValue("activa", checked)}
            />
            <Label htmlFor="activa" className="text-sm text-gray-600">
              {activaValue ? "Sí" : "No"}
            </Label>
          </div>
        </div>
      </div>

      {/* Botón de envío */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
        >
          {isSubmitting ? "Guardando..." : isEditMode ? "Guardar Cambios" : "Crear Temporada"}
        </Button>
      </div>
    </form>
  )
}
