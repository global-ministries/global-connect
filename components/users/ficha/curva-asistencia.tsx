/**
 * The Asistencia tab's curve (prototype `.curva`, 03-ficha-escritorio.html):
 * the 4-week rolling average as a smooth area chart, a dot per week with a
 * meeting (success = attended, warning = attended one of two groups' meetings,
 * muted = absent), the "4 sem · N%" bubble on the last point, and the week
 * strip under it. A plain SVG with a viewBox, so it scales without measuring
 * and renders on the server; colors are tokens; no animation of its own. The
 * tablet and the phone get their own geometry (phone: prototype
 * 04-ficha-celular.html), switched by CSS, so the labels stay readable.
 */
import { useId, type ReactElement } from 'react'

import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'
import { promedioMovil4, type Semana, type Serie } from '@/lib/platform/usuarios/asistencia-vista'

interface Geometria {
  readonly W: number
  readonly H: number
  readonly X0: number
  readonly X1: number
  readonly Y0: number
  readonly Y1: number
  /** At most this many week labels on the x axis. */
  readonly etiquetas: number
}

const ESCRITORIO: Geometria = { W: 1000, H: 230, X0: 44, X1: 988, Y0: 34, Y1: 196, etiquetas: 7 }
const TABLETA: Geometria = { W: 640, H: 220, X0: 42, X1: 628, Y0: 32, Y1: 184, etiquetas: 6 }
const CELULAR: Geometria = { W: 360, H: 210, X0: 38, X1: 350, Y0: 30, Y1: 172, etiquetas: 4 }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const

/** "11 ago". */
export function etiquetaSemana(iso: string): string {
  const [, mes, dia] = iso.split('-').map(Number)
  return `${dia} ${MESES[mes - 1] ?? ''}`
}

export function tonoSemana(v: number | null): TonoEstado | 'none' {
  if (v === null) return 'none'
  if (v === 100) return 'success'
  return v > 0 ? 'warning' : 'muted'
}

const TEXTO_SEMANA: Record<TonoEstado | 'none', string> = {
  none: 'sin reunión',
  success: 'asistió',
  warning: 'asistió a una de sus reuniones',
  muted: 'no asistió',
  info: '',
  danger: '',
}

const FILL_PUNTO: Partial<Record<TonoEstado, string>> = {
  success: 'fill-success stroke-card',
  warning: 'fill-warning stroke-card',
  muted: 'fill-muted stroke-muted-foreground',
}

const FONDO_SEMANA: Record<TonoEstado | 'none', string> = {
  none: 'border border-dashed border-border',
  success: 'bg-success',
  warning: 'bg-warning',
  muted: 'bg-muted',
  info: 'bg-info',
  danger: 'bg-danger',
}

/** Catmull-Rom to cubic Bézier, so the line reads as a trend and not as steps. */
function trazo(pts: readonly (readonly [number, number])[], { Y0, Y1 }: Geometria): string {
  const lim = (v: number) => Math.min(Y1, Math.max(Y0, v))
  return pts
    .map((p, k) => {
      if (k === 0) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`
      const a = pts[k - 2] ?? pts[k - 1]
      const b = pts[k - 1]
      const e = pts[k + 1] ?? p
      const c1 = `${(b[0] + (p[0] - a[0]) / 6).toFixed(1)} ${lim(b[1] + (p[1] - a[1]) / 6).toFixed(1)}`
      const c2 = `${(p[0] - (e[0] - b[0]) / 6).toFixed(1)} ${lim(p[1] - (e[1] - b[1]) / 6).toFixed(1)}`
      return `C${c1} ${c2} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
    })
    .join('')
}

interface SvgCurvaProps {
  readonly geo: Geometria
  readonly serie: Serie
  readonly semanas: readonly Semana[]
  readonly className: string
}

function SvgCurva({ geo, serie, semanas, className }: SvgCurvaProps): ReactElement {
  const { W, H, X0, X1, Y0, Y1 } = geo
  const idGradiente = useId().replace(/:/g, '')
  const promedio = promedioMovil4(serie)
  const n = semanas.length
  const x = (i: number) => (n <= 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (n - 1))
  const y = (v: number) => Y1 - (v / 100) * (Y1 - Y0)
  const puntos = promedio.flatMap((v, i) => (v === null ? [] : [{ i, px: x(i), py: y(v), v }]))
  const linea = trazo(
    puntos.map((p) => [p.px, p.py] as const),
    geo,
  )
  const ultimo = puntos[puntos.length - 1]
  const area = ultimo ? `${linea}L${ultimo.px.toFixed(1)} ${Y1}L${puntos[0].px.toFixed(1)} ${Y1}Z` : ''
  const asistio = serie.filter((v) => v === 100).length
  const conReunion = serie.filter((v) => v !== null).length
  const paso = Math.max(1, Math.ceil(n / geo.etiquetas))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Asistencia por semana: asistió completa ${asistio} de ${conReunion} semanas con reunión; promedio de las últimas 4 semanas ${ultimo?.v ?? 0}%`}
      className={cn('block h-auto w-full overflow-visible', className)}
    >
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-strong)" stopOpacity={0.28} />
          <stop offset="1" stopColor="var(--brand-strong)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 5" />
          <text x={X0 - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">{`${v}%`}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${idGradiente})`} />
      <path d={linea} fill="none" className="stroke-brand-strong" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {puntos.map((p, k) => {
        const tono = tonoSemana(serie[p.i])
        return (
          <circle
            key={p.i}
            cx={p.px.toFixed(1)}
            cy={p.py.toFixed(1)}
            r={k === puntos.length - 1 ? 6 : 4}
            strokeWidth={tono === 'muted' ? 1.5 : 2.5}
            className={FILL_PUNTO[tono as TonoEstado]}
          >
            <title>{`${etiquetaSemana(semanas[p.i].fin)}: ${TEXTO_SEMANA[tono]} · promedio ${p.v}%`}</title>
          </circle>
        )
      })}
      {ultimo && (
        <g transform={`translate(${Math.min(Math.max(ultimo.px, X0 + 52), X1 - 52)} ${Math.max(ultimo.py - 34, 2)})`}>
          <rect x={-52} y={0} width={104} height={24} rx={12} className="fill-foreground" />
          <text x={0} y={16} textAnchor="middle" className="fill-background text-[12px] font-semibold tabular-nums">
            {`4 sem · ${ultimo.v}%`}
          </text>
        </g>
      )}
      {semanas.map((s, i) =>
        i % paso === 0 ? (
          <text key={s.fin} x={x(i).toFixed(1)} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[12px]">
            {etiquetaSemana(s.fin)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

export function CurvaAsistencia({ serie, semanas }: { readonly serie: Serie; readonly semanas: readonly Semana[] }): ReactElement {
  const n = semanas.length
  const hayMixtas = serie.some((v) => v !== null && v > 0 && v < 100)
  return (
    <figure className="m-0 grid gap-3">
      <SvgCurva geo={ESCRITORIO} serie={serie} semanas={semanas} className="max-lg:hidden" />
      <SvgCurva geo={TABLETA} serie={serie} semanas={semanas} className="max-md:hidden lg:hidden" />
      <SvgCurva geo={CELULAR} serie={serie} semanas={semanas} className="md:hidden" />
      <ol aria-label="Detalle por semana" className="m-0 grid list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` }}>
        {serie.map((v, i) => {
          const tono = tonoSemana(v)
          return (
            <li key={semanas[i]?.fin ?? i} className={cn('h-2 rounded-full', FONDO_SEMANA[tono])}>
              <span className="sr-only">{`${etiquetaSemana(semanas[i]?.fin ?? '')}: ${TEXTO_SEMANA[tono]}`}</span>
            </li>
          )
        })}
      </ol>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-brand-strong ring-4 ring-brand/20" />
          Promedio de 4 semanas
        </span>
        <PuntoEstado tono="success" etiqueta="Asistió" />
        {hayMixtas && <PuntoEstado tono="warning" etiqueta="Asistió a una de sus reuniones" />}
        <PuntoEstado tono="muted" etiqueta="No asistió" />
      </figcaption>
    </figure>
  )
}
