'use client'

/**
 * Servidores — the list (docs/design-system/patterns.md#list-screen-anatomy):
 * a `ListaResponsiva` with one row per person ("Por persona", the default) or
 * per servicio ("Por servicio"). Desktop columns: Persona (name, phone and the
 * "Revisar teléfono" / "Sin cuenta" / "Grupos de Vida" marks), Sirve en (up to
 * three servicio chips and "+N más"), Turno (from lg) and Etapa. Phones get
 * inset grouped rows: avatar, name, "equipo · rol", status dot. Every row
 * opens the person's detail drawer (detalle-servidor.tsx); there are no row
 * menus.
 *
 * Under the "Sin cuenta" metric (`cuenta`, invitaciones pendientes T4) the
 * Turno and Etapa columns give way to "Invitación a registrarse" (state,
 * who and how long ago; the second line on phones), and an expired
 * invitation the viewer may resend gets a 44px checkbox.
 */
import type { ReactElement, ReactNode } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { ESTADO_LABELS, ORIGEN_GRUPOS_VIDA_LABEL, SIN_CUENTA_LABEL } from '@/components/dream-team/labels'
import { inicialesDe } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { DreamTeamEstado } from '@/lib/platform/dream-team/types'
import { esTelefonoReconocible, formatearTelefono } from '@/lib/utils/telefono'
import {
  recortarServicios,
  type ColumnaOrden,
  type FilaVista,
  type ItemLista,
  type VistaServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import { cn } from '@/lib/utils'
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'
import type { EstadoCuenta } from '@/lib/platform/dream-team/servidores-vista'

import { CasillaInvitacion, EstadoCuentaFila, lineaCuenta } from './invitaciones-servidores'

/** The status dot of each etapa (prototype `ESTADOS`). */
export const TONO_ESTADO: Readonly<Record<DreamTeamEstado, TonoEstado>> = {
  postulado: 'warning',
  en_orientacion: 'info',
  activo: 'success',
  en_pausa: 'muted',
  inactivo: 'muted',
  retirado: 'danger',
}

/** One row of the list: a person with the servicios that pass the filters, or a single servicio. */
interface FilaLista {
  readonly clave: string
  readonly personaId: string
  readonly nombre: string
  readonly telefono: string | null
  readonly tieneCuenta: boolean | null
  readonly soloGruposVida: boolean
  readonly estadoCuenta: EstadoCuenta | null
  readonly invitacion: ResumenInvitacion | null
  readonly filas: readonly FilaVista[]
}

function aFila(item: ItemLista): FilaLista {
  if (item.tipo === 'persona') {
    return { ...item, personaId: item.clave }
  }
  const { fila } = item
  return {
    clave: fila.clave,
    personaId: fila.personaId,
    nombre: fila.nombre,
    telefono: fila.telefono,
    tieneCuenta: fila.tieneCuenta,
    soloGruposVida: fila.origen === 'grupos_vida',
    estadoCuenta: fila.estadoCuenta,
    invitacion: fila.invitacion ?? null,
    filas: [fila],
  }
}

/** A phone worth fixing: something is stored, but it is not a number we recognize. */
export function telefonoARevisar(telefono: string | null): boolean {
  return telefono !== null && telefono.trim() !== '' && !esTelefonoReconocible(telefono)
}

/** The phone as shown: formatted when recognized, as stored otherwise; `null` when empty. */
export function telefonoVisible(telefono: string | null): string | null {
  if (telefono === null || telefono.trim() === '') return null
  return esTelefonoReconocible(telefono) ? formatearTelefono(telefono) : telefono
}

export function AvatarServidor({ nombre, grande = false }: { readonly nombre: string; readonly grande?: boolean }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand-text',
        grande ? 'size-14 text-lg' : 'size-10 text-sm',
      )}
    >
      {inicialesDe(nombre)}
    </span>
  )
}

/** "Revisar teléfono", "Sin cuenta" (not under the account pills, where the state says it), "Grupos de Vida". */
function Marcas({ fila, cuenta }: { readonly fila: FilaLista; readonly cuenta: boolean }): ReactElement {
  return (
    <>
      {telefonoARevisar(fila.telefono) && (
        <BadgeSistema variante="warning" tamaño="sm">
          Revisar teléfono
        </BadgeSistema>
      )}
      {fila.tieneCuenta === false && !cuenta && (
        <BadgeSistema variante="warning" tamaño="sm">
          {SIN_CUENTA_LABEL}
        </BadgeSistema>
      )}
      {fila.soloGruposVida && (
        <BadgeSistema variante="default" tamaño="sm">
          {ORIGEN_GRUPOS_VIDA_LABEL}
        </BadgeSistema>
      )}
    </>
  )
}

function CeldaPersona({ fila, cuenta }: { readonly fila: FilaLista; readonly cuenta: boolean }): ReactElement {
  const telefono = telefonoVisible(fila.telefono)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AvatarServidor nombre={fila.nombre} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-foreground">{fila.nombre}</p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className={cn(telefono && 'font-mono tabular-nums')}>{telefono ?? 'Sin teléfono'}</span>
          <Marcas fila={fila} cuenta={cuenta} />
        </div>
      </div>
    </div>
  )
}

function ChipServicio({ fila }: { readonly fila: FilaVista }): ReactElement {
  return (
    <span
      title={`${fila.equipoNombre} · ${fila.rolLabel} · ${ESTADO_LABELS[fila.estado]}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1 text-[13px]"
    >
      <PuntoEstado tono={TONO_ESTADO[fila.estado]} />
      <span className="truncate font-medium text-foreground">{fila.equipoNombre}</span>
      <span className="truncate text-muted-foreground">{fila.rolLabel}</span>
      {fila.origen === 'grupos_vida' && <span className="sr-only">{`(${ORIGEN_GRUPOS_VIDA_LABEL})`}</span>}
    </span>
  )
}

function CeldaServicios({ fila }: { readonly fila: FilaLista }): ReactElement {
  const { visibles, ocultos } = recortarServicios(fila.filas, false)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visibles.map((servicio) => (
        <ChipServicio key={servicio.clave} fila={servicio} />
      ))}
      {ocultos > 0 && <span className="px-1 text-[13px] text-muted-foreground">{`+${ocultos} más`}</span>}
    </div>
  )
}

/** The shift text of each servicio (servidores-vista `turnosTexto`), once per distinct value. */
function textoTurnos(fila: FilaLista): string {
  return [...new Set(fila.filas.map((servicio) => servicio.turnosTexto))].join(' · ')
}

function Etapa({ fila, ocultarEtiquetaEnMovil = false }: { readonly fila: FilaLista; readonly ocultarEtiquetaEnMovil?: boolean }): ReactElement {
  const estados = [...new Set(fila.filas.map((servicio) => servicio.estado))]
  if (estados.length > 1) {
    return <PuntoEstado tono="muted" etiqueta={`${estados.length} etapas`} ocultarEtiquetaEnMovil={ocultarEtiquetaEnMovil} />
  }
  return (
    <PuntoEstado tono={TONO_ESTADO[estados[0]]} etiqueta={ESTADO_LABELS[estados[0]]} ocultarEtiquetaEnMovil={ocultarEtiquetaEnMovil} />
  )
}

/** "Equipo · rol", plus "+N" when the person serves in more places. */
function resumenServicios(fila: FilaLista): string {
  const [primera] = fila.filas
  const mas = fila.filas.length > 1 ? ` · +${fila.filas.length - 1}` : ''
  return `${primera.equipoNombre} · ${primera.rolLabel}${mas}`
}

/** The checkboxes of the expired invitations the viewer may resend. */
export interface SeleccionInvitaciones {
  /** Person ids that get a checkbox. */
  readonly seleccionables: ReadonlySet<string>
  readonly marcadas: ReadonlySet<string>
  readonly onAlternar: (personaId: string, marcada: boolean) => void
}

export interface ListaServidoresProps {
  readonly vista: VistaServidores
  /** Under the "Sin cuenta" metric: the invitation column and line. */
  readonly cuenta?: boolean
  readonly seleccion?: SeleccionInvitaciones
  readonly onOrdenar: (columna: ColumnaOrden) => void
  /** Opens the detail drawer of the person. */
  readonly onAbrir: (personaId: string) => void
  /** The empty state (no data / no match), rendered inside the list. */
  readonly vacio: ReactNode
}

export function ListaServidores({ vista, cuenta = false, seleccion, onOrdenar, onAbrir, vacio }: ListaServidoresProps): ReactElement {
  const porPersona = vista.filtros.agrupar === 'persona'
  const conCasillas = seleccion !== undefined && seleccion.seleccionables.size > 0
  const columnas: readonly ColumnaLista[] = [
    // No visible title: each checkbox names its person.
    ...(conCasillas ? [{ id: 'seleccion', titulo: '', ancho: '44px' }] : []),
    { id: 'persona', titulo: 'Persona', ordenable: true, ancho: 'minmax(0,1.15fr)' },
    { id: 'equipo', titulo: porPersona ? 'Sirve en' : 'Equipo · rol', ordenable: true, ancho: 'minmax(0,1.6fr)' },
    ...(cuenta
      ? [{ id: 'invitacion', titulo: 'Invitación a registrarse', ancho: 'minmax(0,1.2fr)' }]
      : [
          { id: 'turno', titulo: 'Turno', ocultarEnTablet: true, ancho: 'minmax(0,0.8fr)' },
          { id: 'etapa', titulo: 'Etapa', ordenable: true, ancho: 'minmax(0,0.6fr)' },
        ]),
  ]
  const filas = vista.items.map(aFila)
  const ahora = new Date()
  const linea = (fila: FilaLista) => (cuenta && fila.estadoCuenta ? lineaCuenta(fila.estadoCuenta, fila.invitacion, ahora) : null)
  const casilla = (fila: FilaLista) =>
    seleccion?.seleccionables.has(fila.personaId) ? (
      <CasillaInvitacion
        etiqueta={`Seleccionar ${fila.nombre}`}
        marcada={seleccion.marcadas.has(fila.personaId)}
        onCambio={(marcada) => seleccion.onAlternar(fila.personaId, marcada)}
      />
    ) : null

  return (
    <ListaResponsiva
      etiqueta={porPersona ? 'Servidores' : 'Servicios'}
      columnas={columnas}
      filas={filas}
      claveFila={(fila) => fila.clave}
      orden={vista.filtros.orden}
      onOrdenar={(columna) => onOrdenar(columna as ColumnaOrden)}
      onAbrirFila={(fila) => onAbrir(fila.personaId)}
      etiquetaFila={(fila) => (porPersona ? `Abrir ${fila.nombre}` : `Abrir ${fila.nombre} en ${fila.filas[0].equipoNombre}`)}
      vacio={vacio}
      renderCelda={(fila, columna) => {
        switch (columna) {
          case 'seleccion':
            return casilla(fila)
          case 'invitacion': {
            const estado = linea(fila)
            return estado ? <EstadoCuentaFila linea={estado} /> : null
          }
          case 'persona':
            return <CeldaPersona fila={fila} cuenta={cuenta} />
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
      renderFilaMovil={(fila) => {
        const estado = linea(fila)
        if (cuenta) {
          const marca = casilla(fila)
          return {
            avatar: marca ? (
              <span className="-ml-2 flex items-center">
                {marca}
                <AvatarServidor nombre={fila.nombre} />
              </span>
            ) : (
              <AvatarServidor nombre={fila.nombre} />
            ),
            titulo: fila.nombre,
            subtitulo: estado ? estado.corta : resumenServicios(fila),
            meta: estado ? <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} ocultarEtiquetaEnMovil /> : undefined,
          }
        }
        return {
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
        }
      }}
    />
  )
}
