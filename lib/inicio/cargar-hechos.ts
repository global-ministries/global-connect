/**
 * Server loader of HechosInicio (odd/tasks/home-por-rol.md T2). Reads the
 * person's own usuarios row first, then every source in parallel. A source
 * that fails, throws or takes longer than TIEMPO_MAXIMO_MS degrades to its
 * empty value and is logged; the others are kept.
 *
 * Then, only for whoever has something in charge, the counts that come from
 * it (cargarPendientesCargo, T4): reports, leaders without report and
 * volunteers without Próximo Paso.
 *
 * Open support tickets only for who attends support (S16): the same
 * support_user_capabilities read as the staff queue (/ayuda/admin), then a
 * head count of its «Abiertos» under the session's RLS.
 *
 * Not loaded here (stay 0/false): the other pendientes del director de Dream
 * Team (no helper counts them for the home), and DPS convocatorias /
 * servicios por confirmar (the page fills them from «Mis servicios», S2).
 */
import { obtenerCasasRevisionPendiente, obtenerGruposSinCasaAnfitriona } from '@/lib/actions/casas-anfitrionas.actions'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { esMayorDeEdad, parseMisHijos } from '@/lib/platform/ninos/mis-hijos'
import { SUPPORT_CAPABILITIES } from '@/lib/support/capabilities'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

import { cargarPendientesCargo, type PendientesCargo } from './cargar-pendientes'
import { HECHOS_VACIOS, tieneAreaACargo, type HechosInicio, type MembresiaGrupo, type RolEnGrupo, type ServicioActivo } from './hechos'

export type ClienteInicio = Awaited<ReturnType<typeof createSupabaseServerClient>>

const TIEMPO_MAXIMO_MS = 3000
const ROLES_GRUPO = new Set<string>(['Líder', 'Colíder', 'Miembro'])

type Respuesta = { data: unknown; error: { message?: string } | null }

// The «Abiertos» filter of the staff queue (app/(auth)/ayuda/admin/page.tsx).
const ESTADOS_TICKET_ABIERTO = ['received', 'in_review', 'in_progress']

// hizo_proximo_paso is created by T1 and is not in database.types.ts yet.
type RpcHizoProximoPaso = (fn: 'hizo_proximo_paso', args: { p_usuario_id: string }) => PromiseLike<Respuesta>

/** Runs one source; on error, throw or time-out returns `vacio`. */
async function intentar<T>(fuente: string, leer: () => PromiseLike<T>, vacio: T): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`más de ${TIEMPO_MAXIMO_MS} ms`)), TIEMPO_MAXIMO_MS)
  })
  try {
    return await Promise.race([leer(), limite])
  } catch (error) {
    console.error(`Inicio: no se pudo leer ${fuente}:`, error instanceof Error ? error.message : error)
    return vacio
  } finally {
    clearTimeout(reloj)
  }
}

/** The data of a PostgREST/RPC response; throws its error so intentar degrades it. */
async function datos(consulta: PromiseLike<Respuesta>): Promise<unknown> {
  const { data, error } = await consulta
  if (error) throw new Error(error.message ?? 'error de Supabase')
  return data
}

const filas = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? data.filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null) : []

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function aGrupos(data: unknown): MembresiaGrupo[] {
  return filas(data).flatMap((f) => {
    const grupo = objeto(f.grupo)
    const grupoId = texto(f.grupo_id)
    const activa = (f.estado ?? 'activo') === 'activo' && grupo?.activo !== false && grupo?.eliminado !== true
    if (!grupoId || !activa || typeof f.rol !== 'string' || !ROLES_GRUPO.has(f.rol)) return []
    return [{ grupoId, nombre: texto(grupo?.nombre), rol: f.rol as RolEnGrupo }]
  })
}

function aServicios(data: unknown): ServicioActivo[] {
  return filas(data).flatMap((f) => {
    const servicioId = texto(f.id)
    const equipoId = texto(f.equipo_id)
    return servicioId && equipoId ? [{ servicioId, equipoId, nivel: texto(objeto(f.rol)?.nivel) }] : []
  })
}

const ids = (data: unknown, columna: string): string[] =>
  filas(data).map((f) => texto(f[columna])).filter((v): v is string => v !== null)

/**
 * Open tickets of the support queue, only for who attends it: any active
 * support capability (view, reply or manage all open the queue, as
 * listStaffSupportTickets in lib/actions/support.actions.ts). Others get 0.
 */
async function ticketsAbiertos(supabase: ClienteInicio, usuarioId: string): Promise<number> {
  const capacidades = filas(await datos(supabase.from('support_user_capabilities').select('capability').eq('usuario_id', usuarioId).is('revoked_at', null)))
  const atiende = capacidades.some((f) => (SUPPORT_CAPABILITIES as readonly unknown[]).includes(f.capability))
  if (!atiende) return 0
  const { count, error } = await supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ESTADOS_TICKET_ABIERTO)
  if (error) throw new Error(error.message ?? 'error de Supabase')
  return count ?? 0
}

export async function cargarHechosInicio(supabase: ClienteInicio, authUser: { id: string }): Promise<HechosInicio> {
  const authId = authUser.id
  // Admin client for the own row, one row by auth_id, as cargarMisHijosDashboard.
  const usuario = objeto(
    await intentar(
      'usuarios',
      () => datos(createSupabaseAdminClient().from('usuarios').select('id, telefono, fecha_nacimiento').eq('auth_id', authId).maybeSingle()),
      null,
    ),
  )
  const usuarioId = texto(usuario?.id)
  if (!usuario || !usuarioId) return HECHOS_VACIOS

  const fechaNacimiento = texto(usuario.fecha_nacimiento)
  const mayorDeEdad = esMayorDeEdad(fechaNacimiento, hoyEnCaracas())
  const rpcHizoProximoPaso = supabase.rpc.bind(supabase) as unknown as RpcHizoProximoPaso

  const [esAdminOPastor, grupos, etapasDirigidas, segmentosDirigidos, serviciosActivos, hijos, hizoProximoPaso, solicitudesGrupo, casasPorRevisar, gruposSinCasa, tickets] =
    await Promise.all([
      intentar('es_admin_o_pastor', async () => (await datos(supabase.rpc('es_admin_o_pastor', { p_auth_id: authId }))) === true, false),
      intentar(
        'grupo_miembros',
        async () =>
          aGrupos(
            await datos(
              supabase
                .from('grupo_miembros')
                .select('grupo_id, rol, estado, grupo:grupos!grupo_miembros_grupo_id_fkey(nombre, activo, eliminado)')
                .eq('usuario_id', usuarioId)
                .is('fecha_salida', null),
            ),
          ),
        [],
      ),
      intentar(
        'segmento_lideres',
        async () => ids(await datos(supabase.from('segmento_lideres').select('id').eq('usuario_id', usuarioId).eq('tipo_lider', 'director_etapa')), 'id'),
        [],
      ),
      intentar(
        'director_general_segmentos',
        async () => ids(await datos(supabase.from('director_general_segmentos').select('segmento_id').eq('usuario_id', usuarioId)), 'segmento_id'),
        [],
      ),
      intentar(
        'dream_team_servicios',
        async () =>
          aServicios(
            await datos(
              supabase
                .from('dream_team_servicios')
                .select('id, equipo_id, rol:dream_team_roles!dream_team_servicios_rol_id_fkey(nivel)')
                .eq('persona_id', usuarioId)
                .eq('estado', 'activo'),
            ),
          ),
        [],
      ),
      // A minor never gets «Mis hijos» (R3b, as the dashboard card).
      mayorDeEdad
        ? intentar('ninos_mis_hijos', async () => parseMisHijos(await datos(supabase.rpc('ninos_mis_hijos'))).length, 0)
        : Promise.resolve(0),
      intentar<boolean | null>(
        'hizo_proximo_paso',
        async () => {
          const valor = await datos(rpcHizoProximoPaso('hizo_proximo_paso', { p_usuario_id: usuarioId }))
          return typeof valor === 'boolean' ? valor : null
        },
        null,
      ),
      intentar(
        'contar_solicitudes_pendientes',
        async () => {
          const valor = await datos(supabase.rpc('contar_solicitudes_pendientes', { p_auth_id: authId }))
          return typeof valor === 'number' ? valor : 0
        },
        0,
      ),
      // Both actions already decide who may see each queue.
      intentar('casas por revisar', async () => {
        const r = await obtenerCasasRevisionPendiente()
        if (!r.success) throw new Error(r.error ?? 'sin datos')
        return r.data?.length ?? 0
      }, 0),
      intentar('grupos sin casa', async () => {
        const r = await obtenerGruposSinCasaAnfitriona({ scope: 'active' })
        if (!r.success) throw new Error(r.error ?? 'sin datos')
        return r.data?.length ?? 0
      }, 0),
      intentar('tickets de soporte', () => ticketsAbiertos(supabase, usuarioId), 0),
    ])

  const pedidoCargo = {
    usuarioId,
    hoy: hoyEnCaracas(),
    gruposLider: grupos.filter((g) => g.rol === 'Líder').map((g) => g.grupoId),
    etapas: etapasDirigidas,
    segmentos: segmentosDirigidos,
    areas: [...new Set(serviciosActivos.filter(tieneAreaACargo).map((s) => s.equipoId))],
  }
  const conCargo = pedidoCargo.gruposLider.length + pedidoCargo.etapas.length + pedidoCargo.segmentos.length + pedidoCargo.areas.length > 0
  const deCargo: PendientesCargo = conCargo
    ? await cargarPendientesCargo(supabase, pedidoCargo)
    : { reportesSinCargar: 0, lideresSinReporte: 0, marcarProximoPaso: 0 }

  return {
    ...HECHOS_VACIOS,
    usuarioId,
    esAdminOPastor,
    grupos,
    etapasDirigidas,
    segmentosDirigidos,
    serviciosActivos,
    hijos,
    esMayorDeEdad: mayorDeEdad,
    perfilCompleto: texto(usuario.telefono) !== null && fechaNacimiento !== null,
    hizoProximoPaso,
    pendientes: { ...HECHOS_VACIOS.pendientes, ...deCargo, solicitudesGrupo, casasPorRevisar, gruposSinCasa, ticketsAbiertos: tickets },
  }
}
