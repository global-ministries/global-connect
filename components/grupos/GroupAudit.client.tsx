"use client";
import React, { useEffect, useMemo, useState } from "react";

type AuditItem = {
  id: string;
  happened_at: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  grupo_id: string;
  usuario_id: string;
  actor_auth_id: string | null;
  actor_usuario_id: string | null;
  old_data: any | null;
  new_data: any | null;
  total_count?: number;
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

export default function GroupAudit({ grupoId }: { grupoId: string }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;

  const total = useMemo(() => (items.length > 0 ? items[0].total_count ?? 0 : 0), [items]);
  const canLoadMore = (page + 1) * limit < total;

  async function load(nextPage = 0) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/auditoria/miembros`, window.location.origin);
      url.searchParams.set("grupoId", grupoId);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(nextPage * limit));
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.status === 401) {
        setError("No autorizado");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AuditItem[];
      setPage(nextPage);
      setItems(nextPage === 0 ? data : [...items, ...data]);
    } catch (e: any) {
      setError(e?.message || "Error al cargar auditoría");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId]);

  function renderDiff(it: AuditItem) {
    const oldRol = it.old_data?.rol ?? null;
    const newRol = it.new_data?.rol ?? null;
    if (oldRol || newRol) {
      return (
        <div className="text-xs text-gray-600">
          Rol: <span className="font-medium">{oldRol ?? "-"}</span> → <span className="font-medium">{newRol ?? "-"}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg lg:text-xl font-bold text-gray-800">Historial de cambios</h3>
        <button
          onClick={() => load(0)}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
          disabled={loading}
        >
          Recargar
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {items.length === 0 && !loading && !error && (
        <p className="text-gray-500 text-sm">No hay movimientos registrados.</p>
      )}
      <ul className="space-y-2">
        {items.map((it) => {
          const date = new Date(it.happened_at);
          return (
            <li key={it.id} className="p-3 bg-white/60 rounded-md flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {it.action === "CREATE" && <Badge color="green">Alta</Badge>}
                  {it.action === "UPDATE" && <Badge color="yellow">Cambio</Badge>}
                  {it.action === "DELETE" && <Badge color="red">Baja</Badge>}
                  <span className="text-xs text-gray-500">{date.toLocaleString()}</span>
                </div>
                {renderDiff(it)}
              </div>
              {/* Placeholder para actor o más info futura */}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <button
          onClick={() => load(page + 1)}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white disabled:opacity-50"
          disabled={loading || !canLoadMore}
        >
          {loading ? "Cargando..." : canLoadMore ? "Cargar más" : "No hay más"}
        </button>
        <span className="text-xs text-gray-500">{items.length}/{total || 0}</span>
      </div>
    </div>
  );
}
