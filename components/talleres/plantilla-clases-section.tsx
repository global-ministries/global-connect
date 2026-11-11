'use client'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
 * screen's "Clases (plantilla)" section: list `Clase {numero} · {tema}`,
 * add (next numero), edit tema in place, deactivate/reactivate, reorder
 * by swapping numero with up/down buttons (no drag library).
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
 * cadencia_dias/duracion_minutos MOVED to the taller page's new
 * "Configuración" section (components/talleres/configuracion-taller.tsx),
 * alongside tipo/vinculo/regimen/cierre de inscripción — this section
 * keeps only the clases list itself, per the task's "keep the section's
 * clases list" instruction.
 *
 * Edit controls (add, edit, toggle, reorder) only render when
 * `puedeEditar` — the page passes permisos.editarTaller, this component
 * never re-derives a capability. A read-only viewer still sees the full
 * plantilla, including inactive clases (so it's clear what's been
 * deactivated), just without any control.
 *
 * T10 (design audit) — redesigned to the system pattern: the clases list
 * is ONE `TarjetaSistema p-0` with `divide-y` (never one card per clase);
 * "Agregar clase" moved into the heading row as an outline `BotonSistema`
 * that opens a `Dialog` (the always-visible raw add form was the old
 * shape); cadencia/duración became `InputSistema`s; every icon-only
 * action carries an `aria-label` naming the clase ("Subir clase 2",
 * "Editar tema de clase 2", …) plus a `title`, at the shared 44px hit
 * target with `hover:bg-accent`.
 *
 * R3k (odd/tasks/talleres-rediseno.md, S1, L10) — compact for the side
 * column (artboard 22): each row is «1 · Sígueme» on one truncated line;
 * «Agregar clase», reorder, edit tema and activar/desactivar live behind the
 * heading's «Editar» toggle (aria-pressed), each on its own line under the
 * name, so nothing overlaps the text. Same actions and writes.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  InputSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  crearPlantillaClase,
  editarPlantillaClaseTema,
  moverPlantillaClase,
  toggleActivoPlantillaClase,
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
  readonly puedeEditar: boolean
}

export function PlantillaClasesSection({
  tallerId,
  tallerSlug,
  clases,
  puedeEditar,
}: Props): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // R3k — the list stays compact; the controls appear only in «Editar» mode.
  const [editando, setEditando] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [nuevoTema, setNuevoTema] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [temaEditado, setTemaEditado] = useState('')

  const ordenadas = [...clases].sort((a, b) => a.numero - b.numero)

  function cerrarAgregar(): void {
    setAgregando(false)
    setNuevoTema('')
  }

  function agregar(): void {
    if (!nuevoTema.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await crearPlantillaClase({ tallerId, tallerSlug, tema: nuevoTema })
      if (result.ok) {
        cerrarAgregar()
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

  return (
    <section aria-labelledby="clases-heading">
      {/* «Editar» stays on the title line: the side column is narrow. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TituloSistema nivel={2} id="clases-heading">
            Plantilla de clases
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            Nombre y orden de las clases de cada edición.
          </TextoSistema>
        </div>
        {puedeEditar && (
          <BotonSistema
            type="button"
            variante={editando ? 'outline' : 'ghost'}
            tamaño="sm"
            icono={Pencil}
            aria-pressed={editando}
            aria-label="Editar plantilla de clases"
            onClick={() => {
              setEditando(!editando)
              setEditandoId(null)
            }}
          >
            Editar
          </BotonSistema>
        )}
      </div>

      {error && (
        <TextoSistema role="alert" className="mt-3 block text-destructive">
          {error}
        </TextoSistema>
      )}

      {ordenadas.length === 0 && !editando ? (
        <TextoSistema variante="sutil" className="mt-3 block">
          Este taller todavía no tiene clases en su plantilla.
        </TextoSistema>
      ) : (
        <TarjetaSistema className="mt-3 overflow-hidden p-0">
          <ol className="divide-y divide-border/60">
            {ordenadas.map((clase, index) => (
              <li key={clase.id} className="grid min-w-0 gap-1 px-4 py-2.5">
                {editandoId === clase.id ? (
                  <div className="flex min-w-0 items-center gap-1">
                    <InputSistema
                      value={temaEditado}
                      onChange={(e) => setTemaEditado(e.target.value)}
                      aria-label={`Tema de la clase ${clase.numero}`}
                      className="min-w-0 flex-1"
                      autoFocus
                    />
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      soloIcono
                      icono={Check}
                      aria-label={`Guardar tema de clase ${clase.numero}`}
                      title="Guardar tema"
                      onClick={() => guardarTema(clase.id)}
                    />
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      soloIcono
                      icono={X}
                      aria-label={`Cancelar edición de clase ${clase.numero}`}
                      title="Cancelar"
                      onClick={() => setEditandoId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-6 min-w-0 items-center gap-2">
                    <span
                      className={
                        clase.activo
                          ? 'min-w-0 flex-1 truncate text-sm text-foreground'
                          : 'min-w-0 flex-1 truncate text-sm text-muted-foreground line-through'
                      }
                      title={`${clase.numero} · ${clase.tema}`}
                    >
                      <span className="font-mono tabular-nums text-muted-foreground">{clase.numero}</span> · {clase.tema}
                    </span>
                    {!clase.activo && (
                      <BadgeSistema variante="warning" tamaño="sm" className="shrink-0">
                        Inactiva
                      </BadgeSistema>
                    )}
                  </div>
                )}

                {editando && editandoId !== clase.id && (
                  // Edit mode: the controls take their own line, so they never cover the name.
                  <div className="-mr-2 flex items-center justify-end gap-0.5">
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      tamaño="sm"
                      soloIcono
                      icono={ArrowUp}
                      aria-label={`Subir clase ${clase.numero}`}
                      title="Subir"
                      disabled={index === 0}
                      onClick={() => mover(clase.id, 'subir')}
                    />
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      tamaño="sm"
                      soloIcono
                      icono={ArrowDown}
                      aria-label={`Bajar clase ${clase.numero}`}
                      title="Bajar"
                      disabled={index === ordenadas.length - 1}
                      onClick={() => mover(clase.id, 'bajar')}
                    />
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      tamaño="sm"
                      soloIcono
                      icono={Pencil}
                      aria-label={`Editar tema de clase ${clase.numero}`}
                      title="Editar tema"
                      onClick={() => {
                        setEditandoId(clase.id)
                        setTemaEditado(clase.tema)
                        setError(null)
                      }}
                    />
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      tamaño="sm"
                      onClick={() => toggleActivo(clase.id, !clase.activo)}
                    >
                      {clase.activo ? 'Desactivar' : 'Activar'}
                    </BotonSistema>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {editando && (
            <div className={ordenadas.length > 0 ? 'border-t border-border/60 px-2 py-1' : 'px-2 py-1'}>
              <BotonSistema type="button" variante="ghost" tamaño="sm" icono={Plus} onClick={() => setAgregando(true)}>
                Agregar clase
              </BotonSistema>
            </div>
          )}
        </TarjetaSistema>
      )}

      <Dialog open={agregando} onOpenChange={(open) => (open ? setAgregando(true) : cerrarAgregar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar clase</DialogTitle>
            <DialogDescription>Crea una nueva clase al final de la plantilla del taller.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <InputSistema
              label="Tema de la nueva clase"
              value={nuevoTema}
              onChange={(e) => setNuevoTema(e.target.value)}
              placeholder="Ej. Sígueme"
            />
            {error && (
              <TextoSistema role="alert" className="block text-destructive">
                {error}
              </TextoSistema>
            )}
            <BotonSistema type="button" onClick={agregar} disabled={!nuevoTema.trim()}>
              Crear clase
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
