'use client'

/**
 * DPS — the public «Confirmar» page of the e-mail (odd/tasks/dps-asistencia-pco.md,
 * T16b; S14.2, S14.5; artboard design/dps-avisos-correo/05), without a
 * session. Opening the link never confirms (link scanners open it too): it
 * shows the puesto, the date and the hours, never a name, and a big
 * «Confirmar» that confirms through the token (`onConfirmar`, a server action
 * with the service client). Every state says what happened in one sentence
 * and offers the next step:
 *   por_confirmar → «Confirmar» (and «No puedo», which needs the app);
 *   confirmado / ya_confirmado → the hours and «Ver en Global Connect»;
 *   no_puede → the link never undoes it: «Ábrelo en Global Connect» (login);
 *   cambio → another notice was sent since: what changed, nothing confirmed;
 *   quitado → the day is free; vencido → the date passed; invalido → nothing
 *   about whose it was; error → the button stays with the reason.
 * The links into the app ask for a login (the middleware sends them back
 * after it). «Agregar al calendario» of 05 is not here yet.
 */
import Link from 'next/link'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Check, Clock, Link2Off, Minus, Repeat2, X, type LucideIcon } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { horaCorta, textoHorarios, tituloFecha } from '@/components/mis-servicios/textos'
import type { EstadoEnlace, RolEnlace, ServicioEnlace } from '@/lib/platform/dps/avisos-correo'
import { MENSAJE_CONFIRMAR_ENLACE, MENSAJE_LEER_ENLACE } from '@/lib/platform/dps/errores'
import { cn } from '@/lib/utils'

export interface ConfirmarServicioProps {
  readonly token: string
  /** What the link says on load (dps_aviso_token_leer). */
  readonly inicial: ServicioEnlace
  /** Confirms through the token and returns the new state (dps_aviso_token_confirmar). */
  readonly onConfirmar: (token: string) => Promise<ServicioEnlace>
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const

/** «miércoles 11» of an instant, in Caracas. */
function diaRespuesta(instante: string | null): string | null {
  if (!instante) return null
  const d = new Date(instante)
  if (Number.isNaN(d.getTime())) return null
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const local = new Date(`${fecha}T00:00:00Z`)
  return `${DIAS[local.getUTCDay()]} ${local.getUTCDate()}`
}

const nombres = (roles: readonly RolEnlace[]): string => {
  const n = [...new Set(roles.map((r) => r.nombre).filter(Boolean))]
  return n.length < 2 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}
const conEquipo = (roles: readonly RolEnlace[]): string => {
  const equipos = [...new Set(roles.map((r) => r.equipo).filter(Boolean))]
  return equipos.length <= 1 ? [nombres(roles), equipos[0] ?? ''].filter(Boolean).join(' · ') : roles.map((r) => [r.nombre, r.equipo].filter(Boolean).join(' · ')).join(', ')
}

const SELLOS: Record<Exclude<EstadoEnlace, 'por_confirmar' | 'error'>, { icono: LucideIcon; tono: string }> = {
  confirmado: { icono: Check, tono: 'bg-success/15 text-success-text' },
  ya_confirmado: { icono: Check, tono: 'bg-success/15 text-success-text' },
  no_puede: { icono: X, tono: 'bg-muted text-muted-foreground' },
  cambio: { icono: Repeat2, tono: 'bg-warning/15 text-warning-text' },
  quitado: { icono: Minus, tono: 'bg-muted text-muted-foreground' },
  vencido: { icono: Clock, tono: 'bg-muted text-muted-foreground' },
  invalido: { icono: Link2Off, tono: 'bg-danger/15 text-danger-text' },
}

const CLASE_ENLACE = 'focus-ring inline-flex min-h-11 items-center justify-center rounded-md px-2 text-sm font-medium text-brand-text touch-manipulation'

function Fila({ etiqueta, ahora, antes, clave = false }: { etiqueta: string; ahora: string; antes?: string | null; clave?: boolean }): ReactElement {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 [&+&]:border-t [&+&]:border-border/60">
      <span className={cn('text-[15px]', clave ? 'font-semibold' : 'text-muted-foreground')}>{etiqueta}</span>
      <b className="flex items-center gap-1.5 text-right font-mono text-[15px] font-semibold tabular-nums">
        {antes ? (
          <>
            <s className="font-normal text-muted-foreground">
              <span className="sr-only">Antes </span>
              {antes}
            </s>
            <span className="sr-only"> ahora </span>
            <span aria-hidden="true">→</span>
          </>
        ) : null}
        {ahora}
      </b>
    </div>
  )
}

function Horarios({ s, cambio = false }: { s: ServicioEnlace; cambio?: boolean }): ReactElement | null {
  const antes = cambio ? s.antes : null
  if (!s.llegada && s.horarios.length === 0) return null
  return (
    <section aria-labelledby="confirmar-horarios" className="grid gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 id="confirmar-horarios" className="text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
          Horarios
        </h2>
        {cambio && antes && (antes.llegada || antes.horarios) ? <PuntoEstado tono="warning" etiqueta="Cambió" /> : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {s.llegada ? <Fila etiqueta="Llegada del equipo" ahora={horaCorta(s.llegada)} antes={antes?.llegada ? horaCorta(antes.llegada) : null} clave /> : null}
        {s.horarios.length > 0 ? <Fila etiqueta="Servicios" ahora={textoHorarios(s.horarios)} antes={antes?.horarios ? textoHorarios(antes.horarios) : null} /> : null}
      </div>
    </section>
  )
}

function Resumen({ s, tono, estado, tachado = false, children }: { s: ServicioEnlace; tono: TonoEstado; estado: string; tachado?: boolean; children?: ReactNode }): ReactElement {
  return (
    <div className="grid gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <PuntoEstado tono={tono} etiqueta={estado} />
      <b className={cn('text-[15px] font-semibold', tachado && 'text-muted-foreground line-through')}>
        {tachado ? <span className="sr-only">Antes: </span> : null}
        {conEquipo(s.roles)}
      </b>
      {children}
    </div>
  )
}

function Aviso({ children }: { children: ReactNode }): ReactElement {
  return <p className="rounded-xl border border-info/30 bg-info/5 px-3.5 py-3 text-[13px]">{children}</p>
}

export function ConfirmarServicio({ token, inicial, onConfirmar }: ConfirmarServicioProps): ReactElement {
  const [s, setS] = useState<ServicioEnlace>(inicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(inicial.estado === 'error' ? MENSAJE_LEER_ENLACE : null)
  const tituloRef = useRef<HTMLHeadingElement>(null)

  async function confirmar(): Promise<void> {
    if (enviando) return
    setEnviando(true)
    setError(null)
    let r: ServicioEnlace
    try {
      r = await onConfirmar(token)
    } catch {
      r = { ...s, estado: 'error' }
    }
    setEnviando(false)
    if (r.estado === 'error') {
      setError(MENSAJE_CONFIRMAR_ENLACE)
      return
    }
    setS(r)
    requestAnimationFrame(() => tituloRef.current?.focus())
  }

  const fecha = s.fecha ? tituloFecha(s.fecha) : ''
  const fechaMinuscula = fecha.charAt(0).toLocaleLowerCase('es') + fecha.slice(1)
  const que = [fecha, nombres(s.roles)].filter(Boolean).join(' · ')
  const domingo = s.tipo === 'domingo'
  const verServicio = s.planId ? `/mis-servicios/${s.planId}` : '/mis-servicios'
  const noPuedo = s.planId ? `/mis-servicios/${s.planId}#no-puedo` : '/mis-servicios'
  const respondio = diaRespuesta(s.respondidoAt)

  let titulo: string
  let texto: ReactNode = null
  let cuerpo: ReactNode = null
  let pie: ReactNode
  switch (s.estado) {
    case 'por_confirmar':
    case 'error':
      titulo = domingo ? '¿Puedes servir este domingo?' : '¿Puedes servir este día?'
      texto = 'Confirma con un toque. Tu equipo lo verá en el plan.'
      cuerpo = (
        <>
          <Resumen s={s} tono="warning" estado="Pendiente de respuesta">
            {s.serie || s.titulo ? <p className="text-[13px] text-muted-foreground">{s.titulo ?? s.serie}</p> : null}
          </Resumen>
          <Horarios s={s} />
        </>
      )
      pie = (
        <>
          <BotonSistema type="button" tamaño="lg" className="w-full" onClick={() => void confirmar()} cargando={enviando}>
            Confirmar
          </BotonSistema>
          <Link href={noPuedo} className={CLASE_ENLACE}>
            No puedo
          </Link>
          <p className="text-center text-xs text-muted-foreground">«No puedo» abre Global Connect para escribir el motivo.</p>
        </>
      )
      break
    case 'confirmado':
    case 'ya_confirmado':
      titulo = s.estado === 'confirmado' ? '¡Listo, confirmaste!' : 'Ya habías confirmado'
      texto =
        s.estado === 'confirmado'
          ? 'Gracias. Tu equipo ya lo ve en el plan.'
          : `${respondio ? `Confirmaste el ${respondio}. ` : ''}No tienes que hacer nada más.`
      cuerpo = (
        <>
          {s.estado === 'confirmado' ? <Resumen s={s} tono="success" estado="Confirmado" /> : null}
          <Horarios s={s} />
        </>
      )
      pie = (
        <>
          <BotonSistema asChild tamaño="lg" className="w-full">
            <Link href={verServicio}>Ver en Global Connect</Link>
          </BotonSistema>
          <p className="text-center text-xs text-muted-foreground">Te pedirá iniciar sesión.</p>
          <Link href={noPuedo} className={CLASE_ENLACE}>
            ¿Te equivocaste? No puedo
          </Link>
        </>
      )
      break
    case 'no_puede':
      titulo = 'Ya dijiste que no puedes'
      texto = `${respondio ? `Respondiste el ${respondio}. ` : ''}Quien planifica ya lo sabe.`
      cuerpo = <Aviso>¿Al final sí puedes? Cámbialo en Global Connect.</Aviso>
      pie = (
        <>
          <BotonSistema asChild tamaño="lg" className="w-full">
            <Link href={verServicio}>Ábrelo en Global Connect</Link>
          </BotonSistema>
          <p className="text-center text-xs text-muted-foreground">Te pedirá iniciar sesión.</p>
        </>
      )
      break
    case 'cambio':
      titulo = 'Este servicio cambió'
      texto = 'Todavía no confirmamos nada. Te enviamos un correo nuevo con el cambio: confirma desde ese correo o en Global Connect.'
      cuerpo = (
        <>
          {s.antes?.roles || s.antes?.fecha ? (
            <Resumen s={s} tono="warning" estado="Cambió">
              {s.antes.roles ? (
                <p className="text-[13px] text-muted-foreground">
                  Antes: <s>{conEquipo(s.antes.roles)}</s>
                </p>
              ) : null}
              {s.antes.fecha ? (
                <p className="text-[13px] text-muted-foreground">
                  Antes: <s>{tituloFecha(s.antes.fecha)}</s>
                </p>
              ) : null}
            </Resumen>
          ) : null}
          <Horarios s={s} cambio />
        </>
      )
      pie = (
        <>
          <BotonSistema asChild tamaño="lg" className="w-full">
            <Link href={verServicio}>Ver en Global Connect</Link>
          </BotonSistema>
          <p className="text-center text-xs text-muted-foreground">Te pedirá iniciar sesión.</p>
          <Link href={noPuedo} className={CLASE_ENLACE}>
            No puedo
          </Link>
        </>
      )
      break
    case 'quitado':
      titulo = 'Ya no estás programado'
      texto = `Te quitaron del ${fechaMinuscula}. Ese día queda libre; no tienes que hacer nada.`
      cuerpo = (
        <Resumen s={s} tono="muted" estado="Quitado del plan" tachado>
          <p className="text-[13px] text-muted-foreground">Si crees que es un error, responde el correo y le llega a quien planifica.</p>
        </Resumen>
      )
      pie = (
        <>
          <BotonSistema asChild variante="outline" tamaño="lg" className="w-full">
            <Link href="/mis-servicios">Ver mis servicios</Link>
          </BotonSistema>
          <p className="text-center text-xs text-muted-foreground">Te pedirá iniciar sesión.</p>
        </>
      )
      break
    case 'vencido':
      titulo = 'Este enlace ya venció'
      texto = `Era para el ${fechaMinuscula}, que ya pasó. No guardamos ninguna respuesta.`
      cuerpo = <Aviso>Tus próximos servicios siempre están en Global Connect, con sus botones para confirmar.</Aviso>
      pie = (
        <>
          <BotonSistema asChild tamaño="lg" className="w-full">
            <Link href="/mis-servicios">Ver mis servicios</Link>
          </BotonSistema>
          <p className="text-center text-xs text-muted-foreground">Te pedirá iniciar sesión.</p>
        </>
      )
      break
    default:
      titulo = 'No reconocemos este enlace'
      texto = 'Puede que se haya cortado al copiarlo. Vuelve al correo y toca el botón «Confirmar» otra vez.'
      cuerpo = <Aviso>Si sigue sin funcionar, entra a Global Connect: ahí puedes confirmar tus servicios.</Aviso>
      pie = (
        <BotonSistema asChild tamaño="lg" className="w-full">
          <Link href="/">Iniciar sesión</Link>
        </BotonSistema>
      )
  }

  const sello = s.estado === 'por_confirmar' || s.estado === 'error' ? null : SELLOS[s.estado]
  const Icono = sello?.icono

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="safe-area-pt border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <span className="text-[15px] font-semibold">Global Connect</span>
          {s.estado !== 'invalido' ? (
            <Link href="/" className={CLASE_ENLACE}>
              Iniciar sesión
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-8 pb-6">
        {Icono && sello ? (
          <span aria-hidden="true" className={cn('grid size-14 place-items-center rounded-full', sello.tono)}>
            <Icono className="size-7" />
          </span>
        ) : null}
        <div className="grid gap-1.5" role="status" aria-live="polite">
          <h1 ref={tituloRef} tabIndex={-1} className="text-[28px] leading-tight font-bold outline-none">
            {titulo}
          </h1>
          {que && s.estado !== 'quitado' && s.estado !== 'vencido' ? <p className="text-[15px] font-semibold">{que}</p> : null}
          {texto ? <p className="text-[15px] text-muted-foreground">{texto}</p> : null}
        </div>
        {cuerpo}
      </main>
      <footer className="safe-area-pb mx-auto grid w-full max-w-md gap-2 px-4 pb-6">
        {error ? (
          <p role="alert" className="text-center text-sm text-danger-text">
            {error}
          </p>
        ) : null}
        {pie}
      </footer>
    </div>
  )
}
