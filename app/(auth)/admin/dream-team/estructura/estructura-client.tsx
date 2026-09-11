'use client'

/**
 * Dream Team — client island for /admin/dream-team/estructura.
 *
 * Renders the pre-built org tree (see ../../../../../lib/platform/dream-team/arbol.ts)
 * as ONE `TarjetaSistema` containing every row — never a tree of nested
 * cards. Each row is the shared `<NodoFila>` (see
 * components/dream-team/nodo-fila.tsx), collapsible with a chevron (a plain
 * `useState` set of collapsed ids, same pattern as
 * GruposList.client.tsx:143 — everything starts expanded). When
 * `puedeEditar` is true, exactly two icon actions sit on the right of every
 * row (Editar equipo, Agregar sub-equipo a), each opening a `Dialog`
 * instead of always-on inline forms. Every action's success or failure goes
 * through `useNotificaciones()` (see docs/sistema-diseno.md's "Notificaciones"
 * section) — never `alert()`. Nothing here submits an invalid form (every
 * submit button is disabled until its input is non-empty), so there is no
 * separate inline field-validation error to show.
 */

import { useMemo, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { FolderPlus, FolderTree, Pencil } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  ContenedorDashboard,
  InputSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmationModal } from '@/components/modals/ConfirmationModal'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { NodoFila } from '@/components/dream-team/nodo-fila'
import { rolBadgeVariante, rolLabel } from '@/components/dream-team/labels'

import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamEquipo, DreamTeamRol } from '@/lib/platform/dream-team/types'

import {
  crearEquipo,
  renombrarEquipo,
  cambiarActivoEquipo,
  crearRol,
  renombrarRol,
  cambiarActivoRol,
  type EquipoActionResult,
  type RolActionResult,
} from './actions'

export interface EstructuraClientProps {
  readonly arbol: readonly NodoArbol[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly puedeEditar: boolean
}

type Toast = ReturnType<typeof useNotificaciones>

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

function iconButtonClass(): string {
  return 'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'
}

export function EstructuraClient({ arbol, rolesPorEquipo, puedeEditar }: EstructuraClientProps): ReactElement {
  const toast = useNotificaciones()
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(new Set())
  const [editandoEquipoId, setEditandoEquipoId] = useState<string | null>(null)
  const [subequipoDeId, setSubequipoDeId] = useState<string | null>(null)

  const nodosPorId = useMemo(() => {
    const mapa = new Map<string, NodoArbol>()
    function visitar(nodo: NodoArbol): void {
      mapa.set(nodo.equipo.id, nodo)
      nodo.hijos.forEach(visitar)
    }
    arbol.forEach(visitar)
    return mapa
  }, [arbol])

  function toggleColapsado(id: string): void {
    setColapsados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (arbol.length === 0) {
    return (
      <ContenedorDashboard titulo="Estructura">
        <EstadoVacio
          icono={FolderTree}
          titulo="No se encontraron equipos"
          subtitulo="Puede que la estructura esté vacía, o que tu sesión no tenga acceso de lectura sobre ningún nodo del árbol."
        />
      </ContenedorDashboard>
    )
  }

  function renderFilas(nodos: readonly NodoArbol[]): ReactElement[] {
    return nodos.flatMap((nodo) => {
      const { equipo, hijos, nivel } = nodo
      const roles = rolesPorEquipo[equipo.id] ?? []
      const expandido = !colapsados.has(equipo.id)

      const fila = (
        <NodoFila
          key={equipo.id}
          equipo={equipo}
          roles={roles}
          nivel={nivel}
          tieneHijos={hijos.length > 0}
          expandido={expandido}
          onToggleExpandido={() => toggleColapsado(equipo.id)}
          accesorio={
            puedeEditar ? (
              <>
                <button
                  type="button"
                  aria-label={`Editar equipo ${equipo.label}`}
                  title="Editar equipo"
                  onClick={() => setEditandoEquipoId(equipo.id)}
                  className={iconButtonClass()}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Agregar sub-equipo a ${equipo.label}`}
                  title="Agregar sub-equipo"
                  onClick={() => setSubequipoDeId(equipo.id)}
                  className={iconButtonClass()}
                >
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : undefined
          }
        />
      )

      return expandido ? [fila, ...renderFilas(hijos)] : [fila]
    })
  }

  const nodoEnEdicion = editandoEquipoId ? nodosPorId.get(editandoEquipoId) : undefined
  const nodoParaSubequipo = subequipoDeId ? nodosPorId.get(subequipoDeId) : undefined

  return (
    <ContenedorDashboard titulo="Estructura">
      <TarjetaSistema className="p-0">
        <div className="divide-y divide-border px-3 sm:px-4">{renderFilas(arbol)}</div>
      </TarjetaSistema>

      {nodoEnEdicion && (
        <EditarEquipoDialog
          equipo={nodoEnEdicion.equipo}
          roles={rolesPorEquipo[nodoEnEdicion.equipo.id] ?? []}
          onClose={() => setEditandoEquipoId(null)}
          toast={toast}
        />
      )}

      {nodoParaSubequipo && (
        <AgregarSubequipoDialog equipoPadre={nodoParaSubequipo.equipo} onClose={() => setSubequipoDeId(null)} toast={toast} />
      )}
    </ContenedorDashboard>
  )
}

// ── Editar equipo (renombrar, activar/desactivar, gestionar roles) ───────

interface EditarEquipoDialogProps {
  readonly equipo: DreamTeamEquipo
  readonly roles: readonly DreamTeamRol[]
  readonly onClose: () => void
  readonly toast: Toast
}

function EditarEquipoDialog({ equipo, roles, onClose, toast }: EditarEquipoDialogProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState(equipo.label)
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false)
  const [nuevoRolLabel, setNuevoRolLabel] = useState('')

  function reportar(result: EquipoActionResult, exito: string): void {
    if (!result.ok) {
      toast.error(result.message ?? mensajeParaError(result.error))
      return
    }
    toast.success(exito)
  }

  function guardarNombre(event: FormEvent): void {
    event.preventDefault()
    const label = nombre.trim()
    if (!label || label === equipo.label) return
    startTransition(async () => {
      reportar(await renombrarEquipo({ id: equipo.id, label }), 'Equipo renombrado correctamente.')
    })
  }

  function activar(): void {
    startTransition(async () => {
      reportar(await cambiarActivoEquipo({ id: equipo.id, activo: true }), 'Equipo activado.')
    })
  }

  function confirmarDesactivar(): void {
    startTransition(async () => {
      const result = await cambiarActivoEquipo({ id: equipo.id, activo: false })
      setConfirmandoDesactivar(false)
      reportar(result, 'Equipo desactivado.')
    })
  }

  function agregarRol(event: FormEvent): void {
    event.preventDefault()
    const label = nuevoRolLabel.trim()
    if (!label) return
    startTransition(async () => {
      const result = await crearRol({ equipoId: equipo.id, label })
      if (!result.ok) {
        toast.error(result.message ?? mensajeParaError(result.error))
        return
      }
      setNuevoRolLabel('')
      toast.success('Rol agregado correctamente.')
    })
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar equipo</DialogTitle>
            <DialogDescription>Renombrá el equipo, activalo o desactivalo, y gestioná sus roles.</DialogDescription>
          </DialogHeader>

          <form onSubmit={guardarNombre} className="flex items-end gap-2">
            <InputSistema
              label="Nombre del equipo"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              disabled={isPending}
              className="flex-1"
            />
            <BotonSistema
              type="submit"
              tamaño="sm"
              disabled={isPending || !nombre.trim() || nombre.trim() === equipo.label}
            >
              Guardar
            </BotonSistema>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
            <TextoSistema tamaño="sm">
              Estado: <span className="font-medium text-foreground">{equipo.activo ? 'Activo' : 'Inactivo'}</span>
            </TextoSistema>
            {equipo.activo ? (
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                disabled={isPending}
                onClick={() => setConfirmandoDesactivar(true)}
              >
                Desactivar equipo
              </BotonSistema>
            ) : (
              <BotonSistema type="button" variante="outline" tamaño="sm" disabled={isPending} onClick={activar}>
                Activar equipo
              </BotonSistema>
            )}
          </div>

          <div className="grid gap-2">
            <TituloSistema nivel={4}>Roles</TituloSistema>
            {roles.length === 0 ? (
              <TextoSistema variante="sutil" tamaño="sm">
                Este equipo todavía no tiene roles.
              </TextoSistema>
            ) : (
              <div className="grid gap-2">
                {roles.map((rol) => (
                  <RolEditableFila key={rol.id} rol={rol} toast={toast} />
                ))}
              </div>
            )}
            <form onSubmit={agregarRol} className="flex items-end gap-2">
              <InputSistema
                label="Agregar rol"
                placeholder="Nombre del rol"
                value={nuevoRolLabel}
                onChange={(event) => setNuevoRolLabel(event.target.value)}
                disabled={isPending}
                className="flex-1"
              />
              <BotonSistema type="submit" tamaño="sm" disabled={isPending || !nuevoRolLabel.trim()}>
                Agregar
              </BotonSistema>
            </form>
          </div>

          <div className="flex justify-end">
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onClose}>
              Cerrar
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmandoDesactivar}
        onClose={() => setConfirmandoDesactivar(false)}
        onConfirm={confirmarDesactivar}
        title={`Desactivar "${equipo.label}"`}
        message="El equipo pasará a estar inactivo. Podrás reactivarlo luego desde esta misma pantalla. ¿Deseás continuar?"
        isLoading={isPending}
      />
    </>
  )
}

interface RolEditableFilaProps {
  readonly rol: DreamTeamRol
  readonly toast: Toast
}

function RolEditableFila({ rol, toast }: RolEditableFilaProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [nuevoLabel, setNuevoLabel] = useState(rol.label)

  function reportar(result: RolActionResult, exito: string): void {
    if (!result.ok) {
      toast.error(result.message ?? mensajeParaError(result.error))
      return
    }
    toast.success(exito)
  }

  function guardar(): void {
    const label = nuevoLabel.trim()
    if (!label) return
    startTransition(async () => {
      const result = await renombrarRol({ id: rol.id, label })
      reportar(result, 'Rol renombrado correctamente.')
      if (result.ok) setEditando(false)
    })
  }

  function toggleActivo(): void {
    startTransition(async () => {
      reportar(await cambiarActivoRol({ id: rol.id, activo: !rol.activo }), rol.activo ? 'Rol desactivado.' : 'Rol activado.')
    })
  }

  if (editando) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          guardar()
        }}
      >
        <InputSistema
          aria-label={`Nuevo nombre para el rol ${rolLabel(rol.label)}`}
          value={nuevoLabel}
          onChange={(event) => setNuevoLabel(event.target.value)}
          disabled={isPending}
          className="flex-1"
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <BadgeSistema variante={rolBadgeVariante(rol.label)} tamaño="sm">
        {rolLabel(rol.label)}
        {!rol.activo && ' (inactivo)'}
      </BadgeSistema>
      <div className="flex items-center gap-1">
        <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={isPending} onClick={() => setEditando(true)}>
          Renombrar
        </BotonSistema>
        <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={isPending} onClick={toggleActivo}>
          {rol.activo ? 'Desactivar' : 'Activar'}
        </BotonSistema>
      </div>
    </div>
  )
}

// ── Agregar sub-equipo ─────────────────────────────────────────────────

interface AgregarSubequipoDialogProps {
  readonly equipoPadre: DreamTeamEquipo
  readonly onClose: () => void
  readonly toast: Toast
}

function AgregarSubequipoDialog({ equipoPadre, onClose, toast }: AgregarSubequipoDialogProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState('')

  function crear(event: FormEvent): void {
    event.preventDefault()
    const nombre = label.trim()
    if (!nombre) return
    startTransition(async () => {
      const result = await crearEquipo({ parentEquipoId: equipoPadre.id, label: nombre })
      if (!result.ok) {
        toast.error(result.message ?? mensajeParaError(result.error))
        return
      }
      toast.success('Sub-equipo creado correctamente.')
      setLabel('')
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar sub-equipo</DialogTitle>
          <DialogDescription>Se creará dentro de &quot;{equipoPadre.label}&quot;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={crear} className="grid gap-3">
          <InputSistema
            label="Nombre del sub-equipo"
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" disabled={isPending} onClick={onClose}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="submit" tamaño="sm" disabled={isPending || !label.trim()}>
              Crear
            </BotonSistema>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
