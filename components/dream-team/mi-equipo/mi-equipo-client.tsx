'use client'

/**
 * Dream Team — client island for /dream-team/mi-equipo.
 *
 * The screen works with people: it shows ONE direccion at a time (chosen by
 * the server from `?direccion=`), its cards one tree level at a time (an área
 * card enters the área) and the people of the selected card. Everything below
 * the header is derived on the client from the already-loaded view model
 * (lib/platform/dream-team/mi-equipo-vista.ts): the entered área, the selected
 * card, the estado, age and shift filters and the name search are local state —
 * only the direccion lives in the URL.
 *
 * Everything that crosses in from the server page is plain serializable data.
 * Icons and callbacks are created here, inside the island.
 *
 * When the campus has a dated shift (The Living Room), the selected card shows
 * its "Calendario" (A2 of odd/tasks/tlr-calendario-servicios.md), loaded on
 * the client for that card only.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Network, Plus } from 'lucide-react'

import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useCampus } from '@/hooks/useCampus'
import { AsignadorServicioDialog } from '@/components/dream-team/asignador-servicio-dialog'
import { ContadoresEdad } from '@/components/dream-team/contadores-edad'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { SelectorTurno } from '@/components/dream-team/turnos/selector-turno'
import {
  TODOS_LOS_EQUIPOS,
  contadoresPorEstado,
  contarPersonas,
  filtrarPersonas,
  nivelDeEquipos,
  personasDeSeleccion,
  type DireccionResumen,
  type EquipoAsignable,
  type FiltroEstado,
  type VistaDireccion,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import { contarPorRangoEdad, type RangoEdad } from '@/lib/platform/dream-team/edad'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { TipoTurno } from '@/lib/platform/dream-team/turno-fechas'

import { CalendarioTurnos } from './calendario-turnos'
import { EncabezadoMiEquipo } from './encabezado'
import { FranjaPendientes } from './franja-pendientes'
import { ListaPersonas } from './lista-personas'
import { TarjetasEquipos } from './tarjetas-equipos'

export interface MiEquipoClientProps {
  readonly direcciones: readonly DireccionResumen[]
  /** `null` when the caller reaches no direccion at all. */
  readonly vista: VistaDireccion | null
  readonly direccionId: string
  readonly puedeEditar: boolean
  /** May register NEW people (the volunteer coordinator), even without assigning existing ones. */
  readonly puedeRegistrar?: boolean
  readonly equiposAsignables: readonly EquipoAsignable[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  /**
   * Every active campus shift, in campus order: names the shifts of each
   * person; the "Turno" filter offers those of the campus selected in the app.
   */
  readonly turnos?: readonly {
    readonly id: string
    readonly label: string
    readonly campusId?: string
    readonly tipo?: TipoTurno
  }[]
  /** Some active campus shift is dated: the selected card asks for its Calendario. */
  readonly hayTurnosPorFechas?: boolean
}

const SIN_TURNOS: NonNullable<MiEquipoClientProps['turnos']> = []

export function MiEquipoClient(props: MiEquipoClientProps): ReactElement {
  if (!props.vista) {
    return (
      <PaginaSistema titulo="Mi equipo">
        <EstadoVacio
          icono={Network}
          titulo="Todavía no hay equipos para mostrar"
          subtitulo="Puede deberse a que aún no te asignaron un área en la estructura de Dream Team."
        />
      </PaginaSistema>
    )
  }
  // Keyed by direccion so switching it resets the level, team, filter and search.
  return <MiEquipoVistaDireccion key={props.vista.id} {...props} vista={props.vista} />
}

/** "3 personas", or "3 personas · 4 servicios" when someone serves more than once (as the Servidores footer). */
function subtituloDeLista(cantidad: number, servicios: number, responsable: string | null, busqueda: string): string {
  const soloPersonas = `${cantidad} ${cantidad === 1 ? 'persona' : 'personas'}`
  const personas = servicios > cantidad ? `${soloPersonas} · ${servicios} servicios` : soloPersonas
  const conBusqueda = busqueda.trim() ? `${personas} para «${busqueda.trim()}»` : personas
  return responsable ? `${responsable} · ${conBusqueda}` : conBusqueda
}

function MiEquipoVistaDireccion({
  direcciones,
  vista,
  direccionId,
  puedeEditar,
  puedeRegistrar = false,
  equiposAsignables,
  rolesPorEquipo,
  turnos = SIN_TURNOS,
  hayTurnosPorFechas = false,
}: MiEquipoClientProps & { readonly vista: VistaDireccion }): ReactElement {
  const puedeAgregar = puedeEditar || puedeRegistrar
  const router = useRouter()
  const toast = useNotificaciones()
  // The campus selected in the app header (read only); `null` = every campus.
  const { campusId } = useCampus()
  const turnosDelCampus = useMemo(
    () => turnos.filter((opcion) => campusId === null || opcion.campusId === undefined || opcion.campusId === campusId),
    [turnos, campusId],
  )
  const [asignadorAbierto, setAsignadorAbierto] = useState(false)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [seleccionadoId, setSeleccionadoId] = useState<string>(TODOS_LOS_EQUIPOS)
  const [filtro, setFiltro] = useState<FiltroEstado>('todos')
  const [query, setQuery] = useState('')
  const [turno, setTurno] = useState<string | null>(null)
  const [edad, setEdad] = useState<RangoEdad | null>(null)

  // A refresh can drop the entered área or the selected team; never leave the list pointing at nothing.
  const nivel = nivelDeEquipos(vista, areaId)
  const tarjetaSeleccionada = nivel.equipos.find((equipo) => equipo.id === seleccionadoId) ?? nivel.todas

  function seleccionarTarjeta(id: string): void {
    // An área card enters the área, which starts on its "Todo <área>" card.
    if (nivel.equipos.some((equipo) => equipo.id === id && equipo.esArea)) setAreaId(id)
    setSeleccionadoId(id)
  }

  function volver(): void {
    const padreId = nivel.padre?.id ?? TODOS_LOS_EQUIPOS
    setAreaId(padreId === TODOS_LOS_EQUIPOS ? null : padreId)
    setSeleccionadoId(padreId)
  }

  const delEquipo = useMemo(
    () => personasDeSeleccion(vista.personas, tarjetaSeleccionada.id),
    [vista.personas, tarjetaSeleccionada.id],
  )
  // Each group of counters follows every filter but its own (estado, age), so each pill shows what it would list.
  const porNombre = useMemo(() => filtrarPersonas(delEquipo, { query, turno }), [delEquipo, query, turno])
  const contadores = useMemo(() => contadoresPorEstado(filtrarPersonas(porNombre, { edad })), [porNombre, edad])
  // The age metrics of the selected card (D10); hidden when nobody has a known range.
  const contadoresEdad = useMemo(
    () =>
      delEquipo.some((persona) => persona.rangoEdad !== undefined)
        ? contarPorRangoEdad(filtrarPersonas(porNombre, { estado: filtro }))
        : null,
    [delEquipo, porNombre, filtro],
  )
  const visibles = useMemo(() => filtrarPersonas(porNombre, { estado: filtro, edad }), [porNombre, filtro, edad])

  function revisarPendientes(): void {
    setAreaId(null)
    setSeleccionadoId(TODOS_LOS_EQUIPOS)
    setQuery('')
    setTurno(null)
    setEdad(null)
    setFiltro('por_activar')
  }

  // Only a real equipo can be preselected; "Toda la dirección" and virtual groups leave the choice open.
  const equipoPreseleccionado = equiposAsignables.some((equipo) => equipo.id === tarjetaSeleccionada.id)
    ? tarjetaSeleccionada.id
    : undefined

  const responsable = tarjetaSeleccionada.responsable
  const lineaResponsable = responsable
    ? `${responsable.rol === 'coordinador' ? 'Coordina' : 'Dirige'} ${responsable.nombre}`
    : null

  return (
    <PaginaSistema titulo="Mi equipo">
      <EncabezadoMiEquipo
        direccionLabel={vista.label}
        dirige={vista.todaLaDireccion.responsable?.nombre ?? null}
        totalPersonas={vista.total}
        totalEquipos={vista.totalEquipos}
        direcciones={direcciones}
        direccionId={direccionId}
        onDireccionChange={(id) => router.replace(`?direccion=${encodeURIComponent(id)}`)}
        query={query}
        onQueryChange={setQuery}
        accion={
          puedeAgregar ? (
            <BotonSistema type="button" icono={Plus} className="hidden md:inline-flex" onClick={() => setAsignadorAbierto(true)}>
              Agregar persona
            </BotonSistema>
          ) : undefined
        }
      />

      <FranjaPendientes pendientes={vista.pendientes} onRevisar={revisarPendientes} />

      <TarjetasEquipos
        nivel={nivel}
        seleccionadoId={tarjetaSeleccionada.id}
        onSeleccionar={seleccionarTarjeta}
        onVolver={volver}
      />

      {hayTurnosPorFechas && (
        <CalendarioTurnos
          // "Toda la dirección" is the direccion's own equipo.
          key={tarjetaSeleccionada.id}
          equipoId={tarjetaSeleccionada.id === TODOS_LOS_EQUIPOS ? direccionId : tarjetaSeleccionada.id}
          personas={delEquipo}
          toast={toast}
        />
      )}

      {turnosDelCampus.length > 0 && (
        <div className="max-w-xs">
          <SelectorTurno turnos={turnosDelCampus} valor={turno} onCambio={setTurno} />
        </div>
      )}

      {contadoresEdad && <ContadoresEdad contadores={contadoresEdad} edad={edad} onEdadChange={setEdad} />}

      <ListaPersonas
        titulo={tarjetaSeleccionada.label}
        subtitulo={subtituloDeLista(contarPersonas(visibles), visibles.length, lineaResponsable, query)}
        personas={visibles}
        contadores={contadores}
        filtro={filtro}
        onFiltroChange={setFiltro}
        hayBusqueda={query.trim() !== ''}
        puedeEditar={puedeEditar}
        onActualizado={() => router.refresh()}
        turnos={turnos}
      />

      {puedeAgregar && (
        <>
          <BotonFlotante icono={Plus} label="Agregar persona" onClick={() => setAsignadorAbierto(true)} />
          <AsignadorServicioDialog
            titulo="Agregar persona"
            abierto={asignadorAbierto}
            onClose={() => setAsignadorAbierto(false)}
            nodosPlanos={equiposAsignables}
            rolesPorEquipo={rolesPorEquipo}
            equipoIdInicial={equipoPreseleccionado}
            onAsignado={() => {
              setAsignadorAbierto(false)
              router.refresh()
            }}
            toast={toast}
            soloRegistrar={!puedeEditar}
            turnos={turnosDelCampus}
          />
        </>
      )}
    </PaginaSistema>
  )
}
