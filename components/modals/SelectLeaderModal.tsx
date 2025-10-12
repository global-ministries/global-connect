"use client";
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const timeoutRef = useRef<any>(null);

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
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
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
          <Input
            autoFocus
            placeholder="Buscar por nombre, apellido o email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={cn('border rounded-lg bg-white max-h-80 overflow-auto relative', loading && 'opacity-80')}> 
            {loading && usuarios.length === 0 && (
              <div className="p-4 text-sm text-gray-500">Buscando…</div>
            )}
            {!loading && error && (
              <div className="p-4 text-sm text-red-600">{error}</div>
            )}
            {!loading && !error && usuarios.length === 0 && (
              <div className="p-4 text-sm text-gray-500">Sin resultados</div>
            )}
            <ul>
              {usuarios.map(u => (
                <li key={u.id} className="p-3 border-b last:border-b-0 cursor-pointer hover:bg-orange-50" onClick={() => { onSelect(u); onClose(); }}>
                  <div className="flex items-center gap-3">
                    {u.foto_perfil_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.foto_perfil_url} alt={u.nombre} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-200 to-pink-200 flex items-center justify-center text-xs font-semibold text-gray-700">
                        {u.nombre?.[0]}{u.apellido?.[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{u.nombre} {u.apellido}</div>
                      <div className="text-xs text-gray-500 truncate">{u.email || 'Sin email'}</div>
                    </div>
                    <Button size="sm" variant="secondary" className="shrink-0">Elegir</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
