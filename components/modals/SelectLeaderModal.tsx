"use client";
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputSistema, BotonSistema } from '@/components/ui/sistema-diseno';

interface UsuarioLite {
  id: string;
  nombre: string;
  apellido: string;
  email?: string;
  foto_perfil_url?: string | null;
}

interface SelectLeaderModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (usuario: UsuarioLite) => void;
  initialQuery?: string;
  title?: string;
  description?: string;
}

export default function SelectLeaderModal({ open, onClose, onSelect, initialQuery = '', title = 'Seleccionar Líder', description = 'Busca y selecciona a la persona que será líder inicial del grupo.' }: SelectLeaderModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioLite[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = (q: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q, limit: '15' });
        const res = await fetch(`/api/usuarios/buscar-para-relacion?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) {
          setError(`Error ${res.status}`);
          setUsuarios([]);
          return;
        }
        const data = await res.json();
        setUsuarios(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setError('Fallo en la búsqueda');
        }
      } finally {
        setLoading(false);
      }
    }, 320);
  };

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      buscar(initialQuery);
    } else {
      setUsuarios([]);
      setError(null);
    }
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    buscar(query);
  }, [query, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <InputSistema
            autoFocus
            placeholder="Buscar por nombre, apellido o email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={`border border-border rounded-xl bg-card/50 max-h-80 overflow-auto relative ${loading ? 'opacity-80' : ''}`}>
            {loading && usuarios.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Buscando…</div>
            )}
            {!loading && error && (
              <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
            )}
            {!loading && !error && usuarios.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Sin resultados</div>
            )}
            <ul>
              {usuarios.map(u => (
                <li key={u.id} className="p-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => { onSelect(u); onClose(); }}>
                  <div className="flex items-center gap-3">
                    {u.foto_perfil_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.foto_perfil_url} alt={u.nombre} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-200 to-pink-200 flex items-center justify-center text-xs font-semibold text-foreground">
                        {u.nombre?.[0]}{u.apellido?.[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{u.nombre} {u.apellido}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email || 'Sin email'}</div>
                    </div>
                    <BotonSistema tamaño="sm" variante="secundario" className="shrink-0">Elegir</BotonSistema>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <BotonSistema variante="outline" onClick={onClose}>Cancelar</BotonSistema>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
