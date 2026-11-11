'use client'

/**
 * R3b (odd/tasks/talleres-rediseno.md, S1, S2, S5) — client island of
 * /talleres/temporadas on the v2 list anatomy (artboards
 * design/talleres-interior/26 desktop and 27 phone, approved in L6).
 *
 * Top to bottom: breadcrumbs «Talleres / Temporadas» (phone: «‹ Talleres»),
 * the hero with the summary, «Lo que necesita atención» (MetricasAtencion as
 * filters: Abiertas, En borrador, Ediciones bajo el mínimo, Talleres sin
 * edición), «Por dirección» (scope cards, only with two or more direcciones),
 * then the list: search, Vigentes / Historial / Todas, active chips,
 * ListaResponsiva and its footer. Each row opens its DetalleResponsivo
 * (detalle-temporada.tsx); «Crear temporada» is the header action and the
 * phone FAB and opens its form in another DetalleResponsivo.
 *
 * URL state with `history.replaceState` (no server round trip): see
 * vista-temporadas.ts for the params. The states keep their names: Borrador,
 * Abierta, Cerrada, Cancelada (L6).
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, CalendarRange, Plus, Search } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { TarjetasFiltro, type InsigniaTarjeta } from '@/components/ui/TarjetasFiltro'
import { temporadaEstadoLabel } from '@/components/talleres/labels'
import { rutaCatalogo, rutaTemporadas } from '@/lib/platform/talleres/rutas'
import type { TemporadaPanel } from '@/lib/platform/talleres/temporadas'

import { useEsEscritorio } from '@/components/ui/detalle-responsivo'

import { DetalleTemporada, TONO_TEMPORADA } from './detalle-temporada'
import { FormularioTemporada, type DireccionParaCrear } from './formulario-temporada'
import {
  FILTROS_INICIALES,
  alcanceDirecciones,
  consultaDe,
  contarAtencion,
  edicionesBajoMinimo,
  filtrarTemporadas,
  formatearFecha,
  inscritosDe,
  plural,
  resumenTemporadas,
  talleresDe,
  talleresSinEdicion,
  type AtencionTemporadas,
  type FiltrosTemporadas,
  type VistaTemporadas,
} from './vista-temporadas'

export interface TemporadasClientProps {
  readonly temporadas: readonly TemporadaPanel[]
  /** The page's existing write check (director.write | admin.manage); the actions check again. */
  readonly puedeEditar: boolean
  /** Direcciones where the viewer may create a temporada, with their talleres; [] hides «Crear temporada». */
  readonly direccionesCrear: readonly DireccionParaCrear[]
  readonly filtrosIniciales: FiltrosTemporadas
  readonly temporadaInicial: string | null
  readonly crearInicial: boolean
}

const VISTAS: readonly { readonly valor: VistaTemporadas; readonly etiqueta: string }[] = [
  { valor: 'vigentes', etiqueta: 'Vigentes' },
  { valor: 'historial', etiqueta: 'Historial' },
  { valor: 'todas', etiqueta: 'Todas' },
]

const ETIQUETA_ATENCION: Record<AtencionTemporadas, string> = {
  abiertas: 'Abiertas',
  borrador: 'En borrador',
  minimo: 'Ediciones bajo el mínimo',
  'sin-edicion': 'Talleres sin edición',
}

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'temporada', titulo: 'Temporada', ancho: 'minmax(0,1.6fr)' },
  { id: 'estado', titulo: 'Estado', ancho: '112px' },
  { id: 'fechas', titulo: 'Fechas', ancho: '150px' },
  { id: 'talleres', titulo: 'Talleres', ancho: '112px' },
  { id: 'inscritos', titulo: 'Inscritos', ancho: '128px' },
  { id: 'atencion', titulo: 'Atención', ancho: 'minmax(0,1.2fr)', ocultarEnTablet: true },
]

function Num({ children }: { readonly children: number }): ReactElement {
  return <strong className="font-mono font-semibold tabular-nums">{children}</strong>
}

function Migas(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center">
          <Link href={rutaCatalogo()} className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground">
            Talleres
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Temporadas
          </span>
        </li>
      </ol>
    </nav>
  )
}

function Atencion({ temporada }: { readonly temporada: TemporadaPanel }): ReactElement {
  const bajos = edicionesBajoMinimo(temporada).length
  const sin = talleresSinEdicion(temporada)
  const marcas: ReactElement[] = []
  if (bajos > 0) {
    marcas.push(
      <span key="min" className="flex min-w-0 items-center gap-1.5 text-warning-text">
        <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">
          <span className="font-mono tabular-nums">{bajos}</span> {plural(bajos, 'edición bajo el mínimo', 'ediciones bajo el mínimo')}
        </span>
      </span>,
    )
  }
  if (temporada.estado === 'borrador') marcas.push(<span key="b">Sin abrir</span>)
  if (sin.length > 0) {
    marcas.push(
      <span key="sin" className="truncate">
        {sin.map((t) => t.nombre).join(', ')} sin edición aquí
      </span>,
    )
  }
  if (marcas.length === 0) return <span className="text-muted-foreground">{temporada.estado === 'abierto' ? 'Al día' : '—'}</span>
  return <span className="grid min-w-0 gap-0.5 text-[13px] text-muted-foreground">{marcas}</span>
}

export function TemporadasClient({
  temporadas,
  puedeEditar,
  direccionesCrear,
  filtrosIniciales,
  temporadaInicial,
  crearInicial,
}: TemporadasClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? rutaTemporadas()
  const puedeCrear = direccionesCrear.length > 0
  // The phone's 2 × 2 metrics take the short label of artboard 27.
  const telefono = useEsEscritorio() === false

  const [filtros, setFiltros] = useState<FiltrosTemporadas>(filtrosIniciales)
  const [detalle, setDetalle] = useState<{ readonly id: string; readonly abierto: boolean } | null>(
    temporadaInicial ? { id: temporadaInicial, abierto: true } : null,
  )
  const [crear, setCrear] = useState(crearInicial && puedeCrear)

  const temporadaAbierta = detalle?.abierto ? detalle.id : null
  useEffect(() => {
    window.history.replaceState(window.history.state, '', `${pathname}${consultaDe(filtros, { temporada: temporadaAbierta, crear })}`)
  }, [pathname, filtros, temporadaAbierta, crear])

  const visibles = useMemo(() => filtrarTemporadas(temporadas, filtros), [temporadas, filtros])
  const conteo = useMemo(() => contarAtencion(temporadas), [temporadas])
  const resumen = useMemo(() => resumenTemporadas(temporadas), [temporadas])
  const direcciones = useMemo(() => alcanceDirecciones(temporadas), [temporadas])
  const seleccionada = detalle ? (temporadas.find((t) => t.id === detalle.id) ?? null) : null

  function cambiar(parche: Partial<FiltrosTemporadas>): void {
    setFiltros((actual) => ({ ...actual, ...parche }))
  }

  function alternarAtencion(id: string): void {
    const atencion = id as AtencionTemporadas
    // Every metric is about vigentes: leave Historial so the list is not empty.
    cambiar(
      filtros.atencion === atencion
        ? { atencion: null }
        : { atencion, vista: filtros.vista === 'historial' ? 'vigentes' : filtros.vista },
    )
  }

  const limpiar = () => cambiar({ atencion: null, direccion: null, q: '' })
  const abrirCrear = () => {
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    setCrear(true)
  }

  const textoResumen = (
    <>
      <Num>{resumen.abiertas}</Num> {plural(resumen.abiertas, 'abierta', 'abiertas')} · <Num>{resumen.borrador}</Num> en
      borrador · <Num>{resumen.inscritosEnCurso}</Num> inscritos en curso
    </>
  )

  const chips = [
    ...(filtros.atencion ? [{ id: 'atencion', etiqueta: ETIQUETA_ATENCION[filtros.atencion] }] : []),
    ...(filtros.direccion
      ? [{ id: 'direccion', etiqueta: direcciones.find((d) => d.id === filtros.direccion)?.label ?? 'Dirección' }]
      : []),
  ]

  const vacio =
    temporadas.length === 0 ? (
      <EstadoVacioSistema
        icono={CalendarRange}
        titulo="Todavía no hay temporadas"
        subtitulo={puedeCrear ? 'Toca «Crear temporada» para crear la primera.' : 'Cuando tu dirección cree una, la verás aquí.'}
      />
    ) : (
      <EstadoVacioSistema
        icono={CalendarRange}
        titulo="Ninguna temporada con estos filtros"
        subtitulo={`Quita un filtro o cambia a «Todas»${puedeCrear ? '; también puedes crear una' : ''}.`}
        accion={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ ...FILTROS_INICIALES, vista: 'todas' })}>
            Limpiar todo
          </BotonSistema>
        }
      />
    )

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={<Migas />}
      acciones={
        puedeCrear ? (
          <BotonSistema type="button" tamaño="sm" icono={Plus} onClick={abrirCrear} aria-haspopup="dialog">
            Crear temporada
          </BotonSistema>
        ) : null
      }
      className="pb-28 md:pb-0"
    >
      <div className="md:hidden">
        <BotonAtrasMovil atras={{ etiqueta: 'Talleres', href: rutaCatalogo() }} className="-ml-2 mb-1 max-w-[60%]" />
        <TituloGrande titulo="Temporadas" nivel={2} resumen={textoResumen} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Temporadas</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">
          {textoResumen}. Agrupan qué talleres abren inscripción a la vez, por dirección.
        </p>
      </div>

      <section aria-labelledby="temporadas-atencion" className="grid min-w-0 gap-3">
        <h2 id="temporadas-atencion" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          Lo que necesita atención
        </h2>
        <MetricasAtencion
          etiqueta="Lo que necesita atención"
          onAlternar={alternarAtencion}
          metricas={[
            { id: 'abiertas', etiqueta: 'Abiertas', valor: conteo.abiertas, pista: 'Con ediciones recibiendo inscripciones', tono: 'success', activa: filtros.atencion === 'abiertas' },
            { id: 'borrador', etiqueta: 'En borrador', valor: conteo.borrador, pista: 'Planificadas, todavía sin abrir', tono: 'muted', activa: filtros.atencion === 'borrador' },
            { id: 'minimo', etiqueta: telefono ? 'Bajo el mínimo' : 'Ediciones bajo el mínimo', valor: conteo.minimo, pista: 'Aún no llegan al mínimo de aprobados', tono: 'danger', activa: filtros.atencion === 'minimo' },
            { id: 'sin-edicion', etiqueta: 'Talleres sin edición', valor: conteo.sinEdicion, pista: 'Por temporada, sin edición en una vigente', tono: 'info', activa: filtros.atencion === 'sin-edicion' },
          ]}
        />
      </section>

      {direcciones.length > 1 && (
        <section aria-labelledby="temporadas-direccion" className="grid min-w-0 gap-3">
          <h2 id="temporadas-direccion" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
            Por dirección
          </h2>
          <TarjetasFiltro
            presentacion="alcance"
            etiqueta="Filtrar por dirección"
            buscarEtiqueta="Buscar dirección"
            modoCompacto={direcciones.length > 8}
            unidad={{ singular: 'temporada', plural: 'temporadas' }}
            seleccionadoId={filtros.direccion ?? ''}
            onSeleccionar={(id) => cambiar({ direccion: filtros.direccion === id ? null : id })}
            items={direcciones.map((d) => ({
              id: d.id,
              label: d.label,
              subtitulo: null,
              total: d.total,
              badge: null,
              insignias: [
                ...(d.abiertas > 0 ? [{ texto: `${d.abiertas} ${plural(d.abiertas, 'abierta', 'abiertas')}`, tono: 'success' } as InsigniaTarjeta] : []),
                ...(d.borrador > 0 ? [{ texto: `${d.borrador} en borrador`, tono: 'info' } as InsigniaTarjeta] : []),
              ],
            }))}
          />
        </section>
      )}

      <section aria-labelledby="temporadas-lista" className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 id="temporadas-lista" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
            Temporadas
          </h2>
          <div className="min-w-0 flex-[1_1_100%] md:ml-auto md:max-w-sm md:flex-[1_1_240px]">
            <InputSistema
              type="search"
              icono={Search}
              aria-label="Buscar temporadas"
              placeholder="Temporada o taller"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              className="max-md:h-10 max-md:border-transparent max-md:bg-foreground/8"
            />
          </div>
          <ControlSegmentado
            etiqueta="Qué temporadas ver"
            opciones={VISTAS}
            valor={filtros.vista}
            onCambio={(vista) => cambiar({ vista })}
            className="max-md:grid max-md:w-full max-md:grid-cols-3"
          />
        </div>
        <ChipsFiltrosActivos
          chips={chips}
          onQuitar={(id) => cambiar(id === 'atencion' ? { atencion: null } : { direccion: null })}
          onLimpiarTodo={limpiar}
        />
        <ListaResponsiva
          etiqueta="Temporadas"
          columnas={COLUMNAS}
          filas={visibles}
          claveFila={(t) => t.id}
          etiquetaFila={(t) => `Abrir ${t.nombre}`}
          onAbrirFila={(t) => {
            setCrear(false)
            setDetalle({ id: t.id, abierto: true })
          }}
          vacio={vacio}
          renderCelda={(t, columna) => {
            switch (columna) {
              case 'temporada':
                return (
                  <span className="grid min-w-0">
                    <span className="truncate font-medium text-foreground">{t.nombre}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{t.direccionLabel}</span>
                  </span>
                )
              case 'estado':
                return <PuntoEstado tono={TONO_TEMPORADA[t.estado]} etiqueta={temporadaEstadoLabel(t.estado)} />
              case 'fechas':
                return (
                  <span className="grid min-w-0 text-sm">
                    <span className="truncate">{formatearFecha(t.fecha_apertura)} →</span>
                    <span className="truncate text-[13px] text-muted-foreground">{formatearFecha(t.fecha_cierre)}</span>
                  </span>
                )
              case 'talleres':
                return (
                  <span className="grid min-w-0 text-sm">
                    <span>
                      <span className="font-mono tabular-nums">{talleresDe(t)}</span> {plural(talleresDe(t), 'taller', 'talleres')}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      <span className="font-mono tabular-nums">{t.ediciones.length}</span> {plural(t.ediciones.length, 'edición', 'ediciones')}
                    </span>
                  </span>
                )
              case 'inscritos':
                return t.estado === 'borrador' ? (
                  <span className="text-[13px] text-muted-foreground">Aún sin inscripción</span>
                ) : (
                  <span className="grid min-w-0 text-sm">
                    <span>
                      <span className="font-mono font-semibold tabular-nums">{inscritosDe(t)}</span> inscritos
                    </span>
                    <span className="text-[13px] text-muted-foreground">{t.estado === 'abierto' ? 'hasta hoy' : 'en total'}</span>
                  </span>
                )
              default:
                return <Atencion temporada={t} />
            }
          }}
          renderFilaMovil={(t) => {
            const bajos = edicionesBajoMinimo(t).length
            return {
              titulo: t.nombre,
              subtitulo: `${formatearFecha(t.fecha_apertura, false)} → ${formatearFecha(t.fecha_cierre, false)} · ${talleresDe(t)} ${plural(talleresDe(t), 'taller', 'talleres')}${
                t.estado === 'borrador' ? '' : ` · ${inscritosDe(t)} ${plural(inscritosDe(t), 'inscrito', 'inscritos')}`
              }`,
              insignias:
                bajos > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text">
                    <AlertTriangle aria-hidden="true" className="size-3.5" />
                    <span className="font-mono tabular-nums">{bajos}</span>
                    <span className="sr-only">{plural(bajos, 'edición bajo el mínimo', 'ediciones bajo el mínimo')}</span>
                  </span>
                ) : undefined,
              meta: <PuntoEstado tono={TONO_TEMPORADA[t.estado]} etiqueta={temporadaEstadoLabel(t.estado)} />,
            }
          }}
        />
        {visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground md:px-0">
            <span>
              <span className="font-mono tabular-nums">{visibles.length}</span> de{' '}
              <span className="font-mono tabular-nums">{temporadas.length}</span> {plural(temporadas.length, 'temporada', 'temporadas')}
            </span>
            <span>Orden: abiertas, borrador y luego por fecha</span>
          </div>
        )}
      </section>

      {puedeCrear && <BotonFlotante icono={Plus} label="Crear temporada" onClick={abrirCrear} />}

      <DetalleTemporada
        temporada={seleccionada}
        abierto={Boolean(detalle?.abierto && seleccionada)}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        puedeEditar={puedeEditar}
        onCambio={() => router.refresh()}
      />

      {puedeCrear && (
        <FormularioTemporada
          abierto={crear}
          onCambioAbierto={setCrear}
          direcciones={direccionesCrear}
          onCreada={(id) => {
            setCrear(false)
            setFiltros((actual) => ({ ...actual, vista: actual.vista === 'historial' ? 'vigentes' : actual.vista }))
            setDetalle({ id, abierto: true })
            router.refresh()
          }}
        />
      )}
    </PaginaSistema>
  )
}
