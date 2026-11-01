'use client'

/**
 * Niños › Check-in — the one overlay of the desk (S4: "new family in a sheet
 * without leaving the screen"): `DetalleResponsivo`, a side panel from md and
 * a bottom sheet on the phone. Only one is open at a time:
 * - Nueva familia: the desk registration form; on success the family opens
 *   at the mesa with its children already marked.
 * - Cambiar salón: the salones with occupancy (full warns, never blocks).
 * - Completar ficha: the ficha form of a child linked without one.
 * - Agregar niño / Vincular hijo existente: an adult without children (N11).
 * The forms keep their behavior and API calls; Esc closes the panel.
 */
import { useState, type ReactElement } from 'react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { salonDeHijo, type OcupacionSalon, type SalonDeHijo } from '@/lib/platform/ninos/checkin-vista'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

import { EditarNinoForm } from '../editar-nino-form'
import { RegistrarFamiliaForm } from '../registrar-familia-form'
import { VincularHijoForm } from '../vincular-hijo-form'
import { SelectorSalon } from './selector-salon'

export type PanelCheckin =
  | { tipo: 'nueva' }
  | { tipo: 'salon'; hijo: HijoEncontrado }
  | { tipo: 'ficha'; hijo: HijoEncontrado }
  | { tipo: 'agregar' | 'vincular'; id: string; nombre: string }

export interface PanelesCheckinProps {
  readonly panel: PanelCheckin | null
  readonly onCerrar: () => void
  readonly salones: readonly SalonFila[]
  readonly salonesNivel: readonly SalonNivel[]
  readonly fecha: string
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  /** The salón a child of the mesa goes to now (hand-picked included). */
  readonly salonDe: (h: HijoEncontrado) => SalonDeHijo
  readonly onElegirSalon: (hijoId: string, salonId: string) => void
  /** Opens a family at the mesa (search by `consulta`, select `padreId`). */
  readonly onAbrirFamilia: (padreId: string, consulta?: string) => void
  /** After a ficha is saved: reload the family at the mesa. */
  readonly onFichaGuardada: () => void
}

function encabezado(p: PanelCheckin): { titulo: string; descripcion?: string; ancho: 'md' | 'lg' } {
  switch (p.tipo) {
    case 'nueva':
      return { titulo: 'Nueva familia', descripcion: 'Al guardar, la familia se abre lista para el ingreso.', ancho: 'lg' }
    case 'salon':
      return { titulo: 'Cambiar salón', ancho: 'md' }
    case 'ficha':
      return { titulo: 'Completar ficha', descripcion: `Datos de ${p.hijo.nombre} ${p.hijo.apellido}.`, ancho: 'lg' }
    case 'agregar':
      return { titulo: 'Agregar niño', ancho: 'lg' }
    case 'vincular':
      return { titulo: 'Vincular hijo existente', descripcion: `Representante: ${p.nombre}.`, ancho: 'md' }
  }
}

export function PanelesCheckin(props: PanelesCheckinProps): ReactElement {
  const { panel, onCerrar } = props
  // The last panel stays as the header while the overlay animates closed.
  const [visto, setVisto] = useState<PanelCheckin | null>(panel)
  if (panel && panel !== visto) setVisto(panel)
  const actual = panel ?? visto
  const cabecera = actual ? encabezado(actual) : { titulo: '', ancho: 'md' as const }

  const abrirFamilia = (padreId: string, consulta?: string) => {
    onCerrar()
    props.onAbrirFamilia(padreId, consulta)
  }

  return (
    <DetalleResponsivo
      abierto={panel !== null}
      onCambioAbierto={(v) => !v && onCerrar()}
      titulo={cabecera.titulo}
      descripcion={cabecera.descripcion}
      ancho={cabecera.ancho}
    >
      {panel?.tipo === 'nueva' && (
        <RegistrarFamiliaForm salones={props.salonesNivel} onCancelar={onCerrar} onRegistrada={abrirFamilia} onAbrirFamilia={abrirFamilia} />
      )}
      {panel?.tipo === 'salon' && (
        <SelectorSalon
          hijo={panel.hijo}
          fecha={props.fecha}
          salones={props.salones}
          ocupacion={props.ocupacion}
          actualId={props.salonDe(panel.hijo).salonId}
          sugeridoId={salonDeHijo(panel.hijo, props.salones, props.fecha).salonId}
          onElegir={(salonId) => {
            props.onElegirSalon(panel.hijo.id, salonId)
            onCerrar()
          }}
        />
      )}
      {panel?.tipo === 'ficha' && (
        <EditarNinoForm
          key={panel.hijo.id}
          salones={props.salonesNivel}
          hijo={panel.hijo}
          onCancelar={onCerrar}
          onGuardado={() => {
            onCerrar()
            props.onFichaGuardada()
          }}
        />
      )}
      {panel?.tipo === 'agregar' && (
        <RegistrarFamiliaForm
          key={panel.id}
          salones={props.salonesNivel}
          padreExistente={{ id: panel.id, nombre: panel.nombre }}
          onCancelar={onCerrar}
          onRegistrada={(padreId) => abrirFamilia(padreId)}
          onAbrirFamilia={abrirFamilia}
        />
      )}
      {panel?.tipo === 'vincular' && (
        <VincularHijoForm
          key={panel.id}
          adulto={{ id: panel.id, nombre: panel.nombre }}
          onCancelar={onCerrar}
          onVinculado={() => abrirFamilia(panel.id)}
        />
      )}
    </DetalleResponsivo>
  )
}
