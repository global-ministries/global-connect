'use client'

/**
 * Estudiantes › En vivo — client island of /estudiantes/vivo (C4b of
 * odd/tasks/estudiantes-fase-b.md) in the planning style (E4a of
 * odd/tasks/estudiantes-estilo-dps.md, S6; artboards 04 / 05 of
 * design/estudiantes-dps, B20–B28).
 *
 * Top to bottom: the header band (crumbs "Estudiantes › <ámbito> ›
 * <sub-área>" in the desktop header; phone "‹ origin" and Filtros; the date
 * pill stepping between the meetings of the ámbito; the live indicator, G4;
 * "N en el salón: … · K de M marcados" with its bar; the Ámbito tabs from md
 * with more than one), then the side bar (Resumen: the four metrics that
 * filter; "Visitantes de hoy", G2; the sub-área cards) — on top in two
 * columns between 768 and 1099px, the metrics 2 × 2 on a phone — and the
 * main column: the toolbar (Estado del grupo Todos · Faltan · Completo, the
 * search, Ordenar, the metric chip), the phone "Visitantes de hoy" before
 * the groups (S6), and the groups by sub-área under sticky bands. A row (or
 * a visitor) opens the group detail.
 *
 * The data refreshes every 15 s through a server action (use-en-vivo.ts) and
 * is swapped in place; a new visitor is announced with a toast. Every rule
 * lives in the pure view model (lib/platform/estudiantes/vivo-vista.ts). The
 * filters stay in local state and are mirrored into the URL with
 * `history.replaceState` (no server round trip; search debounced); another
 * ámbito or meeting is a `router.replace` (the page loads its data).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Radio, Search, UsersRound } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import type { DatosVivo, OpcionVivo, VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import {
  ESTADOS_FILTRO,
  ETIQUETA_ESTADO_FILTRO,
  ETIQUETA_ORDEN_VIVO,
  ORDENES_VIVO,
  calcularVistaVivo,
  consultaVivo,
  elegirOpcion,
  mensajesNuevosVisitantes,
  opcionesAmbito,
  pasosVivo,
  valorAmbito,
  type FiltrosVivo,
  type MetricaVivo,
  type OrdenVivo,
  type PasoVivo,
  type VistaVivo,
} from '@/lib/platform/estudiantes/vivo-vista'
import { cn } from '@/lib/utils'

import { FiltroSegmentado } from '../planificacion/filtro-segmentado'
import {
  BarraHerramientasPlanificacion,
  BarraProgreso,
  EncabezadoPlanificacion,
  LineaFecha,
  MarcoPlanificacion,
  ResumenPlanificacion,
} from '../planificacion/marco-planificacion'
import { MigasEstudiantes, type Miga } from '../planificacion/migas-estudiantes'
import { PastillaFecha } from '../planificacion/pastilla-fecha'
import { PieRegion, RegionDatos, TablaPlanificacion } from '../planificacion/region-datos'
import { AreasVivo, MetricasVivo } from './barra-resumen-vivo'
import { DetalleGrupoVivo } from './detalle-grupo-vivo'
import { HojaFiltrosVivo } from './filtros-vivo'
import { VisitantesBarra, VisitantesSeccion } from './franja-visitantes'
import { IndicadorEnVivo } from './indicador-en-vivo'
import { ListaVivo } from './lista-vivo'
import { useEnVivo } from './use-en-vivo'

const RETRASO_BUSQUEDA_MS = 300

const SIN_DATOS: DatosVivo = { ambitoId: null, fecha: null, turnoId: null, grupos: [], visitantesHoy: [] }

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)
const minuscula = (texto: string): string => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1)

const CLASE_TITULO_BARRA = 'mb-1 flex min-h-[26px] items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'

export interface VivoClientProps {
  readonly opciones: readonly OpcionVivo[]
  /** `null`: no meeting in the last days (empty state). */
  readonly opcion: OpcionVivo | null
  readonly datos: DatosVivo | null
  /** Why `datos` is missing (the refresh retries). */
  readonly error: string | null
  readonly filtrosIniciales: FiltrosVivo
}

function MigasVivo({ ambito, area, onIrAmbito }: { readonly ambito: string | null; readonly area: string | null; readonly onIrAmbito: () => void }): ReactElement {
  const migas: Miga[] = [{ texto: 'Estudiantes', href: '/estudiantes' }]
  if (!ambito) migas.push({ texto: 'En vivo' })
  else if (area) migas.push({ texto: ambito, onClick: onIrAmbito }, { texto: area })
  else migas.push({ texto: ambito })
  return <MigasEstudiantes migas={migas} />
}

function Resumen({ vista }: { readonly vista: VistaVivo }): ReactElement {
  const { presentes, presentesInscritos, visitantes, marcados, inscritos } = vista.totales
  return (
    <ResumenPlanificacion>
      <strong className="font-mono tabular-nums">{presentes}</strong> en el salón: <strong className="font-mono tabular-nums">{presentesInscritos}</strong>{' '}
      {palabra(presentesInscritos, 'inscrito', 'inscritos')} y <strong className="font-mono tabular-nums">{visitantes}</strong>{' '}
      {palabra(visitantes, 'visitante', 'visitantes')} ·{' '}
      <strong>
        <span className="font-mono tabular-nums">{marcados}</span> de <span className="font-mono tabular-nums">{inscritos}</span>
      </strong>{' '}
      marcados
    </ResumenPlanificacion>
  )
}

/** No meeting to show: the frame, a title and one line (patterns.md#empty-and-loading-states). */
function SinReuniones(): ReactElement {
  return (
    <MarcoPlanificacion migas={<MigasVivo ambito={null} area={null} onIrAmbito={() => undefined} />}>
      <EncabezadoPlanificacion titulo="En vivo" antetitulo="Estudiantes" atras={{ etiqueta: 'Estudiantes', href: '/estudiantes' }} />
      <RegionDatos>
        <TablaPlanificacion>
          <EstadoVacioSistema icono={Radio} titulo="No hay reuniones para seguir en vivo" subtitulo="Aparecen aquí cuando Transit o Inside Out se reúnen." />
        </TablaPlanificacion>
      </RegionDatos>
    </MarcoPlanificacion>
  )
}

export function VivoClient(props: VivoClientProps): ReactElement {
  if (!props.opcion) return <SinReuniones />
  return <VivoReunion {...props} opcion={props.opcion} />
}

type Detalle = { readonly grupoId: string; readonly abierto: boolean }

function VivoReunion({ opciones, opcion, datos: datosIniciales, error, filtrosIniciales }: VivoClientProps & { readonly opcion: OpcionVivo }): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? '/estudiantes/vivo'
  const toast = useNotificaciones()

  const avisarNuevos = useCallback((nuevos: readonly VisitanteHoy[]) => mensajesNuevosVisitantes(nuevos).forEach((mensaje) => toast.info(mensaje)), [toast])
  const vivo = useEnVivo({ opcion, inicial: datosIniciales, errorInicial: error, onNuevos: avisarNuevos })

  const [filtros, setFiltros] = useState<FiltrosVivo>(filtrosIniciales)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  // The group stays selected after the drawer closes, so it can animate out.
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const temporizadorUrl = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    },
    [],
  )

  const datos = vivo.datos ?? SIN_DATOS
  const vista = useMemo(() => calcularVistaVivo({ datos, ambito: opcion.ambito, filtros }), [datos, opcion.ambito, filtros])

  function cambiar(parche: Partial<FiltrosVivo>): void {
    const siguiente = { ...vista.filtros, ...parche }
    setFiltros(siguiente)
    if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    const aplicar = (): void => {
      temporizadorUrl.current = null
      window.history.replaceState(window.history.state, '', `${pathname}?${consultaVivo(opcion, siguiente)}`)
    }
    const soloBusqueda = Object.keys(parche).length === 1 && 'q' in parche
    if (soloBusqueda) temporizadorUrl.current = setTimeout(aplicar, RETRASO_BUSQUEDA_MS)
    else aplicar()
  }

  function irA(otra: OpcionVivo | null | undefined): void {
    if (!otra) return
    router.replace(`${pathname}?${consultaVivo(otra, vista.filtros)}`, { scroll: false })
  }

  function irAmbito(valor: string): void {
    const [ambito, campus] = valor.split('|')
    irA(elegirOpcion(opciones, { ambito, campus }, hoyEnCaracas()))
  }

  const ambitos = opcionesAmbito(opciones)
  const pasos = pasosVivo(opciones, opcion)
  const area = vista.filtros.area
  const abrir = (grupoId: string): void => setDetalle({ grupoId, abierto: true })
  const grupoDetalle = detalle ? (datos.grupos.find((g) => g.grupoId === detalle.grupoId) ?? null) : null
  const metricaActiva = vista.metricas.find((m) => m.activa)
  const hayFiltros = metricaActiva !== undefined || vista.filtros.estado !== 'todos' || vista.filtros.q.trim() !== ''
  const paso = (p: PasoVivo | null, cual: 'anterior' | 'siguiente') => (p ? { etiqueta: `Reunión ${cual}, ${minuscula(p.etiqueta)}`, onIr: () => irA(p.opcion) } : null)
  const vacio = hayFiltros ? (
    <EstadoVacioSistema
      icono={UsersRound}
      titulo="Ningún grupo coincide"
      subtitulo="Quita algún filtro o toca de nuevo la métrica."
      accion={
        <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ metrica: null, estado: 'todos', q: '' })}>
          Limpiar todo
        </BotonSistema>
      }
    />
  ) : (
    <EstadoVacioSistema icono={UsersRound} titulo="Todavía no hay grupos aquí" subtitulo="Los grupos activos de este ámbito aparecen aquí." />
  )

  return (
    <MarcoPlanificacion migas={<MigasVivo ambito={opcion.ambito} area={area} onIrAmbito={() => cambiar({ area: null })} />}>
      <EncabezadoPlanificacion
        titulo={vista.titulo}
        antetitulo="Estudiantes · En vivo"
        atras={area ? { etiqueta: opcion.ambito, onClick: () => cambiar({ area: null }) } : { etiqueta: 'Estudiantes', href: '/estudiantes' }}
        accionMovil={<BotonFiltrosMovil filtrosActivos={vista.filtrosEnHoja} onClick={() => setHojaAbierta(true)} />}
        acciones={
          ambitos.length > 1 ? (
            <div className="max-md:hidden">
              <ControlSegmentado etiqueta="Ámbito" opciones={ambitos} valor={valorAmbito(opcion)} onCambio={(valor) => valor !== valorAmbito(opcion) && irAmbito(valor)} />
            </div>
          ) : undefined
        }
      >
        <LineaFecha>
          <PastillaFecha
            etiqueta="Reunión"
            anterior={paso(pasos.anterior, 'anterior')}
            siguiente={paso(pasos.siguiente, 'siguiente')}
            sinAnterior="No hay reuniones anteriores"
            sinSiguiente="Es la reunión más reciente"
          >
            {pasos.etiqueta}
          </PastillaFecha>
          <IndicadorEnVivo actualizadoAt={vivo.actualizadoAt} oculto={vivo.oculto} fallo={vivo.fallo} />
        </LineaFecha>
        <Resumen vista={vista} />
        <BarraProgreso valor={vista.totales.marcados} total={vista.totales.inscritos} />
      </EncabezadoPlanificacion>

      <div className="min-[1100px]:grid min-[1100px]:grid-cols-[260px_minmax(0,1fr)] min-[1100px]:items-start">
        <aside
          aria-label="Resumen de la reunión"
          className={cn(
            'px-4 pb-3 sm:px-6 md:grid md:grid-cols-2 md:border-b md:border-border md:bg-card md:p-0',
            'min-[1100px]:sticky min-[1100px]:top-16 min-[1100px]:block min-[1100px]:max-h-[calc(100dvh-4rem)] min-[1100px]:min-h-[calc(100dvh-9rem)] min-[1100px]:overflow-auto min-[1100px]:border-r min-[1100px]:border-b-0',
          )}
        >
          <section aria-labelledby="vivo-resumen" className="md:px-4 md:pt-2.5 md:pb-3 min-[1100px]:pr-3">
            <h2 id="vivo-resumen" className={cn(CLASE_TITULO_BARRA, 'max-md:sr-only')}>
              Resumen
            </h2>
            <MetricasVivo metricas={vista.metricas} onAlternar={(id: MetricaVivo) => cambiar({ metrica: vista.filtros.metrica === id ? null : id })} />
          </section>
          <section
            aria-labelledby="vivo-visitantes"
            className="hidden md:block md:border-l md:border-border md:px-4 md:pt-2.5 md:pb-3 min-[1100px]:border-t min-[1100px]:border-l-0 min-[1100px]:pr-3"
          >
            <h2 id="vivo-visitantes" className={CLASE_TITULO_BARRA}>
              <span>
                Visitantes de hoy <span className="font-mono tabular-nums">{vista.visitantes.length}</span>
              </span>
            </h2>
            <VisitantesBarra visitantes={vista.visitantes} onAbrirGrupo={abrir} />
          </section>
          {vista.areas.length > 0 && (
            <section
              aria-labelledby="vivo-areas"
              className="hidden md:col-span-2 md:block md:border-t md:border-border md:px-4 md:pt-2.5 md:pb-3 min-[1100px]:pr-3"
            >
              <h2 id="vivo-areas" className={CLASE_TITULO_BARRA}>
                Áreas <span className="font-normal normal-case tracking-normal">Toca para entrar</span>
              </h2>
              <AreasVivo areas={vista.areas} onElegir={(id) => cambiar({ area: id })} />
            </section>
          )}
        </aside>

        <div className="min-w-0">
          <BarraHerramientasPlanificacion>
            <FiltroSegmentado
              etiqueta="Estado del grupo"
              opciones={ESTADOS_FILTRO.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO_FILTRO[e], cuenta: vista.cuentasEstado[e] }))}
              valor={vista.filtros.estado}
              onCambio={(estado) => cambiar({ estado })}
            />
            <div className="w-full md:w-60">
              <InputSistema
                type="search"
                autoComplete="off"
                icono={Search}
                aria-label="Buscar grupos"
                placeholder="Buscar grupo o líder"
                value={vista.filtros.q}
                onChange={(e) => cambiar({ q: e.target.value })}
              />
            </div>
            <div className="hidden md:block md:w-52">
              <SelectSistema
                aria-label="Ordenar"
                opciones={ORDENES_VIVO.map((o) => ({ valor: o, etiqueta: ETIQUETA_ORDEN_VIVO[o] }))}
                value={vista.filtros.orden}
                onValueChange={(orden) => cambiar({ orden: orden as OrdenVivo })}
              />
            </div>
            <ChipsFiltrosActivos
              chips={metricaActiva ? [{ id: 'metrica', etiqueta: metricaActiva.etiqueta }] : []}
              onQuitar={() => cambiar({ metrica: null })}
              onLimpiarTodo={() => cambiar({ metrica: null })}
            />
          </BarraHerramientasPlanificacion>

          <RegionDatos>
            {vivo.fallo && vivo.mensaje && (
              <AvisoFormulario tono="error" className="mx-4 md:mx-0">
                {vivo.mensaje}
              </AvisoFormulario>
            )}
            <div className="md:hidden">
              <VisitantesSeccion visitantes={vista.visitantes} onAbrirGrupo={abrir} />
            </div>
            <ListaVivo secciones={vista.secciones} onAbrir={abrir} vacio={vacio} />
            {vista.visibles.length > 0 && (
              <PieRegion>
                <span className="font-mono tabular-nums">{vista.pie.resumen}</span>
                <span>{vista.pie.orden}</span>
              </PieRegion>
            )}
          </RegionDatos>
        </div>
      </div>

      <HojaFiltrosVivo
        vista={vista}
        ambitos={ambitos}
        ambito={valorAmbito(opcion)}
        onAmbito={irAmbito}
        abierta={hojaAbierta}
        onCambioAbierta={setHojaAbierta}
        onCambio={cambiar}
      />

      <DetalleGrupoVivo
        key={detalle?.grupoId ?? 'ninguno'}
        grupo={grupoDetalle}
        opcion={opcion}
        visitantes={datos.visitantesHoy}
        abierto={detalle?.abierto ?? false}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
      />
    </MarcoPlanificacion>
  )
}
