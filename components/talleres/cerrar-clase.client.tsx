"use client";

/**
 * T3 (odd/tasks/talleres-asistencia-lider.md) — the "Cerrar clase" action in
 * the Clases list of /talleres/[taller]/[edicion]/[grupo].
 *
 * POSTs to /api/talleres/sesiones/[id]/cerrar → talleres_cerrar_clase, which
 * decides whether THIS caller (the grupo's líder, or their supervisor) may
 * close this sesión — the route only translates the refusal, so no
 * capability is consulted here either. Closing is idempotent, and once the
 * clase is `cerrada` the page stops rendering this control at all
 * (Decisiones: hidden, never disabled) and keeps only the read view.
 *
 * No confirmation dialog: the number of clases per edición is small, closing
 * is reversible by a coordinator (abrir), and §9 only asks for a dialog when
 * the action destroys data — reporte deletion was the case that justified
 * it. Flagged as a deferral in the T3 report.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonSistema } from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";

interface CerrarClaseProps {
  readonly sesionId: string;
}

const FALLBACK_ERROR = "No se pudo cerrar la clase.";

export function CerrarClase({ sesionId }: CerrarClaseProps) {
  const router = useRouter();
  const { success, error } = useNotificaciones();
  const [cargando, setCargando] = useState(false);

  async function cerrar(): Promise<void> {
    if (cargando) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/talleres/sesiones/${sesionId}/cerrar`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        error(data?.message || FALLBACK_ERROR);
        return;
      }
      success("Clase cerrada.");
      router.refresh();
    } catch {
      error(FALLBACK_ERROR);
    } finally {
      setCargando(false);
    }
  }

  return (
    <BotonSistema
      variante="outline"
      tamaño="sm"
      cargando={cargando}
      disabled={cargando}
      onClick={() => {
        void cerrar();
      }}
    >
      Cerrar clase
    </BotonSistema>
  );
}
