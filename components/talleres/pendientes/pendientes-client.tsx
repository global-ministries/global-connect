'use client'

/**
 * R3e (odd/tasks/talleres-rediseno.md, S1, S2, S4) — client island of
 * /talleres/pendientes on the v2 list anatomy (artboard
 * design/talleres-interior/23, hash states #lista #identidad #grupo
 * #rechazar #seleccion; approved in L6).
 *
 * Top to bottom: breadcrumbs «Talleres / Pendientes» (phone: «‹ Talleres»)
 * and «Aprobar varias» in the header, the hero with the summary, «Qué espera
 * tu decisión» (MetricasAtencion as filters: Por aprobar, Por verificar
 * identidad, Solicitudes de retiro, Sin grupo), «Por taller» (scope cards,
 * with two or more talleres), then the list: search, active chips,
 * ListaResponsiva and its footer. Each row opens its DetalleResponsivo
 * (detalle-pendiente.tsx).
 *
 * Selection mode («Aprobar varias»): the list narrows to «Por aprobar», rows
 * the viewer may approve in bulk toggle their selection (por-verificar ones
 * and the ones of a taller the viewer does not coordinate open their detail
 * instead) and a sticky bar approves the selection with the same
 * `approveInscripcionAction`, one call per inscripción.
 *
 * URL state with `history.replaceState` (no server round trip): see
 * vista-pendientes.ts for the params.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, Inbox, Search, ShieldAlert } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { TarjetasFiltro, type InsigniaTarjeta } from '@/components/ui/TarjetasFiltro'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { approveInscripcionAction } from '@/lib/platform/talleres/inscripciones-actions'
import { rutaCatalogo, rutaPendientes } from '@/lib/platform/talleres/rutas'
import { cn } from '@/lib/utils'

import { DetallePendiente, EstadoItem, MarcasItem } from './detalle-pendiente'
import {
  ETIQUETA_ATENCION,
  ETIQUETA_ORIGEN,
  FILTROS_INICIALES,
  alcanceTalleres,
  consultaDe,
  contarAtencion,
  diasEsperando,
  esLoteable,
  filtrarPendientes,
  formatearDia,
  plural,
  resumenPendientes,
  textoEspera,
  type AtencionPendientes,
  type FiltrosPendientes,
  type ItemPendiente,
} from './vista-pendientes'

export interface PendientesClientProps {
  readonly items: readonly ItemPendiente[]
  /** «Now» from the server, so the days waiting match on both sides. */
  readonly hoy: string
  readonly filtrosIniciales: FiltrosPendientes
  readonly itemInicial: string | null
}

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'persona', titulo: 'Persona', ancho: 'minmax(0,1.3fr)' },
  { id: 'que', titulo: 'Qué espera', ancho: 'minmax(0,1.2fr)' },
  { id: 'taller', titulo: 'Taller', ancho: 'minmax(0,1fr)', ocultarEnTablet: true },
  { id: 'espera', titulo: 'Esperando', ancho: '128px' },
]

// The check is decorative (the row's button selects), so its header has no visible text.
const COLUMNA_SELECCION: ColumnaLista = { id: 'seleccion', titulo: '', ancho: '28px' }

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
            Pendientes
          </span>
        </li>
      </ol>
    </nav>
  )
}

/** Round initials avatar (decorative; the name is next to it). */
function Avatar({ nombre }: { readonly nombre: string }): ReactElement {
  const iniciales = nombre
    .split(' ')
    .filter((p) => p && p !== 'y')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-brand-text">
      {iniciales || '·'}
    </span>
  )
}

/** The visual check of selection mode; the row's own button is the control. */
function Casilla({ marcada }: { readonly marcada: boolean }): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-casilla={marcada ? 'marcada' : 'vacia'}
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors',
        marcada ? 'border-brand bg-brand-strong text-white' : 'border-border bg-card',
      )}
    >
      {marcada && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  )
}

export function PendientesClient({ items, hoy, filtrosIniciales, itemInicial }: PendientesClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const pathname = usePathname() ?? rutaPendientes()
  const telefono = useEsEscritorio() === false

  const [filtros, setFiltros] = useState<FiltrosPendientes>(filtrosIniciales)
  const [detalle, setDetalle] = useState<{ readonly clave: string; readonly abierto: boolean } | null>(
    itemInicial ? { clave: itemInicial, abierto: true } : null,
  )
  const [seleccion, setSeleccion] = useState(false)
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [aprobandoLote, setAprobandoLote] = useState(false)

  const claveAbierta = detalle?.abierto ? detalle.clave : null
  useEffect(() => {
    window.history.replaceState(window.history.state, '', `${pathname}${consultaDe(filtros, claveAbierta)}`)
  }, [pathname, filtros, claveAbierta])

  const visibles = useMemo(() => filtrarPendientes(items, filtros), [items, filtros])
  const conteo = useMemo(() => contarAtencion(items), [items])
  const resumen = useMemo(() => resumenPendientes(items, hoy), [items, hoy])
  const talleres = useMemo(() => alcanceTalleres(items), [items])
  const loteables = useMemo(() => items.filter(esLoteable), [items])
  const seleccionado = detalle ? (items.find((i) => i.clave === detalle.clave) ?? null) : null
  const porAprobar = conteo.aprobar
  const fueraDelLote = items.filter((i) => i.tipo === 'aprobar' && !esLoteable(i)).length

  function cambiar(parche: Partial<FiltrosPendientes>): void {
    setFiltros((actual) => ({ ...actual, ...parche }))
  }

  function alternarAtencion(id: string): void {
    const atencion = id as AtencionPendientes
    cambiar({ atencion: filtros.atencion === atencion ? null : atencion })
  }

  function entrarSeleccion(): void {
    setSeleccion(true)
    setMarcadas(new Set())
    cambiar({ atencion: 'aprobar' })
  }

  function salirSeleccion(): void {
    setSeleccion(false)
    setMarcadas(new Set())
  }

  function alternarMarca(item: ItemPendiente): void {
    setMarcadas((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(item.clave)) siguiente.delete(item.clave)
      else siguiente.add(item.clave)
      return siguiente
    })
  }

  function abrir(item: ItemPendiente): void {
    if (seleccion && esLoteable(item)) {
      alternarMarca(item)
      return
    }
    setDetalle({ clave: item.clave, abierto: true })
  }

  function resuelto(mensaje: string): void {
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    toast.success(mensaje)
    router.refresh()
  }

  async function aprobarLote(): Promise<void> {
    const elegidas = loteables.filter((i) => marcadas.has(i.clave))
    if (elegidas.length === 0) return
    setAprobandoLote(true)
    let aprobadas = 0
    // One at a time: each approval runs its own notices; a failure does not stop the rest.
    for (const item of elegidas) {
      const resultado = await approveInscripcionAction(item.id)
      if (resultado.ok) aprobadas += 1
    }
    setAprobandoLote(false)
    const fallidas = elegidas.length - aprobadas
    if (aprobadas > 0) {
      toast.success(
        `Aprobaste ${aprobadas} ${plural(aprobadas, 'inscripción', 'inscripciones')}. Cada persona recibe el aviso «Aprobada».`,
      )
    }
    if (fallidas > 0) {
      toast.error(`${fallidas} ${plural(fallidas, 'no se pudo aprobar', 'no se pudieron aprobar')}. Ábrelas para revisarlas.`)
    }
    salirSeleccion()
    router.refresh()
  }

  const limpiar = () => cambiar(FILTROS_INICIALES)

  const textoResumen =
    resumen.total === 0 ? (
      <>Nada espera tu decisión ahora.</>
    ) : (
      <>
        <Num>{resumen.total}</Num> {plural(resumen.total, 'cosa espera', 'cosas esperan')} tu decisión en{' '}
        <Num>{resumen.talleres}</Num> {plural(resumen.talleres, 'taller', 'talleres')} · la más antigua,{' '}
        {resumen.masAntigua === 0 ? 'de hoy' : resumen.masAntigua === 1 ? 'de ayer' : (
          <>
            hace <Num>{resumen.masAntigua}</Num> días
          </>
        )}
      </>
    )

  const chips = [
    ...(filtros.atencion ? [{ id: 'atencion', etiqueta: ETIQUETA_ATENCION[filtros.atencion] }] : []),
    ...(filtros.taller
      ? [{ id: 'taller', etiqueta: talleres.find((t) => t.clave === filtros.taller)?.nombre ?? 'Taller' }]
      : []),
  ]

  const vacio =
    items.length === 0 ? (
      <EstadoVacioSistema
        icono={Inbox}
        titulo="No tienes nada pendiente"
        subtitulo="Cuando algo necesite tu decisión, aparece aquí."
      />
    ) : (
      <EstadoVacioSistema
        icono={Inbox}
        titulo="Nada con estos filtros"
        subtitulo="Quita un filtro o toca «Limpiar todo»."
        accion={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={limpiar}>
            Limpiar todo
          </BotonSistema>
        }
      />
    )

  const botonSeleccion =
    porAprobar > 0 && loteables.length > 0 ? (
      <BotonSistema
        type="button"
        variante={seleccion ? 'secundario' : 'outline'}
        tamaño="sm"
        icono={Check}
        aria-pressed={seleccion}
        onClick={seleccion ? salirSeleccion : entrarSeleccion}
      >
        Aprobar varias
      </BotonSistema>
    ) : null

  const columnas = seleccion ? [COLUMNA_SELECCION, ...COLUMNAS] : COLUMNAS

  return (
    // No `titulo`: the h1 is the hero on desktop and the large title on phones (one h1 per width).
    <PaginaSistema breadcrumbs={<Migas />} acciones={botonSeleccion} className="pb-28 md:pb-0">
      <div className="md:hidden">
        <BotonAtrasMovil atras={{ etiqueta: 'Talleres', href: rutaCatalogo() }} className="-ml-2 mb-1 max-w-[60%]" />
        <TituloGrande titulo="Pendientes" nivel={2} resumen={textoResumen} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Pendientes</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{textoResumen}</p>
      </div>

      <section aria-labelledby="pendientes-atencion" className="grid min-w-0 gap-3">
        <h2 id="pendientes-atencion" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          Qué espera tu decisión
        </h2>
        <MetricasAtencion
          etiqueta="Qué espera tu decisión"
          onAlternar={alternarAtencion}
          metricas={[
            { id: 'aprobar', etiqueta: 'Por aprobar', valor: conteo.aprobar, total: items.length, pista: 'Toda inscripción se aprueba a mano', tono: 'warning', activa: filtros.atencion === 'aprobar' },
            { id: 'identidad', etiqueta: telefono ? 'Por verificar' : 'Por verificar identidad', valor: conteo.identidad, total: items.length, pista: 'No confirmaron el código', tono: 'danger', activa: filtros.atencion === 'identidad' },
            { id: 'retiro', etiqueta: telefono ? 'Retiros' : 'Solicitudes de retiro', valor: conteo.retiro, total: items.length, pista: 'Piden salir de una edición', tono: 'info', activa: filtros.atencion === 'retiro' },
            { id: 'sin-grupo', etiqueta: 'Sin grupo', valor: conteo['sin-grupo'], total: items.length, pista: 'Aprobadas sin grupo todavía', tono: 'muted', activa: filtros.atencion === 'sin-grupo' },
          ]}
        />
      </section>

      {talleres.length > 1 && (
        <section aria-labelledby="pendientes-taller" className="grid min-w-0 gap-3">
          <h2 id="pendientes-taller" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
            Por taller
          </h2>
          <TarjetasFiltro
            presentacion="alcance"
            etiqueta="Filtrar por taller"
            buscarEtiqueta="Buscar taller"
            modoCompacto={talleres.length > 8}
            unidad={{ singular: 'pendiente', plural: 'pendientes' }}
            seleccionadoId={filtros.taller ?? ''}
            onSeleccionar={(id) => cambiar({ taller: filtros.taller === id ? null : id })}
            items={talleres.map((t) => ({
              id: t.clave,
              label: t.nombre,
              subtitulo: null,
              total: t.total,
              badge: null,
              insignias: [
                ...(t.porVerificar > 0 ? [{ texto: `${t.porVerificar} por verificar`, tono: 'danger' } as InsigniaTarjeta] : []),
                ...(t.retiros > 0
                  ? [{ texto: `${t.retiros} ${plural(t.retiros, 'retiro', 'retiros')}`, tono: 'info' } as InsigniaTarjeta]
                  : []),
              ],
            }))}
          />
        </section>
      )}

      <section aria-labelledby="pendientes-lista" className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 id="pendientes-lista" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
            Pendientes
          </h2>
          {botonSeleccion && <div className="ml-auto md:hidden">{botonSeleccion}</div>}
          <div className="min-w-0 flex-[1_1_100%] md:ml-auto md:max-w-sm md:flex-[1_1_240px]">
            <InputSistema
              type="search"
              icono={Search}
              aria-label="Buscar pendientes"
              placeholder="Nombre, correo o taller"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              className="max-md:h-10 max-md:border-transparent max-md:bg-foreground/8"
            />
          </div>
        </div>
        <ChipsFiltrosActivos
          chips={chips}
          onQuitar={(id) => cambiar(id === 'atencion' ? { atencion: null } : { taller: null })}
          onLimpiarTodo={limpiar}
        />
        <ListaResponsiva
          etiqueta="Pendientes"
          columnas={columnas}
          filas={visibles}
          claveFila={(i) => i.clave}
          etiquetaFila={(i) =>
            seleccion && esLoteable(i)
              ? `${marcadas.has(i.clave) ? 'Quitar de la selección a' : 'Seleccionar a'} ${i.nombre}`
              : `Abrir ${i.nombre}`
          }
          onAbrirFila={abrir}
          vacio={vacio}
          renderCelda={(i, columna) => {
            const dias = diasEsperando(i.fecha, hoy)
            switch (columna) {
              case 'seleccion':
                return esLoteable(i) ? <Casilla marcada={marcadas.has(i.clave)} /> : null
              case 'persona':
                return (
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar nombre={i.nombre} />
                    <span className="grid min-w-0">
                      <span className="truncate font-medium text-foreground">{i.nombre}</span>
                      {i.correo && <span className="truncate text-[13px] text-muted-foreground">{i.correo}</span>}
                    </span>
                  </span>
                )
              case 'que':
                return (
                  <span className="grid min-w-0 gap-1">
                    <EstadoItem item={i} />
                    <MarcasItem item={i} />
                  </span>
                )
              case 'taller':
                return (
                  <span className="grid min-w-0 text-sm">
                    <span className="truncate">{i.tallerNombre}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {i.tipo === 'retiro'
                        ? i.tipoRetiro === 'equipo_retiro_definitivo'
                          ? 'Retiro del equipo'
                          : 'Retiro de participante'
                        : [i.edicionNombre, i.origen ? ETIQUETA_ORIGEN[i.origen] : null].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                )
              default:
                return (
                  <span className="grid min-w-0 text-sm">
                    <span className={dias >= 5 ? 'font-medium text-warning-text' : 'text-foreground'}>{textoEspera(dias)}</span>
                    <span className="text-[13px] text-muted-foreground">{formatearDia(i.fecha)}</span>
                  </span>
                )
            }
          }}
          renderFilaMovil={(i) => {
            const dias = diasEsperando(i.fecha, hoy)
            return {
              titulo: i.nombre,
              subtitulo: `${i.tallerNombre} · ${textoEspera(dias).toLowerCase()}`,
              avatar: seleccion && esLoteable(i) ? <Casilla marcada={marcadas.has(i.clave)} /> : <Avatar nombre={i.nombre} />,
              meta: <EstadoItem item={i} compacto />,
              insignias: i.porVerificar ? (
                <span className="inline-flex text-danger-text">
                  <ShieldAlert aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">Verificar identidad</span>
                </span>
              ) : undefined,
            }
          }}
        />
        {visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground md:px-0">
            <span>
              <span className="font-mono tabular-nums">{visibles.length}</span> de{' '}
              <span className="font-mono tabular-nums">{items.length}</span>
            </span>
            <span>Orden: retiros primero, luego lo que lleva más tiempo esperando</span>
          </div>
        )}

        {seleccion && (
          <div
            role="region"
            aria-label="Acciones en lote"
            className="sticky bottom-[calc(max(env(safe-area-inset-bottom),8px)+4.5rem)] z-10 grid gap-3 rounded-2xl border border-border bg-card p-3 shadow-sheet md:bottom-4 md:flex md:items-center md:p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">
                <span className="font-mono tabular-nums">{marcadas.size}</span>{' '}
                {plural(marcadas.size, 'seleccionada', 'seleccionadas')}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {fueraDelLote > 0 && (
                  <>
                    <span className="font-mono tabular-nums">{fueraDelLote}</span> por aprobar se{' '}
                    {plural(fueraDelLote, 'revisa', 'revisan')} una por una (identidad o permiso).{' '}
                  </>
                )}
                Los grupos se asignan después, en cada edición.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-none">
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                disabled={aprobandoLote}
                onClick={() => setMarcadas(new Set(loteables.map((i) => i.clave)))}
              >
                Seleccionar las {loteables.length}
              </BotonSistema>
              <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={aprobandoLote} onClick={salirSeleccion}>
                Cancelar
              </BotonSistema>
              <BotonSistema
                type="button"
                tamaño="sm"
                icono={Check}
                cargando={aprobandoLote}
                disabled={marcadas.size === 0 || aprobandoLote}
                onClick={() => void aprobarLote()}
                className="col-span-2"
              >
                {marcadas.size > 0 ? `Aprobar ${marcadas.size}` : 'Aprobar'}
              </BotonSistema>
            </div>
          </div>
        )}
      </section>

      <DetallePendiente
        item={seleccionado}
        abierto={Boolean(detalle?.abierto && seleccionado)}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        onResuelto={resuelto}
      />
    </PaginaSistema>
  )
}
