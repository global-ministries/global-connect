import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/server"
import { UserEditForm } from "@/components/forms/UserEditForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: Props) {
  console.log('🔍 Params recibidos:', params)
  
  const { id } = await params
  console.log('🔍 ID extraído:', id)
  console.log('🔍 Tipo de ID:', typeof id)

  // Verificar que el ID sea válido
  if (!id || typeof id !== 'string') {
    console.error('❌ ID inválido:', id)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ID de Usuario Inválido</h2>
          <p className="text-gray-600 mb-4">El ID proporcionado no es válido</p>
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

  console.log('🔍 Editando usuario con ID:', id)

  // Obtener datos del usuario básico
  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single()

  console.log('🔍 Resultado de consulta usuario:', { usuario, error: errorUsuario })

  if (errorUsuario || !usuario) {
    console.error('❌ Error al obtener usuario:', errorUsuario)
    console.error('❌ Usuario obtenido:', usuario)
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

  console.log('✅ Usuario obtenido:', usuario)

  // Obtener dirección si existe
  let direccion = null
  if (usuario.direccion_id) {
    const { data: dirData, error: errorDir } = await supabase
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
      .single()
    
    if (!errorDir) {
      direccion = dirData
      console.log('✅ Dirección obtenida con datos geográficos:', direccion)
    } else {
      console.log('⚠️ Error al obtener dirección:', errorDir)
    }
  }

  // Obtener familia si existe
  let familia = null
  if (usuario.familia_id) {
    const { data: famData, error: errorFam } = await supabase
      .from('familias')
      .select('*')
      .eq('id', usuario.familia_id)
      .single()
    
    if (!errorFam) {
      familia = famData
      console.log('✅ Familia obtenida:', familia)
    } else {
      console.log('⚠️ Error al obtener familia:', errorFam)
    }
  } else {
    console.log('ℹ️ Usuario no tiene familia asignada')
  }

  // Obtener ocupación si existe
  let ocupacion = null
  if (usuario.ocupacion_id) {
    const { data: ocData, error: errorOc } = await supabase
      .from('ocupaciones')
      .select('*')
      .eq('id', usuario.ocupacion_id)
      .single()
    
    if (!errorOc) {
      ocupacion = ocData
      console.log('✅ Ocupación obtenida:', ocupacion)
    } else {
      console.log('⚠️ Error al obtener ocupación:', errorOc)
    }
  } else {
    console.log('ℹ️ Usuario no tiene ocupación asignada')
  }

  // Obtener profesión si existe
  let profesion = null
  if (usuario.profesion_id) {
    const { data: profData, error: errorProf } = await supabase
      .from('profesiones')
      .select('*')
      .eq('id', usuario.profesion_id)
      .single()
    
    if (!errorProf) {
      profesion = profData
      console.log('✅ Profesión obtenida:', profesion)
    } else {
      console.log('⚠️ Error al obtener profesión:', errorProf)
    }
  } else {
    console.log('ℹ️ Usuario no tiene profesión asignada')
  }

  // Construir el objeto completo del usuario
  const usuarioCompleto = {
    ...usuario,
    direccion: direccion || undefined,
    familia: familia || undefined,
    ocupacion: ocupacion || undefined,
    profesion: profesion || undefined
  }

  console.log('✅ Usuario completo construido:', usuarioCompleto)

  // Obtener ocupaciones disponibles
  const { data: ocupaciones, error: errorOcupaciones } = await supabase
    .from('ocupaciones')
    .select('id, nombre')
    .order('nombre')

  if (errorOcupaciones) {
    console.error('❌ Error al obtener ocupaciones:', errorOcupaciones)
  } else {
    console.log('✅ Ocupaciones disponibles:', ocupaciones)
  }

  // Obtener profesiones disponibles
  const { data: profesiones, error: errorProfesiones } = await supabase
    .from('profesiones')
    .select('id, nombre')
    .order('nombre')

  if (errorProfesiones) {
    console.error('❌ Error al obtener profesiones:', errorProfesiones)
  } else {
    console.log('✅ Profesiones disponibles:', profesiones)
  }

  // Obtener países disponibles
  const { data: paises, error: errorPaises } = await supabase
    .from('paises')
    .select('id, nombre')
    .order('nombre')

  if (errorPaises) {
    console.error('❌ Error al obtener países:', errorPaises)
  } else {
    console.log('✅ Países disponibles:', paises)
  }

  // Obtener estados disponibles (por defecto Venezuela)
  const { data: estados, error: errorEstados } = await supabase
    .from('estados')
    .select('id, nombre, pais_id')
    .order('nombre')

  if (errorEstados) {
    console.error('❌ Error al obtener estados:', errorEstados)
  } else {
    console.log('✅ Estados disponibles:', estados)
  }

  // Obtener municipios disponibles
  const { data: municipios, error: errorMunicipios } = await supabase
    .from('municipios')
    .select('id, nombre, estado_id')
    .order('nombre')

  if (errorMunicipios) {
    console.error('❌ Error al obtener municipios:', errorMunicipios)
  } else {
    console.log('✅ Municipios disponibles:', municipios)
  }

  // Obtener parroquias disponibles
  const { data: parroquias, error: errorParroquias } = await supabase
    .from('parroquias')
    .select('id, nombre, municipio_id')
    .order('nombre')

  if (errorParroquias) {
    console.error('❌ Error al obtener parroquias:', errorParroquias)
  } else {
    console.log('✅ Parroquias disponibles:', parroquias)
  }

  return (
    <div className="space-y-6">
      {/* Botón de Regreso */}
      <div>
        <Link 
          href={`/dashboard/users/${id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-white/70 rounded-xl transition-all duration-200 text-gray-700 hover:bg-orange-50/50"
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
