/**
 * Loads the ficha /users/[id] (S13 of odd/tasks/sistema-diseno-v2.md) as the
 * signed-in caller; the database decides what they may see.
 *
 * - obtener_detalle_usuario: the person (gate puede_ver_usuario_ficha, with
 *   the campus rule of 20261029200000). 42501 → not allowed, 02000 → not found.
 * - puede_editar_usuario: Editar, Agregar familiar, removing a relation.
 * - listar_usuarios_con_permisos_v2: the person's own list row, for what the
 *   detail RPC lacks (cuenta si | invitada | no, main campus, current Grupo de
 *   Vida and es_de_mi_grupo for the leader's contact rule). Found by searching
 *   the cédula (or email, or surname) and keeping the row with the same id; a
 *   person the list does not return keeps these unknown, so the screen hides
 *   them instead of guessing.
 */
import { shouldShowEditAction, toPermissionRpcValue } from '@/app/(auth)/users/[id]/user-edit-permission'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

import { rolPrincipal } from './ficha-vista'
import type { CuentaEstado } from './lista-vista'

type Cliente = Pick<Awaited<ReturnType<typeof createSupabaseServerClient>>, 'rpc'>
type Registro = Readonly<Record<string, unknown>>

export interface DireccionFicha {
  readonly pais: string | null
  readonly estado: string | null
  readonly municipio: string | null
  readonly parroquia: string | null
  readonly calle: string | null
  readonly barrio: string | null
  readonly codigoPostal: string | null
  readonly referencia: string | null
  readonly latitud: number | null
  readonly longitud: number | null
}

export interface FamiliarFicha {
  readonly id: string | null
  readonly nombre: string
  readonly apellido: string
  readonly email: string | null
  readonly telefono: string | null
  readonly genero: string | null
  readonly foto_perfil_url: string | null
}

/** As the RPC returns it, so lib/config/relaciones-familiares reads it unchanged. */
export interface RelacionFicha {
  readonly id: string
  readonly tipo_relacion: string
  readonly es_principal: boolean
  readonly usuario1_id?: string
  readonly usuario2_id?: string
  readonly sentido?: 'directo' | 'inverso'
  readonly familiar: FamiliarFicha
}

export interface PersonaFicha {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly cedula: string | null
  readonly email: string | null
  readonly telefono: string | null
  readonly fechaNacimiento: string | null
  readonly fechaRegistro: string | null
  readonly estadoCivil: string | null
  readonly genero: string | null
  readonly fotoUrl: string | null
  readonly ocupacion: string | null
  readonly profesion: string | null
  readonly direccion: DireccionFicha | null
  readonly rol: { readonly interno: string; readonly etiqueta: string }
  readonly relaciones: readonly RelacionFicha[]
}

export interface ResumenFicha {
  readonly cuenta: CuentaEstado | null
  readonly campus: string | null
  readonly esDeMiGrupo: boolean
  readonly grupoActual: string | null
}

export type ResultadoFicha =
  | { readonly ok: true; readonly persona: PersonaFicha; readonly puedeEditar: boolean; readonly resumen: ResumenFicha }
  | { readonly ok: false; readonly motivo: 'sin-permiso' | 'no-encontrado' | 'error'; readonly mensaje: string }

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const registro = (v: unknown): Registro => (v && typeof v === 'object' ? (v as Registro) : {})
const nombreDe = (v: unknown): string | null => texto(registro(v).nombre)

function aDireccion(v: unknown): DireccionFicha | null {
  if (!v || typeof v !== 'object') return null
  const d = registro(v)
  const parroquia = registro(d.parroquia)
  const municipio = registro(parroquia.municipio)
  const estado = registro(municipio.estado)
  return {
    pais: nombreDe(estado.pais),
    estado: texto(estado.nombre),
    municipio: texto(municipio.nombre),
    parroquia: texto(parroquia.nombre),
    calle: texto(d.calle),
    barrio: texto(d.barrio),
    codigoPostal: texto(d.codigo_postal),
    referencia: texto(d.referencia),
    latitud: numero(d.latitud),
    longitud: numero(d.longitud),
  }
}

function aRelacion(v: unknown): RelacionFicha | null {
  const r = registro(v)
  const id = texto(r.id)
  if (!id) return null
  const f = registro(r.familiar)
  return {
    id,
    tipo_relacion: texto(r.tipo_relacion) ?? '',
    es_principal: r.es_principal === true,
    ...(texto(r.usuario1_id) ? { usuario1_id: r.usuario1_id as string } : {}),
    ...(texto(r.usuario2_id) ? { usuario2_id: r.usuario2_id as string } : {}),
    ...(r.sentido === 'directo' || r.sentido === 'inverso' ? { sentido: r.sentido } : {}),
    familiar: {
      id: texto(f.id),
      nombre: texto(f.nombre) ?? '',
      apellido: texto(f.apellido) ?? '',
      email: texto(f.email),
      telefono: texto(f.telefono),
      genero: texto(f.genero),
      foto_perfil_url: texto(f.foto_perfil_url),
    },
  }
}

export function aPersonaFicha(datos: unknown): PersonaFicha {
  const u = registro(datos)
  return {
    id: texto(u.id) ?? '',
    nombre: texto(u.nombre) ?? '',
    apellido: texto(u.apellido) ?? '',
    cedula: texto(u.cedula),
    email: texto(u.email),
    telefono: texto(u.telefono),
    fechaNacimiento: texto(u.fecha_nacimiento),
    fechaRegistro: texto(u.fecha_registro),
    estadoCivil: texto(u.estado_civil),
    genero: texto(u.genero),
    fotoUrl: texto(u.foto_perfil_url),
    ocupacion: nombreDe(u.ocupacion),
    profesion: nombreDe(u.profesion),
    direccion: aDireccion(u.direccion),
    rol: rolPrincipal(u.roles),
    relaciones: (Array.isArray(u.relaciones) ? u.relaciones : []).map(aRelacion).filter((r): r is RelacionFicha => r !== null),
  }
}

/** The most selective value the list search matches (it matches each column on its own). */
export function terminoDeBusqueda(persona: PersonaFicha): string {
  return persona.cedula ?? persona.email ?? (persona.apellido || persona.nombre)
}

const RESUMEN_DESCONOCIDO: ResumenFicha = { cuenta: null, campus: null, esDeMiGrupo: false, grupoActual: null }
const CUENTAS: readonly string[] = ['si', 'invitada', 'no']

async function resumenDeLista(supabase: Cliente, authId: string, persona: PersonaFicha): Promise<ResumenFicha> {
  const termino = terminoDeBusqueda(persona)
  if (!termino) return RESUMEN_DESCONOCIDO
  const { data, error } = await supabase.rpc('listar_usuarios_con_permisos_v2', {
    p_auth_id: authId,
    p_busqueda: termino,
    p_limite: 100,
  })
  if (error || !Array.isArray(data)) return RESUMEN_DESCONOCIDO
  const fila = (data as Registro[]).find((f) => f.id === persona.id)
  if (!fila) return RESUMEN_DESCONOCIDO
  return {
    cuenta: CUENTAS.includes(fila.cuenta as string) ? (fila.cuenta as CuentaEstado) : null,
    campus: texto(fila.campus_nombre),
    esDeMiGrupo: fila.es_de_mi_grupo === true,
    grupoActual: texto(fila.grupo_nombre),
  }
}

export async function cargarFichaPersona(
  supabase: Cliente,
  consulta: { readonly usuarioId: string; readonly authId: string },
): Promise<ResultadoFicha> {
  const { data, error } = await supabase.rpc('obtener_detalle_usuario', { p_user_id: consulta.usuarioId })
  if (error) {
    const codigo = (error as { code?: string }).code
    if (codigo === '42501') return { ok: false, motivo: 'sin-permiso', mensaje: 'No tienes permiso para ver esta ficha.' }
    if (codigo === '02000') return { ok: false, motivo: 'no-encontrado', mensaje: 'Usuario no encontrado' }
    return { ok: false, motivo: 'error', mensaje: `Error al cargar usuario: ${error.message}` }
  }
  if (!data) return { ok: false, motivo: 'no-encontrado', mensaje: 'Usuario no encontrado' }
  const persona = aPersonaFicha(data)

  const [permiso, resumen] = await Promise.all([
    supabase.rpc('puede_editar_usuario', { p_auth_id: consulta.authId, p_target_user_id: consulta.usuarioId }),
    resumenDeLista(supabase, consulta.authId, persona),
  ])
  // Fails closed on an error or anything but true.
  const puedeEditar = shouldShowEditAction(toPermissionRpcValue(permiso.error ? null : permiso.data))
  return { ok: true, persona, puedeEditar, resumen }
}
