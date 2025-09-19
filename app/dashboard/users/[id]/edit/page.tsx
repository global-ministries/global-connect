import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { UserEditForm } from "@/components/forms/UserEditForm"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: Props) {
  const { id } = await params

  // Crear cliente Supabase correctamente
  const supabase = createSupabaseServerClient()

  // Obtener datos del usuario básico
  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .maybeSingle() // Permite cero o un resultado, evita error si no existe

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
              <TituloSistema nivel={2}>Usuario no encontrado</TituloSistema>
              <p className="text-gray-600 mb-4">
                No se pudo cargar la información del usuario con ID: {id}
              </p>
              <p className="text-gray-500 text-sm mb-4">
                Error: {errorUsuario?.message || 'Usuario no encontrado en la base de datos'}
              </p>
              <Link href="/dashboard/users">
                <BotonSistema variante="primario">
                  Volver a Usuarios
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
        titulo=""
        descripcion=""
        accionPrincipal={null}
      >
        <div className="space-y-6">
          {/* Header minimalista con botón de regreso */}
          <div className="flex items-center gap-4">
            <Link href={`/dashboard/users/${id}`}>
              <BotonSistema 
                variante="ghost" 
                tamaño="sm"
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </BotonSistema>
            </Link>
            <TituloSistema nivel={2}>Editar {usuario.nombre}</TituloSistema>
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
          />
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
