"use client";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputSistema, SelectSistema, BotonSistema } from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";
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

type RolGrupo = "Líder" | "Colíder" | "Miembro";

const roles: Array<{ value: RolGrupo; label: string }> = [
  { value: "Líder", label: "Líder" },
  { value: "Colíder", label: "Aprendiz" },
  { value: "Miembro", label: "Miembro" },
];

export default function AddMemberModal({ isOpen, onClose, grupoId, segmentoNombre }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RolGrupo>("Miembro");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserLite | null>(null);
  const router = useRouter();
  const toast = useNotificaciones();

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
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Error al buscar usuarios");
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error al agregar" }));
        throw new Error(data.error || "No se pudo agregar al miembro");
      }

      const data = await res.json();

      if (data.modo === "solicitud") {
        toast.success("Solicitud creada — pendiente de aprobación por un director");
      } else if (esSegmentoMatrimonio) {
        toast.success("Miembro y cónyuge agregados correctamente al grupo");
      } else {
        toast.success("Miembro agregado correctamente");
      }

      router.refresh();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar al miembro");
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
              <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <span className="text-blue-700 dark:text-blue-400 text-sm font-medium">
                  💑 Segmento de matrimonio: Se agregará automáticamente al cónyuge también
                </span>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <InputSistema
            placeholder="Buscar por nombre, apellido, email o teléfono"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="max-h-64 overflow-auto rounded-xl border border-border bg-card/50">
                {loading ? (
                  <div className="p-4 text-sm text-muted-foreground">Buscando…</div>
                ) : users.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Sin resultados</div>
                ) : (
                  <ul>
                    {users.map((u) => (
                      <li
                        key={u.id}
                        className={`p-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/50 transition-colors ${selectedUser?.id === u.id ? "bg-accent" : ""}`}
                        onClick={() => setSelectedUser(u)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium text-foreground">{u.nombre} {u.apellido}</div>
                            <div className="text-sm text-muted-foreground">{u.email || "Sin email"} · {u.telefono || "Sin teléfono"}</div>
                          </div>
                          {u.ya_es_miembro && (
                            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Ya es miembro</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <SelectSistema
                label="Rol en el grupo"
                value={role}
                onValueChange={(v) => setRole(v as RolGrupo)}
                opciones={roles.map(r => ({ valor: r.value, etiqueta: r.label }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <BotonSistema variante="outline" onClick={onClose} disabled={loading}>Cancelar</BotonSistema>
            <BotonSistema variante="primario" onClick={handleAdd} disabled={!selectedUser || loading} cargando={loading}>
              Agregar
            </BotonSistema>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
