"use client"

import { useId, useState } from "react"
import { BookOpen, ChevronDown, Lock, UserPlus } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { InputSistema, TarjetaSistema, TextareaSistema } from "@/components/ui/sistema-diseno"
import { cn } from "@/lib/utils"

export interface DatosReunion {
    fecha: string
    hora: string
    tema: string
    notas: string
    descripcion: string
    puntosOracion: string
    notasPrivadas: string
    conteoVisitantes: number
    noHuboReunion: boolean
    motivoNoReunion: string
}

interface Props {
    datos: DatosReunion
    onCambio: (cambios: Partial<DatosReunion>) => void
    isEdit?: boolean
    ventanaCerrada?: boolean
    visitantesHabilitados?: boolean
    className?: string
}

/**
 * Datos de la reunión: "no hubo reunión", fecha, hora, tema, notas y los
 * campos pastorales plegables. Si no hubo reunión solo queda el motivo.
 */
export function TarjetaReunion({ datos, onCambio, isEdit, ventanaCerrada, visitantesHabilitados, className }: Props) {
    const [mostrarAvanzado, setMostrarAvanzado] = useState(false)
    const id = useId()
    const idNoHubo = `${id}-no-hubo`
    const idAvanzado = `${id}-avanzado`

    return (
        <TarjetaSistema variante="outlined" className={cn("space-y-5 p-4 shadow-none sm:p-5", className)}>
            <h2 className="text-base font-semibold text-foreground">Reunión</h2>

            <label
                htmlFor={idNoHubo}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-muted/60 p-3"
            >
                <Checkbox
                    id={idNoHubo}
                    className="mt-0.5"
                    checked={datos.noHuboReunion}
                    onCheckedChange={(v) => onCambio({ noHuboReunion: !!v })}
                    disabled={ventanaCerrada}
                />
                <span>
                    <span className="block text-sm font-medium text-foreground">No hubo reunión esta semana</span>
                    <span className="block text-xs text-muted-foreground">
                        Si marcas esto, no se registrarán asistencias individuales
                    </span>
                </span>
            </label>

            {datos.noHuboReunion ? (
                <TextareaSistema
                    label="Motivo (opcional)"
                    value={datos.motivoNoReunion}
                    onChange={(e) => onCambio({ motivoNoReunion: e.target.value })}
                    placeholder="¿Por qué no hubo reunión?"
                    filas={2}
                />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <InputSistema
                            label="Fecha"
                            type="date"
                            value={datos.fecha}
                            onChange={(e) => onCambio({ fecha: e.target.value })}
                            disabled={!!isEdit || ventanaCerrada}
                        />
                        <InputSistema
                            label="Hora"
                            type="time"
                            value={datos.hora}
                            onChange={(e) => onCambio({ hora: e.target.value })}
                        />
                    </div>
                    <TextareaSistema
                        label="Tema"
                        value={datos.tema}
                        onChange={(e) => onCambio({ tema: e.target.value })}
                        placeholder="Opcional"
                        filas={2}
                    />
                    <TextareaSistema
                        label="Notas"
                        value={datos.notas}
                        onChange={(e) => onCambio({ notas: e.target.value })}
                        placeholder="Opcional"
                        filas={2}
                    />

                    <div className="border-t border-border pt-3">
                        <button
                            type="button"
                            aria-expanded={mostrarAvanzado}
                            aria-controls={idAvanzado}
                            onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
                            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <BookOpen aria-hidden="true" className="h-4 w-4" />
                            Campos pastorales
                            <ChevronDown
                                aria-hidden="true"
                                className={cn("ml-auto h-4 w-4 transition-transform duration-150", mostrarAvanzado && "rotate-180")}
                            />
                        </button>

                        {mostrarAvanzado && (
                            <div id={idAvanzado} className="mt-3 space-y-4">
                                <TextareaSistema
                                    label="Descripción de la reunión"
                                    value={datos.descripcion}
                                    onChange={(e) => onCambio({ descripcion: e.target.value })}
                                    placeholder="Resumen de lo que se compartió..."
                                    filas={3}
                                />
                                <TextareaSistema
                                    label="Puntos de oración"
                                    value={datos.puntosOracion}
                                    onChange={(e) => onCambio({ puntosOracion: e.target.value })}
                                    placeholder="Peticiones de oración compartidas..."
                                    filas={2}
                                />
                                <div className="space-y-1 rounded-xl bg-muted p-3">
                                    <TextareaSistema
                                        label="Notas privadas del líder"
                                        value={datos.notasPrivadas}
                                        onChange={(e) => onCambio({ notasPrivadas: e.target.value })}
                                        placeholder="Solo visibles para ti y directores..."
                                        filas={2}
                                    />
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                                        Estas notas no serán visibles para los miembros del grupo.
                                    </p>
                                </div>

                                {visitantesHabilitados && (
                                    <div className="space-y-1">
                                        <InputSistema
                                            label="Visitantes"
                                            icono={UserPlus}
                                            type="number"
                                            min={0}
                                            value={String(datos.conteoVisitantes)}
                                            onChange={(e) =>
                                                onCambio({ conteoVisitantes: Math.max(0, parseInt(e.target.value) || 0) })
                                            }
                                            placeholder="0"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Personas no miembros que asistieron
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </TarjetaSistema>
    )
}
