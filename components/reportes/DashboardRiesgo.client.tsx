"use client"

import Link from 'next/link'
import {
    PieChart, Pie, Cell,
    AreaChart, Area,
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts'
import {
    TarjetaSistema,
    TituloSistema,
    TextoSistema,
    BadgeSistema
} from '@/components/ui/sistema-diseno'
import {
    ShieldAlert, TrendingDown, AlertTriangle, Users,
    HeartPulse, Calendar, UserX, Activity,
    ChevronRight, Eye
} from 'lucide-react'
import type { DashboardRiesgo } from '@/lib/types/asistencia-avanzada.types'

// ─── Constantes de estilo ──────────────────────────────────────────

/** Colores para gráficas (CSS variables fallback para dark mode) */
const COLORES_NIVEL = {
    normal: '#22c55e',
    atencion: '#f59e0b',
    riesgo: '#f97316',
    critico: '#ef4444'
} as const

const ETIQUETAS_NIVEL: Record<string, string> = {
    normal: 'Sanos',
    atencion: 'Atención',
    riesgo: 'En riesgo',
    critico: 'Críticos'
}

// ─── Componente Principal ────────────────────────────────────────

interface Props {
    data: DashboardRiesgo
}

export default function DashboardRiesgoClient({ data: d }: Props) {
    const pctCriticos = d.total_miembros > 0
        ? Math.round((d.miembros_criticos / d.total_miembros) * 100)
        : 0
    const pctRiesgo = d.total_miembros > 0
        ? Math.round((d.miembros_en_riesgo / d.total_miembros) * 100)
        : 0
    const pctAtencion = d.total_miembros > 0
        ? Math.round((d.miembros_en_atencion / d.total_miembros) * 100)
        : 0
    const pctSanos = d.total_miembros > 0
        ? Math.round((d.miembros_sanos / d.total_miembros) * 100)
        : 0

    return (
        <div className="space-y-6">
            {/* ─── Explicación del dashboard ─── */}
            <TarjetaSistema variante="default" className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 shrink-0">
                        <HeartPulse className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                        <TituloSistema nivel={4}>¿Cómo funciona este dashboard?</TituloSistema>
                        <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                            Monitoreamos la salud de cada miembro según sus semanas sin asistir.
                            Los <strong className="text-warning">niveles de riesgo</strong> se calculan automáticamente:
                            {' '}<strong className="text-destructive">Crítico</strong> = muchas semanas ausente,
                            {' '}<strong className="text-warning">Riesgo</strong> = varias semanas sin venir,
                            {' '}<strong className="text-yellow-500">Atención</strong> = empezando a alejarse,
                            {' '}<strong className="text-success">Sano</strong> = asistencia regular.
                        </TextoSistema>
                    </div>
                </div>
            </TarjetaSistema>

            {/* ─── KPI Cards ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <KPICard
                    icono={<HeartPulse className="h-5 w-5 text-success" />}
                    gradiente="from-green-500/20 to-emerald-500/20"
                    valor={d.miembros_sanos}
                    etiqueta="Sanos"
                    porcentaje={pctSanos}
                    colorPct="text-success"
                />
                <KPICard
                    icono={<AlertTriangle className="h-5 w-5 text-yellow-500" />}
                    gradiente="from-yellow-500/20 to-amber-500/20"
                    valor={d.miembros_en_atencion}
                    etiqueta="Atención"
                    porcentaje={pctAtencion}
                    colorPct="text-yellow-500"
                />
                <KPICard
                    icono={<TrendingDown className="h-5 w-5 text-warning" />}
                    gradiente="from-orange-500/20 to-amber-500/20"
                    valor={d.miembros_en_riesgo}
                    etiqueta="En riesgo"
                    porcentaje={pctRiesgo}
                    colorPct="text-warning"
                />
                <KPICard
                    icono={<ShieldAlert className="h-5 w-5 text-destructive" />}
                    gradiente="from-red-500/20 to-rose-500/20"
                    valor={d.miembros_criticos}
                    etiqueta="Críticos"
                    porcentaje={pctCriticos}
                    colorPct="text-destructive"
                />
            </div>

            {/* ─── Charts Row ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Donut Chart - Distribución */}
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20">
                            <Activity className="h-4 w-4 text-blue-500" />
                        </div>
                        <TituloSistema nivel={4}>Distribución de Salud</TituloSistema>
                    </div>
                    {d.distribucion_riesgo.length > 0 ? (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="w-48 h-48 sm:w-52 sm:h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={d.distribucion_riesgo.map(r => ({
                                                ...r,
                                                name: ETIQUETAS_NIVEL[r.nivel] || r.nivel
                                            }))}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={80}
                                            paddingAngle={3}
                                            dataKey="cantidad"
                                            strokeWidth={0}
                                        >
                                            {d.distribucion_riesgo.map((r, i) => (
                                                <Cell
                                                    key={i}
                                                    fill={COLORES_NIVEL[r.nivel as keyof typeof COLORES_NIVEL] || '#94a3b8'}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number, name: string) => [`${value} miembros`, name]}
                                            contentStyle={{
                                                background: 'var(--card)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                color: 'var(--foreground)',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex flex-col gap-2 flex-1">
                                {d.distribucion_riesgo.map((r) => (
                                    <div key={r.nivel} className="flex items-center gap-2">
                                        <span
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: COLORES_NIVEL[r.nivel as keyof typeof COLORES_NIVEL] || '#94a3b8' }}
                                        />
                                        <span className="text-sm text-foreground flex-1">
                                            {ETIQUETAS_NIVEL[r.nivel] || r.nivel}
                                        </span>
                                        <span className="text-sm font-semibold text-foreground">{r.cantidad}</span>
                                        <span className="text-xs text-muted-foreground">({r.porcentaje}%)</span>
                                    </div>
                                ))}
                                <div className="mt-1 pt-2 border-t border-border">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Total miembros</span>
                                        <span className="text-sm font-bold text-foreground">{d.total_miembros}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <TextoSistema variante="muted" className="text-center py-8">
                            No hay datos de distribución disponibles
                        </TextoSistema>
                    )}
                </TarjetaSistema>

                {/* Area Chart - Tendencia */}
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20">
                            <Activity className="h-4 w-4 text-emerald-500" />
                        </div>
                        <TituloSistema nivel={4}>Tendencia de Asistencia</TituloSistema>
                    </div>
                    {d.tendencia_asistencia_4_semanas.length > 0 ? (
                        <>
                            <div className="h-48 sm:h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={d.tendencia_asistencia_4_semanas}>
                                        <defs>
                                            <linearGradient id="colorPct" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis
                                            dataKey="semana"
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickFormatter={(v) => `${v}%`}
                                        />
                                        <Tooltip
                                            formatter={(value: number) => [`${value}%`, 'Asistencia']}
                                            contentStyle={{
                                                background: 'var(--card)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                color: 'var(--foreground)',
                                                fontSize: '13px'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="pct"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorPct)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <TextoSistema variante="muted" tamaño="sm" className="mt-2 text-center">
                                Porcentaje de asistencia promedio por semana (últimas 4 semanas)
                            </TextoSistema>
                        </>
                    ) : (
                        <TextoSistema variante="muted" className="text-center py-8">
                            No hay datos de tendencia disponibles
                        </TextoSistema>
                    )}
                </TarjetaSistema>
            </div>

            {/* ─── Miembros Críticos ─── */}
            {d.miembros_criticos_detalle.length > 0 && (
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-500/20 to-rose-500/20">
                            <UserX className="h-4 w-4 text-destructive" />
                        </div>
                        <TituloSistema nivel={4}>Miembros que Necesitan Atención Urgente</TituloSistema>
                    </div>
                    <TextoSistema variante="muted" tamaño="sm" className="mb-3">
                        Personas con más tiempo sin asistir. Considera contactarlos para saber cómo están.
                    </TextoSistema>

                    {/* Desktop: tabla */}
                    <div className="hidden sm:block border border-border rounded-xl overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Nombre</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Grupo</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5">Semanas ausente</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5">Asistencia</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5">Nivel</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {d.miembros_criticos_detalle.map((m) => (
                                    <tr key={m.usuario_id + m.grupo_id} className="hover:bg-muted/30 transition-colors duration-200">
                                        <td className="px-4 py-3 text-sm font-medium text-foreground">{m.nombre}</td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">{m.grupo_nombre}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-semibold text-destructive">
                                                {m.semanas_ausente >= 99 ? 'Nunca asistió' : `${m.semanas_ausente} sem`}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                                            {m.pct_asistencia}%
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <BadgeSistema
                                                variante={m.nivel_riesgo === 'critico' ? 'error' : 'warning'}
                                                tamaño="sm"
                                            >
                                                {m.nivel_riesgo === 'critico' ? 'Crítico' : 'Riesgo'}
                                            </BadgeSistema>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                href={`/grupos-vida/${m.grupo_id}/salud`}
                                                className="text-xs text-blue-500 hover:text-blue-400 transition-colors duration-200 flex items-center gap-1 justify-end"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                Ver grupo
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Móvil: cards */}
                    <div className="sm:hidden space-y-2">
                        {d.miembros_criticos_detalle.map((m) => (
                            <Link
                                key={m.usuario_id + m.grupo_id}
                                href={`/grupos-vida/${m.grupo_id}/salud`}
                                className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors duration-200"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{m.nombre}</p>
                                    <p className="text-xs text-muted-foreground">{m.grupo_nombre}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-destructive">
                                            {m.semanas_ausente >= 99 ? '∞' : m.semanas_ausente} sem
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </TarjetaSistema>
            )}

            {/* ─── Dos columns: Top Riesgo + Sin Reunión ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Grupos con mayor riesgo */}
                {d.top_5_grupos_riesgo.length > 0 && (
                    <TarjetaSistema variante="default" className="p-4 sm:p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20">
                                <ShieldAlert className="h-4 w-4 text-orange-500" />
                            </div>
                            <TituloSistema nivel={4}>Grupos con Mayor Riesgo</TituloSistema>
                        </div>
                        <TextoSistema variante="muted" tamaño="sm" className="mb-3">
                            Grupos con más miembros en estado crítico o de riesgo.
                        </TextoSistema>
                        <div className="divide-y divide-border">
                            {d.top_5_grupos_riesgo.map((g, i) => (
                                <Link
                                    key={g.grupo_id}
                                    href={`/grupos-vida/${g.grupo_id}/salud`}
                                    className="flex items-center justify-between py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded-lg transition-colors duration-200"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground w-5 text-center font-mono">{i + 1}</span>
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{g.grupo_nombre}</p>
                                            <p className="text-xs text-muted-foreground">{g.total_miembros} miembros</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {g.criticos > 0 && (
                                            <BadgeSistema variante="error" tamaño="sm">
                                                {g.criticos} crít.
                                            </BadgeSistema>
                                        )}
                                        <BadgeSistema variante="warning" tamaño="sm">
                                            {g.riesgo_total} riesgo
                                        </BadgeSistema>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </TarjetaSistema>
                )}

                {/* Grupos sin reunión */}
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-500/20 to-gray-500/20">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2">
                            <TituloSistema nivel={4}>Sin Reunión Esta Semana</TituloSistema>
                            <BadgeSistema variante="default" tamaño="sm">
                                {d.grupos_sin_reunion_esta_semana}
                            </BadgeSistema>
                        </div>
                    </div>
                    <TextoSistema variante="muted" tamaño="sm" className="mb-3">
                        Grupos que no han registrado asistencia en los últimos 7 días.
                    </TextoSistema>
                    {d.grupos_sin_reunion_detalle.length > 0 ? (
                        <div className="divide-y divide-border">
                            {d.grupos_sin_reunion_detalle.map((g) => (
                                <Link
                                    key={g.grupo_id}
                                    href={`/grupos-vida/${g.grupo_id}`}
                                    className="flex items-center justify-between py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded-lg transition-colors duration-200"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{g.grupo_nombre}</p>
                                        <p className="text-xs text-muted-foreground">Líder: {g.lider_nombre}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <div className="p-3 rounded-full bg-success/10 w-fit mx-auto mb-2">
                                <Calendar className="h-5 w-5 text-success" />
                            </div>
                            <TextoSistema variante="muted" tamaño="sm">
                                ¡Todos los grupos se reunieron esta semana! 🎉
                            </TextoSistema>
                        </div>
                    )}
                </TarjetaSistema>
            </div>

            {/* ─── Riesgo por Segmento ─── */}
            {d.segmentos_riesgo.length > 0 && (
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20">
                            <Users className="h-4 w-4 text-violet-500" />
                        </div>
                        <TituloSistema nivel={4}>Salud por Segmento</TituloSistema>
                    </div>
                    <TextoSistema variante="muted" tamaño="sm" className="mb-4">
                        Distribución de riesgo en cada tipo de grupo. Las barras muestran la proporción de miembros sanos vs. en riesgo.
                    </TextoSistema>

                    {/* Horizontal stacked bars */}
                    <div className="space-y-3">
                        {d.segmentos_riesgo.map((seg) => {
                            const problemas = seg.criticos + seg.riesgo + seg.atencion
                            return (
                                <div key={seg.segmento_nombre}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-sm font-medium text-foreground">{seg.segmento_nombre}</span>
                                        <div className="flex items-center gap-2">
                                            {seg.criticos > 0 && (
                                                <span className="text-xs text-destructive font-medium">{seg.criticos} crít.</span>
                                            )}
                                            {seg.riesgo > 0 && (
                                                <span className="text-xs text-warning font-medium">{seg.riesgo} riesgo</span>
                                            )}
                                            <span className="text-xs text-muted-foreground">{seg.total} total</span>
                                        </div>
                                    </div>
                                    {/* Bar visual */}
                                    <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
                                        {seg.normal > 0 && (
                                            <div
                                                className="h-full bg-green-500 transition-all duration-500"
                                                style={{ width: `${(seg.normal / seg.total) * 100}%` }}
                                            />
                                        )}
                                        {seg.atencion > 0 && (
                                            <div
                                                className="h-full bg-yellow-500 transition-all duration-500"
                                                style={{ width: `${(seg.atencion / seg.total) * 100}%` }}
                                            />
                                        )}
                                        {seg.riesgo > 0 && (
                                            <div
                                                className="h-full bg-orange-500 transition-all duration-500"
                                                style={{ width: `${(seg.riesgo / seg.total) * 100}%` }}
                                            />
                                        )}
                                        {seg.criticos > 0 && (
                                            <div
                                                className="h-full bg-red-500 transition-all duration-500"
                                                style={{ width: `${(seg.criticos / seg.total) * 100}%` }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
                        {Object.entries(COLORES_NIVEL).map(([nivel, color]) => (
                            <div key={nivel} className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-xs text-muted-foreground">{ETIQUETAS_NIVEL[nivel]}</span>
                            </div>
                        ))}
                    </div>
                </TarjetaSistema>
            )}

            {/* ─── Info fila complementaria ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                        <Users className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-foreground">{d.total_grupos}</p>
                        <p className="text-xs text-muted-foreground">Grupos activos</p>
                    </div>
                </TarjetaSistema>

                <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/20">
                        <Activity className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-foreground">{d.solicitudes_pendientes}</p>
                        <p className="text-xs text-muted-foreground">Solicitudes pendientes</p>
                    </div>
                </TarjetaSistema>

                <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500/20 to-green-500/20">
                        <Users className="h-5 w-5 text-teal-500" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-foreground">{d.visitantes_del_mes}</p>
                        <p className="text-xs text-muted-foreground">Visitantes del mes</p>
                    </div>
                </TarjetaSistema>
            </div>
        </div>
    )
}

// ─── Sub-componentes ──────────────────────────────────────────────

interface KPICardProps {
    icono: React.ReactNode
    gradiente: string
    valor: number
    etiqueta: string
    porcentaje: number
    colorPct: string
}

function KPICard({ icono, gradiente, valor, etiqueta, porcentaje, colorPct }: KPICardProps) {
    return (
        <TarjetaSistema variante="default" className="p-4">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl bg-gradient-to-br ${gradiente} shrink-0`}>
                    {icono}
                </div>
                <div className="min-w-0">
                    <p className="text-2xl font-bold text-foreground">{valor}</p>
                    <p className="text-xs text-muted-foreground">{etiqueta}</p>
                </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border">
                <span className={`text-xs font-medium ${colorPct}`}>
                    {porcentaje}% del total
                </span>
            </div>
        </TarjetaSistema>
    )
}
