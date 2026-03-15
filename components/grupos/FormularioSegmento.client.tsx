"use client"

import { useState, useTransition, useCallback, type FormEvent } from "react"
import { Plus, Edit, Trash2, X } from "lucide-react"
import { crearSegmento, editarSegmento, eliminarSegmento } from "@/lib/actions/segmentos.actions"
import {
    TarjetaSistema, BotonSistema, InputSistema, TextareaSistema,
    TituloSistema, TextoSistema,
} from "@/components/ui/sistema-diseno"
import { BotonFlotante } from "@/components/ui/BotonFlotante"
import { useNotificaciones } from "@/hooks/use-notificaciones"

// ---------- Types ----------
type Segmento = { id: string; nombre: string; descripcion?: string | null }

type ModalMode = "crear" | "editar" | "eliminar" | null

interface Props {
    segmentos: Segmento[]
    /** Modo de render: "boton" = botón crear en header, "editar" = botón editar inline, "fab" = FAB móvil */
    trigger: "boton" | "editar" | "fab"
    /** Segmento a editar (solo para trigger="editar") */
    segmentoEditar?: Segmento
}

/**
 * Componente client-side para gestión CRUD de segmentos.
 * Se usa en 3 modos:
 * - trigger="boton": renderiza el botón "Crear Segmento" + modales
 * - trigger="editar": renderiza botones editar/eliminar para un segmento + modales
 * - trigger="fab": renderiza el FAB móvil + modales
 */
export default function GestionSegmentosModales({ segmentos, trigger, segmentoEditar }: Props) {
    const toast = useNotificaciones()
    const [isPending, startTransition] = useTransition()
    const [modalMode, setModalMode] = useState<ModalMode>(null)
    const [selectedSegmento, setSelectedSegmento] = useState<Segmento | null>(null)

    // Form state
    const [nombre, setNombre] = useState("")
    const [descripcion, setDescripcion] = useState("")

    const openCrear = useCallback(() => {
        setNombre("")
        setDescripcion("")
        setSelectedSegmento(null)
        setModalMode("crear")
    }, [])

    const openEditar = useCallback((seg: Segmento) => {
        setNombre(seg.nombre)
        setDescripcion(seg.descripcion ?? "")
        setSelectedSegmento(seg)
        setModalMode("editar")
    }, [])

    const openEliminar = useCallback((seg: Segmento) => {
        setSelectedSegmento(seg)
        setModalMode("eliminar")
    }, [])

    const closeModal = useCallback(() => {
        setModalMode(null)
        setSelectedSegmento(null)
    }, [])

    const handleSubmit = useCallback(
        (e: FormEvent) => {
            e.preventDefault()
            if (!nombre.trim()) {
                toast.error("El nombre es requerido")
                return
            }
            startTransition(async () => {
                const formData = { nombre: nombre.trim(), descripcion: descripcion.trim() || null }
                const result =
                    modalMode === "editar" && selectedSegmento
                        ? await editarSegmento(selectedSegmento.id, formData)
                        : await crearSegmento(formData)

                if (result.success) {
                    toast.success(modalMode === "editar" ? "Segmento actualizado" : "Segmento creado")
                    closeModal()
                } else {
                    toast.error(result.error ?? "Error inesperado")
                }
            })
        },
        [nombre, descripcion, modalMode, selectedSegmento, toast, closeModal]
    )

    const handleEliminar = useCallback(() => {
        if (!selectedSegmento) return
        startTransition(async () => {
            const result = await eliminarSegmento(selectedSegmento.id)
            if (result.success) {
                toast.success("Segmento eliminado")
                closeModal()
            } else {
                toast.error(result.error ?? "Error al eliminar")
            }
        })
    }, [selectedSegmento, toast, closeModal])

    // ─── Render trigger ───
    const renderTrigger = () => {
        if (trigger === "boton") {
            return (
                <BotonSistema variante="primario" tamaño="sm" onClick={openCrear}>
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Segmento
                </BotonSistema>
            )
        }

        if (trigger === "editar" && segmentoEditar) {
            return (
                <div className="flex gap-2">
                    <BotonSistema
                        variante="outline"
                        tamaño="sm"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditar(segmentoEditar) }}
                    >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        Editar
                    </BotonSistema>
                    <BotonSistema
                        variante="outline"
                        tamaño="sm"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEliminar(segmentoEditar) }}
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Eliminar
                    </BotonSistema>
                </div>
            )
        }

        if (trigger === "fab") {
            return <BotonFlotante onClick={openCrear} label="Crear segmento" />
        }

        return null
    }

    return (
        <>
            {renderTrigger()}

            {/* Modal overlay */}
            {modalMode && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <TarjetaSistema variante="elevated" className="w-full max-w-md">
                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <TituloSistema nivel={3}>
                                    {modalMode === "crear" && "Crear Segmento"}
                                    {modalMode === "editar" && "Editar Segmento"}
                                    {modalMode === "eliminar" && "Eliminar Segmento"}
                                </TituloSistema>
                                <BotonSistema variante="ghost" tamaño="sm" onClick={closeModal}>
                                    <X className="w-4 h-4" />
                                </BotonSistema>
                            </div>

                            {/* Eliminar confirmation */}
                            {modalMode === "eliminar" ? (
                                <div className="space-y-4">
                                    <TextoSistema>
                                        ¿Estás seguro de que deseas eliminar el segmento{" "}
                                        <strong>{selectedSegmento?.nombre}</strong>? Esta acción no se puede deshacer.
                                    </TextoSistema>
                                    <div className="flex justify-end gap-3">
                                        <BotonSistema variante="outline" onClick={closeModal} disabled={isPending}>
                                            Cancelar
                                        </BotonSistema>
                                        <BotonSistema
                                            variante="primario"
                                            onClick={handleEliminar}
                                            cargando={isPending}
                                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                        >
                                            Eliminar
                                        </BotonSistema>
                                    </div>
                                </div>
                            ) : (
                                /* Crear / Editar form */
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <InputSistema
                                        label="Nombre"
                                        value={nombre}
                                        onChange={(e) => setNombre(e.target.value)}
                                        placeholder="Ej: Jóvenes, Matrimonios, Adultos…"
                                        required
                                        autoFocus
                                    />
                                    <TextareaSistema
                                        label="Descripción (opcional)"
                                        value={descripcion}
                                        onChange={(e) => setDescripcion(e.target.value)}
                                        placeholder="Descripción breve del segmento"
                                        filas={3}
                                    />
                                    <div className="flex justify-end gap-3 pt-2">
                                        <BotonSistema variante="outline" type="button" onClick={closeModal} disabled={isPending}>
                                            Cancelar
                                        </BotonSistema>
                                        <BotonSistema variante="primario" type="submit" cargando={isPending}>
                                            {modalMode === "editar" ? "Guardar Cambios" : "Crear Segmento"}
                                        </BotonSistema>
                                    </div>
                                </form>
                            )}
                        </div>
                    </TarjetaSistema>
                </div>
            )}
        </>
    )
}
