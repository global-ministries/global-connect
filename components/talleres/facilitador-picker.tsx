'use client'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the bounded
 * facilitador picker, extracted from plantilla-grupos-section.tsx (T3) so
 * both the taller's plantilla grupos AND the edición's instanciados grupos
 * (components/talleres/grupos-section.tsx) share the SAME picker instead
 * of duplicating it.
 *
 * A plain <select> built from the `servidores` prop
 * (talleres_servidores_del_taller) — no free-text search, and never
 * talleres_buscar_personas (that RPC stays for Dream Team's own servidor
 * assignment; Decisiones: "talleres_buscar_personas queda para asignar
 * servidores en Dream Team, no para facilitadores").
 *
 * The caller supplies `onAgregar` (a server action call, already bound to
 * whichever grupo/plantilla-grupo this instance targets) and translates a
 * failure into the friendly Spanish message errores-api.ts already
 * produced (e.g. NO_ES_SERVIDOR_ACTIVO_DEL_TALLER) — this component never
 * re-implements that mapping, it only surfaces `result.message`.
 *
 * T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) — the
 * two raw `<select>`s became `SelectSistema` (label "Servidor" / "Rol", an
 * empty first option so nobody is ever silently preselected), the option
 * list can exclude whoever is already assigned to the target grupo via
 * `excluirPersonaIds` (the caller passes that grupo's own facilitador
 * personaIds), and the submit button is a `BotonSistema` disabled until a
 * servidor is actually picked.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { Plus } from 'lucide-react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'

export interface ServidorPickerVM {
  readonly personaId: string
  readonly nombre: string | null
  readonly apellido: string | null
}

export type RolFacilitadorPicker = 'lider' | 'voluntario'

export interface FacilitadorPickerResult {
  readonly ok: boolean
  readonly message?: string
}

export interface FacilitadorPickerProps {
  readonly servidores: readonly ServidorPickerVM[]
  /** personaIds already assigned to the target grupo — excluded from the options. */
  readonly excluirPersonaIds?: readonly string[]
  readonly onAgregar: (personaId: string, rol: RolFacilitadorPicker) => Promise<FacilitadorPickerResult>
  readonly onAgregado: () => void
  readonly onError: (message: string) => void
}

function nombreCompleto(nombre: string | null, apellido: string | null): string {
  return (
    [nombre, apellido].filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ') ||
    'Persona sin nombre'
  )
}

export function FacilitadorPicker({
  servidores,
  excluirPersonaIds = [],
  onAgregar,
  onAgregado,
  onError,
}: FacilitadorPickerProps): ReactElement {
  const [, startTransition] = useTransition()
  const [personaId, setPersonaId] = useState('')
  const [rol, setRol] = useState<RolFacilitadorPicker>('lider')

  const excluidos = new Set(excluirPersonaIds)
  const disponibles = servidores.filter((s) => !excluidos.has(s.personaId))

  function agregar(): void {
    if (!personaId) return
    startTransition(async () => {
      const result = await onAgregar(personaId, rol)
      if (result.ok) {
        setPersonaId('')
        onAgregado()
      } else {
        onError(result.message ?? 'No se pudo agregar el facilitador.')
      }
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <SelectSistema
        label="Servidor"
        placeholder="Elige un servidor…"
        value={personaId}
        onValueChange={setPersonaId}
        opciones={disponibles.map((s) => ({
          valor: s.personaId,
          etiqueta: nombreCompleto(s.nombre, s.apellido),
        }))}
        className="min-w-[12rem]"
      />
      <SelectSistema
        label="Rol"
        value={rol}
        onValueChange={(v) => setRol(v as RolFacilitadorPicker)}
        opciones={[
          { valor: 'lider', etiqueta: 'Líder' },
          { valor: 'voluntario', etiqueta: 'Voluntario' },
        ]}
        className="min-w-[10rem]"
      />
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        icono={Plus}
        onClick={agregar}
        disabled={!personaId}
      >
        Agregar facilitador
      </BotonSistema>
    </div>
  )
}
