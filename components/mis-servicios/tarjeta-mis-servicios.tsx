'use client'

/**
 * «Mis servicios» at the top of the panel (odd/tasks/dps-asistencia-pco.md,
 * T15c, S13.4, S13.5; artboards design/dps-avisos/04 on the phone and 07 on
 * desktop). Top to bottom (phone) or pending | notices and upcoming
 * (desktop):
 *   - each service waiting for an answer as a large item: date, roles,
 *     horarios, llegada, Confirmar / No puedo, and a link to the detail; an
 *     answered one stays here with «Cambiar respuesta» until the next visit;
 *   - the unseen notices «Cambió tu servicio» (before → after) and «Ya no
 *     estás programado», each with «Entendido» (marcarAvisoVistoDps);
 *   - «Próximos»: the other upcoming services with their state, and
 *     «Fechas que no puedo servir».
 * With nothing left it renders nothing. The data comes from
 * cargarMisServiciosPanel (cargar-mis-servicios.ts); the answers are applied
 * in place.
 */
import { useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { CalendarOff, ChevronRight, Info, UserMinus } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { marcarAvisoVistoDps } from '@/lib/actions/dps-avisos.actions'
import type { MisServicios, ServicioAviso } from '@/lib/platform/dps/avisos'
import { cn } from '@/lib/utils'

import { RespuestaServicio } from './respuesta-servicio'
import {
  ETIQUETA_ESTADO,
  TONO_ESTADO,
  areaRoles,
  cierreCambio,
  contextoServicio,
  frasesCambio,
  horaCorta,
  lineaServicio,
  mesYDia,
  palabra,
  quienAviso,
  rolesTexto,
  textoHorarios,
  tituloCambio,
  tituloFecha,
  tituloQuitado,
} from './textos'

export const RUTA_MIS_SERVICIOS = '/mis-servicios'
export const RUTA_FECHAS_BLOQUEADAS = '/mis-servicios/fechas'

export interface TarjetaMisServiciosProps {
  readonly inicial: MisServicios
  /** Today in Caracas (YYYY-MM-DD), for «Te avisó … hoy». */
  readonly hoy: string
}

// Hairline between rows, starting after the 40px date tile (66px).
const CLASE_LINEA = 'before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden'

function ItemPendiente({ servicio, hoy, onServicio }: { servicio: ServicioAviso; hoy: string; onServicio: (s: ServicioAviso) => void }): ReactElement {
  const id = `mis-servicios-${servicio.planId}`
  const area = areaRoles(servicio.roles)
  const contexto = contextoServicio(servicio)
  const cambios = servicio.cambio ? frasesCambio(servicio) : []
  return (
    <article aria-labelledby={`${id}-titulo`} className="min-w-0 rounded-2xl bg-brand-tint p-3.5 ring-[1.5px] ring-brand ring-inset">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <PuntoEstado tono={TONO_ESTADO[servicio.estado]} etiqueta={ETIQUETA_ESTADO[servicio.estado]} />
        <span className="text-[13px] text-muted-foreground">{quienAviso(servicio, hoy)}</span>
      </div>
      <h3 id={`${id}-titulo`} className="mt-2 text-[19px] font-[650] leading-tight tracking-[-0.01em]">
        {tituloFecha(servicio.fecha)}
      </h3>
      <p className="mt-0.5 min-w-0 break-words text-[15px]">
        <span className="font-semibold">{rolesTexto(servicio.roles)}</span>
        {[area, contexto].filter(Boolean).map((t) => (
          <span key={t} className="text-muted-foreground">
            {' · '}
            {t}
          </span>
        ))}
      </p>
      {cambios.length > 0 && (
        <p className="mt-1 text-[13px] text-info-text">
          Cambió tu servicio:{' '}
          {cambios.map((c, i) => (
            <span key={i}>
              {c.ahora.charAt(0).toLocaleLowerCase('es') + c.ahora.slice(1)}
              {c.antes && (
                <>
                  {' '}
                  (antes <s>{c.antes}</s>)
                </>
              )}
              {i < cambios.length - 1 ? '; ' : '.'}
            </span>
          ))}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="rounded-xl border border-border/70 bg-card px-2.5 py-2">
          <dt className="text-xs text-muted-foreground">
            {servicio.horarios.length} {palabra(servicio.horarios.length, 'servicio', 'servicios')}
          </dt>
          <dd className="font-mono text-[15px] font-semibold tabular-nums">{textoHorarios(servicio.horarios)}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-card px-2.5 py-2">
          <dt className="text-xs text-muted-foreground">Llegada</dt>
          <dd className="font-mono text-[15px] font-semibold tabular-nums">{horaCorta(servicio.llegada)}</dd>
        </div>
      </dl>
      <RespuestaServicio servicio={servicio} onServicio={onServicio} variante="tarjeta" className="mt-3" />
      <Link
        href={`${RUTA_MIS_SERVICIOS}/${servicio.planId}`}
        className="focus-ring mt-1 flex min-h-11 items-center justify-center gap-1 rounded-xl text-sm font-medium text-brand-text touch-manipulation"
      >
        Ver el servicio y quiénes sirven contigo
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  )
}

interface ItemAvisoProps {
  readonly servicio: ServicioAviso
  readonly onVisto: (planId: string) => Promise<string | null>
}

function ItemAviso({ servicio, onVisto }: ItemAvisoProps): ReactElement {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = `mis-servicios-aviso-${servicio.planId}`
  const quitado = servicio.quitado
  const Icono = quitado ? UserMinus : Info

  async function entendido() {
    setEnviando(true)
    const fallo = await onVisto(servicio.planId)
    setEnviando(false)
    setError(fallo)
  }

  return (
    <article aria-labelledby={`${id}-titulo`} className="flex min-w-0 gap-3 rounded-2xl border border-border bg-card py-3 pr-2 pl-3.5">
      <span
        aria-hidden="true"
        className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-md', quitado ? 'bg-muted text-muted-foreground' : 'bg-info/12 text-info-text')}
      >
        <Icono className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={`${id}-titulo`} className="text-[15px] font-semibold leading-snug">
          {quitado ? tituloQuitado(servicio) : tituloCambio(servicio)}
        </h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {quitado ? (
            'Quien planifica cambió el equipo. No tienes que hacer nada.'
          ) : (
            <>
              {frasesCambio(servicio).map((c, i) => (
                <span key={i}>
                  {c.ahora}
                  {c.antes && (
                    <>
                      {' '}
                      (antes <s>{c.antes}</s>)
                    </>
                  )}
                  .{' '}
                </span>
              ))}
              {cierreCambio(servicio)}
            </>
          )}
        </p>
        {error && (
          <AvisoFormulario tono="error" className="mt-2 p-3">
            {error}
          </AvisoFormulario>
        )}
      </div>
      <button
        type="button"
        onClick={entendido}
        disabled={enviando}
        className="focus-ring min-h-11 shrink-0 self-center rounded-xl px-3 text-sm font-medium text-brand-text transition-colors touch-manipulation hover:bg-accent disabled:opacity-50"
      >
        Entendido
      </button>
    </article>
  )
}

function FilaProximo({ servicio }: { servicio: ServicioAviso }): ReactElement {
  const { mes, dia } = mesYDia(servicio.fecha)
  return (
    <li className={cn('relative', CLASE_LINEA)}>
      <Link
        href={`${RUTA_MIS_SERVICIOS}/${servicio.planId}`}
        className="focus-ring flex min-h-16 min-w-0 items-center gap-3 rounded-2xl py-2.5 pr-3 pl-3.5 touch-manipulation hover:bg-accent/60"
      >
        <span aria-hidden="true" className="grid h-11 w-10 shrink-0 content-center justify-items-center rounded-md bg-muted leading-none">
          <small className="text-xs font-semibold uppercase text-brand-text">{mes}</small>
          <b className="mt-0.5 font-mono text-lg font-[650] tabular-nums">{dia}</b>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{rolesTexto(servicio.roles)}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{lineaServicio(servicio)}</span>
          <PuntoEstado tono={TONO_ESTADO[servicio.estado]} etiqueta={ETIQUETA_ESTADO[servicio.estado]} className="mt-1" />
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

function FilaFechas({ total }: { total: number }): ReactElement {
  return (
    <li className={cn('relative md:hidden', CLASE_LINEA)}>
      <Link
        href={RUTA_FECHAS_BLOQUEADAS}
        className="focus-ring flex min-h-14 min-w-0 items-center gap-3 rounded-2xl py-2 pr-3 pl-3.5 touch-manipulation"
      >
        <span aria-hidden="true" className="grid w-10 shrink-0 place-items-center text-brand-text">
          <CalendarOff className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">Fechas que no puedo servir</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {total > 0 ? (
              <>
                <span className="font-mono tabular-nums">{total}</span> {palabra(total, 'fecha bloqueada', 'fechas bloqueadas')}
              </>
            ) : (
              'Avisa qué días no vas a estar'
            )}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

export function TarjetaMisServicios({ inicial, hoy }: TarjetaMisServiciosProps): ReactElement | null {
  const [servicios, setServicios] = useState<readonly ServicioAviso[]>(inicial.servicios)
  const [avisos, setAvisos] = useState<readonly ServicioAviso[]>(inicial.avisos)
  // Answered here: they stay large, with «Cambiar respuesta», until the next visit.
  const [respondidos, setRespondidos] = useState<ReadonlySet<string>>(() => new Set())
  const [vivo, setVivo] = useState('')
  const titulo = useRef<HTMLHeadingElement>(null)

  const grandes = useMemo(() => servicios.filter((s) => s.estado === 'pendiente' || respondidos.has(s.planId)), [servicios, respondidos])
  const proximos = useMemo(() => servicios.filter((s) => s.estado !== 'pendiente' && !respondidos.has(s.planId)), [servicios, respondidos])
  const porResponder = servicios.filter((s) => s.estado === 'pendiente').length

  if (servicios.length === 0 && avisos.length === 0) return null

  function actualizar(nuevo: ServicioAviso) {
    setRespondidos((r) => new Set(r).add(nuevo.planId))
    setServicios((lista) => lista.map((s) => (s.planId === nuevo.planId ? nuevo : s)))
    // An answer clears «Cambió tu servicio» of that plan.
    setAvisos((lista) => lista.filter((a) => a.planId !== nuevo.planId || a.quitado))
  }

  async function marcarVisto(planId: string): Promise<string | null> {
    const r = await marcarAvisoVistoDps({ planId })
    if (!r.ok) return r.message
    setAvisos((lista) => lista.filter((a) => a.planId !== planId))
    setVivo('Aviso cerrado.')
    requestAnimationFrame(() => titulo.current?.focus())
    return null
  }

  const resumen =
    servicios.length === 0 ? null : porResponder > 0 ? (
      <>
        Tienes <strong className="font-mono font-semibold tabular-nums text-foreground">{porResponder}</strong>{' '}
        {palabra(porResponder, 'servicio por responder', 'servicios por responder')}.
      </>
    ) : (
      'Respondiste todos tus servicios.'
    )

  return (
    <section
      aria-labelledby="mis-servicios-titulo"
      className="min-w-0 space-y-3 md:rounded-2xl md:border md:border-border md:bg-card md:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1 md:px-0">
        <div className="min-w-0">
          <h2
            id="mis-servicios-titulo"
            ref={titulo}
            tabIndex={-1}
            className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase outline-none md:text-lg md:font-[650] md:tracking-tight md:text-foreground md:normal-case"
          >
            Mis servicios
          </h2>
          {resumen && <p className="mt-0.5 text-sm text-muted-foreground">{resumen}</p>}
        </div>
        <BotonSistema asChild variante="outline" tamaño="sm" className="hidden md:inline-flex">
          <Link href={RUTA_FECHAS_BLOQUEADAS}>
            Fechas que no puedo servir
            {inicial.fechasBloqueadas > 0 && <span className="font-mono tabular-nums text-muted-foreground">{inicial.fechasBloqueadas}</span>}
          </Link>
        </BotonSistema>
      </div>

      <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5', grandes.length > 0 && 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-4')}>
        {grandes.length > 0 && (
          <div className="grid min-w-0 content-start gap-2.5">
            {grandes.map((s) => (
              <ItemPendiente key={s.planId} servicio={s} hoy={hoy} onServicio={actualizar} />
            ))}
          </div>
        )}
        <div className="grid min-w-0 content-start gap-2.5">
          {avisos.map((a) => (
            <ItemAviso key={`${a.planId}-${a.quitado ? 'q' : 'c'}`} servicio={a} onVisto={marcarVisto} />
          ))}
          <div className="min-w-0">
            {proximos.length > 0 && (
              <h3 id="mis-servicios-proximos" className="mt-1.5 mb-2 px-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Próximos
              </h3>
            )}
            <ul
              {...(proximos.length > 0 ? { 'aria-labelledby': 'mis-servicios-proximos' } : { 'aria-label': 'Más opciones' })}
              className={cn('overflow-hidden rounded-2xl bg-card md:border md:border-border', proximos.length === 0 && 'md:hidden')}
            >
              {proximos.map((s) => (
                <FilaProximo key={s.planId} servicio={s} />
              ))}
              <FilaFechas total={inicial.fechasBloqueadas} />
            </ul>
          </div>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {vivo}
      </p>
    </section>
  )
}
