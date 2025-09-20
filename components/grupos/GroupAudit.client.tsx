"use client";
import React, { useEffect, useMemo, useState } from "react";
import { TarjetaSistema, BotonSistema, BadgeSistema, InputSistema, TituloSistema } from "@/components/ui/sistema-diseno";
import { Download, Filter } from "lucide-react";

type AuditItem = {
  id: string;
  happened_at: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  grupo_id: string;
  usuario_id: string;
  actor_auth_id: string | null;
  actor_usuario_id: string | null;
  actor_nombre?: string | null;
  usuario_nombre?: string | null;
  usuario_email?: string | null;
  old_data: any | null;
  new_data: any | null;
  total_count?: number;
};

function BadgeAuditoria({ children, color }: { children: React.ReactNode; color: "green" | "yellow" | "red" }) {
  const variante = color === "green" ? "success" : color === "yellow" ? "warning" : "error";
  return <BadgeSistema variante={variante}>{children}</BadgeSistema>;
}

export default function GroupAudit({ grupoId }: { grupoId: string }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;
  const [action, setAction] = useState<"" | "CREATE" | "UPDATE" | "DELETE">("");
  const [actor, setActor] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

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
      if (action) url.searchParams.set("action", action);
      if (actor) url.searchParams.set("actor", actor);
      if (desde) url.searchParams.set("desde", new Date(desde).toISOString());
      if (hasta) url.searchParams.set("hasta", new Date(hasta).toISOString());
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
  }, [grupoId, action, actor, desde, hasta]);

  const rolLabel = (rol: string | null | undefined) => {
    if (!rol) return rol;
    return rol === 'Colíder' ? 'Aprendiz' : rol;
  };

  function renderDiff(it: AuditItem) {
    const oldRol = it.old_data?.rol ?? null;
    const newRol = it.new_data?.rol ?? null;
    if (oldRol || newRol) {
      return (
        <div className="text-sm">
          <span className="font-medium text-gray-700">Cambio de rol:</span>
          <div className="flex items-center gap-2 mt-1">
            <BadgeSistema variante={oldRol ? "info" : "default"}>
              {oldRol ? rolLabel(oldRol) : "Sin rol"}
            </BadgeSistema>
            <span className="text-gray-400">→</span>
            <BadgeSistema variante={newRol ? "success" : "default"}>
              {newRol ? rolLabel(newRol) : "Sin rol"}
            </BadgeSistema>
          </div>
        </div>
      );
    }
    return null;
  }

  function exportCsv() {
    const headers = [
      "fecha","accion","actor","usuario","usuario_email","old_rol","new_rol"
    ];
    const rows = items.map((it) => [
      new Date(it.happened_at).toISOString(),
      it.action,
      it.actor_nombre || "",
      it.usuario_nombre || it.usuario_id,
      it.usuario_email || "",
      rolLabel(it.old_data?.rol ?? "") || "",
      rolLabel(it.new_data?.rol ?? "") || "",
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_miembros_${grupoId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Encabezado con título */}
      <div className="flex items-center justify-between">
        <TituloSistema nivel={2}>Historial de cambios</TituloSistema>
      </div>

      {/* Panel de filtros - Móvil y Desktop */}
      <TarjetaSistema className="p-4">
        {/* Botones de acción - Responsive */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <BotonSistema 
              onClick={() => exportCsv()} 
              variante="outline" 
              tamaño="md"
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </BotonSistema>
            <BotonSistema
              onClick={() => load(0)}
              variante="primario"
              tamaño="md"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <Filter className="w-4 h-4 mr-2" />
              {loading ? 'Cargando...' : 'Aplicar filtros'}
            </BotonSistema>
          </div>
        </div>

        {/* Filtros - Grid Responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Acción</label>
            <select 
              value={action} 
              onChange={(e) => setAction(e.target.value as any)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">Todas las acciones</option>
              <option value="CREATE">Alta</option>
              <option value="UPDATE">Cambio</option>
              <option value="DELETE">Baja</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actor</label>
            <input 
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="Nombre del actor"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input 
              type="date" 
              value={desde} 
              onChange={(e) => setDesde(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input 
              type="date" 
              value={hasta} 
              onChange={(e) => setHasta(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" 
            />
          </div>
        </div>
      </TarjetaSistema>
      {error && (
        <TarjetaSistema className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </TarjetaSistema>
      )}
      
      {items.length === 0 && !loading && !error && (
        <TarjetaSistema className="p-8 text-center">
          <p className="text-gray-500">No hay movimientos registrados.</p>
        </TarjetaSistema>
      )}
      
      <div className="space-y-2 sm:space-y-3">
        {items.map((it) => {
          const date = new Date(it.happened_at);
          return (
            <div key={it.id}>
              {/* Versión Móvil - Lista Simple */}
              <div className="sm:hidden flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                <div className="flex-shrink-0">
                  {it.action === "CREATE" && <BadgeAuditoria color="green">Alta</BadgeAuditoria>}
                  {it.action === "UPDATE" && <BadgeAuditoria color="yellow">Cambio</BadgeAuditoria>}
                  {it.action === "DELETE" && <BadgeAuditoria color="red">Baja</BadgeAuditoria>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">
                    {it.usuario_nombre || it.usuario_id}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {it.actor_nombre || '—'} • {date.toLocaleDateString()}
                  </div>
                  {renderDiff(it) && (
                    <div className="mt-1">
                      {renderDiff(it)}
                    </div>
                  )}
                </div>
              </div>

              {/* Versión Desktop - Tarjeta Completa */}
              <TarjetaSistema className="hidden sm:block">
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {it.action === "CREATE" && <BadgeAuditoria color="green">Alta</BadgeAuditoria>}
                      {it.action === "UPDATE" && <BadgeAuditoria color="yellow">Cambio</BadgeAuditoria>}
                      {it.action === "DELETE" && <BadgeAuditoria color="red">Baja</BadgeAuditoria>}
                      <span className="text-sm text-gray-600 font-medium">{date.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Actor:</span>
                      <span className="ml-2 text-gray-600">{it.actor_nombre || '—'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Usuario:</span>
                      <span className="ml-2 text-gray-600">
                        {it.usuario_nombre || it.usuario_id}
                        {it.usuario_email && <span className="text-gray-500"> ({it.usuario_email})</span>}
                      </span>
                    </div>
                  </div>
                  {renderDiff(it) && (
                    <div className="pt-2 border-t border-gray-200">
                      {renderDiff(it)}
                    </div>
                  )}
                </div>
              </TarjetaSistema>
            </div>
          );
        })}
      </div>
      
      {/* Paginación - Responsive */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100">
        <div className="order-2 sm:order-1">
          <span className="text-sm text-gray-500 font-medium">
            Mostrando {items.length} de {total || 0} registros
          </span>
        </div>
        <div className="order-1 sm:order-2">
          <BotonSistema
            onClick={() => load(page + 1)}
            variante={canLoadMore ? "primario" : "outline"}
            tamaño="md"
            disabled={loading || !canLoadMore}
            className="w-full sm:w-auto"
          >
            {loading ? "Cargando..." : canLoadMore ? "Cargar más" : "No hay más"}
          </BotonSistema>
        </div>
      </div>
    </div>
  );
}
