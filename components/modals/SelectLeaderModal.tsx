"use client";
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputSistema, BotonSistema, BadgeSistema } from '@/components/ui/sistema-diseno';

interface GrupoResumen {
  nombre: string;
  temporada: string;
}

interface LiderConEstado {
  id: string;
  nombre: string;
  apellido: string;
  email?: string | null;
  foto_perfil_url?: string | null;
  estado: 'disponible' | 'liderando' | 'planificacion' | 'liderando_y_planificacion';
  grupos_activos: GrupoResumen[];
  grupos_planificacion: GrupoResumen[];
  en_segmento_actual: boolean;
}

interface SelectLeaderModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (usuario: { id: string; nombre: string; apellido: string; email?: string; foto_perfil_url?: string | null }) => void;
  initialQuery?: string;
  segmentoId?: string;
  title?: string;
  description?: string;
}

const ESTADO_CONFIG = {
  disponible: { variante: 'success' as const, texto: 'Disponible' },
  liderando: { variante: 'warning' as const, texto: 'Liderando grupo' },
  planificacion: { variante: 'info' as const, texto: 'En planificación' },
  liderando_y_planificacion: { variante: 'warning' as const, texto: 'Liderando + planificación' },
} as const;

export default function SelectLeaderModal({
  open,
  onClose,
  onSelect,
  initialQuery = '',
  segmentoId,
  title = 'Seleccionar Líder',
  description = 'Busca entre los líderes del sistema. Los disponibles aparecen primero.',
}: SelectLeaderModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lideres, setLideres] = useState<LiderConEstado[]>([]);
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
        const params = new URLSearchParams({ q, limit: '200' });
        if (segmentoId) params.set('segmento_id', segmentoId);
        const res = await fetch(`/api/lideres/buscar?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          setError(`Error ${res.status}`);
          setLideres([]);
          return;
        }
        const data = await res.json();
        setLideres(Array.isArray(data.lideres) ? data.lideres : []);
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
      setLideres([]);
      setError(null);
    }
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    buscar(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <InputSistema
            autoFocus
            placeholder="Buscar por nombre, apellido o email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {/* Leyenda */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Disponible
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Liderando
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> En planificación
            </span>
          </div>

          <div
            className={`border border-border rounded-xl bg-card/50 flex-1 overflow-auto relative ${loading ? 'opacity-80' : ''}`}
            style={{ maxHeight: '400px' }}
          >
            {loading && lideres.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Buscando líderes…</div>
            )}
            {!loading && error && (
              <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
            )}
            {!loading && !error && lideres.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Sin resultados. Intenta con otro nombre.</div>
            )}
            <ul>
              {lideres.map((lider) => {
                const config = ESTADO_CONFIG[lider.estado] ?? { variante: 'default' as const, texto: lider.estado };

                return (
                  <li
                    key={lider.id}
                    className="p-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      onSelect({
                        id: lider.id,
                        nombre: lider.nombre,
                        apellido: lider.apellido,
                        email: lider.email || undefined,
                        foto_perfil_url: lider.foto_perfil_url,
                      });
                      onClose();
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      {lider.foto_perfil_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={lider.foto_perfil_url}
                          alt={lider.nombre}
                          className="w-10 h-10 rounded-full object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-200 to-pink-200 flex items-center justify-center text-xs font-semibold text-foreground shrink-0 mt-0.5">
                          {lider.nombre?.[0]}{lider.apellido?.[0]}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground truncate">
                            {lider.nombre} {lider.apellido}
                          </span>
                          <BadgeSistema variante={config.variante} tamaño="sm">
                            {config.texto}
                          </BadgeSistema>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {lider.email || 'Sin email'}
                        </div>

                        {/* Grupos activos */}
                        {lider.grupos_activos.length > 0 && (
                          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            <span className="font-medium">Lidera: </span>
                            {lider.grupos_activos.map((g, i) => (
                              <span key={i}>
                                {g.nombre}
                                <span className="text-muted-foreground"> ({g.temporada})</span>
                                {i < lider.grupos_activos.length - 1 && ', '}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Grupos en planificación */}
                        {lider.grupos_planificacion.length > 0 && (
                          <div className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                            <span className="font-medium">Planificación: </span>
                            {lider.grupos_planificacion.map((g, i) => (
                              <span key={i}>
                                {g.nombre}
                                <span className="text-muted-foreground"> ({g.temporada})</span>
                                {i < lider.grupos_planificacion.length - 1 && ', '}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Botón elegir */}
                      <BotonSistema tamaño="sm" variante="secundario" className="shrink-0 mt-0.5">
                        Elegir
                      </BotonSistema>
                    </div>
                  </li>
                );
              })}
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
