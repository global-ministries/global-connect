/**
 * Server loading for Editar persona (/users/[id]/edit and /perfil "Mis
 * datos"): the same reads both pages did before S14, now in one place. The
 * person and the catalogs come with the service client (the pages check
 * puede_editar_usuario, or that it is the caller's own profile, first); the
 * identity line (role, campus, account) comes from the ficha's loader as
 * the caller, so it shows only what the caller may see.
 */
import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

import { cargarFichaPersona } from './ficha-persona'
import type { CatalogosGeografia, UsuarioEditable } from './editar-vista'

type Admin = ReturnType<typeof createSupabaseAdminClient>
type Sesion = Awaited<ReturnType<typeof createSupabaseServerClient>>

const SELECT_DIRECCION = `
  *,
  parroquia: parroquias!direcciones_parroquia_id_fkey (
    id, nombre,
    municipio: municipios!parroquias_municipio_id_fkey (
      id, nombre,
      estado: estados!municipios_estado_id_fkey (
        id, nombre,
        pais: paises!estados_pais_id_fkey ( id, nombre )
      )
    )
  )
`

export interface DatosEdicion {
  readonly ocupaciones: { id: string; nombre: string }[]
  readonly profesiones: { id: string; nombre: string }[]
  readonly catalogos: CatalogosGeografia
}

/** The person with their address and geography; null when the row does not exist. */
export async function cargarUsuarioEditable(
  admin: Admin,
  filtro: { readonly columna: 'id' | 'auth_id'; readonly valor: string },
): Promise<{ usuario: UsuarioEditable | null; error: string | null }> {
  const { data: usuario, error } = await admin.from('usuarios').select('*').eq(filtro.columna, filtro.valor).maybeSingle()
  if (error || !usuario) return { usuario: null, error: error?.message ?? null }
  let direccion: UsuarioEditable['direccion']
  if (usuario.direccion_id) {
    const { data } = await admin.from('direcciones').select(SELECT_DIRECCION).eq('id', usuario.direccion_id).maybeSingle()
    if (data) {
      const d = data as unknown as NonNullable<UsuarioEditable['direccion']> & { parroquia: NonNullable<UsuarioEditable['direccion']>['parroquia'] | null }
      direccion = { ...d, parroquia: d.parroquia ?? undefined }
    }
  }
  return { usuario: { ...usuario, direccion }, error: null }
}

export async function cargarCatalogosEdicion(admin: Admin): Promise<DatosEdicion> {
  const [ocupaciones, profesiones, paises, estados, municipios, parroquias] = await Promise.all([
    admin.from('ocupaciones').select('id, nombre').order('nombre'),
    admin.from('profesiones').select('id, nombre').order('nombre'),
    admin.from('paises').select('id, nombre').order('nombre'),
    admin.from('estados').select('id, nombre, pais_id').order('nombre'),
    admin.from('municipios').select('id, nombre, estado_id').order('nombre'),
    admin.from('parroquias').select('id, nombre, municipio_id').order('nombre'),
  ])
  return {
    ocupaciones: ocupaciones.data ?? [],
    profesiones: profesiones.data ?? [],
    catalogos: {
      paises: paises.data ?? [],
      estados: estados.data ?? [],
      municipios: municipios.data ?? [],
      parroquias: parroquias.data ?? [],
    },
  }
}

/** Role, campus and account for the header; null when the ficha cannot be read. */
export async function cargarIdentidadEdicion(
  sesion: Sesion,
  consulta: { readonly usuarioId: string; readonly authId: string },
): Promise<{ rol: string | null; campus: string | null; cuenta: 'si' | 'invitada' | 'no' | null } | null> {
  try {
    const ficha = await cargarFichaPersona(sesion, consulta)
    if (!ficha.ok) return null
    return { rol: ficha.persona.rol.etiqueta || null, campus: ficha.resumen.campus, cuenta: ficha.resumen.cuenta }
  } catch {
    return null
  }
}
