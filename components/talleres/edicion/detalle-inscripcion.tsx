'use client'

/**
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the one drawer per
 * inscripción of the edición screen (artboard design/talleres-reserva/12,
 * phone sheet design/talleres-interior/24; hash states #rechazar, #hoja,
 * #nueva). Side panel from md, bottom sheet below.
 *
 * Every write goes through the existing server actions / route, which check
 * the capability again (and the RPC / RLS behind them):
 * - Aprobar: `approveInscripcionAction(id)`; with a grupo picked, the grupo
 *   is assigned right after through POST /api/talleres/inscripciones/
 *   asignar-grupo (the RPC only places aprobadas).
 * - Rechazar…: `rejectInscripcionAction(id, motivo, mensaje?)` with «Motivo
 *   interno (obligatorio)» and «Mensaje para la persona (opcional)».
 * - Grupo of an aprobada: the same route (null takes it out).
 * - Reenviar acceso (partner ficha created by the member): the existing
 *   `AccesoFichaNueva` with `reenviarAccesoAction`.
 * Controls only show with the matching permission (`puedeAprobar` =
 * aprobarInscripciones, `puedeAsignar` = gestionarGrupos).
 *
 * The artboard's identity comparison («Es la misma persona» / «Es otra
 * persona») and the WhatsApp / call shortcuts have no data or action behind
 * them yet: a por-verificar inscripción says what to check and is approved
 * one by one, and only the correo is offered as contact.
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { Check, Mail, ShieldAlert, UserPlus, Users } from 'lucide-react'

import { BotonSistema, SelectSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo, useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AccesoFichaNueva } from '@/components/talleres/acceso-ficha-nueva'
import { unitEstadoLabel } from '@/components/talleres/labels'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  approveInscripcionAction,
  reenviarAccesoAction,
  rejectInscripcionAction,
  type InscripcionActionResult,
} from '@/lib/platform/talleres/inscripciones-actions'

import { asignarGrupo } from './asignar-grupo'
import {
  ETIQUETA_ORIGEN,
  estadoInscrita,
  etiquetaGrupo,
  formatearDia,
  type GrupoEdicionOpcion,
  type InscritaEdicion,
} from './modelo'

/** The column's own limit (inscripciones-actions.ts, MENSAJE_NO_APROBADO_MAX). */
const MENSAJE_MAX = 600
const SIN_GRUPO = 'sin-grupo'

/**
 * Neutral «tú» messages for the action errors (the actions' own texts are not
 * shown). Same wording as /talleres/pendientes' drawer; kept here so this
 * screen does not load the retiro actions that module imports.
 */
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

export interface DetalleInscripcionProps {
  readonly inscrita: InscritaEdicion | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** After a successful write: the screen closes the drawer, shows `mensaje` and refreshes. */
  readonly onResuelto: (mensaje: string) => void
  readonly puedeAprobar: boolean
  readonly puedeAsignar: boolean
  readonly grupos: readonly GrupoEdicionOpcion[]
  readonly mostrarResultado: boolean
}

/** The flags of an inscripción as small text chips (never color alone). */
export function MarcasInscrita({ inscrita }: { readonly inscrita: InscritaEdicion }): ReactElement | null {
  const verificar = inscrita.estado === 'pendiente' && inscrita.porVerificar
  const nueva = inscrita.fichaNueva && inscrita.estado === 'pendiente'
  if (!verificar && !inscrita.sobreCupo && !nueva) return null
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {verificar && (
        <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger-text">
          <ShieldAlert aria-hidden="true" className="size-3" />
          Verificar identidad
        </span>
      )}
      {inscrita.sobreCupo && (
        <span className="inline-flex items-center rounded-md bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning-text">
          Sobre el cupo
        </span>
      )}
      {nueva && (
        <span className="inline-flex items-center gap-1 rounded-md bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info-text">
          <UserPlus aria-hidden="true" className="size-3" />
          Pareja nueva
        </span>
      )}
    </span>
  )
}

export function EstadoInscrita({
  inscrita,
  compacto = false,
}: {
  readonly inscrita: InscritaEdicion
  readonly compacto?: boolean
}): ReactElement {
  const { etiqueta, tono } = estadoInscrita(inscrita.estado)
  return <PuntoEstado tono={tono} etiqueta={etiqueta} ocultarEtiquetaEnMovil={compacto} />
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

function datosDe(i: InscritaEdicion, mostrarResultado: boolean): (readonly [string, ReactNode])[] {
  const filas: (readonly [string, ReactNode])[] = []
  if (i.companero) {
    const vinculo = i.vinculo === 'matrimonio' ? ' · matrimonio' : i.vinculo === 'novios' ? ' · novios' : ''
    filas.push(['En pareja con', `${i.companero}${vinculo}`])
  }
  if (i.origen) filas.push(['Origen', ETIQUETA_ORIGEN[i.origen]])
  filas.push(['Solicitó', formatearDia(i.solicito)])
  filas.push(['Grupo', i.grupoNombre ?? (i.estado === 'aprobado' ? 'Sin grupo todavía' : '—')])
  if (i.sobreCupo) {
    filas.push([
      'Sobre el cupo',
      `Inscrita por ${i.sobreCupoPor ?? '—'}${i.sobreCupoEn ? ` el ${formatearDia(i.sobreCupoEn)}` : ''}`,
    ])
  }
  if (mostrarResultado) filas.push(['Resultado', i.resultado ? unitEstadoLabel(i.resultado) : '—'])
  return filas
}

function descripcionDe(i: InscritaEdicion): string {
  const verbo = i.estado === 'pendiente' ? 'Solicitó' : 'Se inscribió'
  return `${verbo} el ${formatearDia(i.solicito)}${i.origen ? ` · ${ETIQUETA_ORIGEN[i.origen]}` : ''}`
}

export function DetalleInscripcion({
  inscrita,
  abierto,
  onCambioAbierto,
  onResuelto,
  puedeAprobar,
  puedeAsignar,
  grupos,
  mostrarResultado,
}: DetalleInscripcionProps): ReactElement | null {
  const toast = useNotificaciones()
  const escritorio = useEsEscritorio() !== false
  const [pendiente, startTransition] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null)
  const [grupo, setGrupo] = useState<string>(inscrita?.grupoId ?? SIN_GRUPO)
  const [idAbierto, setIdAbierto] = useState<string | null>(inscrita?.id ?? null)

  // Another inscripción opened: back to its detail, without the previous one's leftovers.
  if ((inscrita?.id ?? null) !== idAbierto) {
    setIdAbierto(inscrita?.id ?? null)
    setRechazando(false)
    setMotivo('')
    setMensaje('')
    setErrorMotivo(null)
    setGrupo(inscrita?.grupoId ?? SIN_GRUPO)
  }

  if (!inscrita) return null
  const actual = inscrita
  const ancho = escritorio ? undefined : 'w-full'
  const aviso = actual.companero ? 'Les llega' : 'Le llega'
  const esPendiente = actual.estado === 'pendiente'
  const decide = esPendiente && puedeAprobar
  const eligeGrupo = puedeAsignar && grupos.length > 0 && (actual.estado === 'aprobado' || decide)
  const grupoElegido = grupo === SIN_GRUPO ? null : grupo

  function cambiarAbierto(siguiente: boolean): void {
    if (!siguiente) setRechazando(false)
    onCambioAbierto(siguiente)
  }

  function aprobar(): void {
    startTransition(async () => {
      const resultado = await approveInscripcionAction(actual.id)
      if (!resultado.ok) {
        toast.error(mensajeErrorInscripcion(resultado))
        return
      }
      if (!grupoElegido) {
        onResuelto(`Aprobaste a ${actual.nombre}. ${aviso} el aviso «Aprobada».`)
        return
      }
      const asignacion = await asignarGrupo([actual.id], grupoElegido)
      if (asignacion.ok) {
        onResuelto(`Aprobaste a ${actual.nombre} y le asignaste grupo. ${aviso} el aviso con su facilitadora.`)
      } else {
        toast.error(`Aprobaste a ${actual.nombre}, pero el grupo no se asignó: ${asignacion.mensaje}`)
        onResuelto(`Aprobaste a ${actual.nombre}.`)
      }
    })
  }

  function guardarGrupo(): void {
    startTransition(async () => {
      const asignacion = await asignarGrupo([actual.id], grupoElegido)
      if (asignacion.ok) {
        onResuelto(
          grupoElegido
            ? `${asignacion.mensaje} ${aviso} el aviso «Grupo asignado».`
            : `Quitaste a ${actual.nombre} de su grupo.`,
        )
      } else {
        toast.error(asignacion.mensaje)
      }
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
        onResuelto(`Rechazaste la solicitud de ${actual.nombre}. ${aviso} el aviso${mensajeLimpio ? ' con tu mensaje' : ''}.`)
      } else if (resultado.error === 'INVALID_MOTIVO') {
        setErrorMotivo(mensajeErrorInscripcion(resultado))
      } else {
        toast.error(mensajeErrorInscripcion(resultado))
      }
    })
  }

  let cuerpo: ReactNode
  let pie: ReactNode

  if (decide && rechazando) {
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
        {actual.correo && (
          <a
            href={`mailto:${actual.correo}`}
            className="focus-ring inline-flex min-h-11 min-w-0 items-center gap-2 self-start rounded-xl border border-border/60 px-4 text-sm font-medium text-brand-text hover:bg-muted/50"
          >
            <Mail aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{actual.correo}</span>
          </a>
        )}
        {esPendiente && actual.porVerificar && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-foreground">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
            <p className="min-w-0">
              <b>No confirmó el código.</b> La reserva llegó desde la página pública sin poder confirmar quién es.
              Confírmalo con la persona antes de aprobar. Por eso no entra en la selección: se revisa una por una.
            </p>
          </div>
        )}
        {esPendiente && actual.fichaNueva && (
          <AvisoFormulario tono="info">
            <b>Pareja nueva.</b> Su pareja no estaba en Global Connect: se creó su ficha y se le envía la invitación
            para activar su cuenta.
          </AvisoFormulario>
        )}
        {esPendiente && actual.companero && (
          <AvisoFormulario tono="info">
            <b>Inscripción en pareja.</b> Se aprueban o rechazan juntos; los dos reciben el aviso.
          </AvisoFormulario>
        )}
        {esPendiente && !puedeAprobar && (
          <AvisoFormulario tono="info">Solo quien coordina este taller puede aprobarla o rechazarla.</AvisoFormulario>
        )}
        {eligeGrupo && (
          <section className="grid gap-2">
            <Subtitulo>Grupo</Subtitulo>
            <SelectSistema
              label={`Grupo de ${actual.nombre}`}
              value={grupo}
              onValueChange={setGrupo}
              opciones={[
                { valor: SIN_GRUPO, etiqueta: 'Sin grupo todavía' },
                ...grupos.map((g) => ({ valor: g.id, etiqueta: etiquetaGrupo(g) })),
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {esPendiente
                ? 'Se asigna al aprobar; recibe la aprobación y su facilitadora.'
                : 'Al cambiarlo, recibe el aviso «Grupo asignado».'}
            </p>
          </section>
        )}
        {actual.fichaNueva && (
          <section className="grid gap-2">
            <Subtitulo>Acceso de la pareja</Subtitulo>
            <AccesoFichaNueva
              inscripcionId={actual.id}
              accesoEstado={actual.accesoEstado}
              ultimoEnvioFallido={actual.accesoFallido}
              puedeReenviar={puedeAprobar}
              onReenviarAcceso={reenviarAccesoAction}
            />
          </section>
        )}
        <section className="grid gap-2">
          <Subtitulo>Inscripción</Subtitulo>
          <Datos filas={datosDe(actual, mostrarResultado)} />
        </section>
      </>
    )
    if (decide) {
      pie = (
        <>
          <BotonSistema type="button" variante="outline" onClick={() => setRechazando(true)} disabled={pendiente} className={ancho}>
            Rechazar…
          </BotonSistema>
          <BotonSistema type="button" icono={Check} onClick={aprobar} cargando={pendiente} disabled={pendiente} className={ancho}>
            Aprobar
          </BotonSistema>
        </>
      )
    } else if (eligeGrupo) {
      pie = (
        <>
          <BotonSistema type="button" variante="outline" onClick={() => cambiarAbierto(false)} disabled={pendiente} className={ancho}>
            Cerrar
          </BotonSistema>
          <BotonSistema
            type="button"
            icono={Users}
            onClick={guardarGrupo}
            cargando={pendiente}
            disabled={pendiente || grupoElegido === actual.grupoId}
            className={ancho}
          >
            Guardar grupo
          </BotonSistema>
        </>
      )
    } else {
      pie = (
        <BotonSistema type="button" variante="outline" onClick={() => cambiarAbierto(false)} className={ancho}>
          Cerrar
        </BotonSistema>
      )
    }
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={cambiarAbierto}
      titulo={decide && rechazando ? `Rechazar a ${actual.nombre}` : actual.nombre}
      descripcion={descripcionDe(actual)}
      pie={pie}
    >
      <div className="grid gap-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <EstadoInscrita inscrita={actual} />
          <MarcasInscrita inscrita={actual} />
        </div>
        {cuerpo}
      </div>
    </DetalleResponsivo>
  )
}
