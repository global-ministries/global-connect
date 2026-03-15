"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { InputSistema, BotonSistema } from "@/components/ui/sistema-diseno"
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

/**
 * Formulario para crear o editar una temporada.
 *
 * Usa InputSistema y BotonSistema del design system para consistencia visual
 * y accesibilidad (touch targets, ARIA, dark mode).
 */
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
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nombre */}
        <InputSistema
          label="Nombre de la Temporada *"
          placeholder="Ej: Temporada 2025"
          error={errors.nombre?.message}
          {...register("nombre")}
        />

        {/* Fecha de Inicio */}
        <InputSistema
          label="Fecha de Inicio *"
          type="date"
          error={errors.fecha_inicio?.message}
          {...register("fecha_inicio")}
        />

        {/* Fecha de Fin */}
        <InputSistema
          label="Fecha de Fin *"
          type="date"
          error={errors.fecha_fin?.message}
          {...register("fecha_fin")}
        />

        {/* Activa */}
        <div className="space-y-2">
          <Label htmlFor="activa">¿Activa?</Label>
          <div className="flex items-center space-x-2">
            <Switch
              id="activa"
              checked={activaValue}
              onCheckedChange={(checked) => setValue("activa", checked)}
            />
            <Label htmlFor="activa" className="text-sm text-muted-foreground">
              {activaValue ? "Sí" : "No"}
            </Label>
          </div>
        </div>
      </div>

      {/* Botón de envío */}
      <div className="flex justify-end">
        <BotonSistema
          type="submit"
          variante="primario"
          cargando={isSubmitting}
        >
          {isEditMode ? "Guardar Cambios" : "Crear Temporada"}
        </BotonSistema>
      </div>
    </form>
  )
}
