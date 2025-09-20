import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { UserEditForm } from "@/components/forms/UserEditForm"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'

export default async function PerfilPage() {
  // Crear cliente Supabase correctamente
  const supabase = await createSupabaseServerClient()

  // Obtener usuario actual autenticado
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo=""
          descripcion=""
          accionPrincipal={null}
        >
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Error de autenticación</TituloSistema>
              <p className="text-gray-600 mb-4">
                No se pudo verificar tu sesión
              </p>
              <Link href="/auth/login">
                <BotonSistema variante="primario">
                  Iniciar Sesión
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Usar admin client para bypass RLS y obtener datos del usuario
  const adminSupabase = createSupabaseAdminClient()
  
  // Buscar usuario por auth_id usando admin client (bypass RLS)
  const { data: usuario, error: errorUsuario } = await adminSupabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (errorUsuario || !usuario) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo=""
          descripcion=""
          accionPrincipal={null}
        >
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Perfil no encontrado</TituloSistema>
              <p className="text-gray-600 mb-4">
                No se pudo cargar tu información de perfil
              </p>
              <p className="text-gray-500 text-sm mb-4">
                Error: {errorUsuario?.message || 'Usuario no encontrado en la base de datos'}
              </p>
              <p className="text-gray-400 text-xs mb-4">
                Debug: Auth ID: {user.id} | Email: {user.email}
              </p>
              <Link href="/dashboard">
                <BotonSistema variante="primario">
                  Volver al Dashboard
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Obtener dirección si existe usando admin client
  let direccion = null
  if (usuario.direccion_id) {
    const { data: dirData } = await adminSupabase
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

  // Obtener familia si existe usando admin client
  let familia = null
  if (usuario.familia_id) {
    const { data: famData } = await adminSupabase
      .from('familias')
      .select('*')
      .eq('id', usuario.familia_id)
      .maybeSingle()
    if (famData) {
      familia = famData
    }
  }

  // Obtener ocupación si existe usando admin client
  let ocupacion = null
  if (usuario.ocupacion_id) {
    const { data: ocData } = await adminSupabase
      .from('ocupaciones')
      .select('*')
      .eq('id', usuario.ocupacion_id)
      .maybeSingle()
    if (ocData) {
      ocupacion = ocData
    }
  }

  // Obtener profesión si existe usando admin client
  let profesion = null
  if (usuario.profesion_id) {
    const { data: profData } = await adminSupabase
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

  // Obtener catálogos en paralelo usando admin client
  const [
    { data: ocupaciones },
    { data: profesiones },
    { data: paises },
    { data: estados },
    { data: municipios },
    { data: parroquias }
  ] = await Promise.all([
    adminSupabase.from('ocupaciones').select('id, nombre').order('nombre'),
    adminSupabase.from('profesiones').select('id, nombre').order('nombre'),
    adminSupabase.from('paises').select('id, nombre').order('nombre'),
    adminSupabase.from('estados').select('id, nombre, pais_id').order('nombre'),
    adminSupabase.from('municipios').select('id, nombre, estado_id').order('nombre'),
    adminSupabase.from('parroquias').select('id, nombre, municipio_id').order('nombre'),
  ])

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`${usuario.nombre} ${usuario.apellido}`}
        subtitulo="Gestiona tu información personal"
        accionPrincipal={
          <Link href="/dashboard">
            <BotonSistema 
              variante="ghost" 
              tamaño="sm"
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </BotonSistema>
          </Link>
        }
      >
        <div className="space-y-6">
          {/* Formulario de Edición */}
          <UserEditForm 
            usuario={usuarioCompleto}
            ocupaciones={ocupaciones || []}
            profesiones={profesiones || []}
            paises={paises || []}
            estados={estados || []}
            municipios={municipios || []}
            parroquias={parroquias || []}
            esPerfil={true}
          />
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
