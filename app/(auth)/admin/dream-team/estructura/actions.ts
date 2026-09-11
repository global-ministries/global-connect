'use server'

/**
 * Dream Team — server actions for the /admin/dream-team/estructura screen.
 *
 * Pattern mirrors app/(auth)/admin/talleres/abstracto/[slug]/actions.ts:
 * a discriminated result type, never a thrown error reaching the client.
 * Every action re-checks flag → session → write capability before touching
 * the repository (defense-in-depth; RLS enforces the same gate server-side).
 *
 * No delete actions exist here, and none should be added: a tree node is
 * deactivated (`activo = false`), never removed. `dream_team_servicios`
 * references equipos/roles with `ON DELETE RESTRICT`, so deleting a node
 * that any service ever pointed to is not something the schema allows —
 * and it would make servicio history non-reversible if it were.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isDreamTeamEnabled,
  requireDreamTeamSession,
  hasDreamTeamWriteCapability,
} from '@/lib/platform/dream-team/route-access'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import type { DreamTeamRepository } from '@/lib/platform/dream-team/repository'
import type { DreamTeamEquipo, DreamTeamRol } from '@/lib/platform/dream-team/types'

const ESTRUCTURA_PATH = '/admin/dream-team/estructura'
const LABEL_MAX_LENGTH = 120

type ActionError = 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'

export type EquipoActionResult =
  | { readonly ok: true; readonly equipo: DreamTeamEquipo }
  | { readonly ok: false; readonly error: ActionError; readonly message?: string }

export type RolActionResult =
  | { readonly ok: true; readonly rol: DreamTeamRol }
  | { readonly ok: false; readonly error: ActionError; readonly message?: string }

type WriteContext =
  | { readonly ok: true; readonly repo: DreamTeamRepository }
  | { readonly ok: false; readonly error: ActionError }

async function resolveWriteContext(): Promise<WriteContext> {
  if (!isDreamTeamEnabled()) return { ok: false, error: 'not-found' }

  const session = await requireDreamTeamSession()
  if (!session) return { ok: false, error: 'unauthorized' }

  if (!hasDreamTeamWriteCapability(session)) return { ok: false, error: 'forbidden' }

  const supabase = await createSupabaseServerClient()
  return { ok: true, repo: createSupabaseDreamTeamRepository(supabase) }
}

function validarLabel(label: string | undefined): string | { readonly error: ActionError; readonly message: string } {
  const trimmed = label?.trim() ?? ''
  if (!trimmed) {
    return { error: 'invalid-input', message: 'La etiqueta es obligatoria.' }
  }
  if (trimmed.length > LABEL_MAX_LENGTH) {
    return { error: 'invalid-input', message: `La etiqueta no puede superar los ${LABEL_MAX_LENGTH} caracteres.` }
  }
  return trimmed
}

function isPostgrestNoRowsError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'PGRST116'
}

function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23503'
}

function internalErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

// ── Equipos ────────────────────────────────────────────────────────────

export interface CrearEquipoInput {
  readonly parentEquipoId: string
  readonly label: string
}

export async function crearEquipo(input: CrearEquipoInput): Promise<EquipoActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!input.parentEquipoId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo padre.' }
  }

  try {
    // The new equipo always inherits its parent's experiencia — sub-equipos
    // never switch experience branches, and re-deriving it here (instead of
    // trusting a client-supplied value) keeps a tampered payload from
    // planting a node under the wrong branch.
    const equipos = await ctx.repo.listEquipos()
    const padre = equipos.find((equipo) => equipo.id === input.parentEquipoId)
    if (!padre) {
      return { ok: false, error: 'not-found', message: 'El equipo padre no existe o no es visible.' }
    }

    const equipo = await ctx.repo.createEquipo({
      label,
      experiencia: padre.experiencia,
      activo: true,
      parentEquipoId: padre.id,
    })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, equipo }
  } catch (error) {
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}

export interface RenombrarEquipoInput {
  readonly id: string
  readonly label: string
}

export async function renombrarEquipo(input: RenombrarEquipoInput): Promise<EquipoActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo a renombrar.' }
  }

  try {
    const equipo = await ctx.repo.updateEquipo(input.id, { label })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, equipo }
  } catch (error) {
    if (isPostgrestNoRowsError(error)) {
      return { ok: false, error: 'not-found', message: 'El equipo no existe o no es visible.' }
    }
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}

export interface CambiarActivoEquipoInput {
  readonly id: string
  readonly activo: boolean
}

export async function cambiarActivoEquipo(input: CambiarActivoEquipoInput): Promise<EquipoActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo.' }
  }

  try {
    const equipo = await ctx.repo.updateEquipo(input.id, { activo: input.activo })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, equipo }
  } catch (error) {
    if (isPostgrestNoRowsError(error)) {
      return { ok: false, error: 'not-found', message: 'El equipo no existe o no es visible.' }
    }
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}

// ── Roles ──────────────────────────────────────────────────────────────

export interface CrearRolInput {
  readonly equipoId: string
  readonly label: string
  readonly parentRolId?: string
}

export async function crearRol(input: CrearRolInput): Promise<RolActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!input.equipoId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo.' }
  }

  try {
    const rol = await ctx.repo.createRol({
      equipoId: input.equipoId,
      label,
      activo: true,
      parentRolId: input.parentRolId,
    })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, rol }
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { ok: false, error: 'not-found', message: 'El equipo no existe.' }
    }
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}

export interface RenombrarRolInput {
  readonly id: string
  readonly label: string
}

export async function renombrarRol(input: RenombrarRolInput): Promise<RolActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el rol a renombrar.' }
  }

  try {
    const rol = await ctx.repo.updateRol(input.id, { label })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, rol }
  } catch (error) {
    if (isPostgrestNoRowsError(error)) {
      return { ok: false, error: 'not-found', message: 'El rol no existe o no es visible.' }
    }
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}

export interface CambiarActivoRolInput {
  readonly id: string
  readonly activo: boolean
}

export async function cambiarActivoRol(input: CambiarActivoRolInput): Promise<RolActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el rol.' }
  }

  try {
    const rol = await ctx.repo.updateRol(input.id, { activo: input.activo })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, rol }
  } catch (error) {
    if (isPostgrestNoRowsError(error)) {
      return { ok: false, error: 'not-found', message: 'El rol no existe o no es visible.' }
    }
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}
