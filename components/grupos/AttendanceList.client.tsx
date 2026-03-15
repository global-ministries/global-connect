"use client";

import React from "react";
import { BadgeSistema } from "@/components/ui/sistema-diseno";
import { Clock, AlertCircle, User, Heart } from "lucide-react";

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

/**
 * Agrupa attendees en parejas usando el mapa de cónyuges real (relaciones_usuarios).
 * Retorna un array con [pareja1_a, pareja1_b, pareja2_a, pareja2_b, ...sueltos]
 */
function agruparPorConyuges(
  attendees: Attendee[],
  conyugeMap: Record<string, string>
): { lista: Attendee[]; parejas: Set<string> } {
  if (attendees.length <= 1 || Object.keys(conyugeMap).length === 0) {
    return { lista: attendees, parejas: new Set() };
  }

  const idSet = new Set(attendees.map((a) => a.id));
  const usados = new Set<string>();
  const resultado: Attendee[] = [];
  const parejas = new Set<string>();

  // Primero: las parejas que están ambos en el listado
  for (const a of attendees) {
    if (usados.has(a.id)) continue;

    const conyugeId = conyugeMap[a.id];
    if (conyugeId && idSet.has(conyugeId) && !usados.has(conyugeId)) {
      const conyuge = attendees.find((b) => b.id === conyugeId);
      if (conyuge) {
        resultado.push(a, conyuge);
        usados.add(a.id);
        usados.add(conyugeId);
        parejas.add(a.id);
        parejas.add(conyugeId);
      }
    }
  }

  // Después: los que no tienen pareja en el listado
  for (const a of attendees) {
    if (!usados.has(a.id)) {
      resultado.push(a);
    }
  }

  return { lista: resultado, parejas };
}

interface AttendanceListProps {
  attendees: Attendee[];
  esMatrimonios?: boolean;
  conyugeMap?: Record<string, string>;
}

export default function AttendanceList({
  attendees,
  esMatrimonios = false,
  conyugeMap = {},
}: AttendanceListProps) {
  const presentes = attendees.filter((a) => a.tipo_presencia === "presente");
  const tardes = attendees.filter((a) => a.tipo_presencia === "tarde");
  const ausentes = attendees.filter(
    (a) => a.tipo_presencia === "ausente" || (!a.presente && a.tipo_presencia !== "justificado")
  );
  const justificados = attendees.filter((a) => a.tipo_presencia === "justificado");

  // Si es grupo de matrimonios, agrupar por cónyuges reales
  const presentesData = esMatrimonios
    ? agruparPorConyuges([...presentes, ...tardes], conyugeMap)
    : { lista: [...presentes, ...tardes], parejas: new Set<string>() };
  const ausentesData = esMatrimonios
    ? agruparPorConyuges([...ausentes, ...justificados], conyugeMap)
    : { lista: [...ausentes, ...justificados], parejas: new Set<string>() };

  const renderMiembro = (
    a: Attendee,
    index: number,
    arr: Attendee[],
    parejasSet: Set<string>
  ) => {
    const esPrimeroDePar =
      esMatrimonios &&
      parejasSet.has(a.id) &&
      index + 1 < arr.length &&
      conyugeMap[a.id] === arr[index + 1].id;

    const esSegundoDePar =
      esMatrimonios &&
      parejasSet.has(a.id) &&
      index > 0 &&
      conyugeMap[a.id] === arr[index - 1].id;

    return (
      <React.Fragment key={a.id}>
        {esPrimeroDePar && (
          <div className="flex items-center gap-1.5 pt-3 pb-1 first:pt-0">
            <Heart className="w-3 h-3 text-pink-400/60" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
              Pareja
            </span>
          </div>
        )}
        <li
          className={`flex items-start justify-between gap-3 py-2.5 ${esSegundoDePar ? "border-b border-border/50 pb-3 mb-1" : !esPrimeroDePar ? "border-b border-border/50" : ""
            } last:border-0`}
        >
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
      </React.Fragment>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presentes + Tardes */}
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2 font-medium mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Presentes ({presentes.length + tardes.length})
        </div>
        <ul className="space-y-0">
          {presentesData.lista.map((a, i, arr) =>
            renderMiembro(a, i, arr, presentesData.parejas)
          )}
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
          {ausentesData.lista.map((a, i, arr) =>
            renderMiembro(a, i, arr, ausentesData.parejas)
          )}
          {ausentes.length === 0 && justificados.length === 0 && (
            <li className="text-sm text-muted-foreground py-2">Sin registros</li>
          )}
        </ul>
      </div>
    </div>
  );
}
