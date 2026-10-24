"use client"

import { useMemo, useState, useEffect, useCallback, useId } from "react"
import { BotonSistema, PieAccionesSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { useRouter } from "next/navigation"
import { registrarAsistenciaV2 } from "@/lib/actions/asistencia-avanzada.actions"
import type { TipoPresencia } from "@/lib/types/asistencia-avanzada.types"
import { CheckCheck, Lock, UserPlus, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilaMiembroAsistencia } from "./asistencia/FilaMiembroAsistencia.client"
import { TarjetaReunion, type DatosReunion } from "./asistencia/TarjetaReunion.client"
import {
    asistio,
    horaParaGuardar,
    horaParaInput,
    type EstadoMiembro,
    type MiembroAsistencia,
} from "./asistencia/opciones"

// ─── Types ───────────────────────────────────────────────────────────

interface ConfigAsistencia {
    visitantes_habilitados?: boolean
    puntos_oracion_compartidos?: boolean
    modo_cierre_asistencia?: string
}

interface InitialData {
    fecha?: string
    hora?: string | null
    tema?: string | null
    notas?: string | null
    descripcion?: string | null
    puntos_oracion?: string | null
    notas_privadas_lider?: string | null
    conteo_visitantes?: number
    no_hubo_reunion?: boolean
    motivo_no_reunion?: string | null
    estado?: Record<string, EstadoMiembro>
}

interface Props {
    grupoId: string
    miembros: MiembroAsistencia[]
    initialData?: InitialData
    isEdit?: boolean
    configuracion?: ConfigAsistencia
    ventanaCerrada?: boolean
}

function datosIniciales(initialData?: InitialData): DatosReunion {
    return {
        fecha: initialData?.fecha || new Date().toISOString().slice(0, 10),
        hora: horaParaInput(initialData?.hora),
        tema: initialData?.tema || "",
        notas: initialData?.notas || "",
        descripcion: initialData?.descripcion || "",
        puntosOracion: initialData?.puntos_oracion || "",
        notasPrivadas: initialData?.notas_privadas_lider || "",
        conteoVisitantes: initialData?.conteo_visitantes ?? 0,
        noHuboReunion: initialData?.no_hubo_reunion ?? false,
        motivoNoReunion: initialData?.motivo_no_reunion || "",
    }
}

function contador(presentes: number, total: number) {
    return `${presentes} de ${total} presentes`
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * Registro de asistencia de un Grupo de Vida. Desde `lg`, dos columnas: la
 * reunión (fija al hacer scroll) y la lista de asistencia; en móvil, una.
 * "Presentes" cuenta presente + tarde, igual que el detalle del evento.
 */
export default function RegistroAsistenciaAvanzado({
    grupoId,
    miembros,
    initialData,
    isEdit,
    configuracion,
    ventanaCerrada,
}: Props) {
    const router = useRouter()
    const toast = useNotificaciones()

    const [reunion, setReunion] = useState<DatosReunion>(() => datosIniciales(initialData))
    const [estado, setEstado] = useState<Record<string, EstadoMiembro>>(() => {
        if (initialData?.estado) return initialData.estado
        const map: Record<string, EstadoMiembro> = {}
        for (const m of miembros) map[m.id] = { tipo_presencia: "presente" }
        return map
    })
    const [saving, setSaving] = useState(false)
    const idTitulo = useId()

    // ── Sync initialData
    useEffect(() => {
        if (initialData) {
            setReunion(datosIniciales(initialData))
            if (initialData.estado) setEstado(initialData.estado)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(initialData)])

    // ── Computed
    const totalPresentes = useMemo(
        () => Object.values(estado).filter(v => asistio(v.tipo_presencia)).length,
        [estado]
    )

    // ── Actions
    const cambiarReunion = useCallback((cambios: Partial<DatosReunion>) => {
        setReunion(r => ({ ...r, ...cambios }))
    }, [])

    const cambiarMiembro = useCallback((id: string, cambios: Partial<EstadoMiembro>) => {
        setEstado(s => ({ ...s, [id]: { ...s[id], ...cambios } }))
    }, [])

    const marcarTodos = useCallback((tipo: TipoPresencia) => {
        const map: Record<string, EstadoMiembro> = {}
        for (const m of miembros) map[m.id] = { tipo_presencia: tipo }
        setEstado(map)
    }, [miembros])

    const guardar = async () => {
        try {
            setSaving(true)

            const asistencias = miembros.map(m => ({
                usuario_id: m.id,
                tipo_presencia: estado[m.id]?.tipo_presencia ?? "presente",
                motivo_inasistencia: estado[m.id]?.tipo_presencia === "ausente"
                    ? (estado[m.id]?.motivo || undefined)
                    : undefined,
                nota: estado[m.id]?.nota || undefined,
                tiempo_tardanza: estado[m.id]?.tipo_presencia === "tarde"
                    ? (estado[m.id]?.tiempo_tardanza || undefined)
                    : undefined,
                motivo_tardanza: estado[m.id]?.tipo_presencia === "tarde"
                    ? (estado[m.id]?.motivo_tardanza || undefined)
                    : undefined,
                motivo_tardanza_otro: estado[m.id]?.tipo_presencia === "tarde" && estado[m.id]?.motivo_tardanza === "otro"
                    ? (estado[m.id]?.motivo_tardanza_otro || undefined)
                    : undefined,
            }))

            const result = await registrarAsistenciaV2({
                grupo_id: grupoId,
                fecha: reunion.fecha,
                hora: horaParaGuardar(reunion.hora),
                tema: reunion.tema || undefined,
                notas: reunion.notas || undefined,
                descripcion: reunion.descripcion || undefined,
                puntos_oracion: reunion.puntosOracion || undefined,
                notas_privadas_lider: reunion.notasPrivadas || undefined,
                conteo_visitantes: reunion.conteoVisitantes > 0 ? reunion.conteoVisitantes : undefined,
                no_hubo_reunion: reunion.noHuboReunion,
                motivo_no_reunion: reunion.noHuboReunion ? (reunion.motivoNoReunion || undefined) : undefined,
                asistencias,
            })

            if (!result.success) throw new Error(result.error)

            toast.success(isEdit ? "Asistencia actualizada" : "Asistencia registrada")

            if (result.data?.evento_id) {
                router.push(`/grupos-vida/${grupoId}/asistencia/${result.data.evento_id}`)
            } else {
                router.push(`/grupos-vida/${grupoId}`)
            }
            router.refresh()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Error registrando asistencia")
        } finally {
            setSaving(false)
        }
    }

    const { noHuboReunion, conteoVisitantes } = reunion

    // ─── Render ──────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {ventanaCerrada && (
                <TarjetaSistema variante="outlined" className="border-danger/40 bg-danger/5 p-4 shadow-none">
                    <div className="flex items-start gap-3">
                        <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
                        <div>
                            <p className="font-medium text-foreground">Ventana de edición cerrada</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                El período para registrar o editar la asistencia de esta fecha ha expirado.
                                Puedes solicitar una excepción al director.
                            </p>
                        </div>
                    </div>
                </TarjetaSistema>
            )}

            <div
                className={cn(
                    "grid grid-cols-1 gap-6",
                    !noHuboReunion && "lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]",
                )}
            >
                <TarjetaReunion
                    datos={reunion}
                    onCambio={cambiarReunion}
                    isEdit={isEdit}
                    ventanaCerrada={ventanaCerrada}
                    visitantesHabilitados={configuracion?.visitantes_habilitados}
                    className={cn(
                        noHuboReunion
                            ? "lg:max-w-xl"
                            : "lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto",
                    )}
                />

                {!noHuboReunion && (
                    <section aria-labelledby={idTitulo} className="@container min-w-0 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 id={idTitulo} className="text-base font-semibold text-foreground">
                                    Asistencia
                                </h2>
                                <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
                                    {contador(totalPresentes, miembros.length)}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex">
                                <BotonSistema
                                    variante="outline"
                                    tamaño="sm"
                                    icono={CheckCheck}
                                    onClick={() => marcarTodos("presente")}
                                    disabled={ventanaCerrada}
                                >
                                    Todos presentes
                                </BotonSistema>
                                <BotonSistema
                                    variante="outline"
                                    tamaño="sm"
                                    icono={UserX}
                                    onClick={() => marcarTodos("ausente")}
                                    disabled={ventanaCerrada}
                                >
                                    Todos ausentes
                                </BotonSistema>
                            </div>
                        </div>

                        <ul className="space-y-3 sm:space-y-0 sm:divide-y sm:divide-border sm:rounded-2xl sm:border sm:border-border sm:bg-card">
                            {miembros.map(m => (
                                <FilaMiembroAsistencia
                                    key={m.id}
                                    miembro={m}
                                    estado={estado[m.id]}
                                    onCambio={(cambios) => cambiarMiembro(m.id, cambios)}
                                />
                            ))}
                        </ul>
                    </section>
                )}
            </div>

            {/* Sticky only from md: on phones the fixed bottom menu would cover it. */}
            <PieAccionesSistema fijo={false} className="sm:justify-between md:sticky md:bottom-0 md:z-10">
                {noHuboReunion ? (
                    <BotonSistema variante="primario" onClick={guardar} cargando={saving} disabled={ventanaCerrada}>
                        Registrar que no hubo reunión
                    </BotonSistema>
                ) : (
                    <>
                        <p className="flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
                            <span>
                                <span className="font-semibold text-foreground">{totalPresentes}</span> de{" "}
                                {miembros.length} presentes
                            </span>
                            {conteoVisitantes > 0 && (
                                <span className="flex items-center gap-1">
                                    <UserPlus aria-hidden="true" className="h-4 w-4" />
                                    +{conteoVisitantes} visitantes
                                </span>
                            )}
                        </p>
                        <BotonSistema variante="primario" onClick={guardar} cargando={saving} disabled={ventanaCerrada}>
                            {isEdit ? "Actualizar asistencia" : "Guardar asistencia"}
                        </BotonSistema>
                    </>
                )}
            </PieAccionesSistema>
        </div>
    )
}
