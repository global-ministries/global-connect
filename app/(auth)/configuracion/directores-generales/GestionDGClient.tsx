"use client"

import { useState, useTransition, useMemo, useCallback, useEffect } from "react"
import { X, Plus, Users, Loader2, ChevronDown, ChevronUp, UserCheck, Eye } from "lucide-react"
import {
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
  BotonSistema,
  SelectSistema,
  BadgeSistema,
} from "@/components/ui/sistema-diseno"
import { UserAvatar } from "@/components/ui/UserAvatar"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import {
  asignarSegmentoDG,
  desasignarSegmentoDG,
} from "@/lib/actions/dg-segmentos.actions"
import {
  obtenerDEsDeSegmentoConAsignaciones,
  asignarDEaDG,
  desasignarDEaDG,
  type DirectorEtapaConAsignaciones,
  type DEAsignadoPreview,
} from "@/lib/actions/dg-directores.actions"

// ─── Tipos ─────────────────────────────────────────────
interface Segmento {
  id: string
  nombre: string
}

interface DirectorGeneral {
  usuarioId: string
  nombre: string
  email: string | null
  foto: string | null
  segmentos: Segmento[]
}

interface Props {
  directoresIniciales: DirectorGeneral[]
  segmentosDisponibles: Segmento[]
  desAsignadosPorDG: Record<string, DEAsignadoPreview[]>
  usuarioActualId: string
  rolesUsuario: string[]
}

// ─── Componente principal ──────────────────────────────
export function GestionDGClient({
  directoresIniciales,
  segmentosDisponibles,
  desAsignadosPorDG: desIniciales,
  usuarioActualId,
  rolesUsuario,
}: Props) {
  const [directores, setDirectores] = useState(directoresIniciales)
  const [desAsignados, setDesAsignados] = useState(desIniciales)
  const toast = useNotificaciones()

  const esGestor = rolesUsuario.some((r) => ["admin", "pastor", "director-general"].includes(r))

  if (directores.length === 0) {
    return (
      <TarjetaSistema variante="outlined" className="py-12 text-center">
        <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <TextoSistema variante="muted" className="font-medium">
          No hay Directores Generales registrados
        </TextoSistema>
        <TextoSistema variante="muted" tamaño="sm" className="mt-1">
          Asigna el rol &quot;Director General&quot; a un usuario para que aparezca aquí.
        </TextoSistema>
      </TarjetaSistema>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <TextoSistema variante="muted" tamaño="sm">
        Gestiona segmentos y directores de etapa asignados a cada Director General.
      </TextoSistema>

      {directores.map((dg) => (
        <TarjetaDG
          key={dg.usuarioId}
          director={dg}
          segmentosDisponibles={segmentosDisponibles}
          esGestor={esGestor}
          usuarioActualId={usuarioActualId}
          desPreview={desAsignados[dg.usuarioId] ?? []}
          onSegmentoUpdate={(segmentosActualizados) => {
            setDirectores((prev) =>
              prev.map((d) =>
                d.usuarioId === dg.usuarioId
                  ? { ...d, segmentos: segmentosActualizados }
                  : d
              )
            )
          }}
          onDEsUpdate={(nuevos) => {
            setDesAsignados((prev) => ({
              ...prev,
              [dg.usuarioId]: nuevos,
            }))
          }}
          toast={toast}
        />
      ))}
    </div>
  )
}

// ─── Tarjeta de Director General ───────────────────────
function TarjetaDG({
  director,
  segmentosDisponibles,
  esGestor,
  usuarioActualId,
  desPreview,
  onSegmentoUpdate,
  onDEsUpdate,
  toast,
}: {
  director: DirectorGeneral
  segmentosDisponibles: Segmento[]
  esGestor: boolean
  usuarioActualId: string
  desPreview: DEAsignadoPreview[]
  onSegmentoUpdate: (segmentos: Segmento[]) => void
  onDEsUpdate: (des: DEAsignadoPreview[]) => void
  toast: ReturnType<typeof useNotificaciones>
}) {
  const [isPending, startTransition] = useTransition()
  const [segmentoSeleccionado, setSegmentoSeleccionado] = useState("")
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null)
  const [segmentoExpandido, setSegmentoExpandido] = useState<string | null>(null)

  // Segmentos no asignados aún
  const segmentosNoAsignados = useMemo(() => {
    const asignadosIds = new Set(director.segmentos.map((s) => s.id))
    return segmentosDisponibles.filter((s) => !asignadosIds.has(s.id))
  }, [director.segmentos, segmentosDisponibles])

  // DEs agrupados por segmento para preview
  const desPorSegmento = useMemo(() => {
    const map = new Map<string, DEAsignadoPreview[]>()
    for (const de of desPreview) {
      const lista = map.get(de.segmentoId) ?? []
      lista.push(de)
      map.set(de.segmentoId, lista)
    }
    return map
  }, [desPreview])

  const handleAsignar = () => {
    if (!segmentoSeleccionado) return

    const segmento = segmentosDisponibles.find(
      (s) => s.id === segmentoSeleccionado
    )
    if (!segmento) return

    setAccionEnCurso(`asignar-${segmentoSeleccionado}`)
    startTransition(async () => {
      const result = await asignarSegmentoDG({
        usuarioId: director.usuarioId,
        segmentoId: segmentoSeleccionado,
      })

      if (result.success) {
        onSegmentoUpdate([...director.segmentos, segmento])
        setSegmentoSeleccionado("")
        toast.success(`Segmento "${segmento.nombre}" asignado`)
      } else {
        toast.error(result.error ?? "Error al asignar")
      }
      setAccionEnCurso(null)
    })
  }

  const handleDesasignar = (segmentoId: string) => {
    const segmento = director.segmentos.find((s) => s.id === segmentoId)
    if (!segmento) return

    setAccionEnCurso(`desasignar-${segmentoId}`)
    startTransition(async () => {
      const result = await desasignarSegmentoDG({
        usuarioId: director.usuarioId,
        segmentoId,
      })

      if (result.success) {
        onSegmentoUpdate(director.segmentos.filter((s) => s.id !== segmentoId))
        // Also remove DEs from preview for this segmento
        onDEsUpdate(desPreview.filter((de) => de.segmentoId !== segmentoId))
        if (segmentoExpandido === segmentoId) setSegmentoExpandido(null)
        toast.success(`Segmento "${segmento.nombre}" removido`)
      } else {
        toast.error(result.error ?? "Error al remover")
      }
      setAccionEnCurso(null)
    })
  }

  const toggleSegmentoExpandido = (segmentoId: string) => {
    setSegmentoExpandido((prev) => (prev === segmentoId ? null : segmentoId))
  }

  // Parse nombre para UserAvatar
  const [nombre, ...apellidoParts] = director.nombre.split(" ")
  const apellido = apellidoParts.join(" ")

  return (
    <TarjetaSistema className="p-4 sm:p-6">
      {/* Header: avatar + info */}
      <div className="flex items-start gap-3 sm:gap-4">
        <UserAvatar
          photoUrl={director.foto}
          nombre={nombre}
          apellido={apellido}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <TituloSistema nivel={4} className="truncate">
            {director.nombre}
          </TituloSistema>
          {director.email && (
            <TextoSistema variante="muted" tamaño="sm" className="truncate">
              {director.email}
            </TextoSistema>
          )}
          {/* Summary badge */}
          {desPreview.length > 0 && (
            <div className="mt-1">
              <BadgeSistema variante="success" tamaño="sm">
                {desPreview.length} director{desPreview.length !== 1 ? "es" : ""} de etapa asignado{desPreview.length !== 1 ? "s" : ""}
              </BadgeSistema>
            </div>
          )}
        </div>
      </div>

      {/* Preview compacto de DEs asignados */}
      {desPreview.length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/40">
          <TextoSistema tamaño="sm" className="font-medium text-muted-foreground mb-2">
            <UserCheck className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Directores de etapa asignados
          </TextoSistema>
          <div className="flex flex-wrap gap-2">
            {desPreview.map((de) => (
              <div
                key={de.segmentoLiderId}
                className="flex items-center gap-1.5 rounded-lg bg-card/60 border border-border/30 px-2 py-1"
              >
                <UserAvatar
                  photoUrl={de.foto}
                  nombre={de.nombre.split(" ")[0]}
                  apellido={de.nombre.split(" ").slice(1).join(" ")}
                  size="xs"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                    {de.nombre}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {de.segmentoNombre} · {de.gruposAsignados} grupo{de.gruposAsignados !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Segmentos asignados */}
      <div className="mt-4">
        <TextoSistema tamaño="sm" className="font-medium mb-2">
          Segmentos asignados ({director.segmentos.length})
        </TextoSistema>

        {director.segmentos.length > 0 ? (
          <div className="flex flex-col gap-2">
            {director.segmentos.map((seg) => {
              const desDelSegmento = desPorSegmento.get(seg.id) ?? []
              return (
                <div key={seg.id}>
                  <div className="flex items-center gap-2">
                    <BadgeSistema variante="info" tamaño="md">
                      <span className="flex items-center gap-1.5">
                        {seg.nombre}
                        {esGestor && (
                          <button
                            type="button"
                            onClick={() => handleDesasignar(seg.id)}
                            disabled={isPending}
                            className="inline-flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors p-0.5 -mr-1 disabled:opacity-50"
                            aria-label={`Remover segmento ${seg.nombre}`}
                          >
                            {accionEnCurso === `desasignar-${seg.id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <X className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </span>
                    </BadgeSistema>

                    {/* Mini count of assigned DEs */}
                    {desDelSegmento.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {desDelSegmento.length} DE asignado{desDelSegmento.length !== 1 ? "s" : ""}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleSegmentoExpandido(seg.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Gestionar
                      {segmentoExpandido === seg.id ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Panel expandible: DEs del segmento */}
                  {segmentoExpandido === seg.id && (
                    <SeccionDEsSegmento
                      segmentoId={seg.id}
                      segmentoNombre={seg.nombre}
                      dgUsuarioId={director.usuarioId}
                      dgNombre={director.nombre}
                      usuarioActualId={usuarioActualId}
                      onDEToggle={(de, asignado) => {
                        if (asignado) {
                          // Added
                          onDEsUpdate([...desPreview, de])
                        } else {
                          // Removed
                          onDEsUpdate(
                            desPreview.filter(
                              (d) => d.segmentoLiderId !== de.segmentoLiderId
                            )
                          )
                        }
                      }}
                      toast={toast}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <TextoSistema variante="muted" tamaño="sm">
            Sin segmentos asignados
          </TextoSistema>
        )}
      </div>

      {/* Agregar segmento — solo admin/pastor */}
      {esGestor && segmentosNoAsignados.length > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <SelectSistema
              opciones={segmentosNoAsignados.map((s) => ({
                valor: s.id,
                etiqueta: s.nombre,
              }))}
              placeholder="Seleccionar segmento..."
              value={segmentoSeleccionado}
              onValueChange={setSegmentoSeleccionado}
            />
          </div>
          <BotonSistema
            variante="primario"
            tamaño="md"
            onClick={handleAsignar}
            cargando={
              isPending && accionEnCurso?.startsWith("asignar") === true
            }
            icono={Plus}
            disabled={!segmentoSeleccionado || isPending}
          >
            Asignar
          </BotonSistema>
        </div>
      )}

      {/* Mensaje cuando todos los segmentos están asignados */}
      {esGestor && segmentosNoAsignados.length === 0 &&
        segmentosDisponibles.length > 0 && (
          <TextoSistema
            variante="muted"
            tamaño="sm"
            className="mt-4 italic"
          >
            Todos los segmentos están asignados a este director.
          </TextoSistema>
        )}
    </TarjetaSistema>
  )
}

// ─── Sección de DEs expandible por segmento ────────────
function SeccionDEsSegmento({
  segmentoId,
  segmentoNombre,
  dgUsuarioId,
  dgNombre,
  usuarioActualId,
  onDEToggle,
  toast,
}: {
  segmentoId: string
  segmentoNombre: string
  dgUsuarioId: string
  dgNombre: string
  usuarioActualId: string
  onDEToggle: (de: DEAsignadoPreview, asignado: boolean) => void
  toast: ReturnType<typeof useNotificaciones>
}) {
  const [dirEtapa, setDirEtapa] = useState<DirectorEtapaConAsignaciones[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [accionDE, setAccionDE] = useState<string | null>(null)

  // Cargar DEs al montar
  const cargarDEs = useCallback(async () => {
    setCargando(true)
    try {
      const data = await obtenerDEsDeSegmentoConAsignaciones(segmentoId)
      setDirEtapa(data)
    } catch {
      toast.error("Error al cargar directores de etapa")
    } finally {
      setCargando(false)
    }
  }, [segmentoId, toast])

  useEffect(() => {
    cargarDEs()
  }, [cargarDEs])

  const handleAsignarDE = (de: DirectorEtapaConAsignaciones) => {
    setAccionDE(`asignar-${de.segmentoLiderId}`)
    startTransition(async () => {
      const result = await asignarDEaDG({
        dgUsuarioId,
        segmentoLiderId: de.segmentoLiderId,
      })

      if (result.success) {
        setDirEtapa((prev) =>
          prev?.map((d) =>
            d.segmentoLiderId === de.segmentoLiderId
              ? {
                  ...d,
                  asignadoA: [
                    ...d.asignadoA,
                    { dgUsuarioId, dgNombre },
                  ],
                }
              : d
          ) ?? null
        )
        // Sync preview
        onDEToggle(
          {
            segmentoLiderId: de.segmentoLiderId,
            nombre: de.nombre,
            foto: de.foto,
            segmentoId,
            segmentoNombre,
            gruposAsignados: de.gruposAsignados,
          },
          true
        )
        toast.success(`${de.nombre} asignado`)
      } else {
        toast.error(result.error ?? "Error al asignar")
      }
      setAccionDE(null)
    })
  }

  const handleDesasignarDE = (de: DirectorEtapaConAsignaciones) => {
    setAccionDE(`desasignar-${de.segmentoLiderId}`)
    startTransition(async () => {
      const result = await desasignarDEaDG({
        dgUsuarioId,
        segmentoLiderId: de.segmentoLiderId,
      })

      if (result.success) {
        setDirEtapa((prev) =>
          prev?.map((d) =>
            d.segmentoLiderId === de.segmentoLiderId
              ? {
                  ...d,
                  asignadoA: d.asignadoA.filter(
                    (a) => a.dgUsuarioId !== dgUsuarioId
                  ),
                }
              : d
          ) ?? null
        )
        // Sync preview
        onDEToggle(
          {
            segmentoLiderId: de.segmentoLiderId,
            nombre: de.nombre,
            foto: de.foto,
            segmentoId,
            segmentoNombre,
            gruposAsignados: de.gruposAsignados,
          },
          false
        )
        toast.success(`${de.nombre} removido`)
      } else {
        toast.error(result.error ?? "Error al remover")
      }
      setAccionDE(null)
    })
  }

  if (cargando) {
    return (
      <div className="mt-2 ml-4 p-3 rounded-xl bg-muted/50 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <TextoSistema variante="muted" tamaño="sm">
          Cargando directores de etapa...
        </TextoSistema>
      </div>
    )
  }

  if (!dirEtapa || dirEtapa.length === 0) {
    return (
      <div className="mt-2 ml-4 p-3 rounded-xl bg-muted/50">
        <TextoSistema variante="muted" tamaño="sm">
          No hay directores de etapa en el segmento &quot;{segmentoNombre}&quot;.
        </TextoSistema>
      </div>
    )
  }

  return (
    <div className="mt-2 ml-4 p-3 rounded-xl bg-muted/30 border border-border/50 flex flex-col gap-2">
      <TextoSistema tamaño="sm" className="font-medium text-muted-foreground">
        Directores de etapa en &quot;{segmentoNombre}&quot;
      </TextoSistema>

      {dirEtapa.map((de) => {
        const yaAsignadoAEsteDG = de.asignadoA.some(
          (a) => a.dgUsuarioId === dgUsuarioId
        )
        const otrosDGs = de.asignadoA.filter(
          (a) => a.dgUsuarioId !== dgUsuarioId
        )

        return (
          <div
            key={de.segmentoLiderId}
            className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg bg-card/60 border border-border/30"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <UserAvatar
                photoUrl={de.foto}
                nombre={de.nombre.split(" ")[0]}
                apellido={de.nombre.split(" ").slice(1).join(" ")}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <TextoSistema tamaño="sm" className="font-medium truncate">
                  {de.nombre}
                </TextoSistema>
                <div className="flex items-center gap-2 flex-wrap">
                  <TextoSistema variante="muted" tamaño="sm">
                    {de.gruposAsignados} grupo{de.gruposAsignados !== 1 ? "s" : ""}
                  </TextoSistema>
                  {otrosDGs.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      También:{" "}
                      {otrosDGs.map((o) => o.dgNombre).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0">
              {yaAsignadoAEsteDG ? (
                <BotonSistema
                  variante="outline"
                  tamaño="sm"
                  onClick={() => handleDesasignarDE(de)}
                  cargando={
                    isPending && accionDE === `desasignar-${de.segmentoLiderId}`
                  }
                  disabled={isPending}
                  icono={X}
                >
                  Remover
                </BotonSistema>
              ) : (
                <BotonSistema
                  variante="primario"
                  tamaño="sm"
                  onClick={() => handleAsignarDE(de)}
                  cargando={
                    isPending && accionDE === `asignar-${de.segmentoLiderId}`
                  }
                  disabled={isPending}
                  icono={Plus}
                >
                  Asignar
                </BotonSistema>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
