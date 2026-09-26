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
 */

import { useState, useTransition, type ReactElement } from 'react'
import { Plus } from 'lucide-react'

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
  onAgregar,
  onAgregado,
  onError,
}: FacilitadorPickerProps): ReactElement {
  const [, startTransition] = useTransition()
  const [personaId, setPersonaId] = useState(servidores[0]?.personaId ?? '')
  const [rol, setRol] = useState<RolFacilitadorPicker>('lider')

  function agregar(): void {
    if (!personaId) return
    startTransition(async () => {
      const result = await onAgregar(personaId, rol)
      if (result.ok) {
        onAgregado()
      } else {
        onError(result.message ?? 'No se pudo agregar el facilitador.')
      }
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        aria-label="Servidor a agregar"
        value={personaId}
        onChange={(e) => setPersonaId(e.target.value)}
        className="min-h-[44px] rounded-lg border border-border bg-card/50 px-3 py-2"
      >
        {servidores.map((s) => (
          <option key={s.personaId} value={s.personaId}>
            {nombreCompleto(s.nombre, s.apellido)}
          </option>
        ))}
      </select>
      <select
        aria-label="Rol"
        value={rol}
        onChange={(e) => setRol(e.target.value as RolFacilitadorPicker)}
        className="min-h-[44px] rounded-lg border border-border bg-card/50 px-3 py-2"
      >
        <option value="lider">Líder</option>
        <option value="voluntario">Voluntario</option>
      </select>
      <button
        type="button"
        onClick={agregar}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
      >
        <Plus className="h-4 w-4" /> Agregar facilitador
      </button>
    </div>
  )
}
