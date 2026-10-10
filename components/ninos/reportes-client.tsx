'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChartColumn, Download, UserMinus, UserPlus } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  InputSistema,
  SelectSistema,
  SkeletonSistema,
  TarjetaSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import {
  NOMBRE_AREA,
  csvSalones,
  familiasPorEstado,
  fechaCorta,
  formatoPromedio,
  leerReporte,
  rangosRapidos,
  usoPico,
  type Reporte,
  type VistaAsistencia,
} from '@/lib/platform/ninos/reportes'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import { ANILLO, SelectorVista, TablaAsistencia, TD, TH } from './reportes-asistencia'
import { FamiliasNuevas } from './reportes-familias'

export type FiltrosReporte = { desde: string; hasta: string; campusId: string; turnoId: string }
type CampusOpcion = { id: string; nombre: string }
type TurnoOpcion = { id: string; nombre: string; campusId: string }

type Props = {
  campus: CampusOpcion[]
  turnos: TurnoOpcion[]
  filtrosIniciales: FiltrosReporte
  /** Today in Caracas (YYYY-MM-DD), for the quick ranges. */
  hoy: string
  vistaInicial?: VistaAsistencia
}

function urlReportes(f: FiltrosReporte, vista: VistaAsistencia): string {
  const q = new URLSearchParams({ desde: f.desde, hasta: f.hasta })
  if (f.campusId) q.set('campus', f.campusId)
  if (f.turnoId) q.set('turno', f.turnoId)
  if (vista === 'mes') q.set('vista', 'mes')
  return `/ninos/reportes?${q.toString()}`
}

function mensajeError(message: string | undefined): string {
  if (message?.includes('rango_invalido')) return 'Revisa las fechas: "Desde" debe ser anterior a "Hasta" y el rango no puede pasar de un año.'
  if (message?.includes('sin_autoridad')) return 'No tienes permiso para ver estos reportes.'
  return 'No se pudo cargar el reporte.'
}

function descargarCsv(contenido: string, nombre: string) {
  // BOM so spreadsheet apps read the accents as UTF-8.
  const blob = new Blob(['﻿', contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

function Seccion({ titulo, acciones, children }: { titulo: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloSistema nivel={3}>{titulo}</TituloSistema>
        {acciones}
      </div>
      {children}
    </section>
  )
}

function Cifra({ etiqueta, valor, detalle }: { etiqueta: string; valor: number | string; detalle?: string }) {
  return (
    <TarjetaSistema role="group" aria-label={etiqueta} className="p-4">
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </TarjetaSistema>
  )
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Attendance per Sunday or month, service, area and room; new families and children who stopped coming. */
export function ReportesClient({ campus, turnos, filtrosIniciales, hoy, vistaInicial = 'domingo' }: Props) {
  const router = useRouter()
  const [filtros, setFiltros] = useState<FiltrosReporte>(filtrosIniciales)
  const [vista, setVista] = useState<VistaAsistencia>(vistaInicial)
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (f: FiltrosReporte) => {
    const { data, error: err } = await createClient().rpc('ninos_reporte_asistencia', {
      p_desde: f.desde,
      p_hasta: f.hasta,
      ...(f.campusId ? { p_campus_id: f.campusId } : {}),
      ...(f.turnoId ? { p_turno_id: f.turnoId } : {}),
    })
    if (err) {
      setError(mensajeError(err.message))
      setReporte(null)
      return
    }
    setError(null)
    setReporte(leerReporte(data))
  }, [])

  useEffect(() => {
    // Fetch on mount and on filter change; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar(filtros)
  }, [cargar, filtros])

  function cambiar(parcial: Partial<FiltrosReporte>) {
    const f = { ...filtros, ...parcial }
    // A service belongs to one campus: drop it when the campus changes.
    const turno = turnos.find((t) => t.id === f.turnoId)
    if (f.campusId && turno && turno.campusId !== f.campusId) {
      f.turnoId = ''
    }
    setFiltros(f)
    setReporte(null)
    router.replace(urlReportes(f, vista))
  }

  function cambiarVista(v: VistaAsistencia) {
    // Both views come in the same report: no reload.
    setVista(v)
    router.replace(urlReportes(filtros, v))
  }

  const turnosVisibles = filtros.campusId ? turnos.filter((t) => t.campusId === filtros.campusId) : turnos
  const rapidos = useMemo(() => rangosRapidos(hoy), [hoy])
  const familias = useMemo(() => (reporte ? familiasPorEstado(reporte.nuevos) : null), [reporte])

  return (
    <>
      <EncabezadoNinos titulo="Reportes de asistencia" subtitulo="Asistencia por domingo y por mes, servicio, área y salón." />

      <TarjetaSistema className="space-y-3 p-4" aria-label="Filtros">
        <div role="group" aria-label="Rangos rápidos" className="flex flex-wrap gap-2">
          {rapidos.map((r) => {
            const activo = filtros.desde === r.desde && filtros.hasta === r.hasta
            return (
              <button
                key={r.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => cambiar({ desde: r.desde, hasta: r.hasta })}
                className={cn(
                  'min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors',
                  activo
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-accent-strong)] text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  ANILLO,
                )}
              >
                {r.etiqueta}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InputSistema
            id="reportes-desde"
            label="Desde"
            type="date"
            value={filtros.desde}
            onChange={(e) => e.target.value && cambiar({ desde: e.target.value })}
          />
          <InputSistema
            id="reportes-hasta"
            label="Hasta"
            type="date"
            value={filtros.hasta}
            onChange={(e) => e.target.value && cambiar({ hasta: e.target.value })}
          />
          <SelectSistema
            id="reportes-campus"
            label="Campus"
            opciones={[{ valor: '', etiqueta: 'Todos' }, ...campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
            value={filtros.campusId}
            onValueChange={(v) => cambiar({ campusId: v })}
          />
          <SelectSistema
            id="reportes-turno"
            label="Servicio"
            opciones={[{ valor: '', etiqueta: 'Todos' }, ...turnosVisibles.map((t) => ({ valor: t.id, etiqueta: t.nombre }))]}
            value={filtros.turnoId}
            onValueChange={(v) => cambiar({ turnoId: v })}
          />
        </div>
      </TarjetaSistema>

      {error && (
        <p role="alert" className="text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}

      {!reporte && !error && (
        <TarjetaSistema className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <SkeletonSistema key={i} alto="40px" />
          ))}
        </TarjetaSistema>
      )}

      {reporte && familias && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra etiqueta="Niños distintos" valor={reporte.totales.ninos} detalle={plural(reporte.totales.checkins, 'check-in', 'check-ins')} />
            <Cifra
              etiqueta="Promedio por domingo"
              valor={formatoPromedio(reporte.totales.promedio)}
              detalle={plural(reporte.totales.dias, 'domingo con asistencia', 'domingos con asistencia')}
            />
            <Cifra
              etiqueta="Familias nuevas"
              valor={reporte.totales.familias_nuevas}
              detalle={`${plural(reporte.totales.nuevos, 'niño nuevo', 'niños nuevos')} · ${plural(familias.volvio.length, 'familia volvió', 'familias volvieron')}`}
            />
            <Cifra
              etiqueta="Dejaron de venir"
              valor={reporte.ausentes.length}
              detalle={reporte.domingo_referencia ? `Sin venir desde el ${fechaCorta(reporte.domingo_referencia)} y el domingo anterior` : undefined}
            />
          </div>

          <Seccion titulo="Asistencia" acciones={<SelectorVista vista={vista} onCambio={cambiarVista} />}>
            <TablaAsistencia reporte={reporte} vista={vista} />
          </Seccion>

          <Seccion
            titulo="Por salón"
            acciones={
              reporte.salones.length > 0 && (
                <BotonSistema
                  variante="outline"
                  tamaño="sm"
                  icono={Download}
                  onClick={() => descargarCsv(csvSalones(reporte.salones), `ninos-salones-${filtros.desde}-${filtros.hasta}.csv`)}
                >
                  Exportar CSV
                </BotonSistema>
              )
            }
          >
            {reporte.salones.length === 0 ? (
              <EstadoVacio icono={ChartColumn} titulo="No hay salones con asistencia en este rango." compacto />
            ) : (
              <>
                {/* Phones: one card per room and service. */}
                <ul className="space-y-3 md:hidden">
                  {reporte.salones.map((f) => (
                    <li key={`${f.fecha}-${f.turno_id}-${f.salon_id}`}>
                      <TarjetaSistema className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{f.salon}</p>
                          <p className="text-sm text-muted-foreground">
                            {fechaCorta(f.fecha)} · {f.turno} · {NOMBRE_AREA[f.area]}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-bold tabular-nums">{f.ninos}</p>
                          <UsoBadge pico={f.pico} capacidad={f.capacidad} />
                        </div>
                      </TarjetaSistema>
                    </li>
                  ))}
                </ul>
                {/* Tablet and desktop: table. */}
                <TarjetaSistema className="hidden overflow-x-auto p-0 md:block">
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Servicio</th>
                        <th className={TH}>Área</th>
                        <th className={TH}>Salón</th>
                        <th className={TH}>Niños</th>
                        <th className={TH}>Pico / capacidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reporte.salones.map((f) => (
                        <tr key={`${f.fecha}-${f.turno_id}-${f.salon_id}`}>
                          <td className={TD}>{fechaCorta(f.fecha)}</td>
                          <td className={TD}>{f.turno}</td>
                          <td className={TD}>{NOMBRE_AREA[f.area]}</td>
                          <td className={`${TD} font-medium`}>{f.salon}</td>
                          <td className={`${TD} tabular-nums`}>{f.ninos}</td>
                          <td className={TD}>
                            <UsoBadge pico={f.pico} capacidad={f.capacidad} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TarjetaSistema>
              </>
            )}
          </Seccion>

          <div className="space-y-8 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
            <Seccion titulo="Familias nuevas">
              {reporte.nuevos.length === 0 ? (
                <EstadoVacio icono={UserPlus} titulo="No hubo familias nuevas en este rango." compacto />
              ) : (
                <FamiliasNuevas nuevos={reporte.nuevos} />
              )}
            </Seccion>
            <Seccion titulo="Dejaron de venir">
              {reporte.ausentes.length === 0 ? (
                <EstadoVacio icono={UserMinus} titulo="Nadie dejó de venir." subtitulo="Vinieron 2 de los 4 domingos anteriores y faltaron los 2 últimos." compacto />
              ) : (
                <ListaPersonas
                  filas={reporte.ausentes.map((n) => ({
                    id: n.nino_id,
                    nombre: n.nombre,
                    detalle: `Vino ${n.veces} de 4 domingos · último: ${fechaCorta(n.ultima_fecha)} · ${n.salon}`,
                    padres: n.padres,
                  }))}
                />
              )}
            </Seccion>
          </div>
        </div>
      )}
    </>
  )
}

function UsoBadge({ pico, capacidad }: { pico: number; capacidad: number }) {
  const uso = usoPico({ pico, capacidad })
  return (
    <BadgeSistema variante={uso > 100 ? 'error' : uso >= 90 ? 'warning' : 'default'} tamaño="sm" className="tabular-nums">
      {pico}/{capacidad} · {uso}%
    </BadgeSistema>
  )
}

function ListaPersonas({ filas }: { filas: { id: string; nombre: string; detalle: string; padres: string[] }[] }) {
  return (
    <TarjetaSistema className="p-0">
      <ul className="divide-y divide-border">
        {filas.map((f) => (
          <li key={f.id} className="space-y-0.5 px-4 py-3">
            <p className="font-medium text-foreground">{f.nombre}</p>
            <p className="text-sm text-muted-foreground">{f.detalle}</p>
            <p className="text-sm text-muted-foreground">{f.padres.length ? `Padres: ${f.padres.join(', ')}` : 'Sin padres vinculados'}</p>
          </li>
        ))}
      </ul>
    </TarjetaSistema>
  )
}
