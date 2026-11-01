'use client'

/**
 * Estudiantes › En vivo — client island of /estudiantes/vivo (C4b of
 * odd/tasks/estudiantes-fase-b.md; artboards 03 desktop and 04 phone of
 * design/estudiantes-asistencia; list anatomy of
 * docs/design-system/patterns.md#list-screen-anatomy).
 *
 * Top to bottom: header (breadcrumbs "Estudiantes / <ámbito> / <sub-área>"),
 * hero (title, "Domingo 25 oct · 9:00 · 42 en el salón: …" and the live
 * indicator, G4), the ámbito / meeting pickers when there is more than one,
 * toolbar (search over groups and leaders; Filtros), the attention metrics
 * that act as filters, "Visitantes de hoy" (G2), the sub-área cards (hidden at
 * the leaf) and the groups. A row (or a visitor) opens the group detail.
 *
 * The data refreshes every 15 s through a server action (use-en-vivo.ts) and
 * is swapped in place; a new visitor is announced with a toast. Every rule
 * lives in the pure view model (lib/platform/estudiantes/vivo-vista.ts). The
 * filters stay in local state and are mirrored into the URL with
 * `history.replaceState` (no server round trip; search debounced); another
 * ámbito or meeting is a `router.replace` (the page loads its data).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Radio, UsersRound } from 'lucide-react'

import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { TarjetasFiltro, type InsigniaTarjeta, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { fechaLarga, horaCorta } from '@/lib/platform/estudiantes/lista-vista'
import type { DatosVivo, OpcionVivo, VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import {
  ETIQUETA_ESTADO_FILTRO,
  calcularVistaVivo,
  consultaVivo,
  elegirOpcion,
  mensajesNuevosVisitantes,
  opcionesAmbito,
  opcionesReunion,
  valorAmbito,
  valorReunion,
  type AreaVivo,
  type FiltrosVivo,
  type MetricaVivo,
  type VistaVivo,
} from '@/lib/platform/estudiantes/vivo-vista'

import { DetalleGrupoVivo } from './detalle-grupo-vivo'
import { FranjaVisitantes } from './franja-visitantes'
import { HojaFiltrosVivo } from './filtros-vivo'
import { IndicadorEnVivo } from './indicador-en-vivo'
import { ListaVivo } from './lista-vivo'
import { useEnVivo } from './use-en-vivo'

const RETRASO_BUSQUEDA_MS = 300

const SIN_DATOS: DatosVivo = { ambitoId: null, fecha: null, turnoId: null, grupos: [], visitantesHoy: [] }

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export interface VivoClientProps {
  readonly opciones: readonly OpcionVivo[]
  /** `null`: no meeting in the last days (empty state). */
  readonly opcion: OpcionVivo | null
  readonly datos: DatosVivo | null
  /** Why `datos` is missing (the refresh retries). */
  readonly error: string | null
  readonly filtrosIniciales: FiltrosVivo
}

function Migas({ ambito, area, onIrAmbito }: { readonly ambito: string | null; readonly area: string | null; readonly onIrAmbito: () => void }): ReactElement {
  const enlace = 'focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11'
  const actual = 'truncate px-2 py-1.5 font-semibold text-foreground'
  const separador = (
    <span aria-hidden="true" className="px-0.5 text-muted-foreground">
      /
    </span>
  )
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center gap-0.5">
          <Link href="/estudiantes" className={enlace}>
            Estudiantes
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          {separador}
          {!ambito ? (
            <span aria-current="page" className={actual}>
              En vivo
            </span>
          ) : area ? (
            <button type="button" onClick={onIrAmbito} className={enlace}>
              {ambito}
            </button>
          ) : (
            <span aria-current="page" className={actual}>
              {ambito}
            </span>
          )}
        </li>
        {ambito && area && (
          <li className="flex min-w-0 items-center gap-0.5">
            {separador}
            <span aria-current="page" className={actual}>
              {area}
            </span>
          </li>
        )}
      </ol>
    </nav>
  )
}

function Resumen({ opcion, vista }: { readonly opcion: OpcionVivo; readonly vista: VistaVivo }): ReactElement {
  const { presentes, presentesInscritos, visitantes } = vista.totales
  const linea = [fechaLarga(opcion.fecha), horaCorta(opcion.hora)].filter(Boolean).join(' · ')
  return (
    <>
      {linea} · <strong className="font-mono tabular-nums">{presentes}</strong> en el salón:{' '}
      <strong className="font-mono tabular-nums">{presentesInscritos}</strong> {palabra(presentesInscritos, 'inscrito', 'inscritos')} y{' '}
      <strong className="font-mono tabular-nums">{visitantes}</strong> {palabra(visitantes, 'visitante', 'visitantes')}
    </>
  )
}

function aTarjeta(area: AreaVivo): TarjetaFiltro {
  const insignias: InsigniaTarjeta[] = []
  if (area.gruposSinMarcar > 0) insignias.push({ texto: `${area.gruposSinMarcar} ${palabra(area.gruposSinMarcar, 'grupo sin marcar', 'grupos sin marcar')}`, tono: 'warning' })
  if (area.visitantes > 0) insignias.push({ texto: `${area.visitantes} ${palabra(area.visitantes, 'visitante', 'visitantes')}`, tono: 'info' })
  return {
    id: area.id,
    label: area.label,
    subtitulo: `de ${area.inscritos} inscritos · ${area.grupos} ${palabra(area.grupos, 'grupo', 'grupos')}`,
    total: area.presentes,
    badge: null,
    insignias,
    barraEtapas: [
      { tono: 'success', valor: area.presentes, etiqueta: 'presentes' },
      { tono: 'danger', valor: area.ausentes, etiqueta: 'ausentes' },
      { tono: 'warning', valor: area.sinMarcar, etiqueta: 'sin marcar' },
    ],
  }
}

/** No meeting to show: the frame, a title and one line (patterns.md#empty-and-loading-states). */
function SinReuniones(): ReactElement {
  return (
    <PaginaSistema breadcrumbs={<Migas ambito={null} area={null} onIrAmbito={() => undefined} />}>
      <div className="md:hidden">
        <TituloGrande titulo="En vivo" nivel={2} />
      </div>
      <h1 className="hidden text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground md:block">En vivo</h1>
      <EstadoVacioSistema
        icono={Radio}
        titulo="No hay reuniones para seguir en vivo"
        subtitulo="Aparecen aquí cuando Transit o Inside Out se reúnen."
      />
    </PaginaSistema>
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

  const ambitos = opcionesAmbito(opciones)
  const reuniones = opcionesReunion(opciones, opcion)
  const area = vista.filtros.area
  const grupoDetalle = detalle ? (datos.grupos.find((g) => g.grupoId === detalle.grupoId) ?? null) : null
  const metricaActiva = vista.metricas.find((m) => m.activa)
  const chips = [
    ...(metricaActiva ? [{ id: 'metrica', etiqueta: metricaActiva.etiqueta }] : []),
    ...(vista.filtros.estado !== 'todos' ? [{ id: 'estado', etiqueta: ETIQUETA_ESTADO_FILTRO[vista.filtros.estado] }] : []),
  ]
  const hayFiltros = chips.length > 0 || vista.filtros.q.trim() !== ''
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
  const indicador = <IndicadorEnVivo actualizadoAt={vivo.actualizadoAt} oculto={vivo.oculto} fallo={vivo.fallo} />

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema breadcrumbs={<Migas ambito={opcion.ambito} area={area} onIrAmbito={() => cambiar({ area: null })} />} className="pb-28 md:pb-0">
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className="-mx-2 -mt-2 mb-1 flex items-center justify-between gap-2">
          <BotonAtrasMovil
            atras={area ? { etiqueta: opcion.ambito, onClick: () => cambiar({ area: null }) } : { etiqueta: 'Estudiantes', href: '/estudiantes' }}
            className="max-w-[75%]"
          />
          <BotonFiltrosMovil filtrosActivos={vista.filtrosEnHoja} onClick={() => setHojaAbierta(true)} />
        </div>
        <TituloGrande titulo={vista.titulo} nivel={2} resumen={<Resumen opcion={opcion} vista={vista} />} />
        <div className="mt-2">{indicador}</div>
      </div>
      <div className="hidden md:flex md:flex-wrap md:items-end md:justify-between md:gap-x-6 md:gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{vista.titulo}</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            <Resumen opcion={opcion} vista={vista} />
          </p>
        </div>
        {indicador}
      </div>

      {vivo.fallo && vivo.mensaje && <AvisoFormulario tono="error">{vivo.mensaje}</AvisoFormulario>}

      {(ambitos.length > 1 || reuniones.length > 1) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
          {ambitos.length > 1 && (
            <SelectSistema
              label="Ámbito"
              opciones={ambitos}
              value={valorAmbito(opcion)}
              onValueChange={(valor) => {
                const [ambito, campus] = valor.split('|')
                irA(elegirOpcion(opciones, { ambito, campus }, hoyEnCaracas()))
              }}
            />
          )}
          {reuniones.length > 1 && (
            <SelectSistema
              label="Reunión"
              opciones={reuniones}
              value={valorReunion(opcion)}
              onValueChange={(valor) => irA(opciones.find((o) => valorAmbito(o) === valorAmbito(opcion) && valorReunion(o) === valor))}
            />
          )}
        </div>
      )}

      <BarraHerramientas
        busqueda={{ valor: vista.filtros.q, onCambio: (q) => cambiar({ q }), placeholder: 'Buscar grupo o líder', etiqueta: 'Buscar grupos' }}
        filtrosActivos={vista.filtrosEnHoja}
        onAbrirFiltros={() => setHojaAbierta(true)}
      />

      <MetricasAtencion
        etiqueta="Resumen de la reunión"
        metricas={vista.metricas}
        onAlternar={(id) => cambiar({ metrica: vista.filtros.metrica === id ? null : (id as MetricaVivo) })}
      />

      <FranjaVisitantes visitantes={vista.visitantes} onAbrirGrupo={(grupoId) => setDetalle({ grupoId, abierto: true })} />

      {vista.areas.length > 0 && (
        <section aria-labelledby="vivo-areas" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
            <h2 id="vivo-areas" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Áreas
            </h2>
            <span className="hidden text-xs text-muted-foreground md:inline">Toca para entrar</span>
          </div>
          <TarjetasFiltro
            items={vista.areas.map(aTarjeta)}
            modoCompacto={false}
            seleccionadoId=""
            onSeleccionar={(id) => cambiar({ area: id })}
            unidad={{ singular: 'presente', plural: 'presentes' }}
            etiqueta="Áreas"
            buscarEtiqueta="Buscar área"
            presentacion="alcance"
          />
        </section>
      )}

      <section aria-labelledby="vivo-grupos" className="space-y-3">
        <h2 id="vivo-grupos" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          Grupos
        </h2>
        <ChipsFiltrosActivos
          chips={chips}
          onQuitar={(id) => cambiar(id === 'metrica' ? { metrica: null } : { estado: 'todos' })}
          onLimpiarTodo={() => cambiar({ metrica: null, estado: 'todos' })}
        />
        <ListaVivo grupos={vista.visibles} orden={vista.filtros.orden} onOrdenar={(orden) => cambiar({ orden })} onAbrir={(grupoId) => setDetalle({ grupoId, abierto: true })} vacio={vacio} />
        {vista.visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{vista.pie.resumen}</span>
            <span>{vista.pie.orden}</span>
          </div>
        )}
      </section>

      <HojaFiltrosVivo vista={vista} abierta={hojaAbierta} onCambioAbierta={setHojaAbierta} onCambio={cambiar} />

      <DetalleGrupoVivo
        key={detalle?.grupoId ?? 'ninguno'}
        grupo={grupoDetalle}
        opcion={opcion}
        visitantes={datos.visitantesHoy}
        abierto={detalle?.abierto ?? false}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
      />
    </PaginaSistema>
  )
}

