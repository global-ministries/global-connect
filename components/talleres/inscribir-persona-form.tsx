'use client'

/**
 * T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
 * coordinator/director "Inscribir persona" control on the edición page.
 * No prior version of this control existed anywhere in the app (grepped
 * app/lib for "inscrib" before writing this — the only enrolment flow was
 * the public self-enroll under /talleres/explorar), so this is new.
 *
 * Flow: search by name/email (talleres_buscar_personas via the
 * buscarPersonasParaInscribir action), pick one, "Inscribir". A normal
 * insert (agregarInscripcion) runs first; when the edición's cupo is full
 * it comes back mapped to `error: 'cupo-lleno'` (lib/platform/talleres/
 * errores-api.ts) instead of the generic 'conflict', so this component can
 * show a second-step button — "Inscribir igual (sobre el cupo)" — that
 * calls inscribirSobreCupo (the RPC that records who overrode the cupo and
 * when). Any other failure just shows the message, no second step.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus } from 'lucide-react'

import { BotonSistema, InputSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import {
  agregarInscripcion,
  buscarPersonasParaInscribir,
  inscribirSobreCupo,
} from '@/app/(auth)/talleres/[taller]/[edicion]/actions'

export interface InscribirPersonaFormProps {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly cohorteId: string
}

interface PersonaResultado {
  readonly id: string
  readonly nombre: string | null
  readonly apellido: string | null
  readonly email: string | null
}

function nombreCompleto(p: PersonaResultado): string {
  const nombre = [p.nombre, p.apellido].filter((x): x is string => Boolean(x && x.length > 0)).join(' ')
  return nombre || p.email || 'Persona sin nombre'
}

export function InscribirPersonaForm({
  tallerSlug,
  edicionId,
  cohorteId,
}: InscribirPersonaFormProps): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<readonly PersonaResultado[]>([])
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cupoLleno, setCupoLleno] = useState(false)
  const [pending, setPending] = useState(false)

  function buscar(): void {
    setError(null)
    startTransition(async () => {
      const result = await buscarPersonasParaInscribir(q)
      if (result.ok) {
        setResultados(result.personas)
      } else {
        setResultados([])
        setError(result.message ?? 'No se pudo buscar personas.')
      }
    })
  }

  function reset(): void {
    setQ('')
    setResultados([])
    setPersonaId(null)
    setError(null)
    setCupoLleno(false)
  }

  function inscribir(): void {
    if (!personaId) return
    setError(null)
    setCupoLleno(false)
    setPending(true)
    startTransition(async () => {
      const result = await agregarInscripcion({ tallerSlug, edicionId, cohorteId, personaId })
      setPending(false)
      if (result.ok) {
        reset()
        router.refresh()
        return
      }
      setError(result.message)
      if (result.error === 'cupo-lleno') setCupoLleno(true)
    })
  }

  function inscribirIgual(): void {
    if (!personaId) return
    setError(null)
    setPending(true)
    startTransition(async () => {
      const result = await inscribirSobreCupo({ tallerSlug, edicionId, personaId })
      setPending(false)
      if (result.ok) {
        reset()
        router.refresh()
        return
      }
      setError(result.message)
    })
  }

  return (
    <TarjetaSistema variante="outlined" className="p-4">
      <div className="flex flex-wrap items-end gap-2">
        <InputSistema
          label="Buscar persona"
          placeholder="Nombre, apellido o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[14rem] flex-1"
        />
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Search} onClick={buscar}>
          Buscar
        </BotonSistema>
      </div>

      {resultados.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {resultados.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="persona-a-inscribir"
                  checked={personaId === p.id}
                  onChange={() => {
                    setPersonaId(p.id)
                    setError(null)
                    setCupoLleno(false)
                  }}
                />
                <TextoSistema tamaño="sm">
                  {nombreCompleto(p)}
                  {p.email && <span className="text-muted-foreground"> · {p.email}</span>}
                </TextoSistema>
              </label>
            </li>
          ))}
        </ul>
      )}

      {personaId && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BotonSistema
            type="button"
            variante="primario"
            tamaño="sm"
            icono={UserPlus}
            onClick={inscribir}
            disabled={pending}
          >
            {pending ? 'Inscribiendo…' : 'Inscribir'}
          </BotonSistema>
          {cupoLleno && (
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              onClick={inscribirIgual}
              disabled={pending}
            >
              Inscribir igual (sobre el cupo)
            </BotonSistema>
          )}
        </div>
      )}

      {error && (
        <TextoSistema role="alert" tamaño="sm" className="mt-2 block text-destructive">
          {error}
        </TextoSistema>
      )}
    </TarjetaSistema>
  )
}
