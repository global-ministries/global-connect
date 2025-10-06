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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LocationPicker from "@/components/maps/LocationPicker.client";
import { updateGroup } from "@/lib/actions/group.actions";
import { toast } from "sonner";

// Esquema de validación con Zod
const groupEditSchema = z.object({
  nombre: z.string().min(1, "El nombre del grupo es requerido"),
  temporada_id: z.string().uuid("Selecciona una temporada válida"),
  segmento_id: z.string().uuid("Selecciona un segmento válido"),
  dia_reunion: z.string().optional(),
  hora_reunion: z.string().optional(),
  activo: z.boolean(),
  notas_privadas: z.string().optional(),
  direccion: z.object({
    calle: z.string().optional(),
    barrio: z.string().optional(),
    codigo_postal: z.string().optional(),
    referencia: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    parroquia_id: z.string().uuid().optional(),
  }).optional(),
});

type GroupEditFormData = z.infer<typeof groupEditSchema>;

interface GroupEditFormProps {
  grupo: any;
  temporadas: Array<{ id: string; nombre: string }>;
  segmentos: Array<{ id: string; nombre: string }>;
  paises: Array<{ id: string; nombre: string }>;
  estados: Array<{ id: string; nombre: string }>;
  municipios: Array<{ id: string; nombre: string }>;
  parroquias: Array<{ id: string; nombre: string }>;
  readOnly?: boolean;
}

export default function GroupEditForm({
  grupo,
  temporadas,
  segmentos,
  paises,
  estados,
  municipios,
  parroquias,
  readOnly = false
}: GroupEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState({
    lat: grupo.direccion?.lat || 10.4681,
    lng: grupo.direccion?.lng || -66.8792
  });

  const form = useForm<GroupEditFormData>({
    resolver: zodResolver(groupEditSchema),
    defaultValues: {
      nombre: grupo.nombre || "",
      temporada_id: grupo.temporada_id || "",
      segmento_id: grupo.segmento_id || "",
      dia_reunion: grupo.dia_reunion || "",
      hora_reunion: grupo.hora_reunion || "",
      activo: grupo.activo ?? true,
      notas_privadas: grupo.notas_privadas || "",
      direccion: {
        calle: grupo.direccion?.calle || "",
        barrio: grupo.direccion?.barrio || "",
        codigo_postal: grupo.direccion?.codigo_postal || "",
        referencia: grupo.direccion?.referencia || "",
        lat: grupo.direccion?.lat || undefined,
        lng: grupo.direccion?.lng || undefined,
        parroquia_id: grupo.direccion?.parroquia?.id || "",
      },
    },
  });

  const dias = [
    "Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"
  ];
  const horas = [
    "05:00 AM","05:30 AM","06:00 AM","06:30 AM","07:00 AM","07:30 AM",
    "08:00 AM","08:30 AM","09:00 AM","09:30 AM","10:00 AM","10:30 AM",
    "11:00 AM","11:30 AM","12:00 PM","12:30 PM","01:00 PM","01:30 PM",
    "02:00 PM","02:30 PM","03:00 PM","03:30 PM","04:00 PM","04:30 PM",
    "05:00 PM","05:30 PM","06:00 PM","06:30 PM","07:00 PM","07:30 PM",
    "08:00 PM","08:30 PM","09:00 PM","09:30 PM"
  ];

  function to12h(h?: string) {
    if (!h) return undefined;
    const trimmed = h.trim();
    const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (!m) return h;
    const hh = parseInt(m[1], 10);
    const mm = m[2];
    const ap = m[4];
    if (ap) return `${hh.toString().padStart(2, '0')}:${mm} ${ap.toUpperCase()}`;
    let hour = hh;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour.toString().padStart(2, '0')}:${mm} ${ampm}`;
  }

  const handleSubmit = async (data: GroupEditFormData) => {
    if (readOnly) {
      return; // No enviar en modo solo lectura
    }
    setIsLoading(true);
    try {
      const result = await updateGroup(grupo.id, data);

      if (result.success) {
        toast.success("Grupo actualizado exitosamente");
        router.push(`/dashboard/grupos/${grupo.id}`);
      } else {
        toast.error(result.error || "Error al actualizar el grupo");
      }
    } catch (error) {
      console.error("Error actualizando grupo:", error);
      toast.error("Error inesperado al actualizar el grupo");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* Información Básica */}
        <Card>
          <CardHeader>
            <CardTitle>Información Básica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Grupo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ingresa el nombre del grupo" {...field} disabled={readOnly || isLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="temporada_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temporada</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={readOnly || isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una temporada" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {temporadas.map((temporada) => (
                          <SelectItem key={temporada.id} value={temporada.id}>
                            {temporada.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="segmento_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Segmento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={readOnly || isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un segmento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {segmentos.map((segmento) => (
                          <SelectItem key={segmento.id} value={segmento.id}>
                            {segmento.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dia_reunion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Día de Reunión</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={to12h(field.value) || undefined} disabled={readOnly || isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un día" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {dias.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hora_reunion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora de Reunión</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={to12h(field.value) || undefined} disabled={readOnly || isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una hora" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {horas.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="activo"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Grupo Activo</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Indica si el grupo está activo y operativo
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={readOnly || isLoading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Dirección */}
        <Card>
          <CardHeader>
            <CardTitle>Dirección de Reunión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="direccion.calle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calle</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa la calle" {...field} disabled={readOnly || isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="direccion.barrio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Barrio</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa el barrio" {...field} disabled={readOnly || isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="direccion.codigo_postal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código Postal</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa el código postal" {...field} disabled={readOnly || isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="direccion.parroquia_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parroquia</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={readOnly || isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una parroquia" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {parroquias.map((parroquia) => (
                          <SelectItem key={parroquia.id} value={parroquia.id}>
                            {parroquia.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="direccion.referencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ingresa puntos de referencia"
                      className="resize-none"
                      {...field}
                      disabled={readOnly || isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Mapa */}
            <div className="space-y-2">
              <Label>Ubicación en el mapa</Label>
              <Controller
                name="direccion"
                control={form.control}
                render={({ field }) => {
                  const lat = field.value?.lat ?? mapCenter.lat;
                  const lng = field.value?.lng ?? mapCenter.lng;
                  return (
                    <LocationPicker
                      lat={lat}
                      lng={lng}
                      center={mapCenter}
                      onLocationChange={({ lat, lng }) => {
                        field.onChange({ ...field.value, lat, lng });
                        setMapCenter({ lat, lng });
                      }}
                    />
                  );
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notas Privadas */}
        <Card>
          <CardHeader>
            <CardTitle>Notas Privadas</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notas_privadas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (solo para líderes)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ingresa notas privadas sobre el grupo"
                      className="resize-none"
                      {...field}
                      disabled={readOnly || isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Botones */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/grupos/${grupo.id}`)}
            disabled={isLoading}
          >
            {readOnly ? 'Volver' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button
              type="submit"
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
              disabled={isLoading}
            >
              {isLoading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
