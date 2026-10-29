'use client'

/**
 * Dream Team — the person detail panel shared by Servidores and Mi equipo
 * (docs/design-system/patterns.md#detail-drawer; S11 decision 1 of
 * odd/tasks/sistema-diseno-v2.md): one `DetalleResponsivo` (side panel from
 * md, bottom sheet below) that holds every action on the person.
 *
 * Order: identity (avatar, how many servicios, phone in mono); quick actions
 * (WhatsApp and Llamar, disabled without a usable number; Editar ficha);
 * callouts with their fix ("Revisar teléfono" → "Corregir en la ficha", "No
 * tiene cuenta" → "Invitar a la plataforma"); then "Dónde sirve", one card per
 * servicio (Rol, Turno, Desde) with "Cambiar etapa", "Turnos" and "Ver su
 * equipo".
 *
 * Screen-agnostic: each screen maps its data and permissions to the neutral
 * props (lib/platform/dream-team/acciones-servicio.ts holds the rule) and owns
 * the action dialogs. Choosing an action closes the panel and calls back, so
 * two modals never fight for focus. The server checks each action again.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowRightLeft, Clock, MessageCircle, Phone, UserPen } from 'lucide-react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL } from '@/components/dream-team/labels'
import { AvatarServidor, TONO_ESTADO, telefonoARevisar, telefonoVisible } from '@/components/dream-team/servidores/lista-servidores'
import type { DreamTeamEstado } from '@/lib/platform/dream-team/types'
import { enlaceWhatsapp } from '@/lib/utils/telefono'

export function formatearFecha(valor: string | null): string {
  // A Grupos de Vida director de etapa has no start date: a dash, never 1970.
  if (valor === null) return '—'
  try {
    return new Date(valor).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return valor
  }
}

/** What the viewer may do with one servicio, already decided by the screen. */
export interface AccionesServicioDetalle {
  readonly cambiarEtapa: boolean
  readonly turnos: boolean
  /** "Editar ficha" (and "Corregir en la ficha") shows when any servicio allows it. */
  readonly editarFicha: boolean
  /** "Invitar a la plataforma" shows when any servicio allows it and the person has no account. */
  readonly invitar: boolean
  /** "Ver su equipo" link; absent hides it. */
  readonly verEquipo?: string
}

export interface ServicioDetalle {
  /** Unique per servicio; passed back to `onCambiarEtapa` and `onTurnos`. */
  readonly clave: string
  /** The card title. */
  readonly equipoLabel: string
  /** The card's accessible name when the title is ambiguous ("Anfitriones · UpStreet"); defaults to `equipoLabel`. */
  readonly equipoNombre?: string
  /** Visible ancestors of the equipo, root first; empty for a root. */
  readonly equipoRuta: string
  readonly rolLabel: string
  readonly estado: DreamTeamEstado
  /** The shifts as shown; "—" when none. */
  readonly turnoTexto: string
  /** Start date (ISO); `null` shows a dash. */
  readonly desde: string | null
  readonly origen: 'dream_team' | 'grupos_vida'
  readonly acciones: AccionesServicioDetalle
}

export interface PersonaDetalle {
  readonly nombre: string
  readonly telefono: string | null
  /** `null` when the viewer cannot see the account status (no callout). */
  readonly tieneCuenta: boolean | null
  /** Every listed servicio comes from Grupos de Vida: the mark goes next to the count. */
  readonly soloGruposVida: boolean
}

export interface DetallePersonaProps {
  readonly persona: PersonaDetalle
  readonly servicios: readonly ServicioDetalle[]
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly onCambiarEtapa: (clave: string) => void
  readonly onTurnos: (clave: string) => void
  readonly onEditarFicha: () => void
  readonly onInvitar: () => void
}

function DatoServicio({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: string }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{valor}</dd>
    </div>
  )
}

function TarjetaServicio({
  servicio,
  onCambiarEtapa,
  onTurnos,
}: {
  readonly servicio: ServicioDetalle
  readonly onCambiarEtapa: () => void
  readonly onTurnos: () => void
}): ReactElement {
  const { acciones } = servicio
  return (
    <TarjetaSistema role="group" aria-label={servicio.equipoNombre ?? servicio.equipoLabel} className="space-y-3 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{servicio.equipoLabel}</p>
          <p className="truncate text-xs text-muted-foreground">{servicio.equipoRuta || 'Raíz del organigrama'}</p>
        </div>
        <PuntoEstado tono={TONO_ESTADO[servicio.estado]} etiqueta={ESTADO_LABELS[servicio.estado]} />
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <DatoServicio etiqueta="Rol" valor={servicio.rolLabel} />
        <DatoServicio etiqueta="Turno" valor={servicio.turnoTexto} />
        <DatoServicio etiqueta="Desde" valor={formatearFecha(servicio.desde)} />
      </dl>
      {(acciones.cambiarEtapa || acciones.turnos || acciones.verEquipo !== undefined) && (
        <div className="flex flex-wrap items-center gap-2">
          {acciones.cambiarEtapa && (
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={ArrowRightLeft} onClick={onCambiarEtapa}>
              Cambiar etapa
            </BotonSistema>
          )}
          {acciones.turnos && (
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={Clock} onClick={onTurnos}>
              Turnos
            </BotonSistema>
          )}
          {acciones.verEquipo !== undefined && (
            <BotonSistema asChild variante="ghost" tamaño="sm" icono={ArrowRight} iconoPosicion="derecha">
              <Link href={acciones.verEquipo}>Ver su equipo</Link>
            </BotonSistema>
          )}
        </div>
      )}
    </TarjetaSistema>
  )
}

export function DetallePersona({
  persona,
  servicios,
  abierto,
  onCambioAbierto,
  onCambiarEtapa,
  onTurnos,
  onEditarFicha,
  onInvitar,
}: DetallePersonaProps): ReactElement {
  const editarFicha = servicios.some((s) => s.acciones.editarFicha)
  const invitar = servicios.some((s) => s.acciones.invitar)
  const telefono = telefonoVisible(persona.telefono)
  const whatsapp = enlaceWhatsapp(persona.telefono)
  const llamar = telefono ? `tel:${(persona.telefono ?? '').replace(/[^\d+]/g, '')}` : null
  const gruposVida = servicios.some((s) => s.origen === 'grupos_vida')
  const cantidad = servicios.length

  function elegir(accion: () => void): void {
    onCambioAbierto(false)
    accion()
  }

  return (
    <DetalleResponsivo abierto={abierto} onCambioAbierto={onCambioAbierto} titulo={persona.nombre}>
      <div className="space-y-5">
        <div className="flex min-w-0 items-center gap-4">
          <AvatarServidor nombre={persona.nombre} grande />
          <div className="min-w-0 text-sm text-muted-foreground">
            <p>
              {`${cantidad} ${cantidad === 1 ? 'servicio' : 'servicios'}`}
              {persona.soloGruposVida && ` · ${ORIGEN_GRUPOS_VIDA_LABEL}`}
            </p>
            <p className={telefono ? 'font-mono tabular-nums' : undefined}>{telefono ?? 'Sin teléfono'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {whatsapp ? (
            <BotonSistema asChild variante="outline" icono={MessageCircle}>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </BotonSistema>
          ) : (
            <BotonSistema type="button" variante="outline" icono={MessageCircle} disabled>
              WhatsApp
            </BotonSistema>
          )}
          {llamar ? (
            <BotonSistema asChild variante="outline" icono={Phone}>
              <a href={llamar}>Llamar</a>
            </BotonSistema>
          ) : (
            <BotonSistema type="button" variante="outline" icono={Phone} disabled>
              Llamar
            </BotonSistema>
          )}
          {editarFicha && (
            <BotonSistema type="button" variante="outline" icono={UserPen} onClick={() => elegir(onEditarFicha)}>
              Editar ficha
            </BotonSistema>
          )}
        </div>

        {telefonoARevisar(persona.telefono) && (
          <AvisoFormulario tono="info" className="space-y-2">
            <p className="font-semibold text-foreground">Revisar teléfono</p>
            <p>{`«${persona.telefono}» no parece un número válido, así que WhatsApp no funciona.`}</p>
            {editarFicha && (
              <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => elegir(onEditarFicha)}>
                Corregir en la ficha
              </BotonSistema>
            )}
          </AvisoFormulario>
        )}

        {persona.tieneCuenta === false && (
          <AvisoFormulario tono="marca" className="space-y-2">
            <p className="font-semibold text-foreground">No tiene cuenta en la plataforma</p>
            <p>No ve sus turnos ni recibe recordatorios.</p>
            {invitar && (
              <BotonSistema type="button" tamaño="sm" onClick={() => elegir(onInvitar)}>
                Invitar a la plataforma
              </BotonSistema>
            )}
          </AvisoFormulario>
        )}

        {gruposVida && (
          <p className="text-sm text-muted-foreground">Sus servicios de Grupos de Vida se gestionan desde Grupos de Vida.</p>
        )}

        <section aria-labelledby="donde-sirve" className="space-y-3">
          <h2 id="donde-sirve" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Dónde sirve
          </h2>
          {servicios.map((servicio) => (
            <TarjetaServicio
              key={servicio.clave}
              servicio={servicio}
              onCambiarEtapa={() => elegir(() => onCambiarEtapa(servicio.clave))}
              onTurnos={() => elegir(() => onTurnos(servicio.clave))}
            />
          ))}
        </section>
      </div>
    </DetalleResponsivo>
  )
}
