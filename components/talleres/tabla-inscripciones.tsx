'use client'

/**
 * Shared table + cards component for the inscripciones admin +
 * coordination surfaces. Client component — T3 (odd/tasks/talleres-
 * inscripcion-a-grupo.md) added local selection state (checkboxes + the
 * bulk "Asignar a grupo"/"Quitar del grupo" bar), so it needs "use
 * client"; server actions (`onApprove`/`onReject`) still cross the
 * server/client boundary fine as props. The inline approve/reject
 * buttons come from `./inscripcion-actions` (already a client component).
 *
 * Pattern (PR42 sibling: `app/(auth)/grupos-vida/solicitudes/SolicitudesPendientesClient.tsx`,
 * lines 224-348):
 *   - Desktop (`hidden sm:block`): `<TarjetaSistema>` wrapping a
 *     `<table className="w-full">`. Headers `px-4 py-3 uppercase
 *     tracking-wider`. Rows are NOT clickable — there is no detail
 *     page for an inscripcion, the actions happen inline.
 *   - Mobile (`sm:hidden`): vertical cards, each one shows the
 *     same fields in stack order with the action buttons in the
 *     bottom row.
 *
 * Server actions are passed as props (`onApprove`, `onReject`) so
 * the component itself does not import them. This keeps the
 * component free of server-action wiring and lets each page decide
 * if it wants to wrap the actions with extra logging, telemetry,
 * or different authorization (today both pages use the same shared
 * actions from `@/lib/platform/talleres/inscripciones-actions`).
 *
 * Props:
 *   - rows: readonly InscripcionAdminRow[] (shared shape).
 *   - canWrite: whether the current user holds an inscripcion
 *     write capability. When false, the buttons are suppressed and
 *     only the state badge is shown in the actions column. Either a
 *     plain boolean (applies to every row — every existing caller) or
 *     a per-row resolver `(row) => boolean` — T6's cross-taller
 *     /talleres/pendientes inbox needs the latter: rows come from
 *     several equipos, each with its own permisos, so a flat boolean
 *     cannot show buttons for one taller's rows and the read-only badge
 *     for another's in the SAME table.
 *   - onApprove: server action (id) => result.
 *   - onReject: server action (id, motivo) => result.
 *   - seleccion (T3): optional. When present, aprobado rows get a
 *     checkbox and a bulk bar appears above the table ("Asignar a
 *     grupo" / "Quitar del grupo"). Omitted entirely by the page when
 *     the viewer lacks gestionar_grupos — hide, never disable (house
 *     rule, docs/talleres-de-punta-a-punta.md §9). Posts directly to
 *     POST /api/talleres/inscripciones/asignar-grupo (T2), which wraps
 *     the SECURITY DEFINER RPC and is itself the security wall — this
 *     component never re-implements authorization, it just reports
 *     whatever Spanish message the endpoint returns.
 */

import { useState } from 'react'

import {
  BadgeSistema,
  BotonSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import {
  ApproveInscripcionButton,
  RejectInscripcionButton,
  type InscripcionApproveAction,
  type InscripcionRejectAction,
} from './inscripcion-actions'
import { useNotificaciones } from '@/hooks/use-notificaciones'

import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'

/**
 * CORRECTION (post-T4 review, item 1): this used to also accept a
 * function `(row) => boolean`. TablaInscripciones is `'use client'`
 * (T3's bulk-selection state) — Next.js refuses a function prop crossing
 * from a server component into a client component ("Functions cannot be
 * passed directly to Client Components"), so a server-rendered caller
 * passing a per-row resolver function (/talleres/pendientes, T6) crashed
 * at render. Jest never exercises the RSC serialization boundary, so the
 * old test passed anyway. canWrite must stay JSON-serializable: a flat
 * boolean, or the array of writable row ids (resolved server-side).
 */
export type CanWriteInscripcion = boolean | readonly string[]

export interface GrupoOpcion {
  readonly id: string
  readonly nombre: string
}

export interface SeleccionGrupoProps {
  /** The grupos this edición's cohorte has, for the bulk assign selector. */
  readonly grupos: readonly GrupoOpcion[]
}

export interface TablaInscripcionesProps {
  readonly rows: readonly InscripcionAdminRow[]
  readonly canWrite: CanWriteInscripcion
  readonly onApprove: InscripcionApproveAction
  readonly onReject: InscripcionRejectAction
  readonly seleccion?: SeleccionGrupoProps
}

function resolveCanWrite(canWrite: CanWriteInscripcion, row: InscripcionAdminRow): boolean {
  return typeof canWrite === 'boolean' ? canWrite : canWrite.includes(row.id)
}

interface AsignarGrupoResponse {
  readonly asignadas?: number
  readonly ocupacion?: number | null
  readonly capacidad?: number | null
  readonly error?: string
  readonly message?: string
}

/**
 * Local selection + bulk-assign state, shared by the desktop table and
 * the mobile cards (both render checkboxes bound to the SAME state, so
 * a selection made on one breakpoint is reflected on the other — jsdom/
 * a real browser only shows one at a time via CSS, but both are always
 * in the DOM).
 */
function useSeleccionGrupo() {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [grupoId, setGrupoId] = useState<string>('')
  const [pending, setPending] = useState(false)
  const notificaciones = useNotificaciones()

  const toggle = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clear = (): void => setSelectedIds(new Set())

  const post = async (targetGrupoId: string | null): Promise<void> => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setPending(true)
    try {
      const res = await fetch('/api/talleres/inscripciones/asignar-grupo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inscripcion_ids: ids, grupo_id: targetGrupoId }),
      })
      const body = (await res.json()) as AsignarGrupoResponse
      if (!res.ok) {
        notificaciones.error(body.message ?? 'No se pudo asignar el grupo.')
        return
      }
      const { asignadas, ocupacion, capacidad } = body
      let mensaje = `${asignadas ?? ids.length} inscripción(es) actualizadas.`
      if (typeof ocupacion === 'number' && typeof capacidad === 'number') {
        mensaje += ` Ocupación: ${ocupacion} / ${capacidad}`
        if (ocupacion > capacidad) {
          mensaje += ` · ${ocupacion - capacidad} por encima de la capacidad.`
        }
      }
      notificaciones.success(mensaje)
      clear()
    } catch {
      notificaciones.error('No se pudo asignar el grupo. Intentá de nuevo.')
    } finally {
      setPending(false)
    }
  }

  return {
    selectedIds,
    toggle,
    grupoId,
    setGrupoId,
    pending,
    asignar: () => post(grupoId || null),
    quitar: () => post(null),
  }
}

interface BulkBarProps {
  readonly grupos: readonly GrupoOpcion[]
  readonly seleccion: ReturnType<typeof useSeleccionGrupo>
}

function BulkBar({ grupos, seleccion }: BulkBarProps): React.ReactElement {
  const count = seleccion.selectedIds.size
  return (
    <TarjetaSistema variante="outlined" className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextoSistema className="text-sm font-medium">
          {count} seleccionada{count === 1 ? '' : 's'}
        </TextoSistema>
        <div className="min-w-[12rem]">
          <SelectSistema
            label="Grupo"
            value={seleccion.grupoId}
            onValueChange={seleccion.setGrupoId}
            opciones={grupos.map((g) => ({ valor: g.id, etiqueta: g.nombre }))}
            placeholder="Elegí un grupo"
          />
        </div>
        <BotonSistema
          type="button"
          className="min-h-11"
          disabled={count === 0 || !seleccion.grupoId || seleccion.pending}
          cargando={seleccion.pending}
          onClick={() => void seleccion.asignar()}
        >
          Asignar a grupo
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="outline"
          className="min-h-11"
          disabled={count === 0 || seleccion.pending}
          cargando={seleccion.pending}
          onClick={() => void seleccion.quitar()}
        >
          Quitar del grupo
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}

interface FilaCheckboxProps {
  readonly row: InscripcionAdminRow
  readonly seleccion: ReturnType<typeof useSeleccionGrupo>
}

function FilaCheckbox({ row, seleccion }: FilaCheckboxProps): React.ReactElement | null {
  if (row.estado !== 'aprobado') return null
  return (
    <label className="flex h-11 w-11 items-center justify-center">
      <input
        type="checkbox"
        data-testid={`checkbox-${row.id}`}
        aria-label={`Seleccionar ${row.persona_principal_nombre}`}
        checked={seleccion.selectedIds.has(row.id)}
        onChange={() => seleccion.toggle(row.id)}
        className="h-5 w-5"
      />
    </label>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function estadoVariante(
  estado: InscripcionAdminRow['estado'],
): 'success' | 'warning' | 'error' | 'default' {
  switch (estado) {
    case 'aprobado':
      return 'success'
    case 'pendiente':
      return 'warning'
    case 'no_aprobado':
      return 'error'
    case 'retirado':
    case 'completado':
    default:
      return 'default'
  }
}

function estadoLabel(estado: InscripcionAdminRow['estado']): string {
  switch (estado) {
    case 'aprobado':
      return 'Aprobado'
    case 'pendiente':
      return 'Pendiente'
    case 'no_aprobado':
      return 'No aprobado'
    case 'completado':
      return 'Completado'
    case 'retirado':
      return 'Retirado'
    default:
      return estado
  }
}

function linkTypeLabel(link: InscripcionAdminRow['link_type']): string | null {
  if (link === 'matrimonio') return 'Matrimonio'
  if (link === 'novios') return 'Novios'
  return null
}

function formatFecha(value: string): string {
  try {
    return new Date(value).toLocaleDateString('es', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

// ─── Component ─────────────────────────────────────────────────────────

export function TablaInscripciones({
  rows,
  canWrite,
  onApprove,
  onReject,
  seleccion,
}: TablaInscripcionesProps): React.ReactElement {
  // Hooks must run unconditionally (rules-of-hooks) — the seleccion FEATURE
  // is what's conditional (whether the checkbox column/bulk bar render),
  // not the hook call itself.
  const seleccionState = useSeleccionGrupo()

  return (
    <>
      {seleccion && (
        <div className="mb-4">
          <BulkBar grupos={seleccion.grupos} seleccion={seleccionState} />
        </div>
      )}

      {/* Desktop — table */}
      <div className="hidden sm:block overflow-hidden">
        <TarjetaSistema className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                {seleccion && (
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span className="sr-only">Seleccionar</span>
                  </th>
                )}
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Persona
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Edición
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cohorte
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Grupo
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Link
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Compañero
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const linkLabel = linkTypeLabel(row.link_type)
                const rowCanWrite = resolveCanWrite(canWrite, row)
                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    {seleccion && (
                      <td className="px-4 py-3">
                        <FilaCheckbox row={row} seleccion={seleccionState} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {row.persona_principal_nombre}
                        </span>
                        {row.persona_principal_email && (
                          <span className="text-xs text-muted-foreground">
                            {row.persona_principal_email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground">{row.edicion_nombre}</span>
                        <span className="text-xs text-muted-foreground">{row.taller_nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {row.cohorte_edicion ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {row.grupo_nombre ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <BadgeSistema variante={estadoVariante(row.estado)} tamaño="sm">
                        {estadoLabel(row.estado)}
                      </BadgeSistema>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {linkLabel ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {row.companero_nombre ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatFecha(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {rowCanWrite && row.estado === 'pendiente' ? (
                          <>
                            <ApproveInscripcionButton
                              inscripcionId={row.id}
                              onApprove={onApprove}
                            />
                            <RejectInscripcionButton
                              inscripcionId={row.id}
                              onReject={onReject}
                            />
                          </>
                        ) : (
                          <BadgeSistema variante={estadoVariante(row.estado)} tamaño="sm">
                            {estadoLabel(row.estado)}
                          </BadgeSistema>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TarjetaSistema>
      </div>

      {/* Mobile — cards */}
      <div className="sm:hidden space-y-3">
        {rows.map((row) => {
          const linkLabel = linkTypeLabel(row.link_type)
          const rowCanWrite = resolveCanWrite(canWrite, row)
          return (
            <TarjetaSistema key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                {seleccion && (
                  <div className="pt-1">
                    <FilaCheckbox row={row} seleccion={seleccionState} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <TextoSistema className="text-sm font-medium">
                    {row.persona_principal_nombre}
                  </TextoSistema>
                  {row.persona_principal_email && (
                    <TextoSistema variante="sutil" className="text-xs">
                      {row.persona_principal_email}
                    </TextoSistema>
                  )}
                  <TextoSistema variante="sutil" className="mt-1 block text-sm">
                    {row.taller_nombre} · {row.edicion_nombre}
                  </TextoSistema>
                  {row.cohorte_edicion && (
                    <TextoSistema variante="sutil" className="mt-1 block text-xs">
                      Cohorte: {row.cohorte_edicion}
                    </TextoSistema>
                  )}
                  <TextoSistema variante="sutil" className="mt-1 block text-xs">
                    Grupo: {row.grupo_nombre ?? '—'}
                  </TextoSistema>
                  {linkLabel && (
                    <div className="mt-1">
                      <BadgeSistema tamaño="sm">{linkLabel}</BadgeSistema>
                    </div>
                  )}
                  {row.companero_nombre && (
                    <TextoSistema variante="sutil" className="mt-1 block text-xs">
                      + {row.companero_nombre}
                    </TextoSistema>
                  )}
                </div>
                <BadgeSistema variante={estadoVariante(row.estado)} tamaño="sm">
                  {estadoLabel(row.estado)}
                </BadgeSistema>
              </div>
              <TextoSistema variante="sutil" className="mt-2 block text-xs">
                Creada el {formatFecha(row.created_at)}
              </TextoSistema>
              {rowCanWrite && row.estado === 'pendiente' && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <ApproveInscripcionButton
                    inscripcionId={row.id}
                    onApprove={onApprove}
                  />
                  <RejectInscripcionButton
                    inscripcionId={row.id}
                    onReject={onReject}
                  />
                </div>
              )}
            </TarjetaSistema>
          )
        })}
      </div>
    </>
  )
}