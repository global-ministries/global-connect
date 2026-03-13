"use client";

import React from "react";
import { BadgeSistema } from "@/components/ui/sistema-diseno";
import { Clock, AlertCircle, User } from "lucide-react";

type Attendee = {
  id: string;
  nombre?: string;
  apellido?: string;
  rol?: string | null;
  presente: boolean;
  motivo?: string | null;
  tipo_presencia?: string;
  tiempo_tardanza?: number | null;
  motivo_tardanza?: string | null;
};

const MOTIVOS_TARDANZA: Record<string, string> = {
  trafico: "Tráfico",
  trabajo: "Trabajo",
  hijos: "Hijos",
  salud: "Salud",
  transporte: "Transporte",
  otro: "Otro",
};

function BadgePresencia({ tipo }: { tipo: string }) {
  switch (tipo) {
    case "presente":
      return <BadgeSistema variante="success" tamaño="sm">Presente</BadgeSistema>;
    case "tarde":
      return <BadgeSistema variante="warning" tamaño="sm">Tarde</BadgeSistema>;
    case "ausente":
      return <BadgeSistema variante="error" tamaño="sm">Ausente</BadgeSistema>;
    case "justificado":
      return <BadgeSistema variante="info" tamaño="sm">Justificado</BadgeSistema>;
    default:
      return <BadgeSistema variante="default" tamaño="sm">{tipo}</BadgeSistema>;
  }
}

export default function AttendanceList({ attendees }: { attendees: Attendee[] }) {
  const presentes = attendees.filter((a) => a.tipo_presencia === "presente");
  const tardes = attendees.filter((a) => a.tipo_presencia === "tarde");
  const ausentes = attendees.filter((a) => a.tipo_presencia === "ausente" || (!a.presente && a.tipo_presencia !== "justificado"));
  const justificados = attendees.filter((a) => a.tipo_presencia === "justificado");

  const renderMiembro = (a: Attendee) => (
    <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm text-foreground truncate">
            {[a.nombre, a.apellido].filter(Boolean).join(" ") || "Sin nombre"}
          </div>
          {a.rol && (
            <span className="text-xs text-muted-foreground">{a.rol}</span>
          )}
          {/* Detalle de tardanza */}
          {a.tipo_presencia === "tarde" && a.tiempo_tardanza && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{a.tiempo_tardanza} min</span>
              {a.motivo_tardanza && (
                <span className="text-muted-foreground">
                  — {MOTIVOS_TARDANZA[a.motivo_tardanza] ?? a.motivo_tardanza}
                </span>
              )}
            </div>
          )}
          {/* Motivo de inasistencia */}
          {a.motivo && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span>{a.motivo}</span>
            </div>
          )}
        </div>
      </div>
      <BadgePresencia tipo={a.tipo_presencia || (a.presente ? "presente" : "ausente")} />
    </li>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presentes + Tardes */}
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2 font-medium mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Presentes ({presentes.length + tardes.length})
        </div>
        <ul className="space-y-0">
          {presentes.map(renderMiembro)}
          {tardes.map(renderMiembro)}
          {presentes.length === 0 && tardes.length === 0 && (
            <li className="text-sm text-muted-foreground py-2">Sin registros</li>
          )}
        </ul>
      </div>

      {/* Ausentes + Justificados */}
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2 font-medium mb-3">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Ausentes ({ausentes.length + justificados.length})
        </div>
        <ul className="space-y-0">
          {ausentes.map(renderMiembro)}
          {justificados.map(renderMiembro)}
          {ausentes.length === 0 && justificados.length === 0 && (
            <li className="text-sm text-muted-foreground py-2">Sin registros</li>
          )}
        </ul>
      </div>
    </div>
  );
}
