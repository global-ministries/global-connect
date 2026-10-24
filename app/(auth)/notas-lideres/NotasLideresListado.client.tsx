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
                <div className="shrink-0 rounded-xl bg-warning/10 p-2.5">
                    <FileText className="h-5 w-5 text-warning" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <TextoSistema variante="muted" tamaño="sm">Total de notas</TextoSistema>
                    <p className="text-lg font-semibold text-foreground">{eventos.length}</p>
                </div>
                <BadgeSistema variante="info" tamaño="sm" className="ml-auto">
                    Últimos 30 días
                </BadgeSistema>
            </div>

            {/* Tabla */}
            <TarjetaSistema className="overflow-hidden p-0">
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
                                className="block focus:outline-none focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <div className="group cursor-pointer px-4 py-3 transition-colors duration-200 hover:bg-muted/30 sm:grid sm:grid-cols-[1fr_8rem_5rem_1.2fr_8rem] sm:items-center sm:gap-3">
                                    {/* Móvil: card compacto */}
                                    <div className="sm:hidden">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                {/* Grupo + tema */}
                                                <div className="text-sm font-semibold text-foreground truncate">
                                                    {evento.grupo_nombre}
                                                </div>
                                                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="shrink-0">{formatearFecha(evento.fecha)}</span>
                                                    <span aria-hidden="true">·</span>
                                                    <span className="truncate">{evento.tema}</span>
                                                </div>
                                                {/* Asistencia */}
                                                <div className="mt-1 flex items-center gap-1.5">
                                                    <Users className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                                    <span className="text-xs text-muted-foreground">
                                                        {evento.presentes}/{evento.total} presentes
                                                    </span>
                                                </div>
                                                {/* Nota */}
                                                <div className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                                                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                                                    <span className="line-clamp-2">{truncarTexto(evento.notas, 150)}</span>
                                                </div>
                                                {/* Líder */}
                                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                                    Líder: {evento.lider_nombre}
                                                </div>
                                            </div>
                                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
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
                                            <Calendar className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
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
                                        <div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                            {truncarTexto(evento.notas, 100)}
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex items-center gap-1.5">
                                        <span className="text-xs text-muted-foreground truncate">
                                            {evento.lider_nombre}
                                        </span>
                                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="p-8 text-center">
                            <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                            <TituloSistema nivel={2} className="mb-2 text-base text-muted-foreground sm:text-lg">
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
