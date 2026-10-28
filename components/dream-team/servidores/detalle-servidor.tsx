'use client'

/**
 * Servidores — the person detail drawer (docs/design-system/patterns.md#detail-drawer):
 * one `DetalleResponsivo` (side panel from md, bottom sheet below) that holds
 * every action the per-row "⋯" menu used to offer.
 *
 * Order: identity (avatar, how many servicios, phone in mono); quick actions
 * (WhatsApp and Llamar, disabled without a usable number; Editar ficha);
 * callouts with their fix ("Revisar teléfono" → "Corregir en la ficha", "No
 * tiene cuenta" → "Invitar a la plataforma"); then "Dónde sirve", one card per
 * servicio (Rol, Turno, Desde) with "Cambiar etapa", "Turnos" and "Ver su
 * equipo". Every action follows `accionesDeServicio` (menu-servidor.tsx), the
 * same rule the menu applied, so a Grupos de Vida row stays read-only and a
 * retired servicio offers no stage or shift change. The server checks each
 * action again.
 *
 * The action dialogs live outside the drawer: choosing one closes the drawer
 * and opens the dialog, so two modals never fight for focus.
 */
import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowRightLeft, Clock, MessageCircle, Phone, UserPen } from 'lucide-react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'
import { InvitarCuentaPanel } from '@/components/cuentas/invitar-cuenta-panel'
import { ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL } from '@/components/dream-team/labels'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import type { FilaVista, PersonaLista } from '@/lib/platform/dream-team/servidores-vista'
import { enlaceWhatsapp } from '@/lib/utils/telefono'
import { EditarFichaPanel } from './editar-ficha-panel'
import { AvatarServidor, TONO_ESTADO, telefonoARevisar, telefonoVisible } from './lista-servidores'
import { accionesDeServicio } from './menu-servidor'

export function formatearFecha(valor: string | null): string {
  // A Grupos de Vida director de etapa has no start date: a dash, never 1970.
  if (valor === null) return '—'
  try {
    return new Date(valor).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return valor
  }
}

type Accion =
  | { readonly tipo: 'etapa' | 'turnos'; readonly fila: FilaVista }
  | { readonly tipo: 'ficha' | 'invitar' }
  | null

export interface DetalleServidorProps {
  /** The person with every servicio; `null` keeps the drawer closed. */
  readonly persona: PersonaLista | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** After a saved change: refresh the server data. */
  readonly onActualizado: () => void
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
  fila,
  onAccion,
}: {
  readonly fila: FilaVista
  readonly onAccion: (accion: Accion) => void
}): ReactElement {
  const acciones = accionesDeServicio(fila)
  return (
    <TarjetaSistema role="group" aria-label={fila.equipoNombre} className="space-y-3 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{fila.equipoLabel}</p>
          <p className="truncate text-xs text-muted-foreground">{fila.equipoRuta || 'Raíz del organigrama'}</p>
        </div>
        <PuntoEstado tono={TONO_ESTADO[fila.estado]} etiqueta={ESTADO_LABELS[fila.estado]} />
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <DatoServicio etiqueta="Rol" valor={fila.rolLabel} />
        <DatoServicio etiqueta="Turno" valor={fila.turnosTexto} />
        <DatoServicio etiqueta="Desde" valor={formatearFecha(fila.fechaInicio)} />
      </dl>
      {acciones.alguna && (
        <div className="flex flex-wrap items-center gap-2">
          {acciones.cambiarEtapa && (
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={ArrowRightLeft} onClick={() => onAccion({ tipo: 'etapa', fila })}>
              Cambiar etapa
            </BotonSistema>
          )}
          {acciones.turnosDe !== undefined && (
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={Clock} onClick={() => onAccion({ tipo: 'turnos', fila })}>
              Turnos
            </BotonSistema>
          )}
          <BotonSistema asChild variante="ghost" tamaño="sm" icono={ArrowRight} iconoPosicion="derecha">
            <Link href={`/dream-team/mi-equipo?direccion=${encodeURIComponent(fila.direccionId)}`}>Ver su equipo</Link>
          </BotonSistema>
        </div>
      )}
    </TarjetaSistema>
  )
}

export function DetalleServidor({ persona, abierto, onCambioAbierto, onActualizado }: DetalleServidorProps): ReactElement | null {
  const [accion, setAccion] = useState<Accion>(null)
  const toast = useNotificaciones()
  if (persona === null) return null

  const acciones = persona.filas.map(accionesDeServicio)
  const editarFicha = acciones.some((a) => a.editarFicha)
  const invitar = acciones.some((a) => a.invitar)
  const telefono = telefonoVisible(persona.telefono)
  const whatsapp = enlaceWhatsapp(persona.telefono)
  const llamar = telefono ? `tel:${(persona.telefono ?? '').replace(/[^\d+]/g, '')}` : null
  const gruposVida = persona.filas.some((fila) => fila.origen === 'grupos_vida')
  const cantidad = persona.filas.length

  function elegir(siguiente: Accion): void {
    onCambioAbierto(false)
    setAccion(siguiente)
  }
  function cerrarAccion(abierta: boolean): void {
    if (!abierta) setAccion(null)
  }
  function guardado(): void {
    setAccion(null)
    onActualizado()
  }

  const filaAccion = accion !== null && 'fila' in accion ? accion.fila : null
  const servicioAccion = filaAccion ? accionesDeServicio(filaAccion) : null

  return (
    <>
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
              <BotonSistema type="button" variante="outline" icono={UserPen} onClick={() => elegir({ tipo: 'ficha' })}>
                Editar ficha
              </BotonSistema>
            )}
          </div>

          {telefonoARevisar(persona.telefono) && (
            <AvisoFormulario tono="info" className="space-y-2">
              <p className="font-semibold text-foreground">Revisar teléfono</p>
              <p>{`«${persona.telefono}» no parece un número válido, así que WhatsApp no funciona.`}</p>
              {editarFicha && (
                <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => elegir({ tipo: 'ficha' })}>
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
                <BotonSistema type="button" tamaño="sm" onClick={() => elegir({ tipo: 'invitar' })}>
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
            {persona.filas.map((fila) => (
              <TarjetaServicio key={fila.clave} fila={fila} onAccion={elegir} />
            ))}
          </section>
        </div>
      </DetalleResponsivo>

      {filaAccion && servicioAccion?.servicio && accion?.tipo === 'etapa' && (
        <AvanceEtapaControl
          servicioId={servicioAccion.servicio.id}
          estadoActual={filaAccion.estado}
          version={servicioAccion.servicio.version}
          puedeEditar
          abierto
          onAbiertoChange={cerrarAccion}
          ocultarBoton
          onSuccess={guardado}
        />
      )}

      {filaAccion && servicioAccion?.turnosDe !== undefined && accion?.tipo === 'turnos' && (
        <TurnosServicioDialog
          servicioId={servicioAccion.turnosDe}
          nombre={persona.nombre}
          abierto
          onAbiertoChange={cerrarAccion}
          onGuardado={guardado}
        />
      )}

      {editarFicha && (
        <EditarFichaPanel
          personaId={persona.clave}
          nombre={persona.nombre}
          abierto={accion?.tipo === 'ficha'}
          onAbiertoChange={cerrarAccion}
          onGuardado={guardado}
          toast={toast}
        />
      )}

      {invitar && (
        <InvitarCuentaPanel
          personaId={persona.clave}
          nombre={persona.nombre}
          abierto={accion?.tipo === 'invitar'}
          onAbiertoChange={cerrarAccion}
          onInvitada={guardado}
        />
      )}
    </>
  )
}
