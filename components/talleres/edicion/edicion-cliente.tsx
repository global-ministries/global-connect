'use client'

/**
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2, S4) — client island of the
 * edición screen (artboards design/talleres-reserva/12 #grupos #seleccion
 * #rechazar and design/talleres-interior/24 #hoja #nueva #rechazar
 * #seleccion; approved in L6). Replaces the legacy tabla-inscripciones.tsx.
 *
 * Two tabs, «Inscripciones» and «Grupos» (the latter only when the viewer
 * manages grupos and the edición has a cohorte; its panel is the
 * server-rendered GruposSection plus the «Sin grupo» card).
 *
 * Inscripciones, top to bottom: «Necesita atención» (MetricasAtencion as
 * filters: Por aprobar, Sin grupo, Por verificar identidad), the toolbar
 * (search, origen switch from md, «Seleccionar»), active chips, the
 * ListaResponsiva and its footer. Each row opens its DetalleInscripcion.
 *
 * «Avisar si se abre lugar» from the artboard is not shown: the
 * taller_avisame_lugar table is revoked for `authenticated`, so the count
 * is not readable from this screen.
 *
 * Selection mode («Seleccionar», only with aprobarInscripciones): the list
 * narrows to «Por aprobar»; pendientes with a confirmed identity toggle
 * their selection (por-verificar ones open their detail instead) and a
 * sticky bar approves the selection with `approveInscripcionAction`, one
 * call per inscripción, then optionally places the approved ones in a
 * grupo through the asignar-grupo route.
 *
 * URL state with `history.replaceState` (no server round trip): see
 * modelo.ts for the params.
 */

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, Search, ShieldAlert, Users } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { unitEstadoLabel } from '@/components/talleres/labels'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { approveInscripcionAction } from '@/lib/platform/talleres/inscripciones-actions'
import { cn } from '@/lib/utils'

import { asignarGrupo } from './asignar-grupo'
import { DetalleInscripcion, EstadoInscrita, MarcasInscrita } from './detalle-inscripcion'
import {
  ETIQUETA_ATENCION,
  ETIQUETA_ORIGEN,
  FILTROS_INICIALES,
  consultaDe,
  contarAtencion,
  esLoteable,
  etiquetaGrupo,
  filtrarInscritas,
  formatearDia,
  plural,
  type AtencionEdicion,
  type FiltrosEdicion,
  type GrupoEdicionOpcion,
  type InscritaEdicion,
  type OrigenInscripcion,
  type VistaEdicion,
} from './modelo'

export interface EdicionClienteProps {
  readonly inscritas: readonly InscritaEdicion[]
  readonly grupos: readonly GrupoEdicionOpcion[]
  /** aprobarInscripciones: approve, reject, select. */
  readonly puedeAprobar: boolean
  /** gestionarGrupos with a cohorte: grupo select and the Grupos tab. */
  readonly puedeAsignar: boolean
  /** The edición is closed: rows show their resultado. */
  readonly mostrarResultado: boolean
  /** The Grupos tab's panel (server-rendered GruposSection); null hides the tab. */
  readonly panelGrupos: ReactNode | null
  readonly vistaInicial: VistaEdicion
  readonly filtrosIniciales: FiltrosEdicion
  readonly itemInicial: string | null
}

const SIN_GRUPO = 'sin-grupo'

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'nombre', titulo: 'Nombre', ancho: 'minmax(0,1.4fr)' },
  { id: 'estado', titulo: 'Estado', ancho: 'minmax(0,1.1fr)' },
  { id: 'origen', titulo: 'Origen', ancho: 'minmax(0,0.8fr)', ocultarEnTablet: true },
  { id: 'grupo', titulo: 'Grupo', ancho: 'minmax(0,0.9fr)' },
  { id: 'solicito', titulo: 'Solicitó', ancho: '112px' },
]

const COLUMNA_RESULTADO: ColumnaLista = { id: 'resultado', titulo: 'Resultado', ancho: '128px' }
// The check is decorative (the row's button selects), so its header has no visible text.
const COLUMNA_SELECCION: ColumnaLista = { id: 'seleccion', titulo: '', ancho: '28px' }

type OpcionOrigen = OrigenInscripcion | 'todas'

const OPCIONES_ORIGEN: readonly { readonly valor: OpcionOrigen; readonly etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'publico', etiqueta: ETIQUETA_ORIGEN.publico },
  { valor: 'app', etiqueta: ETIQUETA_ORIGEN.app },
  { valor: 'admin', etiqueta: ETIQUETA_ORIGEN.admin },
]

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

function nombreFila(i: InscritaEdicion): string {
  return i.companero ? `${i.nombre} y ${i.companero}` : i.nombre
}

function subtituloMovil(i: InscritaEdicion): string {
  if (i.estado === 'pendiente') {
    return `Solicitó el ${formatearDia(i.solicito)}${i.origen ? ` · ${ETIQUETA_ORIGEN[i.origen]}` : ''}`
  }
  if (i.grupoNombre) return i.grupoNombre
  if (i.estado === 'aprobado') return 'Sin grupo todavía'
  return `Solicitó el ${formatearDia(i.solicito)}`
}

export function EdicionCliente({
  inscritas,
  grupos,
  puedeAprobar,
  puedeAsignar,
  mostrarResultado,
  panelGrupos,
  vistaInicial,
  filtrosIniciales,
  itemInicial,
}: EdicionClienteProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const pathname = usePathname() ?? ''
  const telefono = useEsEscritorio() === false

  const conGrupos = panelGrupos !== null
  const [vista, setVista] = useState<VistaEdicion>(conGrupos ? vistaInicial : 'inscripciones')
  const [filtros, setFiltros] = useState<FiltrosEdicion>(filtrosIniciales)
  const [detalle, setDetalle] = useState<{ readonly id: string; readonly abierto: boolean } | null>(
    itemInicial ? { id: itemInicial, abierto: true } : null,
  )
  const [seleccion, setSeleccion] = useState(false)
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [grupoLote, setGrupoLote] = useState(SIN_GRUPO)
  const [aprobandoLote, setAprobandoLote] = useState(false)

  const idAbierto = detalle?.abierto ? detalle.id : null
  useEffect(() => {
    if (!pathname) return
    window.history.replaceState(window.history.state, '', `${pathname}${consultaDe(vista, filtros, idAbierto)}`)
  }, [pathname, vista, filtros, idAbierto])

  const visibles = useMemo(() => filtrarInscritas(inscritas, filtros), [inscritas, filtros])
  const conteo = useMemo(() => contarAtencion(inscritas), [inscritas])
  const loteables = useMemo(() => inscritas.filter(esLoteable), [inscritas])
  const sinGrupo = useMemo(() => inscritas.filter((i) => i.estado === 'aprobado' && !i.grupoId), [inscritas])
  const seleccionada = detalle ? (inscritas.find((i) => i.id === detalle.id) ?? null) : null
  const fueraDelLote = conteo.identidad

  function cambiar(parche: Partial<FiltrosEdicion>): void {
    setFiltros((actual) => ({ ...actual, ...parche }))
  }

  function alternarAtencion(id: string): void {
    const atencion = id as AtencionEdicion
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
    setGrupoLote(SIN_GRUPO)
  }

  function abrir(i: InscritaEdicion): void {
    if (seleccion && puedeAprobar && esLoteable(i)) {
      setMarcadas((actual) => {
        const siguiente = new Set(actual)
        if (siguiente.has(i.id)) siguiente.delete(i.id)
        else siguiente.add(i.id)
        return siguiente
      })
      return
    }
    setDetalle({ id: i.id, abierto: true })
  }

  function abrirDesdeGrupos(i: InscritaEdicion): void {
    setVista('inscripciones')
    setDetalle({ id: i.id, abierto: true })
  }

  function resuelto(mensaje: string): void {
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    toast.success(mensaje)
    router.refresh()
  }

  async function aprobarLote(): Promise<void> {
    const elegidas = loteables.filter((i) => marcadas.has(i.id))
    if (elegidas.length === 0) return
    setAprobandoLote(true)
    const aprobadas: string[] = []
    // One at a time: each approval runs its own notices; a failure does not stop the rest.
    for (const i of elegidas) {
      const resultado = await approveInscripcionAction(i.id)
      if (resultado.ok) aprobadas.push(i.id)
    }
    const grupo = grupoLote === SIN_GRUPO ? null : grupoLote
    const asignacion = grupo && aprobadas.length > 0 ? await asignarGrupo(aprobadas, grupo) : null
    setAprobandoLote(false)
    const n = aprobadas.length
    const fallidas = elegidas.length - n
    if (n > 0) {
      toast.success(
        `Aprobaste ${n} ${plural(n, 'inscripción', 'inscripciones')}${asignacion?.ok ? ' y les asignaste grupo' : ''}. Cada persona recibe el aviso «Aprobada».`,
      )
    }
    if (asignacion && !asignacion.ok) toast.error(`El grupo no se asignó: ${asignacion.mensaje}`)
    if (fallidas > 0) {
      toast.error(`${fallidas} ${plural(fallidas, 'no se pudo aprobar', 'no se pudieron aprobar')}. Ábrelas para revisarlas.`)
    }
    salirSeleccion()
    router.refresh()
  }

  const limpiar = () => cambiar(FILTROS_INICIALES)

  const chips = [
    ...(filtros.atencion ? [{ id: 'atencion', etiqueta: ETIQUETA_ATENCION[filtros.atencion] }] : []),
    ...(filtros.origen ? [{ id: 'origen', etiqueta: `Origen: ${ETIQUETA_ORIGEN[filtros.origen]}` }] : []),
  ]

  const vacio =
    inscritas.length === 0 ? (
      <EstadoVacioSistema
        icono={Users}
        titulo="Nadie se ha inscrito todavía"
        subtitulo={puedeAprobar ? 'Comparte el enlace del taller o toca «Inscribir a alguien».' : 'Cuando alguien se inscriba, aparece aquí.'}
      />
    ) : (
      <EstadoVacioSistema
        icono={Users}
        titulo="Nadie con estos filtros"
        subtitulo="Quita un filtro o toca «Limpiar todo»."
        accion={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={limpiar}>
            Limpiar todo
          </BotonSistema>
        }
      />
    )

  const botonSeleccion =
    puedeAprobar && loteables.length > 0 ? (
      <BotonSistema
        type="button"
        variante={seleccion ? 'secundario' : 'outline'}
        tamaño="sm"
        icono={Check}
        aria-pressed={seleccion}
        onClick={seleccion ? salirSeleccion : entrarSeleccion}
      >
        {seleccion ? 'Listo' : 'Seleccionar'}
      </BotonSistema>
    ) : null

  const columnas = [
    ...(seleccion ? [COLUMNA_SELECCION] : []),
    ...COLUMNAS,
    ...(mostrarResultado ? [COLUMNA_RESULTADO] : []),
  ]

  const inscripciones = (
    <div className="grid min-w-0 gap-6">
      <section aria-labelledby="edicion-atencion" className="grid min-w-0 gap-3">
        <h2 id="edicion-atencion" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          Necesita atención
        </h2>
        <MetricasAtencion
          etiqueta="Necesita atención"
          onAlternar={alternarAtencion}
          metricas={[
            { id: 'aprobar', etiqueta: 'Por aprobar', valor: conteo.aprobar, total: inscritas.length, pista: 'Toda inscripción se aprueba a mano', tono: 'warning', activa: filtros.atencion === 'aprobar' },
            { id: 'sin-grupo', etiqueta: 'Sin grupo', valor: conteo['sin-grupo'], total: inscritas.length, pista: 'Aprobadas sin facilitadora', tono: 'info', activa: filtros.atencion === 'sin-grupo' },
            { id: 'identidad', etiqueta: telefono ? 'Por verificar' : 'Por verificar identidad', valor: conteo.identidad, total: inscritas.length, pista: 'No confirmaron el código', tono: 'danger', activa: filtros.atencion === 'identidad' },
          ]}
        />
      </section>

      <section aria-labelledby="edicion-lista" className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 id="edicion-lista" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
            Inscritas
          </h2>
          {botonSeleccion && <div className="ml-auto md:hidden">{botonSeleccion}</div>}
          <div className="min-w-0 flex-[1_1_100%] md:ml-auto md:max-w-sm md:flex-[1_1_240px]">
            <InputSistema
              type="search"
              icono={Search}
              aria-label="Buscar inscritas"
              placeholder="Nombre o correo"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              className="max-md:h-10 max-md:border-transparent max-md:bg-foreground/8"
            />
          </div>
          <ControlSegmentado
            etiqueta="Origen"
            className="hidden md:inline-flex"
            opciones={OPCIONES_ORIGEN}
            valor={filtros.origen ?? 'todas'}
            onCambio={(valor) => cambiar({ origen: valor === 'todas' ? null : valor })}
          />
          {botonSeleccion && <div className="hidden md:block">{botonSeleccion}</div>}
        </div>
        <ChipsFiltrosActivos
          chips={chips}
          onQuitar={(id) => cambiar(id === 'atencion' ? { atencion: null } : { origen: null })}
          onLimpiarTodo={limpiar}
        />
        <ListaResponsiva
          etiqueta="Inscritas en la edición"
          columnas={columnas}
          filas={visibles}
          claveFila={(i) => i.id}
          etiquetaFila={(i) =>
            seleccion && esLoteable(i)
              ? `${marcadas.has(i.id) ? 'Quitar de la selección a' : 'Seleccionar a'} ${i.nombre}`
              : `Abrir ${i.nombre}`
          }
          onAbrirFila={abrir}
          vacio={vacio}
          renderCelda={(i, columna) => {
            switch (columna) {
              case 'seleccion':
                return esLoteable(i) ? <Casilla marcada={marcadas.has(i.id)} /> : null
              case 'nombre':
                return (
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar nombre={nombreFila(i)} />
                    <span className="grid min-w-0">
                      <span className="truncate font-medium text-foreground">{nombreFila(i)}</span>
                      {i.correo && <span className="truncate text-[13px] text-muted-foreground">{i.correo}</span>}
                    </span>
                  </span>
                )
              case 'estado':
                return (
                  <span className="grid min-w-0 gap-1">
                    <EstadoInscrita inscrita={i} />
                    <MarcasInscrita inscrita={i} />
                  </span>
                )
              case 'origen':
                return <span className="truncate text-sm">{i.origen ? ETIQUETA_ORIGEN[i.origen] : '—'}</span>
              case 'grupo':
                return i.grupoNombre ? (
                  <span className="truncate text-sm">{i.grupoNombre}</span>
                ) : i.estado === 'aprobado' ? (
                  <span className="truncate text-sm font-medium text-warning-text">Sin grupo</span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )
              case 'resultado':
                return <span className="truncate text-sm">{i.resultado ? unitEstadoLabel(i.resultado) : '—'}</span>
              default:
                return <span className="text-sm text-muted-foreground">{formatearDia(i.solicito)}</span>
            }
          }}
          renderFilaMovil={(i) => ({
            titulo: nombreFila(i),
            subtitulo: subtituloMovil(i),
            avatar: seleccion && esLoteable(i) ? <Casilla marcada={marcadas.has(i.id)} /> : <Avatar nombre={nombreFila(i)} />,
            meta: <EstadoInscrita inscrita={i} compacto />,
            insignias:
              i.estado === 'pendiente' && i.porVerificar ? (
                <span className="inline-flex text-danger-text">
                  <ShieldAlert aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">Verificar identidad</span>
                </span>
              ) : undefined,
          })}
        />
        {visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground md:px-0">
            <span>
              <span className="font-mono tabular-nums">{visibles.length}</span> de{' '}
              <span className="font-mono tabular-nums">{inscritas.length}</span>
            </span>
            <span>Orden: solicitud más reciente</span>
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
              {fueraDelLote > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  <span className="font-mono tabular-nums">{fueraDelLote}</span> por aprobar se{' '}
                  {plural(fueraDelLote, 'revisa', 'revisan')} una por una: falta verificar su identidad.
                </p>
              )}
            </div>
            {puedeAsignar && grupos.length > 0 && (
              <div className="min-w-0 md:w-64">
                <SelectSistema
                  label="Grupo para las seleccionadas"
                  value={grupoLote}
                  onValueChange={setGrupoLote}
                  opciones={[
                    { valor: SIN_GRUPO, etiqueta: 'Sin asignar grupo' },
                    ...grupos.map((g) => ({ valor: g.id, etiqueta: etiquetaGrupo(g) })),
                  ]}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-none">
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                disabled={aprobandoLote}
                onClick={() => setMarcadas(new Set(loteables.map((i) => i.id)))}
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
    </div>
  )

  return (
    <>
      {conGrupos ? (
        <TabsSistema
          value={vista}
          onValueChange={(valor) => {
            const siguiente = valor === 'grupos' ? 'grupos' : 'inscripciones'
            if (siguiente === 'grupos') salirSeleccion()
            setVista(siguiente)
          }}
        >
          <TabsList aria-label="Secciones de la edición">
            <TabsTrigger value="inscripciones" className="gap-1.5">
              Inscripciones <span className="font-mono tabular-nums opacity-70">{inscritas.length}</span>
            </TabsTrigger>
            <TabsTrigger value="grupos" className="gap-1.5">
              Grupos <span className="font-mono tabular-nums opacity-70">{grupos.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inscripciones" className="mt-6">
            {inscripciones}
          </TabsContent>
          <TabsContent value="grupos" className="mt-6 grid min-w-0 gap-4">
            {panelGrupos}
            <section aria-labelledby="edicion-sin-grupo" className="rounded-2xl border border-dashed border-border bg-card p-4 md:p-5">
              <h3 id="edicion-sin-grupo" className="text-base font-semibold text-foreground">
                Sin grupo <span className="font-mono tabular-nums text-muted-foreground">({sinGrupo.length})</span>
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {sinGrupo.length === 0
                  ? 'Todas las aprobadas tienen grupo.'
                  : 'Aprobadas que todavía no tienen facilitadora. Al asignarlas reciben el aviso «Grupo asignado».'}
              </p>
              {sinGrupo.length > 0 && (
                <ul className="mt-2 divide-y divide-border/60">
                  {sinGrupo.map((i) => (
                    <li key={i.id} className="flex min-h-11 min-w-0 items-center gap-3 py-1.5">
                      <Avatar nombre={nombreFila(i)} />
                      <span className="min-w-0 flex-1 truncate text-sm">{nombreFila(i)}</span>
                      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => abrirDesdeGrupos(i)} aria-label={`Asignar grupo a ${i.nombre}`}>
                        Asignar
                      </BotonSistema>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>
        </TabsSistema>
      ) : (
        inscripciones
      )}

      <DetalleInscripcion
        inscrita={seleccionada}
        abierto={Boolean(detalle?.abierto && seleccionada)}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        onResuelto={resuelto}
        puedeAprobar={puedeAprobar}
        puedeAsignar={puedeAsignar}
        grupos={grupos}
        mostrarResultado={mostrarResultado}
      />
    </>
  )
}
