"use client"

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
    TarjetaSistema,
    TituloSistema,
    TextoSistema,
    BadgeSistema,
    InputSistema
} from '@/components/ui/sistema-diseno'
import { Search, Eye, ChevronRight, ShieldAlert, AlertTriangle, TrendingDown } from 'lucide-react'

interface MiembroRiesgo {
    usuario_id: string
    nombre_completo: string
    grupo_id: string
    grupo_nombre: string
    rol: string | null
    semanas_ausente: number
    pct_asistencia: number
    nivel_riesgo: 'critico' | 'riesgo' | 'atencion'
    ultima_vez_presente: string | null
}

interface Props {
    miembros: MiembroRiesgo[]
}

const ETIQUETA_NIVEL: Record<string, { texto: string; variante: 'error' | 'warning' | 'info' }> = {
    critico: { texto: 'Crítico', variante: 'error' },
    riesgo: { texto: 'Riesgo', variante: 'warning' },
    atencion: { texto: 'Atención', variante: 'info' },
}

const ICONO_NIVEL: Record<string, React.ReactNode> = {
    critico: <ShieldAlert className="h-4 w-4 text-destructive" />,
    riesgo: <TrendingDown className="h-4 w-4 text-warning" />,
    atencion: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
}

export default function MiembrosRiesgoClient({ miembros }: Props) {
    const [busqueda, setBusqueda] = useState('')
    const [filtroNivel, setFiltroNivel] = useState<string>('todos')

    const filtrados = useMemo(() => {
        let resultado = miembros
        if (filtroNivel !== 'todos') {
            resultado = resultado.filter((m) => m.nivel_riesgo === filtroNivel)
        }
        if (busqueda.trim()) {
            const q = busqueda.toLowerCase()
            resultado = resultado.filter(
                (m) =>
                    m.nombre_completo.toLowerCase().includes(q) ||
                    m.grupo_nombre.toLowerCase().includes(q)
            )
        }
        return resultado
    }, [miembros, filtroNivel, busqueda])

    const conteo = {
        critico: miembros.filter((m) => m.nivel_riesgo === 'critico').length,
        riesgo: miembros.filter((m) => m.nivel_riesgo === 'riesgo').length,
        atencion: miembros.filter((m) => m.nivel_riesgo === 'atencion').length,
    }

    return (
        <div className="space-y-4">
            {/* Resumen rápido */}
            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => setFiltroNivel(filtroNivel === 'critico' ? 'todos' : 'critico')}
                    className={`p-3 rounded-xl border transition-colors duration-200 text-left ${filtroNivel === 'critico' ? 'border-red-500/50 bg-red-500/10' : 'border-border hover:bg-muted/30'}`}
                >
                    <p className="text-xl font-bold text-destructive">{conteo.critico}</p>
                    <p className="text-xs text-muted-foreground">Críticos</p>
                </button>
                <button
                    onClick={() => setFiltroNivel(filtroNivel === 'riesgo' ? 'todos' : 'riesgo')}
                    className={`p-3 rounded-xl border transition-colors duration-200 text-left ${filtroNivel === 'riesgo' ? 'border-orange-500/50 bg-orange-500/10' : 'border-border hover:bg-muted/30'}`}
                >
                    <p className="text-xl font-bold text-warning">{conteo.riesgo}</p>
                    <p className="text-xs text-muted-foreground">En riesgo</p>
                </button>
                <button
                    onClick={() => setFiltroNivel(filtroNivel === 'atencion' ? 'todos' : 'atencion')}
                    className={`p-3 rounded-xl border transition-colors duration-200 text-left ${filtroNivel === 'atencion' ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-border hover:bg-muted/30'}`}
                >
                    <p className="text-xl font-bold text-yellow-500">{conteo.atencion}</p>
                    <p className="text-xs text-muted-foreground">Atención</p>
                </button>
            </div>

            {/* Búsqueda */}
            <InputSistema
                label=""
                placeholder="Buscar por nombre o grupo..."
                icono={Search}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
            />

            {/* Resultados */}
            <TarjetaSistema variante="default" className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                    <TituloSistema nivel={4}>
                        {filtroNivel === 'todos' ? 'Todos los miembros en riesgo' : `Miembros: ${ETIQUETA_NIVEL[filtroNivel]?.texto || filtroNivel}`}
                    </TituloSistema>
                    <TextoSistema variante="muted" tamaño="sm">
                        {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
                    </TextoSistema>
                </div>

                {filtrados.length === 0 ? (
                    <div className="text-center py-8">
                        <TextoSistema variante="muted">No se encontraron miembros con este filtro.</TextoSistema>
                    </div>
                ) : (
                    <>
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
                                    {filtrados.map((m) => (
                                        <tr key={m.usuario_id + m.grupo_id} className="hover:bg-muted/30 transition-colors duration-200">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {ICONO_NIVEL[m.nivel_riesgo]}
                                                    <span className="text-sm font-medium text-foreground">{m.nombre_completo}</span>
                                                </div>
                                            </td>
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
                                                    variante={ETIQUETA_NIVEL[m.nivel_riesgo]?.variante || 'default'}
                                                    tamaño="sm"
                                                >
                                                    {ETIQUETA_NIVEL[m.nivel_riesgo]?.texto || m.nivel_riesgo}
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
                            {filtrados.map((m) => (
                                <Link
                                    key={m.usuario_id + m.grupo_id}
                                    href={`/grupos-vida/${m.grupo_id}/salud`}
                                    className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors duration-200"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            {ICONO_NIVEL[m.nivel_riesgo]}
                                            <p className="text-sm font-medium text-foreground truncate">{m.nombre_completo}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{m.grupo_nombre}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-destructive">
                                                {m.semanas_ausente >= 99 ? '∞' : m.semanas_ausente} sem
                                            </p>
                                            <BadgeSistema
                                                variante={ETIQUETA_NIVEL[m.nivel_riesgo]?.variante || 'default'}
                                                tamaño="sm"
                                            >
                                                {ETIQUETA_NIVEL[m.nivel_riesgo]?.texto || m.nivel_riesgo}
                                            </BadgeSistema>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </TarjetaSistema>
        </div>
    )
}
