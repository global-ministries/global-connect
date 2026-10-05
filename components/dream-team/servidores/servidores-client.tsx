'use client'

/**
 * Dream Team — client island for /admin/dream-team/servidores (the pool).
 *
 * The screen answers work questions: who serves where, in which etapa, who has
 * no account, who serves in several teams. Every rule lives in the pure view
 * model (lib/platform/dream-team/servidores-vista.ts); this island keeps the
 * filters in local state, mirrors them into the URL with
 * `router.replace(..., { scroll: false })` (the text search is debounced) and
 * renders: etapa counters as filters, the visible filter bar, the active-filter
 * pills and the table.
 *
 * The filters start from the URL the server page parsed (`filtrosIniciales`),
 * so a shared link opens the same view, and the legacy `?equipo=` / `?estado=`
 * of the links from Talleres and Estructura keep working.
 *
 * Everything that crosses in from the server page is plain serializable data;
 * icons and callbacks are created here. "Asignar servicio" (header button and
 * the phone's floating button) opens the extracted assigner dialog.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'

import { BotonSistema, ContenedorDashboard, TextoSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { AsignadorServicioDialog, type NodoPlano } from '@/components/dream-team/asignador-servicio-dialog'

import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { Turno } from '@/lib/platform/dream-team/turnos'
import {
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  type ColumnaOrden,
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'

import { BarraFiltros } from './barra-filtros'
import { ContadoresEtapa } from './contadores-etapa'
import { PastillasFiltros } from './pastillas-filtros'
import { TablaServidores } from './tabla-servidores'
import { TarjetasServidores } from './tarjetas-servidores'

export interface ServidoresClientProps {
  readonly filas: readonly FilaServidor[]
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
  readonly filtrosIniciales: FiltrosServidores
  /** The campus service shifts offered by the "Turno" filter. */
  readonly turnos?: readonly Turno[]
}

const RETRASO_BUSQUEDA_MS = 300

/**
 * Flattens the tree into the assigner's "Equipo" select options — REAL
 * equipos only. A virtual Grupos de Vida node is never offered: assigning a
 * new servicio against it would target an id that isn't a `dream_team_equipos`
 * row. Its children are still walked; only the push is filtered.
 */
function aplanarArbol(nodos: readonly NodoArbol<NodoEquipoArbol>[]): NodoPlano[] {
  const resultado: NodoPlano[] = []
  function visitar(nodo: NodoArbol<NodoEquipoArbol>): void {
    if (nodo.equipo.origen === 'dream_team') {
      const prefijo = nodo.nivel > 0 ? `${'—'.repeat(nodo.nivel)} ` : ''
      resultado.push({ id: nodo.equipo.id, etiqueta: `${prefijo}${nodo.equipo.label}` })
    }
    nodo.hijos.forEach(visitar)
  }
  nodos.forEach(visitar)
  return resultado
}

const SIN_FILTROS: Partial<FiltrosServidores> = {
  etapa: null,
  direccion: null,
  equipo: null,
  rol: null,
  turno: null,
  inicio: 'cualquiera',
  sinCuenta: false,
  varios: false,
  q: '',
}

const SIN_TURNOS: readonly Turno[] = []

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

  const [filtros, setFiltros] = useState<FiltrosServidores>(filtrosIniciales)
  const [asignadorAbierto, setAsignadorAbierto] = useState(false)
  const temporizadorUrl = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    },
    [],
  )

  const vista = useMemo(() => calcularVistaServidores({ filas, arbol, filtros, turnos }), [filas, arbol, filtros, turnos])
  const nodosPlanos = useMemo(() => aplanarArbol(arbol), [arbol])

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

  function cerrarAsignadorYRefrescar(): void {
    setAsignadorAbierto(false)
    router.refresh()
  }

  const sinServicios = filas.length === 0

  return (
    <ContenedorDashboard
      titulo="Servidores"
      accionPrincipal={
        puedeEditar ? (
          <BotonSistema type="button" variante="primario" tamaño="sm" icono={UserPlus} onClick={() => setAsignadorAbierto(true)}>
            Asignar servicio
          </BotonSistema>
        ) : null
      }
    >
      <TextoSistema variante="sutil">
        {vista.total.servicios} {vista.total.servicios === 1 ? 'servicio' : 'servicios'} de {vista.total.personas}{' '}
        {vista.total.personas === 1 ? 'persona' : 'personas'}
      </TextoSistema>

      <ContadoresEtapa
        contadores={vista.contadoresEtapa}
        etapa={vista.filtros.etapa}
        onEtapaChange={(etapa) => cambiar({ etapa })}
      />

      <BarraFiltros vista={vista} onCambio={cambiar} />

      <PastillasFiltros pastillas={vista.pastillas} onQuitar={cambiar} onLimpiarTodo={() => cambiar(SIN_FILTROS)} />

      {vista.visibles.length === 0 ? (
        <EstadoVacio
          icono={UserPlus}
          titulo={sinServicios ? 'No hay servicios registrados' : 'Ningún servicio coincide con estos filtros'}
          subtitulo={sinServicios ? undefined : 'Quita alguno de los filtros o usa «Limpiar todo».'}
        />
      ) : (
        <section aria-label="Resultados" className="space-y-2">
          <TarjetasServidores items={vista.items} onActualizado={() => router.refresh()} />
          <TablaServidores
            items={vista.items}
            orden={vista.filtros.orden}
            onOrdenar={ordenar}
            onActualizado={() => router.refresh()}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span>{vista.pie.resumen}</span>
            <span>{vista.pie.orden}</span>
          </div>
        </section>
      )}

      {puedeEditar && <BotonFlotante icono={UserPlus} label="Asignar servicio" onClick={() => setAsignadorAbierto(true)} />}

      <AsignadorServicioDialog
        abierto={asignadorAbierto}
        onClose={() => setAsignadorAbierto(false)}
        nodosPlanos={nodosPlanos}
        rolesPorEquipo={rolesPorEquipo}
        onAsignado={cerrarAsignadorYRefrescar}
        toast={toast}
      />
    </ContenedorDashboard>
  )
}
