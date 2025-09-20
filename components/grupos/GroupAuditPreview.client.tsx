"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

type AuditItem = {
  id: string;
  happened_at: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  old_data: any | null;
  new_data: any | null;
};

function Badge({ children, color }: { children: React.ReactNode; color: "green" | "yellow" | "red" }) {
  const cls =
    color === "green"
      ? "bg-green-100 text-green-700"
      : color === "yellow"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{children}</span>;
}

export default function GroupAuditPreview({ grupoId }: { grupoId: string }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(`/api/auditoria/miembros`, window.location.origin);
        url.searchParams.set("grupoId", grupoId);
        url.searchParams.set("limit", "2");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (res.status === 401) {
          setError("No autorizado");
        } else if (!res.ok) {
          throw new Error(await res.text());
        } else {
          const data = (await res.json()) as AuditItem[];
          setItems(data);
        }
      } catch (e: any) {
        setError(e?.message || "Error al cargar auditoría");
      } finally {
        setLoading(false);
      }
    })();
  }, [grupoId]);

  const renderDiff = (it: AuditItem) => {
    const oldRol = it.old_data?.rol ?? null;
    const newRol = it.new_data?.rol ?? null;
    if (oldRol || newRol) {
      return (
        <div className="text-xs text-gray-600">
          {"Rol: "}
          <span className="font-medium">{oldRol === 'Colíder' ? 'Aprendiz' : (oldRol ?? "-")}</span>
          {" → "}
          <span className="font-medium">{newRol === 'Colíder' ? 'Aprendiz' : (newRol ?? "-")}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg lg:text-xl font-bold text-gray-800">Últimos cambios</h3>
        <Link
          href={`/dashboard/grupos/${encodeURIComponent(grupoId)}/auditoria`}
          className="text-sm text-blue-600 hover:underline"
        >
          Ver más
        </Link>
      </div>
      {loading && <p className="text-sm text-gray-500">Cargando...</p>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <p className="text-gray-500 text-sm">Sin movimientos recientes.</p>
      )}
      <ul className="space-y-2">
        {items.map((it) => {
          const date = new Date(it.happened_at);
          return (
            <li key={it.id} className="p-3 bg-white/60 rounded-md flex items-start gap-3">
              {it.action === "CREATE" && <Badge color="green">Alta</Badge>}
              {it.action === "UPDATE" && <Badge color="yellow">Cambio</Badge>}
              {it.action === "DELETE" && <Badge color="red">Baja</Badge>}
              <div className="text-xs text-gray-500">{date.toLocaleString()}</div>
              <div className="flex-1">{renderDiff(it)}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
