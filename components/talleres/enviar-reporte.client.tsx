"use client";

/**
 * T4 (odd/tasks/talleres-asistencia-lider.md) — the "Enviar reporte" action
 * in the Reporte section of /talleres/[taller]/[edicion]/[grupo].
 *
 * POSTs to /api/talleres/grupos/[id]/reporte/enviar → talleres_enviar_
 * reporte, which decides whether THIS caller may send (the grupo's líder,
 * or the supervisor with a capability scoped to the equipo) and whether
 * every clase is cerrada/cancelada — the route only translates the
 * refusal, so no capability is consulted here either (same convention as
 * T3's CerrarClase). The firma is always the caller's own: the function
 * signs with auth.uid(), criterio 3.
 *
 * The page renders this control ONLY when there is something to send: it is
 * hidden — never disabled — while any clase of the grupo is still open
 * (replaced by honest copy counting what is missing) and from anyone who is
 * not the líder (Decisiones, §9). An already-`enviado` reporte answers 409
 * with "Este reporte ya fue enviado."; the toast says so and the screen
 * keeps working.
 *
 * The only prop is a plain string: this island is reached from the server
 * page, so every value crossing the RSC boundary must serialize (lección
 * del paso 5).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonSistema } from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";

interface EnviarReporteProps {
  readonly grupoId: string;
}

const FALLBACK_ERROR = "No se pudo enviar el reporte.";

export function EnviarReporte({ grupoId }: EnviarReporteProps) {
  const router = useRouter();
  const { success, error } = useNotificaciones();
  const [enviando, setEnviando] = useState(false);

  async function enviar(): Promise<void> {
    if (enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/talleres/grupos/${grupoId}/reporte/enviar`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        error(data?.message || FALLBACK_ERROR);
        return;
      }
      success("Reporte enviado.");
      router.refresh();
    } catch {
      error(FALLBACK_ERROR);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <BotonSistema
      cargando={enviando}
      disabled={enviando}
      onClick={() => {
        void enviar();
      }}
    >
      Enviar reporte
    </BotonSistema>
  );
}
