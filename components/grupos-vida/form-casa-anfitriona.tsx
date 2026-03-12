"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    InputSistema,
    TextareaSistema,
    SelectSistema,
    BotonSistema,
    TituloSistema,
} from "@/components/ui/sistema-diseno";
import { Home, MapPin, Hash, Save, Loader2 } from "lucide-react";

const schemaCasaAnfitriona = z.object({
    nombre_lugar: z.string().min(2, "Nombre del lugar es requerido"),
    descripcion: z.string().optional(),
    capacidad_maxima: z.number().min(1).max(200).optional(),
    calle: z.string().min(2, "La calle es requerida"),
    barrio: z.string().optional(),
    codigo_postal: z.string().optional(),
    referencia: z.string().optional(),
    parroquia_id: z.string().uuid().optional(),
    notas_publicas: z.string().optional(),
    // Disponibilidad como JSON
    disponibilidad_lunes: z.boolean().optional(),
    disponibilidad_martes: z.boolean().optional(),
    disponibilidad_miercoles: z.boolean().optional(),
    disponibilidad_jueves: z.boolean().optional(),
    disponibilidad_viernes: z.boolean().optional(),
    disponibilidad_sabado: z.boolean().optional(),
    disponibilidad_domingo: z.boolean().optional(),
});

type FormCasaData = z.infer<typeof schemaCasaAnfitriona>;

interface Parroquia {
    value: string;
    label: string;
}

interface FormCasaAnfitrionaProps {
    datosIniciales?: Partial<FormCasaData>;
    parroquias: Parroquia[];
    cargando?: boolean;
    onSubmit: (datos: FormCasaData) => Promise<void>;
    onCancelar: () => void;
}

const DIAS_SEMANA = [
    { key: "disponibilidad_lunes" as const, label: "Lunes" },
    { key: "disponibilidad_martes" as const, label: "Martes" },
    { key: "disponibilidad_miercoles" as const, label: "Miércoles" },
    { key: "disponibilidad_jueves" as const, label: "Jueves" },
    { key: "disponibilidad_viernes" as const, label: "Viernes" },
    { key: "disponibilidad_sabado" as const, label: "Sábado" },
    { key: "disponibilidad_domingo" as const, label: "Domingo" },
];

/**
 * Formulario para registrar o editar una casa anfitriona.
 * Incluye campos de información del lugar, dirección, disponibilidad semanal
 * y notas públicas. Usa react-hook-form con validación Zod.
 */
export function FormCasaAnfitriona({
    datosIniciales,
    parroquias,
    cargando = false,
    onSubmit,
    onCancelar,
}: FormCasaAnfitrionaProps) {
    const {
        register,
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<FormCasaData>({
        resolver: zodResolver(schemaCasaAnfitriona),
        defaultValues: {
            nombre_lugar: "",
            descripcion: "",
            capacidad_maxima: undefined,
            calle: "",
            barrio: "",
            codigo_postal: "",
            referencia: "",
            notas_publicas: "",
            ...datosIniciales,
        },
    });

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Información del lugar */}
            <div className="space-y-4">
                <TituloSistema nivel={4}>Información del lugar</TituloSistema>

                <InputSistema
                    label="Nombre del lugar"
                    icono={Home}
                    placeholder="Ej: Casa de la familia Pérez"
                    error={errors.nombre_lugar?.message}
                    {...register("nombre_lugar")}
                />

                <TextareaSistema
                    label="Descripción"
                    filas={2}
                    placeholder="Breve descripción del espacio disponible..."
                    error={errors.descripcion?.message}
                    {...register("descripcion")}
                />

                <InputSistema
                    label="Capacidad máxima"
                    icono={Hash}
                    type="number"
                    placeholder="Ej: 20"
                    error={errors.capacidad_maxima?.message}
                    {...register("capacidad_maxima", { valueAsNumber: true })}
                />
            </div>

            {/* Dirección */}
            <div className="space-y-4">
                <TituloSistema nivel={4}>Dirección</TituloSistema>

                <InputSistema
                    label="Calle / Avenida"
                    icono={MapPin}
                    placeholder="Ej: Carrera 31 con calle 24"
                    error={errors.calle?.message}
                    {...register("calle")}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InputSistema
                        label="Barrio / Urbanización"
                        placeholder="Ej: Urb. Las Acacias"
                        error={errors.barrio?.message}
                        {...register("barrio")}
                    />
                    <InputSistema
                        label="Código postal"
                        placeholder="Ej: 3001"
                        error={errors.codigo_postal?.message}
                        {...register("codigo_postal")}
                    />
                </div>

                <InputSistema
                    label="Referencia"
                    placeholder="Ej: Frente a la plaza"
                    error={errors.referencia?.message}
                    {...register("referencia")}
                />

                {parroquias.length > 0 && (
                    <Controller
                        name="parroquia_id"
                        control={control}
                        render={({ field }) => (
                            <SelectSistema
                                label="Parroquia"
                                opciones={parroquias.map((p) => ({
                                    valor: p.value,
                                    etiqueta: p.label,
                                }))}
                                placeholder="Seleccionar parroquia..."
                                onValueChange={field.onChange}
                                value={field.value}
                                error={errors.parroquia_id?.message}
                            />
                        )}
                    />
                )}
            </div>

            {/* Disponibilidad por día */}
            <div className="space-y-3">
                <TituloSistema nivel={4}>Disponibilidad semanal</TituloSistema>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DIAS_SEMANA.map(({ key, label }) => (
                        <label
                            key={key}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 transition-colors duration-200 hover:bg-muted/50"
                        >
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border"
                                {...register(key)}
                            />
                            <span className="text-sm text-foreground">{label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Notas públicas */}
            <TextareaSistema
                label="Notas públicas"
                filas={2}
                placeholder="Información visible para los miembros del grupo..."
                error={errors.notas_publicas?.message}
                {...register("notas_publicas")}
            />

            {/* Acciones */}
            <div className="flex justify-end gap-3 pt-2">
                <BotonSistema variante="outline" onClick={onCancelar} type="button">
                    Cancelar
                </BotonSistema>
                <BotonSistema
                    variante="primario"
                    type="submit"
                    cargando={cargando}
                    icono={cargando ? Loader2 : Save}
                >
                    {datosIniciales ? "Guardar cambios" : "Registrar casa"}
                </BotonSistema>
            </div>
        </form>
    );
}
