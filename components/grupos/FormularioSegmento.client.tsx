"use client"

import { useState, useTransition, useCallback, type FormEvent } from "react"
import { Plus, Edit, Trash2, X, Loader2 } from "lucide-react"
import { crearSegmento, editarSegmento, eliminarSegmento } from "@/lib/actions/segmentos.actions"
import {
    TarjetaSistema, BotonSistema, InputSistema, TextareaSistema,
    TituloSistema, TextoSistema,
} from "@/components/ui/sistema-diseno"
import { useNotificaciones } from "@/hooks/use-notificaciones"

// ---------- Types ----------
type Segmento = { id: string; nombre: string; descripcion?: string | null }

type ModalMode = "crear" | "editar" | "eliminar" | null

interface Props {
    segmentos: Segmento[]
}

/**
 * Componente client-side para gestión CRUD de segmentos.
 * Permite crear, editar y eliminar segmentos con modales inline.
 *
 * @param segmentos - Lista inicial de segmentos cargados desde el servidor
 */
export default function GestionSegmentos({ segmentos }: Props) {
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

    return (
        <>
            {/* Header con botón crear */}
            <div className="flex items-center justify-between">
                <TituloSistema nivel={2}>Lista de Segmentos</TituloSistema>
                <BotonSistema variante="primario" tamaño="md" onClick={openCrear}>
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Segmento
                </BotonSistema>
            </div>

            {/* Lista de segmentos */}
            <div className="space-y-2 sm:space-y-3">
                {segmentos.length > 0 ? (
                    segmentos.map((seg) => (
                        <TarjetaSistema key={seg.id} className="group hover:shadow-md transition-shadow">
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <TituloSistema nivel={4} className="text-foreground truncate">
                                        {seg.nombre}
                                    </TituloSistema>
                                    {seg.descripcion && (
                                        <TextoSistema variante="sutil" tamaño="sm" className="mt-1 truncate">
                                            {seg.descripcion}
                                        </TextoSistema>
                                    )}
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <BotonSistema
                                        variante="outline"
                                        tamaño="sm"
                                        onClick={(e) => { e.preventDefault(); openEditar(seg) }}
                                    >
                                        <Edit className="w-4 h-4 mr-1" />
                                        <span className="hidden sm:inline">Editar</span>
                                    </BotonSistema>
                                    <BotonSistema
                                        variante="outline"
                                        tamaño="sm"
                                        onClick={(e) => { e.preventDefault(); openEliminar(seg) }}
                                    >
                                        <Trash2 className="w-4 h-4 mr-1" />
                                        <span className="hidden sm:inline">Eliminar</span>
                                    </BotonSistema>
                                </div>
                            </div>
                        </TarjetaSistema>
                    ))
                ) : (
                    <TarjetaSistema className="p-8 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <TituloSistema nivel={3} variante="sutil" className="mb-2">
                                No hay segmentos registrados
                            </TituloSistema>
                            <TextoSistema variante="sutil">
                                Comienza creando el primer segmento para organizar tus grupos
                            </TextoSistema>
                            <BotonSistema variante="primario" tamaño="md" onClick={openCrear}>
                                <Plus className="w-4 h-4 mr-2" />
                                Crear Primer Segmento
                            </BotonSistema>
                        </div>
                    </TarjetaSistema>
                )}
            </div>

            {/* Modal overlay */}
            {modalMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
