'use client'

/**
 * Mi equipo — the people of the selected team: a header with the team name,
 * the estado filter pills (with counters that follow the search) and one
 * `TarjetaSistema p-0` holding a `divide-y` list of rows (avatar with
 * initials, name — with a "Sin cuenta" mark when the person is known to have no
 * account —, team, the profile phone as Servidores shows it, rol badge, estado
 * badge and, with write access, the per-person actions menu). Phone and account
 * come from dream_team_contactos_personas, so a person outside the caller's
 * scope simply has neither.
 *
 * Each row is one grid: on phones the badges sit under the name and the menu
 * button spans both lines; from `md` they become columns.
 */
import type { ReactElement } from 'react'

import { BadgeSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import {
  ESTADO_BADGE_VARIANTE,
  ESTADO_LABELS,
  ORIGEN_GRUPOS_VIDA_LABEL,
  SIN_CUENTA_LABEL,
  rolBadgeVariante,
} from '@/components/dream-team/labels'
import { TelefonoServidor } from '@/components/dream-team/servidores/telefono-servidor'
import { cn } from '@/lib/utils'
import { MenuPersona } from './menu-persona'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado } from '@/lib/platform/dream-team/types'
import type { ContadoresPorEstado, FiltroEstado, PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'

export interface ListaPersonasProps {
  readonly titulo: string
  readonly subtitulo: string
  readonly personas: readonly PersonaVista[]
  readonly contadores: ContadoresPorEstado
  readonly filtro: FiltroEstado
  readonly onFiltroChange: (filtro: FiltroEstado) => void
  readonly hayBusqueda: boolean
  /** With write access every editable row gets the actions menu. */
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
}

const ANILLO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** Always offered; the other estados only appear when someone is in them. */
const ESTADOS_SIEMPRE: readonly DreamTeamEstado[] = ['activo', 'en_orientacion', 'en_pausa']

interface Pastilla {
  readonly valor: FiltroEstado
  readonly etiqueta: string
  readonly cantidad: number
}

function pastillas(contadores: ContadoresPorEstado, filtro: FiltroEstado): Pastilla[] {
  const lista: Pastilla[] = [{ valor: 'todos', etiqueta: 'Todos', cantidad: contadores.todos }]
  for (const estado of DREAM_TEAM_ESTADOS) {
    if (!ESTADOS_SIEMPRE.includes(estado) && contadores[estado] === 0 && filtro !== estado) continue
    lista.push({ valor: estado, etiqueta: etiquetaPastilla(estado), cantidad: contadores[estado] })
  }
  // Only while "Revisar" is active: postulado + en_orientacion together.
  if (filtro === 'por_activar') {
    lista.push({ valor: 'por_activar', etiqueta: 'Por activar', cantidad: contadores.postulado + contadores.en_orientacion })
  }
  return lista
}

function etiquetaPastilla(estado: DreamTeamEstado): string {
  return estado === 'activo' ? 'Activos' : ESTADO_LABELS[estado]
}

export function ListaPersonas({
  titulo,
  subtitulo,
  personas,
  contadores,
  filtro,
  onFiltroChange,
  hayBusqueda,
  puedeEditar,
  onActualizado,
}: ListaPersonasProps): ReactElement {
  return (
    <TarjetaSistema className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
        <div className="min-w-0">
          <TituloSistema nivel={3}>{titulo}</TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            {subtitulo}
          </TextoSistema>
        </div>
        <div role="group" aria-label="Filtrar por etapa" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {pastillas(contadores, filtro).map((pastilla) => {
            const activa = filtro === pastilla.valor
            return (
              <button
                key={pastilla.valor}
                type="button"
                aria-pressed={activa}
                onClick={() => onFiltroChange(pastilla.valor)}
                className={cn(
                  'min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors',
                  activa ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  ANILLO,
                )}
              >
                {pastilla.etiqueta} · {pastilla.cantidad}
              </button>
            )
          })}
        </div>
      </div>

      {personas.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <TextoSistema className="font-semibold">
            {hayBusqueda || filtro !== 'todos' ? 'Nadie coincide con esa búsqueda' : 'Todavía no hay personas en este equipo'}
          </TextoSistema>
          {(hayBusqueda || filtro !== 'todos') && (
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
              Prueba con otro nombre o quita el filtro de etapa.
            </TextoSistema>
          )}
        </div>
      ) : (
        <ul aria-label="Personas del equipo" className="divide-y divide-border">
          {personas.map((persona) => (
            <FilaPersona key={persona.clave} persona={persona} puedeEditar={puedeEditar} onActualizado={onActualizado} />
          ))}
        </ul>
      )}
    </TarjetaSistema>
  )
}

function FilaPersona({
  persona,
  puedeEditar,
  onActualizado,
}: {
  readonly persona: PersonaVista
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
}): ReactElement {
  const esGdv = persona.origen === 'grupos_vida'
  return (
    <li className="grid min-h-16 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-accent/50 md:grid-cols-[2.5rem_minmax(0,1fr)_10rem_10rem_2.75rem] md:gap-x-4 md:px-5">
      <div
        aria-hidden="true"
        className="row-span-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-accent-strong)] text-sm font-bold text-[var(--brand-primary)] md:row-span-1"
      >
        {persona.iniciales}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[15px] font-medium text-foreground">{persona.nombre}</p>
          {esGdv && (
            <BadgeSistema variante="default" tamaño="sm" className="shrink-0">
              {ORIGEN_GRUPOS_VIDA_LABEL}
            </BadgeSistema>
          )}
          {persona.tieneCuenta === false && (
            <BadgeSistema variante="warning" tamaño="sm" className="shrink-0">
              {SIN_CUENTA_LABEL}
            </BadgeSistema>
          )}
        </div>
        <p className="hidden truncate text-sm text-muted-foreground md:block">{persona.equipoLabel}</p>
        {/* [overflow-wrap:anywhere] lets a long stored phone break instead of pushing the row wider on phones. */}
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <TelefonoServidor telefono={persona.telefono} />
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 md:contents">
        <span className="md:block">
          <BadgeSistema variante={rolBadgeVariante(persona.rolClave)} tamaño="sm">
            {persona.rolLabel}
          </BadgeSistema>
        </span>
        <span className="md:block">
          <BadgeSistema variante={ESTADO_BADGE_VARIANTE[persona.estado]} tamaño="sm">
            {ESTADO_LABELS[persona.estado]}
          </BadgeSistema>
        </span>
      </div>
      {puedeEditar && <MenuPersona persona={persona} onActualizado={onActualizado} />}
    </li>
  )
}
