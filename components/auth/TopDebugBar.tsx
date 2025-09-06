"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function TopDebugBar() {
  const [user, setUser] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [allRoles, setAllRoles] = useState<Array<{ nombre_interno: string; nombre_visible: string }>>([]);
  const [selected, setSelected] = useState<string>("");
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
    <div className="fixed top-0 left-0 right-0 z-40 bg-black/60 text-white text-xs py-1 px-3 flex items-center gap-3">
      <div className="truncate">Auth: <span className="font-mono">{user.email}</span></div>
      <div>Rol actual: <span className="font-mono">{roles[0] || "(sin rol)"}</span></div>
      <div className="ml-auto flex items-center gap-2">
        <select
          className="bg-white/10 border border-white/30 rounded px-2 py-1"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Seleccionar rol…</option>
          {allRoles.map((r) => (
            <option key={r.nombre_interno} value={r.nombre_interno}>{r.nombre_visible} ({r.nombre_interno})</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={onChangeRole}>Cambiar</Button>
      </div>
    </div>
  );
}
