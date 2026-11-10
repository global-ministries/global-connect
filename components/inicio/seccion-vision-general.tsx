/**
 * «Visión general» (design/home-por-rol section 5; odd/tasks/home-por-rol.md
 * T4): only admin and pastor, the campus. Metrics (Personas, Nuevos,
 * Grupos, Dream Team), the Grupos de Vida attendance of the last 8 weeks as
 * a sparkline, and «Requiere atención». Phone: one column; from lg the trend
 * and the list side by side.
 *
 * Server-safe: no hooks, no handlers.
 */
import type { ReactElement, ReactNode } from 'react'
import { AlertTriangle, HandHeart, House } from 'lucide-react'

import { TarjetaSistema } from '@/components/ui/sistema-diseno'

import { ListaFilas, type FilaInicio } from './lista-filas'
import { MetricasInicio, type MetricaInicio } from './metricas-inicio'
import { EncabezadoSeccion, EnlaceSeccion, Numero } from './partes-inicio'
import { listaNombres, PENDIENTES, RUTA_REPORTE_SEMANAL, RUTA_TABLERO_GRUPOS } from './textos-inicio'

export type DatosVisionGeneral = {
  personas: number | null
  nuevos: number | null
  grupos: number | null
  /** Last week's Grupos de Vida attendance %. */
  asistencia: number | null
  /** Activo servicios of Dream Team. */
  dreamTeam: number | null
  /** % per week, oldest first (up to 8). */
  tendencia: number[]
  gruposEnRiesgo: { grupoId: string; nombre: string; asistencia: number | null }[]
  gruposSinCasa: number
  postulados: number | null
}

const ANCHO = 300
const ALTO = 56

/** Line and area of the sparkline, scaled to its own range. */
function trazo(puntos: number[]): { linea: string; area: string } {
  const max = Math.max(...puntos)
  const min = Math.min(...puntos) - 5
  const rango = max - min || 1
  const xy = puntos.map((y, i) => [Math.round((i * ANCHO) / Math.max(1, puntos.length - 1)), Math.round(ALTO - 4 - ((y - min) / rango) * (ALTO - 10))])
  const linea = `M${xy.map((p) => p.join(',')).join(' L')}`
  return { linea, area: `${linea} L${ANCHO},${ALTO} L0,${ALTO} Z` }
}

function Tendencia({ puntos, grupos }: { readonly puntos: number[]; readonly grupos: number | null }): ReactElement {
  const ultimo = puntos[puntos.length - 1]
  const { linea, area } = trazo(puntos)
  return (
    <TarjetaSistema className="p-4 md:p-5">
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground">Asistencia a grupos de vida</h3>
        <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{ultimo}%</span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Últimas <Numero>{puntos.length}</Numero> semanas
        {grupos !== null && (
          <>
            {' · '}
            <Numero>{grupos}</Numero> grupos activos
          </>
        )}
      </p>
      <svg
        role="img"
        aria-label={`Asistencia de ${puntos[0]}% a ${ultimo}% en ${puntos.length} semanas`}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        className="mt-3 block h-14 w-full"
      >
        <path d={area} className="fill-brand-tint" />
        <path d={linea} className="fill-none stroke-brand" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </TarjetaSistema>
  )
}

function filasAtencion(d: DatosVisionGeneral): FilaInicio[] {
  const filas: FilaInicio[] = []
  if (d.gruposEnRiesgo.length > 0) {
    const n = d.gruposEnRiesgo.length
    filas.push({
      clave: 'riesgo',
      titulo: `${n} ${n === 1 ? 'grupo' : 'grupos'} con asistencia baja`,
      detalle: listaNombres(d.gruposEnRiesgo.slice(0, 3).map((g) => g.nombre)),
      icono: AlertTriangle,
      tono: 'danger',
      href: RUTA_TABLERO_GRUPOS,
    })
  }
  if (d.gruposSinCasa > 0) {
    filas.push({
      clave: 'sin-casa',
      titulo: `${d.gruposSinCasa} ${d.gruposSinCasa === 1 ? 'grupo' : 'grupos'} sin casa anfitriona`,
      detalle: PENDIENTES['grupos-sin-casa'].detalle,
      icono: House,
      tono: 'warning',
      href: PENDIENTES['grupos-sin-casa'].href,
    })
  }
  if (d.postulados) {
    filas.push({
      clave: 'postulados',
      titulo: `${d.postulados} ${d.postulados === 1 ? 'servidor postulado' : 'servidores postulados'}`,
      detalle: 'Esperan orientación',
      icono: HandHeart,
      tono: 'info',
      href: PENDIENTES['dream-team'].href,
    })
  }
  return filas
}

export function SeccionVisionGeneral({ datos, className, children }: { readonly datos: DatosVisionGeneral; readonly className?: string; readonly children?: ReactNode }): ReactElement {
  const metricas: MetricaInicio[] = [
    { id: 'personas', etiqueta: 'Personas', valor: datos.personas, tono: 'muted' },
    { id: 'nuevos', etiqueta: 'Nuevos', valor: datos.nuevos, total: datos.personas ?? undefined, tono: 'info', pista: 'Últimos 30 días' },
    {
      id: 'grupos',
      etiqueta: 'Grupos',
      valor: datos.grupos,
      tono: 'success',
      pista: datos.asistencia !== null ? `${datos.asistencia}% de asistencia` : undefined,
    },
    { id: 'dream-team', etiqueta: 'Dream Team', valor: datos.dreamTeam, tono: 'success', pista: 'Servidores activos' },
  ]
  const atencion = filasAtencion(datos)
  const conTendencia = datos.tendencia.length >= 2

  return (
    <section aria-labelledby="inicio-vision-general" className={className}>
      <EncabezadoSeccion id="inicio-vision-general" titulo="Visión general">
        <EnlaceSeccion href={RUTA_REPORTE_SEMANAL}>Reportes</EnlaceSeccion>
      </EncabezadoSeccion>
      <MetricasInicio metricas={metricas} etiqueta="Métricas del campus" />
      {(conTendencia || atencion.length > 0) && (
        <div className="mt-2.5 grid gap-2.5 md:mt-3 md:gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {conTendencia && <Tendencia puntos={datos.tendencia} grupos={datos.grupos} />}
          {atencion.length > 0 && <ListaFilas id="inicio-vision-atencion" titulo="Requiere atención" filas={atencion} />}
        </div>
      )}
      {children && <div className="mt-6 space-y-6">{children}</div>}
    </section>
  )
}
