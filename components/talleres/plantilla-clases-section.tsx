'use client'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
 * screen's "Clases (plantilla)" section: list `Clase {numero} · {tema}`,
 * add (next numero), edit tema in place, deactivate/reactivate, reorder
 * by swapping numero with up/down buttons (no drag library), plus
 * cadencia_dias/duracion_minutos as two editable fields.
 *
 * Edit controls (add, edit, toggle, reorder, cadencia/duracion) only
 * render when `puedeEditar` — the page passes permisos.editarTaller, this
 * component never re-derives a capability. A read-only viewer still sees
 * the full plantilla, including inactive clases (so it's clear what's
 * been deactivated), just without any control.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import {
  crearPlantillaClase,
  editarPlantillaClaseTema,
  moverPlantillaClase,
  toggleActivoPlantillaClase,
  updateCadenciaYDuracion,
} from '@/app/(auth)/talleres/[taller]/actions'

export interface PlantillaClaseVM {
  readonly id: string
  readonly numero: number
  readonly tema: string
  readonly activo: boolean
}

interface Props {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly clases: readonly PlantillaClaseVM[]
  readonly cadenciaDias: number
  readonly duracionMinutos: number | null
  readonly puedeEditar: boolean
}

const BOTON_ICONO = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'

export function PlantillaClasesSection({
  tallerId,
  tallerSlug,
  clases,
  cadenciaDias,
  duracionMinutos,
  puedeEditar,
}: Props): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [nuevoTema, setNuevoTema] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [temaEditado, setTemaEditado] = useState('')

  const [cadencia, setCadencia] = useState(String(cadenciaDias))
  const [duracion, setDuracion] = useState(duracionMinutos !== null ? String(duracionMinutos) : '')

  const ordenadas = [...clases].sort((a, b) => a.numero - b.numero)

  function agregar(): void {
    if (!nuevoTema.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await crearPlantillaClase({ tallerId, tallerSlug, tema: nuevoTema })
      if (result.ok) {
        setNuevoTema('')
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function guardarTema(claseId: string): void {
    setError(null)
    startTransition(async () => {
      const result = await editarPlantillaClaseTema({ tallerSlug, claseId, tema: temaEditado })
      if (result.ok) {
        setEditandoId(null)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function toggleActivo(claseId: string, activo: boolean): void {
    setError(null)
    startTransition(async () => {
      const result = await toggleActivoPlantillaClase({ tallerSlug, claseId, activo })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function mover(claseId: string, direccion: 'subir' | 'bajar'): void {
    setError(null)
    startTransition(async () => {
      const result = await moverPlantillaClase({ tallerId, tallerSlug, claseId, direccion })
      if (result.ok) {
        router.refresh()
      } else if (result.error !== 'no-op') {
        setError(result.message)
      }
    })
  }

  function guardarCadencia(): void {
    setError(null)
    const cadenciaNum = Number(cadencia)
    const duracionNum = duracion.trim() === '' ? null : Number(duracion)
    startTransition(async () => {
      const result = await updateCadenciaYDuracion({
        tallerId,
        tallerSlug,
        cadenciaDias: cadenciaNum,
        duracionMinutos: duracionNum,
      })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <section aria-labelledby="clases-heading">
      <h2 id="clases-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
        Clases
      </h2>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {puedeEditar ? (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Cada N días</span>
              <input
                type="number"
                min={1}
                value={cadencia}
                onChange={(e) => setCadencia(e.target.value)}
                aria-label="Cada N días"
                className="min-h-[44px] w-28 rounded-lg border border-border bg-card/50 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Duración (min)</span>
              <input
                type="number"
                min={1}
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                aria-label="Duración (min)"
                className="min-h-[44px] w-28 rounded-lg border border-border bg-card/50 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={guardarCadencia}
              className="min-h-[44px] rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              Guardar cadencia
            </button>
          </>
        ) : (
          <TextoSistema variante="sutil" tamaño="sm">
            Cada {cadenciaDias} días{duracionMinutos !== null ? ` · Duración ${duracionMinutos} min` : ''}
          </TextoSistema>
        )}
      </div>

      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[12rem]">
            <span className="mb-1 block text-sm font-medium">Tema de la nueva clase</span>
            <input
              value={nuevoTema}
              onChange={(e) => setNuevoTema(e.target.value)}
              aria-label="Tema de la nueva clase"
              placeholder="Ej. Sígueme"
              className="min-h-[44px] w-full rounded-lg border border-border bg-card/50 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={agregar}
            disabled={!nuevoTema.trim()}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-[var(--brand-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar clase
          </button>
        </div>
      )}

      {error && (
        <TextoSistema role="alert" className="mt-3 block text-destructive">
          {error}
        </TextoSistema>
      )}

      {ordenadas.length === 0 ? (
        <TextoSistema variante="sutil" className="mt-3 block">
          Este taller todavía no tiene clases en su plantilla.
        </TextoSistema>
      ) : (
        <ul className="mt-3 grid gap-2">
          {ordenadas.map((clase, index) => (
            <li key={clase.id}>
              <TarjetaSistema variante="outlined" className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  {editandoId === clase.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={temaEditado}
                        onChange={(e) => setTemaEditado(e.target.value)}
                        className="min-h-[44px] flex-1 min-w-[10rem] rounded-lg border border-border bg-card/50 px-3 py-2"
                        autoFocus
                      />
                      <button
                        type="button"
                        aria-label="Guardar tema"
                        className={BOTON_ICONO}
                        onClick={() => guardarTema(clase.id)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar edición del tema"
                        className={BOTON_ICONO}
                        onClick={() => setEditandoId(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <TextoSistema className={clase.activo ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                      Clase {clase.numero} · {clase.tema}
                      {!clase.activo && <span className="ml-2 text-xs no-underline">(inactiva)</span>}
                    </TextoSistema>
                  )}
                </div>

                {puedeEditar && editandoId !== clase.id && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Subir"
                      className={BOTON_ICONO}
                      disabled={index === 0}
                      onClick={() => mover(clase.id, 'subir')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Bajar"
                      className={BOTON_ICONO}
                      disabled={index === ordenadas.length - 1}
                      onClick={() => mover(clase.id, 'bajar')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Editar tema"
                      className={BOTON_ICONO}
                      onClick={() => {
                        setEditandoId(clase.id)
                        setTemaEditado(clase.tema)
                        setError(null)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-lg border border-border px-3 text-sm hover:bg-muted"
                      onClick={() => toggleActivo(clase.id, !clase.activo)}
                    >
                      {clase.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                )}
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
