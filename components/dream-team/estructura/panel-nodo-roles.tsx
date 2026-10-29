'use client'

/**
 * Estructura — the Roles tab of the node panel (S12): one row per rol with how
 * many people hold it, its level, a pencil to rename it and a switch to turn it
 * off (a rol is never deleted), then the form to add one. The level of a new
 * rol follows the typed name until one is picked by hand. Same rules and
 * server actions as roles-equipo.tsx, laid out for the panel.
 *
 * Someone who cannot edit reads the level as text and the state as a dot.
 */
import { useOptimistic, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { Pencil } from 'lucide-react'

import { Interruptor } from '@/components/ui/interruptor'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { cambiarActivoRol, cambiarNivelRol, crearRol, renombrarRol } from '@/app/(auth)/admin/dream-team/estructura/actions'
import type { RolDetalle } from '@/lib/platform/dream-team/estructura-vista'
import { NIVELES_ROL, esNivelRol, nivelDesdeLabel, nivelRolLabel } from '@/lib/platform/dream-team/nivel-rol'
import type { DreamTeamNivelRol } from '@/lib/platform/dream-team/types'

import { DialogoNombre } from './dialogo-nombre'
import { personasTexto, reportarResultado, type Toast } from './mensajes'

export interface PanelNodoRolesProps {
  readonly equipoId: string
  readonly equipoLabel: string
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
  const sinAsignar = rol.activo && rol.uso === 0

  function cambiarNivel(valor: string): void {
    if (!esNivelRol(valor) || valor === rol.nivel) return
    startTransition(async () => {
      mostrarNivel(valor)
      const resultado = await cambiarNivelRol({ id: rol.id, nivel: valor })
      if (reportarResultado(toast, resultado, 'Nivel del rol actualizado.')) onActualizado()
    })
  }

  function alternar(activo: boolean): void {
    startTransition(async () => {
      const resultado = await cambiarActivoRol({ id: rol.id, activo })
      if (reportarResultado(toast, resultado, activo ? 'Rol activado.' : 'Rol desactivado.')) onActualizado()
    })
  }

  return (
    <li className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-3.5 pr-2">
      <span className="flex min-w-[9rem] flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn('truncate text-sm font-medium', rol.activo ? 'text-foreground' : 'text-muted-foreground')}>
            {rol.label}
          </span>
          {sinAsignar && <PuntoEstado tono="info" etiqueta="Sin asignar" />}
        </span>
        <span className="text-sm text-muted-foreground">{usoDelRol(rol)}</span>
      </span>

      {puedeEditar ? (
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <span className="w-[8.75rem]">
            <SelectSistema
              aria-label={`Nivel del rol ${rol.label}`}
              title="Nivel del rol"
              opciones={OPCIONES_NIVEL}
              value={nivelVisible}
              onValueChange={cambiarNivel}
              disabled={isPending}
              className="text-sm"
            />
          </span>
          <BotonSistema
            type="button"
            variante="ghost"
            soloIcono
            icono={Pencil}
            aria-label={`Renombrar el rol ${rol.label}`}
            title="Renombrar rol"
            disabled={isPending}
            onClick={onRenombrar}
          />
          <Interruptor
            activo={rol.activo}
            onCambio={alternar}
            aria-label={`Rol ${rol.label}`}
            title={rol.activo ? 'Desactivar rol' : 'Activar rol'}
            disabled={isPending}
          />
        </span>
      ) : (
        <span className="ml-auto flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
          <span>{nivelRolLabel(rol.nivel)}</span>
          <PuntoEstado tono={rol.activo ? 'success' : 'muted'} etiqueta={rol.activo ? 'Activo' : 'Desactivado'} />
        </span>
      )}
    </li>
  )
}

function FormularioRolNuevo({
  equipoId,
  onActualizado,
  toast,
}: Pick<PanelNodoRolesProps, 'equipoId' | 'onActualizado' | 'toast'>): ReactElement {
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
    <form onSubmit={agregar} aria-label="Agregar rol" className="grid gap-2">
      <p className="text-sm font-medium text-foreground">Agregar rol</p>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[10rem] flex-1">
          <InputSistema
            aria-label="Nombre del rol nuevo"
            placeholder="Ej.: Recepción"
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
        <BotonSistema type="submit" variante="outline" disabled={isPending || !label}>
          Agregar
        </BotonSistema>
      </div>
      <p className="text-xs text-muted-foreground">El nivel decide qué puede hacer quien tiene el rol.</p>
    </form>
  )
}

export function PanelNodoRoles({
  equipoId,
  equipoLabel,
  roles,
  puedeEditar,
  onActualizado,
  toast,
}: PanelNodoRolesProps): ReactElement {
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null)
  const rolEnEdicion = roles.find((rol) => rol.id === renombrandoId)

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Los puestos que se pueden asignar en {equipoLabel}. Un rol desactivado no se puede asignar; nunca se borra.
      </p>

      {roles.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Este equipo todavía no tiene roles.
        </p>
      ) : (
        <ul aria-label="Roles de este equipo" className="divide-y divide-border rounded-xl border border-border bg-card">
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
    </div>
  )
}
