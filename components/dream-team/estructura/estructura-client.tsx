'use client'

/**
 * Dream Team — client island for /admin/dream-team/estructura, on design
 * system v2 (S12 of odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/estructura/07-b-escritorio.html and
 * 08-b-celular.html, direction B "Organigrama visual").
 *
 * Top to bottom: the desktop breadcrumbs, the title with its summary and the
 * tabs "Equipos | Turnos del campus". Equipos is the org chart
 * (equipos-organigrama.tsx): a connected diagram from md, a vertical indented
 * chart on phones; the search and the problem pills highlight boxes and never
 * hide one. A box opens the node panel (panel-nodo.tsx), which holds every
 * action the viewer may take. Turnos del campus is turnos-campus.tsx.
 *
 * Who edits: `puedeEditar` (dream_team.org.manage) on real equipos. A
 * director reads their branch without a single action; the virtual Grupos de
 * Vida branch is read-only for everyone. The view model is
 * lib/platform/dream-team/estructura-organigrama.ts; the state lives in the
 * URL (use-estado-estructura.ts). Only serializable data crosses in.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { FolderTree, Plus } from 'lucide-react'

import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useCampus } from '@/hooks/useCampus'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import {
  FILTROS_ESTRUCTURA,
  crearOrganigrama,
  type FiltrosEstructura,
  type PestanaEstructura,
} from '@/lib/platform/dream-team/estructura-organigrama'
import { crearVistaEstructura, type TallerVinculado, type UsoServicios } from '@/lib/platform/dream-team/estructura-vista'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { Turno } from '@/lib/platform/dream-team/turnos'

import { CabeceraEstructura, MigasEstructura } from './cabecera-estructura'
import { EquiposOrganigrama } from './equipos-organigrama'
import { PanelNodo } from './panel-nodo'
import { DialogoSubequipo, SelectorPadre } from './selector-padre'
import { TurnosCampus, type CampusOpcion } from './turnos-campus'
import { useEstadoEstructura } from './use-estado-estructura'

export interface EstructuraClientProps {
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly uso: UsoServicios
  readonly talleres: Readonly<Record<string, TallerVinculado>>
  /** The node open in the panel (a valid `?equipo=`); empty when none is open. */
  readonly equipoId: string
  readonly puedeEditar: boolean
  /** The rest of the URL state (leerFiltrosEstructura); defaults to none. */
  readonly filtros?: FiltrosEstructura
  /** Campus service shifts (D12); absent when they could not be loaded. */
  readonly turnos?: TurnosEstructura
}

export interface TurnosEstructura {
  readonly campus: readonly CampusOpcion[]
  readonly turnos: readonly Turno[]
  /** `equipoId → its own shift ids` for every equipo the viewer reads (for "Sin turno"). */
  readonly propiosPorEquipo: Readonly<Record<string, readonly string[]>>
  /** The open real node's own shifts and the ones it serves in after inheritance. */
  readonly delEquipo?: { readonly equipoId: string; readonly propios: readonly string[]; readonly efectivos: readonly string[] }
}

export function EstructuraClient(props: EstructuraClientProps): ReactElement {
  if (props.arbol.length === 0) {
    return (
      <PaginaSistema breadcrumbs={<MigasEstructura />}>
        <EstadoVacioSistema
          icono={FolderTree}
          titulo="No se encontraron equipos"
          subtitulo="Puede que la estructura esté vacía, o que tu sesión no tenga acceso de lectura sobre ningún nodo del árbol."
        />
      </PaginaSistema>
    )
  }
  return <EstructuraConArbol {...props} />
}

function EstructuraConArbol({
  arbol,
  rolesPorEquipo,
  uso,
  talleres,
  equipoId,
  puedeEditar,
  filtros = FILTROS_ESTRUCTURA,
  turnos,
}: EstructuraClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  // The campus selected in the app header (read only): the shift lists show only its shifts.
  const { campusId, campusActivo } = useCampus()
  const organigrama = useMemo(
    () =>
      crearOrganigrama({
        arbol,
        rolesPorEquipo,
        uso,
        talleres,
        turnos: turnos && { turnos: turnos.turnos, propiosPorEquipo: turnos.propiosPorEquipo },
      }),
    [arbol, rolesPorEquipo, uso, talleres, turnos],
  )
  const vista = useMemo(() => crearVistaEstructura({ arbol, rolesPorEquipo, uso, talleres }), [arbol, rolesPorEquipo, uso, talleres])
  const estado = useEstadoEstructura(filtros, equipoId, () => organigrama.expandidosPorDefecto())
  const [selector, setSelector] = useState(false)
  const [subequipoDe, setSubequipoDe] = useState<{ readonly id: string; readonly label: string } | null>(null)
  const [turnoNuevo, setTurnoNuevo] = useState(false)

  const { panel } = estado
  const cajas = organigrama.diagrama({
    expandidos: estado.expandidos,
    q: estado.q,
    problema: estado.problema,
    seleccionado: panel?.abierto ? panel.id : null,
  })
  const detalle = panel ? vista.detalle(panel.id) : null
  const problemasDe = (id: string) => organigrama.nodo(id)?.problemas ?? []
  const actualizar = (): void => router.refresh()
  const delEquipo = turnos?.delEquipo
  const turnosNodo =
    turnos && detalle && delEquipo?.equipoId === detalle.id
      ? { turnos: turnos.turnos, campusId, propios: delEquipo.propios, efectivos: delEquipo.efectivos }
      : undefined

  function agregarSubequipo(): void {
    const nodo = panel ? organigrama.nodo(panel.id) : null
    if (nodo?.editable && nodo.activo) setSubequipoDe({ id: nodo.id, label: nodo.label })
    else setSelector(true)
  }

  const enTurnos = estado.tab === 'turnos'
  const puedeAgregarTurno = puedeEditar && enTurnos && (turnos?.campus.length ?? 0) > 0

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={<MigasEstructura />}
      acciones={
        puedeAgregarTurno ? (
          <BotonSistema type="button" tamaño="sm" icono={Plus} onClick={() => setTurnoNuevo(true)}>
            Agregar turno
          </BotonSistema>
        ) : null
      }
      className="pb-28 md:pb-0"
    >
      <TabsSistema value={estado.tab} onValueChange={(valor) => estado.elegirTab(valor as PestanaEstructura)}>
        <CabeceraEstructura
          resumen={organigrama.resumen}
          pestanas={
            <TabsList aria-label="Secciones de Estructura" className="flex w-full md:inline-flex md:w-auto">
              <TabsTrigger value="equipos" className="flex-1 md:flex-none">
                Equipos
              </TabsTrigger>
              <TabsTrigger value="turnos" className="flex-1 md:flex-none">
                Turnos del campus
              </TabsTrigger>
            </TabsList>
          }
        />
        <TabsContent value="equipos" className="mt-6">
          <EquiposOrganigrama
            organigrama={organigrama}
            cajas={cajas}
            campus={campusActivo?.nombre ?? 'Dream Team'}
            q={estado.q}
            onBuscar={estado.buscar}
            problema={estado.problema}
            onProblema={estado.elegirProblema}
            onAbrir={estado.abrir}
            onPlegar={estado.plegar}
            onExpandirTodo={() => estado.cambiarExpandidos(organigrama.todosExpandidos())}
            onContraer={() => estado.cambiarExpandidos(new Set())}
          />
        </TabsContent>
        <TabsContent value="turnos" className="mt-6">
          {turnos ? (
            <TurnosCampus
              campus={turnos.campus}
              turnos={turnos.turnos}
              campusId={campusId}
              puedeEditar={puedeEditar}
              nuevoAbierto={turnoNuevo}
              onNuevoAbierto={setTurnoNuevo}
              onActualizado={actualizar}
              toast={toast}
            />
          ) : (
            <EstadoVacioSistema titulo="No se pudieron cargar los turnos" subtitulo="Recargá la página para intentarlo de nuevo." />
          )}
        </TabsContent>
      </TabsSistema>

      {detalle && panel && (
        <PanelNodo
          abierto={panel.abierto}
          onCambioAbierto={(abierto) => (abierto ? estado.abrir(detalle.id) : estado.cerrar())}
          detalle={detalle}
          direccionId={vista.direccionDe(detalle.id) ?? detalle.id}
          problemas={problemasDe(detalle.id)}
          problemasDe={problemasDe}
          puedeEditar={puedeEditar}
          turnos={turnosNodo}
          onAbrirNodo={estado.abrir}
          onActualizado={actualizar}
          onVerTurnosCampus={estado.irATurnosCampus}
          toast={toast}
        />
      )}

      {puedeEditar && !enTurnos && <BotonFlotante icono={Plus} label="Agregar subequipo" onClick={agregarSubequipo} />}
      {puedeAgregarTurno && <BotonFlotante icono={Plus} label="Agregar turno" onClick={() => setTurnoNuevo(true)} />}
      {puedeEditar && (
        <>
          <SelectorPadre abierto={selector} onCambioAbierto={setSelector} nodos={organigrama.nodos} onHecho={actualizar} toast={toast} />
          <DialogoSubequipo padre={subequipoDe} onClose={() => setSubequipoDe(null)} onHecho={actualizar} toast={toast} />
        </>
      )}
    </PaginaSistema>
  )
}
