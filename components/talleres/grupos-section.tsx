'use client'

/**
 * PR F (restructure §7) — Grupos admin section for an edición's cohorte.
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — STEP 1: the grupos
 * are already INSTANCIADOS by open_edicion (nombre/capacidad copied from
 * the taller's plantilla, facilitadores pre-assigned from active
 * servidores), so this component now receives them as a prop, loaded
 * server-side by the page (lib/platform/talleres/grupo-detalle.ts's
 * loadGruposInstanciados) instead of fetching the LIST itself — each
 * facilitador's "Nombre Apellido · Rol" comes straight from that prop.
 *
 * "Asignar {rol}" still uses the free SelectLeaderModal picker for now —
 * the bounded picker (components/talleres/facilitador-picker.tsx) and the
 * grupo/facilitador in-place edit controls land in the next work unit,
 * which also drops SelectLeaderModal from this file for good (Decisiones:
 * "grupos-section deja el picker libre por el acotado").
 *
 *   - POST /api/talleres/grupos               → create a grupo ("Crear
 *       grupo" is the declared exception; the RPC then runs
 *       generate_taller_sesiones (PR47) best-effort).
 *   - POST /api/talleres/grupos/[id]/asignaciones → assign a líder/
 *       voluntario, via the shared SelectLeaderModal picker (temporary).
 */

import { useCallback, useState, type FormEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import SelectLeaderModal from '@/components/modals/SelectLeaderModal'
import Link from 'next/link'
import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { rutaGrupo } from '@/lib/platform/talleres/rutas'

export interface GrupoInstanciadoFacilitadorVM {
  readonly id: string
  readonly personaId: string
  readonly rol: string
  readonly nombre: string | null
  readonly apellido: string | null
}

export interface GrupoInstanciadoVM {
  readonly id: string
  readonly nombre: string
  readonly capacidad: number
  readonly estado: string
  /** null = the ocupación count query errored — an explicit unknown, rendered "—", never a misreported 0. */
  readonly ocupacion: number | null
  readonly facilitadores: readonly GrupoInstanciadoFacilitadorVM[]
}

interface GruposSectionProps {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly cohorteId: string
  readonly grupos: readonly GrupoInstanciadoVM[]
  readonly puedeEditar: boolean
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
const ROL_LABELS: Record<string, string> = { lider: 'Líder', voluntario: 'Voluntario' }

function nombreCompleto(nombre: string | null, apellido: string | null): string {
  return (
    [nombre, apellido].filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ') ||
    'Persona sin nombre'
  )
}

export function GruposSection({
  tallerSlug,
  edicionId,
  cohorteId,
  grupos,
  puedeEditar,
}: GruposSectionProps): ReactElement {
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [capacidad, setCapacidad] = useState('')
  const [creating, setCreating] = useState(false)

  const [rol, setRol] = useState<Rol>('lider')
  const [pickerGrupoId, setPickerGrupoId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  const [feedback, setFeedback] = useState<Feedback | null>(null)

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
        router.refresh()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo crear el grupo.' })
      } finally {
        setCreating(false)
      }
    },
    [cohorteId, nombre, capacidad, router],
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
        router.refresh()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo crear la asignación.' })
      } finally {
        setAssigning(false)
      }
    },
    [pickerGrupoId, rol, router],
  )

  const rolLabel = rol === 'lider' ? 'líder' : 'voluntario'

  return (
    <TarjetaSistema className="space-y-6">
      <div className="space-y-1">
        <TituloSistema nivel={3}>Grupos</TituloSistema>
        <TextoSistema variante="muted">
          Los grupos de esta edición, con sus facilitadores.
        </TextoSistema>
      </div>

      {puedeEditar && (
        <>
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
        </>
      )}

      {feedback && (
        <TextoSistema
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'text-destructive' : undefined}
        >
          {feedback.message}
        </TextoSistema>
      )}

      {grupos.length === 0 ? (
        <TextoSistema variante="muted">Esta edición todavía no tiene grupos.</TextoSistema>
      ) : (
        <ul className="space-y-3">
          {grupos.map((grupo) => (
            <li
              key={grupo.id}
              className="rounded-lg border border-border/60 p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Link
                    href={rutaGrupo(tallerSlug, edicionId, grupo.id)}
                    className="font-medium text-foreground hover:underline"
                  >
                    {grupo.nombre}
                  </Link>
                  <TextoSistema variante="muted" className="text-sm">
                    Capacidad {grupo.capacidad} · {grupo.estado}
                  </TextoSistema>
                  {grupo.ocupacion !== undefined && (
                    <TextoSistema
                      variante={
                        typeof grupo.ocupacion === 'number' && grupo.ocupacion > grupo.capacidad
                          ? undefined
                          : 'muted'
                      }
                      className={
                        typeof grupo.ocupacion === 'number' && grupo.ocupacion > grupo.capacidad
                          ? 'text-sm font-medium text-warning'
                          : 'text-sm'
                      }
                      role={
                        typeof grupo.ocupacion === 'number' && grupo.ocupacion > grupo.capacidad
                          ? 'status'
                          : undefined
                      }
                    >
                      {grupo.ocupacion === null ? '—' : grupo.ocupacion} / {grupo.capacidad}
                      {typeof grupo.ocupacion === 'number' &&
                        grupo.ocupacion > grupo.capacidad &&
                        ` · ${grupo.ocupacion - grupo.capacidad} por encima de la capacidad`}
                    </TextoSistema>
                  )}
                </div>
                {puedeEditar && (
                  <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    onClick={() => setPickerGrupoId(grupo.id)}
                    disabled={assigning}
                  >
                    Asignar {rolLabel}
                  </BotonSistema>
                )}
              </div>

              <ul className="mt-3 grid gap-1">
                {grupo.facilitadores.map((f) => (
                  <li key={f.id}>
                    <TextoSistema tamaño="sm">
                      {nombreCompleto(f.nombre, f.apellido)} · {ROL_LABELS[f.rol] ?? f.rol}
                    </TextoSistema>
                  </li>
                ))}
                {grupo.facilitadores.length === 0 && (
                  <TextoSistema variante="sutil" tamaño="sm">
                    Sin facilitadores todavía.
                  </TextoSistema>
                )}
              </ul>
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
        searchEndpoint="/api/talleres/admin/usuarios/buscar"
      />
    </TarjetaSistema>
  )
}
