"use client";
import { useState } from "react";
import { BotonSistema } from "@/components/ui/sistema-diseno";
import GroupAudit from "./GroupAudit.client";

export default function AuditViewer({ grupoId }: { grupoId: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <BotonSistema
          onClick={() => setRefreshKey((k) => k + 1)}
          variante="primario"
          tamaño="md"
        >
          Recargar
        </BotonSistema>
      </div>
      <GroupAudit key={refreshKey} grupoId={grupoId} />
    </div>
  );
}
