"use client";

import React from "react";

type Attendee = {
  id: string;
  nombre?: string;
  apellido?: string;
  rol?: string | null;
  presente: boolean;
  motivo?: string | null;
};

export default function AttendanceList({ attendees }: { attendees: Attendee[] }) {
  const presentes = attendees.filter((a) => a.presente);
  const ausentes = attendees.filter((a) => !a.presente);
  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl border p-4">
        <div className="font-medium mb-2">Presentes ({presentes.length})</div>
        <ul className="space-y-2">
          {presentes.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span>{[p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre"}</span>
              {p.rol && <span className="text-xs text-muted-foreground">{p.rol}</span>}
            </li>
          ))}
          {presentes.length === 0 && (
            <li className="text-sm text-muted-foreground">Sin registros</li>
          )}
        </ul>
      </div>
      <div className="rounded-xl border p-4">
        <div className="font-medium mb-2">Ausentes ({ausentes.length})</div>
        <ul className="space-y-2">
          {ausentes.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3">
              <div>
                <div>{[p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre"}</div>
                {p.motivo && (
                  <div className="text-xs text-muted-foreground">Motivo: {p.motivo}</div>
                )}
              </div>
              {p.rol && <span className="text-xs text-muted-foreground">{p.rol}</span>}
            </li>
          ))}
          {ausentes.length === 0 && (
            <li className="text-sm text-muted-foreground">Sin registros</li>
          )}
        </ul>
      </div>
    </div>
  );
}
