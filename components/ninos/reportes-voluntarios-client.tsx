'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Download, UserCheck, UserX } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema, SkeletonSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import {
  conFaltasSeguidas,
  csvServiciosVoluntarios,
  csvVoluntarios,
  leerReporteVoluntarios,
  porcentajeAsistencia,
  resumenPorEquipo,
  resumenPorServicio,
  totalVoluntarios,
  urlPestanaReportes,
  type Conteo,
  type ReporteVoluntarios,
} from '@/lib/platform/ninos/reportes-voluntarios'
import { createClient } from '@/lib/supabase/client'

import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import type { FiltrosReporte } from './reportes-client'

type CampusOpcion = { id: string; nombre: string }
type TurnoOpcion = { id: string; nombre: string; campusId: string }

type Props = {
  campus: CampusOpcion[]
  turnos: TurnoOpcion[]
  filtrosIniciales: FiltrosReporte
}

/** YYYY-MM-DD → DD/MM/YYYY. */
function fechaCorta(f: string): string {
  const [a, m, d] = f.split('-')
  return `${d}/${m}/${a}`
}

function mensajeError(message: string | undefined): string {
  if (message?.includes('rango_invalido')) return 'Revisa las fechas: "Desde" debe ser anterior a "Hasta" y el rango no puede pasar de un año.'
  if (message?.includes('sin_autoridad')) return 'No tienes permiso para ver estos reportes.'
  return 'No se pudo cargar el reporte de voluntarios.'
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

const TH = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const TD = 'px-3 py-2 text-sm text-foreground tabular-nums'
const COLUMNAS: { clave: keyof Conteo; etiqueta: string }[] = [
  { clave: 'esperados', etiqueta: 'Esperados' },
  { clave: 'presentes', etiqueta: 'Presentes' },
  { clave: 'avisos', etiqueta: 'Avisó' },
  { clave: 'faltas', etiqueta: 'Faltó' },
  { clave: 'sinMarcar', etiqueta: 'Sin marcar' },
  { clave: 'extras', etiqueta: 'Extras' },
]

function CeldasConteo({ c }: { c: Conteo }) {
  return (
    <>
      {COLUMNAS.map((col) => (
        <td key={col.clave} className={TD}>
          {c[col.clave]}
        </td>
      ))}
    </>
  )
}

function TablaConteos({ cabeceras, filas }: { cabeceras: string[]; filas: { clave: string; celdas: string[]; conteo: Conteo }[] }) {
  return (
    <TarjetaSistema className="overflow-x-auto p-0">
      <table className="w-full min-w-[40rem]">
        <thead className="border-b border-border">
          <tr>
            {cabeceras.map((c) => (
              <th key={c} className={TH}>
                {c}
              </th>
            ))}
            {COLUMNAS.map((c) => (
              <th key={c.clave} className={TH}>
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((f) => (
            <tr key={f.clave}>
              {f.celdas.map((c, i) => (
                <td key={i} className={`${TD} ${i === 0 ? 'font-medium' : ''}`}>
                  {c}
                </td>
              ))}
              <CeldasConteo c={f.conteo} />
            </tr>
          ))}
        </tbody>
      </table>
    </TarjetaSistema>
  )
}

/** Volunteer attendance per service, area and equipo; who keeps missing; CSV exports. */
export function ReportesVoluntariosClient({ campus, turnos, filtrosIniciales }: Props) {
  const router = useRouter()
  const [filtros, setFiltros] = useState<FiltrosReporte>(filtrosIniciales)
  const [reporte, setReporte] = useState<ReporteVoluntarios | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (f: FiltrosReporte) => {
    const { data, error: err } = await createClient().rpc('ninos_reporte_voluntarios', {
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
    setReporte(leerReporteVoluntarios(data))
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
    if (f.campusId && turno && turno.campusId !== f.campusId) f.turnoId = ''
    setFiltros(f)
    setReporte(null)
    router.replace(urlPestanaReportes('voluntarios', f))
  }

  const turnosVisibles = filtros.campusId ? turnos.filter((t) => t.campusId === filtros.campusId) : turnos
  const total = useMemo(() => (reporte ? totalVoluntarios(reporte.servicios) : null), [reporte])
  const porServicio = useMemo(() => (reporte ? resumenPorServicio(reporte.servicios) : []), [reporte])
  const porEquipo = useMemo(() => (reporte ? resumenPorEquipo(reporte.servicios) : []), [reporte])
  const alerta = useMemo(() => (reporte ? conFaltasSeguidas(reporte.voluntarios) : []), [reporte])
  const porcentaje = total ? porcentajeAsistencia(total) : null
  const sufijo = `${filtros.desde}-${filtros.hasta}`

  return (
    <>
      <EncabezadoNinos titulo="Asistencia de voluntarios" subtitulo="Quién sirvió, quién avisó y quién faltó en cada servicio." />

      <TarjetaSistema className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4" aria-label="Filtros">
        <InputSistema
          id="reportes-voluntarios-desde"
          label="Desde"
          type="date"
          value={filtros.desde}
          onChange={(e) => e.target.value && cambiar({ desde: e.target.value })}
        />
        <InputSistema
          id="reportes-voluntarios-hasta"
          label="Hasta"
          type="date"
          value={filtros.hasta}
          onChange={(e) => e.target.value && cambiar({ hasta: e.target.value })}
        />
        <SelectSistema
          id="reportes-voluntarios-campus"
          label="Campus"
          opciones={[{ valor: '', etiqueta: 'Todos' }, ...campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
          value={filtros.campusId}
          onValueChange={(v) => cambiar({ campusId: v })}
        />
        <SelectSistema
          id="reportes-voluntarios-turno"
          label="Servicio"
          opciones={[{ valor: '', etiqueta: 'Todos' }, ...turnosVisibles.map((t) => ({ valor: t.id, etiqueta: t.nombre }))]}
          value={filtros.turnoId}
          onValueChange={(v) => cambiar({ turnoId: v })}
        />
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

      {reporte && total && (
        <div className="space-y-8">
          <section aria-label="Resumen de voluntarios" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { id: 'asistencia', etiqueta: 'Asistencia', valor: porcentaje === null ? '—' : `${porcentaje}%` },
              { id: 'esperados', etiqueta: 'Esperados', valor: total.esperados },
              { id: 'presentes', etiqueta: 'Presentes', valor: total.presentes },
              { id: 'avisos', etiqueta: 'Avisó', valor: total.avisos },
              { id: 'faltas', etiqueta: 'Faltó', valor: total.faltas },
              { id: 'sin-marcar', etiqueta: 'Sin marcar', valor: total.sinMarcar },
            ].map((c) => (
              <TarjetaSistema key={c.id} className="p-4" data-testid={`total-${c.id}`}>
                <p className="text-sm text-muted-foreground">{c.etiqueta}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{c.valor}</p>
              </TarjetaSistema>
            ))}
          </section>
          {total.extras > 0 && (
            <p className="-mt-6 text-xs text-muted-foreground">
              Presentes incluye {total.extras} {total.extras === 1 ? 'voluntario' : 'voluntarios'} que sirvieron sin que les tocara.
            </p>
          )}

          {porServicio.length === 0 ? (
            <EstadoVacio
              icono={UserCheck}
              titulo="No hay asistencia de voluntarios en este rango."
              subtitulo="Los voluntarios sin turno asignado no cuentan como esperados hasta que alguien los marque."
            />
          ) : (
            <>
              <Seccion titulo="Faltan seguido">
                {alerta.length === 0 ? (
                  <EstadoVacio icono={UserX} titulo="Nadie faltó dos servicios seguidos." compacto />
                ) : (
                  <TarjetaSistema className="p-0">
                    <ul className="divide-y divide-border">
                      {alerta.map((v) => (
                        <li key={v.servicio_id} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{v.nombre}</p>
                            <p className="text-sm text-muted-foreground">
                              {v.equipo} · {v.area}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-red-600 dark:text-red-400">
                            {v.faltas_seguidas} faltas seguidas
                          </p>
                        </li>
                      ))}
                    </ul>
                  </TarjetaSistema>
                )}
              </Seccion>

              <Seccion
                titulo="Por servicio"
                acciones={
                  <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    icono={Download}
                    onClick={() => descargarCsv(csvServiciosVoluntarios(reporte.servicios), `ninos-voluntarios-servicios-${sufijo}.csv`)}
                  >
                    Exportar CSV
                  </BotonSistema>
                }
              >
                <TablaConteos
                  cabeceras={['Fecha', 'Servicio']}
                  filas={porServicio.map((s) => ({ clave: `${s.fecha}-${s.turno}`, celdas: [fechaCorta(s.fecha), s.turno], conteo: s }))}
                />
              </Seccion>

              <Seccion titulo="Por equipo">
                <TablaConteos
                  cabeceras={['Equipo', 'Área']}
                  filas={porEquipo.map((e) => ({ clave: `${e.area}-${e.equipo}`, celdas: [e.equipo, e.area], conteo: e }))}
                />
              </Seccion>

              <Seccion
                titulo="Por voluntario"
                acciones={
                  <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    icono={Download}
                    onClick={() => descargarCsv(csvVoluntarios(reporte.voluntarios), `ninos-voluntarios-${sufijo}.csv`)}
                  >
                    Exportar CSV
                  </BotonSistema>
                }
              >
                <TablaConteos
                  cabeceras={['Voluntario', 'Equipo']}
                  filas={reporte.voluntarios.map((v) => ({
                    clave: v.servicio_id,
                    celdas: [v.nombre, v.equipo],
                    conteo: {
                      esperados: v.esperados,
                      presentes: v.presentes,
                      avisos: v.avisos,
                      faltas: v.faltas,
                      sinMarcar: v.sin_marcar,
                      extras: v.extras,
                    },
                  }))}
                />
              </Seccion>
            </>
          )}
        </div>
      )}
    </>
  )
}
