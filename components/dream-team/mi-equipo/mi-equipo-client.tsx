'use client'

/**
 * Dream Team — client island for /dream-team/mi-equipo.
 *
 * The screen works with people: it shows ONE direccion at a time (chosen by
 * the server from `?direccion=`), one card per team inside it and the people
 * of the selected team. Everything below the header is derived on the client
 * from the already-loaded view model (lib/platform/dream-team/mi-equipo-vista.ts):
 * the selected team, the estado filter and the name search are local state —
 * only the direccion lives in the URL.
 *
 * Everything that crosses in from the server page is plain serializable data.
 * Icons and callbacks are created here, inside the island.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Network } from 'lucide-react'

import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import {
  TODOS_LOS_EQUIPOS,
  contadoresPorEstado,
  filtrarPersonas,
  personasDeSeleccion,
  type DireccionResumen,
  type EquipoAsignable,
  type FiltroEstado,
  type VistaDireccion,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

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
  readonly equiposAsignables: readonly EquipoAsignable[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
}

export function MiEquipoClient(props: MiEquipoClientProps): ReactElement {
  if (!props.vista) {
    return (
      <ContenedorDashboard titulo="Mi equipo">
        <EstadoVacio
          icono={Network}
          titulo="Todavía no hay equipos para mostrar"
          subtitulo="Puede deberse a que aún no te asignaron un área en la estructura de Dream Team."
        />
      </ContenedorDashboard>
    )
  }
  // Keyed by direccion so switching it resets the team, filter and search.
  return <MiEquipoVistaDireccion key={props.vista.id} {...props} vista={props.vista} />
}

function subtituloDeLista(cantidad: number, responsable: string | null, busqueda: string): string {
  const personas = `${cantidad} ${cantidad === 1 ? 'persona' : 'personas'}`
  const conBusqueda = busqueda.trim() ? `${personas} para «${busqueda.trim()}»` : personas
  return responsable ? `${responsable} · ${conBusqueda}` : conBusqueda
}

function MiEquipoVistaDireccion({
  direcciones,
  vista,
  direccionId,
}: MiEquipoClientProps & { readonly vista: VistaDireccion }): ReactElement {
  const router = useRouter()
  const [seleccionadoId, setSeleccionadoId] = useState<string>(TODOS_LOS_EQUIPOS)
  const [filtro, setFiltro] = useState<FiltroEstado>('todos')
  const [query, setQuery] = useState('')

  // A refresh can drop the selected team from the data; never leave the list pointing at nothing.
  const tarjetaSeleccionada =
    vista.equipos.find((equipo) => equipo.id === seleccionadoId) ?? vista.todaLaDireccion

  const delEquipo = useMemo(
    () => personasDeSeleccion(vista.personas, tarjetaSeleccionada.id),
    [vista.personas, tarjetaSeleccionada.id],
  )
  // Counters follow the search but not the estado filter, so each pill shows what it would list.
  const porNombre = useMemo(() => filtrarPersonas(delEquipo, { query }), [delEquipo, query])
  const contadores = useMemo(() => contadoresPorEstado(porNombre), [porNombre])
  const visibles = useMemo(() => filtrarPersonas(porNombre, { estado: filtro }), [porNombre, filtro])

  function revisarPendientes(): void {
    setSeleccionadoId(TODOS_LOS_EQUIPOS)
    setQuery('')
    setFiltro('por_activar')
  }

  const responsable = tarjetaSeleccionada.responsable
  const lineaResponsable = responsable
    ? `${responsable.rol === 'coordinador' ? 'Coordina' : 'Dirige'} ${responsable.nombre}`
    : null

  return (
    <ContenedorDashboard titulo="Mi equipo">
      <EncabezadoMiEquipo
        direccionLabel={vista.label}
        dirige={vista.todaLaDireccion.responsable?.nombre ?? null}
        totalPersonas={vista.total}
        totalEquipos={vista.equipos.length}
        direcciones={direcciones}
        direccionId={direccionId}
        onDireccionChange={(id) => router.replace(`?direccion=${encodeURIComponent(id)}`)}
        query={query}
        onQueryChange={setQuery}
      />

      <FranjaPendientes pendientes={vista.pendientes} onRevisar={revisarPendientes} />

      <TarjetasEquipos
        todaLaDireccion={vista.todaLaDireccion}
        equipos={vista.equipos}
        modoCompacto={vista.modoCompacto}
        seleccionadoId={tarjetaSeleccionada.id}
        onSeleccionar={setSeleccionadoId}
      />

      <ListaPersonas
        titulo={tarjetaSeleccionada.label}
        subtitulo={subtituloDeLista(visibles.length, lineaResponsable, query)}
        personas={visibles}
        contadores={contadores}
        filtro={filtro}
        onFiltroChange={setFiltro}
        hayBusqueda={query.trim() !== ''}
      />
    </ContenedorDashboard>
  )
}
