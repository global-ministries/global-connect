'use client'

/**
 * Estructura — what one org chart box shows, shared by the desktop diagram
 * and the phone chart (S12; prototype `.caja` / `.ov-c` in
 * prototipos/estructura/07-b-escritorio.html): the responsable's avatar (a
 * dashed "?" when nobody leads it), the name, the responsable line, the
 * branch's people in mono and one dot per health problem. The box itself is
 * a button that opens the node panel; its accessible name says everything the
 * dots and the count say.
 */
import type { ReactElement } from 'react'
import { Building2 } from 'lucide-react'

import { FONDO_TONO, type TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'
import type { CajaOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'

import { personasTexto } from './mensajes'
import { SALUD_PROBLEMA, nombreCorto } from './panel-nodo-resumen'

const TONOS_AVATAR = [
  'bg-chart-1/25 border-chart-1/40',
  'bg-chart-2/25 border-chart-2/40',
  'bg-chart-3/25 border-chart-3/40',
  'bg-chart-4/25 border-chart-4/40',
  'bg-chart-5/25 border-chart-5/40',
] as const

/** The soft halo around each health dot. */
const ANILLO: Record<TonoEstado, string> = {
  success: 'ring-success/20',
  warning: 'ring-warning/20',
  info: 'ring-info/20',
  danger: 'ring-danger/20',
  muted: 'ring-muted-foreground/20',
}

/** Same name, same color: the prototype's `tono`. */
function tonoAvatar(nombre: string): string {
  const suma = [...nombre].reduce((total, letra) => total + letra.charCodeAt(0), 0)
  return TONOS_AVATAR[suma % TONOS_AVATAR.length]
}

/** The box look: base, inactive (dashed), selected, highlighted and dimmed. */
export function claseCaja(caja: CajaOrganigrama): string {
  return cn(
    'focus-ring flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card px-3 text-left text-foreground touch-manipulation',
    'transition-[background-color,border-color,box-shadow,opacity] duration-150 hover:bg-accent motion-reduce:transition-none',
    !caja.activo && 'border-dashed bg-transparent',
    caja.tenue && 'border-dashed bg-transparent',
    caja.resaltado && 'border-brand ring-[3px] ring-brand/25',
    caja.seleccionado && 'border-brand bg-brand-tint ring-1 ring-inset ring-brand hover:bg-brand-tint',
  )
}

/** "Talleres, Jose Jimenez, 31 personas, Sin turno, solo lectura". */
export function descripcionCaja(caja: CajaOrganigrama): string {
  const partes = [
    caja.label,
    caja.responsable ? nombreCorto(caja.responsable.nombre) : 'sin responsable',
    personasTexto(caja.personasRama).toLowerCase(),
    ...caja.problemas.map((problema) => SALUD_PROBLEMA[problema].etiqueta),
    ...(caja.editable ? [] : ['solo lectura']),
  ]
  return partes.join(', ')
}

/** "Expandir, 4 equipos dentro de Talleres, con cosas por revisar" / "Contraer Talleres". */
export function etiquetaPlegar(caja: CajaOrganigrama): string {
  if (caja.abierto) return `Contraer ${caja.label}`
  const cuantos = caja.hijos.length === 1 ? '1 equipo' : `${caja.hijos.length} equipos`
  return `Expandir, ${cuantos} dentro de ${caja.label}${caja.puntoRama ? ', con cosas por revisar' : ''}`
}

function Avatar({ caja }: { readonly caja: CajaOrganigrama }): ReactElement {
  const { responsable } = caja
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
        responsable ? tonoAvatar(responsable.nombre) : 'border-dashed border-warning/60 bg-warning/15 text-warning-text',
        caja.tenue && 'opacity-45',
      )}
    >
      {responsable ? responsable.iniciales : '?'}
    </span>
  )
}

export function PuntosSalud({ caja }: { readonly caja: CajaOrganigrama }): ReactElement | null {
  const problemas = caja.problemas.filter((problema) => problema !== 'inactivo')
  if (problemas.length === 0) return null
  return (
    <span aria-hidden="true" className={cn('flex items-center gap-1.5', caja.tenue && 'opacity-45')}>
      {problemas.map((problema) => (
        <span
          key={problema}
          className={cn('size-[7px] rounded-full ring-[3px]', FONDO_TONO[SALUD_PROBLEMA[problema].tono], ANILLO[SALUD_PROBLEMA[problema].tono])}
        />
      ))}
    </span>
  )
}

/** The inside of a box: avatar, name and responsable, people and dots. */
export function ContenidoCaja({ caja }: { readonly caja: CajaOrganigrama }): ReactElement {
  const apagado = !caja.activo || caja.tenue
  const linea = caja.responsable ? nombreCorto(caja.responsable.nombre) : caja.activo ? 'Sin responsable' : 'Inactivo'
  return (
    <>
      <Avatar caja={caja} />
      <span className="grid min-w-0 flex-1 gap-px">
        <span className={cn('truncate text-sm font-semibold', apagado && 'font-medium text-muted-foreground')}>{caja.label}</span>
        <span
          className={cn(
            'truncate text-[12.5px] text-muted-foreground',
            !caja.responsable && !caja.tenue && 'text-warning-text',
          )}
        >
          {linea}
          {!caja.editable && ' · solo lectura'}
        </span>
      </span>
      <span aria-hidden="true" className="grid shrink-0 justify-items-end gap-1.5">
        <span className={cn('font-mono text-[15px] font-semibold leading-none tabular-nums', caja.tenue && 'font-medium text-muted-foreground')}>
          {caja.personasRama}
        </span>
        <PuntosSalud caja={caja} />
      </span>
    </>
  )
}

/** The campus box at the root: not a button, it only names where the chart starts. */
export function ContenidoRaiz({ nombre, personas }: { readonly nombre: string; readonly personas: number }): ReactElement {
  return (
    <>
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/20 text-brand-text">
        <Building2 className="size-4" />
      </span>
      <span className="grid min-w-0 flex-1 gap-px">
        <span className="truncate text-sm font-semibold">{nombre}</span>
        <span className="truncate text-[12.5px] text-muted-foreground">
          Dream Team · <span className="font-mono tabular-nums">{personas}</span> personas
        </span>
      </span>
    </>
  )
}
