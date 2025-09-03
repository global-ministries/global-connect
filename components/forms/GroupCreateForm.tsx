"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createGroup } from "@/lib/actions/group.actions";

// Esquema de validación con Zod
const groupCreateSchema = z.object({
  nombre: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  temporada_id: z.string().min(1, "Debes seleccionar una temporada"),
  segmento_id: z.string().min(1, "Debes seleccionar un segmento"),
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

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<GroupCreateFormData>({
    resolver: zodResolver(groupCreateSchema),
  });

  const handleFormSubmit = async (data: GroupCreateFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await createGroup(data);

      if (result.success && result.newGroupId) {
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
      {/* Campo Nombre */}
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre del Grupo</Label>
        <Input
          id="nombre"
          {...register("nombre")}
          placeholder="Ingresa el nombre del grupo"
          className="w-full"
        />
        {errors.nombre && (
          <p className="text-sm text-red-600">{errors.nombre.message}</p>
        )}
      </div>

      {/* Campo Temporada */}
      <div className="space-y-2">
        <Label htmlFor="temporada">Temporada</Label>
        <Controller
          name="temporada_id"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
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
        <Label htmlFor="segmento">Segmento</Label>
        <Controller
          name="segmento_id"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
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

      {/* Botón de envío */}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Creando..." : "Crear Grupo y Continuar"}
      </Button>
    </form>
  );
}
