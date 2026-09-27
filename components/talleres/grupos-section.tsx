'use client'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the edición
 * screen's "Grupos" section, redesigned: the grupos are already
 * INSTANCIADOS by open_edicion (nombre/capacidad copied from the taller's
 * plantilla, facilitadores pre-assigned from active servidores) — so this
 * component now receives them as a prop, loaded server-side by the page
 * (lib/platform/talleres/grupo-detalle.ts's loadGruposInstanciados), the
 * same loader-then-props architecture T3's PlantillaGruposSection already
 * uses, instead of fetching the list itself via GET /api/talleres/grupos.
 *
 * Every mutation but one goes through a server action and `router.refresh()`
 * (never local fetch-driven state) — errors are already translated Spanish
 * strings from lib/platform/talleres/errores-api.ts, this component only
 * surfaces them:
 *   - editar grupo en su lugar (nombre, capacidad)  → talleres_editar_grupo
 *   - agregar/quitar facilitador                    → taller_grupo_
 *     asignaciones insert/delete, through the SAME bounded picker T3 built
 *     for the plantilla (components/talleres/facilitador-picker.tsx) —
 *     never SelectLeaderModal/talleres_buscar_personas.
 *
 * "Crear grupo" is the DECLARED EXCEPTION (Decisiones: "'Crear grupo' queda
 * como excepción: un grupo extra sólo en esta edición") and keeps the
 * ORIGINAL flow: POST /api/talleres/grupos, which also runs
 * generate_taller_sesiones (PR47) best-effort and reports how many weekly
 * sessions were materialised — moved visually BELOW the list, with copy
 * naming it as the exception it is.
 *
 * puedeEditar (permisos.gestionarGrupos) gates every control; a read-only
 * viewer still sees the full list — nombre, capacidad, ocupación and each
 * facilitador's "Nombre Apellido · Rol" — with no edit affordance at all.
 */

import Link from 'next/link'
import { useCallback, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, UserMinus, X } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { ConfirmationModal } from '@/components/modals/ConfirmationModal'
import { FacilitadorPicker, type ServidorPickerVM } from '@/components/talleres/facilitador-picker'
import {
  agregarFacilitadorGrupo,
  editarGrupoInstanciado,
  quitarFacilitadorGrupo,
} from '@/app/(auth)/talleres/[taller]/[edicion]/actions'
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
  readonly servidores: readonly ServidorPickerVM[]
  readonly puedeEditar: boolean
}

interface Feedback {
  readonly kind: 'error' | 'success'
  readonly message: string
}

const ROL_LABELS: Record<string, string> = { lider: 'Líder', voluntario: 'Voluntario' }
const BOTON_ICONO =
  'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'

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
  servidores,
  puedeEditar,
}: GruposSectionProps): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [capacidadEditada, setCapacidadEditada] = useState('')

  const [confirmandoQuitar, setConfirmandoQuitar] = useState<{
    readonly grupoId: string
    readonly facilitadorId: string
    readonly nombre: string
  } | null>(null)
  const [quitando, setQuitando] = useState(false)

  // "Crear grupo" — the declared exception, keeps the original fetch flow.
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [capacidadNueva, setCapacidadNueva] = useState('')
  const [creating, setCreating] = useState(false)

  function guardarGrupo(grupoId: string): void {
    setFeedback(null)
    startTransition(async () => {
      const result = await editarGrupoInstanciado({
        tallerSlug,
        edicionId,
        grupoId,
        nombre: nombreEditado,
        capacidad: Number(capacidadEditada),
      })
      if (result.ok) {
        setEditandoId(null)
        router.refresh()
      } else {
        setFeedback({ kind: 'error', message: result.message })
      }
    })
  }

  function confirmarQuitar(): void {
    if (!confirmandoQuitar) return
    const { grupoId, facilitadorId } = confirmandoQuitar
    setFeedback(null)
    setQuitando(true)
    startTransition(async () => {
      const result = await quitarFacilitadorGrupo({ tallerSlug, edicionId, grupoId, facilitadorId })
      setQuitando(false)
      setConfirmandoQuitar(null)
      if (result.ok) {
        router.refresh()
      } else {
        setFeedback({ kind: 'error', message: result.message })
      }
    })
  }

  const crearGrupo = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault()
      if (!nombreNuevo.trim() || !capacidadNueva) return
      setCreating(true)
      setFeedback(null)
      try {
        const res = await fetch('/api/talleres/grupos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            cohorte_id: cohorteId,
            nombre: nombreNuevo.trim(),
            capacidad: Number(capacidadNueva),
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
        setNombreNuevo('')
        setCapacidadNueva('')
        router.refresh()
      } catch {
        setFeedback({ kind: 'error', message: 'No se pudo crear el grupo.' })
      } finally {
        setCreating(false)
      }
    },
    [cohorteId, nombreNuevo, capacidadNueva, router],
  )

  return (
    <TarjetaSistema className="space-y-6">
      <div className="space-y-1">
        <TituloSistema nivel={3}>Grupos</TituloSistema>
        <TextoSistema variante="muted">
          Los grupos de esta edición, con sus facilitadores.
        </TextoSistema>
      </div>

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                {editandoId === grupo.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      className="min-h-[44px] rounded-lg border border-border bg-card/50 px-3 py-2"
                      autoFocus
                    />
                    <input
                      type="number"
                      min={1}
                      value={capacidadEditada}
                      onChange={(e) => setCapacidadEditada(e.target.value)}
                      className="min-h-[44px] w-24 rounded-lg border border-border bg-card/50 px-3 py-2"
                    />
                    <button
                      type="button"
                      aria-label="Guardar grupo"
                      title="Guardar grupo"
                      className={BOTON_ICONO}
                      onClick={() => guardarGrupo(grupo.id)}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancelar edición del grupo"
                      title="Cancelar"
                      className={BOTON_ICONO}
                      onClick={() => setEditandoId(null)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
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
                )}

                {puedeEditar && editandoId !== grupo.id && (
                  <button
                    type="button"
                    aria-label={`Editar grupo ${grupo.nombre}`}
                    title="Editar grupo"
                    className={BOTON_ICONO}
                    onClick={() => {
                      setEditandoId(grupo.id)
                      setNombreEditado(grupo.nombre)
                      setCapacidadEditada(String(grupo.capacidad))
                      setFeedback(null)
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <ul className="mt-3 grid gap-1">
                {grupo.facilitadores.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <TextoSistema tamaño="sm">
                      {nombreCompleto(f.nombre, f.apellido)} · {ROL_LABELS[f.rol] ?? f.rol}
                    </TextoSistema>
                    {puedeEditar && (
                      <button
                        type="button"
                        aria-label={`Quitar a ${nombreCompleto(f.nombre, f.apellido)} del grupo`}
                        title="Quitar del grupo"
                        className={BOTON_ICONO}
                        onClick={() =>
                          setConfirmandoQuitar({
                            grupoId: grupo.id,
                            facilitadorId: f.id,
                            nombre: nombreCompleto(f.nombre, f.apellido),
                          })
                        }
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
                {grupo.facilitadores.length === 0 && (
                  <TextoSistema variante="sutil" tamaño="sm">
                    Sin facilitadores todavía.
                  </TextoSistema>
                )}
              </ul>

              {puedeEditar && servidores.length > 0 && (
                <FacilitadorPicker
                  servidores={servidores}
                  onAgregar={(personaId, rol) =>
                    agregarFacilitadorGrupo({ tallerSlug, edicionId, grupoId: grupo.id, personaId, rol })
                  }
                  onAgregado={() => router.refresh()}
                  onError={(message) => setFeedback({ kind: 'error', message })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* "Crear grupo" — the declared exception: an extra grupo only for
          this edición, never touching the taller's plantilla. */}
      {puedeEditar && (
        <div className="border-t border-border/60 pt-4">
          <TextoSistema variante="muted" className="mb-2 block text-sm">
            Crea un grupo adicional sólo para esta edición — no cambia la plantilla del taller. Genera
            sus sesiones semanales al crearse (1 semana = 1 sesión).
          </TextoSistema>
          <form onSubmit={crearGrupo} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <InputSistema
              label="Nombre"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Grupo Alfa"
              required
            />
            <InputSistema
              label="Capacidad"
              type="number"
              min={1}
              value={capacidadNueva}
              onChange={(e) => setCapacidadNueva(e.target.value)}
              placeholder="12"
              required
            />
            <BotonSistema type="submit" cargando={creating} disabled={!nombreNuevo.trim() || !capacidadNueva}>
              Crear grupo
            </BotonSistema>
          </form>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmandoQuitar !== null}
        onClose={() => setConfirmandoQuitar(null)}
        onConfirm={confirmarQuitar}
        title="Quitar facilitador"
        message={confirmandoQuitar ? `¿Quitar a ${confirmandoQuitar.nombre} de este grupo?` : ''}
        isLoading={quitando}
      />
    </TarjetaSistema>
  )
}
