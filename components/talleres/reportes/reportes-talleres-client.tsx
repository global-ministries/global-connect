'use client'

/**
 * R3g (odd/tasks/talleres-rediseno.md, S1/S2/S4) — client island of
 * /talleres/reportes, artboard design/talleres-interior/25-reportes-
 * escritorio.html, in the style of Estudiantes › Reportes (docs/design-
 * system/migration.md). Read only.
 *
 * Hero summary (phone: large title), the quick ranges as `GrupoPastillas`,
 * `TabsSistema` Por taller / Por edición / Reportes de grupos, the attention
 * pills of the tab, one `ListaResponsiva` per tab (inset rows on phones) and
 * one read-only `DetalleResponsivo` per row. Range, tab and pill are mirrored
 * into the URL with `history.replaceState` (all data is already loaded).
 *
 * Left out because no existing loader provides it (see reportes-vista.ts):
 * asistencia promedio, aprobadas, abandono, tendencia, ámbito, the grupo's
 * facilitador and Exportar.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { FileText, Search } from 'lucide-react'

import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista, type OrdenLista } from '@/components/ui/lista-responsiva'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { reporteEstadoLabel } from '@/components/talleres/labels'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'
import {
  calcularReportesTalleres,
  fechaCorta,
  fechasEdicion,
  fechasRango,
  filasVisibles,
  rangosReportesTalleres,
  urlReportesTalleres,
  type ConsultaReportes,
  type EdicionReporte,
  type FiltroReportes,
  type ReporteGrupo,
  type TallerReporte,
  type VistaReportes,
} from '@/lib/platform/talleres/reportes-vista'

import { DetalleReportes, nombreGrupo, type SeleccionReporte } from './detalle-reportes'
import { Cifra, EstadoEdicion, EstadoReporte, Num, estadoEdicion, estadoReporte } from './partes-reportes'

export const TITULO_REPORTES = 'Reportes de talleres'

export interface ReportesTalleresClientProps {
  /** YYYY-MM-DD in the church's time zone. */
  readonly hoy: string
  readonly ediciones: readonly EdicionReporte[]
  readonly grupos: readonly ReporteGrupo[]
  readonly consultaInicial: ConsultaReportes
  /**
   * The estado counts of the grupo reports, only for a viewer with
   * verReportes on more than one equipo (T7's breadth rule, unchanged).
   */
  readonly mostrarContadores: boolean
}

type OrdenTalleres = 'inscripciones' | 'ediciones' | 'completaron' | 'certificados' | 'taller'

const COLUMNAS_TALLERES: readonly ColumnaLista[] = [
  { id: 'taller', titulo: 'Taller', ordenable: true, ancho: 'minmax(220px,2fr)' },
  { id: 'ediciones', titulo: 'Ediciones', ordenable: true, ancho: '110px' },
  { id: 'inscripciones', titulo: 'Inscripciones', ordenable: true, ancho: '130px' },
  { id: 'completaron', titulo: 'Completaron', ordenable: true, ancho: '130px' },
  { id: 'certificados', titulo: 'Certificados', ordenable: true, ancho: '130px', ocultarEnTablet: true },
]

const COLUMNAS_EDICIONES: readonly ColumnaLista[] = [
  { id: 'edicion', titulo: 'Edición', ancho: 'minmax(220px,2fr)' },
  { id: 'estado', titulo: 'Estado', ancho: 'minmax(150px,1fr)' },
  { id: 'fechas', titulo: 'Fechas', ancho: 'minmax(150px,1fr)', ocultarEnTablet: true },
  { id: 'inscripciones', titulo: 'Inscripciones', ancho: '120px' },
  { id: 'completaron', titulo: 'Completaron', ancho: '120px' },
  { id: 'certificados', titulo: 'Certificados', ancho: '120px', ocultarEnTablet: true },
]

const COLUMNAS_GRUPOS: readonly ColumnaLista[] = [
  { id: 'grupo', titulo: 'Grupo', ancho: 'minmax(200px,1.4fr)' },
  { id: 'taller', titulo: 'Taller', ancho: 'minmax(180px,1.2fr)' },
  { id: 'estado', titulo: 'Estado', ancho: '150px' },
  { id: 'firmado', titulo: 'Firmado', ancho: '140px', ocultarEnTablet: true },
]

const PIE: Record<VistaReportes, [string, string]> = {
  talleres: ['taller', 'talleres'],
  ediciones: ['edición', 'ediciones'],
  grupos: ['reporte de grupo', 'reportes de grupo'],
}

const ORDEN_PIE: Record<VistaReportes, string> = {
  talleres: '',
  ediciones: 'Orden: la más reciente primero',
  grupos: 'Orden: el más reciente primero',
}

const plural = (n: number, [uno, varios]: [string, string]): string => (n === 1 ? uno : varios)

/** «este año», «últimos 6 meses», «en 2025». */
function textoRango(r: { readonly clave: string; readonly etiqueta: string }): string {
  return r.clave === 'anterior' ? `en ${r.etiqueta}` : r.etiqueta.toLowerCase()
}

function ordenarTalleres(filas: readonly TallerReporte[], orden: OrdenLista): readonly TallerReporte[] {
  const signo = orden.sentido === 'asc' ? 1 : -1
  const valor = (t: TallerReporte): number | string => {
    switch (orden.columna as OrdenTalleres) {
      case 'taller':
        return t.nombre
      case 'ediciones':
        return t.ediciones.length
      case 'completaron':
        return t.completaron ?? -1
      case 'certificados':
        return t.certificados
      default:
        return t.inscripciones
    }
  }
  return [...filas].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    const c = typeof va === 'string' ? va.localeCompare(vb as string, 'es') : va - (vb as number)
    return c * signo || a.nombre.localeCompare(b.nombre, 'es')
  })
}

const TEXTO_ORDEN: Record<OrdenTalleres, string> = {
  taller: 'por nombre',
  ediciones: 'por ediciones',
  inscripciones: 'por inscripciones',
  completaron: 'por completaron',
  certificados: 'por certificados',
}

export function ReportesTalleresClient({
  hoy,
  ediciones,
  grupos,
  consultaInicial,
  mostrarContadores,
}: ReportesTalleresClientProps): ReactElement {
  const [consulta, setConsulta] = useState<ConsultaReportes>(consultaInicial)
  const [ordenTalleres, setOrdenTalleres] = useState<OrdenLista>({ columna: 'inscripciones', sentido: 'desc' })
  const [seleccion, setSeleccion] = useState<SeleccionReporte | null>(null)
  const [abierto, setAbierto] = useState(false)

  const rangos = useMemo(() => rangosReportesTalleres(hoy), [hoy])
  const rango = rangos.find((r) => r.clave === consulta.rango) ?? rangos[0]
  const rangoTexto = `${rango.etiqueta} · ${fechasRango(rango.desde, rango.hasta)}`
  const datos = useMemo(() => calcularReportesTalleres({ ediciones, grupos, rango }), [ediciones, grupos, rango])
  const edicionPorId = useMemo(() => new Map(ediciones.map((e) => [e.id, e])), [ediciones])

  function cambiar(parche: Partial<ConsultaReportes>): void {
    const siguiente = { ...consulta, ...parche }
    setConsulta(siguiente)
    window.history.replaceState(window.history.state, '', urlReportesTalleres(siguiente))
  }

  function abrir(sel: SeleccionReporte): void {
    setSeleccion(sel)
    setAbierto(true)
  }

  const { totales } = datos
  const resumen =
    totales.ediciones > 0 ? (
      <>
        <Num>{totales.inscripciones.toLocaleString('es-VE')}</Num> {totales.inscripciones === 1 ? 'inscripción' : 'inscripciones'} ·{' '}
        <Num>{totales.certificados.toLocaleString('es-VE')}</Num> {totales.certificados === 1 ? 'certificado' : 'certificados'} ·{' '}
        <Num>{totales.ediciones}</Num> {totales.ediciones === 1 ? 'edición' : 'ediciones'} · {textoRango(rango)}
      </>
    ) : (
      `Sin ediciones ${textoRango(rango)}`
    )

  const contadores = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const g of datos.grupos) cuenta.set(g.estado, (cuenta.get(g.estado) ?? 0) + 1)
    return Array.from(cuenta.entries())
  }, [datos.grupos])

  function vacio(vista: VistaReportes, hayFiltro: boolean): ReactElement {
    if (hayFiltro) {
      return (
        <EstadoVacioSistema
          icono={Search}
          titulo="Nada con este filtro"
          subtitulo="Toca de nuevo la pastilla para ver todo."
          accion={
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ filtro: null })}>
              Quitar filtro
            </BotonSistema>
          }
        />
      )
    }
    const otroRango = rangos.find((r) => r.clave !== rango.clave)
    return (
      <EstadoVacioSistema
        icono={FileText}
        titulo={vista === 'grupos' ? 'No hay reportes de grupos en este rango' : 'No hay ediciones en este rango'}
        subtitulo={
          vista === 'grupos'
            ? 'Cada grupo envía su reporte al cerrar su última clase.'
            : 'Aquí aparecen las ediciones de los talleres que puedes ver.'
        }
        accion={
          otroRango ? (
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ rango: otroRango.clave, filtro: null })}>
              Ver {otroRango.clave === 'anterior' ? otroRango.etiqueta : otroRango.etiqueta.toLowerCase()}
            </BotonSistema>
          ) : undefined
        }
      />
    )
  }

  function lista(vista: VistaReportes): ReactElement {
    const filtro = consulta.vista === vista ? consulta.filtro : null
    const { filas, pastillas } = filasVisibles(datos, vista, filtro)
    const contenido =
      vista === 'talleres' ? (
        <ListaResponsiva<TallerReporte>
          etiqueta="Talleres en el rango"
          columnas={COLUMNAS_TALLERES}
          filas={ordenarTalleres(filas as readonly TallerReporte[], ordenTalleres)}
          claveFila={(t) => t.clave}
          orden={ordenTalleres}
          onOrdenar={(columna) =>
            setOrdenTalleres((o) => ({
              columna,
              sentido: o.columna === columna ? (o.sentido === 'asc' ? 'desc' : 'asc') : columna === 'taller' ? 'asc' : 'desc',
            }))
          }
          renderCelda={(t, col) => {
            if (col === 'taller') {
              return (
                <span className="min-w-0">
                  <b className="block truncate text-sm font-semibold text-foreground">{t.nombre}</b>
                  <small className="block truncate text-xs text-muted-foreground">
                    {t.ediciones.map((e) => estadoEdicion(e).etiqueta).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
                  </small>
                </span>
              )
            }
            if (col === 'ediciones') return <Cifra valor={t.ediciones.length} />
            if (col === 'inscripciones') return <Cifra valor={t.inscripciones} />
            if (col === 'completaron') return <Cifra valor={t.completaron} />
            return <Cifra valor={t.certificados} />
          }}
          renderFilaMovil={(t) => ({
            titulo: t.nombre,
            subtitulo: `${t.ediciones.length} ${t.ediciones.length === 1 ? 'edición' : 'ediciones'} · ${t.inscripciones.toLocaleString('es-VE')} inscripciones`,
            meta: (
              <span className="font-mono tabular-nums text-muted-foreground">
                {t.certificados.toLocaleString('es-VE')} cert.
              </span>
            ),
          })}
          onAbrirFila={(t) => abrir({ tipo: 'taller', taller: t })}
          etiquetaFila={(t) => `Abrir ${t.nombre}`}
          vacio={vacio(vista, filtro !== null)}
        />
      ) : vista === 'ediciones' ? (
        <ListaResponsiva<EdicionReporte>
          etiqueta="Ediciones en el rango"
          columnas={COLUMNAS_EDICIONES}
          filas={filas as readonly EdicionReporte[]}
          claveFila={(e) => e.id}
          renderCelda={(e, col) => {
            if (col === 'edicion') {
              return (
                <span className="min-w-0">
                  <b className="block truncate text-sm font-semibold text-foreground">{e.tallerNombre}</b>
                  <small className="block truncate text-xs text-muted-foreground">{e.nombre}</small>
                </span>
              )
            }
            if (col === 'estado') return <EstadoEdicion edicion={e} />
            if (col === 'fechas') return <span className="truncate text-sm text-muted-foreground">{fechasEdicion(e) ?? '—'}</span>
            if (col === 'inscripciones') return <Cifra valor={e.inscripciones} />
            if (col === 'completaron') return <Cifra valor={e.completaron} />
            return <Cifra valor={e.certificados} />
          }}
          renderFilaMovil={(e) => ({
            titulo: e.tallerNombre,
            subtitulo: `${e.nombre} · ${estadoEdicion(e).etiqueta}`,
            meta: (
              <span className="font-mono tabular-nums text-muted-foreground">
                {e.inscripciones.toLocaleString('es-VE')} inscr.
              </span>
            ),
          })}
          onAbrirFila={(e) => abrir({ tipo: 'edicion', edicion: e })}
          etiquetaFila={(e) => `Abrir ${e.tallerNombre}, ${e.nombre}`}
          vacio={vacio(vista, filtro !== null)}
        />
      ) : (
        <ListaResponsiva<ReporteGrupo>
          etiqueta="Reportes finales de cada grupo"
          columnas={COLUMNAS_GRUPOS}
          filas={filas as readonly ReporteGrupo[]}
          claveFila={(g) => g.id}
          renderCelda={(g, col) => {
            const edicion = g.edicionId ? edicionPorId.get(g.edicionId) : undefined
            if (col === 'grupo') return <b className="truncate text-sm font-semibold text-foreground">{nombreGrupo(g)}</b>
            if (col === 'taller') {
              return (
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{g.tallerNombre ?? '—'}</span>
                  {edicion && <small className="block truncate text-xs text-muted-foreground">{edicion.nombre}</small>}
                </span>
              )
            }
            if (col === 'estado') return <EstadoReporte estado={g.estado} />
            return (
              <span className="truncate text-sm text-muted-foreground">
                {g.firmaLiderFecha ? fechaCorta(g.firmaLiderFecha) : '—'}
              </span>
            )
          }}
          renderFilaMovil={(g) => ({
            titulo: nombreGrupo(g),
            subtitulo: g.tallerNombre ?? '—',
            meta: <span className="text-muted-foreground">{estadoReporte(g.estado).etiqueta}</span>,
          })}
          onAbrirFila={(g) => abrir({ tipo: 'grupo', grupo: g, edicion: g.edicionId ? (edicionPorId.get(g.edicionId) ?? null) : null })}
          etiquetaFila={(g) => `Abrir ${nombreGrupo(g)}${g.tallerNombre ? `, ${g.tallerNombre}` : ''}`}
          vacio={vacio(vista, filtro !== null)}
        />
      )

    const orden = vista === 'talleres' ? `Orden: ${TEXTO_ORDEN[ordenTalleres.columna as OrdenTalleres] ?? ''}` : ORDEN_PIE[vista]

    return (
      <div className="space-y-3">
        {pastillas.length > 0 && (
          <GrupoPastillas etiqueta="Necesitan atención">
            {pastillas.map((p) => (
              <PastillaFiltro
                key={p.id}
                etiqueta={p.etiqueta}
                cantidad={p.cantidad}
                activa={filtro === p.id}
                // Single choice; a second tap goes back to all.
                onClick={() => cambiar({ filtro: filtro === p.id ? null : (p.id as FiltroReportes) })}
              />
            ))}
          </GrupoPastillas>
        )}
        {vista === 'grupos' && mostrarContadores && contadores.length > 0 && (
          <p className="px-1 text-[13px] text-muted-foreground">
            {contadores.map(([estado, n], i) => (
              <span key={estado}>
                {i > 0 && ' · '}
                {reporteEstadoLabel(estado)}: <Num>{n}</Num>
              </span>
            ))}
          </p>
        )}
        {contenido}
        {filas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[13px] text-muted-foreground">
            <span role="status">
              <Num>{filas.length}</Num> {plural(filas.length, PIE[vista])}
            </span>
            {orden && <span>{orden}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Phones: back to Talleres and the large title; from md the crumbs and the h1. */}
      <div className="-mt-2 grid gap-1">
        <BotonAtrasMovil atras={{ etiqueta: 'Talleres', href: rutaCatalogo() }} className="-ml-2 justify-self-start md:hidden" />
        <TituloGrande nivel={2} titulo={TITULO_REPORTES} resumen={resumen} />
        <div className="hidden md:block">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{TITULO_REPORTES}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{resumen}</p>
        </div>
      </div>

      <section aria-labelledby="reportes-rango" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 md:px-0">
          <h2 id="reportes-rango" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Rango
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{fechasRango(rango.desde, rango.hasta)}</span>
        </div>
        <GrupoPastillas etiqueta="Rango de fechas">
          {rangos.map((r) => (
            <PastillaFiltro key={r.clave} etiqueta={r.etiqueta} activa={r.clave === rango.clave} onClick={() => r.clave !== rango.clave && cambiar({ rango: r.clave })} />
          ))}
        </GrupoPastillas>
      </section>

      <TabsSistema value={consulta.vista} onValueChange={(v) => cambiar({ vista: v as VistaReportes, filtro: null })}>
        <TabsList aria-label="Ver por" className="flex w-full md:inline-flex md:w-auto">
          <TabsTrigger value="talleres" className="flex-1 gap-1.5 md:flex-none">
            <span className="md:hidden">Talleres</span>
            <span className="hidden md:inline">Por taller</span>
            <span className="font-mono tabular-nums">{datos.talleres.length}</span>
          </TabsTrigger>
          <TabsTrigger value="ediciones" className="flex-1 gap-1.5 md:flex-none">
            <span className="md:hidden">Ediciones</span>
            <span className="hidden md:inline">Por edición</span>
            <span className="font-mono tabular-nums">{datos.ediciones.length}</span>
          </TabsTrigger>
          <TabsTrigger value="grupos" className="flex-1 gap-1.5 md:flex-none">
            <span className="md:hidden">Grupos</span>
            <span className="hidden md:inline">Reportes de grupos</span>
            <span className="font-mono tabular-nums">{datos.grupos.length}</span>
          </TabsTrigger>
        </TabsList>
        {(['talleres', 'ediciones', 'grupos'] as const).map((vista) => (
          <TabsContent key={vista} value={vista}>
            {lista(vista)}
          </TabsContent>
        ))}
      </TabsSistema>

      <section aria-labelledby="reportes-como" className="space-y-1 px-1 text-[13px] text-muted-foreground md:px-0">
        <h2 id="reportes-como" className="text-xs font-medium uppercase tracking-[0.08em]">
          Cómo se cuenta
        </h2>
        <p>
          <b className="text-foreground">Inscripciones:</b> todas las solicitudes de la edición. <b className="text-foreground">Completaron:</b> se cuentan
          al cerrar la edición. <b className="text-foreground">Certificados:</b> los emitidos. Una edición entra en el rango si alguna de sus fechas cae
          dentro.
          {datos.sinFechas > 0 && ` ${datos.sinFechas} ${datos.sinFechas === 1 ? 'edición no tiene fechas y no entra' : 'ediciones no tienen fechas y no entran'} en ningún rango.`}
        </p>
      </section>

      <DetalleReportes seleccion={seleccion} abierto={abierto} onCambioAbierto={setAbierto} rangoTexto={rangoTexto} />
    </>
  )
}
