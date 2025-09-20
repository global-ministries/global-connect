"use client";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type UserLite = {
  id: string;
  nombre: string;
  apellido: string;
  email?: string | null;
  telefono?: string | null;
  ya_es_miembro: boolean;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  grupoId: string;
  segmentoNombre?: string;
}

const roles: Array<{ value: "Líder" | "Colíder" | "Miembro"; label: string }> = [
  { value: "Líder", label: "Líder" },
  { value: "Colíder", label: "Colíder" },
  { value: "Miembro", label: "Miembro" },
];

export default function AddMemberModal({ isOpen, onClose, grupoId, segmentoNombre }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"Líder" | "Colíder" | "Miembro">("Miembro");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserLite | null>(null);
  const router = useRouter();

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  const doSearch = async (q: string) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/grupos/${encodeURIComponent(grupoId)}/buscar-usuarios?q=${encodeURIComponent(q || "")}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (e: any) {
        toast.error(e?.message || "Error al buscar usuarios");
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  useEffect(() => {
    if (isOpen) {
      doSearch("");
    }
  }, [isOpen]);

  useEffect(() => {
    doSearch(query);
  }, [query]);

  const handleAdd = async () => {
    if (!selectedUser) return;
    setLoading(true);
    
    const esSegmentoMatrimonio = segmentoNombre?.toLowerCase().includes('matrimonio') || false;
    
    try {
      const res = await fetch(`/api/grupos/${encodeURIComponent(grupoId)}/miembros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          usuarioId: selectedUser.id, 
          rol: role,
          incluirConyuge: esSegmentoMatrimonio
        })
      });
      if (!res.ok) throw new Error(await res.text());
      
      if (esSegmentoMatrimonio) {
        toast.success("Miembro y cónyuge agregados correctamente al grupo");
      } else {
        toast.success("Miembro agregado correctamente");
      }
      
      router.refresh();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo agregar al miembro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir persona al grupo</DialogTitle>
          <DialogDescription>
            Busca una persona y asigna su rol en el grupo.
            {segmentoNombre?.toLowerCase().includes('matrimonio') && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                <span className="text-blue-700 text-sm font-medium">
                  💑 Segmento de matrimonio: Se agregará automáticamente al cónyuge también
                </span>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Buscar por nombre, apellido, email o teléfono"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="max-h-64 overflow-auto rounded-lg border bg-white">
                {loading ? (
                  <div className="p-4 text-sm text-gray-500">Buscando…</div>
                ) : users.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">Sin resultados</div>
                ) : (
                  <ul>
                    {users.map((u) => (
                      <li
                        key={u.id}
                        className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-orange-50 ${selectedUser?.id === u.id ? "bg-orange-100" : ""}`}
                        onClick={() => setSelectedUser(u)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium text-gray-800">{u.nombre} {u.apellido}</div>
                            <div className="text-sm text-gray-500">{u.email || "Sin email"} · {u.telefono || "Sin teléfono"}</div>
                          </div>
                          {u.ya_es_miembro && (
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Ya es miembro</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-2">Rol en el grupo</div>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!selectedUser || loading} className="bg-gradient-to-r from-blue-500 to-cyan-600">
              {loading ? "Agregando…" : "Agregar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
