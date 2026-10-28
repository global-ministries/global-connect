'use client'

/**
 * Mi equipo — the people of the selected team: a header with the team name,
 * the estado filter pills (with counters that follow the search) and one
 * `TarjetaSistema p-0` holding a `divide-y` list with ONE row per person (S12,
 * as Servidores since #599): avatar with initials, name — with a "Sin cuenta"
 * mark when the person is known to have no account — and the profile phone as
 * Servidores shows it, once; then the person's servicios stacked, each with its
 * team, shifts, rol badge, estado badge and, with write access, its own actions
 * menu; past three servicios "+N más" expands the rest. Phone and account
 * come from dream_team_contactos_personas, so a person outside the caller's
 * scope simply has neither.
 *
 * Each servicio line is one grid: on phones the badges sit under the team and
 * the menu button spans both lines; from `md` they become columns.
 */
import { useState, type ReactElement } from 'react'

import { BadgeSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import {
  ESTADO_BADGE_VARIANTE,
  ESTADO_LABELS,
  ORIGEN_GRUPOS_VIDA_LABEL,
  SIN_CUENTA_LABEL,
  rolBadgeVariante,
} from '@/components/dream-team/labels'
import { TelefonoServidor } from '@/components/dream-team/servidores/telefono-servidor'
import { MenuPersona } from './menu-persona'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado } from '@/lib/platform/dream-team/types'
import { BotonVerMas } from '@/components/dream-team/servidores/tabla-servidores'
import { cn } from '@/lib/utils'
import {
  agruparPorPersona,
  type ContadoresPorEstado,
  type FiltroEstado,
  type PersonaAgrupada,
  type PersonaVista,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import { MAX_SERVICIOS_POR_PERSONA, recortarServicios } from '@/lib/platform/dream-team/servidores-vista'
import { isoLocal, nombreConFrecuencia } from '@/lib/platform/dream-team/frecuencia-turno'
import type { FrecuenciasPorTurno } from '@/lib/platform/dream-team/turnos'
import type { TipoTurno } from '@/lib/platform/dream-team/turno-fechas'

export interface ListaPersonasProps {
  readonly titulo: string
  readonly subtitulo: string
  /** One entry per servicio, already filtered; the list shows each person once with them stacked. */
  readonly personas: readonly PersonaVista[]
  readonly contadores: ContadoresPorEstado
  readonly filtro: FiltroEstado
  readonly onFiltroChange: (filtro: FiltroEstado) => void
  readonly hayBusqueda: boolean
  /** With write access every editable row gets the actions menu. */
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  /** Every active campus shift, in campus order; when there is any, each row names its shifts. */
  readonly turnos?: readonly { readonly id: string; readonly label: string; readonly tipo?: TipoTurno }[]
}

const SIN_TURNOS: NonNullable<ListaPersonasProps['turnos']> = []

/** "Domingo 9:00, Domingo 11:00 · Quincenal (semana B) · próximo 18 oct" ("TLR · Por fechas" for a dated shift), or "—" when none. */
function textoDeTurnos(
  turnoIds: readonly string[] | undefined,
  turnos: NonNullable<ListaPersonasProps['turnos']>,
  frecuencias: FrecuenciasPorTurno | undefined,
): string {
  const hoy = isoLocal(new Date())
  const nombres = turnos
    .filter((turno) => turnoIds?.includes(turno.id))
    .map((turno) => nombreConFrecuencia(turno.label, frecuencias?.[turno.id], hoy, turno.tipo))
  return nombres.length > 0 ? nombres.join(', ') : '—'
}

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
  turnos = SIN_TURNOS,
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
        <GrupoPastillas etiqueta="Filtrar por etapa" className="sm:-mx-4 sm:px-4 md:mx-0 md:px-0">
          {pastillas(contadores, filtro).map((pastilla) => (
            <PastillaFiltro
              key={pastilla.valor}
              etiqueta={pastilla.etiqueta}
              cantidad={pastilla.cantidad}
              activa={filtro === pastilla.valor}
              onClick={() => onFiltroChange(pastilla.valor)}
            />
          ))}
        </GrupoPastillas>
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
          {agruparPorPersona(personas).map((persona) => (
            <FilaPersona
              key={persona.clave}
              persona={persona}
              puedeEditar={puedeEditar}
              onActualizado={onActualizado}
              turnos={turnos}
            />
          ))}
        </ul>
      )}
    </TarjetaSistema>
  )
}

/** The servicios a person shows (three until expanded) and the "+N más" toggle, as Servidores. */
function useServiciosVisibles(servicios: readonly PersonaVista[]): {
  readonly visibles: readonly PersonaVista[]
  readonly toggle: ReactElement | null
} {
  const [expandido, setExpandido] = useState(false)
  const { visibles, ocultos } = recortarServicios(servicios, expandido)
  const toggle =
    servicios.length > MAX_SERVICIOS_POR_PERSONA ? (
      <BotonVerMas ocultos={ocultos} expandido={expandido} onCambio={setExpandido} />
    ) : null
  return { visibles, toggle }
}

function FilaPersona({
  persona,
  puedeEditar,
  onActualizado,
  turnos,
}: {
  readonly persona: PersonaAgrupada
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly turnos: NonNullable<ListaPersonasProps['turnos']>
}): ReactElement {
  const { visibles, toggle } = useServiciosVisibles(persona.servicios)
  const varios = persona.servicios.length > 1
  return (
    <li className="flex min-h-16 gap-3 px-4 py-2 hover:bg-accent/50 md:gap-4 md:px-5">
      <div
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-brand-text"
      >
        {persona.iniciales}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[15px] font-medium text-foreground">{persona.nombre}</p>
          {persona.soloGruposVida && (
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
        {/* [overflow-wrap:anywhere] lets a long stored phone break instead of pushing the row wider on phones. */}
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <TelefonoServidor telefono={persona.telefono} />
        </div>
        <div role="group" aria-label={`Servicios de ${persona.nombre}`} className="divide-y divide-border">
          {visibles.map((servicio) => (
            <LineaServicio
              key={servicio.clave}
              servicio={servicio}
              varios={varios}
              marcaGruposVida={!persona.soloGruposVida && servicio.origen === 'grupos_vida'}
              puedeEditar={puedeEditar}
              onActualizado={onActualizado}
              turnos={turnos}
            />
          ))}
        </div>
        {toggle}
      </div>
    </li>
  )
}

/**
 * One servicio of a person: equipo, shifts, rol and etapa badges and its own
 * menu. On phones the badges sit under the equipo and the menu spans both
 * lines; from `md` they become columns.
 */
function LineaServicio({
  servicio,
  varios,
  marcaGruposVida,
  puedeEditar,
  onActualizado,
  turnos,
}: {
  readonly servicio: PersonaVista
  /** The person has several servicios: the equipo shows on phones too and names the menu. */
  readonly varios: boolean
  readonly marcaGruposVida: boolean
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly turnos: NonNullable<ListaPersonasProps['turnos']>
}): ReactElement {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1 md:grid-cols-[minmax(0,1fr)_10rem_10rem_2.75rem] md:gap-x-4">
      <div className="min-w-0">
        <p className={cn('truncate text-sm text-muted-foreground', !varios && 'hidden md:block')}>{servicio.equipoLabel}</p>
        {turnos.length > 0 && (
          <p className="truncate text-sm text-muted-foreground">{`Turno: ${textoDeTurnos(servicio.turnoIds, turnos, servicio.frecuencias)}`}</p>
        )}
      </div>
      <div className="col-start-1 flex flex-wrap items-center gap-2 md:contents">
        <span className="flex flex-wrap items-center gap-2">
          <BadgeSistema variante={rolBadgeVariante(servicio.rolClave)} tamaño="sm">
            {servicio.rolLabel}
          </BadgeSistema>
          {marcaGruposVida && (
            <BadgeSistema variante="default" tamaño="sm">
              {ORIGEN_GRUPOS_VIDA_LABEL}
            </BadgeSistema>
          )}
        </span>
        <span className="md:block">
          <BadgeSistema variante={ESTADO_BADGE_VARIANTE[servicio.estado]} tamaño="sm">
            {ESTADO_LABELS[servicio.estado]}
          </BadgeSistema>
        </span>
      </div>
      {(puedeEditar || servicio.fichaEditable === true) && (
        <MenuPersona
          persona={servicio}
          puedeEditarServicio={puedeEditar}
          onActualizado={onActualizado}
          detalle={varios ? servicio.equipoLabel : undefined}
          className="col-start-2 row-span-2 row-start-1 md:col-start-auto md:row-span-1 md:row-start-auto"
        />
      )}
    </div>
  )
}
