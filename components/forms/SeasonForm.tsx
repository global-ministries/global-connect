"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Switch } from "@/components/ui/switch"
import {
  InputSistema,
  BotonSistema,
  PieAccionesSistema,
  SeccionesSistema,
  TarjetaSistema,
  CamposSistema,
} from "@/components/ui/sistema-diseno"
import { AvisoFormulario } from "@/components/forms/aviso-formulario"
import { createSeason, updateSeason } from "@/lib/actions/season.actions"

const seasonSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  fecha_inicio: z.string().min(1, "La fecha de inicio es requerida"),
  fecha_fin: z.string().min(1, "La fecha de fin es requerida"),
  // Only when editing: a new season is born inactive (S20 of odd/tasks/planner-gdv.md).
  activa: z.boolean().optional(),
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
 *
 * T9a de odd/tasks/planner-gdv.md (S19, S20): al crear no hay "¿Activa?" (la
 * temporada nace en planificación e inactiva; se abre publicándola desde el
 * planificador) y el servidor rechaza cambiar la cohorte o su orden; cada
 * rechazo se muestra en su campo (lib/actions/season.rules.ts).
 */
export default function SeasonForm({ initialData }: SeasonFormProps) {
  const isEditMode = !!initialData

  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, setError, watch } = useForm<SeasonFormData>({
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
    }
  })

  const activaValue = watch("activa")

  const handleFormSubmit = async (data: SeasonFormData) => {
    setErrorGeneral(null)
    try {
      const datos = { nombre: data.nombre, fecha_inicio: data.fecha_inicio, fecha_fin: data.fecha_fin }
      const resultado = isEditMode && initialData?.id
        ? await updateSeason(initialData.id, { ...datos, activa: data.activa ?? initialData.activa })
        : await createSeason(datos)
      if (!resultado) return
      if (resultado.campo) {
        setError(resultado.campo, { type: "server", message: resultado.error }, { shouldFocus: true })
      } else {
        setErrorGeneral(resultado.error)
      }
    } catch (error) {
      console.error("Error al guardar temporada:", error)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {isEditMode ? (
        <AvisoFormulario>
          La cohorte (I o II) y el orden de inicio dentro de ella no cambian: de ellos depende qué temporada se cierra al publicar desde el planificador.
        </AvisoFormulario>
      ) : (
        <AvisoFormulario tono="marca">
          La temporada se crea en planificación e inactiva.{" "}
          <Link href="/grupos-vida/planificar/nueva" className="rounded-sm font-medium underline underline-offset-2 focus-ring">
            Para planificar una nueva temporada usa el planificador
          </Link>
        </AvisoFormulario>
      )}
      {errorGeneral && <AvisoFormulario tono="error">{errorGeneral}</AvisoFormulario>}
      <SeccionesSistema>
        <TarjetaSistema className="p-4 sm:p-6">
          <CamposSistema>
            <div className="col-span-full">
              <InputSistema
                label="Nombre de la Temporada *"
                placeholder="Ej: Temporada 2025"
                error={errors.nombre?.message}
                {...register("nombre")}
              />
            </div>

            <InputSistema
              label="Fecha de Inicio *"
              type="date"
              error={errors.fecha_inicio?.message}
              {...register("fecha_inicio")}
            />

            <InputSistema
              label="Fecha de Fin *"
              type="date"
              error={errors.fecha_fin?.message}
              {...register("fecha_fin")}
            />

            {/* Activa: only when editing (a new season is born inactive) */}
            {isEditMode && (
              <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border p-4">
                <div className="space-y-0.5">
                  <label htmlFor="activa" className="block text-sm font-medium text-foreground">¿Activa?</label>
                  <p className="text-sm text-muted-foreground">
                    {activaValue ? "Sí" : "No"}
                  </p>
                </div>
                <Switch
                  id="activa"
                  checked={activaValue}
                  onCheckedChange={(checked) => setValue("activa", checked)}
                />
              </div>
            )}
          </CamposSistema>
        </TarjetaSistema>
      </SeccionesSistema>

      <PieAccionesSistema fijo={false} className="bg-transparent">
        <BotonSistema
          type="submit"
          variante="primario"
          cargando={isSubmitting}
        >
          {isEditMode ? "Guardar Cambios" : "Crear Temporada"}
        </BotonSistema>
      </PieAccionesSistema>
    </form>
  )
}
