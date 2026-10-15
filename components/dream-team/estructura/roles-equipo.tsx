'use client'

/**
 * Estructura — "Roles de este equipo": one row per rol with how many people
 * hold it, its level (a selector to change it), a pencil to rename it, a switch
 * to enable or disable it (a disabled rol can no longer be assigned) and, at the
 * bottom, a form to add a new one with its name and level. The level starts as
 * the one the typed name suggests until a level is picked by hand.
 *
 * Someone who cannot edit the structure sees the same rows without the
 * selectors, the pencil, the switches and the form: the level is plain text and
 * the state of each rol is a badge instead.
 */
import { useOptimistic, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { Pencil } from 'lucide-react'

import {
  BadgeSistema,
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { cambiarActivoRol, cambiarNivelRol, crearRol, renombrarRol } from '@/app/(auth)/admin/dream-team/estructura/actions'
import type { RolDetalle } from '@/lib/platform/dream-team/estructura-vista'
import { NIVELES_ROL, esNivelRol, nivelDesdeLabel, nivelRolLabel } from '@/lib/platform/dream-team/nivel-rol'
import type { DreamTeamNivelRol } from '@/lib/platform/dream-team/types'

import { DialogoNombre } from './dialogo-nombre'
import { ANILLO_FOCO, personasTexto, reportarResultado, type Toast } from './mensajes'

export interface RolesEquipoProps {
  readonly equipoId: string
  readonly roles: readonly RolDetalle[]
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly toast: Toast
}

const OPCIONES_NIVEL = NIVELES_ROL.map(({ nivel, label }) => ({ valor: nivel, etiqueta: label }))

function usoDelRol(rol: RolDetalle): string {
  if (!rol.activo) return 'Desactivado: no se puede asignar'
  return rol.uso === 0 ? 'Nadie lo tiene todavía' : personasTexto(rol.uso)
}

function RolFila({
  rol,
  puedeEditar,
  onRenombrar,
  onActualizado,
  toast,
}: {
  readonly rol: RolDetalle
  readonly puedeEditar: boolean
  readonly onRenombrar: () => void
  readonly onActualizado: () => void
  readonly toast: Toast
}): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [nivelVisible, mostrarNivel] = useOptimistic(rol.nivel)

  function cambiarNivel(valor: string): void {
    if (!esNivelRol(valor) || valor === rol.nivel) return
    startTransition(async () => {
      mostrarNivel(valor)
      const resultado = await cambiarNivelRol({ id: rol.id, nivel: valor })
      if (reportarResultado(toast, resultado, 'Nivel del rol actualizado.')) onActualizado()
    })
  }

  function alternar(): void {
    startTransition(async () => {
      const resultado = await cambiarActivoRol({ id: rol.id, activo: !rol.activo })
      if (reportarResultado(toast, resultado, rol.activo ? 'Rol desactivado.' : 'Rol activado.')) onActualizado()
    })
  }

  return (
    <li className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1 py-1 pl-5 pr-3 sm:pl-6">
      <span className="flex min-w-[9rem] flex-1 flex-col gap-0.5">
        <span className={cn('truncate text-sm font-medium sm:text-base', rol.activo ? 'text-foreground' : 'text-muted-foreground')}>
          {rol.label}
        </span>
        <span className="text-sm text-muted-foreground">{usoDelRol(rol)}</span>
      </span>

      {puedeEditar ? (
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="w-[8.75rem]">
            <SelectSistema
              aria-label={`Nivel del rol ${rol.label}`}
              title="Nivel del rol"
              opciones={OPCIONES_NIVEL}
              value={nivelVisible}
              onValueChange={cambiarNivel}
              disabled={isPending}
              className="text-sm"
            />
          </div>
          <button
            type="button"
            aria-label={`Renombrar el rol ${rol.label}`}
            title="Renombrar rol"
            disabled={isPending}
            onClick={onRenombrar}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              ANILLO_FOCO,
            )}
          >
            <Pencil aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={rol.activo}
            aria-label={`Rol ${rol.label}`}
            title={rol.activo ? 'Desactivar rol' : 'Activar rol'}
            disabled={isPending}
            onClick={alternar}
            className={cn('flex h-11 w-12 shrink-0 items-center justify-center rounded-xl disabled:opacity-50', ANILLO_FOCO)}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-6 w-11 items-center rounded-full p-[3px] transition-colors',
                rol.activo ? 'justify-end bg-[var(--brand-primary)]' : 'justify-start bg-input',
              )}
            >
              <span className="h-[18px] w-[18px] rounded-full bg-background shadow-sm" />
            </span>
          </button>
        </div>
      ) : (
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="text-sm text-muted-foreground">Nivel: {nivelRolLabel(rol.nivel)}</span>
          <BadgeSistema variante={rol.activo ? 'success' : 'default'} tamaño="sm">
            {rol.activo ? 'Activo' : 'Desactivado'}
          </BadgeSistema>
        </div>
      )}
    </li>
  )
}

function FormularioRolNuevo({
  equipoId,
  onActualizado,
  toast,
}: Pick<RolesEquipoProps, 'equipoId' | 'onActualizado' | 'toast'>): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState('')
  // null = follow the level the typed name suggests; set once a level is picked by hand.
  const [nivelElegido, setNivelElegido] = useState<DreamTeamNivelRol | null>(null)
  const label = nombre.trim()
  const nivel = nivelElegido ?? nivelDesdeLabel(label)

  function elegirNivel(valor: string): void {
    if (esNivelRol(valor)) setNivelElegido(valor)
  }

  function agregar(event: FormEvent): void {
    event.preventDefault()
    if (!label) return
    startTransition(async () => {
      const resultado = await crearRol({ equipoId, label, nivel })
      if (reportarResultado(toast, resultado, 'Rol agregado correctamente.')) {
        setNombre('')
        setNivelElegido(null)
        onActualizado()
      }
    })
  }

  return (
    <form onSubmit={agregar} className="flex flex-wrap items-end gap-2.5 border-t border-border px-5 py-3.5 sm:px-6">
      <div className="min-w-[12rem] flex-1">
        <InputSistema
          aria-label="Nombre del rol nuevo"
          placeholder="Nombre del rol nuevo"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="w-[8.75rem]">
        <SelectSistema
          aria-label="Nivel del rol nuevo"
          title="Nivel del rol nuevo"
          opciones={OPCIONES_NIVEL}
          value={nivel}
          onValueChange={elegirNivel}
          disabled={isPending}
          className="text-sm"
        />
      </div>
      <BotonSistema type="submit" variante="outline" tamaño="sm" disabled={isPending || !label}>
        Agregar rol
      </BotonSistema>
    </form>
  )
}

export function RolesEquipo({ equipoId, roles, puedeEditar, onActualizado, toast }: RolesEquipoProps): ReactElement {
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null)
  const rolEnEdicion = roles.find((rol) => rol.id === renombrandoId)

  return (
    <TarjetaSistema role="region" aria-label="Roles de este equipo" className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <TituloSistema nivel={3}>Roles de este equipo</TituloSistema>
        <p className="text-sm text-muted-foreground">Los puestos que se pueden asignar aquí</p>
      </div>

      {roles.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">Este equipo todavía no tiene roles.</p>
      ) : (
        <ul className="divide-y divide-border">
          {roles.map((rol) => (
            <RolFila
              key={rol.id}
              rol={rol}
              puedeEditar={puedeEditar}
              onRenombrar={() => setRenombrandoId(rol.id)}
              onActualizado={onActualizado}
              toast={toast}
            />
          ))}
        </ul>
      )}

      {puedeEditar && <FormularioRolNuevo equipoId={equipoId} onActualizado={onActualizado} toast={toast} />}

      {rolEnEdicion && (
        <DialogoNombre
          titulo="Renombrar rol"
          descripcion={`Nuevo nombre para el rol ${rolEnEdicion.label} de este equipo.`}
          etiquetaCampo="Nombre del rol"
          valorInicial={rolEnEdicion.labelOriginal}
          textoBoton="Guardar"
          exito="Rol renombrado correctamente."
          guardar={(label) => renombrarRol({ id: rolEnEdicion.id, label })}
          onClose={() => setRenombrandoId(null)}
          onHecho={onActualizado}
          toast={toast}
        />
      )}
    </TarjetaSistema>
  )
}
