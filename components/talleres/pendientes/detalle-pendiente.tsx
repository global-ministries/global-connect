'use client'

/**
 * R3e (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the one drawer per item
 * of /talleres/pendientes (artboard design/talleres-interior/23, hash states
 * default / #identidad / #grupo / #rechazar; the panel follows
 * design/talleres-reserva/12). Side panel from md, bottom sheet below.
 *
 * Every write goes through the existing server actions, which check the
 * capability again (and the RPC / RLS behind them):
 * - por aprobar: `approveInscripcionAction(id)` and, in the «Rechazar…» view,
 *   `rejectInscripcionAction(id, motivo, mensaje?)` with «Motivo interno
 *   (obligatorio)» and «Mensaje para la persona (opcional)».
 * - retiro: the existing `ResolverSolicitudRetiroControls` with
 *   `aprobarSolicitudRetiroAction` / `rechazarSolicitudRetiroAction`.
 * - sin grupo: no action here; «Asignar grupo» links to the edición, where
 *   the grupo is chosen.
 * Controls show only when the item says `puedeDecidir` (the viewer's
 * permission for that item's equipo).
 *
 * The artboard's identity comparison («Es la misma persona» / «Es otra
 * persona») and the grupo select at approval have no action behind them
 * yet, so a por-verificar item says what to check and is approved one by
 * one, and the grupo is assigned in the edición.
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ShieldAlert, Users } from 'lucide-react'

import { BotonSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo, useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ResolverSolicitudRetiroControls } from '@/components/talleres/resolver-solicitud-retiro-controls'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  approveInscripcionAction,
  rejectInscripcionAction,
  type InscripcionActionResult,
} from '@/lib/platform/talleres/inscripciones-actions'
import {
  aprobarSolicitudRetiroAction,
  rechazarSolicitudRetiroAction,
  type SolicitudRetiroActionResult,
} from '@/lib/platform/talleres/solicitudes-retiro-actions'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'

import { ETIQUETA_ORIGEN, formatearDia, type ItemPendiente } from './vista-pendientes'

/** The column's own limit (inscripciones-actions.ts, MENSAJE_NO_APROBADO_MAX). */
const MENSAJE_MAX = 600

interface Props {
  readonly item: ItemPendiente | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** After a successful write: the page closes the drawer, shows `mensaje` and refreshes. */
  readonly onResuelto: (mensaje: string) => void
}

/** Neutral «tú» messages for the action errors (the actions' own texts are not shown). */
export function mensajeErrorInscripcion(resultado: InscripcionActionResult): string {
  switch (resultado.error) {
    case 'FORBIDDEN':
      return 'No tienes permiso para decidir esta inscripción.'
    case 'NOT_FOUND_OR_NOT_PENDIENTE':
      return 'Esta inscripción ya no está pendiente. Actualiza la página.'
    case 'INVALID_MOTIVO':
      return 'Escribe el motivo interno.'
    case 'INVALID_MENSAJE':
      return `El mensaje puede tener hasta ${MENSAJE_MAX} caracteres.`
    case 'UNAUTHENTICATED':
    case 'NO_SESSION':
      return 'Tu sesión terminó. Vuelve a iniciar sesión.'
    default:
      return 'No se pudo guardar. Inténtalo de nuevo.'
  }
}

export function mensajeErrorRetiro(resultado: SolicitudRetiroActionResult): string {
  switch (resultado.error) {
    case 'FORBIDDEN':
      return 'No tienes permiso para resolver esta solicitud.'
    case 'NOT_FOUND_OR_NOT_PENDIENTE':
      return 'Esta solicitud ya no está pendiente. Actualiza la página.'
    case 'UNAUTHENTICATED':
      return 'Tu sesión terminó. Vuelve a iniciar sesión.'
    default:
      return 'No se pudo resolver. Inténtalo de nuevo.'
  }
}

/** `compacto`: the label hides below md (phone rows) and stays in the accessible name. */
export function EstadoItem({ item, compacto = false }: { readonly item: ItemPendiente; readonly compacto?: boolean }): ReactElement {
  if (item.tipo === 'retiro') return <PuntoEstado tono="info" etiqueta="Pide retirarse" ocultarEtiquetaEnMovil={compacto} />
  if (item.tipo === 'sin-grupo') return <PuntoEstado tono="muted" etiqueta="Aprobada · sin grupo" ocultarEtiquetaEnMovil={compacto} />
  return <PuntoEstado tono="warning" etiqueta="Por aprobar" ocultarEtiquetaEnMovil={compacto} />
}

/** The flags of a por-aprobar item, as small text chips (never color alone). */
export function MarcasItem({ item }: { readonly item: ItemPendiente }): ReactElement | null {
  if (item.tipo !== 'aprobar' || (!item.porVerificar && !item.enPareja)) return null
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {item.porVerificar && (
        <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger-text">
          <ShieldAlert aria-hidden="true" className="size-3" />
          Verificar identidad
        </span>
      )}
      {item.enPareja && (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          <Users aria-hidden="true" className="size-3" />
          En pareja
        </span>
      )}
    </span>
  )
}

function Subtitulo({ children }: { readonly children: ReactNode }): ReactElement {
  return <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
}

function Datos({ filas }: { readonly filas: readonly (readonly [string, ReactNode])[] }): ReactElement {
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
      {filas.map(([clave, valor]) => (
        <div key={clave} className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="shrink-0 text-muted-foreground">{clave}</dt>
          <dd className="min-w-0 truncate text-right text-foreground">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function AvisoIdentidad(): ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-foreground">
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
      <p className="min-w-0">
        <b>No confirmó el código.</b> La reserva llegó desde la página pública sin poder confirmar quién es. Confírmalo
        con la persona antes de aprobar. Por eso no entra en «Aprobar varias»: se revisa una por una.
      </p>
    </div>
  )
}

function descripcionDe(item: ItemPendiente): string {
  const dia = formatearDia(item.fecha)
  if (item.tipo === 'retiro') return `Pidió retirarse el ${dia}`
  if (item.tipo === 'sin-grupo') return `Aprobada · sin grupo · solicitó el ${dia}`
  return `Solicitó el ${dia}${item.origen ? ` · ${ETIQUETA_ORIGEN[item.origen]}` : ''}`
}

function datosDe(item: ItemPendiente): (readonly [string, ReactNode])[] {
  const filas: (readonly [string, ReactNode])[] = [
    ['Taller', item.edicionNombre ? `${item.tallerNombre} · ${item.edicionNombre}` : item.tallerNombre],
  ]
  if (item.tipo === 'retiro') {
    filas.push(['Tipo', item.tipoRetiro === 'equipo_retiro_definitivo' ? 'Retiro definitivo del equipo' : 'Retiro de participante'])
  }
  if (item.origen) filas.push(['Origen', ETIQUETA_ORIGEN[item.origen]])
  if (item.correo) {
    filas.push([
      'Correo',
      <a key="correo" href={`mailto:${item.correo}`} className="focus-ring rounded-sm text-brand-text hover:underline">
        {item.correo}
      </a>,
    ])
  }
  return filas
}

function enlaceEdicion(item: ItemPendiente): string | null {
  return item.tallerSlug && item.edicionId ? rutaEdicion(item.tallerSlug, item.edicionId) : null
}

export function DetallePendiente({ item, abierto, onCambioAbierto, onResuelto }: Props): ReactElement | null {
  const toast = useNotificaciones()
  const escritorio = useEsEscritorio() !== false
  const [pendiente, startTransition] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null)
  const [claveAbierta, setClaveAbierta] = useState<string | null>(item?.clave ?? null)

  // Another item opened: back to its detail, without the previous one's leftovers.
  if ((item?.clave ?? null) !== claveAbierta) {
    setClaveAbierta(item?.clave ?? null)
    setRechazando(false)
    setMotivo('')
    setMensaje('')
    setErrorMotivo(null)
  }

  if (!item) return null
  const actual = item
  const ancho = escritorio ? undefined : 'w-full'
  const edicion = enlaceEdicion(actual)
  const avisoPlural = actual.enPareja ? 'Les llega' : 'Le llega'

  function cambiarAbierto(siguiente: boolean): void {
    if (!siguiente) setRechazando(false)
    onCambioAbierto(siguiente)
  }

  function aprobar(): void {
    startTransition(async () => {
      const resultado = await approveInscripcionAction(actual.id)
      if (resultado.ok) onResuelto(`Aprobaste a ${actual.nombre}. ${avisoPlural} el aviso «Aprobada».`)
      else toast.error(mensajeErrorInscripcion(resultado))
    })
  }

  function rechazar(): void {
    const motivoLimpio = motivo.trim()
    if (!motivoLimpio) {
      setErrorMotivo('Escribe el motivo interno.')
      return
    }
    setErrorMotivo(null)
    startTransition(async () => {
      const mensajeLimpio = mensaje.trim()
      const resultado = await rejectInscripcionAction(actual.id, motivoLimpio, mensajeLimpio || undefined)
      if (resultado.ok) {
        onResuelto(`Rechazaste la solicitud de ${actual.nombre}. ${avisoPlural} el aviso${mensajeLimpio ? ' con tu mensaje' : ''}.`)
      } else if (resultado.error === 'INVALID_MOTIVO') {
        setErrorMotivo(mensajeErrorInscripcion(resultado))
      } else {
        toast.error(mensajeErrorInscripcion(resultado))
      }
    })
  }

  // The controls keep their own confirm step and feedback; on success the page closes and refreshes.
  async function resolverRetiro(
    accion: typeof aprobarSolicitudRetiroAction,
    exito: string,
    solicitudId: string,
  ): Promise<SolicitudRetiroActionResult> {
    const resultado = await accion(solicitudId)
    if (resultado.ok) {
      onResuelto(exito)
      return resultado
    }
    return { ...resultado, message: mensajeErrorRetiro(resultado) }
  }

  let cuerpo: ReactNode
  let pie: ReactNode = null

  if (actual.tipo === 'retiro') {
    const participante = actual.tipoRetiro !== 'equipo_retiro_definitivo'
    cuerpo = (
      <>
        <section className="grid gap-2">
          <Subtitulo>Lo que escribió</Subtitulo>
          <blockquote className="rounded-2xl bg-muted/60 px-4 py-3 text-[15px] text-foreground">
            «{actual.motivo}»
            <footer className="mt-1.5 text-xs text-muted-foreground">{formatearDia(actual.fecha)}</footer>
          </blockquote>
        </section>
        <AvisoFormulario tono="info">
          {participante
            ? 'Si apruebas, sale de la edición y libera su lugar. Queda en el historial.'
            : 'Si apruebas, deja de servir en este taller. Queda en el historial.'}
        </AvisoFormulario>
        {actual.puedeDecidir ? (
          <section className="grid gap-2">
            <Subtitulo>Decisión</Subtitulo>
            <ResolverSolicitudRetiroControls
              solicitudId={actual.id}
              onAprobar={(id) => resolverRetiro(aprobarSolicitudRetiroAction, `Aprobaste el retiro de ${actual.nombre}.`, id)}
              onRechazar={(id) =>
                resolverRetiro(rechazarSolicitudRetiroAction, `Rechazaste la solicitud de ${actual.nombre}. Sigue en el taller.`, id)
              }
            />
          </section>
        ) : (
          <AvisoFormulario tono="info">Solo quien coordina este taller puede resolver esta solicitud.</AvisoFormulario>
        )}
      </>
    )
    pie = (
      <BotonSistema type="button" variante="outline" onClick={() => cambiarAbierto(false)} className={ancho}>
        Cerrar
      </BotonSistema>
    )
  } else if (actual.tipo === 'sin-grupo') {
    cuerpo = (
      <AvisoFormulario tono="info">
        La inscripción ya está aprobada y todavía no tiene grupo. El grupo se elige en la edición, en la lista de inscritos.
      </AvisoFormulario>
    )
    pie = (
      <>
        <BotonSistema type="button" variante="outline" onClick={() => cambiarAbierto(false)} className={ancho}>
          Cerrar
        </BotonSistema>
        {edicion && (
          <BotonSistema asChild variante={actual.puedeDecidir ? 'primario' : 'outline'} icono={Users} className={ancho}>
            <Link href={edicion}>{actual.puedeDecidir ? 'Asignar grupo' : 'Ver la edición'}</Link>
          </BotonSistema>
        )}
      </>
    )
  } else if (rechazando) {
    const ayudaMotivo = `motivo-${actual.id}-ayuda`
    const ayudaMensaje = `mensaje-${actual.id}-ayuda`
    cuerpo = (
      <form
        id={`rechazar-${actual.id}`}
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          rechazar()
        }}
      >
        <div className="grid gap-1.5">
          <TextareaSistema
            id={`motivo-${actual.id}`}
            label="Motivo interno (obligatorio)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            error={errorMotivo ?? undefined}
            required
            aria-describedby={errorMotivo ? `${ayudaMotivo} motivo-${actual.id}-error` : ayudaMotivo}
          />
          <p id={ayudaMotivo} className="text-xs text-muted-foreground">
            Solo lo ve el equipo
          </p>
        </div>
        <div className="grid gap-1.5">
          <TextareaSistema
            id={`mensaje-${actual.id}`}
            label="Mensaje para la persona (opcional)"
            value={mensaje}
            maxLength={MENSAJE_MAX}
            filas={4}
            onChange={(e) => setMensaje(e.target.value)}
            aria-describedby={ayudaMensaje}
          />
          <p id={ayudaMensaje} className="text-xs text-muted-foreground">
            Le llega a la persona y a su pareja por correo y en la app
          </p>
        </div>
      </form>
    )
    pie = (
      <>
        <BotonSistema type="button" variante="outline" onClick={() => setRechazando(false)} disabled={pendiente} className={ancho}>
          Volver
        </BotonSistema>
        <BotonSistema
          type="submit"
          form={`rechazar-${actual.id}`}
          variante="peligro"
          cargando={pendiente}
          disabled={pendiente}
          className={ancho}
        >
          Rechazar y avisar
        </BotonSistema>
      </>
    )
  } else {
    cuerpo = (
      <>
        {actual.porVerificar && <AvisoIdentidad />}
        {actual.enPareja && (
          <AvisoFormulario tono="info">
            <b>Inscripción en pareja.</b> Se aprueban o rechazan juntos; los dos reciben el aviso.
          </AvisoFormulario>
        )}
        {!actual.puedeDecidir && (
          <AvisoFormulario tono="info">Solo quien coordina este taller puede aprobarla o rechazarla.</AvisoFormulario>
        )}
      </>
    )
    if (actual.puedeDecidir) {
      pie = (
        <>
          <BotonSistema
            type="button"
            variante="outline"
            onClick={() => setRechazando(true)}
            disabled={pendiente}
            className={ancho}
          >
            Rechazar…
          </BotonSistema>
          <BotonSistema type="button" icono={Check} onClick={aprobar} cargando={pendiente} disabled={pendiente} className={ancho}>
            Aprobar
          </BotonSistema>
        </>
      )
    }
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={cambiarAbierto}
      titulo={rechazando && actual.tipo === 'aprobar' ? `Rechazar a ${actual.nombre}` : actual.nombre}
      descripcion={descripcionDe(actual)}
      pie={pie}
    >
      <div className="grid gap-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <EstadoItem item={actual} />
          <MarcasItem item={actual} />
        </div>
        {cuerpo}
        {!(rechazando && actual.tipo === 'aprobar') && (
          <section className="grid gap-2">
            <Subtitulo>{actual.tipo === 'retiro' ? 'Solicitud' : 'Inscripción'}</Subtitulo>
            <Datos filas={datosDe(actual)} />
            {edicion && actual.tipo !== 'sin-grupo' && (
              <Link
                href={edicion}
                className="focus-ring inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm font-medium text-brand-text hover:underline"
              >
                Ver la edición
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            )}
          </section>
        )}
      </div>
    </DetalleResponsivo>
  )
}
