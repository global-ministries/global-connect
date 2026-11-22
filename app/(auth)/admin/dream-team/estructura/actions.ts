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
  hasDreamTeamOrgManageCapability,
} from '@/lib/platform/dream-team/route-access'
import { hasDreamTeamEquiposGestion } from '@/lib/platform/dream-team/capabilities'
import {
  resultadoRpcEquipo,
  type AccionGestion,
  type ResultadoRpcEquipo,
} from '@/lib/platform/dream-team/estructura-gestion'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import type { DreamTeamRepository } from '@/lib/platform/dream-team/repository'
import { esNivelRol } from '@/lib/platform/dream-team/nivel-rol'
import type { DreamTeamEquipo, DreamTeamNivelRol, DreamTeamRol } from '@/lib/platform/dream-team/types'

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

  // Refuse early and clearly. RLS would also refuse — but silently, as an
  // UPDATE that matches zero rows, surfacing as an opaque error.
  if (!hasDreamTeamOrgManageCapability(session)) return { ok: false, error: 'forbidden' }

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

const NIVEL_INVALIDO = { error: 'invalid-input', message: 'El nivel del rol no es válido.' } as const

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
//
// odd/tasks/dream-team-estructura-correcciones.md, T3 (S4, S5): a director
// reshapes their own branch, not only org.manage. The writes go through the
// dream_team_equipo_* RPCs (20261121100000), which check
// dream_team_gestiona_equipo per equipo — the equipo RLS policies stay
// org.manage-only, so a director never writes the table directly. The gate
// below only refuses early whoever directs nothing.

type EquipoContext =
  | { readonly ok: true; readonly rpc: RpcSinTipos }
  | { readonly ok: false; readonly error: ActionError }

// The functions are not in the generated database types yet, so the calls are
// untyped (the pattern of lib/platform/dream-team/cambiar-area.ts).
type RpcSinTipos = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>

async function resolveEquipoContext(): Promise<EquipoContext> {
  if (!isDreamTeamEnabled()) return { ok: false, error: 'not-found' }

  // With the system roles: an admin or a pastor passes without a Dream Team
  // grant, as in dream_team_gestiona_equipo (T6). The RPC still decides per equipo.
  const session = await requireDreamTeamSession({ includeRoles: true })
  if (!session) return { ok: false, error: 'unauthorized' }

  if (!hasDreamTeamEquiposGestion(session)) return { ok: false, error: 'forbidden' }

  const supabase = await createSupabaseServerClient()
  const client = supabase as unknown as { rpc: RpcSinTipos }
  return { ok: true, rpc: (fn, args) => client.rpc(fn, args) }
}

async function llamarRpcEquipo(
  ctx: { readonly rpc: RpcSinTipos },
  fn: string,
  args: Record<string, unknown>,
  accion: AccionGestion,
): Promise<ResultadoRpcEquipo> {
  try {
    const resultado = resultadoRpcEquipo(await ctx.rpc(fn, args), accion)
    if (resultado.ok) revalidatePath(ESTRUCTURA_PATH)
    return resultado
  } catch {
    return resultadoRpcEquipo({ data: null, error: { message: 'red' } }, accion)
  }
}

function sinRuta(resultado: ResultadoRpcEquipo): EquipoActionResult {
  return resultado.ok ? { ok: true, equipo: resultado.equipo } : resultado
}

export interface CrearEquipoInput {
  readonly parentEquipoId: string
  readonly label: string
}

// «+ Subequipo»: the new equipo inherits its parent's experiencia in the RPC,
// never from the client.
export async function crearEquipo(input: CrearEquipoInput): Promise<EquipoActionResult> {
  const ctx = await resolveEquipoContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!input.parentEquipoId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo padre.' }
  }

  return sinRuta(await llamarRpcEquipo(ctx, 'dream_team_equipo_crear', { p_padre: input.parentEquipoId, p_label: label }, 'crear'))
}

export interface RenombrarEquipoInput {
  readonly id: string
  readonly label: string
}

export async function renombrarEquipo(input: RenombrarEquipoInput): Promise<EquipoActionResult> {
  const ctx = await resolveEquipoContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo a renombrar.' }
  }

  return sinRuta(await llamarRpcEquipo(ctx, 'dream_team_equipo_renombrar', { p_equipo: input.id, p_label: label }, 'renombrar'))
}

export interface CambiarActivoEquipoInput {
  readonly id: string
  readonly activo: boolean
}

export async function cambiarActivoEquipo(input: CambiarActivoEquipoInput): Promise<EquipoActionResult> {
  const ctx = await resolveEquipoContext()
  if (!ctx.ok) return ctx

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo.' }
  }

  return sinRuta(
    await llamarRpcEquipo(ctx, 'dream_team_equipo_cambiar_activo', { p_equipo: input.id, p_activo: input.activo }, 'activar'),
  )
}

export interface MoverEquipoInput {
  readonly id: string
  readonly nuevoPadreId: string
}

export type MoverEquipoResult =
  | { readonly ok: true; readonly equipo: DreamTeamEquipo; readonly ruta?: string }
  | { readonly ok: false; readonly error: ActionError; readonly message?: string }

// «Mover a…» (S5): the RPC needs authority over the current parent and the
// destination, refuses roots, cycles and DPS anchors, keeps people and
// servicios, and returns the new path.
export async function moverEquipo(input: MoverEquipoInput): Promise<MoverEquipoResult> {
  const ctx = await resolveEquipoContext()
  if (!ctx.ok) return ctx

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo a mover.' }
  }
  if (!input.nuevoPadreId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Elige el equipo de destino.' }
  }

  return llamarRpcEquipo(ctx, 'dream_team_equipo_mover', { p_equipo: input.id, p_nuevo_padre: input.nuevoPadreId }, 'mover')
}

// ── Roles ──────────────────────────────────────────────────────────────

export interface CrearRolInput {
  readonly equipoId: string
  readonly label: string
  readonly nivel: DreamTeamNivelRol
  readonly parentRolId?: string
}

export async function crearRol(input: CrearRolInput): Promise<RolActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  const label = validarLabel(input.label)
  if (typeof label !== 'string') return { ok: false, ...label }

  if (!esNivelRol(input.nivel)) return { ok: false, ...NIVEL_INVALIDO }

  if (!input.equipoId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el equipo.' }
  }

  try {
    const rol = await ctx.repo.createRol({
      equipoId: input.equipoId,
      label,
      nivel: input.nivel,
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

export interface CambiarNivelRolInput {
  readonly id: string
  readonly nivel: DreamTeamNivelRol
}

// Changes only the authority level; the label and the people holding the rol stay as they are.
export async function cambiarNivelRol(input: CambiarNivelRolInput): Promise<RolActionResult> {
  const ctx = await resolveWriteContext()
  if (!ctx.ok) return ctx

  if (!esNivelRol(input.nivel)) return { ok: false, ...NIVEL_INVALIDO }

  if (!input.id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Falta el rol.' }
  }

  try {
    const rol = await ctx.repo.updateRol(input.id, { nivel: input.nivel })
    revalidatePath(ESTRUCTURA_PATH)
    return { ok: true, rol }
  } catch (error) {
    if (isPostgrestNoRowsError(error)) {
      return { ok: false, error: 'not-found', message: 'El rol no existe o no es visible.' }
    }
    return { ok: false, error: 'internal', message: internalErrorMessage(error) }
  }
}
