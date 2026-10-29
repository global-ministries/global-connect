'use client'

/**
 * Dream Team — client island for /dream-team/mi-equipo, on design system v2
 * (S11 of odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/mi-equipo/; the same anatomy as Servidores).
 *
 * Top to bottom: header (desktop breadcrumbs of the tree + "Agregar persona"),
 * hero (the current level, who leads it and its numbers; the Dirección
 * selector when the viewer reaches several), the "Personas | Calendario" tabs
 * (Calendario only when the scope serves a dated shift), then the Personas tab
 * (personas-mi-equipo.tsx) or the Calendario (calendario-turnos.tsx). A row
 * opens the person panel (detalle-mi-equipo.tsx), which holds every action
 * the viewer's role allows.
 *
 * On phones the shell's header holds the page h1 ("Mi equipo"), so the
 * content carries "‹ padre" and the Filtros button, and under them the large
 * title names the level (an h2). "Agregar persona" becomes the FAB.
 *
 * Every rule lives in the pure view model (calcularVistaMiEquipo in
 * lib/platform/dream-team/mi-equipo-filtros.ts). The filters start from the
 * URL the server page parsed and are mirrored back with
 * `router.replace(..., { scroll: false })`, the search debounced. Switching
 * the dirección navigates (the server sends the new dirección).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Network, UserPlus, Users } from 'lucide-react'

import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useCampus } from '@/hooks/useCampus'
import { AsignadorServicioDialog } from '@/components/dream-team/asignador-servicio-dialog'
import { permisosMiEquipo, type RolMiEquipo } from '@/lib/platform/dream-team/acciones-servicio'
import { isoLocal } from '@/lib/platform/dream-team/frecuencia-turno'
import {
  FILTROS_MI_EQUIPO,
  LIMPIAR_FILTROS_MI_EQUIPO,
  calcularVistaMiEquipo,
  escribirFiltrosMiEquipo,
  type FiltrosMiEquipo,
  type PestanaMiEquipo,
} from '@/lib/platform/dream-team/mi-equipo-filtros'
import {
  personasDeSeleccion,
  type DireccionResumen,
  type EquipoAsignable,
  type VistaDireccion,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { TipoTurno } from '@/lib/platform/dream-team/turno-fechas'

import { CabeceraMiEquipo, MigasMiEquipo } from './cabecera'
import { useCalendarioTurnos } from './calendario-datos'
import { CalendarioTurnos, contarProximas } from './calendario-turnos'
import { DetalleMiEquipo } from './detalle-mi-equipo'
import { HojaFiltrosMiEquipo } from './filtros-mi-equipo'
import { nivelesMiEquipo } from './niveles'
import { PersonasMiEquipo } from './personas-mi-equipo'

export interface MiEquipoClientProps {
  readonly direcciones: readonly DireccionResumen[]
  /** `null` when the caller reaches no direccion at all. */
  readonly vista: VistaDireccion | null
  readonly direccionId: string
  /** What the viewer may do (rolMiEquipo in mi-equipo-filtros.ts); the server checks each action again. */
  readonly rol: RolMiEquipo
  /** The state of the URL (leerFiltrosMiEquipo); defaults to none. */
  readonly filtrosIniciales?: FiltrosMiEquipo
  readonly equiposAsignables: readonly EquipoAsignable[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  /** Every active campus shift, in campus order; the Turno filter offers those of the campus selected in the app. */
  readonly turnos?: readonly {
    readonly id: string
    readonly label: string
    readonly campusId?: string
    readonly tipo?: TipoTurno
  }[]
  /** Some active campus shift is dated: the scope asks for its Calendario. */
  readonly hayTurnosPorFechas?: boolean
}

const SIN_TURNOS: NonNullable<MiEquipoClientProps['turnos']> = []
const RETRASO_BUSQUEDA_MS = 300

export function MiEquipoClient(props: MiEquipoClientProps): ReactElement {
  if (!props.vista) {
    return (
      <PaginaSistema titulo="Mi equipo">
        <EstadoVacioSistema
          icono={Network}
          titulo="Todavía no hay equipos para mostrar"
          subtitulo="Puede deberse a que aún no te asignaron un área en la estructura de Dream Team."
        />
      </PaginaSistema>
    )
  }
  // Keyed by direccion: switching it starts from the URL the server parsed.
  return <MiEquipoVistaDireccion key={props.vista.id} {...props} vista={props.vista} />
}

function MiEquipoVistaDireccion({
  direcciones,
  vista: direccion,
  direccionId,
  rol,
  filtrosIniciales = FILTROS_MI_EQUIPO,
  equiposAsignables,
  rolesPorEquipo,
  turnos = SIN_TURNOS,
  hayTurnosPorFechas = false,
}: MiEquipoClientProps & { readonly vista: VistaDireccion }): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const toast = useNotificaciones()
  // The campus selected in the app header (read only); `null` = every campus.
  const { campusId } = useCampus()
  const turnosDelCampus = useMemo(
    () => turnos.filter((opcion) => campusId === null || opcion.campusId === undefined || opcion.campusId === campusId),
    [turnos, campusId],
  )
  const [filtros, setFiltros] = useState<FiltrosMiEquipo>(filtrosIniciales)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [asignadorAbierto, setAsignadorAbierto] = useState(false)
  // The person stays selected after the panel closes, so the dialogs it opened stay mounted.
  const [detalle, setDetalle] = useState<{ readonly personaId: string; readonly abierto: boolean } | null>(null)
  const temporizadorUrl = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (temporizadorUrl.current && clearTimeout(temporizadorUrl.current)), [])

  const vista = useMemo(() => calcularVistaMiEquipo({ vista: direccion, filtros, turnos }), [direccion, filtros, turnos])
  const niveles = useMemo(() => nivelesMiEquipo(direccion), [direccion])
  const { navegacion } = vista
  const nivel = vista.filtros.nivel
  const alcance = useMemo(
    () => (nivel === null ? direccion.personas : personasDeSeleccion(direccion.personas, nivel)),
    [direccion.personas, nivel],
  )
  const calendario = useCalendarioTurnos(nivel ?? direccion.id, hayTurnosPorFechas)
  const hayCalendario = (calendario.turnos?.length ?? 0) > 0
  const tab: PestanaMiEquipo = hayCalendario ? vista.filtros.tab : 'personas'
  const hoy = isoLocal(new Date())
  const puedeAgregar = permisosMiEquipo(rol).registrar

  function cambiar(parche: Partial<FiltrosMiEquipo>): void {
    const siguiente = { ...vista.filtros, ...parche }
    setFiltros(siguiente)
    if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    const aplicar = (): void => {
      temporizadorUrl.current = null
      const consulta = escribirFiltrosMiEquipo(siguiente)
      router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false })
    }
    const soloBusqueda = Object.keys(parche).length === 1 && 'q' in parche
    if (soloBusqueda) temporizadorUrl.current = setTimeout(aplicar, RETRASO_BUSQUEDA_MS)
    else aplicar()
  }

  function elegirDireccion(id: string): void {
    router.replace(`${pathname}?${escribirFiltrosMiEquipo({ ...FILTROS_MI_EQUIPO, direccion: id })}`, { scroll: false })
  }

  const abrirAsignador = (): void => setAsignadorAbierto(true)
  const vacio =
    navegacion.servicios === 0 ? (
      <EstadoVacioSistema
        icono={Users}
        titulo="Todavía no hay personas en este equipo"
        subtitulo={puedeAgregar ? 'Usá «Agregar persona» para sumar a la primera.' : 'Cuando alguien sirva acá, lo vas a ver en esta lista.'}
      />
    ) : (
      <EstadoVacioSistema
        icono={Users}
        titulo="Nadie coincide con estos filtros"
        subtitulo="Quitá alguno o usá «Limpiar todo»."
        accion={
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ ...LIMPIAR_FILTROS_MI_EQUIPO, q: '' })}>
            Limpiar todo
          </BotonSistema>
        }
      />
    )

  const personas = (
    <PersonasMiEquipo
      vista={vista}
      turnos={turnos}
      hoy={hoy}
      onCambio={cambiar}
      onAbrirFiltros={() => setHojaAbierta(true)}
      onAbrirPersona={(personaId) => setDetalle({ personaId, abierto: true })}
      vacio={vacio}
    />
  )

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={<MigasMiEquipo migas={navegacion.migas} onIr={(miga) => cambiar(miga.parche)} />}
      acciones={
        puedeAgregar ? (
          // Small header action (36px, 44px on touch); the ::after widens the hit area to 48px.
          <BotonSistema
            type="button"
            variante="primario"
            tamaño="sm"
            icono={UserPlus}
            onClick={abrirAsignador}
            className="relative after:absolute after:-inset-x-0.5 after:-inset-y-1.5 after:content-['']"
          >
            Agregar persona
          </BotonSistema>
        ) : null
      }
      className="pb-28 md:pb-0"
    >
      <CabeceraMiEquipo
        navegacion={navegacion}
        direcciones={direcciones}
        direccionId={direccionId}
        onDireccion={elegirDireccion}
        onIr={(miga) => cambiar(miga.parche)}
        filtros={tab === 'personas' ? { activos: vista.filtrosActivos, onAbrir: () => setHojaAbierta(true) } : undefined}
      />

      {hayCalendario && calendario.turnos ? (
        <TabsSistema value={tab} onValueChange={(valor) => cambiar({ tab: valor as PestanaMiEquipo })}>
          {/* Full width on phones, as the prototype; its own width from md. */}
          <TabsList aria-label="Secciones de Mi equipo" className="flex w-full md:inline-flex md:w-auto">
            <TabsTrigger value="personas" className="min-h-9 flex-1 pointer-coarse:min-h-11 md:flex-none">
              Personas
            </TabsTrigger>
            <TabsTrigger value="calendario" className="min-h-9 flex-1 pointer-coarse:min-h-11 md:flex-none">
              Calendario <span className="font-mono text-xs tabular-nums opacity-80">{contarProximas(calendario.turnos, hoy)}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="personas" className="mt-6">
            {personas}
          </TabsContent>
          <TabsContent value="calendario" className="mt-6">
            <CalendarioTurnos turnos={calendario.turnos} onCambiado={calendario.recargar} personas={alcance} toast={toast} hoy={hoy} />
          </TabsContent>
        </TabsSistema>
      ) : (
        personas
      )}

      <HojaFiltrosMiEquipo
        vista={vista}
        turnos={turnosDelCampus}
        abierta={hojaAbierta}
        onCambioAbierta={setHojaAbierta}
        onCambio={cambiar}
      />

      <DetalleMiEquipo
        persona={detalle ? (vista.fichas.get(detalle.personaId) ?? null) : null}
        abierto={detalle?.abierto ?? false}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        rol={rol}
        turnos={turnos}
        rutaDe={niveles.rutaDe}
        nivelDe={(servicio) => {
          const destino = niveles.nivelDe(servicio)
          return destino === nivel ? undefined : destino
        }}
        onVerEquipo={(destino) => cambiar({ nivel: destino, tab: 'personas' })}
        onActualizado={() => router.refresh()}
      />

      {puedeAgregar && (
        <>
          <BotonFlotante icono={UserPlus} label="Agregar persona" onClick={abrirAsignador} />
          <AsignadorServicioDialog
            titulo="Agregar persona"
            abierto={asignadorAbierto}
            onClose={() => setAsignadorAbierto(false)}
            nodosPlanos={equiposAsignables}
            rolesPorEquipo={rolesPorEquipo}
            // Only a real equipo can be preselected; the dirección level and virtual groups leave the choice open.
            equipoIdInicial={equiposAsignables.some((equipo) => equipo.id === nivel) ? (nivel ?? undefined) : undefined}
            onAsignado={() => {
              setAsignadorAbierto(false)
              router.refresh()
            }}
            toast={toast}
            soloRegistrar={rol !== 'director'}
            turnos={turnosDelCampus}
          />
        </>
      )}
    </PaginaSistema>
  )
}
