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

const BOTON_ICONO =
  'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'

export function PlantillaClasesSection({
  tallerId,
  tallerSlug,
  clases,
  puedeEditar,
}: Props): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <TituloSistema nivel={2} id="clases-heading">
            Plantilla de clases
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            Nombre y orden de las clases de cada edición.
          </TextoSistema>
        </div>
        {puedeEditar && (
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} onClick={() => setAgregando(true)}>
            Agregar clase
          </BotonSistema>
        )}
      </div>

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
        <TarjetaSistema className="mt-3 p-0">
          <div className="divide-y divide-border">
            {ordenadas.map((clase, index) => (
              <div key={clase.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  {editandoId === clase.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <InputSistema
                        value={temaEditado}
                        onChange={(e) => setTemaEditado(e.target.value)}
                        aria-label={`Tema de la clase ${clase.numero}`}
                        className="min-w-[10rem] flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        aria-label={`Guardar tema de clase ${clase.numero}`}
                        title="Guardar tema"
                        className={BOTON_ICONO}
                        onClick={() => guardarTema(clase.id)}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancelar edición de clase ${clase.numero}`}
                        title="Cancelar"
                        className={BOTON_ICONO}
                        onClick={() => setEditandoId(null)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <TextoSistema className={clase.activo ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                        Clase {clase.numero} · {clase.tema}
                      </TextoSistema>
                      {!clase.activo && (
                        <BadgeSistema variante="warning" tamaño="sm">
                          Inactiva
                        </BadgeSistema>
                      )}
                    </div>
                  )}
                </div>

                {puedeEditar && editandoId !== clase.id && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Subir clase ${clase.numero}`}
                      title="Subir"
                      className={BOTON_ICONO}
                      disabled={index === 0}
                      onClick={() => mover(clase.id, 'subir')}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Bajar clase ${clase.numero}`}
                      title="Bajar"
                      className={BOTON_ICONO}
                      disabled={index === ordenadas.length - 1}
                      onClick={() => mover(clase.id, 'bajar')}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar tema de clase ${clase.numero}`}
                      title="Editar tema"
                      className={BOTON_ICONO}
                      onClick={() => {
                        setEditandoId(clase.id)
                        setTemaEditado(clase.tema)
                        setError(null)
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <BotonSistema
                      type="button"
                      variante="outline"
                      tamaño="sm"
                      onClick={() => toggleActivo(clase.id, !clase.activo)}
                    >
                      {clase.activo ? 'Desactivar' : 'Activar'}
                    </BotonSistema>
                  </div>
                )}
              </div>
            ))}
          </div>
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
