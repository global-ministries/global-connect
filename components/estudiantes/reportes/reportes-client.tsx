'use client'

/**
 * Estudiantes › Reportes — client island of /estudiantes/reportes, "Reportes
 * de asistencia" (C6d3 of odd/tasks/estudiantes-fase-b.md, S17–S20, L48,
 * L49; artboards 11 desktop and 12 phone of design/estudiantes-asistencia,
 * A26–A34). Read only.
 *
 * Top to bottom: breadcrumbs "Estudiantes / Reportes" (phone "‹ Estudiantes"
 * + Filtros), hero with "Barquisimeto · Transit · 8 sep – 2 nov · N grupos ·
 * N reuniones · N% de asistencia", the campus select when there is more than
 * one, the toolbar (student, group or leader), the quick ranges (GR3), the
 * ámbito cards (one is always selected; hidden with a single ámbito, A26),
 * the «Embudo de conexión» Sin grupo → En grupo → Sirviendo of today (GR1),
 * the Grupos / Personas tabs with their attention pills, the active chips,
 * the list and its footer. A row, a funnel step or a member opens the
 * read-only drawer (detalle-reporte.tsx).
 *
 * The ámbito, sub-área and range reload the page data (`router.replace`);
 * the tab, pill, sort, search and open drawer stay local and are mirrored
 * into the URL with `history.replaceState`. Every rule lives in
 * lib/platform/estudiantes/reportes.ts.
 */
import { useMemo, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarX, Search, UsersRound } from 'lucide-react'

import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { TarjetasFiltro } from '@/components/ui/TarjetasFiltro'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import {
  FILTROS_REPORTES,
  ORDENES_GRUPOS,
  ORDENES_PERSONAS,
  calcularVistaReportes,
  fechaDia,
  fechaRango,
  pasosEmbudo,
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

import { DetalleReporte, type PilaReporte } from './detalle-reporte'
import { EmbudoConexion } from './embudo-conexion'
import { HojaFiltrosReportes } from './filtros-reportes'
import { ListaGruposReporte, ListaPersonasReporte } from './listas-reporte'
import { MigasReportes } from './partes-reportes'

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
}

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

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
}: ReportesClientProps): ReactElement {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [filtros, setFiltros] = useState<FiltrosReportes>(filtrosIniciales)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [pila, setPila] = useState<PilaReporte | null>(() => pilaInicial(detalleInicial))
  const [abierto, setAbierto] = useState(() => pilaInicial(detalleInicial) !== null)
  // A fresh drawer per opening (its first view keeps the panel's focus).
  const [apertura, setApertura] = useState(0)

  const reporte = contenido.tipo === 'reporte' ? contenido.reporte : null
  const nombreCampus = campus.find((c) => c.id === campusId)?.nombre ?? ''
  const ambito = ambitos.find((a) => a.id === ambitoId)
  const nombreAmbito = ambito?.nombre ?? ''
  const subareas = reporte?.subareas ?? []
  // A fixed scope (the entrenadora's sub-área) or the filter names the sub-área.
  const subareaFija = subareas.length === 1 ? subareas[0].label : (subareas.find((s) => s.subareaId === subareaId)?.label ?? null)
  const alcance = [nombreAmbito, subareaFija].filter(Boolean).join(' · ')

  const vista = useMemo(() => (reporte ? calcularVistaReportes({ reporte, filtros }) : null), [reporte, filtros])
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

  const porDefecto = rangosReportes(hoy)[0]
  const irPorDefecto = (): void => navegar({ rango: { clave: porDefecto.clave, desde: porDefecto.desde, hasta: porDefecto.hasta } })

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

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema breadcrumbs={<MigasReportes />}>
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className="-mx-2 -mt-2 mb-1 flex items-center justify-between gap-2">
          <BotonAtrasMovil atras={{ etiqueta: 'Estudiantes', href: '/estudiantes' }} className="max-w-[75%]" />
          <BotonFiltrosMovil filtrosActivos={filtrosActivos} onClick={() => setHojaAbierta(true)} />
        </div>
        <TituloGrande titulo={TITULO} nivel={2} resumen={resumen} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{TITULO}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumen}</p>
      </div>

      {campus.length > 1 && (
        <div className="lg:max-w-[360px]">
          <SelectSistema
            label="Campus"
            opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
            value={campusId}
            onValueChange={(id) => empezar(() => router.push(`/estudiantes/reportes?campus=${encodeURIComponent(id)}`))}
          />
        </div>
      )}

      <BarraHerramientas
        busqueda={{ valor: filtros.q, onCambio: (q) => cambiarFiltros({ q }), placeholder: 'Buscar estudiante, grupo o líder', etiqueta: 'Buscar estudiante, grupo o líder' }}
        filtrosActivos={filtrosActivos}
        onAbrirFiltros={() => setHojaAbierta(true)}
      />

      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className={`hidden shrink-0 md:inline ${CLASE_H2}`}>
          Rango
        </span>
        <GrupoPastillas etiqueta="Rango de fechas" className="min-w-0 flex-1">
          {rangosReportes(hoy).map((r) => (
            <PastillaFiltro key={r.clave} etiqueta={r.etiqueta} activa={rango.clave === r.clave} onClick={() => navegar({ rango: { clave: r.clave, desde: r.desde, hasta: r.hasta } })} />
          ))}
          <PastillaFiltro etiqueta={rango.clave === 'fechas' ? fechaRango(rango.desde, rango.hasta) : 'Elegir fechas'} activa={rango.clave === 'fechas'} onClick={() => setHojaAbierta(true)} />
        </GrupoPastillas>
      </div>

      {ambitos.length > 1 && (
        <section aria-labelledby="reportes-ambitos" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
            <h2 id="reportes-ambitos" className={CLASE_H2}>
              Ámbitos
            </h2>
            <span className="hidden text-xs text-muted-foreground md:inline">Toca para cambiar de ámbito</span>
          </div>
          <TarjetasFiltro
            items={ambitos.map((a) => ({
              id: a.id,
              label: a.nombre,
              subtitulo: a.porcentaje === null ? 'Sin reuniones en el rango' : `${Math.round(a.porcentaje)}% de asistencia`,
              total: a.grupos,
              badge: null,
              insignias: a.insignias,
            }))}
            modoCompacto={false}
            seleccionadoId={ambitoId}
            // One ámbito is always selected (the funnel is per ámbito): tapping it again does nothing.
            onSeleccionar={(id) => id !== ambitoId && navegar({ ambitoId: id })}
            unidad={{ singular: 'grupo', plural: 'grupos' }}
            etiqueta="Ámbitos"
            buscarEtiqueta="Buscar ámbito"
            presentacion="alcance"
          />
        </section>
      )}

      <section aria-labelledby="reportes-embudo" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
          <h2 id="reportes-embudo" className={CLASE_H2}>
            Embudo de conexión
          </h2>
          <span className="text-xs text-muted-foreground">
            Hoy<span className="hidden md:inline"> · no depende del rango</span>
          </span>
        </div>
        {embudo ? (
          <EmbudoConexion pasos={pasos} onAbrir={(etapa) => abrir({ vista: { tipo: 'etapa', etapa }, volver: null })} />
        ) : (
          <AvisoFormulario tono="error">{errorEmbudo ?? 'No se pudo cargar el embudo. Recarga la página.'}</AvisoFormulario>
        )}
      </section>

      {!vista || !reporte ? (
        <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
          <EstadoVacioSistema icono={CalendarX} titulo="No se pudo cargar el reporte" subtitulo={contenido.tipo === 'error' ? contenido.mensaje : undefined} />
        </div>
      ) : (
        <section aria-label="Asistencia" aria-busy={pendiente || undefined} className={`space-y-3 transition-opacity ${pendiente ? 'opacity-60' : ''}`}>
          <TabsSistema value={filtros.tab} onValueChange={(tab) => cambiarFiltros({ tab: tab as TabReportes, metrica: null })}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <TabsList aria-label="Asistencia por" className="flex w-full md:inline-flex md:w-auto">
                <TabsTrigger value="grupos" className="flex-1 gap-1.5 md:flex-none">
                  Grupos <span className="font-mono tabular-nums">{vista.tabs.grupos}</span>
                </TabsTrigger>
                <TabsTrigger value="personas" className="flex-1 gap-1.5 md:flex-none">
                  Personas <span className="font-mono tabular-nums">{vista.tabs.personas}</span>
                </TabsTrigger>
              </TabsList>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {filtros.tab === 'grupos' ? 'Toca un grupo para ver sus reuniones e integrantes' : 'Solo lectura · toca a alguien para ver cada reunión'}
              </span>
            </div>

            {(['grupos', 'personas'] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-3 space-y-3">
                {vista.pastillas.length > 0 && (
                  <GrupoPastillas etiqueta="Necesitan atención">
                    {vista.pastillas.map((p) => (
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
                )}
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
                  />
                )}
                {visibles > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
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
      />
    </PaginaSistema>
  )
}
