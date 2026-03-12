"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import {
    BotonSistema,
    InputSistema,
    SelectSistema,
    TextareaSistema,
    TarjetaSistema,
    BadgeSistema,
} from "@/components/ui/sistema-diseno"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { useRouter } from "next/navigation"
import { registrarAsistenciaV2 } from "@/lib/actions/asistencia-avanzada.actions"
import type { TipoPresencia } from "@/lib/types/asistencia-avanzada.types"
import { Users, UserPlus, BookOpen, Lock, AlertTriangle } from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────

interface Miembro {
    id: string
    nombre: string
    apellido: string
    rol?: string
}

interface EstadoMiembro {
    tipo_presencia: TipoPresencia
    motivo?: string
    nota?: string
}

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
    miembros: Miembro[]
    initialData?: InitialData
    isEdit?: boolean
    configuracion?: ConfigAsistencia
    ventanaCerrada?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────

const OPCIONES_PRESENCIA: Array<{ valor: TipoPresencia; etiqueta: string }> = [
    { valor: "presente", etiqueta: "Presente" },
    { valor: "ausente", etiqueta: "Ausente" },
    { valor: "tarde", etiqueta: "Tarde" },
    { valor: "justificado", etiqueta: "Justificado" },
]

const DIAS_SEMANA = [
    "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
]

function rolLabel(rol?: string): string {
    if (!rol) return "Miembro"
    if (rol === "Colíder" || rol === "Colider") return "Aprendiz"
    return rol
}

function parseToUi(h24: string): { h: string; m: string; ap: "AM" | "PM" } {
    if (!h24) return { h: "", m: "", ap: "AM" }
    const [HH, MM] = h24.split(":")
    let hh = parseInt(HH, 10)
    const ap = hh >= 12 ? "PM" : "AM"
    if (hh === 0) hh = 12
    else if (hh > 12) hh = hh - 12
    return { h: String(hh), m: MM, ap: ap as "AM" | "PM" }
}

function to24h(h: string, m: string, ap: "AM" | "PM"): string | null {
    if (!h || !m) return null
    let hh = parseInt(h, 10)
    if (isNaN(hh) || hh < 1 || hh > 12) return null
    if (ap === "AM") {
        if (hh === 12) hh = 0
    } else {
        if (hh !== 12) hh += 12
    }
    return `${String(hh).padStart(2, "0")}:${m.padStart(2, "0")}`
}

function badgeVariante(tipo: TipoPresencia) {
    switch (tipo) {
        case "presente": return "success" as const
        case "ausente": return "error" as const
        case "tarde": return "warning" as const
        case "justificado": return "info" as const
    }
}

// ─── Component ───────────────────────────────────────────────────────

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

    // ── Formulario principal
    const [fecha, setFecha] = useState(() => initialData?.fecha || new Date().toISOString().slice(0, 10))
    const [hora, setHora] = useState(() => (initialData?.hora ? initialData.hora.slice(0, 5) : ""))
    const initialUi = parseToUi(hora)
    const [hora12, setHora12] = useState(initialUi.h)
    const [minutos, setMinutos] = useState(initialUi.m)
    const [amPm, setAmPm] = useState<"AM" | "PM">(initialUi.ap)
    const [tema, setTema] = useState(() => initialData?.tema || "")
    const [notas, setNotas] = useState(() => initialData?.notas || "")

    // ── Campos avanzados v2
    const [descripcion, setDescripcion] = useState(() => initialData?.descripcion || "")
    const [puntosOracion, setPuntosOracion] = useState(() => initialData?.puntos_oracion || "")
    const [notasPrivadas, setNotasPrivadas] = useState(() => initialData?.notas_privadas_lider || "")
    const [conteoVisitantes, setConteoVisitantes] = useState(() => initialData?.conteo_visitantes ?? 0)
    const [noHuboReunion, setNoHuboReunion] = useState(() => initialData?.no_hubo_reunion ?? false)
    const [motivoNoReunion, setMotivoNoReunion] = useState(() => initialData?.motivo_no_reunion || "")

    // ── Estado de miembros
    const [estado, setEstado] = useState<Record<string, EstadoMiembro>>(() => {
        if (initialData?.estado) return initialData.estado
        const map: Record<string, EstadoMiembro> = {}
        for (const m of miembros) map[m.id] = { tipo_presencia: "presente" }
        return map
    })

    const [saving, setSaving] = useState(false)
    const [mostrarAvanzado, setMostrarAvanzado] = useState(false)

    // ── Sync initialData
    useEffect(() => {
        if (initialData) {
            setFecha(initialData.fecha || new Date().toISOString().slice(0, 10))
            const hRaw = initialData.hora ? initialData.hora.slice(0, 5) : ""
            setHora(hRaw)
            const ui = parseToUi(hRaw)
            setHora12(ui.h)
            setMinutos(ui.m)
            setAmPm(ui.ap)
            setTema(initialData.tema || "")
            setNotas(initialData.notas || "")
            setDescripcion(initialData.descripcion || "")
            setPuntosOracion(initialData.puntos_oracion || "")
            setNotasPrivadas(initialData.notas_privadas_lider || "")
            setConteoVisitantes(initialData.conteo_visitantes ?? 0)
            setNoHuboReunion(initialData.no_hubo_reunion ?? false)
            setMotivoNoReunion(initialData.motivo_no_reunion || "")
            if (initialData.estado) setEstado(initialData.estado)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(initialData)])

    // ── Computed
    const totalPresentes = useMemo(
        () => Object.values(estado).filter(v => v.tipo_presencia === "presente" || v.tipo_presencia === "tarde").length,
        [estado]
    )

    // ── Actions
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
            }))

            const horaFinal = to24h(hora12, minutos, amPm)

            const result = await registrarAsistenciaV2({
                grupo_id: grupoId,
                fecha,
                hora: horaFinal ?? undefined,
                tema: tema || undefined,
                notas: notas || undefined,
                descripcion: descripcion || undefined,
                puntos_oracion: puntosOracion || undefined,
                notas_privadas_lider: notasPrivadas || undefined,
                conteo_visitantes: conteoVisitantes > 0 ? conteoVisitantes : undefined,
                no_hubo_reunion: noHuboReunion,
                motivo_no_reunion: noHuboReunion ? (motivoNoReunion || undefined) : undefined,
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

    // ─── Render ──────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Ventana cerrada */}
            {ventanaCerrada && (
                <TarjetaSistema variante="outlined" className="border-destructive/50 bg-destructive/5 p-4">
                    <div className="flex items-start gap-3">
                        <Lock className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-foreground">Ventana de edición cerrada</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                El período para registrar o editar la asistencia de esta fecha ha expirado.
                                Puedes solicitar una excepción al director.
                            </p>
                        </div>
                    </div>
                </TarjetaSistema>
            )}

            {/* No hubo reunión */}
            <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <Checkbox
                    checked={noHuboReunion}
                    onCheckedChange={(v) => setNoHuboReunion(!!v)}
                    disabled={ventanaCerrada}
                />
                <div>
                    <span className="font-medium text-foreground">No hubo reunión esta semana</span>
                    <p className="text-xs text-muted-foreground">Si marcas esto, no se registrarán asistencias individuales</p>
                </div>
            </div>

            {noHuboReunion && (
                <TextareaSistema
                    label="Motivo (opcional)"
                    value={motivoNoReunion}
                    onChange={e => setMotivoNoReunion(e.target.value)}
                    placeholder="¿Por qué no hubo reunión?"
                    filas={2}
                />
            )}

            {/* Formulario principal (solo si hubo reunión) */}
            {!noHuboReunion && (
                <>
                    {/* Metadatos del evento */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">Fecha</label>
                            <InputSistema
                                type="date"
                                value={fecha}
                                onChange={e => setFecha(e.target.value)}
                                disabled={!!isEdit || ventanaCerrada}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">Hora</label>
                            <div className="flex items-center gap-2">
                                <SelectSistema
                                    value={hora12}
                                    onValueChange={setHora12}
                                    opciones={[
                                        { valor: "", etiqueta: "HH" },
                                        ...Array.from({ length: 12 }).map((_, i) => ({
                                            valor: String(i + 1),
                                            etiqueta: String(i + 1),
                                        })),
                                    ]}
                                />
                                <span className="text-sm text-muted-foreground">:</span>
                                <SelectSistema
                                    value={minutos}
                                    onValueChange={setMinutos}
                                    opciones={[
                                        { valor: "", etiqueta: "MM" },
                                        ...Array.from({ length: 60 }).map((_, i) => ({
                                            valor: String(i).padStart(2, "0"),
                                            etiqueta: String(i).padStart(2, "0"),
                                        })),
                                    ]}
                                />
                                <SelectSistema
                                    value={amPm}
                                    onValueChange={(v: string) => setAmPm(v as "AM" | "PM")}
                                    opciones={[
                                        { valor: "AM", etiqueta: "AM" },
                                        { valor: "PM", etiqueta: "PM" },
                                    ]}
                                />
                            </div>
                        </div>
                        <div>
                            <InputSistema
                                label="Tema"
                                value={tema}
                                onChange={e => setTema(e.target.value)}
                                placeholder="Opcional"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <TextareaSistema
                                label="Notas"
                                value={notas}
                                onChange={e => setNotas(e.target.value)}
                                placeholder="Opcional"
                                filas={2}
                            />
                        </div>
                    </div>

                    {/* Campos avanzados (colapsable) */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center gap-1"
                        >
                            <BookOpen className="h-4 w-4" />
                            {mostrarAvanzado ? "Ocultar" : "Mostrar"} campos pastorales
                        </button>

                        {mostrarAvanzado && (
                            <div className="mt-4 space-y-4 p-4 rounded-xl border border-border bg-card">
                                <TextareaSistema
                                    label="Descripción de la reunión"
                                    value={descripcion}
                                    onChange={e => setDescripcion(e.target.value)}
                                    placeholder="Resumen de lo que se compartió..."
                                    filas={3}
                                />
                                <TextareaSistema
                                    label="Puntos de oración"
                                    value={puntosOracion}
                                    onChange={e => setPuntosOracion(e.target.value)}
                                    placeholder="Peticiones de oración compartidas..."
                                    filas={2}
                                />
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
                                    <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div className="flex-1">
                                        <TextareaSistema
                                            label="Notas privadas del líder"
                                            value={notasPrivadas}
                                            onChange={e => setNotasPrivadas(e.target.value)}
                                            placeholder="Solo visibles para ti y directores..."
                                            filas={2}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Estas notas no serán visibles para los miembros del grupo.
                                        </p>
                                    </div>
                                </div>

                                {configuracion?.visitantes_habilitados && (
                                    <div className="flex items-center gap-3">
                                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                                        <InputSistema
                                            label="Visitantes"
                                            type="number"
                                            value={String(conteoVisitantes)}
                                            onChange={e => setConteoVisitantes(Math.max(0, parseInt(e.target.value) || 0))}
                                            placeholder="0"
                                            className="w-24"
                                        />
                                        <span className="text-sm text-muted-foreground">personas no miembros que asistieron</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Acciones por lote */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <BotonSistema variante="outline" onClick={() => marcarTodos("presente")} className="flex-1 sm:flex-none" disabled={ventanaCerrada}>
                            <span className="sm:hidden">✓ Todos presentes</span>
                            <span className="hidden sm:inline">Marcar todos presentes</span>
                        </BotonSistema>
                        <BotonSistema variante="outline" onClick={() => marcarTodos("ausente")} className="flex-1 sm:flex-none" disabled={ventanaCerrada}>
                            <span className="sm:hidden">✗ Todos ausentes</span>
                            <span className="hidden sm:inline">Marcar todos ausentes</span>
                        </BotonSistema>
                    </div>

                    {/* Lista de miembros */}
                    <div className="border border-border rounded-xl divide-y divide-border">
                        {miembros.map(m => (
                            <div key={m.id} className="p-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-foreground">
                                                {m.nombre} {m.apellido}
                                            </span>
                                            <BadgeSistema
                                                variante={badgeVariante(estado[m.id]?.tipo_presencia ?? "presente")}
                                                tamaño="sm"
                                            >
                                                {OPCIONES_PRESENCIA.find(o => o.valor === (estado[m.id]?.tipo_presencia ?? "presente"))?.etiqueta}
                                            </BadgeSistema>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{rolLabel(m.rol)}</div>
                                    </div>
                                    <SelectSistema
                                        value={estado[m.id]?.tipo_presencia ?? "presente"}
                                        onValueChange={(v: string) =>
                                            setEstado(s => ({
                                                ...s,
                                                [m.id]: { ...s[m.id], tipo_presencia: v as TipoPresencia },
                                            }))
                                        }
                                        opciones={OPCIONES_PRESENCIA.map(o => ({ valor: o.valor, etiqueta: o.etiqueta }))}
                                    />
                                </div>

                                {/* Motivo de inasistencia */}
                                {(estado[m.id]?.tipo_presencia === "ausente" || estado[m.id]?.tipo_presencia === "justificado") && (
                                    <div className="mt-3 ml-2">
                                        <InputSistema
                                            className="w-full"
                                            placeholder="Motivo de inasistencia (opcional)"
                                            value={estado[m.id]?.motivo || ""}
                                            onChange={e =>
                                                setEstado(s => ({
                                                    ...s,
                                                    [m.id]: { ...s[m.id], motivo: e.target.value },
                                                }))
                                            }
                                        />
                                    </div>
                                )}

                                {/* Nota individual */}
                                {estado[m.id]?.tipo_presencia === "tarde" && (
                                    <div className="mt-3 ml-2">
                                        <InputSistema
                                            className="w-full"
                                            placeholder="Nota (ej: llegó 15 min tarde)"
                                            value={estado[m.id]?.nota || ""}
                                            onChange={e =>
                                                setEstado(s => ({
                                                    ...s,
                                                    [m.id]: { ...s[m.id], nota: e.target.value },
                                                }))
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Resumen inferior */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                Presentes: {totalPresentes} / {miembros.length}
                            </span>
                            {conteoVisitantes > 0 && (
                                <span className="flex items-center gap-1">
                                    <UserPlus className="h-4 w-4" />
                                    +{conteoVisitantes} visitantes
                                </span>
                            )}
                        </div>
                        <BotonSistema
                            variante="primario"
                            onClick={guardar}
                            cargando={saving}
                            disabled={ventanaCerrada}
                        >
                            {isEdit ? "Actualizar asistencia" : "Guardar asistencia"}
                        </BotonSistema>
                    </div>
                </>
            )}

            {/* Guardar "no hubo reunión" */}
            {noHuboReunion && (
                <div className="flex justify-end">
                    <BotonSistema
                        variante="primario"
                        onClick={guardar}
                        cargando={saving}
                        disabled={ventanaCerrada}
                    >
                        Registrar que no hubo reunión
                    </BotonSistema>
                </div>
            )}
        </div>
    )
}
