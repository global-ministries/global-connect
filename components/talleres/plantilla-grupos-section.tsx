'use client'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
 * screen's "Grupos (plantilla)" section: list plantilla grupos with
 * nombre, capacidad and their facilitadores; add/edit/deactivate a
 * grupo; add a facilitador through a BOUNDED picker.
 *
 * The picker is the shared FacilitadorPicker (components/talleres/
 * facilitador-picker.tsx), built from the `servidores` prop
 * (talleres_servidores_del_taller, loaded once by the page and shared
 * with the read-only Equipo section) — no free-text search, and never
 * `talleres_buscar_personas` (that RPC stays for Dream Team's own
 * servidor assignment; Decisiones: "talleres_buscar_personas queda para
 * asignar servidores en Dream Team, no para facilitadores"). The DB is
 * the real wall: RLS (editar_taller) plus the BEFORE INSERT trigger
 * requiring an active servidor — this component only surfaces whatever
 * message the agregarFacilitador action already translated (see
 * lib/platform/talleres/errores-api.ts's NO_ES_SERVIDOR_ACTIVO_DEL_TALLER
 * entry), it never re-implements that mapping.
 *
 * Edit controls only render when `puedeEditar` (permisos.editarTaller) —
 * the page decides, this component never re-derives a capability.
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the picker itself
 * moved to components/talleres/facilitador-picker.tsx (FacilitadorPicker)
 * so /talleres/[taller]/[edicion]'s GruposSection can share the exact same
 * bounded picker for its INSTANCIADOS grupos, instead of duplicating it.
 *
 * T10 (design audit) — redesigned to the system pattern: the grupos list
 * is ONE `TarjetaSistema p-0` with `divide-y` (never one card per grupo),
 * each row named + chipped like `NodoFila` (capacidad and "Inactivo" as
 * `BadgeSistema`s, facilitadores as name + role `BadgeSistema` — info for
 * Líder, default for Voluntario); "Agregar grupo" moved into the heading
 * row as an outline `BotonSistema` that opens a `Dialog` (raw inputs
 * always visible was the old shape); every icon-only action carries an
 * `aria-label` naming the item plus a `title`; removing a facilitador now
 * asks for confirmation through the project's `ConfirmationModal`, since
 * unassigning someone is destructive and used to fire on a single click.
 * The picker itself excludes whoever is already in the TARGET grupo via
 * `excluirPersonaIds`, so the same person never shows up twice in one
 * grupo's own picker.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, UserMinus, X } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  EnlaceSistema,
  InputSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmationModal } from '@/components/modals/ConfirmationModal'
import { FacilitadorPicker, type ServidorPickerVM } from '@/components/talleres/facilitador-picker'
import {
  agregarFacilitador,
  crearPlantillaGrupo,
  editarPlantillaGrupo,
  quitarFacilitador,
  toggleActivoPlantillaGrupo,
} from '@/app/(auth)/talleres/[taller]/actions'

export type { ServidorPickerVM }

export interface PlantillaFacilitadorVM {
  readonly id: string
  readonly personaId: string
  readonly rol: string
  readonly nombre: string | null
  readonly apellido: string | null
}

export interface PlantillaGrupoVM {
  readonly id: string
  readonly nombre: string
  readonly capacidad: number
  readonly activo: boolean
  readonly facilitadores: readonly PlantillaFacilitadorVM[]
}

interface Props {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly grupos: readonly PlantillaGrupoVM[]
  readonly servidores: readonly ServidorPickerVM[]
  readonly puedeEditar: boolean
}

const RUTA_SERVIDORES = '/admin/dream-team/servidores'
const ROL_LABELS: Record<string, string> = { lider: 'Líder', voluntario: 'Voluntario' }
const ROL_BADGE_VARIANTE: Record<string, 'info' | 'default'> = { lider: 'info', voluntario: 'default' }
const BOTON_ICONO =
  'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'

function nombreCompleto(nombre: string | null, apellido: string | null): string {
  return [nombre, apellido].filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ') || 'Persona sin nombre'
}

export function PlantillaGruposSection({
  tallerId,
  tallerSlug,
  grupos,
  servidores,
  puedeEditar,
}: Props): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [agregando, setAgregando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCapacidad, setNuevaCapacidad] = useState('')

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [capacidadEditada, setCapacidadEditada] = useState('')

  const [confirmandoQuitar, setConfirmandoQuitar] = useState<{ readonly id: string; readonly nombre: string } | null>(
    null,
  )
  const [quitando, setQuitando] = useState(false)

  function cerrarAgregar(): void {
    setAgregando(false)
    setNuevoNombre('')
    setNuevaCapacidad('')
  }

  function agregarGrupo(): void {
    const nombre = nuevoNombre.trim()
    const capacidad = Number(nuevaCapacidad)
    if (!nombre || !capacidad) return
    setError(null)
    startTransition(async () => {
      const result = await crearPlantillaGrupo({ tallerId, tallerSlug, nombre, capacidad })
      if (result.ok) {
        cerrarAgregar()
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function guardarGrupo(grupoId: string): void {
    setError(null)
    startTransition(async () => {
      const result = await editarPlantillaGrupo({
        tallerSlug,
        grupoId,
        nombre: nombreEditado,
        capacidad: Number(capacidadEditada),
      })
      if (result.ok) {
        setEditandoId(null)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function toggleActivo(grupoId: string, activo: boolean): void {
    setError(null)
    startTransition(async () => {
      const result = await toggleActivoPlantillaGrupo({ tallerSlug, grupoId, activo })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function confirmarQuitar(): void {
    if (!confirmandoQuitar) return
    setError(null)
    setQuitando(true)
    startTransition(async () => {
      const result = await quitarFacilitador({ tallerSlug, facilitadorId: confirmandoQuitar.id })
      setQuitando(false)
      setConfirmandoQuitar(null)
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <section aria-labelledby="grupos-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloSistema nivel={2} id="grupos-heading">
          Grupos
        </TituloSistema>
        {puedeEditar && (
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} onClick={() => setAgregando(true)}>
            Agregar grupo
          </BotonSistema>
        )}
      </div>

      {puedeEditar && servidores.length === 0 && (
        <TextoSistema variante="sutil" className="mt-3 block">
          Sin servidores activos en este equipo.{' '}
          <EnlaceSistema href={RUTA_SERVIDORES} variante="marca">
            Gestionar en Servidores
          </EnlaceSistema>
        </TextoSistema>
      )}

      {error && (
        <TextoSistema role="alert" className="mt-3 block text-destructive">
          {error}
        </TextoSistema>
      )}

      {grupos.length === 0 ? (
        <TextoSistema variante="sutil" className="mt-3 block">
          Este taller todavía no tiene grupos en su plantilla.
        </TextoSistema>
      ) : (
        <TarjetaSistema className="mt-3 p-0">
          <div className="divide-y divide-border">
            {grupos.map((grupo) => (
              <div key={grupo.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {editandoId === grupo.id ? (
                    <div className="flex flex-1 flex-wrap items-end gap-2">
                      <InputSistema
                        label="Nombre"
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        autoFocus
                        className="min-w-[10rem] flex-1"
                      />
                      <InputSistema
                        label="Capacidad"
                        type="number"
                        min={1}
                        value={capacidadEditada}
                        onChange={(e) => setCapacidadEditada(e.target.value)}
                        className="w-28"
                      />
                      <button
                        type="button"
                        aria-label="Guardar grupo"
                        title="Guardar grupo"
                        className={BOTON_ICONO}
                        onClick={() => guardarGrupo(grupo.id)}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar edición del grupo"
                        title="Cancelar"
                        className={BOTON_ICONO}
                        onClick={() => setEditandoId(null)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-medium text-foreground">{grupo.nombre}</span>
                        <BadgeSistema tamaño="sm">Capacidad {grupo.capacidad}</BadgeSistema>
                        {!grupo.activo && (
                          <BadgeSistema variante="warning" tamaño="sm">
                            Inactivo
                          </BadgeSistema>
                        )}
                      </div>
                    </div>
                  )}

                  {puedeEditar && editandoId !== grupo.id && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Editar grupo ${grupo.nombre}`}
                        title="Editar grupo"
                        className={BOTON_ICONO}
                        onClick={() => {
                          setEditandoId(grupo.id)
                          setNombreEditado(grupo.nombre)
                          setCapacidadEditada(String(grupo.capacidad))
                          setError(null)
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <BotonSistema
                        type="button"
                        variante="outline"
                        tamaño="sm"
                        onClick={() => toggleActivo(grupo.id, !grupo.activo)}
                      >
                        {grupo.activo ? 'Desactivar' : 'Activar'}
                      </BotonSistema>
                    </div>
                  )}
                </div>

                <ul className="mt-3 space-y-1.5">
                  {grupo.facilitadores.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <TextoSistema tamaño="sm" className="min-w-0 truncate">
                          {nombreCompleto(f.nombre, f.apellido)}
                        </TextoSistema>
                        <BadgeSistema variante={ROL_BADGE_VARIANTE[f.rol] ?? 'default'} tamaño="sm">
                          {ROL_LABELS[f.rol] ?? f.rol}
                        </BadgeSistema>
                      </div>
                      {puedeEditar && (
                        <button
                          type="button"
                          aria-label={`Quitar a ${nombreCompleto(f.nombre, f.apellido)} del grupo`}
                          title="Quitar del grupo"
                          className={BOTON_ICONO}
                          onClick={() =>
                            setConfirmandoQuitar({ id: f.id, nombre: nombreCompleto(f.nombre, f.apellido) })
                          }
                        >
                          <UserMinus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                  {grupo.facilitadores.length === 0 && (
                    <TextoSistema variante="sutil" tamaño="sm">
                      Sin facilitadores todavía.
                    </TextoSistema>
                  )}
                </ul>

                {puedeEditar && servidores.length > 0 && (
                  <FacilitadorPicker
                    servidores={servidores}
                    excluirPersonaIds={grupo.facilitadores.map((f) => f.personaId)}
                    onAgregar={(personaId, rol) =>
                      agregarFacilitador({ tallerSlug, plantillaGrupoId: grupo.id, personaId, rol })
                    }
                    onAgregado={() => router.refresh()}
                    onError={setError}
                  />
                )}
              </div>
            ))}
          </div>
        </TarjetaSistema>
      )}

      <Dialog open={agregando} onOpenChange={(open) => (open ? setAgregando(true) : cerrarAgregar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar grupo</DialogTitle>
            <DialogDescription>Crea un nuevo grupo en la plantilla del taller.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <InputSistema
              label="Nombre del nuevo grupo"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
            <InputSistema
              label="Capacidad del nuevo grupo"
              type="number"
              min={1}
              value={nuevaCapacidad}
              onChange={(e) => setNuevaCapacidad(e.target.value)}
            />
            {error && (
              <TextoSistema role="alert" className="block text-destructive">
                {error}
              </TextoSistema>
            )}
            <BotonSistema type="button" onClick={agregarGrupo} disabled={!nuevoNombre.trim() || !nuevaCapacidad}>
              Crear grupo
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmandoQuitar !== null}
        onClose={() => setConfirmandoQuitar(null)}
        onConfirm={confirmarQuitar}
        title="Quitar facilitador"
        message={confirmandoQuitar ? `¿Quitar a ${confirmandoQuitar.nombre} de este grupo?` : ''}
        isLoading={quitando}
      />
    </section>
  )
}
