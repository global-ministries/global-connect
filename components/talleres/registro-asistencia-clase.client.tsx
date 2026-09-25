"use client";

/**
 * T3 (odd/tasks/talleres-asistencia-lider.md) — register form for ONE clase
 * on /talleres/[taller]/[edicion]/[grupo].
 *
 * Adopts the PATTERN of components/grupos/AttendanceRegister.client.tsx —
 * Grupos de Vida is untouchable, so nothing is imported from it: todos
 * presentes por defecto, the motivo input only appears once a person is
 * unmarked, two bulk shortcuts (sm:hidden / hidden sm:inline label pairs),
 * one counter, one save button. What talleres adds:
 *
 *   - previous marks (taller_asistencias via loadAsistenciaPorClase) win
 *     over the default, so an edit never silently resets yesterday's list;
 *   - guardar sends ONE batched POST with every marca of the roster to
 *     /api/talleres/sesiones/[id]/asistencia → talleres_registrar_asistencia
 *     (one round trip, one audit transaction, criterio 5);
 *   - the motivo travels ONLY for ausente — a stale motivo must never be
 *     written over a person that is present again;
 *   - every control is min-h-[44px] (docs/talleres-de-punta-a-punta.md §9).
 *
 * Props are plain JSON (string | number | null | array of plain objects) —
 * this island is reached from the server page, so every value crossing the
 * RSC boundary must serialize (lección del paso 5).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonSistema, InputSistema, TituloSistema, TextoSistema } from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";

export interface RegistroAsistenciaFila {
  readonly id: string;
  readonly nombre: string;
}

export interface RegistroAsistenciaMarca {
  readonly inscripcionId: string;
  readonly estado: "presente" | "ausente";
  readonly motivo?: string | null;
}

interface RegistroAsistenciaClaseProps {
  readonly sesionId: string;
  readonly numero: number;
  readonly tema: string | null;
  /** The roster (aprobadas of the grupo) — NOT the already-marked rows. */
  readonly filas: readonly RegistroAsistenciaFila[];
  /** Previous marks for this clase; unknown inscripciones are ignored. */
  readonly marcasPrevias?: readonly RegistroAsistenciaMarca[];
}

type Estado = "presente" | "ausente";

interface Marca {
  readonly estado: Estado;
  readonly motivo: string;
}

type Marcas = Readonly<Record<string, Marca>>;

const FALLBACK_ERROR = "No se pudo guardar la asistencia.";

/** Seed: previa > default. Only rows that exist in the roster are kept. */
function sembrar(
  filas: readonly RegistroAsistenciaFila[],
  previas: readonly RegistroAsistenciaMarca[] | undefined,
): Marcas {
  const previaById = new Map((previas ?? []).map((m) => [m.inscripcionId, m]));
  const marcas: Record<string, Marca> = {};
  for (const fila of filas) {
    const previa = previaById.get(fila.id);
    marcas[fila.id] = previa
      ? { estado: previa.estado, motivo: previa.motivo ?? "" }
      : { estado: "presente", motivo: "" };
  }
  return marcas;
}

export function RegistroAsistenciaClase({
  sesionId,
  numero,
  tema,
  filas,
  marcasPrevias,
}: RegistroAsistenciaClaseProps) {
  const router = useRouter();
  const { success, error } = useNotificaciones();
  const [marcas, setMarcas] = useState<Marcas>(() => sembrar(filas, marcasPrevias));
  const [guardando, setGuardando] = useState(false);

  const presentes = filas.filter((f) => marcas[f.id]?.estado === "presente").length;
  const titulo = tema ? `Clase ${numero} · ${tema}` : `Clase ${numero}`;

  function alternar(id: string): void {
    setMarcas((actual) => {
      const marca = actual[id];
      if (!marca) return actual;
      // Re-marking clears the motivo: a stale reason must never travel.
      return {
        ...actual,
        [id]: { estado: marca.estado === "presente" ? "ausente" : "presente", motivo: "" },
      };
    });
  }

  function marcarTodos(estado: Estado): void {
    setMarcas(() => {
      const siguiente: Record<string, Marca> = {};
      for (const fila of filas) siguiente[fila.id] = { estado, motivo: "" };
      return siguiente;
    });
  }

  function ponerMotivo(id: string, motivo: string): void {
    setMarcas((actual) => {
      const marca = actual[id];
      if (!marca) return actual;
      return { ...actual, [id]: { ...marca, motivo } };
    });
  }

  async function guardar(): Promise<void> {
    if (guardando) return;
    setGuardando(true);
    try {
      const lote = filas.map((fila) => {
        const marca = marcas[fila.id] ?? { estado: "presente" as Estado, motivo: "" };
        const cuerpo: { inscripcion_id: string; estado: Estado; motivo?: string } = {
          inscripcion_id: fila.id,
          estado: marca.estado,
        };
        if (marca.estado === "ausente" && marca.motivo.trim().length > 0) {
          cuerpo.motivo = marca.motivo.trim();
        }
        return cuerpo;
      });

      const res = await fetch(`/api/talleres/sesiones/${sesionId}/asistencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcas: lote }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        error(data?.message || FALLBACK_ERROR);
        return;
      }

      success("Asistencia guardada.");
      router.refresh();
    } catch {
      error(FALLBACK_ERROR);
    } finally {
      setGuardando(false);
    }
  }

  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4">
        <TituloSistema nivel={3} className="mb-1">
          {titulo}
        </TituloSistema>
        <TextoSistema variante="sutil" tamaño="sm">
          No hay participantes aprobados en este grupo todavía; pasá la lista cuando se sumen.
        </TextoSistema>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border p-4" aria-label={titulo}>
      <TituloSistema nivel={3} className="mb-3">
        {titulo}
      </TituloSistema>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <BotonSistema
          variante="outline"
          className="flex-1 sm:flex-none"
          onClick={() => marcarTodos("presente")}
        >
          <span className="sm:hidden">✓ Todos presentes</span>
          <span className="hidden sm:inline">Marcar todos presentes</span>
        </BotonSistema>
        <BotonSistema
          variante="outline"
          className="flex-1 sm:flex-none"
          onClick={() => marcarTodos("ausente")}
        >
          <span className="sm:hidden">✗ Todos ausentes</span>
          <span className="hidden sm:inline">Marcar todos ausentes</span>
        </BotonSistema>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {filas.map((fila) => {
          const marca = marcas[fila.id] ?? { estado: "presente" as Estado, motivo: "" };
          const presente = marca.estado === "presente";
          return (
            <li key={fila.id} className="p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={presente}
                  aria-label={fila.nombre}
                  onClick={() => alternar(fila.id)}
                  className="flex min-h-[44px] flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={
                      presente
                        ? "flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-primary bg-primary text-primary-foreground"
                        : "flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-input"
                    }
                  >
                    {presente ? "✓" : ""}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{fila.nombre}</span>
                </button>
                <span
                  className={
                    presente
                      ? "rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                      : "rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive"
                  }
                >
                  {presente ? "Presente" : "Ausente"}
                </span>
              </div>

              {!presente && (
                <div className="mt-2 sm:ml-8">
                  <InputSistema
                    aria-label={`Motivo de ausencia de ${fila.nombre}`}
                    placeholder="Motivo de ausencia (opcional)"
                    value={marca.motivo}
                    onChange={(e) => ponerMotivo(fila.id, e.target.value)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Presentes: {presentes} / {filas.length}
        </div>
        <BotonSistema
          cargando={guardando}
          disabled={guardando}
          onClick={() => {
            void guardar();
          }}
        >
          Guardar asistencia
        </BotonSistema>
      </div>
    </section>
  );
}
