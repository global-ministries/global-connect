"use client";

/**
 * T2 (odd/tasks/talleres-asistencia-lider.md) — read view of ONE marked
 * clase on /talleres/[taller]/[edicion]/[grupo].
 *
 * Re-implements the PATTERN of components/grupos/AttendanceList.client.tsx
 * — Grupos de Vida is untouchable, so nothing is imported from it: two
 * columns (presentes / ausentes), one BadgeSistema per row, and the motivo
 * shown only under an absent person. What talleres adds: the clase's own
 * title, "Clase {numero} · {tema}" falling back to "Clase {numero}" when
 * taller_sesiones.tema is NULL (never inventing a name), a third column
 * for estado='no_aplica' rendered only when there is at least one such row
 * (rows are never dropped), and the estado → label/variante map of
 * components/talleres/labels.ts, so no raw catalogue key reaches the user
 * (docs/talleres-de-punta-a-punta.md §9).
 *
 * Props are plain JSON (number | string | null | array of objects) — this
 * island is reached from the server page, so every value crossing the RSC
 * boundary must serialize (lección del paso 5).
 */

import { AlertCircle } from "lucide-react";

import { BadgeSistema, TextoSistema, TituloSistema } from "@/components/ui/sistema-diseno";
import {
  asistenciaEstadoBadgeVariante,
  asistenciaEstadoLabel,
} from "@/components/talleres/labels";

export interface AsistenciaFila {
  readonly id: string;
  readonly nombre: string;
  readonly estado: "presente" | "ausente" | "no_aplica";
  /** Only shown when estado='ausente' (DB CHECK) — see labels.ts. */
  readonly motivo: string | null;
}

interface LecturaAsistenciaClaseProps {
  readonly numero: number;
  readonly tema: string | null;
  readonly filas: readonly AsistenciaFila[];
}

interface Columna {
  readonly clave: string;
  readonly titulo: string;
  readonly filas: readonly AsistenciaFila[];
}

export function LecturaAsistenciaClase({ numero, tema, filas }: LecturaAsistenciaClaseProps) {
  const presentes = filas.filter((f) => f.estado === "presente");
  const ausentes = filas.filter((f) => f.estado === "ausente");
  const noAplica = filas.filter((f) => f.estado === "no_aplica");

  const columnas: readonly Columna[] = [
    { clave: "presentes", titulo: "Presentes", filas: presentes },
    { clave: "ausentes", titulo: "Ausentes", filas: ausentes },
    ...(noAplica.length > 0
      ? [{ clave: "no-aplica", titulo: "No aplica", filas: noAplica }]
      : []),
  ];

  return (
    <div>
      <TituloSistema nivel={3} className="mb-3">
        {tema ? `Clase ${numero} · ${tema}` : `Clase ${numero}`}
      </TituloSistema>
      <div
        className={
          columnas.length === 3
            ? "grid grid-cols-1 gap-6 lg:grid-cols-3"
            : "grid grid-cols-1 gap-6 lg:grid-cols-2"
        }
      >
        {columnas.map((columna) => (
          <div key={columna.clave} className="rounded-xl border border-border/60 p-4">
            <div className="mb-3 flex items-center gap-2 font-medium">
              {columna.titulo} ({columna.filas.length})
            </div>
            <ul className="space-y-0">
              {columna.filas.length === 0 ? (
                <li className="py-2 text-sm text-muted-foreground">Sin registros</li>
              ) : (
                columna.filas.map((fila) => (
                  <li
                    key={fila.id}
                    className="flex items-start justify-between gap-3 border-b border-border/50 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {fila.nombre}
                      </div>
                      {fila.estado === "ausente" && fila.motivo && (
                        <div className="mt-1 flex items-start gap-1.5">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <TextoSistema variante="sutil" tamaño="sm" className="min-w-0">
                            {fila.motivo}
                          </TextoSistema>
                        </div>
                      )}
                    </div>
                    <BadgeSistema
                      variante={asistenciaEstadoBadgeVariante(fila.estado)}
                      tamaño="sm"
                    >
                      {asistenciaEstadoLabel(fila.estado)}
                    </BadgeSistema>
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
