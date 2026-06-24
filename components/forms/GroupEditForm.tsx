"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { InputSistema, SelectSistema, TextareaSistema, BotonSistema, TarjetaSistema } from "@/components/ui/sistema-diseno";
import { updateGroup } from "@/lib/actions/group.actions";
import { useNotificaciones } from "@/hooks/use-notificaciones";

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
    parroquia_id: z.string().uuid().or(z.literal("")).optional(),
  }).optional(),
});

type GroupEditFormData = z.infer<typeof groupEditSchema>;

/** Casa anfitriona asignada que se muestra como referencia del grupo */
interface CasaAnfitrionaOpcion {
  id: string;
  nombre_lugar: string;
  anfitrion_nombre: string;
}

interface GroupEditFormProps {
  grupo: {
    id: string;
    nombre: string;
    temporada_id: string;
    segmento_id: string;
    dia_reunion?: string | null;
    hora_reunion?: string | null;
    activo: boolean;
    notas_privadas?: string | null;
    casa_anfitriona_id?: string | null;
    direccion?: {
      calle?: string;
      barrio?: string;
      codigo_postal?: string;
      referencia?: string;
      lat?: number;
      lng?: number;
      parroquia?: { id: string; nombre: string } | null;
    } | null;
  };
  temporadas: Array<{ id: string; nombre: string }>;
  segmentos: Array<{ id: string; nombre: string }>;
  parroquias: Array<{ id: string; nombre: string }>;
  casasDisponibles?: CasaAnfitrionaOpcion[];
  readOnly?: boolean;
}

/**
 * Formulario de edición de grupo.
 *
 * Usa componentes del design system para consistencia visual y accesibilidad.
 * La ubicación de mapa se gestiona desde la Casa Anfitriona aprobada.
 */
export default function GroupEditForm({
  grupo,
  temporadas,
  segmentos,
  parroquias,
  casasDisponibles = [],
  readOnly = false
}: GroupEditFormProps) {
  const router = useRouter();
  const toast = useNotificaciones();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<GroupEditFormData>({
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
        lat: grupo.direccion?.lat,
        lng: grupo.direccion?.lng,
        parroquia_id: grupo.direccion?.parroquia?.id || "",
      },
    },
  });

  const selectedCasa = grupo.casa_anfitriona_id
    ? casasDisponibles.find((casa) => casa.id === grupo.casa_anfitriona_id)
    : undefined;
  const hasValidAssignedCasa = Boolean(selectedCasa);
  const assignmentHref = `/grupos-vida/casas-anfitrionas/asignar?grupoId=${encodeURIComponent(grupo.id)}`;

  const dias = [
    "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"
  ];
  const horas = [
    "05:00 AM", "05:30 AM", "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM",
    "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
    "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
    "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
    "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
    "08:00 PM", "08:30 PM", "09:00 PM", "09:30 PM"
  ];

  function to12h(h?: string | null) {
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

  const onSubmit = async (data: GroupEditFormData) => {
    if (readOnly) return;
    setIsLoading(true);
    try {
      const manualDireccion = data.direccion
        ? { ...data.direccion, lat: grupo.direccion?.lat, lng: grupo.direccion?.lng }
        : data.direccion;
      const payload: GroupEditFormData = hasValidAssignedCasa
        ? { ...data, direccion: undefined }
        : { ...data, direccion: manualDireccion };
      const result = await updateGroup(grupo.id, payload);

      if (result.success) {
        toast.success("Grupo actualizado exitosamente");
        router.push(`/grupos-vida/${grupo.id}`);
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
    <form onSubmit={handleSubmit(onSubmit, (formErrors) => {
      console.error("Errores de validación del formulario:", formErrors);
    })} className="space-y-8">
      {/* Información Básica */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6">Información Básica</h3>
        <div className="space-y-6">
          <InputSistema
            label="Nombre del Grupo"
            placeholder="Ingresa el nombre del grupo"
            error={errors.nombre?.message}
            disabled={readOnly || isLoading}
            {...register("nombre")}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              name="temporada_id"
              control={control}
              render={({ field }) => (
                <SelectSistema
                  label="Temporada"
                  placeholder="Selecciona una temporada"
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly || isLoading}
                  error={errors.temporada_id?.message}
                  opciones={temporadas.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
                />
              )}
            />

            <Controller
              name="segmento_id"
              control={control}
              render={({ field }) => (
                <SelectSistema
                  label="Segmento"
                  placeholder="Selecciona un segmento"
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly || isLoading}
                  error={errors.segmento_id?.message}
                  opciones={segmentos.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              name="dia_reunion"
              control={control}
              render={({ field }) => (
                <SelectSistema
                  label="Día de Reunión"
                  placeholder="Selecciona un día"
                  value={field.value || ""}
                  onValueChange={field.onChange}
                  disabled={readOnly || isLoading}
                  error={errors.dia_reunion?.message}
                  opciones={dias.map((d) => ({ valor: d, etiqueta: d }))}
                />
              )}
            />

            <Controller
              name="hora_reunion"
              control={control}
              render={({ field }) => (
                <SelectSistema
                  label="Hora de Reunión"
                  placeholder="Selecciona una hora"
                  value={to12h(field.value) || ""}
                  onValueChange={field.onChange}
                  disabled={readOnly || isLoading}
                  error={errors.hora_reunion?.message}
                  opciones={horas.map((h) => ({ valor: h, etiqueta: h }))}
                />
              )}
            />
          </div>

          <div className="flex flex-row items-center justify-between rounded-xl border border-border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Grupo Activo</Label>
              <p className="text-sm text-muted-foreground">
                Indica si el grupo está activo y operativo
              </p>
            </div>
            <Controller
              name="activo"
              control={control}
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={readOnly || isLoading}
                />
              )}
            />
          </div>
        </div>
      </TarjetaSistema>

      {/* Casa Anfitriona */}
      <TarjetaSistema>
        <div className="mb-6 space-y-2">
          <h3 className="text-xl font-bold text-foreground">Casa Anfitriona</h3>
          <p className="text-sm text-muted-foreground">
            La visibilidad en el mapa se obtiene únicamente desde una Casa Anfitriona aprobada.
          </p>
        </div>

        {selectedCasa && (
          <div className="rounded-lg border border-border/50 p-3 text-sm">
            <p className="font-medium text-foreground">Casa Anfitriona asignada</p>
            <p className="text-muted-foreground">
              {selectedCasa.nombre_lugar} — {selectedCasa.anfitrion_nombre}
            </p>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground">
          {hasValidAssignedCasa ? (
            <p>
              El grupo usa la ubicación aprobada de la Casa Anfitriona asignada. Las coordenadas manuales no se copian al grupo.
            </p>
          ) : (
            <div className="space-y-3">
              {grupo.casa_anfitriona_id && (
                <p>
                  La Casa Anfitriona asignada ya no está disponible para edición desde este formulario. Usa el flujo guiado para recuperar o cambiar la asignación.
                </p>
              )}
              <p>
                Las direcciones manuales quedan solo como referencia interna y no hacen visible el grupo en el mapa.
              </p>
              <Link className="inline-flex font-medium text-primary underline-offset-4 hover:underline" href={assignmentHref}>
                Asignar Casa Anfitriona
              </Link>
            </div>
          )}
        </div>
      </TarjetaSistema>

      {/* Dirección manual — solo visible si NO hay casa anfitriona aprobada y disponible */}
      {!hasValidAssignedCasa && (
        <TarjetaSistema>
          <div className="mb-6 space-y-2">
            <h3 className="text-xl font-bold text-foreground">Dirección manual de referencia</h3>
            <p className="text-sm text-muted-foreground">
              Conserva datos operativos legados, pero no se usa como fuente del mapa de Grupos de Vida.
            </p>
          </div>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputSistema
                label="Calle"
                placeholder="Ingresa la calle"
                disabled={readOnly || isLoading}
                error={errors.direccion?.calle?.message}
                {...register("direccion.calle")}
              />

              <InputSistema
                label="Barrio"
                placeholder="Ingresa el barrio"
                disabled={readOnly || isLoading}
                {...register("direccion.barrio")}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputSistema
                label="Código Postal"
                placeholder="Ingresa el código postal"
                disabled={readOnly || isLoading}
                {...register("direccion.codigo_postal")}
              />

              <Controller
                name="direccion.parroquia_id"
                control={control}
                render={({ field }) => (
                  <SelectSistema
                    label="Parroquia"
                    placeholder="Selecciona una parroquia"
                    value={field.value || ""}
                    onValueChange={field.onChange}
                    disabled={readOnly || isLoading}
                    error={errors.direccion?.parroquia_id?.message}
                    opciones={parroquias.map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
                  />
                )}
              />
            </div>

            <TextareaSistema
              label="Referencia"
              placeholder="Ingresa puntos de referencia"
              disabled={readOnly || isLoading}
              error={errors.direccion?.referencia?.message}
              {...register("direccion.referencia")}
            />
          </div>
        </TarjetaSistema>
      )}

      {/* Notas Privadas */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-6">Notas Privadas</h3>
        <TextareaSistema
          label="Notas (solo para líderes)"
          placeholder="Ingresa notas privadas sobre el grupo"
          disabled={readOnly || isLoading}
          error={errors.notas_privadas?.message}
          {...register("notas_privadas")}
        />
      </TarjetaSistema>

      {/* Botones */}
      <div className="flex gap-4">
        <BotonSistema
          type="button"
          variante="outline"
          onClick={() => router.push(`/grupos-vida/${grupo.id}`)}
          disabled={isLoading}
        >
          {readOnly ? 'Volver' : 'Cancelar'}
        </BotonSistema>
        {!readOnly && (
          <BotonSistema
            type="submit"
            variante="primario"
            cargando={isLoading}
          >
            Guardar Cambios
          </BotonSistema>
        )}
      </div>
    </form>
  );
}
