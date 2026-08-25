'use client'

/**
 * PR F (restructure §7) — Grupos admin section for an edición's cohorte.
 *
 * GdV-parity: a cohorte holds grupos (líderes + voluntarios), just like a
 * segmento holds grupos in Grupos de Vida. This client island wires the
 * already-shipped APIs into the edición detail page:
 *
 *   - GET    /api/talleres/grupos?cohorte_id=            → list the cohorte's grupos
 *   - POST   /api/talleres/grupos                        → create a grupo; the route then
 *       runs generate_taller_sesiones (PR47) best-effort and returns
 *       { grupo, sesiones }, so we can report how many weekly sessions
 *       ("1 semana = 1 sesión") were materialised.
 *   - PATCH  /api/talleres/grupos/[id]                   → edit nombre/capacidad.
 *   - DELETE /api/talleres/grupos/[id]                   → soft-cancel (estado='cancelado').
 *   - POST   /api/talleres/grupos/[id]/asignaciones      → assign a líder/voluntario.
 *       The PR3 trigger auto-grants lead/volunteer capabilities scoped to the
 *       grupo, so no separate grant call is needed here.
 *   - GET    /api/talleres/grupos/[id]/asignaciones      → list active asignaciones.
 *   - DELETE /api/talleres/grupos/[id]/asignaciones/[id] → soft-remove a líder
 *       (activo=false + motivo_retiro). motivo is required by the schema.
 *
 * Every removal here is SOFT / reversible — the routes never physically delete,
 * so a scoped coordinador can administer their equipo without risking data loss.
 *
 * The persona picker reuses the shared SelectLeaderModal (the same picker GdV
 * uses); its onSelect yields a usuarios.id, which is exactly what
 * taller_grupo_asignaciones.persona_id expects.
 *
 * NOTE (follow-up): SelectLeaderModal searches system-role `lider` users only,
 * so the "voluntario" pool is currently drawn from that same set. Broadening it
 * needs a gated generic user-search endpoint — tracked as a follow-up. The
 * asignaciones list shows persona_id (uuid); enriching it with usuario names is
 * a separate follow-up on the GET endpoint's select.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'

import SelectLeaderModal from '@/components/modals/SelectLeaderModal'
import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'

interface GruposSectionProps {
  readonly cohorteId: string
}

interface GrupoRow {
  readonly id: string
  readonly cohorte_id: string
  readonly nombre: string
  readonly capacidad: number
  readonly estado: string
  readonly completed_at?: string | null
}

interface AsignacionRow {
  readonly id: string
  readonly grupo_id: string
  readonly persona_id: string
  readonly rol: string
  readonly activo: boolean
  readonly started_at?: string
}

type Rol = 'lider' | 'voluntario'

interface Feedback {
  readonly kind: 'error' | 'success'
  readonly message: string
}

const ROL_OPCIONES = [
  { valor: 'lider', etiqueta: 'Líder' },
  { valor: 'voluntario', etiqueta: 'Voluntario' },
]

export function GruposSection({ cohorteId }: GruposSectionProps): React.ReactElement {
  const [grupos, setGrupos] = useState<GrupoRow[]>([])
  const [asignacionesByGrupo, setAsignacionesByGrupo] = useState<
    Record<string, AsignacionRow[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [capacidad, setCapacidad] = useState('')
  const [creating, setCreating] = useState(false)

  const [rol, setRol] = useState<Rol>('lider')
  const [pickerGrupoId, setPickerGrupoId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  // Editar grupo (nombre/capacidad).
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editCapacidad, setEditCapacidad] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Cancelar grupo (soft) — confirmación en dos pasos.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Quitar líder (soft) — captura de motivo obligatorio.
  const [quitarId, setQuitarId] = useState<string | null>(null)
  const [motivoQuitar, setMotivoQuitar] = useState('')
  const [quitando, setQuitando] = useState(false)

  const [feedback, setFeedback] = useState<Feedback | null>(null)

  // Best-effort: para cada grupo, cargar sus asignaciones activas. Una falla
  // puntual no rompe la lista — ese grupo simplemente queda sin líderes visibles.
  const loadAsignacionesDeGrupos = useCallback(
    async (lista: readonly GrupoRow[]): Promise<void> => {
      const entradas = await Promise.all(
        lista.map(async (g) => {
          try {
            const res = await fetch(`/api/talleres/grupos/${g.id}/asignaciones`)
            if (!res.ok) return [g.id, [] as AsignacionRow[]] as const
            const body = (await res.json()) as { asignaciones?: AsignacionRow[] }
            return [g.id, body.asignaciones ?? []] as const
          } catch {
            return [g.id, [] as AsignacionRow[]] as const
          }
        }),
      )
      setAsignacionesByGrupo(Object.fromEntries(entradas))
    },
    [],
  )

  const loadGrupos = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/talleres/grupos?cohorte_id=${encodeURIComponent(cohorteId)}`,
      )
      const body = (await res.json()) as { grupos?: GrupoRow[]; error?: string }
      if (!res.ok) {
        setLoadError(body.error ?? 'No se pudieron cargar los grupos.')
        setGrupos([])
        setAsignacionesByGrupo({})
        return
      }
      const lista = body.grupos ?? []
      setGrupos(lista)
      void loadAsignacionesDeGrupos(lista)
    } catch {
      setLoadError('No se pudieron cargar los grupos.')
      setGrupos([])
      setAsignacionesByGrupo({})
    } finally {
      setLoading(false)
    }
  }, [cohorteId, loadAsignacionesDeGrupos])

  useEffect(() => {
    void loadGrupos()
  }, [loadGrupos])

  const crearGrupo = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault()
      if (!nombre.trim() || !capacidad) return
      setCreating(true)
      setFeedback(null)
      try {
        const res = await fetch('/api/talleres/grupos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            cohorte_id: cohorteId,
            nombre: nombre.trim(),
            capacidad: Number(capacidad),
          }),
        })
        const body = (await res.json()) as {
          grupo?: GrupoRow
          sesiones?: { total?: number } | null
          error?: string
        }
        if (!res.ok) {
          setFeedback({ kind: 'error', message: body.error ?? 'No se pudo crear el grupo.' })
          return
        }
        const total = body.sesiones?.total
        setFeedback({
          kind: 'success',
          message:
            typeof total === 'number'
              ? `Grupo creado — ${total} sesiones generadas.`
              : 'Grupo creado. Las sesiones se generarán al reintentar.',
        })
        setNombre('')
        setCapacidad('')
        await loadGrupos()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo crear el grupo.' })
      } finally {
        setCreating(false)
      }
    },
    [cohorteId, nombre, capacidad, loadGrupos],
  )

  const asignar = useCallback(
    async (usuarioId: string): Promise<void> => {
      const grupoId = pickerGrupoId
      if (!grupoId) return
      setAssigning(true)
      setFeedback(null)
      try {
        const res = await fetch(`/api/talleres/grupos/${grupoId}/asignaciones`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ persona_id: usuarioId, rol }),
        })
        const body = (await res.json()) as { error?: string }
        if (!res.ok) {
          setFeedback({ kind: 'error', message: body.error ?? 'No se pudo crear la asignación.' })
          return
        }
        setFeedback({ kind: 'success', message: 'Asignación creada.' })
        await loadGrupos()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo crear la asignación.' })
      } finally {
        setAssigning(false)
      }
    },
    [pickerGrupoId, rol, loadGrupos],
  )

  const iniciarEdicion = useCallback((grupo: GrupoRow): void => {
    setConfirmCancelId(null)
    setEditId(grupo.id)
    setEditNombre(grupo.nombre)
    setEditCapacidad(String(grupo.capacidad))
  }, [])

  const guardarEdicion = useCallback(
    async (grupoId: string): Promise<void> => {
      const nombreTrim = editNombre.trim()
      if (!nombreTrim || !editCapacidad) return
      setSavingEdit(true)
      setFeedback(null)
      try {
        const res = await fetch(`/api/talleres/grupos/${grupoId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nombre: nombreTrim, capacidad: Number(editCapacidad) }),
        })
        const body = (await res.json()) as { error?: string }
        if (!res.ok) {
          setFeedback({ kind: 'error', message: body.error ?? 'No se pudo actualizar el grupo.' })
          return
        }
        setFeedback({ kind: 'success', message: 'Grupo actualizado.' })
        setEditId(null)
        await loadGrupos()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo actualizar el grupo.' })
      } finally {
        setSavingEdit(false)
      }
    },
    [editNombre, editCapacidad, loadGrupos],
  )

  const cancelarGrupo = useCallback(
    async (grupoId: string): Promise<void> => {
      setCancelling(true)
      setFeedback(null)
      try {
        const res = await fetch(`/api/talleres/grupos/${grupoId}`, { method: 'DELETE' })
        const body = (await res.json()) as { error?: string }
        if (!res.ok) {
          setFeedback({ kind: 'error', message: body.error ?? 'No se pudo cancelar el grupo.' })
          return
        }
        setFeedback({ kind: 'success', message: 'Grupo cancelado.' })
        setConfirmCancelId(null)
        await loadGrupos()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo cancelar el grupo.' })
      } finally {
        setCancelling(false)
      }
    },
    [loadGrupos],
  )

  const quitarLider = useCallback(
    async (grupoId: string, asignacionId: string): Promise<void> => {
      const motivoTrim = motivoQuitar.trim()
      if (!motivoTrim) return
      setQuitando(true)
      setFeedback(null)
      try {
        const res = await fetch(
          `/api/talleres/grupos/${grupoId}/asignaciones/${asignacionId}`,
          {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ motivo: motivoTrim }),
          },
        )
        const body = (await res.json()) as { error?: string }
        if (!res.ok) {
          setFeedback({ kind: 'error', message: body.error ?? 'No se pudo quitar al líder.' })
          return
        }
        setFeedback({ kind: 'success', message: 'Líder quitado del grupo.' })
        setQuitarId(null)
        setMotivoQuitar('')
        await loadGrupos()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo quitar al líder.' })
      } finally {
        setQuitando(false)
      }
    },
    [motivoQuitar, loadGrupos],
  )

  const rolLabel = rol === 'lider' ? 'líder' : 'voluntario'

  return (
    <TarjetaSistema className="space-y-6">
      <div className="space-y-1">
        <TituloSistema nivel={3}>Grupos</TituloSistema>
        <TextoSistema variante="muted">
          Cada grupo genera sus sesiones semanales al crearse (1 semana = 1 sesión).
        </TextoSistema>
      </div>

      {/* Crear grupo */}
      <form onSubmit={crearGrupo} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <InputSistema
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Grupo Alfa"
          required
        />
        <InputSistema
          label="Capacidad"
          type="number"
          min={1}
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          placeholder="12"
          required
        />
        <BotonSistema type="submit" cargando={creating} disabled={!nombre.trim() || !capacidad}>
          Crear grupo
        </BotonSistema>
      </form>

      {/* Rol para la próxima asignación */}
      <div className="max-w-xs">
        <SelectSistema
          label="Rol a asignar"
          value={rol}
          onValueChange={(valor) => setRol(valor as Rol)}
          opciones={ROL_OPCIONES}
        />
      </div>

      {feedback && (
        <TextoSistema
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'text-destructive' : undefined}
        >
          {feedback.message}
        </TextoSistema>
      )}

      {/* Lista de grupos */}
      {loading ? (
        <TextoSistema variante="muted">Cargando grupos…</TextoSistema>
      ) : loadError ? (
        <TextoSistema role="alert" className="text-destructive">
          {loadError}
        </TextoSistema>
      ) : grupos.length === 0 ? (
        <TextoSistema variante="muted">
          Esta cohorte todavía no tiene grupos. Creá el primero arriba.
        </TextoSistema>
      ) : (
        <ul className="space-y-3">
          {grupos.map((grupo) => {
            const asignaciones = asignacionesByGrupo[grupo.id] ?? []
            return (
              <li
                key={grupo.id}
                className="space-y-3 rounded-lg border border-border/60 p-4"
              >
                {editId === grupo.id ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                    <InputSistema
                      label="Editar nombre"
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                    />
                    <InputSistema
                      label="Editar capacidad"
                      type="number"
                      min={1}
                      value={editCapacidad}
                      onChange={(e) => setEditCapacidad(e.target.value)}
                    />
                    <BotonSistema
                      tamaño="sm"
                      cargando={savingEdit}
                      disabled={!editNombre.trim() || !editCapacidad}
                      onClick={() => void guardarEdicion(grupo.id)}
                    >
                      Guardar
                    </BotonSistema>
                    <BotonSistema
                      variante="outline"
                      tamaño="sm"
                      onClick={() => setEditId(null)}
                    >
                      Descartar
                    </BotonSistema>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <TextoSistema className="font-medium">{grupo.nombre}</TextoSistema>
                      <TextoSistema variante="muted" className="text-sm">
                        Capacidad {grupo.capacidad} · {grupo.estado}
                      </TextoSistema>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <BotonSistema
                        variante="outline"
                        tamaño="sm"
                        onClick={() => setPickerGrupoId(grupo.id)}
                        disabled={assigning}
                      >
                        Asignar {rolLabel}
                      </BotonSistema>
                      <BotonSistema
                        variante="outline"
                        tamaño="sm"
                        onClick={() => iniciarEdicion(grupo)}
                      >
                        Editar
                      </BotonSistema>
                      {grupo.estado === 'activo' && (
                        <BotonSistema
                          variante="outline"
                          tamaño="sm"
                          className="text-destructive"
                          onClick={() => setConfirmCancelId(grupo.id)}
                        >
                          Cancelar grupo
                        </BotonSistema>
                      )}
                    </div>
                  </div>
                )}

                {/* Confirmación de cancelación (soft, reversible) */}
                {confirmCancelId === grupo.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-3">
                    <TextoSistema className="text-sm">
                      ¿Cancelar este grupo? Queda inactivo pero se puede reactivar luego.
                    </TextoSistema>
                    <BotonSistema
                      tamaño="sm"
                      cargando={cancelling}
                      onClick={() => void cancelarGrupo(grupo.id)}
                    >
                      Sí, cancelar
                    </BotonSistema>
                    <BotonSistema
                      variante="outline"
                      tamaño="sm"
                      onClick={() => setConfirmCancelId(null)}
                    >
                      No
                    </BotonSistema>
                  </div>
                )}

                {/* Líderes / voluntarios activos del grupo */}
                {asignaciones.length > 0 && (
                  <ul className="space-y-2 border-t border-border/40 pt-3">
                    {asignaciones.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <TextoSistema className="text-sm">
                          {a.rol === 'lider' ? 'Líder' : 'Voluntario'} ·{' '}
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.persona_id}
                          </span>
                        </TextoSistema>
                        {quitarId === a.id ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <InputSistema
                              label="Motivo"
                              value={motivoQuitar}
                              onChange={(e) => setMotivoQuitar(e.target.value)}
                              placeholder="Motivo del retiro"
                            />
                            <BotonSistema
                              tamaño="sm"
                              cargando={quitando}
                              disabled={!motivoQuitar.trim()}
                              onClick={() => void quitarLider(grupo.id, a.id)}
                            >
                              Confirmar
                            </BotonSistema>
                            <BotonSistema
                              variante="outline"
                              tamaño="sm"
                              onClick={() => {
                                setQuitarId(null)
                                setMotivoQuitar('')
                              }}
                            >
                              No
                            </BotonSistema>
                          </div>
                        ) : (
                          <BotonSistema
                            variante="outline"
                            tamaño="sm"
                            className="text-destructive"
                            onClick={() => {
                              setQuitarId(a.id)
                              setMotivoQuitar('')
                            }}
                          >
                            Quitar
                          </BotonSistema>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <SelectLeaderModal
        open={pickerGrupoId !== null}
        onClose={() => setPickerGrupoId(null)}
        onSelect={(usuario) => {
          void asignar(usuario.id)
        }}
        title="Seleccionar persona"
        description={`Asignar como ${rolLabel} al grupo.`}
      />
    </TarjetaSistema>
  )
}
