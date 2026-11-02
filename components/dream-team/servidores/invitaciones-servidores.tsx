'use client'

/**
 * Servidores — invitations to register in Global Connect (T4 of
 * odd/tasks/invitaciones-pendientes.md, S2/S3; artboards
 * design/invitaciones/05-mezcla-escritorio.html and 06-mezcla-celular.html).
 *
 * The pieces the list shows under the "Sin cuenta" metric: the account-state
 * pills, the state line of each row, the checkbox of an expired invitation,
 * the "Invitación vencida" banner, the selection bar and the cancel
 * confirmation; plus the requests (bulk resend in chunks of 10, cancel one
 * by one, resend one). Each request returns what happened; the screen toasts
 * and refreshes. The server checks every action again (S5).
 */
import type { ReactElement } from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { Send } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { fechaCorta, hace, horasParaVencer, plural, fechaCancelada } from '@/components/cuentas/textos-invitacion'
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'
import type { EstadoCuenta, FiltrosServidores, PastillaCuenta } from '@/lib/platform/dream-team/servidores-vista'

/** Never color alone: every state has its label (S2). */
export const ESTADO_CUENTA: Readonly<Record<EstadoCuenta, { readonly etiqueta: string; readonly tono: TonoEstado }>> = {
  vencida: { etiqueta: 'Invitación vencida', tono: 'warning' },
  enviada: { etiqueta: 'Invitación enviada', tono: 'info' },
  sin_invitar: { etiqueta: 'Sin invitar', tono: 'muted' },
  registrada: { etiqueta: 'Ya se registró', tono: 'success' },
}

export interface LineaCuenta {
  readonly etiqueta: string
  readonly tono: TonoEstado
  /** Desktop: who and how long ago. */
  readonly detalle: string
  /** Phone second line: the state and the time. */
  readonly corta: string
}

/** The state line of a row. */
export function lineaCuenta(estado: EstadoCuenta, invitacion: ResumenInvitacion | null, ahora: Date): LineaCuenta {
  const { etiqueta, tono } = ESTADO_CUENTA[estado]
  const linea = (detalle: string, corta: string): LineaCuenta => ({ etiqueta, tono, detalle, corta: `${etiqueta} · ${corta}` })
  const cancelada = estado === 'sin_invitar' ? fechaCancelada(invitacion) : null
  if (cancelada !== null) return linea(`Invitación cancelada el ${cancelada}`, `cancelada el ${cancelada}`)
  if (invitacion === null || estado === 'sin_invitar') return linea('Nunca se le envió una invitación', 'nunca invitado')
  const enviada = `Enviada ${hace(invitacion.enviadaEl, ahora)}`
  const por = invitacion.invitadoPor ? ` por ${invitacion.invitadoPor}` : ''
  if (estado === 'vencida') {
    const envios = invitacion.envios > 1 ? ` · ${invitacion.envios} envíos` : ''
    return linea(`${enviada}${por}${envios}`, enviada)
  }
  if (estado === 'enviada') {
    const vence = `${enviada} · vence en ${horasParaVencer(invitacion.enviadaEl, ahora)} h`
    return linea(vence, vence)
  }
  const entro = `Entró el ${fechaCorta(invitacion.aceptadaEl ?? invitacion.enviadaEl)}`
  return linea(`${entro}${invitacion.invitadoPor ? ` · invitado por ${invitacion.invitadoPor}` : ''}`, entro)
}

export function EstadoCuentaFila({ linea }: { readonly linea: LineaCuenta }): ReactElement {
  return (
    <div className="grid min-w-0 gap-1">
      <PuntoEstado tono={linea.tono} etiqueta={linea.etiqueta} className="font-medium text-foreground" />
      <span title={linea.detalle} className="truncate text-xs text-muted-foreground">
        {linea.detalle}
      </span>
    </div>
  )
}

/** The 44px checkbox of an expired invitation; above the row's open button, so it never opens the drawer. */
export function CasillaInvitacion({
  etiqueta,
  marcada,
  onCambio,
}: {
  readonly etiqueta: string
  readonly marcada: boolean
  readonly onCambio: (marcada: boolean) => void
}): ReactElement {
  return (
    <label className="relative z-10 -my-2 flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onCambio(e.target.checked)}
        aria-label={etiqueta}
        className="focus-ring size-[18px] cursor-pointer rounded accent-[var(--brand-strong)]"
      />
    </label>
  )
}

export function PastillasCuenta({
  pastillas,
  onCambio,
}: {
  readonly pastillas: readonly PastillaCuenta[]
  readonly onCambio: (parche: Partial<FiltrosServidores>) => void
}): ReactElement {
  return (
    <GrupoPastillas etiqueta="Estado de la invitación a registrarse">
      {pastillas.map((pastilla) => (
        <PastillaFiltro
          key={pastilla.id}
          etiqueta={pastilla.etiqueta}
          cantidad={pastilla.personas}
          activa={pastilla.activo}
          onClick={() => onCambio(pastilla.parche)}
        />
      ))}
    </GrupoPastillas>
  )
}

export function AvisoVencidas({
  cantidad,
  ocupado,
  onReenviar,
}: {
  readonly cantidad: number
  readonly ocupado: boolean
  readonly onReenviar: () => void
}): ReactElement {
  return (
    <AvisoFormulario tono="info" className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <p className="min-w-0 flex-[1_1_260px] text-muted-foreground">
        <b className="font-semibold text-foreground">
          {plural(cantidad, 'persona no abrió', 'personas no abrieron')} el correo para crear su cuenta
        </b>{' '}
        y el enlace ya venció. Al reenviar, cada una recibe un enlace nuevo para registrarse, en el mismo correo.
      </p>
      <BotonSistema type="button" tamaño="sm" icono={Send} cargando={ocupado} onClick={onReenviar}>
        {`Reenviar invitación a ${cantidad === 1 ? '1 persona' : `las ${cantidad}`}`}
      </BotonSistema>
    </AvisoFormulario>
  )
}

/** The selection bar (components.md, Planned G10: card surface fixed at the bottom, above the tab bar on phones). */
export function BarraSeleccionInvitaciones({
  cantidad,
  ocupado,
  onQuitar,
  onCancelar,
  onReenviar,
}: {
  readonly cantidad: number
  readonly ocupado: boolean
  readonly onQuitar: () => void
  readonly onCancelar: () => void
  readonly onReenviar: () => void
}): ReactElement {
  return (
    <section
      aria-label="Acciones de la selección"
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-40 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm shadow-sheet md:inset-x-auto md:right-6 md:bottom-6 md:w-[min(46rem,calc(100%-3rem))] lg:right-12"
    >
      <p aria-live="polite" className="mr-auto font-semibold text-foreground">
        <span className="font-mono tabular-nums">{cantidad}</span>
        {` ${cantidad === 1 ? 'invitación seleccionada' : 'invitaciones seleccionadas'}`}
      </p>
      <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={ocupado} onClick={onQuitar}>
        Quitar selección
      </BotonSistema>
      <BotonSistema type="button" variante="outline" tamaño="sm" disabled={ocupado} onClick={onCancelar}>
        Cancelar invitaciones
      </BotonSistema>
      <BotonSistema type="button" tamaño="sm" icono={Send} cargando={ocupado} onClick={onReenviar}>
        {`Reenviar ${cantidad}`}
      </BotonSistema>
    </section>
  )
}

/** Asks before cancelling: the link stops working and a never-confirmed account is deleted (S6). */
export function DialogoCancelarInvitacion({
  abierto,
  titulo,
  descripcion,
  confirmar,
  ocupado,
  onConfirmar,
  onCerrar,
}: {
  readonly abierto: boolean
  readonly titulo: string
  readonly descripcion: string
  readonly confirmar: string
  readonly ocupado: boolean
  readonly onConfirmar: () => void
  readonly onCerrar: () => void
}): ReactElement {
  return (
    <AlertDialog open={abierto} onOpenChange={(abre) => !abre && !ocupado && onCerrar()}>
      <AlertDialogContent className="rounded-2xl bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Radix focuses Cancel on open: the safe choice is the default. */}
          <AlertDialogPrimitive.Cancel asChild>
            <BotonSistema type="button" variante="outline" disabled={ocupado}>
              Volver
            </BotonSistema>
          </AlertDialogPrimitive.Cancel>
          <BotonSistema type="button" variante="peligro" cargando={ocupado} onClick={onConfirmar}>
            {confirmar}
          </BotonSistema>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Requests ──

export interface ResultadoLote {
  readonly hechas: number
  readonly fallidas: number
  /** The first error, shown after the count. */
  readonly error: string | null
}

const urlInvitacion = (id: string) => `/api/users/${encodeURIComponent(id)}/invitacion-cuenta`

async function errorDe(res: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: string }
    return cuerpo.error ?? porDefecto
  } catch {
    return porDefecto
  }
}

/**
 * Ids per bulk-resend request: each send takes seconds, so a batch stays well
 * inside the route's 60 s (the server still accepts up to MAX_IDS_REENVIO).
 */
export const LOTE_REENVIO = 10

/** POST /api/invitaciones-cuenta/reenviar, at most LOTE_REENVIO ids per request. */
export async function reenviarInvitacionesEnLote(ids: readonly string[]): Promise<ResultadoLote> {
  let hechas = 0
  let fallidas = 0
  let error: string | null = null
  for (let i = 0; i < ids.length; i += LOTE_REENVIO) {
    const lote = ids.slice(i, i + LOTE_REENVIO)
    try {
      const res = await fetch('/api/invitaciones-cuenta/reenviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: lote }),
      })
      if (!res.ok) {
        fallidas += lote.length
        error ??= await errorDe(res, 'No se pudieron reenviar las invitaciones.')
        continue
      }
      const { resultados = [] } = (await res.json()) as { resultados?: { ok: boolean; error?: string }[] }
      for (const resultado of resultados) {
        if (resultado.ok) hechas += 1
        else {
          fallidas += 1
          error ??= resultado.error ?? 'No se pudo reenviar la invitación.'
        }
      }
    } catch {
      fallidas += lote.length
      error ??= 'No se pudo conectar con el servidor.'
    }
  }
  return { hechas, fallidas, error }
}

/** DELETE /api/users/[id]/invitacion-cuenta; `null` when it worked, the error otherwise. */
export async function cancelarInvitacion(id: string): Promise<string | null> {
  try {
    const res = await fetch(urlInvitacion(id), { method: 'DELETE' })
    return res.ok ? null : await errorDe(res, 'No se pudo cancelar la invitación.')
  } catch {
    return 'No se pudo conectar con el servidor.'
  }
}

/** Cancels one at a time. */
export async function cancelarInvitacionesEnSerie(ids: readonly string[]): Promise<ResultadoLote> {
  let hechas = 0
  let fallidas = 0
  let error: string | null = null
  for (const id of ids) {
    const fallo = await cancelarInvitacion(id)
    if (fallo === null) hechas += 1
    else {
      fallidas += 1
      error ??= fallo
    }
  }
  return { hechas, fallidas, error }
}

/** POST /api/users/[id]/invitacion-cuenta with the same email. */
export async function reenviarInvitacion(id: string, email: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(urlInvitacion(id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reemplazarEmail: false }),
    })
    if (!res.ok) return { ok: false, error: await errorDe(res, 'No se pudo reenviar la invitación.') }
    const cuerpo = (await res.json()) as { email?: string }
    return { ok: true, email: cuerpo.email ?? email }
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor.' }
  }
}

export const mensajeReenviadas = (n: number): string =>
  n === 1 ? 'Se reenvió 1 invitación para registrarse.' : `Se reenviaron ${n} invitaciones para registrarse.`

export const mensajeCanceladas = (n: number): string =>
  n === 1 ? 'Se canceló 1 invitación a la plataforma.' : `Se cancelaron ${n} invitaciones a la plataforma.`
