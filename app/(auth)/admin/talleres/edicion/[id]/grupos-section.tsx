'use client'

/**
 * PR F (restructure §7) — Grupos admin section for an edición's cohorte.
 *
 * GdV-parity: a cohorte holds grupos (líderes + voluntarios), just like a
 * segmento holds grupos in Grupos de Vida. This client island wires the
 * already-shipped APIs into the edición detail page:
 *
 *   - GET  /api/talleres/grupos?cohorte_id=   → list the cohorte's grupos
 *   - POST /api/talleres/grupos               → create a grupo; the route then
 *       runs generate_taller_sesiones (PR47) best-effort and returns
 *       { grupo, sesiones }, so we can report how many weekly sessions
 *       ("1 semana = 1 sesión") were materialised.
 *   - POST /api/talleres/grupos/[id]/asignaciones → assign a líder/voluntario.
 *       The PR3 trigger auto-grants lead/volunteer capabilities scoped to the
 *       grupo, so no separate grant call is needed here.
 *
 * The persona picker reuses the shared SelectLeaderModal (the same picker GdV
 * uses); its onSelect yields a usuarios.id, which is exactly what
 * taller_grupo_asignaciones.persona_id expects.
 *
 * NOTE (follow-up): SelectLeaderModal searches system-role `lider` users only,
 * so the "voluntario" pool is currently drawn from that same set. Broadening it
 * needs a gated generic user-search endpoint — tracked as a follow-up.
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [capacidad, setCapacidad] = useState('')
  const [creating, setCreating] = useState(false)

  const [rol, setRol] = useState<Rol>('lider')
  const [pickerGrupoId, setPickerGrupoId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  const [feedback, setFeedback] = useState<Feedback | null>(null)

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
        return
      }
      setGrupos(body.grupos ?? [])
    } catch {
      setLoadError('No se pudieron cargar los grupos.')
      setGrupos([])
    } finally {
      setLoading(false)
    }
  }, [cohorteId])

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
          {grupos.map((grupo) => (
            <li
              key={grupo.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-4"
            >
              <div>
                <TextoSistema className="font-medium">{grupo.nombre}</TextoSistema>
                <TextoSistema variante="muted" className="text-sm">
                  Capacidad {grupo.capacidad} · {grupo.estado}
                </TextoSistema>
              </div>
              <BotonSistema
                variante="outline"
                tamaño="sm"
                onClick={() => setPickerGrupoId(grupo.id)}
                disabled={assigning}
              >
                Asignar {rolLabel}
              </BotonSistema>
            </li>
          ))}
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
