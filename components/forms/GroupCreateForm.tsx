"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import SelectLeaderModal from '@/components/modals/SelectLeaderModal';
import { createGroup } from "@/lib/actions/group.actions";
import { InputSistema, SelectSistema, BotonSistema } from "@/components/ui/sistema-diseno";

// Esquema de validación con Zod
const groupCreateSchema = z.object({
  nombre: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  temporada_id: z.string().min(1, "Debes seleccionar una temporada"),
  segmento_id: z.string().min(1, "Debes seleccionar un segmento"),
  ubicacion: z.enum(["Barquisimeto", "Cabudare"], { required_error: "Selecciona una ubicación" }),
  director_etapa_segmento_lider_id: z.string().optional().nullable(),
  lider_usuario_id: z.string().optional().nullable(),
  estado_aprobacion: z.enum(['aprobado', 'pendiente', 'rechazado']).optional().default('aprobado')
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
  const [directores, setDirectores] = useState<{ id: string; usuario_id: string; nombre: string }[]>([]);
  const [cargandoDirectores, setCargandoDirectores] = useState(false);
  const [directoresError, setDirectoresError] = useState<string | null>(null);
  // Modal selección global de líder
  const [showLeaderModal, setShowLeaderModal] = useState(false);
  const [leaderResumen, setLeaderResumen] = useState<string | null>(null);

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
  const directorLiderId = watch('director_etapa_segmento_lider_id');
  const liderUsuarioId = watch('lider_usuario_id');
  const estadoAprobacion = watch('estado_aprobacion');

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

  // Reset selección de director si cambia el segmento
  useEffect(() => {
    setValue('director_etapa_segmento_lider_id', null);
  }, [segmentoId, setValue]);

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

  // Cargar directores al cambiar segmento
  useEffect(() => {
    if (segmentoId) {
      fetchDirectores(segmentoId);
    } else {
      setDirectores([]);
    }
    return () => {
      abortDirectoresRef.current?.abort();
    };
  }, [segmentoId, fetchDirectores]);

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
        } catch (e) {
          // silencioso, no bloquea creación
        }
      }
      const result = await createGroup({
        nombre: data.nombre,
        temporada_id: data.temporada_id,
        segmento_id: data.segmento_id,
        segmento_ubicacion_id: segmentoUbicacionId,
        director_etapa_segmento_lider_id: data.director_etapa_segmento_lider_id || null,
        lider_usuario_id: data.lider_usuario_id || null,
        estado_aprobacion: data.estado_aprobacion
      });
      if (!result?.success) {
        setError(result?.error || "No autorizado para crear el grupo");
        return;
      }
      if (result.newGroupId) {
        router.push(`/dashboard/grupos/${result.newGroupId}/edit`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el grupo");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
        </div>

        {/* Campo Temporada */}
        <div className="space-y-2">
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
        </div>

        {/* Campo Segmento */}
        <div className="space-y-2">
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
        </div>

        {/* Director de Etapa */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">Director de Etapa (opcional)</label>
            {segmentoId && (
              <button
                type="button"
                onClick={() => fetchDirectores(segmentoId)}
                className="text-xs text-[var(--brand-primary)] hover:underline disabled:opacity-40"
                disabled={cargandoDirectores}
              >
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
                placeholder={placeholder}
                value={field.value || undefined}
                onValueChange={field.onChange}
                disabled={!segmentoId || cargandoDirectores || !!directoresError || directores.length === 0}
                opciones={directores.map(d => ({ valor: d.id, etiqueta: d.nombre }))}
              />
            );
          }} />
          {directoresError && (
            <p className="text-xs text-red-600 dark:text-red-400">No se pudieron cargar los directores. Intenta recargar.</p>
          )}
        </div>

        {/* Líder Inicial con modal global */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">Líder Inicial (opcional)</label>
          <div className="flex items-center gap-3">
            <BotonSistema
              type="button"
              variante="outline"
              onClick={() => setShowLeaderModal(true)}
              disabled={!segmentoId}
              className="min-w-[180px]"
            >
              {leaderResumen ? 'Cambiar líder' : 'Seleccionar líder'}
            </BotonSistema>
            {leaderResumen && (
              <div className="text-sm text-foreground truncate max-w-xs" title={leaderResumen}>
                {leaderResumen}
              </div>
            )}
            {!leaderResumen && (
              <div className="text-xs text-muted-foreground">Opcional: puedes asignarlo después.</div>
            )}
          </div>
          <SelectLeaderModal
            open={showLeaderModal}
            onClose={() => setShowLeaderModal(false)}
            onSelect={(u) => {
              setValue('lider_usuario_id', u.id, { shouldValidate: true });
              setLeaderResumen(`${u.nombre} ${u.apellido}`.trim());
            }}
            title="Seleccionar Líder Inicial"
            description="Busca entre todos los usuarios permitidos y asigna uno como líder inicial del grupo."
          />
        </div>

        {/* Estado Aprobación */}
        <div className="space-y-2 md:col-span-2">
          <Controller name="estado_aprobacion" control={control} render={({ field }) => (
            <SelectSistema
              label="Estado Inicial"
              value={field.value}
              onValueChange={field.onChange}
              opciones={[
                { valor: "aprobado", etiqueta: "Aprobado" },
                { valor: "pendiente", etiqueta: "Pendiente" },
                { valor: "rechazado", etiqueta: "Rechazado" },
              ]}
            />
          )} />
          <p className="text-xs text-muted-foreground">Puedes dejarlo en Aprobado o marcar como Pendiente para revisión posterior.</p>
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
