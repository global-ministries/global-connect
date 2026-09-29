'use client'

/**
 * Dream Team — client island for /admin/dream-team/estructura.
 *
 * Two panes: the org chart (searchable, foldable, closable) and the detail of
 * the selected team. Everything is derived on the client from the data the
 * server page hands over (lib/platform/dream-team/estructura-vista.ts builds
 * the flattened rows and the detail); the selection also lives in the URL
 * (`?equipo=<id>`) so it can be shared, but it is kept in local state as well
 * so choosing a team answers at once instead of waiting for the server to
 * render the page again.
 *
 * Everything that crosses in from the server page is plain serializable data.
 * Icons and callbacks are created here, inside the island. Mutations live in
 * ./actions.ts (server actions) and only ever target real equipos — the
 * virtual Grupos de Vida branch is read-only.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { FolderTree } from 'lucide-react'

import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import {
  ancestrosDe,
  crearVistaEstructura,
  type TallerVinculado,
  type UsoServicios,
} from '@/lib/platform/dream-team/estructura-vista'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

import { DetalleEquipoVista } from './detalle-equipo'
import { PanelOrganigrama, RielOrganigrama } from './panel-arbol'
import { usePanelAbierto } from './use-panel-abierto'

export interface EstructuraClientProps {
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly uso: UsoServicios
  readonly talleres: Readonly<Record<string, TallerVinculado>>
  /** The team the server resolved from `?equipo=` (or the default); empty when there is no tree. */
  readonly equipoId: string
  readonly puedeEditar: boolean
}

export function EstructuraClient(props: EstructuraClientProps): ReactElement {
  if (props.arbol.length === 0) {
    return (
      <ContenedorDashboard titulo="Estructura">
        <EstadoVacio
          icono={FolderTree}
          titulo="No se encontraron equipos"
          subtitulo="Puede que la estructura esté vacía, o que tu sesión no tenga acceso de lectura sobre ningún nodo del árbol."
        />
      </ContenedorDashboard>
    )
  }
  return <EstructuraConArbol {...props} />
}

function EstructuraConArbol({ arbol, rolesPorEquipo, uso, talleres, equipoId, puedeEditar }: EstructuraClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const vista = useMemo(
    () => crearVistaEstructura({ arbol, rolesPorEquipo, uso, talleres }),
    [arbol, rolesPorEquipo, uso, talleres],
  )

  const [panelAbierto, alternarPanel] = usePanelAbierto()
  const [seleccionadoId, setSeleccionadoId] = useState(equipoId)
  const [equipoIdDelServidor, setEquipoIdDelServidor] = useState(equipoId)
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(() => new Set(ancestrosDe(arbol, equipoId)))
  const [query, setQuery] = useState('')
  const [inactivasAbiertas, setInactivasAbiertas] = useState(() =>
    vista.inactivas('').some((fila) => fila.id === vista.direccionDe(equipoId)),
  )

  // The URL changed under us (back link, sidebar): follow it.
  if (equipoIdDelServidor !== equipoId) {
    setEquipoIdDelServidor(equipoId)
    setSeleccionadoId(equipoId)
  }

  // A refresh can drop the selected team from the data; never leave the detail pointing at nothing.
  const detalle = vista.detalle(seleccionadoId) ?? vista.detalle(vista.equipoPorDefecto() ?? '')

  function seleccionar(id: string): void {
    setSeleccionadoId(id)
    setExpandidos((previos) => new Set([...previos, ...ancestrosDe(arbol, id)]))
    router.replace(`?equipo=${encodeURIComponent(id)}`, { scroll: false })
  }

  function alternarNodo(id: string): void {
    setExpandidos((previos) => {
      const siguientes = new Set(previos)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }

  const arbolProps = {
    filas: vista.arbolVisible({ expandidos, query }),
    inactivas: vista.inactivas(query),
    query,
    onQueryChange: setQuery,
    seleccionadoId: detalle?.id ?? seleccionadoId,
    inactivasAbiertas,
    onAlternarInactivas: () => setInactivasAbiertas((abiertas) => !abiertas),
    onSeleccionar: seleccionar,
    onAlternarNodo: alternarNodo,
  }

  return (
    <ContenedorDashboard titulo="Estructura">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {panelAbierto ? <PanelOrganigrama {...arbolProps} onCerrar={alternarPanel} /> : <RielOrganigrama onAbrir={alternarPanel} />}

        {detalle && (
          <DetalleEquipoVista
            detalle={detalle}
            direccionId={vista.direccionDe(detalle.id) ?? detalle.id}
            puedeEditar={puedeEditar}
            onSeleccionar={seleccionar}
            onActualizado={() => router.refresh()}
            toast={toast}
          />
        )}
      </div>
    </ContenedorDashboard>
  )
}
