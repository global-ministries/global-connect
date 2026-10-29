'use client'

/**
 * Estudiantes › Grupos — the group drawer (artboards 06 / 07): one
 * `DetalleResponsivo` (side panel from md, bottom sheet below) that swaps
 * views inside instead of stacking sheets (gap G8): the group, a member,
 * "Agregar integrante" and "Líderes de …". Every inner view starts with
 * "‹ <grupo>" and takes the focus when it opens. Each change saves at once
 * with a toast; the server action refreshes the page data, so the drawer
 * reads the group again from `grupos`.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import type { GrupoGestion, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'

import { useAccionGrupo } from './use-accion-grupo'
import { VistaAgregar } from './vista-agregar'
import { VistaGrupo } from './vista-grupo'
import { VistaIntegrante } from './vista-integrante'
import { FORM_LIDERES, VistaLideres } from './vista-lideres'

export type VistaDetalle = { readonly tipo: 'grupo' } | { readonly tipo: 'integrante'; readonly personaId: string } | { readonly tipo: 'agregar' } | { readonly tipo: 'lideres' }

export interface DetalleGrupoProps {
  /** `null` keeps the drawer closed (the group left the data). */
  readonly grupo: GrupoGestion | null
  readonly grupos: readonly GrupoGestion[]
  readonly subareas: readonly SubareaGestionable[]
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly onEditar: (grupoId: string) => void
}

function descripcionGrupo(grupo: GrupoGestion): string {
  const detalle = grupo.anioEtiqueta ?? grupo.zona
  return [grupo.subarea, grupo.ambito, detalle].filter(Boolean).join(' · ')
}

/** Focuses the inner view when it opens (G8: focus moves with the view). */
function VistaEnfocada({ clave, children }: { readonly clave: string; readonly children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (clave !== 'grupo') ref.current?.focus()
  }, [clave])
  return (
    <div ref={ref} tabIndex={-1} className="space-y-4 outline-none">
      {children}
    </div>
  )
}

export function DetalleGrupo({ grupo, grupos, subareas, abierto, onCambioAbierto, onEditar }: DetalleGrupoProps): ReactElement | null {
  const [vista, setVista] = useState<VistaDetalle>({ tipo: 'grupo' })
  const accion = useAccionGrupo()
  if (grupo === null) return null

  const volver = (): void => setVista({ tipo: 'grupo' })
  const integrante = vista.tipo === 'integrante' ? grupo.integrantes.find((i) => i.personaId === vista.personaId) : undefined
  // A member that left the group (moved, removed) drops the view back to the group.
  const actual: VistaDetalle = vista.tipo === 'integrante' && !integrante ? { tipo: 'grupo' } : vista

  let titulo = grupo.nombre
  let descripcion: string | undefined = descripcionGrupo(grupo)
  let pie: ReactNode
  let contenido: ReactNode
  switch (actual.tipo) {
    case 'integrante':
      titulo = integrante?.nombre ?? grupo.nombre
      descripcion = undefined
      contenido = integrante && <VistaIntegrante grupo={grupo} integrante={integrante} grupos={grupos} accion={accion} onVolver={volver} />
      break
    case 'agregar':
      titulo = 'Agregar integrante'
      descripcion = `${grupo.nombre} · entra como miembro`
      contenido = <VistaAgregar grupo={grupo} accion={accion} />
      pie = (
        <>
          <BotonSistema type="button" variante="outline" disabled aria-describedby="agregar-registrar-pista">
            Registrar nuevo
          </BotonSistema>
          <BotonSistema type="button" onClick={volver}>
            Listo
          </BotonSistema>
        </>
      )
      break
    case 'lideres':
      titulo = `Líderes de ${grupo.nombre}`
      descripcion = `Voluntarios del Dream Team de ${grupo.subarea} · ${grupo.ambito}`
      contenido = <VistaLideres grupo={grupo} grupos={grupos} accion={accion} onGuardado={volver} />
      pie = (
        <>
          <BotonSistema type="button" variante="outline" onClick={volver} disabled={accion.pendiente !== null}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={FORM_LIDERES} cargando={accion.pendiente === 'lideres'} disabled={accion.pendiente !== null}>
            Guardar líderes
          </BotonSistema>
        </>
      )
      break
    default:
      contenido = (
        <VistaGrupo
          grupo={grupo}
          subareas={subareas}
          accion={accion}
          onIntegrante={(personaId) => setVista({ tipo: 'integrante', personaId })}
          onAgregar={() => setVista({ tipo: 'agregar' })}
          onLideres={() => setVista({ tipo: 'lideres' })}
          onEditar={() => onEditar(grupo.id)}
        />
      )
  }

  const clave = actual.tipo === 'integrante' ? `integrante:${actual.personaId}` : actual.tipo

  return (
    <DetalleResponsivo abierto={abierto} onCambioAbierto={onCambioAbierto} titulo={titulo} descripcion={descripcion} pie={pie}>
      <VistaEnfocada key={clave} clave={clave}>
        {actual.tipo !== 'grupo' && <BotonAtrasMovil atras={{ etiqueta: grupo.nombre, onClick: volver }} className="-ml-2 max-w-full" />}
        {contenido}
      </VistaEnfocada>
    </DetalleResponsivo>
  )
}
