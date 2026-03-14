"use client"

import Link from 'next/link'
import { FileText, ChevronRight, Calendar, Users } from 'lucide-react'
import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export type EventoConNotas = {
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

interface NotasLideresWidgetProps {
    id: string
    title: string
}

export function NotasLideresWidget({ id, title }: NotasLideresWidgetProps) {
    const [eventos, setEventos] = useState<EventoConNotas[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase.rpc('obtener_eventos_con_notas', {
                p_auth_id: user.id,
                p_limite: 10
            })

            if (!error && data) {
                setEventos(Array.isArray(data) ? data : [])
            }
            setLoading(false)
        }

        fetchData()
    }, [])

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

    const MAX_VISIBLE = 5
    const visibles = eventos.slice(0, MAX_VISIBLE)
    const hayMas = eventos.length > MAX_VISIBLE

    if (loading) {
        return (
            <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg ring-1 ring-white/20 shadow-lg">
                        <FileText className="w-5 h-5 text-white" />
                    </div>
                    <TituloSistema nivel={3}>{title}</TituloSistema>
                </div>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                    ))}
                </div>
            </TarjetaSistema>
        )
    }

    return (
        <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg ring-1 ring-white/20 shadow-lg">
                    <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                    <TituloSistema nivel={3}>{title}</TituloSistema>
                </div>
                {eventos.length > 0 && (
                    <BadgeSistema variante="info" tamaño="sm">
                        {eventos.length}
                    </BadgeSistema>
                )}
            </div>

            {eventos.length > 0 ? (
                <>
                    <div className="space-y-3 flex-1 max-h-64 overflow-y-auto scrollbar-glass">
                        {visibles.map((evento) => (
                            <Link
                                key={evento.evento_id}
                                href={`/grupos-vida/${evento.grupo_id}/asistencia/${evento.evento_id}`}
                            >
                                <div className="flex items-start gap-3 p-3 bg-[var(--surface-secondary)]/50 rounded-xl hover:bg-[var(--surface-secondary)] transition-colors group">
                                    <div className="p-2 bg-muted rounded-lg flex-shrink-0">
                                        <FileText className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <TextoSistema tamaño="sm" className="text-foreground font-medium truncate">
                                                {evento.grupo_nombre}
                                            </TextoSistema>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className="text-xs text-muted-foreground">
                                                    {formatearFecha(evento.fecha)}
                                                </span>
                                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                            </div>
                                        </div>
                                        <TextoSistema variante="sutil" tamaño="sm" className="mt-0.5 text-xs line-clamp-1">
                                            📝 {truncarTexto(evento.notas, 80)}
                                        </TextoSistema>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-muted-foreground">
                                                {evento.lider_nombre}
                                            </span>
                                            <span className="text-xs text-muted-foreground">·</span>
                                            <div className="flex items-center gap-1">
                                                <Users className="w-3 h-3 text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">
                                                    {evento.presentes}/{evento.total}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {hayMas && (
                        <div className="mt-4 pt-3 border-t border-border text-center">
                            <Link href="/notas-lideres">
                                <BotonSistema variante="ghost" tamaño="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                                    Ver todas las notas ({eventos.length})
                                    <ChevronRight className="w-4 h-4" />
                                </BotonSistema>
                            </Link>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-6">
                    <div className="text-muted-foreground/50 text-3xl mb-3">📝</div>
                    <TextoSistema variante="muted" tamaño="sm">
                        No hay notas recientes de líderes.
                    </TextoSistema>
                </div>
            )}
        </TarjetaSistema>
    )
}
