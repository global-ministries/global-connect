'use client'

/**
 * R3c (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the v2 /talleres
 * catálogo (artboards design/talleres-interior/18 desktop and 19 phone,
 * approved in L6), on the list anatomy of docs/design-system/patterns.md.
 *
 * Top to bottom: the hero with the summary and the route tabs (Talleres ·
 * Pendientes · Reportes, each only when the viewer may open it; R3l, L11 hid
 * Temporadas;
 * on phones they become the «Más de Talleres» rows at the end), «Lo que
 * necesita atención» (MetricasAtencion as filters: Por aprobar, Ediciones
 * abiertas, Bajo el mínimo, Sin facilitador), «Por dirección» (scope cards:
 * Grupos de Corto Plazo for Conexión, Próximo Paso for DPS), the list of
 * talleres (ListaResponsiva: próxima edición, inscritos / cupo, estado and
 * atención) and «Mis grupos» for a líder. Every row opens its drawer
 * (detalle-taller.tsx); «Nuevo taller» is the header action and the phone
 * FAB, only with `puedeCrear` (the page's existing check).
 *
 * The metrics read only what the page loads (catalogo.ts): the catálogo
 * query and one batched select of the ediciones' grupos. «Sin facilitador»
 * is left out when that select fails. URL state with `history.replaceState`
 * (vista-catalogo.ts for the params).
 */

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ChevronRight, Compass, Inbox, LayoutGrid, Plus, Search, Users } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { MetricasAtencion, type MetricaAtencion } from '@/components/ui/metricas-atencion'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { TarjetasFiltro, type InsigniaTarjeta } from '@/components/ui/TarjetasFiltro'
import { LISTA_PESTANAS, clasePestana } from '@/components/ninos/pestanas-sistema'
import type {
  CatalogoTallerPanel,
  GruposEdicion,
  MiGrupoResumen,
  MiTallerResumen,
} from '@/lib/platform/talleres/catalogo'
import type { OpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'
import { rutaCatalogo, rutaExplorar, rutaPendientes, rutaReportes } from '@/lib/platform/talleres/rutas'

import { DetalleTaller } from './catalogo/detalle-taller'
import { FormularioNuevoTaller } from './catalogo/formulario-nuevo-taller'
import { AtencionFila, BarraCupo, TileTaller } from './catalogo/partes-catalogo'
import {
  DIRECCIONES,
  FILTROS_INICIALES,
  consultaDe,
  construirFilas,
  contarAtencion,
  estadoProxima,
  filtrarFilas,
  formatearDia,
  plural,
  resumenCatalogo,
  unidadDe,
  type AtencionCatalogo,
  type DireccionCatalogo,
  type FilaCatalogo,
  type FiltrosCatalogo,
} from './catalogo/vista-catalogo'

/** Which of the other Talleres screens the viewer may open (route-access.ts capabilities). */
export interface PestanasCatalogo {
  readonly pendientes: boolean
  readonly reportes: boolean
}

export interface CatalogoTalleresClientProps {
  readonly catalogo: readonly CatalogoTallerPanel[]
  /** loadGruposDeEdiciones by edición id; null when it failed (no cupo, no «Sin facilitador»). */
  readonly grupos: Readonly<Record<string, GruposEdicion>> | null
  readonly misGrupos: readonly MiGrupoResumen[]
  /** The page's flat capability check (director.write | admin.manage), create_taller_abstract's own gate. */
  readonly puedeCrear: boolean
  /** Talleres the viewer can edit (talleres_mis_permisos.editar_taller), with abrir_edicion. */
  readonly misTalleres: readonly MiTallerResumen[]
  readonly opciones: OpcionesEquipoTaller
  readonly pestanas: PestanasCatalogo
  readonly filtrosIniciales?: FiltrosCatalogo
  readonly tallerInicial?: string | null
  readonly nuevoInicial?: boolean
}

const ETIQUETA_ATENCION: Record<AtencionCatalogo, string> = {
  pendientes: 'Por aprobar',
  abiertas: 'Ediciones abiertas',
  minimo: 'Bajo el mínimo',
  'sin-facilitador': 'Sin facilitador',
}

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'taller', titulo: 'Taller', ancho: 'minmax(0,1.3fr)' },
  { id: 'proxima', titulo: 'Próxima edición', ancho: 'minmax(0,1.3fr)' },
  { id: 'inscritos', titulo: 'Inscritos', ancho: '180px' },
  { id: 'atencion', titulo: 'Atención', ancho: 'minmax(0,1fr)', ocultarEnTablet: true },
]

function Num({ children }: { readonly children: number }): ReactElement {
  return <strong className="font-mono font-semibold tabular-nums">{children}</strong>
}

function Encabezado({ id, children }: { readonly id: string; readonly children: ReactNode }): ReactElement {
  return (
    <h2 id={id} className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
      {children}
    </h2>
  )
}

function Migas(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 items-center text-sm">
        <li className="flex min-w-0 items-center">
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Talleres
          </span>
        </li>
      </ol>
    </nav>
  )
}

interface Pestana {
  readonly href: string
  readonly etiqueta: string
  readonly detalle: string
  readonly icono: typeof Inbox
}

function pestanasVisibles(pestanas: PestanasCatalogo): Pestana[] {
  return [
    pestanas.pendientes && { href: rutaPendientes(), etiqueta: 'Pendientes', detalle: 'Aprobaciones, retiros y sin grupo', icono: Inbox },
    pestanas.reportes && { href: rutaReportes(), etiqueta: 'Reportes', detalle: 'Inscripciones, asistencia y certificados', icono: BarChart3 },
  ].filter((p): p is Pestana => Boolean(p))
}

function FilaEnlace({ href, icono: Icono, titulo, detalle }: { readonly href: string; readonly icono: typeof Inbox; readonly titulo: string; readonly detalle: string }) {
  return (
    <li className="relative before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden">
      <Link href={href} className="focus-ring flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5 active:bg-accent">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text">
          <Icono className="size-[18px]" />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-base font-semibold text-foreground">{titulo}</span>
          <span className="truncate text-[13px] text-muted-foreground">{detalle}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

function celdaProxima(fila: FilaCatalogo): ReactNode {
  const estado = estadoProxima(fila)
  const e = fila.proxima
  const empieza = formatearDia(e?.fecha_inicio ?? null)
  const cierra = e?.estado === 'abierto' ? formatearDia(e.cierre_inscripcion) : null
  return (
    <span className="grid min-w-0 gap-1">
      <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} />
      {e && (
        <span className="truncate text-[13px] text-muted-foreground">
          {[e.nombre_snapshot, empieza && `empieza el ${empieza}`, cierra && `cierra el ${cierra}`].filter(Boolean).join(' · ')}
        </span>
      )}
    </span>
  )
}

function subtituloMovil(fila: FilaCatalogo): string {
  if (fila.externo) return 'Se gestiona en Próximo Paso'
  const e = fila.proxima
  if (!e) return 'Sin edición vigente'
  const conCupo = fila.cupo !== null && fila.cupo > 0
  const cuenta = conCupo ? `${e.ocupados} de ${fila.cupo} ${unidadDe(e, fila.cupo ?? 0)}` : `${e.ocupados} ${unidadDe(e, e.ocupados)}`
  return `${e.nombre_snapshot} · ${cuenta}`
}

export function CatalogoTalleresClient({
  catalogo,
  grupos,
  misGrupos,
  puedeCrear,
  misTalleres,
  opciones,
  pestanas,
  filtrosIniciales = FILTROS_INICIALES,
  tallerInicial = null,
  nuevoInicial = false,
}: CatalogoTalleresClientProps): ReactElement {
  const pathname = usePathname() ?? rutaCatalogo()
  const [filtros, setFiltros] = useState<FiltrosCatalogo>(filtrosIniciales)
  const [detalle, setDetalle] = useState<{ readonly slug: string; readonly abierto: boolean } | null>(
    tallerInicial ? { slug: tallerInicial, abierto: true } : null,
  )
  const [nuevo, setNuevo] = useState(nuevoInicial && puedeCrear)

  const tallerAbierto = detalle?.abierto ? detalle.slug : null
  useEffect(() => {
    window.history.replaceState(window.history.state, '', `${pathname}${consultaDe(filtros, { taller: tallerAbierto, nuevo })}`)
  }, [pathname, filtros, tallerAbierto, nuevo])

  const mapaGrupos = useMemo(() => (grupos ? new Map(Object.entries(grupos)) : null), [grupos])
  const filas = useMemo(() => construirFilas(catalogo, mapaGrupos, misTalleres), [catalogo, mapaGrupos, misTalleres])
  const visibles = useMemo(() => filtrarFilas(filas, filtros), [filas, filtros])
  const conteo = useMemo(() => contarAtencion(filas, mapaGrupos !== null), [filas, mapaGrupos])
  const resumen = useMemo(() => resumenCatalogo(filas), [filas])
  const seleccionada = detalle ? (filas.find((f) => f.taller.slug === detalle.slug) ?? null) : null
  const otrasPestanas = pestanasVisibles(pestanas)
  const hayEdiciones = catalogo.some((t) => t.ediciones.length > 0)
  const direcciones = (Object.keys(DIRECCIONES) as DireccionCatalogo[]).filter((d) => filas.some((f) => f.direccion === d))

  function cambiar(parche: Partial<FiltrosCatalogo>): void {
    setFiltros((actual) => ({ ...actual, ...parche }))
  }
  const abrirNuevo = () => {
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    setNuevo(true)
  }

  const textoResumen = (
    <>
      <Num>{resumen.talleres}</Num> {plural(resumen.talleres, 'taller', 'talleres')} · <Num>{resumen.abiertas}</Num>{' '}
      {plural(resumen.abiertas, 'edición con inscripción abierta', 'ediciones con inscripción abierta')}
      {resumen.pendientes > 0 && (
        <>
          {' · '}
          <Num>{resumen.pendientes}</Num> {plural(resumen.pendientes, 'inscripción por aprobar', 'inscripciones por aprobar')}
        </>
      )}
    </>
  )

  const metricas: MetricaAtencion[] = [
    { id: 'pendientes', etiqueta: 'Por aprobar', valor: conteo.pendientes, pista: 'Inscripciones esperando una decisión', tono: 'warning', activa: filtros.atencion === 'pendientes' },
    { id: 'abiertas', etiqueta: 'Ediciones abiertas', valor: conteo.abiertas, pista: 'Con inscripción abierta ahora', tono: 'success', activa: filtros.atencion === 'abiertas' },
    { id: 'minimo', etiqueta: 'Bajo el mínimo', valor: conteo.minimo, pista: 'Aún no llegan al mínimo de aprobados', tono: 'danger', activa: filtros.atencion === 'minimo' },
    ...(conteo.sinFacilitador !== null
      ? [{ id: 'sin-facilitador', etiqueta: 'Sin facilitador', valor: conteo.sinFacilitador, pista: 'Grupos sin quien los dirija', tono: 'info', activa: filtros.atencion === 'sin-facilitador' } as MetricaAtencion]
      : []),
  ]

  const chips = [
    ...(filtros.atencion ? [{ id: 'atencion', etiqueta: ETIQUETA_ATENCION[filtros.atencion] }] : []),
    ...(filtros.direccion ? [{ id: 'direccion', etiqueta: DIRECCIONES[filtros.direccion].nombre }] : []),
  ]

  const enlaceExplorar = (
    <BotonSistema asChild variante="outline" tamaño="sm" icono={Compass}>
      <Link href={rutaExplorar()}>Explorar</Link>
    </BotonSistema>
  )

  const vacio =
    catalogo.length === 0 ? (
      <EstadoVacioSistema
        icono={LayoutGrid}
        titulo="Aún no hay talleres"
        subtitulo={puedeCrear ? 'Toca «Nuevo taller» para crear el primero.' : 'Explora los talleres abiertos para inscribirte.'}
        accion={puedeCrear ? undefined : enlaceExplorar}
      />
    ) : (
      <EstadoVacioSistema
        icono={LayoutGrid}
        titulo="Ningún taller con estos filtros"
        subtitulo="Quita un filtro o toca «Limpiar todo»."
        accion={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setFiltros(FILTROS_INICIALES)}>
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
        <div className="flex items-center gap-2">
          {enlaceExplorar}
          {puedeCrear && (
            <BotonSistema type="button" tamaño="sm" icono={Plus} onClick={abrirNuevo} aria-haspopup="dialog">
              Nuevo taller
            </BotonSistema>
          )}
        </div>
      }
      className="pb-28 md:pb-0"
    >
      <TituloGrande titulo="Talleres" nivel={2} resumen={textoResumen} />
      <div className="hidden min-w-0 md:grid md:gap-3">
        <div>
          <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Talleres</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{textoResumen}</p>
        </div>
        {otrasPestanas.length > 0 && (
          <nav aria-label="Secciones de Talleres" className={`${LISTA_PESTANAS} w-fit`}>
            <Link href={rutaCatalogo()} aria-current="page" className={clasePestana(true)}>
              Talleres
            </Link>
            {otrasPestanas.map((p) => (
              <Link key={p.href} href={p.href} className={clasePestana(false)}>
                {p.etiqueta}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {hayEdiciones && (
        <section aria-labelledby="catalogo-atencion" className="grid min-w-0 gap-3">
          <Encabezado id="catalogo-atencion">Lo que necesita atención</Encabezado>
          <MetricasAtencion
            etiqueta="Lo que necesita atención"
            metricas={metricas}
            onAlternar={(id) => cambiar({ atencion: filtros.atencion === id ? null : (id as AtencionCatalogo) })}
          />
        </section>
      )}

      {direcciones.length > 1 && (
        <section aria-labelledby="catalogo-direccion" className="grid min-w-0 gap-3">
          <Encabezado id="catalogo-direccion">Por dirección</Encabezado>
          <TarjetasFiltro
            presentacion="alcance"
            etiqueta="Filtrar por dirección"
            buscarEtiqueta="Buscar dirección"
            modoCompacto={false}
            unidad={{ singular: 'taller', plural: 'talleres' }}
            seleccionadoId={filtros.direccion ?? ''}
            onSeleccionar={(id) => cambiar({ direccion: filtros.direccion === id ? null : (id as DireccionCatalogo) })}
            items={direcciones.map((d) => {
              const deDireccion = filas.filter((f) => f.direccion === d)
              const abiertas = deDireccion.reduce((total, f) => total + f.abiertas, 0)
              const pendientes = deDireccion.reduce((total, f) => total + f.pendientes, 0)
              const insignias: InsigniaTarjeta[] = [
                ...(abiertas > 0 ? [{ texto: `${abiertas} ${plural(abiertas, 'edición abierta', 'ediciones abiertas')}`, tono: 'success' } as const] : []),
                ...(pendientes > 0 ? [{ texto: `${pendientes} por aprobar`, tono: 'warning' } as const] : []),
                ...(d === 'dps' ? [{ texto: 'Su página es Próximo Paso', tono: 'info' } as const] : []),
              ]
              return {
                id: d,
                label: DIRECCIONES[d].nombre,
                subtitulo: `${DIRECCIONES[d].direccion} · ${deDireccion.map((f) => f.taller.nombre).join(', ')}`,
                subtituloCorto: DIRECCIONES[d].direccion,
                total: deDireccion.length,
                badge: null,
                insignias,
              }
            })}
          />
        </section>
      )}

      <section aria-labelledby="catalogo-lista" className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Encabezado id="catalogo-lista">Talleres</Encabezado>
          <div className="min-w-0 flex-[1_1_100%] md:ml-auto md:max-w-sm md:flex-[1_1_240px]">
            <InputSistema
              type="search"
              icono={Search}
              aria-label="Buscar talleres"
              placeholder="Buscar taller"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              className="max-md:h-10 max-md:border-transparent max-md:bg-foreground/8"
            />
          </div>
        </div>
        <ChipsFiltrosActivos
          chips={chips}
          onQuitar={(id) => cambiar(id === 'atencion' ? { atencion: null } : { direccion: null })}
          onLimpiarTodo={() => cambiar({ atencion: null, direccion: null })}
        />
        <ListaResponsiva
          etiqueta="Talleres"
          columnas={COLUMNAS}
          filas={visibles}
          claveFila={(f) => f.taller.id}
          etiquetaFila={(f) => `Abrir ${f.taller.nombre}`}
          onAbrirFila={(f) => {
            setNuevo(false)
            setDetalle({ slug: f.taller.slug, abierto: true })
          }}
          vacio={vacio}
          renderCelda={(f, columna) => {
            switch (columna) {
              case 'taller':
                return (
                  <span className="flex min-w-0 items-center gap-3">
                    <TileTaller fila={f} />
                    <span className="grid min-w-0">
                      <span className="truncate font-medium text-foreground">{f.taller.nombre}</span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {DIRECCIONES[f.direccion].nombre}
                        {f.taller.estado === 'archived' ? ' · Archivado' : ''}
                      </span>
                    </span>
                  </span>
                )
              case 'proxima':
                return celdaProxima(f)
              case 'inscritos':
                return f.proxima ? <BarraCupo fila={f} compacta /> : <span className="text-[13px] text-muted-foreground">—</span>
              default:
                return <AtencionFila fila={f} />
            }
          }}
          renderFilaMovil={(f) => {
            const estado = estadoProxima(f)
            return {
              avatar: <TileTaller fila={f} />,
              titulo: f.taller.nombre,
              subtitulo: subtituloMovil(f),
              insignias:
                f.pendientes > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text">
                    <span className="font-mono tabular-nums">{f.pendientes}</span>
                    <span className="sr-only">por aprobar</span>
                  </span>
                ) : undefined,
              meta: <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} ocultarEtiquetaEnMovil />,
            }
          }}
        />
        {visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground md:px-0">
            <span>
              <span className="font-mono tabular-nums">{visibles.length}</span> de{' '}
              <span className="font-mono tabular-nums">{filas.length}</span> {plural(filas.length, 'taller', 'talleres')}
            </span>
            <span>Orden: lo que necesita atención primero</span>
          </div>
        )}
      </section>

      {misGrupos.length > 0 && (
        <section aria-labelledby="mis-grupos-heading" className="grid min-w-0 gap-3">
          <Encabezado id="mis-grupos-heading">Mis grupos</Encabezado>
          <ul className="overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
            {misGrupos.map((g) => {
              const proxima = formatearDia(g.proximaClase)
              const textoClase = proxima ? `Próxima clase: ${proxima}` : 'Sin próxima clase'
              return (
                <li
                  key={g.id}
                  className="relative flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5 before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden"
                >
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text">
                    <Users className="size-[18px]" />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-semibold text-foreground">{g.nombre}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {[g.tallerNombre, g.edicionNombre].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground md:hidden">{textoClase}</span>
                  </span>
                  <span className="hidden shrink-0 text-right text-[13px] text-muted-foreground md:block">
                    {textoClase}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="catalogo-mas" className="grid min-w-0 gap-3 md:hidden">
        <Encabezado id="catalogo-mas">Más de Talleres</Encabezado>
        <ul className="overflow-hidden rounded-2xl bg-card">
          <FilaEnlace href={rutaExplorar()} icono={Compass} titulo="Explorar talleres" detalle="Los talleres abiertos para inscribirte" />
          {otrasPestanas.map((p) => (
            <FilaEnlace key={p.href} href={p.href} icono={p.icono} titulo={p.etiqueta} detalle={p.detalle} />
          ))}
        </ul>
      </section>

      {puedeCrear && <BotonFlotante icono={Plus} label="Nuevo taller" onClick={abrirNuevo} />}

      <DetalleTaller
        fila={seleccionada}
        abierto={Boolean(detalle?.abierto && seleccionada)}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        puedeVerPendientes={pestanas.pendientes}
      />

      {puedeCrear && <FormularioNuevoTaller abierto={nuevo} onCambioAbierto={setNuevo} opciones={opciones} />}
    </PaginaSistema>
  )
}
