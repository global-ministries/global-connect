"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createGroup } from "@/lib/actions/group.actions";
import { InputSistema, BotonSistema } from "@/components/ui/sistema-diseno";
import { cn } from "@/lib/utils";

// Esquema de validación con Zod
const groupCreateSchema = z.object({
  nombre: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  temporada_id: z.string().min(1, "Debes seleccionar una temporada"),
  segmento_id: z.string().min(1, "Debes seleccionar un segmento"),
  ubicacion: z.enum(["Barquisimeto", "Cabudare"], { required_error: "Selecciona una ubicación" }),
});

type GroupCreateFormData = z.infer<typeof groupCreateSchema>;

interface GroupCreateFormProps {
  temporadas: { id: string; nombre: string }[];
  segmentos: { id: string; nombre: string }[];
}

export default function GroupCreateForm({ temporadas, segmentos }: GroupCreateFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerenciaCargando, setSugerenciaCargando] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setValue,
    watch,
  } = useForm<GroupCreateFormData>({
    resolver: zodResolver(groupCreateSchema),
    defaultValues: {
      nombre: "",
      ubicacion: undefined as any,
    }
  });

  const ubicacion = watch("ubicacion");
  const temporadaId = watch("temporada_id");
  const segmentoId = watch("segmento_id");

  // Sugerir nombre cuando se tengan ubicacion, temporada y segmento
  useEffect(() => {
    const sugerir = async () => {
      if (!ubicacion || !temporadaId || !segmentoId) return;
      try {
        setSugerenciaCargando(true);
        const qs = new URLSearchParams({ ubicacion, temporada_id: temporadaId, segmento_id: segmentoId });
        const res = await fetch(`/api/grupos/sugerir-nombre?${qs.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.nombre) {
          setValue("nombre", data.nombre, { shouldValidate: true });
        }
      } catch (e) {
        // silenciar
      } finally {
        setSugerenciaCargando(false);
      }
    };
    sugerir();
  }, [ubicacion, temporadaId, segmentoId, setValue]);

  const handleFormSubmit = async (data: GroupCreateFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await createGroup({
        nombre: data.nombre,
        temporada_id: data.temporada_id,
        segmento_id: data.segmento_id,
      });
      if (!result?.success) {
        setError(result?.error || "No autorizado para crear el grupo");
        return;
      }
      if (result.newGroupId) {
        router.push(`/dashboard/grupos/${result.newGroupId}/edit`);
      }
    } catch (err: any) {
      setError(err.message || "Error al crear el grupo");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {/* Campos en grid para consistencia visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Campo Nombre: ocupa dos columnas en md */}
        <div className="space-y-2 md:col-span-2">
          <InputSistema
            id="nombre"
            label="Nombre del Grupo"
            placeholder="Ingresa el nombre del grupo"
            error={errors.nombre?.message}
            disabled
            {...register("nombre")}
          />
        </div>

        {/* Campo Ubicación */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Ubicación</label>
          <Controller
            name="ubicacion"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger
                  className={cn(
                    "w-full py-3 px-3 border border-gray-200 rounded-lg bg-white",
                    "focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200",
                    errors.ubicacion && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                  )}
                  aria-invalid={!!errors.ubicacion}
                >
                  <SelectValue placeholder="Selecciona ubicación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Barquisimeto">Barquisimeto</SelectItem>
                  <SelectItem value="Cabudare">Cabudare</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.ubicacion && (
            <p className="text-sm text-red-600">{errors.ubicacion.message as string}</p>
          )}
        </div>

        {/* Campo Temporada */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Temporada</label>
          <Controller
            name="temporada_id"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger
                  className={cn(
                    "w-full py-3 px-3 border border-gray-200 rounded-lg bg-white",
                    "focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200",
                    errors.temporada_id && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                  )}
                  aria-invalid={!!errors.temporada_id}
                >
                  <SelectValue placeholder="Selecciona una temporada" />
                </SelectTrigger>
                <SelectContent>
                  {temporadas.map((temporada) => (
                    <SelectItem key={temporada.id} value={temporada.id}>
                      {temporada.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.temporada_id && (
            <p className="text-sm text-red-600">{errors.temporada_id.message}</p>
          )}
        </div>

  {/* Campo Segmento */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Segmento</label>
          <Controller
            name="segmento_id"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger
                  className={cn(
                    "w-full py-3 px-3 border border-gray-200 rounded-lg bg-white",
                    "focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200",
                    errors.segmento_id && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                  )}
                  aria-invalid={!!errors.segmento_id}
                >
                  <SelectValue placeholder="Selecciona un segmento" />
                </SelectTrigger>
                <SelectContent>
                  {segmentos.map((segmento) => (
                    <SelectItem key={segmento.id} value={segmento.id}>
                      {segmento.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.segmento_id && (
            <p className="text-sm text-red-600">{errors.segmento_id.message}</p>
          )}
        </div>
      </div>

      {/* Botón de envío */}
  <div className="pt-2">
        <BotonSistema
          type="submit"
          variante="primario"
          tamaño="lg"
          className="w-full md:w-auto md:min-w-[200px] md:ml-auto md:block"
          disabled={isLoading}
          cargando={isLoading}
        >
          {isLoading || sugerenciaCargando ? "Creando..." : "Crear Grupo y Continuar"}
        </BotonSistema>
      </div>
    </form>
  );
}
