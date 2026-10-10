/**
 * Niños — attendance table of /ninos/reportes (odd/tasks/ninos-checkin.md,
 * N16): one row per Sunday or per calendar month, plus the whole range. Every
 * children figure (total, per service, per area) is the distinct count the
 * server computed for that period; nothing is added up here, so a child who
 * came to both services or on several Sundays counts once. Check-ins are the
 * only column that counts every entry.
 */
import type { ReactElement, ReactNode } from 'react'
import { ChartColumn } from 'lucide-react'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import {
  AREAS,
  NOMBRE_AREA,
  columnasTurno,
  fechaCorta,
  formatoPromedio,
  ninosDeArea,
  ninosDeTurno,
  nombreMes,
  type ConteosPeriodo,
  type Reporte,
  type ResumenPeriodo,
  type VistaAsistencia,
} from '@/lib/platform/ninos/reportes'
import { cn } from '@/lib/utils'

import { EstadoVacio } from './estado-vacio'

export const TH = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
export const TD = 'px-3 py-2 text-sm text-foreground'
/** Focus ring of the report's toggle buttons. */
export const ANILLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const VISTAS: { valor: VistaAsistencia; etiqueta: string }[] = [
  { valor: 'domingo', etiqueta: 'Por domingo' },
  { valor: 'mes', etiqueta: 'Por mes' },
]

/** "Por domingo / Por mes" switch. */
export function SelectorVista({ vista, onCambio }: { vista: VistaAsistencia; onCambio: (v: VistaAsistencia) => void }): ReactElement {
  return (
    <div role="group" aria-label="Agrupar asistencia" className="flex rounded-xl border border-border p-0.5">
      {VISTAS.map((o) => {
        const activa = vista === o.valor
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activa}
            onClick={() => onCambio(o.valor)}
            className={cn(
              'min-h-[44px] rounded-[10px] px-3 text-sm font-medium transition-colors',
              activa ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              ANILLO,
            )}
          >
            {o.etiqueta}
          </button>
        )
      })}
    </div>
  )
}

type Columna = { turno_id: string; turno: string }

/** Children, per service and per area: the cells both views share. */
function celdasNinos(p: ConteosPeriodo, turnos: readonly Columna[], fuerte = false): ReactNode[] {
  return [
    <td key="ninos" className={cn(TD, 'tabular-nums', fuerte && 'font-semibold')}>
      {p.ninos}
    </td>,
    ...turnos.map((t) => (
      <td key={t.turno_id} className={cn(TD, 'tabular-nums')}>
        {ninosDeTurno(p, t.turno_id)}
      </td>
    )),
    ...AREAS.map((a) => (
      <td key={a} className={cn(TD, 'tabular-nums')}>
        {ninosDeArea(p, a)}
      </td>
    )),
  ]
}

/** Service days, average, new children and families: the month-only cells. */
function celdasMes(p: ResumenPeriodo): ReactNode[] {
  return [p.dias, formatoPromedio(p.promedio), p.nuevos, p.familias_nuevas].map((v, i) => (
    <td key={`mes-${i}`} className={cn(TD, 'tabular-nums')}>
      {v}
    </td>
  ))
}

function celdaCheckins(p: ConteosPeriodo): ReactNode {
  return (
    <td key="checkins" className={cn(TD, 'tabular-nums text-muted-foreground')}>
      {p.checkins}
    </td>
  )
}

/** DD/MM of a YYYY-MM-DD date. */
function diaMes(f: string): string {
  return fechaCorta(f).slice(0, 5)
}

type Props = { reporte: Reporte; vista: VistaAsistencia }

/** Attendance per Sunday or per month, with a footer row for the whole range. */
export function TablaAsistencia({ reporte, vista }: Props): ReactElement {
  const { totales } = reporte
  if (reporte.dias.length === 0) {
    return <EstadoVacio icono={ChartColumn} titulo="No hay asistencia en este rango." />
  }

  const porMes = vista === 'mes'
  const turnos = columnasTurno([...(porMes ? reporte.meses : reporte.dias), totales])
  const hayParcial = porMes && reporte.meses.some((m) => m.parcial)

  return (
    <div className="space-y-2">
      <TarjetaSistema className="overflow-x-auto p-0">
        <table className={cn('w-full', porMes ? 'min-w-[48rem]' : 'min-w-[32rem]')}>
          <caption className="sr-only">{porMes ? 'Asistencia por mes' : 'Asistencia por domingo'}</caption>
          <thead className="border-b border-border">
            <tr>
              <th scope="col" className={TH}>
                {porMes ? 'Mes' : 'Fecha'}
              </th>
              <th scope="col" className={TH}>
                Niños
              </th>
              {turnos.map((t) => (
                <th key={t.turno_id} scope="col" className={TH}>
                  {t.turno}
                </th>
              ))}
              {AREAS.map((a) => (
                <th key={a} scope="col" className={TH}>
                  {NOMBRE_AREA[a]}
                </th>
              ))}
              {porMes &&
                ['Domingos', 'Promedio', 'Nuevos', 'Familias nuevas'].map((c) => (
                  <th key={c} scope="col" className={TH}>
                    {c}
                  </th>
                ))}
              <th scope="col" className={TH}>
                Check-ins
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {porMes
              ? reporte.meses.map((m) => (
                  <tr key={m.mes}>
                    <th scope="row" className={cn(TD, 'text-left font-medium')}>
                      <span className="flex flex-wrap items-center gap-2">
                        {nombreMes(m.mes)}
                        {m.parcial && (
                          <BadgeSistema variante="warning" tamaño="sm">
                            Parcial
                          </BadgeSistema>
                        )}
                      </span>
                      {m.parcial && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          Del {diaMes(m.desde)} al {diaMes(m.hasta)}
                        </span>
                      )}
                    </th>
                    {celdasNinos(m, turnos, true)}
                    {celdasMes(m)}
                    {celdaCheckins(m)}
                  </tr>
                ))
              : reporte.dias.map((d) => (
                  <tr key={d.fecha}>
                    <th scope="row" className={cn(TD, 'text-left font-medium')}>
                      {fechaCorta(d.fecha)}
                    </th>
                    {celdasNinos(d, turnos, true)}
                    {celdaCheckins(d)}
                  </tr>
                ))}
          </tbody>
          <tfoot className="border-t-2 border-border">
            <tr>
              <th scope="row" className={cn(TD, 'text-left font-semibold')}>
                Todo el rango
              </th>
              {celdasNinos(totales, turnos, true)}
              {porMes && celdasMes(totales)}
              {celdaCheckins(totales)}
            </tr>
          </tfoot>
        </table>
      </TarjetaSistema>
      <p className="text-xs text-muted-foreground">
        Las cifras cuentan niños distintos: un niño que vino a los dos servicios o varios domingos cuenta una vez en cada
        total. Check-ins cuenta cada ingreso.{hayParcial && ' Parcial: el rango no cubre el mes completo.'}
      </p>
    </div>
  )
}
