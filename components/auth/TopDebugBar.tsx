"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function TopDebugBar() {
  const [user, setUser] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [allRoles, setAllRoles] = useState<Array<{ nombre_interno: string; nombre_visible: string }>>([]);
  const [selected, setSelected] = useState<string>("");
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const isAdminOrPastor = useMemo(() => roles.some(r => ["admin", "pastor"].includes(r)), [roles]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      fetchRoles(session?.user?.id);
    });
    fetchRoles(undefined);
    fetchAllRoles();
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRoles(authId?: string | null) {
    const id = authId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!id) return setRoles([]);
    const { data, error } = await supabase.rpc("obtener_roles_usuario", { p_auth_id: id });
    if (error) return setRoles([]);
    const parsed: string[] = Array.isArray(data) ? data.map((r: any) => (typeof r === "string" ? r : r?.nombre_interno)).filter(Boolean) : [];
    setRoles(parsed);
  }

  async function fetchAllRoles() {
    const res = await fetch("/api/debug/roles", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setAllRoles(json.roles || []);
  }

  async function onChangeRole() {
    if (!selected) return;
    const res = await fetch("/api/debug/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol: selected }),
    });
    const json = await res.json();
    if (res.ok) {
      await fetchRoles(user?.id);
    } else {
      console.error(json?.error || "No se pudo cambiar el rol");
    }
  }

  if (!user || !isAdminOrPastor) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-black/60 text-white transition-all duration-300 min-w-0">
      {/* Botón de toggle siempre visible - optimizado para pantallas muy angostas */}
      <div className="flex items-center px-1 py-1 min-w-0">
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="bg-white/20 hover:bg-white/30 px-1 py-0.5 rounded text-[9px] transition-colors flex-shrink-0"
          title={isCollapsed ? "Mostrar barra de debug" : "Ocultar barra de debug"}
        >
          {isCollapsed ? "▼" : "▲"}
        </button>
        {isCollapsed && (
          <span className="text-[8px] text-white/70 ml-1 truncate">
            {roles[0] || "debug"}
          </span>
        )}
      </div>

      {/* Contenido colapsable */}
      {!isCollapsed && (
        <div className="px-1 pb-1">
          {/* Móvil: Layout ultra-compacto para pantallas angostas */}
          <div className="sm:hidden">
            {/* Primera línea: Info del usuario */}
            <div className="flex items-center gap-1 mb-1 min-w-0">
              <span className="text-[8px] truncate flex-1">
                {user.email?.split('@')[0]}
              </span>
              <span className="text-[8px] font-mono bg-white/20 px-1 rounded flex-shrink-0">
                {roles[0] || "sin rol"}
              </span>
            </div>
            {/* Segunda línea: Controles */}
            <div className="flex items-center gap-1">
              <select
                className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-[8px] flex-1 min-w-0"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Cambiar rol</option>
                {allRoles.map((r) => (
                  <option key={r.nombre_interno} value={r.nombre_interno}>{r.nombre_interno}</option>
                ))}
              </select>
              <button 
                onClick={onChangeRole}
                className="bg-white/20 hover:bg-white/30 px-1 py-0.5 rounded text-[8px] flex-shrink-0"
                disabled={!selected}
              >
                ✓
              </button>
            </div>
          </div>

          {/* Desktop: Layout completo */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="truncate text-xs">
                Auth: <span className="font-mono">{user.email}</span>
              </div>
              <div className="text-xs whitespace-nowrap">
                Rol: <span className="font-mono">{roles[0] || "sin rol"}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                className="bg-white/10 border border-white/30 rounded px-2 py-1 text-xs"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Cambiar rol…</option>
                {allRoles.map((r) => (
                  <option key={r.nombre_interno} value={r.nombre_interno}>{r.nombre_visible}</option>
                ))}
              </select>
              <Button 
                size="sm" 
                variant="secondary" 
                onClick={onChangeRole}
                className="text-xs px-3 py-1 h-auto"
              >
                Cambiar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
