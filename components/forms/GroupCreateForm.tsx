"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import SelectLeaderModal from '@/components/modals/SelectLeaderModal';
import { createGroup } from "@/lib/actions/group.actions";
import { RefreshCw, UserPlus } from "lucide-react";
import { InputSistema, SelectSistema, BotonSistema, PieAccionesSistema } from "@/components/ui/sistema-diseno";
import { cn } from "@/lib/utils";
import { AvisoFormulario } from "./aviso-formulario";
import { COLUMNAS_CAMPOS } from "./seccion-formulario";

// Esquema de validación con Zod
const groupCreateSchema = z.object({
  nombre: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  temporada_id: z.string().min(1, "Debes seleccionar una temporada"),
  segmento_id: z.string().min(1, "Debes seleccionar un segmento"),
  ubicacion: z.enum(["Barquisimeto", "Cabudare"], { required_error: "Selecciona una ubicación" }),
  director_etapa_segmento_lider_id: z
    .string({ required_error: "Elige el director de etapa del grupo", invalid_type_error: "Elige el director de etapa del grupo" })
    .min(1, "Elige el director de etapa del grupo"),
  lider_usuario_id: z.string().optional().nullable(),
});

type GroupCreateFormData = z.infer<typeof groupCreateSchema>;

interface GroupCreateFormProps {
  temporadas: { id: string; nombre: string }[];
  segmentos: { id: string; nombre: string }[];
  userRoles?: string[];
  /** Own director entries (segmento_lideres) of a director de etapa; the API that lists directors is closed to them. */
  directoresPropios?: { id: string; segmento_id: string; nombre: string }[];
}

// Stable default: a fresh [] on every render would retrigger the effects that depend on it.
const SIN_DIRECTORES_PROPIOS: GroupCreateFormProps['directoresPropios'] & {} = [];

export default function GroupCreateForm({ temporadas, segmentos, userRoles = [], directoresPropios = SIN_DIRECTORES_PROPIOS }: GroupCreateFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerenciaCargando, setSugerenciaCargando] = useState(false);
  const [directores, setDirectores] = useState<{ id: string; usuario_id: string; nombre: string }[]>([]);
  const [cargandoDirectores, setCargandoDirectores] = useState(false);
  const [directoresError, setDirectoresError] = useState<string | null>(null);
  // Modal selección global de líder
  const [showLeaderModal, setShowLeaderModal] = useState(false);
  const [leaderResumen, setLeaderResumen] = useState<string | null>(null);

  const esDirectorEtapa = userRoles.includes('director-etapa') && !userRoles.some(r => ['admin', 'pastor', 'director-general'].includes(r));

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
      ubicacion: undefined,
    }
  });

  const ubicacion = watch("ubicacion");
  const temporadaId = watch("temporada_id");
  const segmentoId = watch("segmento_id");

  // Auto-seleccionar cuando sólo hay una opción disponible
  // Esto arregla el caso donde el <select> nativo muestra visualmente una opción
  // pero React Hook Form no tiene el valor registrado internamente
  useEffect(() => {
    if (segmentos.length === 1 && !segmentoId) {
      setValue('segmento_id', segmentos[0].id, { shouldValidate: true });
    }
  }, [segmentos, segmentoId, setValue]);

  useEffect(() => {
    if (temporadas.length === 1 && !temporadaId) {
      setValue('temporada_id', temporadas[0].id, { shouldValidate: true });
    }
  }, [temporadas, temporadaId, setValue]);

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
      } catch {
        // silenciar
      } finally {
        setSugerenciaCargando(false);
      }
    };
    sugerir();
  }, [ubicacion, temporadaId, segmentoId, setValue]);

  // Reset selección de director si cambia el segmento
  useEffect(() => {
    setValue('director_etapa_segmento_lider_id', null as unknown as string);
  }, [segmentoId, setValue]);

  // Un director de etapa es siempre el director del grupo que crea: su propia entrada, fija.
  const directoresPropiosDelSegmento = useMemo(
    () => directoresPropios.filter((d) => d.segmento_id === segmentoId),
    [directoresPropios, segmentoId]
  );
  useEffect(() => {
    if (esDirectorEtapa && directoresPropiosDelSegmento.length === 1) {
      setValue('director_etapa_segmento_lider_id', directoresPropiosDelSegmento[0].id, { shouldValidate: true });
    }
  }, [esDirectorEtapa, directoresPropiosDelSegmento, setValue]);

  const abortDirectoresRef = useRef<AbortController | null>(null);

  const fetchDirectores = useCallback(async (segId: string) => {
    if (!segId) { setDirectores([]); return; }
    abortDirectoresRef.current?.abort();
    const controller = new AbortController();
    abortDirectoresRef.current = controller;
    setCargandoDirectores(true);
    setDirectoresError(null);
    try {
      const res = await fetch(`/api/segmentos/${segId}/directores-etapa`, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) {
        setDirectoresError(`Error ${res.status}`);
        setDirectores([]);
        return;
      }
      const data = await res.json();
      setDirectores(data?.directores || []);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setDirectoresError('Fallo al cargar');
        setDirectores([]);
      }
    } finally {
      setCargandoDirectores(false);
    }
  }, []);

  // Cargar directores al cambiar segmento (el director de etapa usa su propia entrada)
  useEffect(() => {
    if (esDirectorEtapa) {
      setDirectores(directoresPropiosDelSegmento.map((d) => ({ id: d.id, usuario_id: '', nombre: d.nombre })));
      return;
    }
    if (segmentoId) {
      fetchDirectores(segmentoId);
    } else {
      setDirectores([]);
    }
    return () => {
      abortDirectoresRef.current?.abort();
    };
  }, [segmentoId, fetchDirectores, esDirectorEtapa, directoresPropiosDelSegmento]);

  // Limpiar selección de líder al cambiar segmento para evitar inconsistencias
  useEffect(() => {
    setValue('lider_usuario_id', null);
    setLeaderResumen(null);
  }, [segmentoId, setValue]);

  const handleFormSubmit = async (data: GroupCreateFormData) => {
    try {
      setIsLoading(true);
      setError(null);
      // Mapear ubicacion textual a segmento_ubicacion_id
      let segmentoUbicacionId: string | null = null;
      if (data.segmento_id && data.ubicacion) {
        try {
          const res = await fetch(`/api/segmentos/${data.segmento_id}/ubicaciones`);
          if (res.ok) {
            const json = await res.json();
            const match = (json.ubicaciones || []).find((u: { id: string; nombre: string }) => u.nombre === data.ubicacion);
            if (match) segmentoUbicacionId = match.id;
          }
        } catch {
          // silencioso, no bloquea creación
        }
      }
      const result = await createGroup({
        nombre: data.nombre,
        temporada_id: data.temporada_id,
        segmento_id: data.segmento_id,
        segmento_ubicacion_id: segmentoUbicacionId,
        ubicacion_nombre: data.ubicacion,
        director_etapa_segmento_lider_id: data.director_etapa_segmento_lider_id,
        lider_usuario_id: data.lider_usuario_id || null,
      });
      if (!result?.success) {
        setError(result?.error || "No autorizado para crear el grupo");
        return;
      }
      if (result.pendiente) {
        // Grupo pendiente de aprobación — redirigir a mis solicitudes
        router.push("/grupos-vida/solicitudes/mis-solicitudes");
      } else if (result.newGroupId) {
        router.push(`/grupos-vida/${result.newGroupId}/edit`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el grupo");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="@container space-y-6">
      {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      {esDirectorEtapa && (
        <AvisoFormulario tono="marca">
          <strong>Nota:</strong> Como director de etapa, el grupo que crees quedará en estado <strong>pendiente de aprobación</strong>. Un administrador o pastor deberá aprobarlo para activarlo.
        </AvisoFormulario>
      )}
      <div className={COLUMNAS_CAMPOS[2]}>
        {/* El nombre se sugiere a partir de ubicación, temporada y segmento */}
        <div className="@lg:col-span-2">
          <InputSistema
            id="nombre"
            label="Nombre del Grupo"
            placeholder="Ingresa el nombre del grupo"
            error={errors.nombre?.message}
            disabled
            {...register("nombre")}
          />
        </div>

        <Controller
          name="ubicacion"
          control={control}
          render={({ field }) => (
            <SelectSistema
              label="Ubicación"
              placeholder="Selecciona ubicación"
              value={field.value}
              onValueChange={field.onChange}
              error={errors.ubicacion?.message as string}
              opciones={[
                { valor: "Barquisimeto", etiqueta: "Barquisimeto" },
                { valor: "Cabudare", etiqueta: "Cabudare" },
              ]}
            />
          )}
        />

        <Controller
          name="temporada_id"
          control={control}
          render={({ field }) => (
            <SelectSistema
              label="Temporada"
              placeholder="Selecciona una temporada"
              value={field.value}
              onValueChange={field.onChange}
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
              error={errors.segmento_id?.message}
              opciones={segmentos.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
            />
          )}
        />

        {/* Director de Etapa */}
        <div className="space-y-2">
          <div className="flex min-h-5 items-center justify-between gap-2">
            <label htmlFor="director-etapa" className="block text-sm font-medium text-foreground">Director de Etapa</label>
            {segmentoId && !esDirectorEtapa && (
              <button
                type="button"
                onClick={() => fetchDirectores(segmentoId)}
                className="-my-3 -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-[var(--brand-primary)] transition-colors duration-200 hover:bg-[var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                disabled={cargandoDirectores}
              >
                <RefreshCw className={cn("size-4", cargandoDirectores && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                {cargandoDirectores ? 'Actualizando...' : 'Recargar'}
              </button>
            )}
          </div>
          <Controller name="director_etapa_segmento_lider_id" control={control} render={({ field }) => {
            const placeholder = cargandoDirectores
              ? 'Cargando...'
              : directoresError
                ? `Error: ${directoresError}`
                : directores.length
                  ? 'Selecciona un director'
                  : 'Sin directores';
            return (
              <SelectSistema
                id="director-etapa"
                placeholder={placeholder}
                value={field.value || undefined}
                onValueChange={field.onChange}
                error={errors.director_etapa_segmento_lider_id?.message}
                disabled={esDirectorEtapa || !segmentoId || cargandoDirectores || !!directoresError || directores.length === 0}
                opciones={directores.map(d => ({ valor: d.id, etiqueta: d.nombre }))}
              />
            );
          }} />
          {directoresError && (
            <p className="text-sm text-danger">No se pudieron cargar los directores. Intenta recargar.</p>
          )}
        </div>

        {/* Líder Inicial con modal global */}
        <div role="group" aria-labelledby="lider-inicial-titulo" className="space-y-2 @lg:col-span-2">
          <p id="lider-inicial-titulo" className="text-sm font-medium text-foreground">Líder Inicial (opcional)</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <BotonSistema
              type="button"
              variante="outline"
              icono={UserPlus}
              onClick={() => setShowLeaderModal(true)}
              disabled={!segmentoId}
            >
              {leaderResumen ? 'Cambiar líder' : 'Seleccionar líder'}
            </BotonSistema>
            {leaderResumen ? (
              <p className="min-w-0 max-w-full truncate text-sm text-foreground" title={leaderResumen}>
                {leaderResumen}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Opcional: puedes asignarlo después.</p>
            )}
          </div>
          <SelectLeaderModal
            open={showLeaderModal}
            onClose={() => setShowLeaderModal(false)}
            segmentoId={segmentoId}
            onSelect={(u) => {
              setValue('lider_usuario_id', u.id, { shouldValidate: true });
              setLeaderResumen(`${u.nombre} ${u.apellido}`.trim());
            }}
            title="Seleccionar Líder Inicial"
            description="Busca entre los líderes disponibles. Los que no lideran grupo activo aparecen primero."
          />
        </div>
      </div>

      <PieAccionesSistema fijo={false} className="bg-transparent">
        <BotonSistema
          type="submit"
          variante="primario"
          disabled={isLoading}
          cargando={isLoading}
        >
          {isLoading || sugerenciaCargando ? "Creando..." : "Crear Grupo y Continuar"}
        </BotonSistema>
      </PieAccionesSistema>
    </form>
  );
}
