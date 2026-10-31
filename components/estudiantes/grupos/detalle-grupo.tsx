'use client'

/**
 * Estudiantes › Grupos — the group drawer (artboards 06 / 07): one
 * `DetalleResponsivo` (side panel from md, bottom sheet below) that swaps
 * views inside instead of stacking sheets (gap G8): the group, a member,
 * "Agregar integrante", "Registrar nuevo" (the visitor form of the leader
 * list, artboard 02: the person joins as visitante of the group's newest
 * meeting) and "Líderes de …". Every inner view starts with
 * "‹ <grupo>" and takes the focus when it opens. Each change saves at once
 * with a toast; the server action refreshes the page data, so the drawer
 * reads the group again from `grupos`.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { sesionReciente } from '@/lib/actions/estudiantes-lista.actions'
import type { GradoEscala, GrupoGestion, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'
import { fechaCorta } from '@/lib/platform/estudiantes/lista-vista'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'

import { ContenidoVisitante, PieVisitante } from '../visitante/flujo-visitante'
import { useFlujoVisitante, type GrupoVisitante, type SesionVisitante } from '../visitante/use-flujo-visitante'

import { useAccionGrupo } from './use-accion-grupo'
import { VistaAgregar } from './vista-agregar'
import { VistaGrupo } from './vista-grupo'
import { VistaIntegrante } from './vista-integrante'
import { FORM_LIDERES, VistaLideres } from './vista-lideres'

export type VistaDetalle =
  | { readonly tipo: 'grupo' }
  | { readonly tipo: 'integrante'; readonly personaId: string }
  | { readonly tipo: 'agregar' }
  | { readonly tipo: 'registrar' }
  | { readonly tipo: 'lideres' }

type SesionRegistro = { readonly tipo: 'cargando' } | { readonly tipo: 'lista'; readonly sesion: SesionVisitante | null } | { readonly tipo: 'error'; readonly mensaje: string }

const GRUPO_VACIO: GrupoVisitante = { id: '', nombre: '', experiencia: 'estudiantes', ambitoId: '', subarea: '', anio: null }

export interface DetalleGrupoProps {
  /** `null` keeps the drawer closed (the group left the data). */
  readonly grupo: GrupoGestion | null
  readonly grupos: readonly GrupoGestion[]
  readonly subareas: readonly SubareaGestionable[]
  /** The school scale of each campus, for the visitor form. */
  readonly escalas?: Readonly<Record<string, readonly GradoEscala[]>>
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

export function DetalleGrupo({ grupo, grupos, subareas, escalas = {}, abierto, onCambioAbierto, onEditar }: DetalleGrupoProps): ReactElement | null {
  const [vista, setVista] = useState<VistaDetalle>({ tipo: 'grupo' })
  const [sesionRegistro, setSesionRegistro] = useState<SesionRegistro>({ tipo: 'cargando' })
  const accion = useAccionGrupo()
  const volver = (): void => setVista({ tipo: 'grupo' })
  const flujo = useFlujoVisitante({
    grupo: grupo
      ? { id: grupo.id, nombre: grupo.nombre, experiencia: grupo.experiencia, ambitoId: grupo.ambitoId, subarea: grupo.subarea, anio: grupo.anio }
      : GRUPO_VACIO,
    sesion: sesionRegistro.tipo === 'lista' ? sesionRegistro.sesion : null,
    escala: grupo ? (escalas[grupo.campusId] ?? []) : [],
    hoy: hoyEnCaracas(),
    onListo: volver,
    onCancelar: () => setVista({ tipo: 'agregar' }),
    onAtras: () => setVista({ tipo: 'agregar' }),
  })
  if (grupo === null) return null

  function abrirRegistro(grupoId: string): void {
    setVista({ tipo: 'registrar' })
    flujo.empezarEnFormulario()
    setSesionRegistro({ tipo: 'cargando' })
    sesionReciente({ grupoId }).then(
      (r) => setSesionRegistro(r.ok ? { tipo: 'lista', sesion: r.data } : { tipo: 'error', mensaje: r.message }),
      () => setSesionRegistro({ tipo: 'error', mensaje: 'No se pudieron cargar las reuniones. Revisa tu conexión.' }),
    )
  }
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
          <BotonSistema type="button" variante="outline" aria-describedby="agregar-registrar-pista" onClick={() => abrirRegistro(grupo.id)}>
            Registrar nuevo
          </BotonSistema>
          <BotonSistema type="button" onClick={volver}>
            Listo
          </BotonSistema>
        </>
      )
      break
    case 'registrar': {
      const sesion = sesionRegistro.tipo === 'lista' ? sesionRegistro.sesion : null
      titulo = 'Registrar nuevo'
      descripcion = sesion ? `${grupo.nombre} · queda como visitante del ${fechaCorta(sesion.fecha)}` : grupo.nombre
      contenido =
        sesionRegistro.tipo === 'cargando' ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <SkeletonLista filas={3} />
          </div>
        ) : sesionRegistro.tipo === 'error' ? (
          <AvisoFormulario tono="error">{sesionRegistro.mensaje}</AvisoFormulario>
        ) : sesion === null ? (
          <AvisoFormulario tono="info">
            {grupo.experiencia === 'the_living_room'
              ? 'Este grupo todavía no tiene día de reunión. Edítalo y elige el día para registrar visitantes.'
              : `En las últimas 8 semanas ningún turno del Dream Team sirvió a ${grupo.ambito}, así que no hay una reunión donde registrarlo.`}
          </AvisoFormulario>
        ) : (
          <ContenidoVisitante flujo={flujo} />
        )
      pie = sesion ? <PieVisitante flujo={flujo} /> : undefined
      break
    }
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
