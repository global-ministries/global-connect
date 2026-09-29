"use client"

import { useState, useTransition, useCallback, type FormEvent } from "react"
import { Plus, Edit, X } from "lucide-react"
import { crearSegmento, editarSegmento, eliminarSegmento } from "@/lib/actions/segmentos.actions"
import {
    TarjetaSistema, BotonSistema, InputSistema,
    TituloSistema, TextoSistema,
} from "@/components/ui/sistema-diseno"
import { BotonFlotante } from "@/components/ui/BotonFlotante"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { cn } from "@/lib/utils"

// ---------- Types ----------
type Segmento = { id: string; nombre: string }

type ModalMode = "crear" | "editar" | "eliminar" | null

interface Props {
    segmentos: readonly Segmento[]
    /**
     * Modo de render: "boton" = botón crear en header, "editar" = botón editar inline,
     * "eliminar" = solo la confirmación de eliminar, controlada por el padre, "fab" = FAB móvil
     */
    trigger: "boton" | "editar" | "eliminar" | "fab"
    /** Segmento a editar o eliminar (solo para trigger="editar" o "eliminar") */
    segmentoEditar?: Segmento
    /** Confirmación de eliminar abierta (solo para trigger="eliminar") */
    abierto?: boolean
    /** Se llama al cerrar la confirmación de eliminar (solo para trigger="eliminar") */
    onCerrar?: () => void
    /** Clases extra del botón "Editar" */
    claseBoton?: string
}

/**
 * Componente client-side para gestión CRUD de segmentos.
 * Se usa en 4 modos:
 * - trigger="boton": renderiza el botón "Crear Segmento" + modales
 * - trigger="editar": renderiza el botón editar para un segmento + modales
 * - trigger="eliminar": no renderiza botón; muestra la confirmación de eliminar cuando el padre la abre
 * - trigger="fab": renderiza el FAB móvil + modales
 */
export default function GestionSegmentosModales({
    segmentos, trigger, segmentoEditar, abierto = false, onCerrar, claseBoton,
}: Props) {
    const toast = useNotificaciones()
    const [isPending, startTransition] = useTransition()
    const [modalModeLocal, setModalMode] = useState<ModalMode>(null)
    const [selectedLocal, setSelectedSegmento] = useState<Segmento | null>(null)

    // En modo "eliminar" el padre decide cuándo se abre la confirmación.
    const controlado = trigger === "eliminar"
    const modalMode: ModalMode = controlado ? (abierto ? "eliminar" : null) : modalModeLocal
    const selectedSegmento = controlado ? (segmentoEditar ?? null) : selectedLocal

    // Form state
    const [nombre, setNombre] = useState("")

    const openCrear = useCallback(() => {
        setNombre("")
        setSelectedSegmento(null)
        setModalMode("crear")
    }, [])

    const openEditar = useCallback((seg: Segmento) => {
        setNombre(seg.nombre)
        setSelectedSegmento(seg)
        setModalMode("editar")
    }, [])

    const closeModal = useCallback(() => {
        setModalMode(null)
        setSelectedSegmento(null)
        onCerrar?.()
    }, [onCerrar])

    const handleSubmit = useCallback(
        (e: FormEvent) => {
            e.preventDefault()
            if (!nombre.trim()) {
                toast.error("El nombre es requerido")
                return
            }
            startTransition(async () => {
                const formData = { nombre: nombre.trim() }
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
        [nombre, modalMode, selectedSegmento, toast, closeModal]
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
                <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    className={cn(claseBoton)}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditar(segmentoEditar) }}
                >
                    <Edit className="w-3.5 h-3.5 mr-1" />
                    Editar
                </BotonSistema>
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
