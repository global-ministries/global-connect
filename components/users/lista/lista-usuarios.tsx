'use client'

/**
 * Usuarios — the list (docs/design-system/patterns.md#list-screen-anatomy;
 * prototype docs/design-system/prototipos/usuarios/01-lista-escritorio.html):
 * a `ListaResponsiva` with one row per person. Desktop columns: Persona
 * (avatar, name, cédula and the "Nuevo" / "Revisar teléfono" marks), Contacto
 * (from lg), Rol (neutral tags), Grupo de Vida, Campus (from lg, only without a
 * header campus) and "Cuenta · registro". Phones get inset grouped rows:
 * avatar, name, "rol · grupo" and a "Sin cuenta" mark.
 *
 * Every row opens the person panel. In "Seleccionar" mode (admin) a checkbox
 * column comes first and tapping a row marks it instead.
 */
import type { ReactElement, ReactNode } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { AvatarServidor, telefonoARevisar, telefonoVisible } from '@/components/dream-team/servidores/lista-servidores'
import {
  ETIQUETA_ROL,
  NUEVOS_DIAS,
  ordenDeLista,
  type ColumnaOrdenUsuarios,
  type FilaVistaUsuario,
  type OrdenUsuarios,
} from '@/lib/platform/usuarios/lista-vista'
import { fechaCorta } from '@/lib/platform/usuarios/fechas'
import { formatearCedula } from '@/lib/utils/cedula'
import { cn } from '@/lib/utils'

const MS_DIA = 24 * 60 * 60 * 1000

/** Registered in the last NUEVOS_DIAS days (the "Nuevos" metric). */
export function esNuevo(fechaRegistro: string | null, ahora: number = Date.now()): boolean {
  if (!fechaRegistro) return false
  const fecha = Date.parse(fechaRegistro)
  return Number.isFinite(fecha) && ahora - fecha <= NUEVOS_DIAS * MS_DIA
}

/** "V-23.580.237" for a Venezuelan cédula, "E-81110494" for a foreign one; anything else as stored. */
export function cedulaVisible(cedula: string | null): string | null {
  if (!cedula) return null
  const formateada = formatearCedula(cedula)
  return /^\d/.test(formateada) ? `V-${formateada}` : formateada
}

const primera = (texto: string) => texto.trim().split(/\s+/)[0] ?? ''

export function AvatarUsuario({ fila, grande = false }: { readonly fila: FilaVistaUsuario; readonly grande?: boolean }): ReactElement {
  if (fila.fotoUrl) {
    return <UserAvatar photoUrl={fila.fotoUrl} nombre={fila.nombre} apellido={fila.apellido} size={grande ? 'xl' : 'md'} className="pointer-events-none" />
  }
  // Initials of the first name and the first surname, as in the prototype ("Abraham Oviedo Mujica" → AO).
  return <AvatarServidor nombre={`${primera(fila.nombre)} ${primera(fila.apellido)}`} grande={grande} />
}

/** The first role as a neutral tag, "+N" for the rest (the panel lists them all). */
function Roles({ fila }: { readonly fila: FilaVistaUsuario }): ReactElement {
  const [primero, ...resto] = fila.roles
  return (
    <span title={fila.rolesEtiqueta} className="flex min-w-0 items-center gap-1.5">
      <BadgeSistema variante="default" tamaño="sm" className="truncate">
        {primero ? (ETIQUETA_ROL[primero] ?? primero) : 'Sin rol'}
      </BadgeSistema>
      {resto.length > 0 && <span className="text-xs text-muted-foreground">{`+${resto.length}`}</span>}
    </span>
  )
}

function Dos({ arriba, abajo, falta }: { readonly arriba: ReactNode; readonly abajo?: ReactNode; readonly falta?: boolean }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col text-[13px] leading-snug">
      <span className={cn('truncate', falta ? 'text-muted-foreground' : 'text-foreground')}>{arriba}</span>
      {abajo && <span className="truncate text-muted-foreground">{abajo}</span>}
    </div>
  )
}

function CeldaPersona({ fila }: { readonly fila: FilaVistaUsuario }): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AvatarUsuario fila={fila} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-foreground">{fila.nombreCompleto}</p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {fila.cedula && <span className="font-mono tabular-nums">{cedulaVisible(fila.cedula)}</span>}
          {esNuevo(fila.fechaRegistro) && (
            <BadgeSistema variante="info" tamaño="sm">
              Nuevo
            </BadgeSistema>
          )}
          {telefonoARevisar(fila.telefono) && (
            <BadgeSistema variante="warning" tamaño="sm">
              Revisar teléfono
            </BadgeSistema>
          )}
        </div>
      </div>
    </div>
  )
}

function CeldaContacto({ fila }: { readonly fila: FilaVistaUsuario }): ReactElement {
  const telefono = telefonoVisible(fila.telefono)
  return (
    <div className="flex min-w-0 flex-col text-[13px] leading-snug">
      <span className={cn('truncate', telefono ? 'font-mono tabular-nums text-foreground' : 'text-muted-foreground')}>{telefono ?? 'Sin teléfono'}</span>
      <span className="truncate text-muted-foreground">{fila.email ?? 'Sin email'}</span>
    </div>
  )
}

/** A checkbox that mirrors the row: the stretched row button marks it, so it is not its own tab stop. */
function Casilla({ marcada }: { readonly marcada: boolean }): ReactElement {
  return (
    <span className="flex size-11 items-center justify-center">
      <input
        type="checkbox"
        checked={marcada}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none size-[18px] accent-[var(--brand-strong)]"
      />
    </span>
  )
}

export interface ListaUsuariosProps {
  readonly filas: readonly FilaVistaUsuario[]
  readonly orden: OrdenUsuarios
  readonly onOrdenar: (columna: ColumnaOrdenUsuarios) => void
  readonly onAbrir: (fila: FilaVistaUsuario) => void
  /** Show the Campus column (no header campus selected). */
  readonly verCampus: boolean
  /** "Seleccionar" mode: the set of marked ids; `null` outside the mode. */
  readonly seleccion: ReadonlySet<string> | null
  readonly onMarcar: (id: string) => void
  readonly cargando: boolean
  readonly vacio: ReactNode
}

export function ListaUsuarios({ filas, orden, onOrdenar, onAbrir, verCampus, seleccion, onMarcar, cargando, vacio }: ListaUsuariosProps): ReactElement {
  const columnas: ColumnaLista[] = [
    // No visible title: "Seleccionar" would not fit in 44px; each row names the action.
    ...(seleccion ? [{ id: 'seleccion', titulo: '', ancho: '44px' }] : []),
    { id: 'persona', titulo: 'Persona', ordenable: true, ancho: 'minmax(0,1.5fr)' },
    { id: 'contacto', titulo: 'Contacto', ocultarEnTablet: true, ancho: 'minmax(0,1.1fr)' },
    { id: 'rol', titulo: 'Rol', ancho: 'minmax(0,0.8fr)' },
    { id: 'grupo', titulo: 'Grupo de Vida', ancho: 'minmax(0,1fr)' },
    ...(verCampus ? [{ id: 'campus', titulo: 'Campus', ocultarEnTablet: true, ancho: 'minmax(0,0.7fr)' }] : []),
    { id: 'registro', titulo: 'Cuenta · registro', ordenable: true, ancho: 'minmax(0,0.95fr)' },
  ]

  return (
    <ListaResponsiva
      etiqueta="Personas"
      columnas={columnas}
      filas={filas}
      claveFila={(fila) => fila.id}
      orden={ordenDeLista(orden)}
      onOrdenar={(columna) => onOrdenar(columna as ColumnaOrdenUsuarios)}
      onAbrirFila={(fila) => (seleccion ? onMarcar(fila.id) : onAbrir(fila))}
      etiquetaFila={(fila) =>
        seleccion ? `${seleccion.has(fila.id) ? 'Quitar de la selección a' : 'Seleccionar a'} ${fila.nombreCompleto}` : `Abrir ${fila.nombreCompleto}`
      }
      cargando={cargando}
      vacio={vacio}
      renderCelda={(fila, columna) => {
        switch (columna) {
          case 'seleccion':
            return <Casilla marcada={seleccion?.has(fila.id) ?? false} />
          case 'persona':
            return <CeldaPersona fila={fila} />
          case 'contacto':
            return <CeldaContacto fila={fila} />
          case 'rol':
            return <Roles fila={fila} />
          case 'grupo':
            return fila.grupoNombre ? <Dos arriba={fila.grupoNombre} /> : <Dos arriba="Sin grupo" falta />
          case 'campus':
            return <Dos arriba={fila.campusNombre ?? '—'} falta={!fila.campusNombre} />
          default:
            return (
              <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
                <PuntoEstado tono={fila.cuentaTono} etiqueta={fila.cuentaEtiqueta} />
                {fechaCorta(fila.fechaRegistro) && <span className="truncate text-muted-foreground">{`Desde ${fechaCorta(fila.fechaRegistro)}`}</span>}
              </div>
            )
        }
      }}
      renderFilaMovil={(fila) => ({
        avatar: seleccion ? (
          <span className="flex items-center gap-1">
            <Casilla marcada={seleccion.has(fila.id)} />
            <AvatarUsuario fila={fila} />
          </span>
        ) : (
          <AvatarUsuario fila={fila} />
        ),
        titulo: fila.nombreCompleto,
        subtitulo: `${fila.roles[0] ? (ETIQUETA_ROL[fila.roles[0]] ?? fila.roles[0]) : 'Sin rol'} · ${fila.grupoNombre ?? 'Sin grupo'}`,
        insignias:
          fila.cuenta === 'no' ? (
            <BadgeSistema variante="warning" tamaño="sm">
              Sin cuenta
            </BadgeSistema>
          ) : undefined,
      })}
    />
  )
}
