"use client";

import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { obtenerDireccionUsuario, obtenerRelacionesFamiliares } from "@/lib/actions/casas-anfitrionas.actions";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import {
    InputSistema,
    TextareaSistema,
    SelectSistema,
    BotonSistema,
    TituloSistema,
} from "@/components/ui/sistema-diseno";
import { Home, MapPin, Hash, Save, Loader2, User, Users, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import LocationPicker from "@/components/maps/LocationPicker.client";

const schemaCasaAnfitriona = z.object({
    nombre_lugar: z.string().min(2, "Nombre del lugar es requerido"),
    descripcion: z.string().optional(),
    capacidad_maxima: z.number().min(1).max(200).optional(),
    calle: z.string().min(2, "La calle es requerida"),
    barrio: z.string().optional(),
    codigo_postal: z.string().optional(),
    referencia: z.string().optional(),
    estado_id: z.string().uuid().optional(),
    municipio_id: z.string().uuid().optional(),
    parroquia_id: z.string().uuid().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    notas_publicas: z.string().optional(),
    usuario_id: z.string().uuid().optional(),
    // Disponibilidad como JSON
    disponibilidad_lunes: z.boolean().optional(),
    disponibilidad_martes: z.boolean().optional(),
    disponibilidad_miercoles: z.boolean().optional(),
    disponibilidad_jueves: z.boolean().optional(),
    disponibilidad_viernes: z.boolean().optional(),
    disponibilidad_sabado: z.boolean().optional(),
    disponibilidad_domingo: z.boolean().optional(),
    co_anfitrion_id: z.string().uuid().optional(),
});

type FormCasaData = z.infer<typeof schemaCasaAnfitriona>;

/** Opción para selects de ubicación */
interface UbicacionOption {
    value: string;
    label: string;
    /** ID padre para filtrado en cascada */
    parentId?: string;
}

/** Opción de usuario para el selector */
interface UsuarioOption {
    value: string;
    label: string;
}

interface FormCasaAnfitrionaProps {
    datosIniciales?: Partial<FormCasaData>;
    /** Catálogo de estados (provincias) */
    estados: UbicacionOption[];
    /** Catálogo de municipios con `parentId` = `estado_id` */
    municipios: UbicacionOption[];
    /** Catálogo de parroquias con `parentId` = `municipio_id` */
    parroquias: UbicacionOption[];
    /** Lista de usuarios disponibles (solo para admin/líder) */
    usuarios?: UsuarioOption[];
    /** Si true, muestra selector de usuario (admin/líder) */
    mostrarSelectorUsuario?: boolean;
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
 *
 * Incluye campos de información del lugar, dirección con selects
 * en cascada (Estado → Municipio → Parroquia), disponibilidad semanal
 * y notas públicas. Usa react-hook-form con validación Zod.
 *
 * @param props - Datos iniciales, catálogos de ubicación, handlers.
 */
export function FormCasaAnfitriona({
    datosIniciales,
    estados,
    municipios,
    parroquias,
    usuarios = [],
    mostrarSelectorUsuario = false,
    cargando = false,
    onSubmit,
    onCancelar,
}: FormCasaAnfitrionaProps) {
    const [mapCenter, setMapCenter] = useState({
        lat: datosIniciales?.lat ?? 10.4681,
        lng: datosIniciales?.lng ?? -66.8792,
    });

    const {
        register,
        control,
        handleSubmit,
        setValue,
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
            estado_id: "",
            municipio_id: "",
            parroquia_id: "",
            lat: undefined,
            lng: undefined,
            notas_publicas: "",
            usuario_id: undefined,
            ...datosIniciales,
        },
    });

    const [geocodificando, setGeocodificando] = useState(false);
    const geocodeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    /** Evita que el geocoding sobreescriba coords guardadas al montar */
    const isInitialMount = useRef(true);
    /** Evita que el geocoding sobreescriba coords cargadas del perfil del usuario */
    const skipNextGeocode = useRef(false);

    // Observar valores para cascading
    const estadoId = useWatch({ control, name: "estado_id" });
    const municipioId = useWatch({ control, name: "municipio_id" });
    const calleValue = useWatch({ control, name: "calle" });
    const barrioValue = useWatch({ control, name: "barrio" });

    /** Municipios filtrados por el estado seleccionado */
    const municipiosFiltrados = useMemo(
        () =>
            estadoId
                ? municipios.filter((m) => m.parentId === estadoId)
                : [],
        [estadoId, municipios]
    );

    /** Parroquias filtradas por el municipio seleccionado */
    const parroquiasFiltradas = useMemo(
        () =>
            municipioId
                ? parroquias.filter((p) => p.parentId === municipioId)
                : [],
        [municipioId, parroquias]
    );

    /** Obtener etiqueta de una opción por su value */
    const getLabelById = useCallback(
        (id: string | undefined, lista: UbicacionOption[]) =>
            lista.find((o) => o.value === id)?.label ?? "",
        []
    );

    /** Auto-geocodificación: busca coordenadas cuando cambian estado+municipio+calle */
    useEffect(() => {
        // Necesitamos al menos estado + municipio para geocodificar
        if (!estadoId || !municipioId) return;

        // Saltar el primer render si ya hay coordenadas guardadas (modo edición)
        if (isInitialMount.current) {
            isInitialMount.current = false;
            if (datosIniciales?.lat && datosIniciales?.lng) return;
        }

        // Saltar si las coords se cargaron desde perfil del usuario
        if (skipNextGeocode.current) {
            skipNextGeocode.current = false;
            return;
        }

        clearTimeout(geocodeTimerRef.current);

        geocodeTimerRef.current = setTimeout(async () => {
            const estadoNombre = getLabelById(estadoId, estados);
            const municipioNombre = getLabelById(municipioId, municipios);

            if (!estadoNombre || !municipioNombre) return;

            // Usar búsqueda estructurada de Nominatim para mayor precisión
            const params = new URLSearchParams({
                format: "json",
                country: "Venezuela",
                state: estadoNombre,
                county: municipioNombre,
                limit: "1",
            });

            // Agregar calle si está disponible para mayor precisión
            const calle = calleValue?.trim();
            if (calle) {
                params.set("street", calle);
            }

            try {
                setGeocodificando(true);
                const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
                const res = await fetch(url, {
                    headers: { "Accept-Language": "es" },
                });
                const data = await res.json();

                if (data?.[0]) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        setMapCenter({ lat, lng });
                        setValue("lat", lat);
                        setValue("lng", lng);
                    }
                }
            } catch {
                // Silenciar errores de geocodificación — no es crítico
            } finally {
                setGeocodificando(false);
            }
        }, 800); // Debounce de 800ms

        return () => clearTimeout(geocodeTimerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estadoId, municipioId, calleValue, barrioValue, estados, municipios, getLabelById, setValue]);

    /** Resetea municipio y parroquia al cambiar de estado */
    const handleEstadoChange = (val: string) => {
        setValue("estado_id", val);
        setValue("municipio_id", "");
        setValue("parroquia_id", "");
    };

    /** Resetea parroquia al cambiar de municipio */
    const handleMunicipioChange = (val: string) => {
        setValue("municipio_id", val);
        setValue("parroquia_id", "");
    };

    // Auto-rellenar dirección al seleccionar un usuario
    const toast = useNotificaciones();
    const [cargandoDireccion, startTransition] = useTransition();

    /** Familiares del usuario seleccionado (para co-anfitrión) */
    interface Familiar {
        id: string;
        nombre: string;
        apellido: string;
        foto_perfil_url: string | null;
        tipo_relacion: string;
    }
    const [familiares, setFamiliares] = useState<Familiar[]>([]);
    const [coAnfitrionId, setCoAnfitrionId] = useState<string | null>(null);

    const handleUsuarioChange = (usuarioId: string) => {
        setValue("usuario_id", usuarioId);
        // Reset co-anfitrión al cambiar de usuario
        setFamiliares([]);
        setCoAnfitrionId(null);
        setValue("co_anfitrion_id", undefined);
        if (!usuarioId) return;

        startTransition(async () => {
            // 1. Cargar dirección
            const result = await obtenerDireccionUsuario(usuarioId);
            if (result.success && result.data) {
                const d = result.data;
                skipNextGeocode.current = true;
                if (d.estado_id) setValue("estado_id", d.estado_id);
                if (d.municipio_id) setValue("municipio_id", d.municipio_id);
                if (d.parroquia_id) setValue("parroquia_id", d.parroquia_id);
                if (d.calle) setValue("calle", d.calle);
                if (d.barrio) setValue("barrio", d.barrio);
                if (d.codigo_postal) setValue("codigo_postal", d.codigo_postal);
                if (d.referencia) setValue("referencia", d.referencia);
                if (d.lat && d.lng) {
                    setValue("lat", d.lat);
                    setValue("lng", d.lng);
                    setMapCenter({ lat: d.lat, lng: d.lng });
                }
                toast.success("Dirección cargada del perfil del miembro");
            } else if (result.error) {
                toast.error(result.error);
            }

            // 2. Buscar relaciones familiares para ofrecer co-anfitrión
            const relResult = await obtenerRelacionesFamiliares(usuarioId);
            if (relResult.success && relResult.data && relResult.data.length > 0) {
                setFamiliares(relResult.data);
            }
        });
    };

    /** Transforma datos del formulario al formato esperado por la server action */
    const processSubmit = (datos: FormCasaData) => {
        const DIAS_MAP: Record<string, string> = {
            disponibilidad_lunes: "Lunes",
            disponibilidad_martes: "Martes",
            disponibilidad_miercoles: "Miércoles",
            disponibilidad_jueves: "Jueves",
            disponibilidad_viernes: "Viernes",
            disponibilidad_sabado: "Sábado",
            disponibilidad_domingo: "Domingo",
        };

        const disponibilidad = Object.entries(DIAS_MAP)
            .filter(([key]) => datos[key as keyof FormCasaData])
            .map(([, label]) => label);

        const datosTransformados = {
            nombre_lugar: datos.nombre_lugar,
            descripcion: datos.descripcion,
            capacidad_maxima: datos.capacidad_maxima ? Number(datos.capacidad_maxima) : undefined,
            calle: datos.calle,
            barrio: datos.barrio,
            codigo_postal: datos.codigo_postal,
            referencia: datos.referencia,
            parroquia_id: datos.parroquia_id,
            lat: datos.lat,
            lng: datos.lng,
            notas_publicas: datos.notas_publicas,
            usuario_id: datos.usuario_id,
            co_anfitrion_id: coAnfitrionId ?? undefined,
            disponibilidad,
        };

        return onSubmit(datosTransformados as unknown as FormCasaData);
    };

    return (
        <form onSubmit={handleSubmit(processSubmit)} className="space-y-6">
            {/* Selector de usuario (solo admin/líder) */}
            {mostrarSelectorUsuario && usuarios.length > 0 && (
                <div className="space-y-4">
                    <TituloSistema nivel={4}>Propietario de la casa</TituloSistema>
                    <Controller
                        name="usuario_id"
                        control={control}
                        render={({ field }) => (
                            <SelectSistema
                                label="¿A quién pertenece esta casa?"
                                placeholder="Seleccionar miembro..."
                                onValueChange={(val) => {
                                    field.onChange(val);
                                    handleUsuarioChange(val);
                                }}
                                value={field.value}
                                opciones={usuarios.map((u) => ({
                                    valor: u.value,
                                    etiqueta: u.label,
                                }))}
                            />
                        )}
                    />
                    {cargandoDireccion && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Cargando dirección del miembro...
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Al seleccionar un miembro, su dirección se carga automáticamente.
                    </p>
                </div>
            )}

            {/* Co-anfitrión familiar */}
            {familiares.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-orange-500" />
                        <TituloSistema nivel={4} className="!mb-0">
                            ¿Alguien más es anfitrión(a) en esta casa?
                        </TituloSistema>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Si un familiar vive en la misma casa, puedes marcarlo como co-anfitrión para evitar registros duplicados.
                    </p>
                    <div className="space-y-2">
                        {familiares.map((fam) => {
                            const isSelected = coAnfitrionId === fam.id;
                            const tipoLabel = fam.tipo_relacion === "conyuge" ? "Cónyuge" : fam.tipo_relacion;
                            return (
                                <button
                                    key={fam.id}
                                    type="button"
                                    onClick={() => {
                                        if (isSelected) {
                                            setCoAnfitrionId(null);
                                            setValue("co_anfitrion_id", undefined);
                                        } else {
                                            setCoAnfitrionId(fam.id);
                                            setValue("co_anfitrion_id", fam.id);
                                        }
                                    }}
                                    className={`w-full flex items-center gap-3 rounded-xl p-3 border transition-colors duration-200 text-left ${isSelected
                                            ? "border-orange-500 bg-orange-500/10"
                                            : "border-border/50 bg-card hover:border-orange-300"
                                        }`}
                                >
                                    {/* Foto */}
                                    <div className="relative h-10 w-10 flex-shrink-0 rounded-full bg-muted overflow-hidden">
                                        {fam.foto_perfil_url ? (
                                            <img
                                                src={fam.foto_perfil_url}
                                                alt={`${fam.nombre} ${fam.apellido}`}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center">
                                                <User className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            {fam.nombre} {fam.apellido}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{tipoLabel}</p>
                                    </div>
                                    {/* Indicador */}
                                    <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${isSelected
                                            ? "bg-orange-500 text-white"
                                            : "border border-border"
                                        }`}>
                                        {isSelected && <Check className="h-3.5 w-3.5" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {coAnfitrionId && (
                        <p className="text-xs text-orange-600 flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Co-anfitrión seleccionado. Ambos aparecerán como anfitriones de esta casa.
                        </p>
                    )}
                </div>
            )}

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

                {/* Selects en cascada PRIMERO: Estado → Municipio → Parroquia */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {estados.length > 0 && (
                        <Controller
                            name="estado_id"
                            control={control}
                            render={({ field }) => (
                                <SelectSistema
                                    label="Estado"
                                    opciones={estados.map((e) => ({
                                        valor: e.value,
                                        etiqueta: e.label,
                                    }))}
                                    placeholder="Seleccionar estado..."
                                    onValueChange={handleEstadoChange}
                                    value={field.value}
                                    error={errors.estado_id?.message}
                                />
                            )}
                        />
                    )}

                    <Controller
                        name="municipio_id"
                        control={control}
                        render={({ field }) => (
                            <SelectSistema
                                label="Municipio"
                                opciones={municipiosFiltrados.map((m) => ({
                                    valor: m.value,
                                    etiqueta: m.label,
                                }))}
                                placeholder={
                                    estadoId
                                        ? "Seleccionar municipio..."
                                        : "Seleccione estado primero"
                                }
                                onValueChange={handleMunicipioChange}
                                value={field.value}
                                error={errors.municipio_id?.message}
                            />
                        )}
                    />

                    <Controller
                        name="parroquia_id"
                        control={control}
                        render={({ field }) => (
                            <SelectSistema
                                label="Parroquia"
                                opciones={parroquiasFiltradas.map((p) => ({
                                    valor: p.value,
                                    etiqueta: p.label,
                                }))}
                                placeholder={
                                    municipioId
                                        ? "Seleccionar parroquia..."
                                        : "Seleccione municipio primero"
                                }
                                onValueChange={field.onChange}
                                value={field.value}
                                error={errors.parroquia_id?.message}
                            />
                        )}
                    />
                </div>

                {/* Campos de dirección específica */}
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
            </div>

            {/* Mapa de geolocalización */}
            <div className="space-y-4">
                <TituloSistema nivel={4}>Ubicación en el mapa</TituloSistema>
                <p className="text-sm text-muted-foreground">
                    {geocodificando
                        ? "🔍 Buscando ubicación..."
                        : "El mapa se centra automáticamente al llenar la dirección. Ajusta el pin para mayor precisión."}
                </p>
                <Controller
                    name="lat"
                    control={control}
                    render={() => (
                        <LocationPicker
                            lat={mapCenter.lat}
                            lng={mapCenter.lng}
                            center={mapCenter}
                            onLocationChange={({ lat, lng }) => {
                                setValue("lat", lat);
                                setValue("lng", lng);
                                setMapCenter({ lat, lng });
                            }}
                        />
                    )}
                />
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
