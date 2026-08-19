/**
 * Shared table + cards component for the inscripciones admin +
 * coordination surfaces. Server component (no `"use client"`) — the
 * inline approve/reject buttons are imported from
 * `./inscripcion-actions` (which is a client component).
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
 *     only the state badge is shown in the actions column.
 *   - onApprove: server action (id) => result.
 *   - onReject: server action (id, motivo) => result.
 */

import {
  BadgeSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import {
  ApproveInscripcionButton,
  RejectInscripcionButton,
  type InscripcionApproveAction,
  type InscripcionRejectAction,
} from './inscripcion-actions'

import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'

export interface TablaInscripcionesProps {
  readonly rows: readonly InscripcionAdminRow[]
  readonly canWrite: boolean
  readonly onApprove: InscripcionApproveAction
  readonly onReject: InscripcionRejectAction
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
}: TablaInscripcionesProps): React.ReactElement {
  return (
    <>
      {/* Desktop — table */}
      <div className="hidden sm:block overflow-hidden">
        <TarjetaSistema className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
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
                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
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
                        {canWrite && row.estado === 'pendiente' ? (
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
          return (
            <TarjetaSistema key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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
              {canWrite && row.estado === 'pendiente' && (
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