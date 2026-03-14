"use client"

import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Calendar, Users, ChevronRight, FileText } from 'lucide-react'

type EventoConNotas = {
    evento_id: string
    grupo_id: string
    grupo_nombre: string
    fecha: string
    hora: string
    tema: string
    notas: string
    lider_nombre: string
    presentes: number
    total: number
}

interface NotasLideresListadoProps {
    eventos: EventoConNotas[]
}

export default function NotasLideresListado({ eventos }: NotasLideresListadoProps) {
    const formatearFecha = (fecha: string) => {
        const f = new Date(fecha)
        const dia = String(f.getUTCDate()).padStart(2, '0')
        const mes = String(f.getUTCMonth() + 1).padStart(2, '0')
        const anio = f.getUTCFullYear()
        return `${dia}/${mes}/${anio}`
    }

    const truncarTexto = (texto: string, maxChars: number) => {
        if (texto.length <= maxChars) return texto
        return texto.slice(0, maxChars).trim() + '…'
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10">
                    <FileText className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                    <TextoSistema variante="muted" tamaño="sm">Total de notas</TextoSistema>
                    <TituloSistema nivel={3}>{eventos.length}</TituloSistema>
                </div>
                <BadgeSistema variante="info" tamaño="sm" className="ml-auto">
                    Últimos 30 días
                </BadgeSistema>
            </div>

            {/* Tabla */}
            <TarjetaSistema className="p-0 overflow-hidden">
                {/* Header — solo desktop */}
                <div className="hidden sm:grid sm:grid-cols-[1fr_8rem_5rem_1.2fr_8rem] gap-3 px-4 py-3 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span>Grupo</span>
                    <span className="text-center">Fecha</span>
                    <span className="text-center">Asist.</span>
                    <span>Nota</span>
                    <span>Líder</span>
                </div>

                <div className="divide-y divide-border">
                    {eventos.length > 0 ? (
                        eventos.map((evento) => (
                            <Link
                                key={evento.evento_id}
                                href={`/grupos-vida/${evento.grupo_id}/asistencia/${evento.evento_id}`}
                            >
                                <div className="sm:grid sm:grid-cols-[1fr_8rem_5rem_1.2fr_8rem] sm:gap-3 px-4 py-3 sm:items-center hover:bg-muted/30 transition-colors duration-200 cursor-pointer group">
                                    {/* Móvil: card compacto */}
                                    <div className="sm:hidden">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                {/* Grupo + tema */}
                                                <div className="text-sm font-semibold text-foreground truncate">
                                                    {evento.grupo_nombre}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                                    <span>{formatearFecha(evento.fecha)}</span>
                                                    <span>·</span>
                                                    <span>{evento.tema}</span>
                                                </div>
                                                {/* Asistencia */}
                                                <div className="mt-1 flex items-center gap-1.5">
                                                    <Users className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">
                                                        {evento.presentes}/{evento.total} presentes
                                                    </span>
                                                </div>
                                                {/* Nota */}
                                                <div className="mt-1.5 text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                                                    <span className="text-amber-500">📝</span>{' '}
                                                    {truncarTexto(evento.notas, 150)}
                                                </div>
                                                {/* Líder */}
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    Líder: {evento.lider_nombre}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-foreground transition-colors" />
                                        </div>
                                    </div>

                                    {/* Desktop: columnas */}
                                    <div className="hidden sm:block min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">
                                            {evento.grupo_nombre}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {evento.tema}
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex items-center justify-center">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">
                                                {formatearFecha(evento.fecha)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex items-center justify-center">
                                        <span className="text-sm text-muted-foreground">
                                            {evento.presentes}/{evento.total}
                                        </span>
                                    </div>
                                    <div className="hidden sm:block min-w-0">
                                        <div className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                                            {truncarTexto(evento.notas, 100)}
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex items-center gap-1.5">
                                        <span className="text-xs text-muted-foreground truncate">
                                            {evento.lider_nombre}
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="p-8 text-center">
                            <div className="text-muted-foreground/50 text-4xl mb-4">📝</div>
                            <TituloSistema nivel={3} className="text-muted-foreground mb-2">
                                No hay notas recientes
                            </TituloSistema>
                            <TextoSistema variante="sutil">
                                Los líderes no han agregado notas en los últimos 30 días.
                            </TextoSistema>
                        </div>
                    )}
                </div>
            </TarjetaSistema>
        </div>
    )
}
