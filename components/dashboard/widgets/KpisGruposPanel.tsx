"use client";

import { useKpisGrupos } from '@/hooks/use-kpis-grupos';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KpiTileProps {
	label: string;
	value: string | number | null | undefined;
	sub?: string;
	highlight?: 'warn' | 'ok' | 'neutral';
}

function KpiTile({ label, value, sub, highlight = 'neutral' }: KpiTileProps) {
	const colors = {
		warn: 'bg-amber-50 border-amber-200 text-amber-800',
		ok: 'bg-emerald-50 border-emerald-200 text-emerald-700',
		neutral: 'bg-white border-gray-200 text-gray-800'
	} as const;
	return (
		<div className={`rounded-lg border p-4 shadow-sm flex flex-col gap-1 ${colors[highlight]}`}>        
			<span className="text-xs font-medium tracking-wide uppercase text-gray-500">{label}</span>
			<span className="text-xl font-semibold leading-none">{value ?? '—'}</span>
			{sub && <span className="text-[11px] text-gray-500">{sub}</span>}
		</div>
	);
}

export default function KpisGruposPanel() {
	const { kpis, loading, error, refetch } = useKpisGrupos({ refreshIntervalMs: 60000 });

	return (
		<Card className="p-5 space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-sm font-semibold text-gray-800 leading-tight">KPIs de Grupos</h3>
					<p className="text-xs text-gray-500 mt-1">Visión resumida según tu rol y alcance actual.</p>
				</div>
				<div className="flex items-center gap-2">
					<Button size="icon" variant="outline" onClick={() => refetch()} disabled={loading} className="h-8 w-8">
						<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
					</Button>
				</div>
			</div>

			{loading && !kpis && (
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					{Array.from({ length: 8 }).map((_, i) => (
						<Skeleton key={i} className="h-20 w-full" />
					))}
				</div>
			)}

			{error && !loading && (
				<div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-600">
					Error cargando KPIs: {error}
				</div>
			)}

			{kpis && (
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
					<KpiTile label="Grupos" value={kpis.total_grupos} />
					<KpiTile label="Con Líder" value={`${kpis.total_con_lider}`} sub={`${kpis.pct_con_lider}%`} highlight="ok" />
						<KpiTile label="Aprobados" value={kpis.total_aprobados} sub={`${kpis.pct_aprobados}%`} />
					<KpiTile label="Sin Director" value={kpis.total_sin_director} sub={`${kpis.pct_sin_director}%`} highlight={Number(kpis.total_sin_director) > 0 ? 'warn' : 'ok'} />
					<KpiTile label="Prom. Miembros" value={kpis.promedio_miembros?.toFixed(1) ?? '—'} />
					<KpiTile label="Desv. Miembros" value={kpis.desviacion_miembros?.toFixed(1) ?? '—'} />
					<KpiTile label="F. Actualización" value={new Date(kpis.fecha_ultima_actualizacion).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})} />
				</div>
			)}
		</Card>
	);
}

