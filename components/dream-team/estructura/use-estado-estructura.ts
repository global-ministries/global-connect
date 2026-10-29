'use client'

/**
 * Estructura — the screen state and its URL (S12): the open node
 * (`?equipo=`, the legacy link), the search (`?q=`), the problem pill
 * (`?problema=`), the page tab (`?tab=turnos`) and the open branches
 * (`?expandidos=`, written once the user folds or unfolds something). The
 * codec is `leer/escribirFiltrosEstructura` in
 * lib/platform/dream-team/estructura-organigrama.ts.
 *
 * Opening a node goes through the router: the server answers with that
 * node's shifts (`turnos.delEquipo`). Everything else only rewrites the
 * address (`history.replaceState`, the search debounced), so typing or
 * folding a branch never reloads the page data.
 */
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import {
  FILTROS_ESTRUCTURA,
  escribirFiltrosEstructura,
  type FiltrosEstructura,
  type PestanaEstructura,
  type ProblemaEstructura,
} from '@/lib/platform/dream-team/estructura-organigrama'

const RETRASO_BUSQUEDA_MS = 300

export interface PanelAbierto {
  readonly id: string
  /** False while it closes: the node stays mounted for the exit and its dialogs. */
  readonly abierto: boolean
}

export function useEstadoEstructura(
  filtros: FiltrosEstructura,
  equipoId: string,
  expandidosPorDefecto: () => Set<string>,
) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const [q, setQ] = useState(filtros.q)
  const [problema, setProblema] = useState<ProblemaEstructura | null>(filtros.problema)
  const [tab, setTab] = useState<PestanaEstructura>(filtros.tab)
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(() =>
    filtros.expandidos ? new Set(filtros.expandidos) : expandidosPorDefecto(),
  )
  const [expandidosTocados, setExpandidosTocados] = useState(filtros.expandidos !== null)
  const [panel, setPanel] = useState<PanelAbierto | null>(equipoId ? { id: equipoId, abierto: true } : null)
  const [equipoDelServidor, setEquipoDelServidor] = useState(equipoId)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (temporizador.current && clearTimeout(temporizador.current)), [])

  // The URL changed under us (back, a link): follow it.
  if (equipoDelServidor !== equipoId) {
    setEquipoDelServidor(equipoId)
    setPanel((actual) => (equipoId ? { id: equipoId, abierto: true } : actual && { ...actual, abierto: false }))
  }

  const estado: FiltrosEstructura = {
    equipo: panel?.abierto ? panel.id : null,
    q,
    problema,
    tab,
    expandidos: expandidosTocados ? [...expandidos] : null,
  }

  function escribir(parche: Partial<FiltrosEstructura>, { servidor = false, retraso = 0 } = {}): void {
    if (temporizador.current) clearTimeout(temporizador.current)
    const consulta = escribirFiltrosEstructura({ ...FILTROS_ESTRUCTURA, ...estado, ...parche })
    const url = consulta ? `${pathname}?${consulta}` : pathname
    const aplicar = (): void => {
      temporizador.current = null
      if (servidor) router.replace(url, { scroll: false })
      else window.history.replaceState(window.history.state, '', url)
    }
    if (retraso > 0) temporizador.current = setTimeout(aplicar, retraso)
    else aplicar()
  }

  function cambiarExpandidos(siguientes: ReadonlySet<string>): void {
    setExpandidos(siguientes)
    setExpandidosTocados(true)
    escribir({ expandidos: [...siguientes] })
  }

  return {
    q,
    problema,
    tab,
    expandidos,
    panel,
    buscar(valor: string): void {
      setQ(valor)
      escribir({ q: valor }, { retraso: RETRASO_BUSQUEDA_MS })
    },
    elegirProblema(valor: ProblemaEstructura | null): void {
      setProblema(valor)
      escribir({ problema: valor })
    },
    elegirTab(valor: PestanaEstructura): void {
      setTab(valor)
      escribir({ tab: valor })
    },
    plegar(id: string): void {
      const siguientes = new Set(expandidos)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      cambiarExpandidos(siguientes)
    },
    cambiarExpandidos,
    abrir(id: string): void {
      setPanel({ id, abierto: true })
      escribir({ equipo: id }, { servidor: true })
    },
    cerrar(): void {
      setPanel((actual) => actual && { ...actual, abierto: false })
      escribir({ equipo: null })
    },
    /** From the node's Turnos tab: close the panel and show "Turnos del campus". */
    irATurnosCampus(): void {
      setPanel((actual) => actual && { ...actual, abierto: false })
      setTab('turnos')
      escribir({ equipo: null, tab: 'turnos' })
    },
  }
}
