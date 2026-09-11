'use client'

/**
 * Dream Team — client island for /admin/dream-team/estructura.
 *
 * Renders the pre-built org tree (see ../../../../../lib/platform/dream-team/arbol.ts)
 * and, when `puedeEditar` is true, wires the six server actions from
 * ./actions.ts to per-node inline controls. Errors from a failed action are
 * shown next to the control that triggered it — never via `alert()`.
 */

import { useState, useTransition, type FormEvent, type ReactElement } from 'react'

import {
  TarjetaSistema,
  TituloSistema,
  TextoSistema,
  BadgeSistema,
  BotonSistema,
  InputSistema,
} from '@/components/ui/sistema-diseno'
import { EmptyState } from '@/components/talleres/dashboard-page'

import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

import {
  crearEquipo,
  renombrarEquipo,
  cambiarActivoEquipo,
  crearRol,
  renombrarRol,
  cambiarActivoRol,
  type RolActionResult,
} from './actions'

export interface EstructuraClientProps {
  readonly arbol: readonly NodoArbol[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
}

// Indentation is capped so a deep branch never pushes content off-screen at
// phone width (~400px): each level nudges the card, it never compounds into
// a horizontal-scroll layout.
const INDENTACION_PX_POR_NIVEL = 14
const INDENTACION_PX_MAXIMA = 70

function mensajeParaError(codigo: string): string {
  switch (codigo) {
    case 'forbidden':
      return 'No tenés permiso para esta acción.'
    case 'not-found':
      return 'No se encontró el elemento (puede haber sido modificado por otra persona).'
    case 'unauthorized':
      return 'Tu sesión expiró. Iniciá sesión nuevamente.'
    case 'invalid-input':
      return 'Los datos ingresados no son válidos.'
    default:
      return 'Ocurrió un error inesperado. Probá de nuevo.'
  }
}

export function EstructuraClient({ arbol, rolesPorEquipo, puedeEditar }: EstructuraClientProps): ReactElement {
  if (arbol.length === 0) {
    return (
      <EmptyState message="No se encontraron equipos. Puede que la estructura esté vacía, o que tu sesión no tenga acceso de lectura sobre ningún nodo del árbol." />
    )
  }

  return (
    <div className="grid gap-3">
      {arbol.map((nodo) => (
        <NodoEquipoView key={nodo.equipo.id} nodo={nodo} rolesPorEquipo={rolesPorEquipo} puedeEditar={puedeEditar} />
      ))}
    </div>
  )
}

interface NodoEquipoViewProps {
  readonly nodo: NodoArbol
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
}

function NodoEquipoView({ nodo, rolesPorEquipo, puedeEditar }: NodoEquipoViewProps): ReactElement {
  const { equipo, hijos, nivel } = nodo
  const roles = rolesPorEquipo[equipo.id] ?? []

  const [isPending, startTransition] = useTransition()
  const [editandoLabel, setEditandoLabel] = useState(false)
  const [nuevoLabel, setNuevoLabel] = useState(equipo.label)
  const [mostrarFormSubEquipo, setMostrarFormSubEquipo] = useState(false)
  const [labelSubEquipo, setLabelSubEquipo] = useState('')
  const [mostrarFormRol, setMostrarFormRol] = useState(false)
  const [labelRol, setLabelRol] = useState('')
  const [error, setError] = useState<string | null>(null)

  const indentacion = Math.min(nivel * INDENTACION_PX_POR_NIVEL, INDENTACION_PX_MAXIMA)

  function handleRenombrar(): void {
    const label = nuevoLabel.trim()
    if (!label) return
    setError(null)
    startTransition(async () => {
      const result = await renombrarEquipo({ id: equipo.id, label })
      if (!result.ok) {
        setError(result.message ?? mensajeParaError(result.error))
        return
      }
      setEditandoLabel(false)
    })
  }

  function handleToggleActivo(): void {
    setError(null)
    startTransition(async () => {
      const result = await cambiarActivoEquipo({ id: equipo.id, activo: !equipo.activo })
      if (!result.ok) {
        setError(result.message ?? mensajeParaError(result.error))
      }
    })
  }

  function handleCrearSubEquipo(event: FormEvent): void {
    event.preventDefault()
    const label = labelSubEquipo.trim()
    if (!label) return
    setError(null)
    startTransition(async () => {
      const result = await crearEquipo({ parentEquipoId: equipo.id, label })
      if (!result.ok) {
        setError(result.message ?? mensajeParaError(result.error))
        return
      }
      setLabelSubEquipo('')
      setMostrarFormSubEquipo(false)
    })
  }

  function handleCrearRol(event: FormEvent): void {
    event.preventDefault()
    const label = labelRol.trim()
    if (!label) return
    setError(null)
    startTransition(async () => {
      const result = await crearRol({ equipoId: equipo.id, label })
      if (!result.ok) {
        setError(result.message ?? mensajeParaError(result.error))
        return
      }
      setLabelRol('')
      setMostrarFormRol(false)
    })
  }

  return (
    <div style={{ marginLeft: indentacion }} className="min-w-0">
      <TarjetaSistema
        variante="outlined"
        className={`p-3 sm:p-4 ${equipo.activo ? '' : 'opacity-60'}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {editandoLabel ? (
            <form
              className="flex flex-1 flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                handleRenombrar()
              }}
            >
              <InputSistema
                aria-label={`Nuevo nombre para ${equipo.label}`}
                value={nuevoLabel}
                onChange={(event) => setNuevoLabel(event.target.value)}
                disabled={isPending}
                className="min-w-0 flex-1"
              />
              <BotonSistema type="submit" tamaño="sm" disabled={isPending}>
                Guardar
              </BotonSistema>
              <BotonSistema
                type="button"
                variante="ghost"
                tamaño="sm"
                disabled={isPending}
                onClick={() => {
                  setNuevoLabel(equipo.label)
                  setEditandoLabel(false)
                }}
              >
                Cancelar
              </BotonSistema>
            </form>
          ) : (
            <TituloSistema nivel={4} className="min-w-0 break-words">
              {equipo.label}
            </TituloSistema>
          )}
          <BadgeSistema variante="info" tamaño="sm">
            {equipo.experiencia}
          </BadgeSistema>
          {!equipo.activo && (
            <BadgeSistema variante="warning" tamaño="sm">
              Inactiva
            </BadgeSistema>
          )}
        </div>

        {roles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((rol) => (
              <RolBadge key={rol.id} rol={rol} puedeEditar={puedeEditar} onError={setError} />
            ))}
          </div>
        )}

        {puedeEditar && !editandoLabel && (
          <div className="mt-3 flex flex-wrap gap-2">
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              disabled={isPending}
              onClick={() => setEditandoLabel(true)}
              aria-label={`Renombrar equipo ${equipo.label}`}
            >
              Renombrar
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              disabled={isPending}
              onClick={handleToggleActivo}
              aria-label={`${equipo.activo ? 'Desactivar' : 'Activar'} equipo ${equipo.label}`}
            >
              {equipo.activo ? 'Desactivar' : 'Activar'}
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              disabled={isPending}
              onClick={() => setMostrarFormSubEquipo((v) => !v)}
              aria-label={`Agregar sub-equipo a ${equipo.label}`}
            >
              Agregar sub-equipo
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              disabled={isPending}
              onClick={() => setMostrarFormRol((v) => !v)}
              aria-label={`Agregar rol a ${equipo.label}`}
            >
              Agregar rol
            </BotonSistema>
          </div>
        )}

        {mostrarFormSubEquipo && (
          <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={handleCrearSubEquipo}>
            <InputSistema
              aria-label={`Nombre del nuevo sub-equipo de ${equipo.label}`}
              value={labelSubEquipo}
              onChange={(event) => setLabelSubEquipo(event.target.value)}
              disabled={isPending}
              className="min-w-0 flex-1"
              placeholder="Nombre del sub-equipo"
            />
            <BotonSistema type="submit" tamaño="sm" disabled={isPending}>
              Crear
            </BotonSistema>
          </form>
        )}

        {mostrarFormRol && (
          <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={handleCrearRol}>
            <InputSistema
              aria-label={`Nombre del nuevo rol de ${equipo.label}`}
              value={labelRol}
              onChange={(event) => setLabelRol(event.target.value)}
              disabled={isPending}
              className="min-w-0 flex-1"
              placeholder="Nombre del rol"
            />
            <BotonSistema type="submit" tamaño="sm" disabled={isPending}>
              Crear
            </BotonSistema>
          </form>
        )}

        {error && (
          <TextoSistema role="alert" tamaño="sm" className="mt-2 text-red-500 dark:text-red-400">
            {error}
          </TextoSistema>
        )}
      </TarjetaSistema>

      {hijos.length > 0 && (
        <div className="mt-3 grid gap-3">
          {hijos.map((hijo) => (
            <NodoEquipoView key={hijo.equipo.id} nodo={hijo} rolesPorEquipo={rolesPorEquipo} puedeEditar={puedeEditar} />
          ))}
        </div>
      )}
    </div>
  )
}

interface RolBadgeProps {
  readonly rol: DreamTeamRol
  readonly puedeEditar: boolean
  readonly onError: (message: string) => void
}

function RolBadge({ rol, puedeEditar, onError }: RolBadgeProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [nuevoLabel, setNuevoLabel] = useState(rol.label)

  function reportar(result: RolActionResult): void {
    if (!result.ok) {
      onError(result.message ?? mensajeParaError(result.error))
    }
  }

  function handleRenombrar(): void {
    const label = nuevoLabel.trim()
    if (!label) return
    startTransition(async () => {
      const result = await renombrarRol({ id: rol.id, label })
      reportar(result)
      if (result.ok) setEditando(false)
    })
  }

  function handleToggleActivo(): void {
    startTransition(async () => {
      const result = await cambiarActivoRol({ id: rol.id, activo: !rol.activo })
      reportar(result)
    })
  }

  if (editando) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          handleRenombrar()
        }}
      >
        <InputSistema
          aria-label={`Nuevo nombre para el rol ${rol.label}`}
          value={nuevoLabel}
          onChange={(event) => setNuevoLabel(event.target.value)}
          disabled={isPending}
        />
        <BotonSistema type="submit" tamaño="sm" disabled={isPending}>
          Guardar
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          disabled={isPending}
          onClick={() => {
            setNuevoLabel(rol.label)
            setEditando(false)
          }}
        >
          Cancelar
        </BotonSistema>
      </form>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <BadgeSistema variante={rol.activo ? 'default' : 'warning'} tamaño="sm">
        {rol.label}
        {!rol.activo && ' (inactivo)'}
      </BadgeSistema>
      {puedeEditar && (
        <>
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            disabled={isPending}
            onClick={() => setEditando(true)}
            aria-label={`Renombrar rol ${rol.label}`}
          >
            ✎
          </BotonSistema>
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            disabled={isPending}
            onClick={handleToggleActivo}
            aria-label={`${rol.activo ? 'Desactivar' : 'Activar'} rol ${rol.label}`}
          >
            {rol.activo ? '⏸' : '▶'}
          </BotonSistema>
        </>
      )}
    </span>
  )
}
