'use client'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
 * screen's "Grupos (plantilla)" section: list plantilla grupos with
 * nombre, capacidad and their facilitadores; add/edit/deactivate a
 * grupo; add a facilitador through a BOUNDED picker.
 *
 * The picker is a plain <select> built from the `servidores` prop
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
 */

import { useState, useTransition, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, UserMinus, X } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
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
const BOTON_ICONO = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground'

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

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCapacidad, setNuevaCapacidad] = useState('')

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [capacidadEditada, setCapacidadEditada] = useState('')

  function agregarGrupo(): void {
    const nombre = nuevoNombre.trim()
    const capacidad = Number(nuevaCapacidad)
    if (!nombre || !capacidad) return
    setError(null)
    startTransition(async () => {
      const result = await crearPlantillaGrupo({ tallerId, tallerSlug, nombre, capacidad })
      if (result.ok) {
        setNuevoNombre('')
        setNuevaCapacidad('')
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

  function quitar(facilitadorId: string): void {
    setError(null)
    startTransition(async () => {
      const result = await quitarFacilitador({ tallerSlug, facilitadorId })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <section aria-labelledby="grupos-heading">
      <h2 id="grupos-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
        Grupos
      </h2>

      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[10rem]">
            <span className="mb-1 block text-sm font-medium">Nombre del nuevo grupo</span>
            <input
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              aria-label="Nombre del nuevo grupo"
              className="min-h-[44px] w-full rounded-lg border border-border bg-card/50 px-3 py-2"
            />
          </label>
          <label className="block w-32">
            <span className="mb-1 block text-sm font-medium">Capacidad del nuevo grupo</span>
            <input
              type="number"
              min={1}
              value={nuevaCapacidad}
              onChange={(e) => setNuevaCapacidad(e.target.value)}
              aria-label="Capacidad del nuevo grupo"
              className="min-h-[44px] w-full rounded-lg border border-border bg-card/50 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={agregarGrupo}
            disabled={!nuevoNombre.trim() || !nuevaCapacidad}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-[var(--brand-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar grupo
          </button>
        </div>
      )}

      {puedeEditar && servidores.length === 0 && (
        <TextoSistema variante="sutil" className="mt-3 block">
          Sin servidores activos en este equipo.{' '}
          <Link href={RUTA_SERVIDORES} className="font-medium text-[var(--brand-primary)] hover:underline">
            Gestionar en Servidores
          </Link>
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
        <ul className="mt-3 grid gap-3">
          {grupos.map((grupo) => (
            <li key={grupo.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {editandoId === grupo.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        className="min-h-[44px] rounded-lg border border-border bg-card/50 px-3 py-2"
                        autoFocus
                      />
                      <input
                        type="number"
                        min={1}
                        value={capacidadEditada}
                        onChange={(e) => setCapacidadEditada(e.target.value)}
                        className="min-h-[44px] w-24 rounded-lg border border-border bg-card/50 px-3 py-2"
                      />
                      <button
                        type="button"
                        aria-label="Guardar grupo"
                        className={BOTON_ICONO}
                        onClick={() => guardarGrupo(grupo.id)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar edición del grupo"
                        className={BOTON_ICONO}
                        onClick={() => setEditandoId(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <TextoSistema className={grupo.activo ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                        {grupo.nombre}
                        {!grupo.activo && <span className="ml-2 text-xs no-underline">(inactivo)</span>}
                      </TextoSistema>
                      <TextoSistema variante="sutil" tamaño="sm">
                        Capacidad {grupo.capacidad}
                      </TextoSistema>
                    </div>
                  )}

                  {puedeEditar && editandoId !== grupo.id && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Editar grupo"
                        className={BOTON_ICONO}
                        onClick={() => {
                          setEditandoId(grupo.id)
                          setNombreEditado(grupo.nombre)
                          setCapacidadEditada(String(grupo.capacidad))
                          setError(null)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] rounded-lg border border-border px-3 text-sm hover:bg-muted"
                        onClick={() => toggleActivo(grupo.id, !grupo.activo)}
                      >
                        {grupo.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  )}
                </div>

                <ul className="mt-3 grid gap-1">
                  {grupo.facilitadores.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <TextoSistema tamaño="sm">
                        {nombreCompleto(f.nombre, f.apellido)} · {ROL_LABELS[f.rol] ?? f.rol}
                      </TextoSistema>
                      {puedeEditar && (
                        <button
                          type="button"
                          aria-label={`Quitar a ${nombreCompleto(f.nombre, f.apellido)}`}
                          className={BOTON_ICONO}
                          onClick={() => quitar(f.id)}
                        >
                          <UserMinus className="h-4 w-4" />
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
                    onAgregar={(personaId, rol) =>
                      agregarFacilitador({ tallerSlug, plantillaGrupoId: grupo.id, personaId, rol })
                    }
                    onAgregado={() => router.refresh()}
                    onError={setError}
                  />
                )}
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
