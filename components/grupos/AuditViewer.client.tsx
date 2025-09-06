"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import GroupAudit from "./GroupAudit.client";

export default function AuditViewer({ grupoId }: { grupoId: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
        >
          Recargar
        </Button>
      </div>
      <GroupAudit key={refreshKey} grupoId={grupoId} />
    </div>
  );
}
