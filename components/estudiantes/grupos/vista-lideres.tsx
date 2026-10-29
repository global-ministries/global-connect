'use client'

/**
 * Estudiantes › Grupos — "Líderes de …" inside the group drawer (artboards
 * 06 / 07, `#vista=asignar`; gap G9): the multi-select of the sub-área's
 * volunteers, saved at once with estudiantes_grupo_lideres_fijar (it
 * replaces the whole set). The footer buttons of the drawer submit this
 * form (`FORM_LIDERES`).
 */
import { useState, type FormEvent, type ReactElement } from 'react'

import { fijarLideres } from '@/lib/actions/estudiantes-grupos.actions'
import type { GrupoGestion } from '@/lib/platform/estudiantes/grupos-datos'

import { SelectorLideres } from './selector-lideres'
import type { AccionGrupo } from './use-accion-grupo'

export const FORM_LIDERES = 'grupo-lideres'

export interface VistaLideresProps {
  readonly grupo: GrupoGestion
  readonly grupos: readonly GrupoGestion[]
  readonly accion: AccionGrupo
  readonly onGuardado: () => void
}

export function VistaLideres({ grupo, grupos, accion, onGuardado }: VistaLideresProps): ReactElement {
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(() => new Set(grupo.lideres.map((l) => l.servicioId)))

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const ok = await accion.ejecutar('lideres', () => fijarLideres({ grupoId: grupo.id, servicioIds: [...seleccion] }), 'Líderes guardados')
    if (ok) onGuardado()
  }

  return (
    <form id={FORM_LIDERES} onSubmit={guardar} className="space-y-4">
      <SelectorLideres
        subareaId={grupo.subareaId}
        campusId={grupo.campusId}
        grupos={grupos}
        grupoId={grupo.id}
        seleccion={seleccion}
        onCambio={setSeleccion}
        titulo="Voluntarios"
      />
      <p className="text-[13px] text-muted-foreground">
        {grupo.experiencia === 'the_living_room'
          ? 'Ven el nombre, la edad y el teléfono de sus integrantes y marcan su asistencia.'
          : 'Ven el nombre, año, teléfono, cumpleaños y el contacto del representante de sus integrantes y marcan su asistencia.'}
      </p>
    </form>
  )
}
