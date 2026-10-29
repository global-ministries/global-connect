'use client'

/**
 * Dream Team — client island for /admin/dream-team/servidores (the pool),
 * built on design system v2 (docs/design-system/patterns.md#list-screen-anatomy,
 * prototype docs/design-system/prototipos/servidores.html).
 *
 * Top to bottom: header (desktop breadcrumbs of the tree + "Asignar
 * servicio"), hero (the current level and its numbers), toolbar (search, Filtros, Por persona / Por servicio), the
 * attention metrics that act as filters, the cards of the next tree level
 * (hidden once a leaf equipo is picked), the age pills, and the list with its active-filter chips and footer. A row
 * opens the person's detail drawer, which holds every action.
 *
 * On phones the app shell's header (components/ui/header-movil.tsx) holds the
 * page h1 ("Servidores") and the bell, and has no back slot, so this screen
 * adds no navigation bar: a row in the content carries "‹ parent" and the
 * Filtros button, and under it the large title names the level (an h2; at the
 * root only the summary shows, the header already says "Servidores").
 *
 * Every rule lives in the pure view model
 * (lib/platform/dream-team/servidores-vista.ts); this island keeps the
 * filters in local state and mirrors them into the URL with
 * `router.replace(..., { scroll: false })` (the text search is debounced). The
 * filters start from the URL the server page parsed (`filtrosIniciales`), so
 * a shared link opens the same view, and the legacy `?equipo=` / `?estado=`
 * of the links from Talleres and Estructura keep working.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { UserPlus, Users } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion, type MetricaAtencion } from '@/components/ui/metricas-atencion'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useCampus } from '@/hooks/useCampus'
import { AsignadorServicioDialog, type NodoPlano } from '@/components/dream-team/asignador-servicio-dialog'
import { ContadoresEdad } from '@/components/dream-team/contadores-edad'

import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { Turno } from '@/lib/platform/dream-team/turnos'
import {
  LIMPIAR_FILTROS,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  parcheAtencion,
  type ColumnaOrden,
  type FilaServidor,
  type FiltrosServidores,
  type MetricaAtencionId,
  type Miga,
  type VistaServidores,
} from '@/lib/platform/dream-team/servidores-vista'

import { DetalleServidor } from './detalle-servidor'
import { HojaFiltrosServidores, OPCIONES_VISTA } from './filtros-servidores'
import { ListaServidores } from './lista-servidores'
import { TarjetasUbicacion, etiquetaNivel } from './tarjetas-ubicacion'

export interface ServidoresClientProps {
  readonly filas: readonly FilaServidor[]
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
  readonly filtrosIniciales: FiltrosServidores
  /** Every active campus shift: names the Turno column; the filter offers those of the selected campus. */
  readonly turnos?: readonly Turno[]
}

const RETRASO_BUSQUEDA_MS = 300

/**
 * Flattens the tree into the assigner's "Equipo" picker options — REAL
 * equipos only. A virtual Grupos de Vida node is never offered: assigning a
 * new servicio against it would target an id that isn't a `dream_team_equipos`
 * row. Its children are still walked; only the push is filtered.
 */
function aplanarArbol(nodos: readonly NodoArbol<NodoEquipoArbol>[]): NodoPlano[] {
  const resultado: NodoPlano[] = []
  function visitar(nodo: NodoArbol<NodoEquipoArbol>, ruta: readonly string[]): void {
    const rutaNodo = [...ruta, nodo.equipo.label]
    if (nodo.equipo.origen === 'dream_team') {
      const prefijo = nodo.nivel > 0 ? `${'—'.repeat(nodo.nivel)} ` : ''
      resultado.push({ id: nodo.equipo.id, etiqueta: `${prefijo}${nodo.equipo.label}`, ruta: rutaNodo })
    }
    nodo.hijos.forEach((hijo) => visitar(hijo, rutaNodo))
  }
  nodos.forEach((nodo) => visitar(nodo, []))
  return resultado
}

const SIN_TURNOS: readonly Turno[] = []

/** The four attention metrics of the prototype; "En varios equipos" lives in the sheet. */
function metricasDe({ atencion }: VistaServidores): MetricaAtencion[] {
  const porcentaje = atencion.total > 0 ? Math.round((atencion.sirviendo.personas / atencion.total) * 100) : 0
  const metrica = (id: MetricaAtencionId, etiqueta: string, tono: MetricaAtencion['tono'], pista: string): MetricaAtencion => ({
    id,
    etiqueta,
    valor: atencion[id].personas,
    total: atencion.total,
    pista,
    tono,
    activa: atencion[id].activo,
  })
  return [
    metrica('sirviendo', 'Sirviendo', 'success', `${porcentaje}% del equipo`),
    metrica('porActivar', 'Por activar', 'info', 'postulados y en orientación'),
    metrica('sinCuenta', 'Sin cuenta', 'warning', 'invitalos a la plataforma'),
    metrica('sinTurno', 'Sin turno', 'danger', 'no saben cuándo sirven'),
  ]
}

/**
 * Desktop breadcrumbs of the tree: every level but the current one goes back
 * there. The root reads "Todas las direcciones" (prototype v3), also alone at the root.
 */
function MigasServidores({ migas, onIr }: { readonly migas: readonly Miga[]; readonly onIr: (miga: Miga) => void }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        {migas.map((miga, i) => {
          const actual = i === migas.length - 1
          return (
            <li key={miga.id || 'raiz'} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && (
                <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">
                  /
                </span>
              )}
              {actual ? (
                <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
                  {etiquetaMiga(miga, i)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onIr(miga)}
                  className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11"
                >
                  {etiquetaMiga(miga, i)}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

const etiquetaMiga = (miga: Miga, i: number): string => (i === 0 ? 'Todas las direcciones' : miga.etiqueta)

export function ServidoresClient({
  filas,
  arbol,
  rolesPorEquipo,
  puedeEditar,
  filtrosIniciales,
  turnos = SIN_TURNOS,
}: ServidoresClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const toast = useNotificaciones()
  // The campus selected in the app header; read only, `null` = every campus.
  const { campusId } = useCampus()

  const [filtros, setFiltros] = useState<FiltrosServidores>(filtrosIniciales)
  const [asignadorAbierto, setAsignadorAbierto] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  // The person stays selected after the drawer closes, so the dialogs it opened stay mounted.
  const [detalle, setDetalle] = useState<{ readonly personaId: string; readonly abierto: boolean } | null>(null)
  const temporizadorUrl = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    },
    [],
  )

  const vista = useMemo(
    () => calcularVistaServidores({ filas, arbol, filtros, turnos, campusId }),
    [filas, arbol, filtros, turnos, campusId],
  )
  const nodosPlanos = useMemo(() => aplanarArbol(arbol), [arbol])
  // The assigner offers the shifts of the campus selected in the app (all of them without one).
  const turnosAsignables = useMemo(
    () =>
      turnos
        .filter((turno) => turno.activo && (campusId === null || turno.campusId === campusId))
        .map((turno) => ({ id: turno.id, label: turno.nombre })),
    [turnos, campusId],
  )

  function sincronizarUrl(siguiente: FiltrosServidores, diferir: boolean): void {
    if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    const aplicar = (): void => {
      temporizadorUrl.current = null
      const consulta = escribirFiltrosEnUrl(siguiente)
      router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false })
    }
    if (diferir) temporizadorUrl.current = setTimeout(aplicar, RETRASO_BUSQUEDA_MS)
    else aplicar()
  }

  function cambiar(parche: Partial<FiltrosServidores>): void {
    // Start from the normalized filters so a dirección derived from an equipo is kept.
    const siguiente = { ...vista.filtros, ...parche }
    setFiltros(siguiente)
    const soloBusqueda = Object.keys(parche).length === 1 && 'q' in parche
    sincronizarUrl(siguiente, soloBusqueda)
  }

  function ordenar(columna: ColumnaOrden): void {
    const { orden } = vista.filtros
    cambiar({ orden: { columna, sentido: orden.columna === columna && orden.sentido === 'asc' ? 'desc' : 'asc' } })
  }

  function quitarChip(clave: string): void {
    const pastilla = vista.pastillas.find((p) => p.clave === clave)
    if (pastilla) cambiar(pastilla.parche)
  }

  function refrescar(): void {
    router.refresh()
  }

  function cerrarAsignadorYRefrescar(): void {
    setAsignadorAbierto(false)
    refrescar()
  }

  const { navegacion, tarjetas } = vista
  const { migas } = navegacion
  const anterior = migas.length > 1 ? migas[migas.length - 2] : null
  const porPersona = vista.filtros.agrupar === 'persona'
  // "Dirige Ana Pérez": the name is emphasized, as in the prototype.
  const responsable = navegacion.responsable?.match(/^(\S+) (.+)$/)
  const resumen = (
    <>
      {responsable && (
        <>
          {responsable[1]} <strong className="font-semibold">{responsable[2]}</strong> ·{' '}
        </>
      )}
      <strong className="font-mono tabular-nums">{navegacion.personas}</strong> {navegacion.personas === 1 ? 'persona' : 'personas'} ·{' '}
      <span className="font-mono tabular-nums">{navegacion.servicios}</span> {navegacion.servicios === 1 ? 'servicio' : 'servicios'}
    </>
  )
  const abrirAsignador = (): void => setAsignadorAbierto(true)
  const vacio =
    navegacion.servicios === 0 ? (
      <EstadoVacioSistema
        icono={Users}
        titulo="Todavía no hay servidores acá"
        subtitulo={puedeEditar ? 'Usá «Asignar servicio» para sumar al primero.' : undefined}
      />
    ) : (
      <EstadoVacioSistema
        icono={Users}
        titulo="Nadie coincide con estos filtros"
        subtitulo="Quitá alguno o usá «Limpiar todo»."
        accion={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ ...LIMPIAR_FILTROS, q: '' })}>
            Limpiar todo
          </BotonSistema>
        }
      />
    )

  return (
    // No `titulo`: the h1 is the hero below on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={<MigasServidores migas={migas} onIr={(miga) => cambiar(miga.parche)} />}
      acciones={
        puedeEditar ? (
          // Small header action (36px, 44px on touch); the ::after widens the hit area to 48px (decisions 2026-10-28, 4).
          <BotonSistema
            type="button"
            variante="primario"
            tamaño="sm"
            icono={UserPlus}
            onClick={abrirAsignador}
            className="relative after:absolute after:-inset-x-0.5 after:-inset-y-1.5 after:content-['']"
          >
            Asignar servicio
          </BotonSistema>
        ) : null
      }
      className="pb-28 md:pb-0"
    >
      {/* Filtros sits top right, as in the prototype's nav bar: beside "‹ parent" below the root, beside the summary at it. */}
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className={`flex items-center justify-between gap-2 ${anterior ? '-mx-2 -mt-2 mb-1' : '-mr-2'}`}>
          {anterior ? (
            <BotonAtrasMovil
              atras={{ etiqueta: anterior.etiqueta, onClick: () => cambiar(anterior.parche) }}
              className="max-w-[75%]"
            />
          ) : (
            <TituloGrande resumen={resumen} className="min-w-0 flex-1" />
          )}
          <BotonFiltrosMovil filtrosActivos={vista.filtrosEnHoja} onClick={() => setHojaAbierta(true)} />
        </div>
        {anterior && <TituloGrande titulo={navegacion.titulo} nivel={2} resumen={resumen} />}
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{navegacion.titulo}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumen}</p>
      </div>

      <BarraHerramientas
        busqueda={{
          valor: vista.filtros.q,
          onCambio: (q) => cambiar({ q }),
          placeholder: 'Buscar por nombre o teléfono',
          etiqueta: 'Buscar servidores',
        }}
        filtrosActivos={vista.filtrosEnHoja}
        onAbrirFiltros={() => setHojaAbierta(true)}
        vista={
          <ControlSegmentado
            etiqueta="Vista"
            opciones={OPCIONES_VISTA}
            valor={vista.filtros.agrupar}
            onCambio={(agrupar) => cambiar({ agrupar })}
          />
        }
      />

      <MetricasAtencion
        etiqueta="Necesitan atención"
        metricas={metricasDe(vista)}
        onAlternar={(id) => cambiar(parcheAtencion(vista.filtros, id as MetricaAtencionId))}
      />

      {tarjetas.items.length > 0 && vista.filtros.equipo === null && (
        <section aria-labelledby="servidores-alcance" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
            <h2 id="servidores-alcance" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {etiquetaNivel(tarjetas)}
            </h2>
            <span className="hidden text-xs text-muted-foreground md:inline">
              {etiquetaNivel(tarjetas) === 'Equipos' ? 'Tocá un equipo para ver su gente' : 'Tocá para entrar'}
            </span>
          </div>
          <TarjetasUbicacion vista={vista} onCambio={cambiar} />
        </section>
      )}

      {vista.contadoresEdad && (
        <ContadoresEdad contadores={vista.contadoresEdad} edad={vista.filtros.edad} onEdadChange={(edad) => cambiar({ edad })} />
      )}

      <section aria-labelledby="servidores-lista" className="space-y-3">
        <h2 id="servidores-lista" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          {porPersona ? 'Personas' : 'Servicios'}
        </h2>
        <ChipsFiltrosActivos
          chips={vista.pastillas.map((p) => ({ id: p.clave, etiqueta: p.etiqueta }))}
          onQuitar={quitarChip}
          onLimpiarTodo={() => cambiar(LIMPIAR_FILTROS)}
        />
        <ListaServidores
          vista={vista}
          onOrdenar={ordenar}
          onAbrir={(personaId) => setDetalle({ personaId, abierto: true })}
          vacio={vacio}
        />
        {vista.visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{vista.pie.resumen}</span>
            <span>{vista.pie.orden}</span>
          </div>
        )}
      </section>

      {puedeEditar && <BotonFlotante icono={UserPlus} label="Asignar servicio" onClick={abrirAsignador} />}

      <HojaFiltrosServidores
        vista={vista}
        abierta={hojaAbierta}
        onCambioAbierta={setHojaAbierta}
        onCambio={cambiar}
        onOrdenar={ordenar}
      />

      <DetalleServidor
        persona={detalle ? (vista.fichas.get(detalle.personaId) ?? null) : null}
        abierto={detalle?.abierto ?? false}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        onActualizado={refrescar}
      />

      <AsignadorServicioDialog
        abierto={asignadorAbierto}
        onClose={() => setAsignadorAbierto(false)}
        nodosPlanos={nodosPlanos}
        rolesPorEquipo={rolesPorEquipo}
        onAsignado={cerrarAsignadorYRefrescar}
        toast={toast}
        turnos={turnosAsignables}
      />
    </PaginaSistema>
  )
}
