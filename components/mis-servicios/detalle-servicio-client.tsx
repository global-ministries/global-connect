'use client'

/**
 * One service of the person, /mis-servicios/[planId] (odd/tasks/
 * dps-asistencia-pco.md, T15c, S13.2, S13.5; artboard design/dps-avisos/05).
 * Top to bottom: back to Inicio (phone), the series, the date as title, who
 * notified and the state; «Tu servicio» (roles, horarios, llegada, who
 * scheduled you); «Quiénes sirven contigo» by área with only Confirmó / Por
 * confirmar (dps_mi_servicio never sends another person's «No puedo» or
 * motivo); the collapsed «Orden del servicio» with the person's part; and
 * the answer bar (Confirmar / No puedo, «Cambiar respuesta»), sticky above
 * the tab bar on the phone. A past plan is read-only.
 */
import { useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import type { CompaneroServicio, MiServicio, RolAviso, ServicioAviso } from '@/lib/platform/dps/avisos'
import { duracionLarga } from '@/lib/platform/dps/orden'
import { cn } from '@/lib/utils'

import { ANCLA_NO_PUEDO, RespuestaServicio } from './respuesta-servicio'
import {
  ETIQUETA_ESTADO,
  TONO_ESTADO,
  areaRoles,
  contextoServicio,
  horaCorta,
  ordenDePersona,
  palabra,
  rolesTexto,
  textoHorarios,
  tituloFecha,
} from './textos'

export interface DetalleServicioClientProps {
  readonly detalle: MiServicio
  /** The date is already in «Fechas que no puedo servir»: no offer to block it again. */
  readonly fechaBloqueada: boolean
}

const CLASE_SECCION = 'mb-2 px-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase'
const CLASE_LISTA = 'overflow-hidden rounded-2xl bg-card md:border md:border-border'
const CLASE_LINEA = 'before:absolute before:top-0 before:right-0 before:h-px before:bg-border/60 first:before:hidden'

/** "Audio · FOH" when the team says more than the área, else the role. */
function rolCorto(rol: RolAviso): string {
  return rol.equipo && rol.equipo !== rol.direccion && rol.equipo !== rol.nombre ? `${rol.equipo} · ${rol.nombre}` : rol.nombre
}

interface Grupo {
  readonly area: string
  readonly personas: readonly CompaneroServicio[]
}

function agrupar(companeros: readonly CompaneroServicio[]): Grupo[] {
  const grupos = new Map<string, CompaneroServicio[]>()
  for (const c of companeros) {
    const area = areaRoles(c.roles) || 'Otros'
    grupos.set(area, [...(grupos.get(area) ?? []), c])
  }
  return [...grupos].map(([area, personas]) => ({ area, personas }))
}

function suscribirAncla(avisar: () => void) {
  window.addEventListener('hashchange', avisar)
  return () => window.removeEventListener('hashchange', avisar)
}

const leerAncla = (): boolean => window.location.hash === `#${ANCLA_NO_PUEDO}`

function marcaPropia(estado: ServicioAviso['estado']): { texto: string; ok: boolean } {
  if (estado === 'confirmo') return { texto: 'Confirmaste', ok: true }
  if (estado === 'no_puede') return { texto: 'No puedes', ok: false }
  return { texto: 'Por responder', ok: false }
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }): ReactElement {
  return (
    <div className={cn('relative flex min-h-12 items-start gap-3 px-3.5 py-3 before:left-3.5', CLASE_LINEA)}>
      <dt className="w-28 shrink-0 text-[15px] text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words text-[15px]">{children}</dd>
    </div>
  )
}

export function DetalleServicioClient({ detalle, fechaBloqueada }: DetalleServicioClientProps): ReactElement {
  const [servicio, setServicio] = useState<ServicioAviso>(detalle.servicio)
  const [bloqueada, setBloqueada] = useState(fechaBloqueada)
  const pasado = detalle.pasado
  // «Responder «No puedo»» of «Fechas que no puedo servir» lands on #no-puedo.
  const anclaNoPuedo = useSyncExternalStore(suscribirAncla, leerAncla, () => false)
  const abrirNoPuedo = anclaNoPuedo && !pasado && detalle.servicio.estado !== 'no_puede'

  const yo = detalle.companeros.find((c) => c.yo) ?? null
  const confirmaron = detalle.confirmaron - (detalle.servicio.estado === 'confirmo' ? 1 : 0) + (servicio.estado === 'confirmo' ? 1 : 0)
  const grupos = useMemo(() => agrupar(detalle.companeros), [detalle.companeros])
  const abrirTodos = detalle.companeros.length <= 12
  const orden = useMemo(
    () => ordenDePersona(detalle.orden, servicio.horarios, servicio.llegada, servicio.roles, yo?.nombre ?? null),
    [detalle.orden, servicio.horarios, servicio.llegada, servicio.roles, yo],
  )
  const contexto = contextoServicio(servicio)
  const area = areaRoles(servicio.roles)
  const fecha = tituloFecha(servicio.fecha)

  return (
    <PaginaSistema
      breadcrumbs={<span aria-current="page">{fecha}</span>}
      regreso={{ href: '/dashboard', texto: 'Inicio' }}
      className="relative pb-6"
    >
      <BotonAtrasMovil atras={{ etiqueta: 'Inicio', href: '/dashboard' }} className="-mt-2 -ml-2 max-w-[160px] md:hidden" />
      <section aria-labelledby="mi-servicio-titulo" className="space-y-1.5">
        {contexto && <p className="text-[13px] text-muted-foreground">{contexto}</p>}
        <h1 id="mi-servicio-titulo" className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">
          {fecha}
        </h1>
        {servicio.enviadoPor && <p className="text-[15px] text-muted-foreground">Te avisó {servicio.enviadoPor}</p>}
        <PuntoEstado tono={TONO_ESTADO[servicio.estado]} etiqueta={pasado ? `${ETIQUETA_ESTADO[servicio.estado]} · ya pasó` : ETIQUETA_ESTADO[servicio.estado]} />
      </section>

      {/* Phone: one column with the answer last, sticky over everything above it.
          Desktop: Tu servicio, the answer and the order left; Quiénes sirven contigo right. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="mi-servicio-tu" className="min-w-0 md:col-start-1 md:row-start-1">
          <h2 id="mi-servicio-tu" className={CLASE_SECCION}>
            Tu servicio
          </h2>
          <dl className={CLASE_LISTA}>
            <Fila etiqueta="Mi puesto">
              {rolesTexto(servicio.roles)}
              {area && <span className="block text-[13px] text-muted-foreground">{area}</span>}
            </Fila>
            <Fila etiqueta={palabra(servicio.horarios.length, 'Servicio', 'Servicios')}>
              <span className="font-mono tabular-nums">{textoHorarios(servicio.horarios)}</span>
            </Fila>
            <Fila etiqueta="Llegada">
              <b className="font-mono font-semibold tabular-nums">{horaCorta(servicio.llegada)}</b>
            </Fila>
            {servicio.enviadoPor && <Fila etiqueta="Te programó">{servicio.enviadoPor}</Fila>}
          </dl>
        </section>

        {pasado ? (
          <p className="order-last rounded-2xl bg-card px-3.5 py-3 text-[15px] text-muted-foreground md:order-none md:col-start-1 md:row-start-2 md:border md:border-border">Este servicio ya pasó.</p>
        ) : (
          <div
            role="region"
            aria-label="Tu respuesta"
            className={cn(
              // Phone: sticks above the tab bar (app/(auth)/layout.tsx clears the same height).
              'sticky bottom-[calc(max(env(safe-area-inset-bottom),8px)+4.5rem)] z-10 order-last rounded-2xl border border-border bg-card p-3 shadow-sheet',
              'md:static md:order-none md:col-start-1 md:row-start-2 md:shadow-none',
            )}
          >
            <RespuestaServicio
              servicio={servicio}
              onServicio={setServicio}
              variante="detalle"
              ofrecerBloqueo={!bloqueada}
              onBloqueada={() => setBloqueada(true)}
              abrirNoPuedo={abrirNoPuedo}
            />
          </div>
        )}

        <section aria-labelledby="mi-servicio-contigo" className="min-w-0 md:col-start-2 md:row-span-3 md:row-start-1">
          <h2 id="mi-servicio-contigo" className={CLASE_SECCION}>
            Quiénes sirven contigo
          </h2>
          <p className="mb-2 px-1 text-[13px] text-muted-foreground">
            <span className="font-mono tabular-nums">{detalle.personas}</span> {palabra(detalle.personas, 'persona', 'personas')} ·{' '}
            <span className="font-mono tabular-nums">{confirmaron}</span> {palabra(confirmaron, 'confirmó', 'confirmaron')}
          </p>
          <div className="space-y-2.5">
            {grupos.map((g) => {
              const confirmados = g.personas.filter((p) => (p.yo ? servicio.estado === 'confirmo' : p.confirmo)).length
              const mio = g.personas.some((p) => p.yo)
              return (
                <details key={g.area} open={abrirTodos || mio} className={cn('group', CLASE_LISTA)}>
                  <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center gap-2 px-3.5 touch-manipulation [&::-webkit-details-marker]:hidden">
                    <b className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g.area}</b>
                    <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                      {confirmados} de {g.personas.length}
                    </span>
                    <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <ul aria-label={`${g.area}: ${confirmados} de ${g.personas.length} confirmaron`}>
                    {g.personas.map((p) => {
                      const marca = p.yo ? marcaPropia(servicio.estado) : { texto: p.confirmo ? 'Confirmó' : 'Por confirmar', ok: p.confirmo }
                      return (
                        <li
                          key={p.personaId}
                          className={cn('relative flex min-h-14 items-center gap-3 py-2 pr-3.5 pl-3.5 before:left-[58px]', CLASE_LINEA, p.yo && 'bg-brand-tint')}
                        >
                          <AvatarIniciales nombres={[p.nombre]} className="size-8 text-xs" />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[15px] font-semibold">{p.yo ? 'Tú' : p.nombre}</b>
                            <small className="block truncate text-[13px] text-muted-foreground">{p.roles.map(rolCorto).join(', ')}</small>
                          </span>
                          <span className={cn('shrink-0 text-[13px] font-medium', marca.ok ? 'text-success-text' : 'text-muted-foreground')}>{marca.texto}</span>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="mi-servicio-orden" className="min-w-0 md:col-start-1 md:row-start-3">
          <h2 id="mi-servicio-orden" className={CLASE_SECCION}>
            Orden del servicio
          </h2>
          {orden.momentos === 0 ? (
            <p className="rounded-2xl bg-card px-3.5 py-3 text-[15px] text-muted-foreground md:border md:border-border">Todavía no hay orden del servicio.</p>
          ) : (
            <>
              <details className={cn('group', CLASE_LISTA)}>
                <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center gap-2 px-3.5 touch-manipulation [&::-webkit-details-marker]:hidden">
                  <b className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {orden.momentos} {palabra(orden.momentos, 'momento', 'momentos')}
                    {orden.inicio && (
                      <>
                        {' · '}
                        <span className="font-mono tabular-nums">{orden.inicio}</span>
                        {orden.fin && (
                          <>
                            {' a '}
                            <span className="font-mono tabular-nums">{orden.fin}</span>
                          </>
                        )}
                      </>
                    )}
                  </b>
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <ol>
                  {orden.filas.map((f) =>
                    f.fila.tipo === 'encabezado' ? (
                      <li key={f.fila.id} className="bg-muted px-3.5 py-1.5 text-[13px] font-[650]">
                        {f.fila.titulo}
                      </li>
                    ) : (
                      <li
                        key={f.fila.id}
                        className={cn('relative flex min-h-12 items-start gap-3 px-3.5 py-2.5 before:left-3.5', CLASE_LINEA, f.mia && 'bg-brand-tint')}
                      >
                        <span className="w-11 shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">{f.hora ?? ''}</span>
                        <span className="min-w-0 flex-1 text-[15px]">
                          <span className={cn(f.mia && 'font-semibold')}>{f.fila.titulo}</span>
                          {f.mia && <span className="ml-2 rounded-full bg-brand-strong px-2 py-0.5 text-xs font-semibold text-white">Tú</span>}
                          {f.fila.responsable && !f.mia && <small className="block text-[13px] text-muted-foreground">{f.fila.responsable}</small>}
                        </span>
                        {f.fila.duracionSeg > 0 && (
                          <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">{duracionLarga(f.fila.duracionSeg)}</span>
                        )}
                      </li>
                    ),
                  )}
                </ol>
                {servicio.horarios.length > 1 && (
                  <p className="border-t border-border/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">
                    Horas del servicio de las <span className="font-mono tabular-nums">{orden.inicio}</span>. A las{' '}
                    <span className="font-mono tabular-nums">{servicio.horarios.slice(1).map(horaCorta).join(' y ')}</span> es el mismo orden.
                  </p>
                )}
              </details>
              {orden.parte && <p className="mt-2 px-1 text-[13px] text-muted-foreground">{orden.parte}</p>}
            </>
          )}
        </section>
      </div>
    </PaginaSistema>
  )
}
