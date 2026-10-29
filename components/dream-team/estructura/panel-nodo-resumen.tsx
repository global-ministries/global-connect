'use client'

/**
 * Estructura — the Resumen tab of the node panel (S12): what needs fixing
 * first (one callout per problem, each with its fix), then who is
 * responsible, how many people serve in the branch, and the subequipos (a row
 * opens that node). Fixes and links that change something show only to
 * whoever can edit this node.
 */
import type { ReactElement, ReactNode } from 'react'
import { ArrowRight, ChevronRight, Plus } from 'lucide-react'

import { FONDO_TONO, PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, EnlaceSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { ProblemaEstructura } from '@/lib/platform/dream-team/estructura-organigrama'
import type { DetalleEquipo, ResponsableEquipo } from '@/lib/platform/dream-team/estructura-vista'

import type { TurnosNodo } from './panel-nodo-turnos'

/** The health problems of one node (its own setup, not its branch), as the org chart view model names them. */
export type ProblemaNodo = ProblemaEstructura

export const SALUD_PROBLEMA: Readonly<Record<ProblemaNodo, { readonly tono: TonoEstado; readonly etiqueta: string; readonly corto: string }>> = {
  sin_responsable: { tono: 'warning', etiqueta: 'Sin responsable', corto: 'sin responsable' },
  roles_sin_asignar: { tono: 'info', etiqueta: 'Roles sin asignar', corto: 'rol sin asignar' },
  sin_turno: { tono: 'danger', etiqueta: 'Sin turno', corto: 'sin turno' },
  inactivo: { tono: 'muted', etiqueta: 'Inactivo', corto: 'inactivo' },
}

const CALLOUT: Record<TonoEstado, string> = {
  warning: 'border-warning/40 bg-warning/10',
  info: 'border-info/40 bg-info/10',
  danger: 'border-danger/40 bg-danger/10',
  success: 'border-success/40 bg-success/10',
  muted: 'border-border bg-muted',
}

const TITULO_SECCION = 'text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'
const ENLACE = 'inline-flex min-h-11 items-center gap-1.5 text-sm'

export interface PanelNodoResumenProps {
  readonly detalle: DetalleEquipo
  readonly direccionId: string
  readonly problemas: readonly ProblemaNodo[]
  /** The problems of a subequipo, for its row; none when absent. */
  readonly problemasDe?: (equipoId: string) => readonly ProblemaNodo[]
  readonly turnos?: TurnosNodo
  /** Whoever can edit this very node (org.manage and a real equipo). */
  readonly edita: boolean
  readonly ocupado: boolean
  readonly onVerRoles: () => void
  readonly onElegirTurnos: () => void
  readonly onActivar: () => void
  readonly onAgregarSubequipo: () => void
  readonly onAbrirNodo: (equipoId: string) => void
}

function plural(cantidad: number, uno: string, varios: string): string {
  return `${cantidad} ${cantidad === 1 ? uno : varios}`
}

function hrefServidores(equipoId: string): string {
  return `/admin/dream-team/servidores?equipo=${encodeURIComponent(equipoId)}`
}

/** "Ana María Pérez Gómez" → "Ana Gómez"; couples ("Carlos y Ana") stay whole. */
export function nombreCorto(nombre: string): string {
  const partes = nombre.split(' ').filter(Boolean)
  return partes.length > 2 && !nombre.includes(' y ') ? `${partes[0]} ${partes[partes.length - 1]}` : nombre
}

function Callout({ tono, titulo, children, arreglo }: {
  readonly tono: TonoEstado
  readonly titulo: string
  readonly children: ReactNode
  readonly arreglo?: ReactNode
}): ReactElement {
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4', CALLOUT[tono])}>
      <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', FONDO_TONO[tono])} />
      <div className="grid min-w-0 gap-1">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
        {arreglo && <div className="mt-2">{arreglo}</div>}
      </div>
    </div>
  )
}

function textoSinTurno(turnos: TurnosNodo | undefined): string {
  const elegidos = (turnos?.turnos ?? []).filter((turno) => turno.tipo !== 'fechas' && turnos?.efectivos.includes(turno.id))
  return elegidos.length > 0
    ? `Eligió ${elegidos.map((turno) => turno.nombre).join(', ')}, que está desactivado: su gente no sabe cuándo sirve.`
    : 'No tiene ningún turno semanal activo: su gente no sabe cuándo sirve.'
}

function Responsable({ responsable }: { readonly responsable: ResponsableEquipo | null }): ReactElement {
  if (!responsable) return <span className="text-warning-text">Sin responsable</span>
  return (
    <>
      <span className="block truncate" title={responsable.nombre}>{responsable.nombre}</span>
      <span className="block text-sm font-normal text-muted-foreground">
        {responsable.heredadoDe ? `${responsable.rol} · heredado de ${responsable.heredadoDe.label}` : responsable.rol}
      </span>
    </>
  )
}

export function PanelNodoResumen({
  detalle,
  direccionId,
  problemas,
  problemasDe,
  turnos,
  edita,
  ocupado,
  onVerRoles,
  onElegirTurnos,
  onActivar,
  onAgregarSubequipo,
  onAbrirNodo,
}: PanelNodoResumenProps): ReactElement {
  const { responsable, hijos } = detalle
  const rolesLibres = detalle.roles.filter((rol) => rol.activo && rol.uso === 0)

  const callouts: Record<ProblemaNodo, ReactElement> = {
    sin_responsable: (
      <Callout
        key="sin_responsable"
        tono="warning"
        titulo="Este equipo no tiene responsable"
        arreglo={
          edita && (
            <BotonSistema asChild variante="outline" tamaño="sm">
              <a href={hrefServidores(detalle.id)}>Asignar en Servidores</a>
            </BotonSistema>
          )
        }
      >
        Nadie tiene el rol de coordinador. Se asigna en Servidores.
      </Callout>
    ),
    roles_sin_asignar: (
      <Callout
        key="roles_sin_asignar"
        tono="info"
        titulo={plural(rolesLibres.length, 'rol activo que nadie tiene', 'roles activos que nadie tiene')}
        arreglo={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onVerRoles}>
            Ver roles
          </BotonSistema>
        }
      >
        {rolesLibres.map((rol) => rol.label).join(', ')}. Asígnalo en Servidores o desactívalo.
      </Callout>
    ),
    sin_turno: (
      <Callout
        key="sin_turno"
        tono="danger"
        titulo="Sin turno"
        arreglo={
          edita && (
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onElegirTurnos}>
              Elegir turnos
            </BotonSistema>
          )
        }
      >
        {textoSinTurno(turnos)}
      </Callout>
    ),
    inactivo: (
      <Callout
        key="inactivo"
        tono="muted"
        titulo="Inactivo"
        arreglo={
          edita && (
            <BotonSistema type="button" variante="outline" tamaño="sm" disabled={ocupado} onClick={onActivar}>
              Activar
            </BotonSistema>
          )
        }
      >
        No se le asignan personas. Sus subequipos tampoco reciben gente.
      </Callout>
    ),
  }

  return (
    <div className="grid gap-4">
      {problemas.map((problema) => callouts[problema])}

      {!detalle.editable && (
        <p className="text-sm text-muted-foreground">
          Este nodo viene de Grupos de Vida: se ve aquí con su gente, pero se gestiona desde Grupos de Vida.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3.5">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Responsable</dt>
          <dd className="mt-1 text-[15px] font-semibold text-foreground">
            <Responsable responsable={responsable} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Personas</dt>
          <dd className="mt-1">
            <span className="block font-mono text-[26px] font-semibold leading-tight tabular-nums text-foreground">
              {detalle.personasRama}
            </span>
            <span className="block text-sm text-muted-foreground">{detalle.esRama ? 'en toda la rama' : 'en este equipo'}</span>
          </dd>
        </div>
      </dl>

      <div className="-my-2 flex flex-wrap gap-x-5">
        <EnlaceSistema variante="marca" href={`/dream-team/mi-equipo?direccion=${encodeURIComponent(direccionId)}`} className={ENLACE}>
          Ver su gente en Mi equipo
          <ArrowRight aria-hidden="true" className="size-4" />
        </EnlaceSistema>
        {edita && responsable && (
          <EnlaceSistema variante="marca" href={hrefServidores(detalle.id)} className={ENLACE}>
            {responsable.heredadoDe ? 'Asígnalo en Servidores' : 'Cambiar en Servidores'}
            <ArrowRight aria-hidden="true" className="size-4" />
          </EnlaceSistema>
        )}
      </div>

      <section aria-labelledby={`subequipos-${detalle.id}`} className="grid gap-2">
        <h3 id={`subequipos-${detalle.id}`} className={TITULO_SECCION}>
          Subequipos · <span className="font-mono tabular-nums">{hijos.length}</span>
        </h3>
        {hijos.length === 0 && !edita ? (
          <p className="text-sm text-muted-foreground">Este equipo no tiene equipos dentro.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {hijos.map((hijo) => {
              const suyos = problemasDe?.(hijo.id) ?? []
              return (
                <li key={hijo.id}>
                  <button
                    type="button"
                    aria-label={`Abrir ${hijo.label}`}
                    onClick={() => onAbrirNodo(hijo.id)}
                    className="focus-ring flex min-h-16 w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">{hijo.label}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {hijo.responsable ? nombreCorto(hijo.responsable.nombre) : 'Sin responsable'}
                        {suyos.length > 0 && ` · ${suyos.map((problema) => SALUD_PROBLEMA[problema].corto).join(', ')}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                      {suyos.map((problema) => (
                        <PuntoEstado key={problema} tono={SALUD_PROBLEMA[problema].tono} />
                      ))}
                      <span className="font-mono tabular-nums">{hijo.personasRama}</span>
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </span>
                  </button>
                </li>
              )
            })}
            {edita && (
              <li>
                <button
                  type="button"
                  onClick={onAgregarSubequipo}
                  className="focus-ring flex min-h-14 w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm font-medium text-brand-text transition-colors hover:bg-accent"
                >
                  Agregar subequipo
                  <Plus aria-hidden="true" className="size-4" />
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  )
}
