'use client'

/**
 * Mi equipo — the list (docs/design-system/patterns.md#list-screen-anatomy):
 * a `ListaResponsiva` with one row per person ("Por persona", the default) or
 * one per servicio ("Por servicio", S11 decision 7). Desktop columns: Persona
 * (name, phone in mono and the "Revisar teléfono" / "Sin cuenta" / "Grupos de
 * Vida" marks), Sirve en (up to three servicio chips and "+N más"), Turno
 * (from lg, only when the campus has shifts) and Etapa. Phones get inset
 * grouped rows: avatar, name, "equipo · rol", status dot. Every row opens the
 * person panel (detalle-mi-equipo.tsx); there are no row menus.
 */
import type { ReactElement, ReactNode } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL, SIN_CUENTA_LABEL } from '@/components/dream-team/labels'
import { AvatarServidor, TONO_ESTADO, telefonoARevisar, telefonoVisible } from '@/components/dream-team/servidores/lista-servidores'
import { textoTurnosMiEquipo, type TurnoMiEquipo, type VistaMiEquipo } from '@/lib/platform/dream-team/mi-equipo-filtros'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { MAX_SERVICIOS_POR_PERSONA } from '@/lib/platform/dream-team/servidores-vista'
import { cn } from '@/lib/utils'

/** One row: a person with the servicios that pass the filters, or a single servicio. */
interface FilaMiEquipo {
  readonly clave: string
  readonly personaId: string
  readonly nombre: string
  readonly telefono: string | null
  readonly tieneCuenta: boolean | null
  readonly soloGruposVida: boolean
  readonly servicios: readonly PersonaVista[]
}

function filasDe(vista: VistaMiEquipo): FilaMiEquipo[] {
  if (vista.filtros.vista === 'persona') return vista.personas.map((persona) => ({ ...persona }))
  return vista.servicios.map((servicio) => ({
    clave: servicio.clave,
    personaId: servicio.personaId,
    nombre: servicio.nombre,
    telefono: servicio.telefono,
    tieneCuenta: servicio.tieneCuenta,
    soloGruposVida: servicio.origen === 'grupos_vida',
    servicios: [servicio],
  }))
}

function CeldaPersona({ fila }: { readonly fila: FilaMiEquipo }): ReactElement {
  const telefono = telefonoVisible(fila.telefono)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AvatarServidor nombre={fila.nombre} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-foreground">{fila.nombre}</p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className={cn(telefono && 'font-mono tabular-nums')}>{telefono ?? 'Sin teléfono'}</span>
          {telefonoARevisar(fila.telefono) && (
            <BadgeSistema variante="warning" tamaño="sm">
              Revisar teléfono
            </BadgeSistema>
          )}
          {fila.tieneCuenta === false && (
            <BadgeSistema variante="warning" tamaño="sm">
              {SIN_CUENTA_LABEL}
            </BadgeSistema>
          )}
          {fila.soloGruposVida && (
            <BadgeSistema variante="default" tamaño="sm">
              {ORIGEN_GRUPOS_VIDA_LABEL}
            </BadgeSistema>
          )}
        </div>
      </div>
    </div>
  )
}

function ChipServicio({ servicio }: { readonly servicio: PersonaVista }): ReactElement {
  return (
    <span
      title={`${servicio.equipoLabel} · ${servicio.rolLabel} · ${ESTADO_LABELS[servicio.estado]}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1 text-[13px]"
    >
      <PuntoEstado tono={TONO_ESTADO[servicio.estado]} />
      <span className="truncate font-medium text-foreground">{servicio.equipoLabel}</span>
      <span className="truncate text-muted-foreground">{servicio.rolLabel}</span>
      {servicio.origen === 'grupos_vida' && <span className="sr-only">{`(${ORIGEN_GRUPOS_VIDA_LABEL})`}</span>}
    </span>
  )
}

function CeldaServicios({ fila }: { readonly fila: FilaMiEquipo }): ReactElement {
  const visibles = fila.servicios.slice(0, MAX_SERVICIOS_POR_PERSONA)
  const ocultos = fila.servicios.length - visibles.length
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visibles.map((servicio) => (
        <ChipServicio key={servicio.clave} servicio={servicio} />
      ))}
      {ocultos > 0 && <span className="px-1 text-[13px] text-muted-foreground">{`+${ocultos} más`}</span>}
    </div>
  )
}

function Etapa({ fila, ocultarEtiquetaEnMovil = false }: { readonly fila: FilaMiEquipo; readonly ocultarEtiquetaEnMovil?: boolean }): ReactElement {
  const estados = [...new Set(fila.servicios.map((servicio) => servicio.estado))]
  if (estados.length > 1) {
    return <PuntoEstado tono="muted" etiqueta={`${estados.length} etapas`} ocultarEtiquetaEnMovil={ocultarEtiquetaEnMovil} />
  }
  return (
    <PuntoEstado tono={TONO_ESTADO[estados[0]]} etiqueta={ESTADO_LABELS[estados[0]]} ocultarEtiquetaEnMovil={ocultarEtiquetaEnMovil} />
  )
}

/** "Equipo · rol", plus "+N" when the person serves in more places. */
function resumenServicios(fila: FilaMiEquipo): string {
  const [primero] = fila.servicios
  const mas = fila.servicios.length > 1 ? ` · +${fila.servicios.length - 1}` : ''
  return `${primero.equipoLabel} · ${primero.rolLabel}${mas}`
}

export interface ListaMiEquipoProps {
  readonly vista: VistaMiEquipo
  /** Every active campus shift; without any the Turno column is left out. */
  readonly turnos: readonly TurnoMiEquipo[]
  readonly hoy: string
  readonly onAbrir: (personaId: string) => void
  /** The empty state (no data / no match), rendered inside the list. */
  readonly vacio: ReactNode
}

export function ListaMiEquipo({ vista, turnos, hoy, onAbrir, vacio }: ListaMiEquipoProps): ReactElement {
  const porPersona = vista.filtros.vista === 'persona'
  const columnas: ColumnaLista[] = [
    { id: 'persona', titulo: 'Persona', ancho: 'minmax(0,1.15fr)' },
    { id: 'equipo', titulo: porPersona ? 'Sirve en' : 'Equipo · rol', ancho: 'minmax(0,1.6fr)' },
    ...(turnos.length > 0 ? [{ id: 'turno', titulo: 'Turno', ocultarEnTablet: true, ancho: 'minmax(0,0.8fr)' }] : []),
    { id: 'etapa', titulo: 'Etapa', ancho: 'minmax(0,0.6fr)' },
  ]
  const textoTurnos = (fila: FilaMiEquipo): string =>
    [...new Set(fila.servicios.map((servicio) => (servicio.origen === 'dream_team' ? textoTurnosMiEquipo(servicio, turnos, hoy) : '—')))].join(' · ')

  return (
    <ListaResponsiva
      etiqueta={porPersona ? 'Personas del equipo' : 'Servicios del equipo'}
      columnas={columnas}
      filas={filasDe(vista)}
      claveFila={(fila) => fila.clave}
      onAbrirFila={(fila) => onAbrir(fila.personaId)}
      etiquetaFila={(fila) => (porPersona ? `Abrir ${fila.nombre}` : `Abrir ${fila.nombre} en ${fila.servicios[0].equipoLabel}`)}
      vacio={vacio}
      renderCelda={(fila, columna) => {
        switch (columna) {
          case 'persona':
            return <CeldaPersona fila={fila} />
          case 'equipo':
            return <CeldaServicios fila={fila} />
          case 'turno': {
            const texto = textoTurnos(fila)
            return (
              <span title={texto} className="truncate text-sm text-muted-foreground">
                {texto}
              </span>
            )
          }
          default:
            return <Etapa fila={fila} />
        }
      }}
      renderFilaMovil={(fila) => ({
        avatar: <AvatarServidor nombre={fila.nombre} />,
        titulo: fila.nombre,
        subtitulo: resumenServicios(fila),
        insignias:
          fila.tieneCuenta === false ? (
            <BadgeSistema variante="warning" tamaño="sm">
              {SIN_CUENTA_LABEL}
            </BadgeSistema>
          ) : undefined,
        meta: <Etapa fila={fila} ocultarEtiquetaEnMovil />,
      })}
    />
  )
}
