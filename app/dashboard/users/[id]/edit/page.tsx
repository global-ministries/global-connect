import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { UserEditForm } from "@/components/forms/UserEditForm"

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Usuario no encontrado</h2>
          <p className="text-gray-600 mb-4">
            No se pudo cargar la información del usuario con ID: {id}
          </p>
          <p className="text-gray-500 text-sm mb-4">
            Error: {errorUsuario?.message || 'Usuario no encontrado en la base de datos'}
          </p>
          <Link
            href="/dashboard/users"
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Volver a Usuarios
          </Link>
        </div>
      </div>
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

  // Obtener ocupaciones disponibles
  const { data: ocupaciones } = await supabase
    .from('ocupaciones')
    .select('id, nombre')
    .order('nombre')

  // Obtener profesiones disponibles
  const { data: profesiones } = await supabase
    .from('profesiones')
    .select('id, nombre')
    .order('nombre')

  // Obtener países disponibles
  const { data: paises } = await supabase
    .from('paises')
    .select('id, nombre')
    .order('nombre')

  // Obtener estados disponibles (por defecto Venezuela)
  const { data: estados } = await supabase
    .from('estados')
    .select('id, nombre, pais_id')
    .order('nombre')

  // Obtener municipios disponibles
  const { data: municipios } = await supabase
    .from('municipios')
    .select('id, nombre, estado_id')
    .order('nombre')

  // Obtener parroquias disponibles
  const { data: parroquias } = await supabase
    .from('parroquias')
    .select('id, nombre, municipio_id')
    .order('nombre')

  return (
    <div className="space-y-6">
      {/* Botón de Regreso */}
      <div>
        <Link 
          href={`/dashboard/users/${id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Usuario
        </Link>
      </div>

      {/* Título de la Página */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 lg:p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-gray-800">
          Editar Usuario
        </h1>
        <p className="text-gray-600 mt-2">
          Modifica la información de {usuario.nombre} {usuario.apellido}
        </p>
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
  )
}
