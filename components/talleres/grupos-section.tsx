'use client'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the edición
 * screen's "Grupos de esta edición" section (T11 rename, flow audit — one
 * vocabulary: "Grupos" alone was ambiguous with the taller's own
 * "Plantilla de grupos"), redesigned: the grupos are already
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
 * "Agregar un grupo extra" (renamed from "Crear grupo" in T11) is the
 * DECLARED EXCEPTION (Decisiones: "'Crear grupo' queda como excepción: un
 * grupo extra sólo en esta edición") and keeps the ORIGINAL flow: POST
 * /api/talleres/grupos, which also runs generate_taller_sesiones (PR47)
 * best-effort and reports how many weekly clases were materialised —
 * moved visually BELOW the list, with copy naming it as the exception it
 * is.
 *
 * puedeEditar (permisos.gestionarGrupos) gates every control; a read-only
 * viewer still sees the full list — nombre, capacidad, ocupación and each
 * facilitador's "Nombre Apellido · Rol" — with no edit affordance at all.
 *
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2) — restyled after artboard
 * design/talleres-reserva/12 #grupos: one card per grupo (name linking to
 * its lista, facilitadores with their rol, «N de M lugares» with a bar and
 * the free places, «Ver lista» and «Editar»), cards in a grid, and the
 * extra-grupo form as the last card. Same actions and permissions as
 * before; it lives in the edición screen's «Grupos» tab.
 */

import Link from 'next/link'
import { useCallback, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, UserMinus, X } from 'lucide-react'

import { BotonSistema, InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
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
function iniciales(nombre: string): string {
  return (
    nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '·'
  )
}

function Ocupacion({ ocupacion, capacidad }: { readonly ocupacion: number | null; readonly capacidad: number }): ReactElement {
  const encima = typeof ocupacion === 'number' && ocupacion > capacidad
  const libres = typeof ocupacion === 'number' ? capacidad - ocupacion : null
  const ancho = typeof ocupacion === 'number' && capacidad > 0 ? Math.min(100, (ocupacion / capacidad) * 100) : 0
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          <strong className="font-mono font-semibold tabular-nums text-foreground">{ocupacion === null ? '—' : ocupacion}</strong> de{' '}
          <span className="font-mono tabular-nums">{capacidad}</span> lugares
        </span>
        {encima ? (
          <span role="status" className="font-medium text-warning-text">
            <span className="font-mono tabular-nums">{ocupacion - capacidad}</span> por encima de la capacidad
          </span>
        ) : (
          libres !== null && (
            <span>
              <span className="font-mono tabular-nums">{libres}</span> {libres === 1 ? 'libre' : 'libres'}
            </span>
          )
        )}
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span className={encima ? 'block h-full bg-warning' : 'block h-full bg-brand'} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  )
}

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
              ? `Grupo creado — ${total} clases generadas.`
              : 'Grupo creado. Las clases se generarán al reintentar.',
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
    <section aria-labelledby="grupos-edicion-titulo" className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        <h2 id="grupos-edicion-titulo" className="text-lg font-semibold text-foreground">
          Grupos de esta edición
        </h2>
        <TextoSistema variante="muted" className="text-sm">
          Cada grupo con su facilitadora y sus lugares.
        </TextoSistema>
      </div>

      {feedback && (
        <TextoSistema
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'text-danger-text' : undefined}
        >
          {feedback.message}
        </TextoSistema>
      )}

      {grupos.length === 0 && (
        <TextoSistema variante="muted">Esta edición todavía no tiene grupos.</TextoSistema>
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {grupos.map((grupo) => (
          <article key={grupo.id} className="grid min-w-0 content-start gap-4 rounded-2xl border border-border/60 bg-card p-4 md:p-5">
            {editandoId === grupo.id ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <InputSistema
                  label="Nombre del grupo"
                  value={nombreEditado}
                  onChange={(e) => setNombreEditado(e.target.value)}
                  autoFocus
                />
                <InputSistema
                  label="Capacidad del grupo"
                  type="number"
                  min={1}
                  value={capacidadEditada}
                  onChange={(e) => setCapacidadEditada(e.target.value)}
                />
                <div className="flex gap-2 sm:col-span-2">
                  <BotonSistema type="button" variante="outline" tamaño="sm" icono={X} onClick={() => setEditandoId(null)}>
                    Cancelar
                  </BotonSistema>
                  <BotonSistema type="button" tamaño="sm" icono={Check} onClick={() => guardarGrupo(grupo.id)}>
                    Guardar grupo
                  </BotonSistema>
                </div>
              </div>
            ) : (
              <h3 className="min-w-0 text-base font-semibold">
                <Link
                  href={rutaGrupo(tallerSlug, edicionId, grupo.id)}
                  className="focus-ring block truncate rounded-sm text-foreground hover:underline"
                >
                  {grupo.nombre}
                </Link>
              </h3>
            )}

            <ul className="grid gap-2">
              {grupo.facilitadores.map((f) => {
                const nombre = nombreCompleto(f.nombre, f.apellido)
                return (
                  <li key={f.id} className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-semibold text-brand-text">
                      {iniciales(nombre)}
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-foreground">{nombre}</span>
                      <span className="text-xs text-muted-foreground">{ROL_LABELS[f.rol] ?? f.rol}</span>
                    </span>
                    {puedeEditar && (
                      <BotonSistema
                        type="button"
                        variante="ghost"
                        soloIcono
                        icono={UserMinus}
                        aria-label={`Quitar a ${nombre} del grupo`}
                        title="Quitar del grupo"
                        onClick={() =>
                          setConfirmandoQuitar({ grupoId: grupo.id, facilitadorId: f.id, nombre })
                        }
                      />
                    )}
                  </li>
                )
              })}
              {grupo.facilitadores.length === 0 && (
                <li className="text-sm font-medium text-warning-text">Sin facilitadora todavía.</li>
              )}
            </ul>

            <Ocupacion ocupacion={grupo.ocupacion} capacidad={grupo.capacidad} />

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

            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              <BotonSistema asChild variante="outline" tamaño="sm">
                <Link href={rutaGrupo(tallerSlug, edicionId, grupo.id)}>Ver lista</Link>
              </BotonSistema>
              {puedeEditar && editandoId !== grupo.id && (
                <BotonSistema
                  type="button"
                  variante="ghost"
                  tamaño="sm"
                  icono={Pencil}
                  aria-label={`Editar grupo ${grupo.nombre}`}
                  onClick={() => {
                    setEditandoId(grupo.id)
                    setNombreEditado(grupo.nombre)
                    setCapacidadEditada(String(grupo.capacidad))
                    setFeedback(null)
                  }}
                >
                  Editar
                </BotonSistema>
              )}
            </div>
          </article>
        ))}

        {/* "Agregar un grupo extra" — the declared exception (renamed from
            "Crear grupo" in T11, flow audit — one vocabulary: the grupos in
            this list already come from the taller's plantilla, this is the
            one that doesn't): an extra grupo only for this edición, never
            touching the taller's plantilla. */}
        {puedeEditar && (
          <article className="grid min-w-0 content-start gap-3 rounded-2xl border border-dashed border-border bg-card p-4 md:p-5">
            <h3 className="text-base font-semibold text-foreground">Grupo extra</h3>
            <TextoSistema variante="muted" className="block text-sm">
              Agrega un grupo extra sólo para esta edición — no cambia la plantilla del taller. Genera
              sus clases semanales al crearse (1 semana = 1 clase).
            </TextoSistema>
            <form onSubmit={crearGrupo} className="grid gap-3">
              <InputSistema
                label="Nombre"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Grupo 4"
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
              <BotonSistema type="submit" variante="outline" cargando={creating} disabled={!nombreNuevo.trim() || !capacidadNueva}>
                Agregar un grupo extra
              </BotonSistema>
            </form>
          </article>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmandoQuitar !== null}
        onClose={() => setConfirmandoQuitar(null)}
        onConfirm={confirmarQuitar}
        title="Quitar facilitador"
        message={confirmandoQuitar ? `¿Quitar a ${confirmandoQuitar.nombre} de este grupo?` : ''}
        isLoading={quitando}
      />
    </section>
  )
}
