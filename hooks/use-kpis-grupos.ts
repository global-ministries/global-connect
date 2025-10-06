import { useEffect, useState, useCallback } from 'react';

interface KpisGrupos {
  total_grupos: number;
  total_con_lider: number;
  pct_con_lider: string | number;
  total_aprobados: number;
  pct_aprobados: string | number;
  promedio_miembros: number | null;
  desviacion_miembros: number | null;
  total_sin_director: number;
  pct_sin_director: string | number;
  fecha_ultima_actualizacion: string;
}

export function useKpisGrupos(options: { refreshIntervalMs?: number } = {}) {
  const { refreshIntervalMs = 60000 } = options;
  const [data, setData] = useState<KpisGrupos | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/grupos/kpis', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (json?.kpis) {
        setData(json.kpis);
      } else {
        setData(null);
      }
    } catch (e: any) {
      setError(e?.message || 'Error cargando KPIs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (refreshIntervalMs > 0) {
      const id = setInterval(fetchData, refreshIntervalMs);
      return () => clearInterval(id);
    }
  }, [fetchData, refreshIntervalMs]);

  return { kpis: data, loading, error, refetch: fetchData };
}
