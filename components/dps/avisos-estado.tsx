/**
 * DPS — the pieces of the service notices that the plan and the sheet share
 * (T15b of odd/tasks/dps-asistencia-pco.md; S13.2, S13.3; artboards
 * design/dps-avisos/01 and 03): the state chip of a convocado (`.st`: icon
 * + text, never color alone), the small mark of a person in a sheet cell
 * (`.mk`, 16px), the legend of the sheet (`.leg`), the summary of answers
 * of the plan's header (`.est`) and the «N avisos sin enviar» bar (`.avb`)
 * with «Enviar avisos» («N cambios sin guardar» + «Guardar cambios» when it
 * only closes a «No puede», S13.4). Built from the status tokens (tint +
 * `-text`) as EtiquetaPlanner; local here until they move to components/ui.
 * Server-safe.
 */
import type { ReactElement } from 'react'
import { Bell, Check, Clock, Minus, Send, UserX, X, type LucideIcon } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EtiquetaPlanner } from '@/components/grupos-vida/planner/etiqueta'
import type { EstadoAsignacion, PersonaEstadoAviso, ResumenAvisos } from '@/lib/platform/dps/avisos'
import { cn } from '@/lib/utils'

interface EstiloEstado {
  readonly texto: string
  /** For a sentence: «Ximena Rangel: confirmó». */
  readonly minuscula: string
  readonly icono: LucideIcon | null
  readonly chip: string
  readonly marca: string
}

/** A filled dot: «Sin avisar» (`i-dot` of the artboards). */
function Punto({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  )
}

export const ESTILO_ESTADO: Readonly<Record<EstadoAsignacion, EstiloEstado>> = {
  sin_avisar: {
    texto: 'Sin avisar',
    minuscula: 'sin avisar',
    icono: null,
    chip: 'border-dashed border-muted-foreground text-foreground',
    marca: 'border border-dashed border-muted-foreground text-muted-foreground',
  },
  pendiente: {
    texto: 'Pendiente',
    minuscula: 'pendiente',
    icono: Clock,
    chip: 'border-warning/50 bg-warning/10 text-warning-text',
    marca: 'bg-warning/15 text-warning-text',
  },
  confirmo: {
    texto: 'Confirmó',
    minuscula: 'confirmó',
    icono: Check,
    chip: 'border-success/40 bg-success/10 text-success-text',
    marca: 'bg-success/10 text-success-text',
  },
  no_puede: {
    texto: 'No puede',
    minuscula: 'no puede',
    icono: X,
    chip: 'border-danger/40 bg-danger/10 text-danger-text',
    marca: 'bg-danger/10 text-danger-text',
  },
  quitado: {
    texto: 'Quitado',
    minuscula: 'quitado',
    icono: Minus,
    chip: 'border-border bg-muted text-muted-foreground',
    marca: 'bg-muted text-muted-foreground',
  },
}

/** The pill of a convocado's state (`.st`, 22px). */
export function ChipEstadoAviso({ estado, titulo }: { readonly estado: EstadoAsignacion; readonly titulo?: string }): ReactElement {
  const e = ESTILO_ESTADO[estado]
  const Icono = e.icono
  return (
    <span title={titulo} className={cn('inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-[7px] text-xs font-medium whitespace-nowrap', e.chip)}>
      {Icono ? <Icono aria-hidden="true" className="size-3 stroke-[2.4]" /> : <Punto className="size-3" />}
      {e.texto}
    </span>
  )
}

/** The 16px mark before a name in the sheet (`.mk`); decorative, the cell carries the words. */
export function MarcaEstadoAviso({ estado, className }: { readonly estado: EstadoAsignacion; readonly className?: string }): ReactElement {
  const e = ESTILO_ESTADO[estado]
  const Icono = e.icono
  return (
    <span aria-hidden="true" data-marca-aviso={estado} className={cn('inline-grid size-4 shrink-0 place-items-center rounded-full align-[-3px]', e.marca, className)}>
      {Icono ? <Icono className="size-[11px] stroke-[2.6]" /> : <Punto className="size-2" />}
    </span>
  )
}

/** «Ximena Rangel: no puede · «Viaje familiar»»: the tooltip of a person in the sheet. */
export function textoEstadoPersona(nombre: string, aviso: PersonaEstadoAviso): string {
  const motivo = aviso.estado === 'no_puede' && aviso.motivo ? ` · «${aviso.motivo}»` : ''
  return `${nombre}: ${ESTILO_ESTADO[aviso.estado].minuscula}${motivo}`
}

const FORMATO_RESPUESTA = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Caracas' })

/** «sáb 7 nov»: when someone answered, in Caracas. */
export function fechaRespuesta(instante: string): string {
  const d = new Date(instante)
  if (Number.isNaN(d.getTime())) return ''
  const partes = FORMATO_RESPUESTA.formatToParts(d)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => (partes.find((p) => p.type === tipo)?.value ?? '').replace(/\.$/, '')
  return `${parte('weekday')} ${parte('day')} ${parte('month')}`
}

const ESTADOS_LEYENDA: readonly EstadoAsignacion[] = ['confirmo', 'pendiente', 'no_puede', 'sin_avisar']

/** The legend of the sheet's toolbar (`.leg`). */
export function LeyendaAvisos({ className }: { readonly className?: string }): ReactElement {
  return (
    <ul aria-label="Leyenda de respuestas" className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground', className)}>
      {ESTADOS_LEYENDA.map((e) => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <MarcaEstadoAviso estado={e} />
          {ESTILO_ESTADO[e].texto}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <EtiquetaPlanner tono="neutro">Sin cuenta</EtiquetaPlanner>
        no recibe avisos
      </li>
    </ul>
  )
}

const num = (n: number): ReactElement => <strong className="font-mono font-semibold tabular-nums text-foreground">{n}</strong>

/** The answers of the convocados under the plan's title (`.est`); only the states that have someone. */
export function ResumenRespuestas({ resumen }: { readonly resumen: ResumenAvisos }): ReactElement | null {
  const partes: { clave: string; icono: ReactElement; n: number; texto: string; clase?: string }[] = [
    { clave: 'ok', icono: <Check className="size-3.5 text-success-text" />, n: resumen.confirmo, texto: resumen.confirmo === 1 ? 'confirmado' : 'confirmados' },
    { clave: 'pen', icono: <Clock className="size-3.5 text-warning-text" />, n: resumen.pendiente, texto: resumen.pendiente === 1 ? 'pendiente' : 'pendientes' },
    { clave: 'no', icono: <X className="size-3.5 text-danger-text" />, n: resumen.noPuede, texto: 'no puede', clase: 'text-danger-text' },
    { clave: 'sin', icono: <Punto className="size-3.5 text-muted-foreground" />, n: resumen.sinAvisar, texto: 'sin avisar' },
    { clave: 'cta', icono: <UserX className="size-3.5 text-muted-foreground" />, n: resumen.sinCuenta, texto: 'sin cuenta (no recibe avisos)' },
  ]
  const visibles = partes.filter((p) => p.n > 0)
  if (visibles.length === 0) return null
  return (
    <ul aria-label="Respuestas de los convocados" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      {visibles.map((p) => (
        <li key={p.clave} className={cn('inline-flex items-center gap-1.5', p.clase)}>
          <span aria-hidden="true" className="contents">
            {p.icono}
          </span>
          {num(p.n)} {p.texto}
        </li>
      ))}
    </ul>
  )
}

/**
 * The «No puede» taken out in porEnviar: closed when saving, without a notice
 * (S13.4). They are counted but are not among the personas.
 */
export function cierresAvisos(porEnviar: number, personas: readonly PersonaEstadoAviso[]): number {
  return Math.max(0, porEnviar - personas.filter((p) => p.porEnviar !== null).length)
}

/** «1 invitación · 2 cambios · 1 «Ya no estás programado» · 1 «No puede» sale del plan»: what a send would deliver. */
export function detalleAvisos(personas: readonly PersonaEstadoAviso[], cierres = 0): string {
  const cuenta = (tipo: PersonaEstadoAviso['porEnviar']) => personas.filter((p) => p.porEnviar === tipo).length
  const nuevas = cuenta('nueva')
  const cambios = cuenta('cambio')
  const quitados = cuenta('quitado')
  return [
    nuevas > 0 ? `${nuevas} ${nuevas === 1 ? 'invitación' : 'invitaciones'}` : null,
    cambios > 0 ? `${cambios} ${cambios === 1 ? 'cambio' : 'cambios'}` : null,
    quitados > 0 ? `${quitados} «Ya no estás programado»` : null,
    cierres > 0 ? `${cierres} «No puede» ${cierres === 1 ? 'sale' : 'salen'} del plan` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface BarraAvisosProps {
  readonly porEnviar: number
  /** How many of porEnviar only close a «No puede» (cierresAvisos): no notice goes out for them. */
  readonly cierres?: number
  /** «1 invitación · 1 cambio». */
  readonly detalle: string
  /** « en noviembre»: the sheet names its range. */
  readonly alcance?: string
  readonly nota: string
  readonly onEnviar: () => void
  readonly className?: string
}

/**
 * «N avisos sin enviar» + «Enviar avisos» (`.avb`); the caller shows it only with something to send.
 * When everything pending only closes a «No puede», nobody gets a notice: «N cambios sin guardar» + «Guardar cambios».
 */
export function BarraAvisos({ porEnviar, cierres = 0, detalle, alcance = '', nota, onEnviar, className }: BarraAvisosProps): ReactElement {
  const soloCierres = cierres >= porEnviar
  const sustantivo = soloCierres ? (porEnviar === 1 ? 'cambio' : 'cambios') : porEnviar === 1 ? 'aviso' : 'avisos'
  const estado = soloCierres ? 'sin guardar' : 'sin enviar'
  const titulo = `${porEnviar} ${sustantivo} ${estado}${alcance}`
  return (
    <section
      aria-label={titulo}
      className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border border-border bg-card py-2.5 pr-2.5 pl-3.5 shadow-sheet', className)}
    >
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-text">
        <Bell className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-[15px] font-semibold">
          <span className="font-mono tabular-nums">{porEnviar}</span> {sustantivo} {estado}
          {alcance}
        </p>
        <p className="text-[13px] text-muted-foreground">{[detalle, nota].filter(Boolean).join(' · ')}</p>
      </div>
      <BotonSistema icono={soloCierres ? Check : Send} onClick={onEnviar}>
        {soloCierres ? 'Guardar cambios' : 'Enviar avisos'}
      </BotonSistema>
    </section>
  )
}
