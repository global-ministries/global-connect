import { ArrowLeft, User } from "lucide-react"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { UserEditForm } from "@/components/forms/UserEditForm"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'

export default async function PerfilPage() {
  // Crear cliente Supabase correctamente
  const supabase = createSupabaseServerClient()

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

  // Obtener datos del usuario desde la tabla usuarios usando el email
  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', user.email)
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

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Mi Perfil"
        subtitulo="Gestiona tu información personal"
        botonRegreso={{
          href: "/dashboard",
          texto: "Volver al Dashboard"
        }}
      >
        <div className="space-y-6">
          {/* Header con información del usuario */}
          <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-orange-50 to-orange-100 rounded-2xl border border-orange-200">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <TituloSistema nivel={2} className="text-gray-900">
                {usuario.nombre} {usuario.apellido}
              </TituloSistema>
              <p className="text-gray-600">{usuario.email}</p>
              {usuario.telefono && (
                <p className="text-gray-500 text-sm">{usuario.telefono}</p>
              )}
            </div>
          </div>

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
