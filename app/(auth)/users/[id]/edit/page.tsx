import { AlertTriangle, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { UserEditForm } from "@/components/forms/UserEditForm"

import { PaginaSistema, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { AdminAccionesAsignarContrasena } from '@/components/admin/AdminAccionesAsignarContrasena.client'
import { obtenerSugerenciasDireccionFamiliar } from '@/lib/actions/direccion-familiar.actions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: Props) {
  const { id } = await params

  // Verificar permisos antes de mostrar el formulario
  const supabaseServer = await createSupabaseServerClient()
  const { data: { user: authUser } } = await supabaseServer.auth.getUser()
  if (!authUser) {
    redirect('/')
  }
  const { data: permitido } = await supabaseServer.rpc('puede_editar_usuario' as any, {
    p_auth_id: authUser.id,
    p_target_user_id: id,
  })
  if (!permitido) {
    redirect(`/users/${id}`)
  }

  // Usar admin client para bypass RLS
  const supabase = createSupabaseAdminClient()

  // Obtener datos del usuario básico
  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .maybeSingle() // Permite cero o un resultado, evita error si no existe

  if (errorUsuario || !usuario) {
    return (
      <PaginaSistema regreso={{ href: '/users', texto: 'Volver a Usuarios' }}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <AlertTriangle className="size-12 text-danger mx-auto mb-4" aria-hidden="true" />
            <TituloSistema nivel={2}>Usuario no encontrado</TituloSistema>
            <p className="text-muted-foreground mb-4">
              No se pudo cargar la información del usuario con ID: {id}
            </p>
            <p className="text-muted-foreground text-sm mb-4">
              Error: {errorUsuario?.message || 'Usuario no encontrado en la base de datos'}
            </p>
            <BotonSistema asChild variante="primario">
              <Link href="/users">
                Volver a Usuarios
              </Link>
            </BotonSistema>
          </div>
        </div>
      </PaginaSistema>
    )
  }

  // Obtener dirección si existe
  let direccion = null
  if (usuario.direccion_id) {
    const { data: dirData } = await supabase
      .from('direcciones')
      .select(`
        *,
        parroquia: parroquias!direcciones_parroquia_id_fkey (
          id,
          nombre,
          municipio: municipios!parroquias_municipio_id_fkey (
            id,
            nombre,
            estado: estados!municipios_estado_id_fkey (
              id,
              nombre,
              pais: paises!estados_pais_id_fkey (
                id,
                nombre
              )
            )
          )
        )
      `)
      .eq('id', usuario.direccion_id)
      .maybeSingle()
    if (dirData) {
      direccion = dirData
    }
  }

  // Obtener familia si existe
  let familia = null
  if (usuario.familia_id) {
    const { data: famData } = await supabase
      .from('familias')
      .select('*')
      .eq('id', usuario.familia_id)
      .maybeSingle()
    if (famData) {
      familia = famData
    }
  }

  // Obtener ocupación si existe
  let ocupacion = null
  if (usuario.ocupacion_id) {
    const { data: ocData } = await supabase
      .from('ocupaciones')
      .select('*')
      .eq('id', usuario.ocupacion_id)
      .maybeSingle()
    if (ocData) {
      ocupacion = ocData
    }
  }

  // Obtener profesión si existe
  let profesion = null
  if (usuario.profesion_id) {
    const { data: profData } = await supabase
      .from('profesiones')
      .select('*')
      .eq('id', usuario.profesion_id)
      .maybeSingle()
    if (profData) {
      profesion = profData
    }
  }

  // Construir el objeto completo del usuario
  const usuarioCompleto = {
    ...usuario,
    direccion: direccion
      ? {
        ...direccion,
        parroquia: direccion.parroquia === null ? undefined : direccion.parroquia,
      }
      : undefined,
    familia: familia || undefined,
    ocupacion: ocupacion || undefined,
    profesion: profesion || undefined
  }

  // Verificar si el usuario actual es admin (para mostrar acciones de administrador)
  const current = await getUserWithRoles(supabaseServer)
  const esAdmin = (current?.roles || []).includes('admin')

  // Obtener catálogos en paralelo
  const [
    { data: ocupaciones },
    { data: profesiones },
    { data: paises },
    { data: estados },
    { data: municipios },
    { data: parroquias }
  ] = await Promise.all([
    supabase.from('ocupaciones').select('id, nombre').order('nombre'),
    supabase.from('profesiones').select('id, nombre').order('nombre'),
    supabase.from('paises').select('id, nombre').order('nombre'),
    supabase.from('estados').select('id, nombre, pais_id').order('nombre'),
    supabase.from('municipios').select('id, nombre, estado_id').order('nombre'),
    supabase.from('parroquias').select('id, nombre, municipio_id').order('nombre'),
  ])

  // Obtener sugerencias de dirección familiar
  const { sugerencias: sugerenciasDireccion } = await obtenerSugerenciasDireccionFamiliar(id)

  // Multi-column sections and the address map need the wide page width.
  return (
    <PaginaSistema
      titulo={`${usuario.nombre} ${usuario.apellido}`}
      regreso={{ href: `/users/${id}`, texto: 'Volver al perfil' }}
    >
      {/* The desktop header carries the name and back link; mobile keeps its own. */}
      <div className="space-y-1 md:hidden">
        <Link
          href={`/users/${id}`}
          className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          Volver al perfil
        </Link>
        <h2 className="text-2xl font-bold text-foreground">{usuario.nombre} {usuario.apellido}</h2>
      </div>
      {esAdmin && (
        <AdminAccionesAsignarContrasena userAuthId={usuario.auth_id} />
      )}
      <UserEditForm
        usuario={usuarioCompleto}
        ocupaciones={ocupaciones || []}
        profesiones={profesiones || []}
        paises={paises || []}
        estados={estados || []}
        municipios={municipios || []}
        parroquias={parroquias || []}
        sugerenciasDireccion={sugerenciasDireccion}
      />
    </PaginaSistema>
  )
}
