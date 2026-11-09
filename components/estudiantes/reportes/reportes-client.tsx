'use client'

/**
 * Estudiantes › Reportes — client island of /estudiantes/reportes, "Reportes
 * de asistencia" (C6d3 of odd/tasks/estudiantes-fase-b.md, S17–S20, L48,
 * L49), in the planning style of odd/tasks/estudiantes-estilo-dps.md (S7;
 * artboards 15 desktop and 16 phone of design/estudiantes-dps, C27–C37).
 * Read only.
 *
 * Desktop (`MarcoAlcance`): breadcrumbs "Estudiantes › Reportes"; the header
 * band with "Barquisimeto · Transit · 8 sep – 2 nov · N grupos · N reuniones
 * · N% de asistencia" and the range pill, always in sight (B3, D7); the
 * «barra de alcance» with the Ámbito (one always chosen, with its % and
 * flags; hidden with a single ámbito, A26), the Sub-área and the «Embudo de
 * conexión» of today (GR1); the toolbar (Grupos N | Personas N, search,
 * «Columnas», Condensado | Normal); the attention pills; the dense table;
 * the footer line. A row, a funnel step or a member opens the read-only
 * panel (detalle-reporte.tsx), docked from 1280px; the 640px person card of
 * The Living Room folds the bar while it is open (D9).
 *
 * Phone: "‹ Estudiantes" + Filtros (Desde / Hasta, Sub-área, orden), the
 * large title, the search, the quick ranges as pills, the ámbitos as a
 * grouped list, the funnel as three cards, the tabs, the pills and the rows.
 *
 * The Living Room adds its 4 connections (C7c, S21): the Personas columns
 * (the Grupo under the name, D8) and the «Sin 1:1 en 2 meses» pill when the
 * page could load them, and the «Conexiones» cards in the person panel.
 *
 * The ámbito, sub-área and range reload the page data (`router.replace`);
 * the tab, pill, sort, search and open drawer stay local and are mirrored
 * into the URL with `history.replaceState`. Every rule lives in
 * lib/platform/estudiantes/reportes.ts.
 */
import { useMemo, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarX, Check, Search, UsersRound } from 'lucide-react'

import { BadgeSistema, BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { cn } from '@/lib/utils'
import {
  FILTROS_REPORTES,
  ORDENES_GRUPOS,
  ORDENES_PERSONAS,
  calcularVistaReportes,
  fechaDia,
  fechaRango,
  pasosEmbudo,
  textoPorcentaje,
  rangosReportes,
  resumenReporte,
  urlReportes,
  type CampusReporte,
  type DetalleUrl,
  type Embudo,
  type FiltrosReportes,
  type RangoReporte,
  type ReporteAsistencia,
  type TabReportes,
  type TarjetaAmbitoReporte,
} from '@/lib/platform/estudiantes/reportes'

import { resumenesConexiones, type ReporteConexiones } from '@/lib/platform/estudiantes/conexiones'

import { BarraAlcance, FilaAlcance, SeccionAlcance } from '../alcance/barra-alcance'
import { BuscadorBarra, DENSIDADES, MenuColumnas } from '../alcance/herramientas-tabla'
import { MarcoAlcance } from '../alcance/marco-alcance'
import { useAcoplado } from '../alcance/panel-acoplado'
import { PastillaRango } from '../alcance/pastilla-rango'
import { RegionTabla, type Densidad } from '../alcance/tabla-densa'
import { DetalleReporte, type PilaReporte } from './detalle-reporte'
import { EmbudoConexion } from './embudo-conexion'
import { FechasPropias, HojaFiltrosReportes } from './filtros-reportes'
import {
  COLUMNAS_TABLA_CONEXIONES,
  COLUMNAS_TABLA_GRUPOS,
  COLUMNAS_TABLA_PERSONAS,
  ListaGruposReporte,
  ListaPersonasReporte,
  TablaGruposReporte,
  TablaPersonasReporte,
} from './listas-reporte'
import { BarraPorcentaje, MigasReportes } from './partes-reportes'

const TITULO = 'Reportes de asistencia'
const CLASE_H2 = 'text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'

export type ContenidoReportes = { readonly tipo: 'reporte'; readonly reporte: ReporteAsistencia } | { readonly tipo: 'error'; readonly mensaje: string }

export interface ReportesClientProps {
  /** Campuses the caller may report on, by name. */
  readonly campus: readonly CampusReporte[]
  readonly campusId: string
  /** The ámbito cards, Transit → Inside Out → The Living Room (S20). */
  readonly ambitos: readonly TarjetaAmbitoReporte[]
  readonly ambitoId: string
  readonly subareaId: string | null
  readonly rango: RangoReporte
  readonly hoy: string
  readonly contenido: ContenidoReportes
  readonly embudo: Embudo | null
  readonly errorEmbudo?: string | null
  readonly filtrosIniciales?: FiltrosReportes
  readonly detalleInicial?: DetalleUrl | null
  /** The selected ámbito is The Living Room (S21). */
  readonly livingRoom?: boolean
  /** Its connections for the list; `null` when the call failed (fail soft) or elsewhere. */
  readonly conexiones?: ReporteConexiones | null
}

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

/** The % of an ámbito with its GR4 bar, under its name in the bar or the phone list. */
function PorcentajeAmbito({ porcentaje }: { readonly porcentaje: number | null }): ReactElement {
  if (porcentaje === null) return <span className="text-xs text-muted-foreground">Sin reuniones en el rango</span>
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <strong className="font-mono font-semibold tabular-nums text-foreground">{Math.round(porcentaje)}%</strong>
      <BarraPorcentaje porcentaje={porcentaje} className="w-14 shrink-0" />
      de asistencia
    </span>
  )
}

function pilaInicial(detalle: DetalleUrl | null | undefined): PilaReporte | null {
  if (detalle?.grupoId) return { vista: { tipo: 'grupo', grupoId: detalle.grupoId }, volver: null }
  if (detalle?.personaId) return { vista: { tipo: 'persona', personaId: detalle.personaId }, volver: null }
  return null
}

export function ReportesClient({
  campus,
  campusId,
  ambitos,
  ambitoId,
  subareaId,
  rango,
  hoy,
  contenido,
  embudo,
  errorEmbudo = null,
  filtrosIniciales = FILTROS_REPORTES,
  detalleInicial = null,
  livingRoom = false,
  conexiones = null,
}: ReportesClientProps): ReactElement {
  const router = useRouter()
  const escritorio = useEsEscritorio()
  const acoplado = useAcoplado()
  const [pendiente, empezar] = useTransition()
  const [filtros, setFiltros] = useState<FiltrosReportes>(filtrosIniciales)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [pila, setPila] = useState<PilaReporte | null>(() => pilaInicial(detalleInicial))
  const [abierto, setAbierto] = useState(() => pilaInicial(detalleInicial) !== null)
  // A fresh panel per opening (its first view keeps the panel's focus).
  const [apertura, setApertura] = useState(0)
  const [ocultas, setOcultas] = useState<Readonly<Record<TabReportes, ReadonlySet<string>>>>({ grupos: new Set(), personas: new Set() })
  const [densidad, setDensidad] = useState<Densidad>('normal')

  const reporte = contenido.tipo === 'reporte' ? contenido.reporte : null
  const nombreCampus = campus.find((c) => c.id === campusId)?.nombre ?? ''
  const ambito = ambitos.find((a) => a.id === ambitoId)
  const nombreAmbito = ambito?.nombre ?? ''
  const subareas = reporte?.subareas ?? []
  // A fixed scope (the entrenadora's sub-área) or the filter names the sub-área.
  const subareaFija = subareas.length === 1 ? subareas[0].label : (subareas.find((s) => s.subareaId === subareaId)?.label ?? null)
  const alcance = [nombreAmbito, subareaFija].filter(Boolean).join(' · ')

  const resumenes = useMemo(() => (livingRoom && conexiones ? resumenesConexiones(conexiones) : null), [livingRoom, conexiones])
  const conConexiones = resumenes !== null
  const vista = useMemo(() => (reporte ? calcularVistaReportes({ reporte, filtros, conexiones: resumenes }) : null), [reporte, filtros, resumenes])
  const pasos = useMemo(() => (embudo ? pasosEmbudo(embudo) : []), [embudo])

  const consulta = { campusId: campus.length > 1 ? campusId : null, ambitoId, subareaId, rango }
  const detalleUrl = (p: PilaReporte | null, abiertoAhora: boolean): DetalleUrl | null =>
    p && abiertoAhora && p.vista.tipo !== 'etapa'
      ? { grupoId: p.vista.tipo === 'grupo' ? p.vista.grupoId : null, personaId: p.vista.tipo === 'persona' ? p.vista.personaId : null }
      : null

  function reemplazarUrl(siguientes: FiltrosReportes, p: PilaReporte | null, abiertoAhora: boolean): void {
    window.history.replaceState(window.history.state, '', urlReportes(consulta, siguientes, detalleUrl(p, abiertoAhora)))
  }

  function cambiarFiltros(parche: Partial<FiltrosReportes>): void {
    const siguientes = { ...filtros, ...parche }
    setFiltros(siguientes)
    reemplazarUrl(siguientes, pila, abierto)
  }

  /** The ámbito, sub-área or range: new page data; the attention pill starts again. */
  function navegar(
    cambio: { readonly ambitoId?: string; readonly subareaId?: string | null; readonly rango?: RangoReporte },
    parche: Partial<FiltrosReportes> = {},
  ): void {
    const siguientes = { ...filtros, ...parche, metrica: null }
    setFiltros(siguientes)
    const url = urlReportes(
      {
        ...consulta,
        ambitoId: cambio.ambitoId ?? ambitoId,
        subareaId: cambio.ambitoId && cambio.ambitoId !== ambitoId ? null : cambio.subareaId !== undefined ? cambio.subareaId : subareaId,
        rango: cambio.rango ?? rango,
      },
      siguientes,
    )
    empezar(() => router.replace(url, { scroll: false }))
  }

  function abrir(p: PilaReporte): void {
    if (!abierto) setApertura((n) => n + 1)
    setPila(p)
    setAbierto(true)
    reemplazarUrl(filtros, p, true)
  }

  function cambioAbierto(siguiente: boolean): void {
    setAbierto(siguiente)
    reemplazarUrl(filtros, pila, siguiente)
  }

  const rapidos = rangosReportes(hoy)
  const porDefecto = rapidos[0]
  const irPorDefecto = (): void => navegar({ rango: { clave: porDefecto.clave, desde: porDefecto.desde, hasta: porDefecto.hasta } })
  const rangoRapido = rapidos.find((r) => r.clave === rango.clave) ?? null
  const rangoTexto = `${rangoRapido?.etiqueta ?? 'Elegir fechas'} · ${fechaRango(rango.desde, rango.hasta)}`

  const chips = [
    ...(subareaId && subareas.length > 1 && subareaFija ? [{ id: 'subarea', etiqueta: subareaFija }] : []),
    ...(rango.clave === 'fechas' ? [{ id: 'rango', etiqueta: fechaRango(rango.desde, rango.hasta) }] : []),
  ]
  const ordenCambiado = filtros.tab === 'grupos' ? filtros.ordenGrupos !== 'anio' : filtros.ordenPersonas !== 'nombre'
  const filtrosActivos = chips.length + (ordenCambiado ? 1 : 0)

  const hero = reporte ? resumenReporte({ campus: nombreCampus, ambito: nombreAmbito, subarea: subareaFija, rango, reporte }) : null
  const resumen = !hero ? (
    [nombreCampus, nombreAmbito].filter(Boolean).join(' · ')
  ) : hero.cifras ? (
    <>
      {hero.prefijo} · <strong className="font-mono tabular-nums">{hero.cifras.grupos}</strong> {plural(hero.cifras.grupos, 'grupo', 'grupos')} ·{' '}
      <strong className="font-mono tabular-nums">{hero.cifras.reuniones}</strong> {plural(hero.cifras.reuniones, 'reunión', 'reuniones')} ·{' '}
      <strong className="font-mono tabular-nums">{hero.cifras.porcentaje}</strong> de asistencia
    </>
  ) : (
    `${hero.prefijo} · sin reuniones en este rango`
  )

  const lideresDe = (grupoId: string): readonly string[] => reporte?.grupos.find((g) => g.grupoId === grupoId)?.lideres ?? []
  const servicioDe = (personaId: string): string | null => embudo?.enGrupo.personas.find((p) => p.personaId === personaId)?.servicio ?? null
  const nombreGrupo = (grupoId: string): string | null => reporte?.grupos.find((g) => g.grupoId === grupoId)?.nombre ?? null
  const nombrePersona = (personaId: string): string | null =>
    reporte?.personas.find((p) => p.personaId === personaId)?.nombre ??
    [embudo?.enGrupo, embudo?.sinGrupo].flatMap((e) => e?.personas ?? []).find((p) => p.personaId === personaId)?.nombre ??
    null

  function vacioLista(tab: TabReportes): ReactElement {
    if (!vista || !reporte) return <></>
    if (reporte.grupos.length === 0) {
      return <EstadoVacioSistema icono={UsersRound} titulo="No hay grupos activos aquí" subtitulo={`Cuando ${nombreAmbito} tenga grupos, su asistencia aparece aquí.`} />
    }
    if (!vista.hayReuniones) {
      return (
        <EstadoVacioSistema
          icono={CalendarX}
          titulo="No hay reuniones en este rango"
          subtitulo={`Del ${fechaDia(rango.desde)} al ${fechaDia(rango.hasta)} ningún grupo de ${nombreAmbito} marcó asistencia.`}
          accion={
            rango.clave !== '8sem' ? (
              <BotonSistema type="button" variante="outline" tamaño="sm" onClick={irPorDefecto}>
                Ver las últimas 8 semanas
              </BotonSistema>
            ) : undefined
          }
        />
      )
    }
    const q = filtros.q.trim()
    const pastilla = vista.pastillas.find((p) => p.id !== null && p.id === filtros.metrica)
    return (
      <EstadoVacioSistema
        icono={Search}
        titulo={q ? `Nada coincide con «${q}»` : pastilla ? `${tab === 'grupos' ? 'Ningún grupo' : 'Ningún resultado'} en «${pastilla.etiqueta}»` : 'Sin resultados'}
        subtitulo={q ? 'Busca por nombre de estudiante, grupo o líder.' : 'Toca de nuevo la pastilla para ver todo.'}
      />
    )
  }

  // No meetings in the range: the empty state replaces the list (the funnel stays, it is today's snapshot).
  const filasGrupos = vista?.hayReuniones ? vista.grupos : []
  const filasPersonas = vista?.hayReuniones ? vista.personas : []
  const visibles = filtros.tab === 'grupos' ? filasGrupos.length : filasPersonas.length
  const abiertoAhora = abierto && pila !== null
  const seleccionGrupo = abiertoAhora && pila.vista.tipo === 'grupo' ? pila.vista.grupoId : null
  const seleccionPersona = abiertoAhora && pila.vista.tipo === 'persona' ? pila.vista.personaId : null
  const fichaAncha = livingRoom && seleccionPersona !== null
  const plegarBarra = acoplado && fichaAncha
  const columnasElegibles =
    filtros.tab === 'grupos' ? COLUMNAS_TABLA_GRUPOS : conConexiones ? COLUMNAS_TABLA_CONEXIONES : COLUMNAS_TABLA_PERSONAS
  const pista =
    filtros.tab === 'grupos'
      ? 'Toca un grupo para ver sus reuniones e integrantes'
      : livingRoom
        ? 'Solo lectura · toca a alguien para ver sus conexiones'
        : 'Solo lectura · toca a alguien para ver cada reunión'
  const embudoAbrir = (etapa: Parameters<typeof EmbudoConexion>[0]['pasos'][number]['id']): void => abrir({ vista: { tipo: 'etapa', etapa }, volver: null })
  const errorEmbudoAviso = <AvisoFormulario tono="error">{errorEmbudo ?? 'No se pudo cargar el embudo. Recarga la página.'}</AvisoFormulario>

  const pastillas = (
    <GrupoPastillas etiqueta="Necesitan atención">
      {vista?.pastillas.map((p) => (
        <PastillaFiltro
          key={p.id ?? 'todas'}
          etiqueta={p.etiqueta}
          cantidad={p.cantidad}
          activa={filtros.metrica === p.id}
          // Single choice; a second tap goes back to all.
          onClick={() => cambiarFiltros({ metrica: filtros.metrica === p.id ? null : p.id })}
        />
      ))}
    </GrupoPastillas>
  )
  const listaTabs = (clase?: string): ReactElement | null =>
    vista ? (
      <TabsList aria-label="Asistencia por" className={clase}>
        <TabsTrigger value="grupos" className="flex-1 gap-1.5 md:flex-none">
          Grupos <span className="font-mono tabular-nums">{vista.tabs.grupos}</span>
        </TabsTrigger>
        <TabsTrigger value="personas" className="flex-1 gap-1.5 md:flex-none">
          Personas <span className="font-mono tabular-nums">{vista.tabs.personas}</span>
        </TabsTrigger>
      </TabsList>
    ) : null

  const barra = escritorio !== false && !plegarBarra && (
    <BarraAlcance etiqueta="Ámbito y embudo">
      {ambitos.length > 1 && (
        <SeccionAlcance id="reportes-barra-ambito" titulo="Ámbito">
          {ambitos.map((a) => (
            // One ámbito is always selected (the funnel is per ámbito): pressing it again does nothing.
            <FilaAlcance key={a.id} etiqueta={a.nombre} valor={a.grupos} pulsado={a.id === ambitoId} onClick={() => a.id !== ambitoId && navegar({ ambitoId: a.id })}>
              <PorcentajeAmbito porcentaje={a.porcentaje} />
              {a.insignias.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {a.insignias.map((i) => (
                    <BadgeSistema key={i.texto} variante={i.tono} tamaño="sm">
                      {i.texto}
                    </BadgeSistema>
                  ))}
                </span>
              )}
            </FilaAlcance>
          ))}
        </SeccionAlcance>
      )}
      {subareas.length > 1 && (
        <SeccionAlcance id="reportes-barra-subarea" titulo="Sub-área">
          <FilaAlcance etiqueta="Todas" valor={subareas.reduce((suma, s) => suma + s.grupos, 0)} pulsado={subareaId === null} onClick={() => subareaId !== null && navegar({ subareaId: null })} />
          {subareas.map((s) => (
            <FilaAlcance key={s.subareaId} etiqueta={s.label} valor={s.grupos} pulsado={subareaId === s.subareaId} onClick={() => subareaId !== s.subareaId && navegar({ subareaId: s.subareaId })} />
          ))}
        </SeccionAlcance>
      )}
      <SeccionAlcance id="reportes-barra-embudo" titulo="Embudo de conexión" pista="Hoy">
        <p className="mb-1 text-xs text-muted-foreground">No depende del rango.</p>
        {embudo ? <EmbudoConexion pasos={pasos} onAbrir={embudoAbrir} variante="barra" /> : errorEmbudoAviso}
      </SeccionAlcance>
    </BarraAlcance>
  )

  const campusSelect = (conEtiqueta: boolean): ReactElement | null =>
    campus.length > 1 ? (
      <SelectSistema
        {...(conEtiqueta ? { label: 'Campus' } : { 'aria-label': 'Campus' })}
        opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        value={campusId}
        onValueChange={(id) => empezar(() => router.push(`/estudiantes/reportes?campus=${encodeURIComponent(id)}`))}
      />
    ) : null

  const acciones =
    escritorio !== false ? (
      <>
        {campus.length > 1 && <div className="min-w-48">{campusSelect(false)}</div>}
        <PastillaRango
          etiqueta={rangoRapido?.etiqueta ?? 'Elegir fechas'}
          fechas={fechaRango(rango.desde, rango.hasta)}
          opciones={rapidos.map((r) => ({ clave: r.clave, etiqueta: r.etiqueta, fechas: fechaRango(r.desde, r.hasta) }))}
          actual={rangoRapido?.clave ?? null}
          onElegir={(clave) => {
            const r = rapidos.find((x) => x.clave === clave)
            if (r) navegar({ rango: { clave: r.clave, desde: r.desde, hasta: r.hasta } })
          }}
        >
          {/* A new range from outside starts the fields again. */}
          <FechasPropias key={`${rango.desde}|${rango.hasta}`} hoy={hoy} rango={rango} onRango={(r) => navegar({ rango: r })} />
        </PastillaRango>
      </>
    ) : undefined

  const movil = (
    <>
      <div className="-mx-2 -mt-2 flex items-center justify-between gap-2">
        <BotonAtrasMovil atras={{ etiqueta: 'Estudiantes', href: '/estudiantes' }} className="max-w-[75%]" />
        <BotonFiltrosMovil filtrosActivos={filtrosActivos} onClick={() => setHojaAbierta(true)} />
      </div>
      <TituloGrande titulo={TITULO} nivel={2} resumen={resumen} />
      {escritorio !== true && campusSelect(true)}
    </>
  )

  const errorReporte = (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:m-6 md:rounded-md md:border md:border-border">
      <EstadoVacioSistema icono={CalendarX} titulo="No se pudo cargar el reporte" subtitulo={contenido.tipo === 'error' ? contenido.mensaje : undefined} />
    </div>
  )

  return (
    <MarcoAlcance
      migas={<MigasReportes />}
      titulo={TITULO}
      resumen={resumen}
      acciones={acciones}
      barra={barra}
      panel={acoplado && abiertoAhora ? (fichaAncha ? 'lg' : 'md') : null}
      movil={movil}
    >
      {escritorio !== false &&
        (!vista || !reporte ? (
          <div className="hidden md:block">{errorReporte}</div>
        ) : (
          <TabsSistema
            value={filtros.tab}
            onValueChange={(tab) => cambiarFiltros({ tab: tab as TabReportes, metrica: null })}
            aria-busy={pendiente || undefined}
            className={cn('hidden min-h-0 flex-1 flex-col transition-opacity md:flex', pendiente && 'opacity-60')}
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-6 pt-3 pb-2.5">
              {listaTabs()}
              <BuscadorBarra
                valor={filtros.q}
                onCambio={(q) => cambiarFiltros({ q })}
                placeholder="Buscar estudiante, grupo o líder"
                etiqueta="Buscar estudiante, grupo o líder"
              />
              <div className="ml-auto flex flex-wrap items-center gap-2.5">
                <MenuColumnas
                  key={`${filtros.tab}-${conConexiones}`}
                  fija={filtros.tab === 'grupos' ? 'Grupo' : 'Nombre'}
                  columnas={columnasElegibles}
                  ocultas={ocultas[filtros.tab]}
                  onCambio={(siguiente) => setOcultas((actual) => ({ ...actual, [filtros.tab]: siguiente }))}
                />
                <ControlSegmentado etiqueta="Densidad" opciones={DENSIDADES} valor={densidad} onCambio={setDensidad} />
              </div>
            </div>
            {vista.pastillas.length > 0 && <div className="shrink-0 px-6 pb-2.5">{pastillas}</div>}
            {(['grupos', 'personas'] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
                <RegionTabla etiqueta={tab === 'grupos' ? 'Asistencia por grupo' : 'Asistencia por persona'} className="min-h-0 flex-1">
                  {visibles === 0 ? (
                    vacioLista(tab)
                  ) : tab === 'grupos' ? (
                    <TablaGruposReporte
                      filas={filasGrupos}
                      orden={filtros.ordenGrupos}
                      onOrdenar={(ordenGrupos) => cambiarFiltros({ ordenGrupos })}
                      onAbrir={(grupoId) => abrir({ vista: { tipo: 'grupo', grupoId }, volver: null })}
                      seleccionada={seleccionGrupo}
                      ocultas={ocultas.grupos}
                      densidad={densidad}
                    />
                  ) : (
                    <TablaPersonasReporte
                      filas={filasPersonas}
                      orden={filtros.ordenPersonas}
                      hoy={hoy}
                      onOrdenar={(ordenPersonas) => cambiarFiltros({ ordenPersonas })}
                      onAbrir={(personaId) => abrir({ vista: { tipo: 'persona', personaId }, volver: null })}
                      seleccionada={seleccionPersona}
                      ocultas={ocultas.personas}
                      densidad={densidad}
                      conConexiones={conConexiones}
                    />
                  )}
                </RegionTabla>
              </TabsContent>
            ))}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 pt-2 pb-3 text-xs text-muted-foreground">
              <span id="reportes-pie" role="status" className="font-mono tabular-nums">
                {visibles > 0 ? vista.pie.resumen : ''}
              </span>
              <span>{pista}</span>
              <span>{vista.pie.orden}</span>
            </div>
          </TabsSistema>
        ))}

      {escritorio !== true && (
        <div className="space-y-4 md:hidden">
          <BarraHerramientas
            busqueda={{ valor: filtros.q, onCambio: (q) => cambiarFiltros({ q }), placeholder: 'Buscar estudiante, grupo o líder', etiqueta: 'Buscar estudiante, grupo o líder' }}
            filtrosActivos={filtrosActivos}
            onAbrirFiltros={() => setHojaAbierta(true)}
          />
          <GrupoPastillas etiqueta="Rango de fechas">
            {rapidos.map((r) => (
              <PastillaFiltro key={r.clave} etiqueta={r.etiqueta} activa={rango.clave === r.clave} onClick={() => navegar({ rango: { clave: r.clave, desde: r.desde, hasta: r.hasta } })} />
            ))}
            <PastillaFiltro etiqueta={rango.clave === 'fechas' ? fechaRango(rango.desde, rango.hasta) : 'Elegir fechas'} activa={rango.clave === 'fechas'} onClick={() => setHojaAbierta(true)} />
          </GrupoPastillas>

          {ambitos.length > 1 && (
            <section aria-labelledby="reportes-ambito-movil" className="space-y-2">
              <h2 id="reportes-ambito-movil" className={cn(CLASE_H2, 'px-1')}>
                Ámbito
              </h2>
              <div role="group" aria-labelledby="reportes-ambito-movil" className="overflow-hidden rounded-2xl bg-card">
                {ambitos.map((a, i) => {
                  const elegido = a.id === ambitoId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={elegido}
                      onClick={() => !elegido && navegar({ ambitoId: a.id })}
                      className={cn(
                        'focus-ring relative grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-x-2.5 py-2 pr-2.5 pl-4 text-left transition-colors active:bg-accent',
                        i > 0 && 'before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/60',
                      )}
                    >
                      <span className="min-w-0">
                        <b className={cn('block truncate text-[15px] font-semibold', elegido ? 'text-brand-text' : 'text-foreground')}>{a.nombre}</b>
                        <small className="block truncate text-[13px] text-muted-foreground">
                          {a.grupos} {plural(a.grupos, 'grupo', 'grupos')}
                          {a.insignias.length > 0 && ` · ${a.insignias.map((x) => x.texto).join(' · ')}`}
                        </small>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums text-foreground">{textoPorcentaje(a.porcentaje)}</span>
                        {a.porcentaje !== null && <BarraPorcentaje porcentaje={a.porcentaje} className="w-10" />}
                      </span>
                      {elegido ? <Check aria-hidden="true" className="size-5 text-brand-text" /> : <span aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="reportes-embudo" className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 id="reportes-embudo" className={CLASE_H2}>
                Embudo de conexión
              </h2>
              <span className="text-xs text-muted-foreground">Hoy</span>
            </div>
            {embudo ? <EmbudoConexion pasos={pasos} onAbrir={embudoAbrir} variante="compacto" /> : errorEmbudoAviso}
          </section>

          {!vista || !reporte ? (
            errorReporte
          ) : (
            <section aria-label="Asistencia" aria-busy={pendiente || undefined} className={cn('space-y-3 transition-opacity', pendiente && 'opacity-60')}>
              <TabsSistema value={filtros.tab} onValueChange={(tab) => cambiarFiltros({ tab: tab as TabReportes, metrica: null })}>
                {listaTabs('flex w-full')}
                {(['grupos', 'personas'] as const).map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-3 space-y-3">
                    {vista.pastillas.length > 0 && pastillas}
                    <ChipsFiltrosActivos
                      chips={chips}
                      onQuitar={(id) => (id === 'subarea' ? navegar({ subareaId: null }) : irPorDefecto())}
                      onLimpiarTodo={() => navegar({ subareaId: null, rango: { clave: porDefecto.clave, desde: porDefecto.desde, hasta: porDefecto.hasta } })}
                    />
                    {tab === 'grupos' ? (
                      <ListaGruposReporte
                        filas={filasGrupos}
                        orden={filtros.ordenGrupos}
                        onOrdenar={(ordenGrupos) => cambiarFiltros({ ordenGrupos })}
                        onAbrir={(grupoId) => abrir({ vista: { tipo: 'grupo', grupoId }, volver: null })}
                        vacio={vacioLista('grupos')}
                      />
                    ) : (
                      <ListaPersonasReporte
                        filas={filasPersonas}
                        orden={filtros.ordenPersonas}
                        hoy={hoy}
                        onOrdenar={(ordenPersonas) => cambiarFiltros({ ordenPersonas })}
                        onAbrir={(personaId) => abrir({ vista: { tipo: 'persona', personaId }, volver: null })}
                        vacio={vacioLista('personas')}
                        conConexiones={conConexiones}
                      />
                    )}
                    {visibles > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-muted-foreground">
                        <span role="status" className="font-mono tabular-nums">
                          {vista.pie.resumen}
                        </span>
                        <span>{vista.pie.orden}</span>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </TabsSistema>
            </section>
          )}
        </div>
      )}

      <HojaFiltrosReportes
        abierta={hojaAbierta}
        onCambioAbierta={setHojaAbierta}
        hoy={hoy}
        rango={rango}
        onRango={(r) => navegar({ rango: r })}
        subareas={subareas}
        subareaId={subareaId}
        onSubarea={(id) => navegar({ subareaId: id })}
        filtros={filtros}
        onFiltros={cambiarFiltros}
        resultados={visibles}
        conConexiones={conConexiones}
        onLimpiar={() => {
          const orden = { ordenGrupos: ORDENES_GRUPOS[0].id, ordenPersonas: ORDENES_PERSONAS[0].id }
          if (subareaId || rango.clave !== '8sem') navegar({ subareaId: null, rango: { clave: porDefecto.clave, desde: porDefecto.desde, hasta: porDefecto.hasta } }, orden)
          else cambiarFiltros(orden)
        }}
      />

      <DetalleReporte
        key={apertura}
        pila={pila}
        abierto={abierto}
        onCambioAbierto={cambioAbierto}
        onIr={abrir}
        rango={rango}
        ambitoId={ambitoId}
        embudo={embudo}
        alcance={alcance}
        contexto={{ ambito: nombreAmbito, lideresDe, servicioDe }}
        nombreGrupo={nombreGrupo}
        nombrePersona={nombrePersona}
        livingRoom={livingRoom}
        campusId={campusId}
        hoy={hoy}
        rangoTexto={rangoTexto}
      />
    </MarcoAlcance>
  )
}
